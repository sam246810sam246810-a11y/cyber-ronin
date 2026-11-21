import Phaser from 'phaser';
import { ARENA, DEPTH, FONT, GAME_W } from '../config';
import { ELEMENT_IDS, FUN, RELIC_MAP, WEAPON_MAP, hexToInt } from '../data';
import type { GameScene } from '../scenes/GameScene';
import type { EventOption } from '../scenes/EventScene';
import type { Material, NpcKind, RarityIndex } from '../types';
import { pick } from '../utils';
import { isRift, type Room } from './DungeonSystem';
import { Sound } from './SoundSystem';

export type EventKind = 'chest' | 'fountain' | 'merchant' | 'shop' | 'altar' | 'stairs' | 'npc' | 'portal'
  | 'statue' | 'cauldron' | 'shelf' | 'bookshelf' | 'start';

const INFO: Record<EventKind, { name: string; color: number; texture: string }> = {
  chest: { name: '寶箱', color: 0xffd166, texture: 'chest' },
  fountain: { name: '祈願泉', color: 0x7ed4ff, texture: 'fountain' },
  merchant: { name: '以物易物商人', color: 0xc9a3ff, texture: 'merchant' },
  shop: { name: '商店', color: 0x7eff8a, texture: 'merchant' },
  altar: { name: '精英祭壇', color: 0xb36bff, texture: 'altar' },
  stairs: { name: '樓梯', color: 0xffd166, texture: 'stairs' },
  npc: { name: 'NPC', color: 0xffffff, texture: 'hero' },
  portal: { name: '時空門', color: 0x7ed4ff, texture: 'ring' },
  statue: { name: '', color: 0xffd166, texture: 'cat_apprentice' },
  cauldron: { name: '大坩堝・永久升級', color: 0xc9a3ff, texture: 'big_cauldron' },
  shelf: { name: '聖物展示架', color: 0xffd166, texture: 'shelf' },
  bookshelf: { name: '配方圖鑑', color: 0x7ed4ff, texture: 'bookshelf' },
  start: { name: '出發冒險！', color: 0x7eff8a, texture: 'ring' },
};

const SIZES: Partial<Record<EventKind, [number, number]>> = {
  stairs: [96, 96], portal: [96, 96], start: [120, 120], cauldron: [230, 154], shelf: [110, 110], bookshelf: [110, 110], statue: [80, 80],
};

interface RoomObject {
  kind: EventKind;
  x: number;
  y: number;
  t: number;
  /** 玩家離開範圍後才能再次觸發 */
  armed: boolean;
  objs: Phaser.GameObjects.GameObject[];
  sprite: Phaser.GameObjects.Image;
  npc?: NpcKind;
  /** 大廳雕像對應的角色 id */
  extra?: string;
}

/**
 * 房間裡可互動的物件：寶箱 / 祈願泉 / 以物易物商人 / 商店 / 精英祭壇 / 樓梯。
 * 走過去碰到就觸發；每次換房依房間類型重建。
 */
export class EventSystem {
  private list: RoomObject[] = [];
  /** 正在觸發的物件（對話結束後移除用） */
  private activeObj?: RoomObject;
  qualityBonus = 0;

  constructor(private game: GameScene) {}

  /** 進入房間時依房型建立物件 */
  setupRoom(room: Room): void {
    this.clear();
    const cx = GAME_W / 2;
    const cy = ARENA.y + ARENA.h / 2;
    if (room.type === 'treasure' && !room.used) this.spawn('chest', cx, cy);
    if (room.type === 'event' && !room.used && room.eventKind) this.spawn(room.eventKind, cx, cy);
    if (room.type === 'shop') this.spawn('shop', cx, cy - 60);
    if (room.type === 'elite' && !room.cleared) this.spawn('altar', cx, cy);
    if (room.type === 'exit') this.spawn('stairs', cx, cy);
    if (room.type === 'boss' && room.cleared) this.spawn('stairs', cx, cy);
    if (isRift(room) && room.cleared) this.spawn('portal', cx, cy);
    if (room.npc && !room.npcDone && room.cleared) this.spawn('npc', cx + 200, cy, room.npc);
  }

  spawn(kind: EventKind, x = GAME_W / 2, y = ARENA.y + ARENA.h / 2, npc?: NpcKind, extra?: string, label?: string): void {
    const base = { ...INFO[kind], ...(kind === 'statue' && extra ? { texture: `cat_${extra}` } : {}), ...(label ? { name: label } : {}) };
    const nd = npc ? FUN.npcs[npc] : undefined;
    const info = nd
      ? {
        name: nd.name,
        color: hexToInt(nd.color),
        texture: { future_self: `cat_${this.game.character.id}`, lost_alchemist: 'cat_gray', time_merchant: 'cat_merchant', chatty_mushroom: 'mushroom' }[npc!],
      }
      : base;
    const glow = this.game.add.image(x, y, 'circle').setTint(info.color).setAlpha(0.25).setDisplaySize(120, 120).setDepth(DEPTH.pickup);
    const [sw, sh] = SIZES[kind] ?? [68, 68];
    const sprite = this.game.add.image(x, y, info.texture).setDisplaySize(sw, sh).setDepth(DEPTH.pickup + 1);
    if (kind === 'portal' || kind === 'start' || npc === 'chatty_mushroom') sprite.setTint(info.color);
    if (kind === 'portal' || kind === 'start') {
      this.game.tweens.add({ targets: sprite, angle: 360, duration: 2000, repeat: -1 });
    }
    const labelObj = this.game.add.text(x, y - sh / 2 - 22, info.name, {
      fontFamily: FONT, fontSize: '22px', color: '#ffffff', fontStyle: 'bold', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH.pickup + 2);
    this.game.tweens.add({ targets: glow, scale: glow.scale * 1.25, alpha: 0.1, duration: 700, yoyo: true, repeat: -1 });
    const p = this.game.player;
    const near = (p.x - x) ** 2 + (p.y - y) ** 2 < 70 ** 2;
    const o: RoomObject = { kind, x, y, t: 0, armed: !near, objs: [glow, sprite, labelObj], sprite, npc, extra };
    this.list.push(o);
    if (kind === 'cauldron') {
      glow.setDisplaySize(300, 200);
      // 冒泡
      this.game.time.addEvent({
        delay: 380, loop: true, callback: () => {
          if (!sprite.active) return;
          const b = this.game.add.image(x - 80 + Math.random() * 160, y - 30, 'circle').setTint(0x9bff8a).setAlpha(0.8)
            .setDisplaySize(10, 10).setDepth(DEPTH.pickup + 2);
          this.game.tweens.add({ targets: b, y: y - 90 - Math.random() * 40, alpha: 0, duration: 900, onComplete: () => b.destroy() });
        },
      });
    }
    if (nd) {
      const bubble = this.game.add.text(x, y - 92, '💬', { fontSize: '26px' }).setOrigin(0.5).setDepth(DEPTH.pickup + 2);
      this.game.tweens.add({ targets: bubble, y: y - 100, duration: 600, yoyo: true, repeat: -1 });
      o.objs.push(bubble);
    }
  }

  update(dt: number): void {
    const p = this.game.player;
    for (const o of [...this.list]) {
      o.t += dt;
      if (o.kind === 'portal' || o.kind === 'start') { /* 旋轉由 tween 處理 */ }
      else if (o.kind === 'stairs') o.sprite.setRotation(Math.sin(o.t) * 0.05);
      else if (o.kind !== 'cauldron' && o.kind !== 'shelf' && o.kind !== 'bookshelf') o.sprite.setY(o.y + Math.sin(o.t * 3) * 4);
      const reach = o.kind === 'cauldron' ? 90 : o.kind === 'shelf' || o.kind === 'bookshelf' ? 60 : 38;
      const inside = (p.x - o.x) ** 2 + (p.y - o.y) ** 2 < (p.radius + reach) ** 2;
      if (!inside) {
        o.armed = true;
        continue;
      }
      if (!o.armed || this.game.dungeon.combatActive) continue;
      o.armed = false;
      this.activeObj = o;
      this.trigger(o.kind, o.x, o.y, o.npc, o.extra);
    }
  }

  /** 移除正在觸發的物件 */
  private removeActive(): void {
    const o = this.activeObj;
    if (!o) return;
    o.objs.forEach((x) => x.destroy());
    this.list = this.list.filter((x) => x !== o);
    this.activeObj = undefined;
  }

  private trigger(kind: EventKind, x: number, y: number, npc?: NpcKind, extra?: string): void {
    const g = this.game;
    const room = g.dungeon.current;
    switch (kind) {
      case 'chest': {
        Sound.play('fission');
        g.fx.burst(x, y, 140, 0xffd166, 500);
        room.used = true;
        this.removeActive();
        const n = 3 + (Math.random() < 0.4 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const a = (Math.PI * 2 * i) / n - Math.PI / 2;
          g.dropMaterial(x + Math.cos(a) * 70, y + Math.sin(a) * 70 + 20, undefined, true);
        }
        g.dropCoins(x, y, 8 + g.dungeon.regionIndex * 4);
        if (Math.random() < 0.5) g.dropWeapon(x, y + 90);
        if (Math.random() < 0.4) g.dropRelic(x + 110, y);
        break;
      }
      case 'altar':
        room.used = true;
        this.removeActive();
        g.dungeon.startEliteChallenge();
        break;
      case 'stairs':
        g.onStairs();
        break;
      case 'portal':
        this.removeActive();
        g.dungeon.leaveRift();
        break;
      case 'npc':
        if (npc) this.openNpc(room, npc);
        break;
      case 'statue':
        if (extra) g.lobbySelect(extra);
        break;
      case 'cauldron':
        g.openOverlay('Meta');
        break;
      case 'shelf':
        g.openOverlay('RelicShelf');
        break;
      case 'bookshelf':
        g.openOverlay('Codex', { returnTo: 'Game' });
        break;
      case 'start':
        g.startRunFromLobby();
        break;
      case 'fountain':
        this.openFountain(room);
        break;
      case 'merchant':
        this.openMerchant(room);
        break;
      case 'shop':
        this.openShop(room);
        break;
    }
  }

  private openNpc(room: Room, npc: NpcKind): void {
    const g = this.game;
    const d = FUN.npcs[npc];
    const line = pick(d.lines);
    const done = () => {
      room.npcDone = true;
      this.removeActive();
    };
    let options: EventOption[];
    switch (npc) {
      case 'future_self':
        options = [{
          label: '收下', desc: '獲得 1 個傳說素材', enabled: true,
          onPick: () => {
            g.dropMaterial(g.player.x, g.player.y - 90, { el: pick(ELEMENT_IDS), r: 3 });
            done();
          },
        }];
        break;
      case 'lost_alchemist':
        options = [{
          label: '接受委託', desc: '清空接下來 2 間戰鬥房，完成後得到一把稀有以上的武器', enabled: !g.quest,
          onPick: () => {
            g.quest = { left: 2 };
            g.fx.floatText(g.player.x, g.player.y - 60, '委託：清空 2 間戰鬥房', '#c9a3ff');
            done();
          },
        }];
        break;
      case 'time_merchant':
        options = [{
          label: '成交　🪙15', desc: '下一次穿過的門必定通往時空裂縫', enabled: g.coins >= 15,
          onPick: () => {
            g.coins -= 15;
            g.dungeon.forceRift = true;
            g.fx.floatText(g.player.x, g.player.y - 60, '時空開始扭曲……', '#7ed4ff');
            done();
          },
        }];
        break;
      case 'chatty_mushroom':
        options = [{
          label: '謝謝蘑菇', desc: '蘑菇塞給你 5 枚金幣', enabled: true,
          onPick: () => {
            g.dropCoins(g.player.x, g.player.y - 60, 5);
            done();
          },
        }];
        break;
    }
    this.game.scene.launch('Event', {
      title: d.name, subtitle: `「${line}」`, color: d.color, options,
      onClose: () => this.game.scene.resume(),
    });
    this.game.scene.pause();
  }

  private openFountain(room: Room): void {
    const g = this.game;
    const mats = g.crucible.slots.filter(Boolean) as Material[];
    this.open('祈願泉', '清澈的泉水閃著光。許一個願望吧（只能許一次）。', '#7ed4ff', [
      { label: '泉水療癒', desc: '回復 3 點血', enabled: true, onPick: () => g.heal(3) },
      {
        label: '藥水祝福', desc: '下一瓶藥水的品質提升 1 級', enabled: true,
        onPick: () => {
          this.qualityBonus = 1;
          g.fx.floatText(g.player.x, g.player.y - 60, '下一瓶品質 +1', '#7ed4ff');
        },
      },
      {
        label: '素材洗禮', desc: mats.length ? `坩堝內 ${mats.length} 個素材全部升一級稀有度` : '坩堝是空的（需要至少 1 個素材）',
        enabled: mats.length > 0,
        onPick: () => {
          g.crucible.slots = g.crucible.slots.map((m) => (m ? { el: m.el, r: Math.min(3, m.r + 1) as RarityIndex } : null));
          g.crucible.emit('changed');
          Sound.play('pickup', 3);
        },
      },
    ], () => {
      room.used = true;
      this.removeActive();
    });
  }

  private openMerchant(room: Room): void {
    const g = this.game;
    const value = (g.crucible.slots.filter(Boolean) as Material[]).reduce((s, m) => s + m.r + 1, 0);
    const pay = () => {
      g.crucible.slots = [null, null, null];
      g.crucible.emit('changed');
    };
    this.open('以物易物商人', `「用坩堝裡的素材來換吧。」\n目前素材價值：${value}（普通 1・稀有 2・史詩 3・傳說 4）`, '#c9a3ff', [
      { label: '療傷藥', desc: '價值 2：回復 2 點血', enabled: value >= 2, onPick: () => { pay(); g.heal(2); } },
      {
        label: '史詩素材', desc: '價值 3：換 2 個隨機史詩素材', enabled: value >= 3,
        onPick: () => {
          pay();
          for (let i = 0; i < 2; i++) g.dropMaterial(g.player.x + (i ? 60 : -60), g.player.y - 80, { el: pick(ELEMENT_IDS), r: 2 });
        },
      },
      {
        label: '珍稀突變', desc: '價值 5：抽一次突變卡（保底史詩）', enabled: value >= 5,
        onPick: () => { pay(); g.time.delayedCall(100, () => g.openCardSelect(undefined, 2)); },
      },
    ], () => {
      room.used = true;
      this.removeActive();
    });
  }

  private openShop(room: Room): void {
    const g = this.game;
    const items = room.shop ?? [];
    this.open('商店', `「歡迎光臨！」　持有金幣：${g.coins}`, '#7eff8a', items.map((it) => ({
      label: it.sold ? `${it.label}（已售出）` : `${it.label}　🪙${it.price}`,
      desc: it.desc,
      enabled: !it.sold && g.coins >= it.price,
      onPick: () => {
        g.coins -= it.price;
        it.sold = true;
        Sound.play('pickup', 2);
        switch (it.id) {
          case 'heal': g.heal(2); break;
          case 'epic': g.dropMaterial(g.player.x, g.player.y - 90, { el: pick(ELEMENT_IDS), r: 2 }); break;
          case 'legendary': g.dropMaterial(g.player.x, g.player.y - 90, { el: pick(ELEMENT_IDS), r: 3 }); break;
          case 'card_rare': g.time.delayedCall(100, () => g.openCardSelect(undefined, 1)); break;
          case 'card_epic': g.time.delayedCall(100, () => g.openCardSelect(undefined, 2)); break;
          case 'weapon': if (it.weaponId) g.dropWeapon(g.player.x, g.player.y - 100, WEAPON_MAP[it.weaponId]); break;
          case 'relic': if (it.relicId) g.dropRelic(g.player.x + 80, g.player.y - 100, RELIC_MAP[it.relicId]); break;
        }
      },
    })));
  }

  private open(title: string, subtitle: string, color: string, options: EventOption[], onUsed?: () => void): void {
    const wrapped = options.map((o) => ({
      ...o,
      onPick: () => {
        o.onPick();
        onUsed?.();
      },
    }));
    this.game.scene.launch('Event', { title, subtitle, color, options: wrapped, onClose: () => this.game.scene.resume() });
    this.game.scene.pause();
  }

  clear(): void {
    this.list.forEach((o) => o.objs.forEach((x) => x.destroy()));
    this.list = [];
    this.activeObj = undefined;
  }

  takeQualityBonus(): number {
    const b = this.qualityBonus;
    this.qualityBonus = 0;
    return b;
  }
}
