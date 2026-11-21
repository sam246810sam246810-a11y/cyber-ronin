import Phaser from 'phaser';
import { ARENA, DEPTH, FONT, GAME_W } from '../config';
import { ELEMENT_IDS, WEAPON_MAP } from '../data';
import type { GameScene } from '../scenes/GameScene';
import type { EventOption } from '../scenes/EventScene';
import type { Material, RarityIndex } from '../types';
import { pick } from '../utils';
import type { Room } from './DungeonSystem';
import { Sound } from './SoundSystem';

export type EventKind = 'chest' | 'fountain' | 'merchant' | 'shop' | 'altar' | 'stairs';

const INFO: Record<EventKind, { name: string; color: number; texture: string }> = {
  chest: { name: '寶箱', color: 0xffd166, texture: 'chest' },
  fountain: { name: '祈願泉', color: 0x7ed4ff, texture: 'fountain' },
  merchant: { name: '以物易物商人', color: 0xc9a3ff, texture: 'merchant' },
  shop: { name: '商店', color: 0x7eff8a, texture: 'merchant' },
  altar: { name: '精英祭壇', color: 0xb36bff, texture: 'altar' },
  stairs: { name: '樓梯', color: 0xffd166, texture: 'stairs' },
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
}

/**
 * 房間裡可互動的物件：寶箱 / 祈願泉 / 以物易物商人 / 商店 / 精英祭壇 / 樓梯。
 * 走過去碰到就觸發；每次換房依房間類型重建。
 */
export class EventSystem {
  private obj?: RoomObject;
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
  }

  spawn(kind: EventKind, x = GAME_W / 2, y = ARENA.y + ARENA.h / 2): void {
    this.clear();
    const info = INFO[kind];
    const glow = this.game.add.image(x, y, 'circle').setTint(info.color).setAlpha(0.25).setDisplaySize(120, 120).setDepth(DEPTH.pickup);
    const sprite = this.game.add.image(x, y, info.texture).setDisplaySize(kind === 'stairs' ? 90 : 68, kind === 'stairs' ? 90 : 68)
      .setDepth(DEPTH.pickup + 1);
    const label = this.game.add.text(x, y - 62, info.name, {
      fontFamily: FONT, fontSize: '22px', color: '#ffffff', fontStyle: 'bold', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH.pickup + 2);
    this.game.tweens.add({ targets: glow, scale: glow.scale * 1.25, alpha: 0.1, duration: 700, yoyo: true, repeat: -1 });
    const p = this.game.player;
    const near = (p.x - x) ** 2 + (p.y - y) ** 2 < 70 ** 2;
    this.obj = { kind, x, y, t: 0, armed: !near, objs: [glow, sprite, label], sprite };
  }

  update(dt: number): void {
    const o = this.obj;
    if (!o) return;
    o.t += dt;
    if (o.kind !== 'stairs') o.sprite.setY(o.y + Math.sin(o.t * 3) * 4);
    else o.sprite.setRotation(Math.sin(o.t) * 0.05);
    const p = this.game.player;
    const inside = (p.x - o.x) ** 2 + (p.y - o.y) ** 2 < (p.radius + 38) ** 2;
    if (!inside) {
      o.armed = true;
      return;
    }
    if (!o.armed || this.game.dungeon.combatActive) return;
    o.armed = false;
    this.trigger(o.kind, o.x, o.y);
  }

  private trigger(kind: EventKind, x: number, y: number): void {
    const g = this.game;
    const room = g.dungeon.current;
    switch (kind) {
      case 'chest': {
        Sound.play('fission');
        g.fx.burst(x, y, 140, 0xffd166, 500);
        room.used = true;
        this.clear();
        const n = 3 + (Math.random() < 0.4 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const a = (Math.PI * 2 * i) / n - Math.PI / 2;
          g.dropMaterial(x + Math.cos(a) * 70, y + Math.sin(a) * 70 + 20, undefined, true);
        }
        g.dropCoins(x, y, 8 + g.dungeon.regionIndex * 4);
        if (Math.random() < 0.5) g.dropWeapon(x, y + 90);
        break;
      }
      case 'altar':
        room.used = true;
        this.clear();
        g.dungeon.startEliteChallenge();
        break;
      case 'stairs':
        g.onStairs();
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
      this.clear();
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
      this.clear();
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
    this.obj?.objs.forEach((o) => o.destroy());
    this.obj = undefined;
  }

  takeQualityBonus(): number {
    const b = this.qualityBonus;
    this.qualityBonus = 0;
    return b;
  }
}
