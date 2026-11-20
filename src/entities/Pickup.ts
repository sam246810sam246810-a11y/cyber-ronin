import Phaser from 'phaser';
import { DEPTH, DROP } from '../config';
import { INGREDIENT_MAP, hexToInt } from '../data';
import type { IngredientId } from '../types';

/** 地上的藥材 */
export class Pickup {
  life: number = DROP.lifetime;
  alive = true;
  readonly sprite: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Image;
  private t = Math.random() * 10;

  constructor(scene: Phaser.Scene, readonly id: IngredientId, public x: number, public y: number) {
    const color = hexToInt(INGREDIENT_MAP[id].color);
    this.glow = scene.add.image(x, y, 'circle').setTint(color).setAlpha(0.25).setDisplaySize(40, 40).setDepth(DEPTH.pickup);
    this.sprite = scene.add.image(x, y, `ing_${id}`).setDepth(DEPTH.pickup + 1).setDisplaySize(26, 26);
    this.sprite.setScale(0);
    scene.tweens.add({ targets: this.sprite, scale: 26 / this.sprite.width, duration: 180, ease: 'Back.Out' });
  }

  /** blocked：坩堝已滿，閃爍提示 */
  update(dt: number, blocked: boolean): void {
    this.t += dt;
    this.life -= dt;
    const bob = Math.sin(this.t * 4) * 3;
    this.sprite.setPosition(this.x, this.y + bob);
    this.glow.setPosition(this.x, this.y + bob);
    let alpha = 1;
    if (this.life < DROP.blinkAt) alpha = Math.floor(this.life * 8) % 2 ? 0.25 : 1;
    this.sprite.setAlpha(alpha);
    this.glow.setAlpha(blocked ? 0.25 + 0.25 * Math.sin(this.t * 12) : 0.25);
    if (this.life <= 0) this.destroy();
  }

  destroy(): void {
    this.alive = false;
    this.sprite.destroy();
    this.glow.destroy();
  }
}
