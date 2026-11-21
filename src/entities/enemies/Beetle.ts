import Phaser from 'phaser';
import { Enemy, type DamageOptions } from '../Enemy';
import { DEPTH } from '../../config';
import type { EnemyDef } from '../../types';
import type { GameScene } from '../../scenes/GameScene';

/** 岩甲甲蟲：護盾先吸收傷害，一段時間沒受傷會回復；持續傷害（毒）無視護盾 */
export class Beetle extends Enemy {
  shield: number;
  private maxShield: number;
  private sinceHit = 0;
  private shieldRing: Phaser.GameObjects.Image;

  constructor(game: GameScene, def: EnemyDef, x: number, y: number, elite: boolean, texture: string) {
    super(game, def, x, y, elite, texture);
    this.maxShield = this.shield = Number(def.shield ?? 8) * (elite ? 2 : 1) * (game.dungeon?.hpMul ?? 1);
    this.shieldRing = game.add.image(x, y, 'ring').setTint(0x7ed4ff).setDepth(DEPTH.enemy + 1)
      .setDisplaySize(this.radius * 2.5, this.radius * 2.5);
  }

  protected act(dt: number): void {
    const p = this.targetPoint();
    this.moveToward(p.x, p.y, dt);
    this.sprite.setFlipX(p.x < this.x);
    this.sinceHit += dt;
    if (this.sinceHit > Number(this.def.shieldRegen ?? 4) && this.shield < this.maxShield) {
      this.shield = Math.min(this.maxShield, this.shield + this.maxShield * 0.5 * dt);
    }
  }

  protected absorb(amount: number, opts: DamageOptions): number {
    if (opts.flash === false || this.shield <= 0) return amount;
    this.sinceHit = 0;
    const blocked = Math.min(this.shield, amount);
    this.shield -= blocked;
    if (blocked > 0) {
      this.game.fx.sparks(this.x, this.y, 0x7ed4ff, 2);
      if (this.shield <= 0) this.game.fx.burst(this.x, this.y, this.radius * 1.4, 0x7ed4ff);
    }
    return amount - blocked;
  }

  protected sync(dt: number): void {
    super.sync(dt);
    const ratio = this.shield / this.maxShield;
    this.shieldRing.setPosition(this.x, this.y).setVisible(ratio > 0.02).setAlpha(0.3 + 0.7 * ratio);
  }

  destroy(): void {
    super.destroy();
    this.shieldRing.destroy();
  }
}
