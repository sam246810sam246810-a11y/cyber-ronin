import Phaser from 'phaser';
import { COLORS, H, W, Z, textStyle } from './layout';
import { Audio } from './audio';
import { MOD_RARITY, ModuleItem } from '../config/meta';

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
    if (enabled) {
      Audio.play('sfx-click', 0.35, 30);
      onClick();
    }
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

/** 畫面頂端的標題列：返回鍵＋標題＋信用點 */
export function header(scene: Phaser.Scene, title: string, credits: number | null, onBack: () => void) {
  const bg = scene.add.rectangle(W / 2, 40, W, 80, 0x0b0916, 0.92);
  const line = scene.add.rectangle(W / 2, 80, W, 2, COLORS.magenta, 0.5);
  const back = makeButton(scene, 52, 40, 80, 48, '<', COLORS.cyan, onBack, 28);
  const t = scene.add.text(W / 2, 40, title, textStyle(24)).setOrigin(0.5);
  const c = scene.add.text(W - 16, 40, credits === null ? '' : `◆ ${credits}`, textStyle(18, '#ffd84d')).setOrigin(1, 0.5);
  return { bg, line, back, title: t, credits: c };
}

/** 背景：緩慢捲動的地面＋霓虹格線 */
export function menuBackground(scene: Phaser.Scene) {
  if (scene.textures.exists('ground')) {
    const tile = scene.add.tileSprite(W / 2, H / 2, W, H, 'ground').setTileScale(0.5).setAlpha(0.55);
    const fn = (time: number) => {
      tile.tilePositionY = -time / 30;
    };
    scene.events.on('update', fn);
    tile.once('destroy', () => scene.events.off('update', fn));
  }
  scene.add.rectangle(W / 2, H / 2, W, H, 0x07060d, 0.35);
}

/** 義體模組圖示：稀有度外框＋強化等級 */
export function moduleIcon(scene: Phaser.Scene, x: number, y: number, size: number, m: ModuleItem, equipped = false) {
  const c = scene.add.container(x, y);
  const r = MOD_RARITY[m.rarity];
  const bg = scene.add.rectangle(0, 0, size, size, 0x0d0a18, 1).setStrokeStyle(m.rarity >= 2 ? 3 : 2, r.color, 1);
  const glow = scene.add.rectangle(0, 0, size - 6, size - 6, r.color, m.rarity === 3 ? 0.18 : m.rarity === 2 ? 0.1 : 0.04);
  const key = scene.textures.exists(`mod-${m.base}`) ? `mod-${m.base}` : 'icon-might';
  const img = scene.add.image(0, 0, key);
  const src = img.texture.getSourceImage();
  img.setScale((size * 0.78) / Math.max(src.width, src.height));
  const rt = scene.add.text(-size / 2 + 4, -size / 2 + 2, r.name, textStyle(11, r.css)).setOrigin(0, 0);
  rt.setStroke('#07060d', 3);
  c.add([glow, bg, img, rt]);
  if (m.level > 0) {
    const lv = scene.add.text(size / 2 - 4, size / 2 - 2, `+${m.level}`, textStyle(12, '#ffffff')).setOrigin(1, 1);
    lv.setStroke('#07060d', 3);
    c.add(lv);
  }
  if (equipped) {
    const e = scene.add.text(size / 2 - 4, -size / 2 + 2, 'E', textStyle(12, '#5dff7a')).setOrigin(1, 0);
    e.setStroke('#07060d', 3);
    c.add(e);
  }
  c.setSize(size, size);
  return c;
}
