import Phaser from 'phaser';
import { FONT_FAMILY, RENDER_SCALE } from '../config';

/** 傷害數字、獲得金錢等飄字。 */
export function floatText(scene: Phaser.Scene, x: number, y: number, text: string, color = '#ffffff', size = 9): void {
  const t = scene.add.text(x, y, text, { fontFamily: FONT_FAMILY, fontSize: `${size}px`, color, fontStyle: 'bold', stroke: '#14121c', strokeThickness: 3 })
    .setOrigin(0.5, 1).setResolution(RENDER_SCALE).setDepth(150000);
  scene.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: 700, ease: 'Cubic.out', onComplete: () => t.destroy() });
}

/** 弧形斬擊。angle 是面向角度（弧度）。 */
export function slashArc(scene: Phaser.Scene, x: number, y: number, angle: number, radius: number, spread: number, color = 0xf8f0e0, width = 3): void {
  const g = scene.add.graphics().setDepth(140000);
  g.lineStyle(width, color, 1);
  g.beginPath(); g.arc(x, y, radius, angle - spread / 2, angle + spread / 2); g.strokePath();
  g.lineStyle(1, 0xffffff, 0.7);
  g.beginPath(); g.arc(x, y, radius - 3, angle - spread / 3, angle + spread / 3); g.strokePath();
  scene.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => g.destroy() });
}

/** 擴散的圓環（迴旋斬、命中火花）。 */
export function ring(scene: Phaser.Scene, x: number, y: number, radius: number, color: number, duration = 250): void {
  const c = scene.add.circle(x, y, radius * 0.4).setStrokeStyle(2, color, 1).setDepth(140000);
  scene.tweens.add({ targets: c, scale: 2.5, alpha: 0, duration, onComplete: () => c.destroy() });
}
