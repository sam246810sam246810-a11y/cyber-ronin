import Phaser from 'phaser';
import { ARENA, DEPTH, FONT, GAME_W, RARITY } from '../config';
import { ELEMENT_IDS, hexToInt } from '../data';
import type { GameScene } from '../scenes/GameScene';
import type { EventOption } from '../scenes/EventScene';
import type { Material, RarityIndex } from '../types';
import { pick } from '../utils';
import { Sound } from './SoundSystem';

export type EventKind = 'chest' | 'fountain' | 'merchant';

const EVENT_INFO: Record<EventKind, { name: string; color: number; texture: string }> = {
  chest: { name: '寶箱', color: 0xffd166, texture: 'chest' },
  fountain: { name: '祈願泉', color: 0x7ed4ff, texture: 'fountain' },
  merchant: { name: '流浪商人', color: 0xc9a3ff, texture: 'merchant' },
};

/**
 * 關卡內事件：每區第 2、4 波後隨機出現寶箱 / 祈願泉 / 流浪商人。
 * 走過去碰到就觸發；放著不管約 35 秒後消失。
 */
export class EventSystem {
  private active?: {
    kind: EventKind;
    x: number;
    y: number;
    t: number;
    objs: Phaser.GameObjects.GameObject[];
    sprite: Phaser.GameObjects.Image;
    label: Phaser.GameObjects.Text;
  };
  /** 下一瓶藥水品質加成（祈願泉祝福） */
  qualityBonus = 0;

  constructor(private game: GameScene) {}

  maybeSpawn(waveInRegion: number): void {
    if (waveInRegion !== 2 && waveInRegion !== 4) return;
    this.spawn(pick(['chest', 'fountain', 'merchant'] as EventKind[]));
  }

  spawn(kind: EventKind): void {
    this.clear();
    const info = EVENT_INFO[kind];
    const x = GAME_W / 2;
    const y = ARENA.y + 180;
    const glow = this.game.add.image(x, y, 'circle').setTint(info.color).setAlpha(0.25).setDisplaySize(110, 110).setDepth(DEPTH.pickup);
    const sprite = this.game.add.image(x, y, info.texture).setDisplaySize(64, 64).setDepth(DEPTH.pickup + 1);
    const label = this.game.add.text(x, y - 56, info.name, {
      fontFamily: FONT, fontSize: '22px', color: '#ffffff', fontStyle: 'bold', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH.pickup + 2);
    this.game.tweens.add({ targets: glow, scale: glow.scale * 1.25, alpha: 0.1, duration: 700, yoyo: true, repeat: -1 });
    this.active = { kind, x, y, t: 0, objs: [glow, sprite, label], sprite, label };
    this.game.showBanner(`${info.name}出現了！`);
    this.game.tutorial.notify('event');
  }

  update(dt: number): void {
    const a = this.active;
    if (!a) return;
    a.t += dt;
    a.sprite.setY(a.y + Math.sin(a.t * 3) * 4);
    if (a.t > 30) a.objs.forEach((o) => (o as unknown as { setAlpha(v: number): void }).setAlpha(Math.floor(a.t * 6) % 2 ? 0.3 : 1));
    if (a.t > 35) {
      this.clear();
      return;
    }
    const p = this.game.player;
    if ((p.x - a.x) ** 2 + (p.y - a.y) ** 2 < (p.radius + 40) ** 2) {
      const kind = a.kind;
      const { x, y } = a;
      this.clear();
      this.trigger(kind, x, y);
    }
  }

  private trigger(kind: EventKind, x: number, y: number): void {
    const g = this.game;
    if (kind === 'chest') {
      Sound.play('fission');
      g.fx.burst(x, y, 120, 0xffd166, 500);
      for (let i = 0; i < 3; i++) {
        const a = (Math.PI * 2 * i) / 3 - Math.PI / 2;
        g.dropMaterial(x + Math.cos(a) * 60, y + Math.sin(a) * 60 + 30, undefined, true);
      }
      return;
    }
    const value = this.crucibleValue();
    if (kind === 'fountain') {
      const mats = g.crucible.slots.filter(Boolean) as Material[];
      this.open('祈願泉', '清澈的泉水閃著光。許一個願望吧。', '#7ed4ff', [
        {
          label: '泉水療癒', desc: '回復 3 點血', enabled: true,
          onPick: () => g.heal(3),
        },
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
      ]);
    } else {
      this.open('流浪商人', `「用坩堝裡的素材來換吧。」\n目前素材價值：${value}（普通 1・稀有 2・史詩 3・傳說 4）`, '#c9a3ff', [
        {
          label: '療傷藥', desc: '價值 2：回復 2 點血', enabled: value >= 2,
          onPick: () => {
            this.pay();
            g.heal(2);
          },
        },
        {
          label: '史詩素材', desc: '價值 3：換 2 個隨機史詩素材', enabled: value >= 3,
          onPick: () => {
            this.pay();
            for (let i = 0; i < 2; i++) g.dropMaterial(g.player.x + (i ? 50 : -50), g.player.y - 60, { el: pick(ELEMENT_IDS), r: 2 });
          },
        },
        {
          label: '珍稀突變', desc: '價值 5：抽一次突變卡（保底史詩）', enabled: value >= 5,
          onPick: () => {
            this.pay();
            g.time.delayedCall(100, () => g.openCardSelect(undefined, 2));
          },
        },
      ]);
    }
  }

  private crucibleValue(): number {
    return (this.game.crucible.slots.filter(Boolean) as Material[]).reduce((s, m) => s + m.r + 1, 0);
  }

  private pay(): void {
    this.game.crucible.slots = [null, null, null];
    this.game.crucible.emit('changed');
  }

  private open(title: string, subtitle: string, color: string, options: EventOption[]): void {
    this.game.scene.launch('Event', {
      title, subtitle, color, options,
      onClose: () => this.game.scene.resume(),
    });
    this.game.scene.pause();
  }

  clear(): void {
    this.active?.objs.forEach((o) => o.destroy());
    this.active = undefined;
  }

  /** 取得品質加成並重置 */
  takeQualityBonus(): number {
    const b = this.qualityBonus;
    this.qualityBonus = 0;
    return b;
  }
}

export const rarityHex = (r: RarityIndex) => hexToInt(RARITY[r].color);
