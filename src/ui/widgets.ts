import Phaser from 'phaser';
import { COLORS, FONT } from '../config';

/** 共用的長方形文字按鈕 */
export function textButton(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number, label: string, onClick: () => void,
  color: number = COLORS.panelLight,
): Phaser.GameObjects.Container {
  const bg = scene.add.rectangle(0, 0, w, h, color, 1).setStrokeStyle(3, COLORS.accent, 0.8);
  const text = scene.add.text(0, 0, label, {
    fontFamily: FONT, fontSize: `${Math.round(h * 0.38)}px`, color: '#ffffff', fontStyle: 'bold',
  }).setOrigin(0.5);
  const c = scene.add.container(x, y, [bg, text]).setSize(w, h).setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => scene.tweens.add({ targets: c, scale: 0.95, duration: 60, yoyo: true }));
  c.on('pointerup', onClick);
  return c;
}
