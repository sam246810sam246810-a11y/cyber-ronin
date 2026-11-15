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
    // SSR 動態立繪：live-<角色>-<影格>，來回播放成循環
    const lives = new Map<string, string[]>();
    for (const k of this.textures.getTextureKeys()) {
      const m = /^live-(.+)-(\d+)$/.exec(k);
      if (!m) continue;
      if (!lives.has(m[1])) lives.set(m[1], []);
      lives.get(m[1])!.push(k);
    }
    for (const [name, keys] of lives) {
      keys.sort((a, b) => +a.split('-').pop()! - +b.split('-').pop()!);
      if (!this.anims.exists(`live-${name}`)) this.anims.create({ key: `live-${name}`, frames: keys.map((key) => ({ key })), frameRate: 8, yoyo: true, repeat: -1 });
    }
    // 角色／敵人動畫：<名稱>-<idle|run|atk|move>-<影格>
    const rates: Record<string, number> = { idle: 6, run: 12, move: 10, atk: 16 };
    const sets = new Map<string, string[]>();
    for (const k of this.textures.getTextureKeys()) {
      const m = /^(.+)-(idle|run|atk|move)-(\d+)$/.exec(k);
      if (!m) continue;
      const key = `${m[1]}-${m[2]}`;
      if (!sets.has(key)) sets.set(key, []);
      sets.get(key)!.push(k);
    }
    for (const [key, keys] of sets) {
      keys.sort((a, b) => +a.split('-').pop()! - +b.split('-').pop()!);
      const kind = key.split('-').pop()!;
      if (!this.anims.exists(key)) this.anims.create({ key, frames: keys.map((k) => ({ key: k })), frameRate: rates[kind], repeat: kind === 'atk' ? 0 : -1 });
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
