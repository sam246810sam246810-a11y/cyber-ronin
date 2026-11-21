import Phaser from 'phaser';
import { DEPTH, DROP } from '../config';
import { hexToInt, rarityColor } from '../data';
import type { Material } from '../types';

/** 地上的素材：圖示＝元素，光暈顏色＝稀有度 */
export class Pickup {
  life: number = DROP.lifetime;
  alive = true;
  readonly sprite: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly ring?: Phaser.GameObjects.Image;
  private t = Math.random() * 10;
  private readonly size: number;

  constructor(scene: Phaser.Scene, readonly mat: Material, public x: number, public y: number) {
    const color = hexToInt(rarityColor(mat.r));
    this.size = 26 + mat.r * 4;
    this.glow = scene.add.image(x, y, 'circle').setTint(color).setAlpha(0.3)
      .setDisplaySize(this.size + 18, this.size + 18).setDepth(DEPTH.pickup);
    if (mat.r > 0) {
      this.ring = scene.add.image(x, y, 'ring').setTint(color).setAlpha(0.9)
        .setDisplaySize(this.size + 14, this.size + 14).setDepth(DEPTH.pickup);
    }
    this.sprite = scene.add.image(x, y, `ing_${mat.el}`).setDepth(DEPTH.pickup + 1).setDisplaySize(this.size, this.size);
    this.sprite.setScale(0);
    scene.tweens.add({ targets: this.sprite, scale: this.size / this.sprite.width, duration: 180, ease: 'Back.Out' });
    // 高稀有度掉落時噴出光柱
    if (mat.r >= 2) {
      const beam = scene.add.rectangle(x, y - 60, 10, 120, color, 0.6).setDepth(DEPTH.pickup);
      scene.tweens.add({ targets: beam, alpha: 0, scaleX: 3, duration: 700, onComplete: () => beam.destroy() });
    }
  }

  update(dt: number, blocked: boolean): void {
    this.t += dt;
    this.life -= dt;
    const bob = Math.sin(this.t * 4) * 3;
    this.sprite.setPosition(this.x, this.y + bob);
    this.glow.setPosition(this.x, this.y + bob);
    this.ring?.setPosition(this.x, this.y + bob).setRotation(this.t);
    let alpha = 1;
    if (this.life < DROP.blinkAt) alpha = Math.floor(this.life * 8) % 2 ? 0.25 : 1;
    this.sprite.setAlpha(alpha);
    this.glow.setAlpha(blocked ? 0.25 + 0.25 * Math.sin(this.t * 12) : 0.3);
    if (this.life <= 0) this.destroy();
  }

  destroy(): void {
    this.alive = false;
    this.sprite.destroy();
    this.glow.destroy();
    this.ring?.destroy();
  }
}
