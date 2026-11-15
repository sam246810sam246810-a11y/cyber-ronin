import Phaser from 'phaser';
import { COLORS, H, W, Z, textStyle } from './layout';

/** 讓場景用 540 寬的邏輯座標作畫（畫布本身是 Z 倍解析度） */
export function setupLogicalCamera(scene: Phaser.Scene): void {
  const cam = scene.cameras.main;
  cam.setZoom(Z);
  cam.centerOn(W / 2, H / 2);
}

export interface Button extends Phaser.GameObjects.Container {
  setEnabled(on: boolean): Button;
  setLabel(text: string): Button;
  setActive2(on: boolean): Button;
}

export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  color: number,
  onClick: () => void,
  size = 22,
): Button {
  const c = scene.add.container(x, y) as Button;
  const bg = scene.add.rectangle(0, 0, w, h, COLORS.panel, 1).setStrokeStyle(2, color, 1);
  const glow = scene.add.rectangle(0, 0, w, h, color, 0.12);
  const txt = scene.add.text(0, 0, label, textStyle(size)).setOrigin(0.5);
  c.add([glow, bg, txt]);
  c.setSize(w, h);
  c.setInteractive({ useHandCursor: true });
  let enabled = true;
  let active = false;
  const refresh = () => {
    bg.setFillStyle(active ? color : COLORS.panel, active ? 0.35 : 1);
    c.setAlpha(enabled ? 1 : 0.4);
  };
  c.on('pointerdown', () => {
    if (!enabled) return;
    c.setScale(0.96);
  });
  c.on('pointerout', () => c.setScale(1));
  c.on('pointerup', () => {
    c.setScale(1);
    if (enabled) onClick();
  });
  c.setEnabled = (on: boolean) => {
    enabled = on;
    refresh();
    return c;
  };
  c.setLabel = (text: string) => {
    txt.setText(text);
    return c;
  };
  c.setActive2 = (on: boolean) => {
    active = on;
    refresh();
    return c;
  };
  return c;
}
