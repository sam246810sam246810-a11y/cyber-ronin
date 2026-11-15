import Phaser from 'phaser';
import { createTextures } from '../game/textures';
import { buildAnims, loadAudio, loadSprites } from '../game/assets';
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
    buildAnims(this);
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
