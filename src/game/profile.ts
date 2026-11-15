// 個人檔案：自選頭像（解鎖角色即可使用）與頭像框（成就、活動取得）。
import Phaser from 'phaser';
import { COLORS, H, W, textStyle } from './layout';
import { makeButton } from './ui';
import { SaveData, loadSave, writeSave } from './storage';
import { Audio } from './audio';
import { CHARACTERS, CharId } from '../config/balance';

export interface FrameDef {
  id: string;
  name: string;
  /** 外框色調（0 表示用原色） */
  tint: number;
  /** 外圈光環色 */
  glow: number;
  how: string;
  unlocked: (s: SaveData) => boolean;
  /** 活動限定：還沒開放的框也會顯示，讓玩家知道有這個東西 */
  event?: boolean;
}

export const FRAMES: FrameDef[] = [
  { id: 'default', name: '霓虹基本框', tint: 0, glow: 0, how: '預設', unlocked: () => true },
  { id: 'wanted', name: '通緝犯之框', tint: 0xff6a3d, glow: 0xff3d3d, how: '通關通緝等級 3', unlocked: (s) => (s.bestWanted ?? 0) >= 3 },
  { id: 'gold', name: '黃金傳說框', tint: 0xffd84d, glow: 0xffc83d, how: '抽到任一 SSR', unlocked: (s) => (s.ssrCount ?? 0) >= 1 },
  { id: 'spirit', name: '百鬼框', tint: 0x7dff8a, glow: 0x2bd96b, how: '收集 8 種式神', unlocked: (s) => Object.values(s.spirits ?? {}).filter((n) => (n ?? 0) > 0).length >= 8 },
  { id: 'sakura', name: '櫻花祭框', tint: 0xff9ad0, glow: 0xff6ab0, how: '活動限定（敬請期待）', unlocked: () => false, event: true },
];

export function currentAvatar(s: SaveData): CharId {
  const a = s.avatar;
  return a && s.chars.includes(a) ? a : 'jin';
}

export function currentFrame(s: SaveData): FrameDef {
  const f = FRAMES.find((x) => x.id === s.avatarFrame);
  return f && f.unlocked(s) ? f : FRAMES[0];
}

/** 畫一個頭像（圓形頭像＋外框），回傳容器 */
export function drawAvatar(scene: Phaser.Scene, x: number, y: number, size: number, char: CharId, frame: FrameDef, dim = false) {
  const c = scene.add.container(x, y);
  const r = size * 0.39;
  c.add(scene.add.circle(0, 0, r + 2, 0x14102a));
  if (frame.glow) {
    const g = scene.add.circle(0, 0, size * 0.5, frame.glow, 0.25);
    c.add(g);
    scene.tweens.add({ targets: g, scale: 1.08, alpha: 0.1, yoyo: true, repeat: -1, duration: 900 });
  }
  const key = scene.textures.exists(`avatar-${char}`) ? `avatar-${char}` : scene.textures.exists(`portrait-${char}`) ? `portrait-${char}` : `char-${char}`;
  const face = scene.add.image(0, 0, key);
  const src = face.texture.getSourceImage();
  face.setScale((r * 2) / Math.min(src.width, src.height));
  if (dim) face.setTint(0x3a3452);
  // 遮罩要用世界座標，容器移動時跟著更新
  const mask = scene.make.graphics({}, false);
  const updateMask = () => {
    const m = c.getWorldTransformMatrix();
    mask.clear().fillStyle(0xffffff).fillCircle(m.tx, m.ty, r * c.scaleX);
  };
  updateMask();
  face.setMask(mask.createGeometryMask());
  scene.events.on('postupdate', updateMask);
  c.once('destroy', () => {
    scene.events.off('postupdate', updateMask);
    mask.destroy();
  });
  c.add(face);
  if (scene.textures.exists('ui-frame-avatar')) {
    const ring = scene.add.image(0, 0, 'ui-frame-avatar');
    const rs = ring.texture.getSourceImage();
    ring.setScale(size / Math.max(rs.width, rs.height));
    if (frame.tint) ring.setTint(frame.tint);
    c.add(ring);
  } else c.add(scene.add.circle(0, 0, r + 2).setStrokeStyle(2, frame.tint || COLORS.cyan));
  if (frame.glow) c.add(scene.add.circle(0, 0, size * 0.47).setStrokeStyle(2, frame.glow, 0.9));
  c.setSize(size, size);
  return c;
}

/** 個人檔案視窗：選頭像與頭像框；onChange 會在選擇後呼叫，用來更新頂部頭像 */
export function openProfile(scene: Phaser.Scene, onChange: () => void) {
  const layer = scene.add.container(0, 0).setDepth(50);
  const draw = () => {
    layer.removeAll(true);
    const s = loadSave();
    layer.add(scene.add.rectangle(W / 2, H / 2, W, H, 0x05040a, 0.92).setInteractive());
    const top = 110;
    layer.add(scene.add.rectangle(W / 2, top + 340, 500, 700, 0x0d0a1c, 0.97).setStrokeStyle(2, COLORS.cyan, 0.7));
    layer.add(scene.add.text(W / 2, top + 20, '個人檔案', textStyle(26, '#ffffff')).setOrigin(0.5).setStroke('#ff3d81', 4));
    const curA = currentAvatar(s);
    const curF = currentFrame(s);
    layer.add(drawAvatar(scene, W / 2, top + 110, 120, curA, curF));
    layer.add(scene.add.text(W / 2, top + 182, `最佳通緝等級 ${s.bestWanted ?? 0}　通關 ${s.wins} 次`, textStyle(14, '#ffd84d', false)).setOrigin(0.5));

    layer.add(scene.add.text(46, top + 220, '頭像', textStyle(18, '#3df5ff')).setOrigin(0, 0.5));
    layer.add(scene.add.text(W - 46, top + 220, '解鎖角色後就能使用', textStyle(12, COLORS.dim, false)).setOrigin(1, 0.5));
    const ids = Object.keys(CHARACTERS) as CharId[];
    ids.forEach((id, i) => {
      const x = W / 2 + (i - (ids.length - 1) / 2) * 130;
      const y = top + 296;
      const owned = s.chars.includes(id);
      const av = drawAvatar(scene, x, y, 96, id, FRAMES[0], !owned);
      layer.add(av);
      if (id === curA) layer.add(scene.add.circle(x, y, 52).setStrokeStyle(3, 0x5dff7a));
      layer.add(scene.add.text(x, y + 56, owned ? CHARACTERS[id].name.split('・')[1] ?? CHARACTERS[id].name : '未解鎖', textStyle(13, owned ? '#ffffff' : '#5a5678', false)).setOrigin(0.5, 0));
      if (owned)
        av.setInteractive({ useHandCursor: true }).on('pointerup', () => {
          const sv = loadSave();
          sv.avatar = id;
          writeSave(sv);
          Audio.play('sfx-click', 0.4);
          onChange();
          draw();
        });
    });

    layer.add(scene.add.text(46, top + 400, '頭像框', textStyle(18, '#3df5ff')).setOrigin(0, 0.5));
    FRAMES.forEach((f, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = W / 2 + (col - 1) * 150;
      const y = top + 474 + row * 132;
      const ok = f.unlocked(s);
      const av = drawAvatar(scene, x, y, 84, curA, f, !ok);
      if (!ok) av.setAlpha(0.6);
      layer.add(av);
      if (f.id === curF.id) layer.add(scene.add.circle(x, y, 47).setStrokeStyle(3, 0x5dff7a));
      layer.add(scene.add.text(x, y + 48, f.name, textStyle(13, ok ? '#ffffff' : '#8a86a8', false)).setOrigin(0.5, 0));
      layer.add(scene.add.text(x, y + 66, ok ? (f.id === curF.id ? '使用中' : '') : f.how, textStyle(11, ok ? '#5dff7a' : f.event ? '#ff9ad0' : COLORS.dim, false)).setOrigin(0.5, 0));
      if (ok)
        av.setInteractive({ useHandCursor: true }).on('pointerup', () => {
          const sv = loadSave();
          sv.avatarFrame = f.id;
          writeSave(sv);
          Audio.play('sfx-click', 0.4);
          onChange();
          draw();
        });
    });
    layer.add(makeButton(scene, W / 2, top + 744, 220, 58, '關閉', COLORS.cyan, () => layer.destroy(), 20));
  };
  draw();
  layer.setAlpha(0);
  scene.tweens.add({ targets: layer, alpha: 1, duration: 160 });
  return layer;
}
