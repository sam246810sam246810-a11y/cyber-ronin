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

const BTN_TEX: Record<number, string> = {
  [COLORS.magenta]: 'ui-btn-primary',
  [COLORS.cyan]: 'ui-btn-secondary',
  [COLORS.gold]: 'ui-btn-gold',
  0x5dff7a: 'ui-btn-secondary',
};

function shade(c: number, k: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k));
  const b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
}

/** 切角多邊形（賽博風的按鈕外形） */
function chamfer(w: number, h: number, cut: number): Phaser.Types.Math.Vector2Like[] {
  const x0 = -w / 2;
  const y0 = -h / 2;
  return [
    { x: x0 + cut, y: y0 },
    { x: x0 + w - cut, y: y0 },
    { x: x0 + w, y: y0 + cut },
    { x: x0 + w, y: y0 + h - cut },
    { x: x0 + w - cut, y: y0 + h },
    { x: x0 + cut, y: y0 + h },
    { x: x0, y: y0 + h - cut },
    { x: x0, y: y0 + cut },
  ];
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
  const texKey = BTN_TEX[color];
  // 生成的按鈕底圖：寬扁的按鈕用三段式伸縮；太窄或太矮的按鈕改用程式繪製
  const useTex = !!texKey && scene.textures.exists(texKey) && w / h >= 1.9 && h >= 40;
  const glow = scene.add.graphics();
  let body: Phaser.GameObjects.GameObject & { setVisible(v: boolean): unknown };
  let disabledBody: (Phaser.GameObjects.GameObject & { setVisible(v: boolean): unknown }) | null = null;
  const g = scene.add.graphics();
  if (useTex) {
    const src = scene.textures.get(texKey).getSourceImage();
    const sc = h / src.height;
    const cap = Math.min(src.width * 0.3, (w / sc) * 0.45);
    const ns = scene.add.nineslice(0, 0, texKey, undefined, w / sc, src.height, cap, cap, 0, 0).setScale(sc);
    body = ns;
    if (scene.textures.exists('ui-btn-disabled')) {
      const ds = scene.add.nineslice(0, 0, 'ui-btn-disabled', undefined, w / sc, src.height, cap, cap, 0, 0).setScale(sc).setVisible(false);
      disabledBody = ds;
    }
  } else body = g;
  const draw = (state: 'normal' | 'active' | 'disabled') => {
    g.clear();
    glow.clear();
    if (useTex) {
      if (state === 'active') {
        glow.lineStyle(6, color, 0.35);
        glow.strokePoints(chamfer(w + 6, h + 6, h * 0.35), true, true);
      }
      return;
    }
    const col = state === 'disabled' ? 0x555566 : color;
    const cut = Math.min(12, h * 0.28);
    const pts = chamfer(w, h, cut);
    // 投影
    g.fillStyle(0x000000, 0.45);
    g.fillPoints(chamfer(w, h, cut).map((p) => ({ x: p.x, y: p.y + 4 })), true);
    // 底色：主要狀態用實心亮色，一般狀態用深色半透明
    const fill = state === 'active' ? shade(col, 0.55) : 0x14102a;
    g.fillStyle(fill, 0.96);
    g.fillPoints(pts, true);
    // 上半部高光
    g.fillStyle(shade(col, state === 'active' ? 1 : 0.6), state === 'active' ? 0.35 : 0.16);
    g.fillPoints(
      [
        { x: -w / 2 + cut, y: -h / 2 },
        { x: w / 2 - cut, y: -h / 2 },
        { x: w / 2, y: -h / 2 + cut },
        { x: w / 2, y: -h / 8 },
        { x: -w / 2, y: -h / 8 },
        { x: -w / 2, y: -h / 2 + cut },
      ],
      true,
    );
    g.lineStyle(1, 0xffffff, state === 'disabled' ? 0.1 : 0.35);
    g.lineBetween(-w / 2 + cut + 2, -h / 2 + 2, w / 2 - cut - 2, -h / 2 + 2);
    // 霓虹外框與外發光
    glow.lineStyle(5, col, state === 'disabled' ? 0 : state === 'active' ? 0.4 : 0.18);
    glow.strokePoints(chamfer(w + 4, h + 4, cut + 1), true, true);
    g.lineStyle(2, col, state === 'disabled' ? 0.5 : 1);
    g.strokePoints(pts, true, true);
  };
  const txt = scene.add.text(0, useTex ? -1 : 0, label, textStyle(size)).setOrigin(0.5);
  txt.setStroke('#07060d', Math.max(3, size / 5));
  txt.setShadow(0, 2, '#000000', 2, false, true);
  const parts: Phaser.GameObjects.GameObject[] = [glow, g];
  if (useTex) parts.push(body as Phaser.GameObjects.GameObject);
  if (disabledBody) parts.push(disabledBody as Phaser.GameObjects.GameObject);
  parts.push(txt);
  c.add(parts);
  c.setSize(w, h);
  c.setInteractive({ useHandCursor: true });
  let enabled = true;
  let active = false;
  const refresh = () => {
    draw(!enabled ? 'disabled' : active ? 'active' : 'normal');
    if (useTex) {
      body.setVisible(enabled || !disabledBody);
      disabledBody?.setVisible(!enabled);
    }
    txt.setAlpha(enabled ? 1 : 0.55);
  };
  refresh();
  c.on('pointerdown', () => {
    if (!enabled) return;
    scene.tweens.killTweensOf(c);
    c.setScale(0.93);
  });
  c.on('pointerout', () => {
    if (c.scale !== 1) scene.tweens.add({ targets: c, scale: 1, duration: 120 });
  });
  c.on('pointerup', () => {
    scene.tweens.killTweensOf(c);
    scene.tweens.add({ targets: c, scale: { from: 0.93, to: 1 }, duration: 220, ease: 'Back.Out' });
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

/** 標題文字：雙層描邊＋投影 */
export function fancyTitle(scene: Phaser.Scene, x: number, y: number, text: string, size: number, color = '#ffffff', glow = '#ff3d81') {
  const t = scene.add.text(x, y, text, textStyle(size, color)).setOrigin(0.5);
  t.setStroke('#07060d', Math.max(4, size / 5));
  t.setShadow(0, 0, glow, 10, true, true);
  const line = scene.add.rectangle(x, y + size * 0.75, Math.min(320, t.width + 60), 2, Phaser.Display.Color.HexStringToColor(glow).color, 0.8);
  return [t, line];
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
