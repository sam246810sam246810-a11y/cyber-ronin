import Phaser from 'phaser';
import { createTextures } from '../game/textures';
import { loadAudio, loadSprites } from '../game/assets';
import { Audio } from '../game/audio';
import { loadFonts } from '../game/fonts';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  async create() {
    const el = document.getElementById('loading');
    const show = (p: number) => {
      if (el) el.textContent = `載入中 ${Math.round(p * 100)}%`;
    };
    Audio.init(this.game);
    try {
      await loadFonts();
    } catch (e) {
      console.warn(e);
    }
    try {
      await loadSprites(this, (p) => show(p * 0.7));
    } catch (e) {
      console.warn(e);
    }
    // 由 fx-名稱-影格 的貼圖自動建立特效動畫
    const groups = new Map<string, string[]>();
    for (const k of this.textures.getTextureKeys()) {
      const m = /^fx-(.+)-(\d+)$/.exec(k);
      if (!m) continue;
      if (!groups.has(m[1])) groups.set(m[1], []);
      groups.get(m[1])!.push(k);
    }
    for (const [name, keys] of groups) {
      keys.sort((a, b) => +a.split('-').pop()! - +b.split('-').pop()!);
      if (!this.anims.exists(`fx-${name}`)) this.anims.create({ key: `fx-${name}`, frames: keys.map((key) => ({ key })), frameRate: 24 });
    }
    try {
      createTextures(this);
    } catch (e) {
      console.warn(e);
    }
    show(0.75);
    try {
      await loadAudio(this);
    } catch (e) {
      console.warn(e);
    }
    el?.remove();
    this.scene.start('Menu');
  }
}
