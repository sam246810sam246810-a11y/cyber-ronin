import Phaser from 'phaser';
import { DEPTH, FONT } from '../config';

/** 佔位用的簡單特效 */
export class FxSystem {
  constructor(private scene: Phaser.Scene) {}

  /** 擴散圓圈爆炸 */
  burst(x: number, y: number, r: number, color: number, duration = 260): void {
    const fill = this.scene.add.image(x, y, 'circle').setTint(color).setAlpha(0.55).setDepth(DEPTH.fx)
      .setDisplaySize(r * 0.6, r * 0.6);
    this.scene.tweens.add({
      targets: fill,
      displayWidth: r * 2,
      displayHeight: r * 2,
      alpha: 0,
      duration,
      ease: 'Quad.Out',
      onComplete: () => fill.destroy(),
    });
    const ring = this.scene.add.image(x, y, 'ring').setTint(color).setAlpha(0.9).setDepth(DEPTH.fx)
      .setDisplaySize(r * 0.8, r * 0.8);
    this.scene.tweens.add({
      targets: ring,
      displayWidth: r * 2.1,
      displayHeight: r * 2.1,
      alpha: 0,
      duration: duration + 80,
      ease: 'Quad.Out',
      onComplete: () => ring.destroy(),
    });
  }

  sparks(x: number, y: number, color: number, n = 6): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 20 + Math.random() * 30;
      const s = this.scene.add.image(x, y, 'circle').setTint(color).setDisplaySize(6, 6).setDepth(DEPTH.fx);
      this.scene.tweens.add({
        targets: s,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d,
        alpha: 0,
        duration: 300,
        onComplete: () => s.destroy(),
      });
    }
  }

  line(x1: number, y1: number, x2: number, y2: number, color: number, width = 4): void {
    const g = this.scene.add.graphics().setDepth(DEPTH.fx);
    g.lineStyle(width, color, 1).lineBetween(x1, y1, x2, y2);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
  }

  floatText(x: number, y: number, text: string, color = '#ffffff', size = 22): void {
    const t = this.scene.add.text(x, y, text, {
      fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH.fx + 5);
    this.scene.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }
}
