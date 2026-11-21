import Phaser from 'phaser';
import { DEPTH, FONT } from '../config';
import { isArtTexture } from '../utils';

export interface RoundButton {
  container: Phaser.GameObjects.Container;
  setEnabled(on: boolean): void;
  setCooldown(ratio: number): void;
  setIcon(color: number | null): void;
}

const ICONS: Record<string, string> = { 衝刺: 'ui_ic_dash', 技能: 'ui_ic_skill', 煉成: 'ui_ic_brew', 換武器: 'ui_ic_swap' };

/** 右下圓形按鈕（衝刺 / 投擲） */
export function createRoundButton(
  scene: Phaser.Scene, x: number, y: number, r: number, label: string, color: number, onPress: () => void,
): RoundButton {
  // 黃銅木頭風：有美術就用銅框按鈕＋圖示，文字縮小放在下緣
  const art = isArtTexture(scene, 'ui_btn');
  const iconKey = ICONS[label];
  const hasIcon = art && !!iconKey && isArtTexture(scene, iconKey);
  const bg = art
    ? scene.add.image(0, 0, 'ui_btn').setDisplaySize(r * 2.25, r * 2.25)
    : scene.add.image(0, 0, 'circle').setTint(color).setAlpha(0.85).setDisplaySize(r * 2, r * 2);
  const rim = scene.add.image(0, 0, 'ring').setTint(0xffffff).setAlpha(art ? 0 : 0.6).setDisplaySize(r * 2, r * 2);
  const labelIcon = scene.add.image(0, -r * 0.08, hasIcon ? iconKey! : 'flask').setDisplaySize(r * 1.15, r * 1.15).setVisible(hasIcon);
  const icon = scene.add.image(0, -8, 'flask').setDisplaySize(r * 0.6, r * 0.72).setVisible(false);
  const text = scene.add.text(0, hasIcon ? r * 0.66 : 0, label, {
    fontFamily: FONT, fontSize: `${Math.round(r * (hasIcon ? 0.3 : 0.42))}px`, color: hasIcon ? '#ffe9b0' : '#ffffff', fontStyle: 'bold',
    stroke: '#000000', strokeThickness: 4,
  }).setOrigin(0.5);
  const cd = scene.add.graphics();
  const container = scene.add.container(x, y, [bg, rim, labelIcon, icon, cd, text]).setDepth(DEPTH.ui).setSize(r * 2.2, r * 2.2);
  // Container 的點擊座標以左上角為原點，所以圓心要放在 size 的中心
  container.setInteractive(new Phaser.Geom.Circle(r * 1.1, r * 1.1, r * 1.15), Phaser.Geom.Circle.Contains);
  container.on('pointerdown', () => {
    onPress();
    scene.tweens.add({ targets: container, scale: 0.9, duration: 60, yoyo: true });
  });

  return {
    container,
    setEnabled(on) {
      bg.setAlpha(on ? (art ? 1 : 0.85) : 0.4);
      labelIcon.setAlpha(on ? 1 : 0.45);
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
        labelIcon.setVisible(hasIcon);
        text.setY(hasIcon ? r * 0.66 : 0);
      } else {
        // 可以煉成時：圖示換成對應顏色的藥水瓶
        icon.setVisible(true).setTint(c);
        labelIcon.setVisible(false);
        text.setY(hasIcon ? r * 0.66 : r * 0.45);
      }
    },
  };
}
