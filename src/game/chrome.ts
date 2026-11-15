// 大廳與各功能頁共用的外框：頂部資源列、底部分頁列、設定視窗、轉場。
import Phaser from 'phaser';
import { cloudState } from './cloud';
import { COLORS, H, W, textStyle } from './layout';
import { makeButton } from './ui';
import { SaveData, loadSave, writeSave } from './storage';
import { Audio } from './audio';
import { setVibrate, vibrate, vibrateEnabled } from './haptics';
import { claimableCount, equippedModules } from './meta';
import { GACHA } from '../config/meta';
import { UPGRADES, upgradeCost } from '../config/balance';
import { currentAvatar, currentFrame, drawAvatar, openProfile } from './profile';

export type TabKey = 'Shop' | 'Armory' | 'Menu' | 'Gacha' | 'Missions';

export const TOP_H = 76;
export const TAB_H = 96;
/** 內容區（頂部資源列與底部分頁列之間） */
export const CONTENT_TOP = TOP_H + 8;
export const CONTENT_BOTTOM = H - TAB_H - 6;

const TABS: { key: TabKey; label: string; icon: string; color: number }[] = [
  { key: 'Shop', label: '強化', icon: 'ui-ic-upgrade', color: COLORS.gold },
  { key: 'Armory', label: '義體', icon: 'ui-ic-implant', color: COLORS.cyan },
  { key: 'Menu', label: '出擊', icon: 'ui-ic-battle', color: COLORS.magenta },
  { key: 'Gacha', label: '抽卡', icon: 'ui-ic-gacha', color: COLORS.magenta },
  { key: 'Missions', label: '任務', icon: 'ui-ic-mission', color: 0x5dff7a },
];

/** 切換畫面：淡出再進入下一個畫面 */
export function goTo(scene: Phaser.Scene, key: string, data?: object) {
  if ((scene as unknown as { _leaving?: boolean })._leaving) return;
  (scene as unknown as { _leaving?: boolean })._leaving = true;
  scene.cameras.main.fadeOut(140, 7, 6, 13);
  scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => scene.scene.start(key, data));
}

/** 進入畫面時淡入，內容由下往上滑入 */
export function enter(scene: Phaser.Scene) {
  (scene as unknown as { _leaving?: boolean })._leaving = false;
  scene.cameras.main.fadeIn(180, 7, 6, 13);
}

function iconImg(scene: Phaser.Scene, x: number, y: number, key: string, size: number) {
  if (!scene.textures.exists(key)) return null;
  const img = scene.add.image(x, y, key);
  const src = img.texture.getSourceImage();
  return img.setScale(size / Math.max(src.width, src.height));
}

function badge(scene: Phaser.Scene, x: number, y: number, n: number | boolean) {
  if (!n) return;
  const c = scene.add.circle(x, y, typeof n === 'number' ? 10 : 6, 0xff2244).setStrokeStyle(2, 0x07060d);
  if (typeof n === 'number') scene.add.text(x, y, String(n), textStyle(11)).setOrigin(0.5);
  scene.tweens.add({ targets: c, scale: 1.2, yoyo: true, repeat: -1, duration: 600 });
}

/** 頂部資源列：頭像＋晶片、信用點、零件 */
export function topBar(scene: Phaser.Scene, save: SaveData) {
  const bg = scene.add.graphics();
  bg.fillGradientStyle(0x07060d, 0x07060d, 0x07060d, 0x07060d, 0.95, 0.95, 0, 0);
  bg.fillRect(0, 0, W, TOP_H + 16);
  bg.fillStyle(COLORS.magenta, 0.5);
  bg.fillRect(0, TOP_H - 2, W, 1);

  // 頭像（點了打開個人檔案，可以換頭像與頭像框）
  const ax = 40;
  const ay = TOP_H / 2;
  let av = drawAvatar(scene, ax, ay, 64, currentAvatar(save), currentFrame(save));
  const hitA = scene.add.zone(ax, ay, 70, 70).setInteractive({ useHandCursor: true });
  hitA.on('pointerup', () => {
    Audio.play('sfx-click', 0.3);
    openProfile(scene, () => {
      const sv = loadSave();
      const depth = av.depth;
      av.destroy();
      av = drawAvatar(scene, ax, ay, 64, currentAvatar(sv), currentFrame(sv)).setDepth(depth);
    });
  });
  const wanted = save.bestWanted ?? 0;
  const lv = scene.add.text(ax, ay + 28, save.wins > 0 ? `通緝 ${wanted}` : '新人', textStyle(11, '#ffd84d')).setOrigin(0.5);
  lv.setStroke('#07060d', 3);
  lv.setDepth(2);

  // 資源膠囊
  const items: { icon: string; value: number; color: string; to: TabKey }[] = [
    { icon: 'ui-ic-chip', value: save.chips ?? 0, color: '#7fd4ff', to: 'Gacha' },
    { icon: 'ui-ic-coin', value: save.credits, color: '#ffd84d', to: 'Shop' },
    { icon: 'ui-ic-parts', value: save.parts ?? 0, color: '#c9c6e0', to: 'Armory' },
  ];
  const cw = 132;
  items.forEach((it, i) => {
    const x = W - 14 - cw / 2 - (items.length - 1 - i) * (cw + 6);
    const y = TOP_H / 2;
    const pill = scene.add.graphics();
    pill.fillStyle(0x000000, 0.55);
    pill.fillRoundedRect(x - cw / 2 + 12, y - 14, cw - 12, 28, 14);
    pill.lineStyle(1, 0xffffff, 0.15);
    pill.strokeRoundedRect(x - cw / 2 + 12, y - 14, cw - 12, 28, 14);
    iconImg(scene, x - cw / 2 + 14, y, it.icon, 34);
    const t = scene.add.text(x + 14, y, formatNum(it.value), textStyle(15, it.color)).setOrigin(0.5);
    t.setStroke('#07060d', 3);
    const plus = scene.add.circle(x + cw / 2 - 14, y, 10, 0x2bd96b).setStrokeStyle(2, 0x07060d);
    scene.add.text(plus.x, plus.y - 1, '+', textStyle(14)).setOrigin(0.5);
    const hit = scene.add.zone(x, y, cw, 36).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => {
      Audio.play('sfx-click', 0.3);
      goTo(scene, it.to);
    });
  });
}

export function formatNum(n: number): string {
  if (n >= 100000) return `${Math.floor(n / 1000)}K`;
  return n.toLocaleString('en-US');
}

/** 底部分頁列 */
export function tabBar(scene: Phaser.Scene, active: TabKey) {
  const save = loadSave();
  const y0 = H - TAB_H;
  const bg = scene.add.graphics();
  bg.fillStyle(0x0b0916, 0.97);
  bg.fillRect(0, y0, W, TAB_H);
  bg.fillStyle(COLORS.cyan, 0.6);
  bg.fillRect(0, y0, W, 2);
  bg.fillStyle(COLORS.magenta, 0.25);
  bg.fillRect(0, y0 + 2, W, 2);

  const dots: Record<TabKey, number | boolean> = {
    Shop: UPGRADES.some((u) => (save.upgrades[u.id] ?? 0) < u.maxLevel && save.credits >= upgradeCost(u, save.upgrades[u.id] ?? 0)),
    Armory: equippedModules(save).length < 3 && (save.modules?.length ?? 0) > equippedModules(save).length,
    Menu: false,
    Gacha: (save.chips ?? 0) >= GACHA.single || Object.values(save.tickets ?? {}).some((n) => n > 0),
    Missions: claimableCount(save),
  };
  writeSave(save);

  const tw = W / TABS.length;
  TABS.forEach((t, i) => {
    const x = tw * i + tw / 2;
    const isActive = t.key === active;
    const isBattle = t.key === 'Menu';
    const cy = y0 + TAB_H / 2 + (isActive ? -10 : 0);
    if (isActive) {
      const hl = scene.add.graphics();
      hl.fillStyle(t.color, 0.22);
      hl.fillRoundedRect(x - tw / 2 + 4, y0 - 14, tw - 8, TAB_H + 10, 10);
      hl.lineStyle(2, t.color, 0.9);
      hl.strokeRoundedRect(x - tw / 2 + 4, y0 - 14, tw - 8, TAB_H + 10, 10);
    } else if (i > 0) {
      bg.fillStyle(0xffffff, 0.06);
      bg.fillRect(tw * i, y0 + 16, 1, TAB_H - 32);
    }
    const size = isBattle ? 58 : 44;
    const icon = iconImg(scene, x, cy - 10, t.icon, isActive ? size + 8 : size);
    if (!icon) scene.add.circle(x, cy - 10, 16, t.color, 0.6);
    if (isActive && icon) scene.tweens.add({ targets: icon, y: icon.y - 3, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.InOut' });
    const label = scene.add.text(x, cy + 26, t.label, textStyle(isActive ? 16.5 : 14, isActive ? '#ffffff' : '#8a86a8')).setOrigin(0.5);
    label.setStroke('#07060d', 3);
    badge(scene, x + 20, cy - 30, dots[t.key]);
    const hit = scene.add.zone(x, y0 + TAB_H / 2, tw, TAB_H).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => {
      if (isActive) return;
      Audio.play('sfx-click', 0.35);
      goTo(scene, t.key);
    });
  });
}

/** 設定視窗 */
export function openSettings(scene: Phaser.Scene) {
  const layer = scene.add.container(0, 0).setDepth(200);
  const dim = scene.add.rectangle(W / 2, H / 2, W, H, 0x05040a, 0.8).setInteractive();
  layer.add(dim);
  const panel = panelBox(scene, W / 2, H / 2, 420, 640);
  layer.add(panel);
  const title = scene.add.text(W / 2, H / 2 - 268, '設定', textStyle(28, '#3df5ff')).setOrigin(0.5);
  title.setStroke('#07060d', 5);
  layer.add(title);
  const rows: [string, () => boolean, (v: boolean) => void][] = [
    ['音樂', () => Audio.musicOn, (v) => {
      Audio.setMusic(v);
      if (v) Audio.playLobby();
    }],
    ['音效', () => Audio.sfxOn, (v) => Audio.setSfx(v)],
    ['震動', () => vibrateEnabled(), (v) => {
      setVibrate(v);
      if (v) vibrate(40);
    }],
    ['傷害數字', () => loadSave().showDamage !== false, (v) => {
      const s = loadSave();
      s.showDamage = v;
      writeSave(s);
    }],
    ['畫面震動', () => loadSave().screenShake !== false, (v) => {
      const s = loadSave();
      s.screenShake = v;
      writeSave(s);
    }],
  ];
  rows.forEach(([name, get, set], i) => {
    const y = H / 2 - 200 + i * 74;
    layer.add(scene.add.text(W / 2 - 160, y, name, textStyle(22)).setOrigin(0, 0.5));
    const b = makeButton(scene, W / 2 + 110, y, 140, 52, '', COLORS.cyan, () => {
      set(!get());
      b.setLabel(get() ? '開' : '關').setActive2(get());
    }, 20);
    b.setLabel(get() ? '開' : '關').setActive2(get());
    layer.add(b);
  });
  // 特效品質：高 → 中 → 低
  const qy = H / 2 - 200 + rows.length * 74;
  layer.add(scene.add.text(W / 2 - 160, qy, '特效品質', textStyle(22)).setOrigin(0, 0.5));
  const qName = { high: '高', mid: '中', low: '低' } as const;
  const qb = makeButton(scene, W / 2 + 110, qy, 140, 52, qName[loadSave().fxQuality ?? 'high'], COLORS.gold, () => {
    const s = loadSave();
    const order = ['high', 'mid', 'low'] as const;
    s.fxQuality = order[(order.indexOf(s.fxQuality ?? 'high') + 1) % 3];
    writeSave(s);
    qb.setLabel(qName[s.fxQuality]);
  }, 20);
  layer.add(qb);
  const cs = cloudState();
  const cText = { ok: '雲端存檔：已開啟（換裝置或更新都不會遺失）', syncing: '雲端存檔：同步中…', error: '雲端存檔：暫時無法連線，先存在本機', off: '雲端存檔：未開啟（只存在這個瀏覽器）' }[cs];
  layer.add(scene.add.text(W / 2, H / 2 + 214, cText, textStyle(13, cs === 'ok' ? '#5dff7a' : cs === 'error' ? '#ff8a5d' : COLORS.dim, false)).setOrigin(0.5));
  const close = makeButton(scene, W / 2, H / 2 + 268, 220, 56, '關閉', COLORS.magenta, () => layer.destroy(), 20);
  layer.add(close);
  layer.setScale(0.9).setAlpha(0);
  scene.tweens.add({ targets: layer, scale: 1, alpha: 1, duration: 180, ease: 'Back.Out' });
  return layer;
}

/** 金屬面板（有生成的邊框就用九宮格伸縮） */
export function panelBox(scene: Phaser.Scene, x: number, y: number, w: number, h: number) {
  const c = scene.add.container(x, y);
  const fill = scene.add.rectangle(0, 0, w - 12, h - 12, 0x0d0a1c, 0.95);
  c.add(fill);
  if (scene.textures.exists('ui-frame-panel')) {
    const src = scene.textures.get('ui-frame-panel').getSourceImage();
    const k = 0.5;
    const ns = scene.add.nineslice(0, 0, 'ui-frame-panel', undefined, w / k, h / k, 90, 90, 90, 90).setScale(k);
    void src;
    c.add(ns);
  } else c.add(scene.add.rectangle(0, 0, w, h).setStrokeStyle(2, COLORS.magenta, 0.8));
  return c;
}

/** 大廳背景：生成的雨夜街景＋雨滴 */
/** 大廳天氣：雨、櫻花、資料塵、星光 */
export type Weather = 'rain' | 'petals' | 'dust' | 'stars';

export function lobbyBackground(scene: Phaser.Scene, dim = 0, key = 'ui-lobby-bg', weather: Weather = 'rain') {
  const k = scene.textures.exists(key) ? key : 'ui-lobby-bg';
  if (scene.textures.exists(k)) {
    const bg = scene.add.image(W / 2, H / 2, k);
    const src = bg.texture.getSourceImage();
    bg.setScale(Math.max(W / src.width, H / src.height));
  }
  if (dim > 0) scene.add.rectangle(W / 2, H / 2, W, H, 0x07060d, dim);
  const fx = scene.add.graphics();
  const n = weather === 'rain' ? 60 : weather === 'stars' ? 50 : 36;
  const parts = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, v: Math.random(), p: Math.random() * 6.28 }));
  const fn = (t: number, dt: number) => {
    fx.clear();
    for (const d of parts) {
      if (weather === 'rain') {
        const v = 500 + d.v * 300;
        d.y += (v * dt) / 1000;
        d.x -= (v * dt) / 6000;
        if (d.y > H) ((d.y = -20), (d.x = Math.random() * W));
        fx.lineStyle(1, 0x9fd8ff, 0.35).lineBetween(d.x, d.y, d.x - 2, d.y + 10 + d.v * 14);
      } else if (weather === 'petals') {
        // 櫻花：慢慢飄落並左右搖擺
        d.y += ((40 + d.v * 40) * dt) / 1000;
        d.x += Math.sin(t / 700 + d.p) * 0.4 - 0.15;
        if (d.y > H) ((d.y = -10), (d.x = Math.random() * W));
        fx.fillStyle(0xff9ad0, 0.75).fillEllipse(d.x, d.y, 6, 3.5);
      } else if (weather === 'dust') {
        // 資料塵：綠色光點往上飄
        d.y -= ((18 + d.v * 30) * dt) / 1000;
        d.x += Math.sin(t / 900 + d.p) * 0.2;
        if (d.y < -10) ((d.y = H + 10), (d.x = Math.random() * W));
        fx.fillStyle(0x5dff7a, 0.25 + 0.35 * Math.abs(Math.sin(t / 500 + d.p))).fillRect(d.x, d.y, 2, 2);
      } else {
        // 星光：閃爍
        const a = 0.15 + 0.6 * Math.abs(Math.sin(t / (600 + d.v * 900) + d.p));
        fx.fillStyle(0xffffff, a).fillRect(d.x, d.y * 0.6, 2, 2);
      }
    }
  };
  scene.events.on('update', fn);
  fx.once('destroy', () => scene.events.off('update', fn));
}

export interface RewardItem {
  /** 圖示貼圖名稱（沒有就畫一個色塊） */
  icon: string;
  label: string;
  color?: string;
}

/** 獎勵彈窗：放射光芒＋物品逐一彈出，點一下後物品飛向頂部資源列 */
export function rewardPopup(scene: Phaser.Scene, title: string, items: RewardItem[], onClose?: () => void) {
  const layer = scene.add.container(0, 0).setDepth(200);
  const dim = scene.add.rectangle(W / 2, H / 2, W, H, 0x05040a, 0.85).setInteractive();
  layer.add(dim);
  const cy = H * 0.42;
  // 放射光芒
  const rays = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  rays.fillStyle(0xffd84d, 0.12);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    rays.slice(0, 0, 420, a - 0.12, a + 0.12, false).fillPath();
  }
  rays.setPosition(W / 2, cy);
  layer.add(rays);
  scene.tweens.add({ targets: rays, angle: 360, duration: 12000, repeat: -1 });
  const halo = scene.add.circle(W / 2, cy, 120, 0xffd84d, 0.15).setBlendMode(Phaser.BlendModes.ADD);
  layer.add(halo);
  scene.tweens.add({ targets: halo, scale: 1.2, alpha: 0.3, yoyo: true, repeat: -1, duration: 700 });
  const t = scene.add.text(W / 2, cy - 190, title, textStyle(30, '#ffd84d')).setOrigin(0.5).setStroke('#07060d', 6);
  layer.add(t);
  t.setScale(0.4);
  scene.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'Back.Out' });
  const cell = 104;
  const cols = Math.min(4, items.length);
  const nodes: Phaser.GameObjects.Container[] = [];
  items.forEach((it, i) => {
    const x = W / 2 + ((i % cols) - (cols - 1) / 2) * (cell + 10);
    const y = cy + Math.floor(i / cols) * (cell + 40) - (items.length > 4 ? 40 : 0);
    const c = scene.add.container(x, y);
    c.add(scene.add.rectangle(0, 0, cell, cell, 0x110d1f, 0.95).setStrokeStyle(2, 0xffd84d, 0.9));
    if (scene.textures.exists(it.icon)) {
      const img = scene.add.image(0, -6, it.icon);
      const src = img.texture.getSourceImage();
      img.setScale((cell * 0.6) / Math.max(src.width, src.height));
      c.add(img);
    } else c.add(scene.add.circle(0, -6, cell * 0.25, 0x5dff7a));
    c.add(scene.add.text(0, cell / 2 + 14, it.label, textStyle(13, it.color ?? '#ffffff')).setOrigin(0.5).setStroke('#07060d', 4));
    c.setScale(0);
    scene.tweens.add({ targets: c, scale: 1, delay: 250 + i * 140, duration: 260, ease: 'Back.Out' });
    layer.add(c);
    nodes.push(c);
  });
  const hint = scene.add.text(W / 2, H * 0.82, '點一下領取', textStyle(15, COLORS.dim, false)).setOrigin(0.5).setAlpha(0);
  layer.add(hint);
  scene.tweens.add({ targets: hint, alpha: 1, delay: 500 + items.length * 140, duration: 300 });
  Audio.play('sfx-chest', 0.6);
  vibrate(40);
  const openedAt = scene.time.now;
  let closing = false;
  dim.on('pointerup', () => {
    if (closing || scene.time.now - openedAt < 500) return;
    closing = true;
    Audio.play('sfx-gem', 0.5);
    // 物品飛向頂部資源列
    nodes.forEach((n, i) => scene.tweens.add({ targets: n, x: W - 120, y: TOP_H / 2, scale: 0.2, alpha: 0, delay: i * 60, duration: 420, ease: 'Cubic.In' }));
    scene.tweens.add({
      targets: [rays, halo, t, hint, dim],
      alpha: 0,
      delay: 200,
      duration: 400,
      onComplete: () => {
        layer.destroy();
        onClose?.();
      },
    });
  });
  return layer;
}
