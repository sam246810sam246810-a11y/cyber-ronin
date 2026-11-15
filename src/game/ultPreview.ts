// 試看大招：在抽卡畫面播放角色特寫切入＋大招特效（不影響遊戲）。
import Phaser from 'phaser';
import { H, W, textStyle } from './layout';
import { ULTIMATES } from '../config/expansion';
import type { CharId } from '../config/balance';
import { ULT_FX, useLazy } from './assets';

export function playUltPreview(scene: Phaser.Scene, id: CharId, onDone?: () => void) {
  const u = ULTIMATES[id];
  const layer = scene.add.container(0, 0).setDepth(300);
  const dim = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.85).setInteractive();
  layer.add(dim);
  // 斜切橫幅特寫
  const band = scene.add.container(-W * 1.3, H * 0.42).setRotation(-0.2);
  const bh = 230;
  const bg = scene.add.graphics();
  bg.fillStyle(0x07060d, 0.95).fillRect(-W * 1.2, -bh / 2, W * 2.4, bh);
  bg.fillStyle(u.color, 0.55).fillRect(-W * 1.2, -bh / 2, W * 2.4, bh * 0.18).fillRect(-W * 1.2, bh / 2 - bh * 0.18, W * 2.4, bh * 0.18);
  bg.lineStyle(u.ssr ? 8 : 4, u.ssr ? 0xffd84d : 0xffffff, 0.95).lineBetween(-W * 1.2, -bh / 2, W * 1.2, -bh / 2).lineBetween(-W * 1.2, bh / 2, W * 1.2, bh / 2);
  band.add(bg);
  const key = scene.textures.exists(`hd-${id}`) ? `hd-${id}` : `char-${id}`;
  const face = scene.add.image(W * 0.12, 30, key).setOrigin(0.5, 0.32);
  const fs = face.texture.getSourceImage();
  face.setScale((bh * 2.6) / fs.height);
  face.setCrop(0, 0, fs.width, fs.height * 0.55);
  band.add(face);
  const name = scene.add.text(-W * 0.22, bh * 0.18, u.name, textStyle(49.5, '#ffffff')).setOrigin(0.5).setStroke(u.css, 10).setScale(2.2).setAlpha(0);
  band.add(name);
  layer.add(band);
  scene.tweens.add({ targets: band, x: W / 2, duration: 160, ease: 'Cubic.Out' });
  scene.tweens.add({ targets: face, x: W * 0.2, duration: 700, ease: 'Sine.Out' });
  scene.tweens.add({ targets: name, scale: 1, alpha: 1, delay: 180, duration: 160, ease: 'Back.Out' });
  const playFx = (fx: string) => {
    const k = `fx-${fx}`;
    if (!scene.anims.exists(k)) return;
    const spr = scene.add.sprite(W / 2, H / 2, `${k}-0`).setBlendMode(Phaser.BlendModes.ADD);
    const src = spr.texture.getSourceImage();
    const base = Math.max(W / src.width, H / src.height);
    spr.setScale(base * 1.25).setAlpha(0.2);
    layer.add(spr);
    scene.tweens.add({ targets: spr, scale: base, alpha: 1, duration: 120 });
    spr.play({ key: k, frameRate: 18 });
    spr.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => spr.destroy());
  };
  const fxs = ULT_FX[id] ?? [];
  // 大招特效圖很大，試看時才載入（並釋放其他角色的）
  let ready = false;
  void useLazy(scene, fxs.map((f) => `fx-${f}`), true).then(() => (ready = true));
  const start = () => {
    if (!ready && scene.time.now - openedAt < 3000) {
      scene.time.delayedCall(100, start);
      return;
    }
    fire();
  };
  const fire = () => {
    scene.tweens.add({ targets: band, x: W * 2.3, duration: 160, ease: 'Cubic.In' });
    const flash = scene.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0.8);
    layer.add(flash);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 300 });
    scene.cameras.main.shake(260, 0.01);
    if (fxs[0]) playFx(fxs[0]);
    if (fxs[1]) scene.time.delayedCall(850, () => playFx(fxs[1]));
    scene.time.delayedCall(fxs[1] ? 2100 : 1300, close);
  };
  const openedAt = scene.time.now;
  scene.time.delayedCall(800, start);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    scene.tweens.add({ targets: layer, alpha: 0, duration: 250, onComplete: () => layer.destroy() });
    onDone?.();
  };
  dim.on('pointerup', () => {
    if (scene.time.now - openedAt > 600) close();
  });
}
