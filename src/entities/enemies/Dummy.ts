import Phaser from 'phaser';
import { Enemy, type DamageOptions } from '../Enemy';
import { DEPTH, FONT } from '../../config';
import type { EnemyDef } from '../../types';
import type { GameScene } from '../../scenes/GameScene';

export const DUMMY_DEF = {
  type: 'crawler', name: '訓練木樁', hp: 1e9, speed: 0, radius: 30, color: '#ffffff', contactDamage: 0,
} as unknown as EnemyDef;

/** 大廳的訓練木樁：打不死、不會動，頭上顯示最近 3 秒的 DPS */
export class Dummy extends Enemy {
  private hits: { t: number; dmg: number }[] = [];
  private label: Phaser.GameObjects.Text;

  constructor(game: GameScene, x: number, y: number) {
    super(game, DUMMY_DEF, x, y, false, 'dummy');
    this.knockbackResist = 0;
    this.label = game.add.text(x, y - 62, '訓練木樁', {
      fontFamily: FONT, fontSize: '17px', color: '#ffd166', fontStyle: 'bold', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH.enemy + 3);
  }

  /** 以遊戲時間計算（掉幀時也準） */
  private clock = 0;

  protected act(dt: number): void {
    this.clock += dt;
    const now = this.clock * 1000;
    this.hits = this.hits.filter((h) => now - h.t < 3000);
    const dps = this.hits.reduce((s, h) => s + h.dmg, 0) / Math.max(1, Math.min(3, this.clock));
    this.label.setText(dps > 0 ? `DPS ${dps < 100 ? dps.toFixed(1) : Math.round(dps)}` : '訓練木樁');
    this.frozenTimer = 0;
  }

  takeDamage(amount: number, opts: DamageOptions = {}): void {
    if (amount > 0) this.hits.push({ t: this.clock * 1000, dmg: amount });
    super.takeDamage(amount, opts);
    this.hp = this.maxHp;
  }

  protected die(): void {
    this.hp = this.maxHp;
  }

  destroy(): void {
    super.destroy();
    this.label.destroy();
  }
}
