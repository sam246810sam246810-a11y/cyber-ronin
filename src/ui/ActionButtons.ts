import Phaser from 'phaser';
import { DEPTH, FONT } from '../config';

export interface RoundButton {
  container: Phaser.GameObjects.Container;
  setEnabled(on: boolean): void;
  setCooldown(ratio: number): void;
  setIcon(color: number | null): void;
}

/** 右下圓形按鈕（衝刺 / 投擲） */
export function createRoundButton(
  scene: Phaser.Scene, x: number, y: number, r: number, label: string, color: number, onPress: () => void,
): RoundButton {
  const bg = scene.add.image(0, 0, 'circle').setTint(color).setAlpha(0.85).setDisplaySize(r * 2, r * 2);
  const rim = scene.add.image(0, 0, 'ring').setTint(0xffffff).setAlpha(0.6).setDisplaySize(r * 2, r * 2);
  const icon = scene.add.image(0, -8, 'flask').setDisplaySize(r * 0.6, r * 0.72).setVisible(false);
  const text = scene.add.text(0, 0, label, {
    fontFamily: FONT, fontSize: `${Math.round(r * 0.42)}px`, color: '#ffffff', fontStyle: 'bold',
    stroke: '#000000', strokeThickness: 4,
  }).setOrigin(0.5);
  const cd = scene.add.graphics();
  const container = scene.add.container(x, y, [bg, rim, icon, cd, text]).setDepth(DEPTH.ui).setSize(r * 2.2, r * 2.2);
  // Container 的點擊座標以左上角為原點，所以圓心要放在 size 的中心
  container.setInteractive(new Phaser.Geom.Circle(r * 1.1, r * 1.1, r * 1.15), Phaser.Geom.Circle.Contains);
  container.on('pointerdown', () => {
    onPress();
    scene.tweens.add({ targets: container, scale: 0.9, duration: 60, yoyo: true });
  });

  return {
    container,
    setEnabled(on) {
      bg.setAlpha(on ? 0.85 : 0.3);
      text.setAlpha(on ? 1 : 0.5);
    },
    setCooldown(ratio) {
      cd.clear();
      if (ratio <= 0) return;
      cd.fillStyle(0x000000, 0.55);
      cd.slice(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio, false);
      cd.fillPath();
    },
    setIcon(c) {
      if (c === null) {
        icon.setVisible(false);
        text.setY(0);
      } else {
        icon.setVisible(true).setTint(c);
        text.setY(r * 0.45);
      }
    },
  };
}
