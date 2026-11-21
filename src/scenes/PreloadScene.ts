import Phaser from 'phaser';
import { generateSprites } from './sprites';
import ANIMS from '../data/anims.json';

/**
 * 第一階段：所有圖都用 Graphics 動態產生的幾何佔位圖。
 * 第二階段接 Higgsfield 美術時，在 preload() 用 this.load.image() 載入同名 key 即可替換。
 */
export const ART_SPRITES = [
  'cat_apprentice', 'cat_frost_archer', 'cat_lava_knight', 'cat_storm_sage', 'cat_gray', 'cat_merchant',
  'mouse', 'mouse_dart', 'mouse_bomb', 'mouse_armor', 'mouse_thief', 'frog', 'yarn', 'clock_ghost',
  'rat_king', 'snail', 'doctor_rat',
  'big_cauldron', 'shelf', 'bookshelf', 'dummy',
  'ing_J', 'ing_I', 'ing_S', 'ing_F', 'ing_T', 'coin', 'heart', 'flask', 'relic',
  'chest', 'stairs', 'box', 'fountain', 'merchant', 'altar', 'teaser', 'flower', 'mushroom', 'portal', 'proj_orb',
  'wpn_single', 'wpn_spread', 'wpn_melee', 'wpn_boomerang', 'wpn_lance', 'wpn_mortar', 'wpn_chain', 'wpn_orb',
];
const ART_UI = [
  'door_open', 'door_locked', 'ui_joy_base', 'ui_joy_knob', 'ui_btn', 'ui_ic_dash', 'ui_ic_skill', 'ui_ic_brew', 'ui_ic_swap',
  'ui_pause', 'ui_slot', 'ui_panel', 'ui_card', 'ui_dialog',
  'ui_hud_plaque', 'ui_nameplate', 'ui_title_banner', 'ui_minimap', 'ui_boss_frame', 'ui_notice', 'ui_gold_btn', 'ui_tile', 'logo',
  'ter_grass', 'ter_burning', 'ter_toxic', 'ter_water', 'ter_frozen', 'ter_electric', 'ter_oil', 'ter_sun',
  'proj_dart', 'proj_bomb', 'proj_spore',
  // 高細節手繪角色（綠幕去背，tools/sprite_pipeline.py）
  'hd_cat_apprentice', 'hd_mouse',
];
/** 選單畫面背景（jpg） */
const ART_BGS = ['bg_menu', 'bg_meta', 'bg_relic', 'bg_codex', 'bg_win', 'bg_lose'];
/** 會循環播放的特效（其他特效播一次就消失） */
const LOOP_VFX = new Set(['vfx_poison', 'vfx_lava', 'vfx_petal', 'vfx_lavabomb', 'vfx_flask', 'vfx_clock']);
const ART_ROOMS = ['room_courtyard', 'room_greenhouse', 'room_lava', 'room_storm', 'room_lobby'];
const ART_FLOORS = ['floor_greenhouse', 'floor_lava', 'floor_storm', 'floor_lobby'];

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    // 精緻像素風美術（public/art）。載入失敗就沿用下面的程式繪製佔位圖。
    for (const k of ART_SPRITES) this.load.image(k, `art/${k}.png`);
    for (const k of ART_FLOORS) this.load.image(k, `art/${k}.jpg`);
    for (const k of ART_ROOMS) this.load.image(k, `art/${k}.jpg`);
    for (const k of ART_UI) this.load.image(k, `art/${k}.png`);
    for (const k of ART_BGS) this.load.image(k, `art/${k}.jpg`);
    // 圖示圖集：聖物、突變卡、坩堝升級、神話藥水、小地圖房間（frame 名稱見 icons.json）
    this.load.atlas('icons', 'art/icons.png', 'art/icons.json');
    // 動畫：Higgsfield 產生的 GIF 轉成橫向 spritesheet
    for (const [k, a] of Object.entries(ANIMS)) {
      this.load.spritesheet(k, `art/anim/${k}.png`, { frameWidth: a.fw, frameHeight: a.fh });
    }
    this.load.on('loaderror', (f: Phaser.Loader.File) => console.warn('art missing', f.key));
  }

  create(): void {
    for (const [k, a] of Object.entries(ANIMS)) {
      if (!this.textures.exists(k) || this.anims.exists(k)) continue;
      this.anims.create({
        key: k,
        frames: this.anims.generateFrameNumbers(k, { start: 0, end: a.frames - 1 }),
        frameRate: 1000 / a.ms,
        repeat: k.startsWith('run_') || LOOP_VFX.has(k) ? -1 : 0,
      });
    }
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const gen = (key: string, w: number, h: number, draw: () => void) => {
      if (this.textures.exists(key)) return;
      g.clear();
      draw();
      g.generateTexture(key, w, h);
    };

    gen('circle', 64, 64, () => g.fillStyle(0xffffff).fillCircle(32, 32, 32));
    gen('ring', 64, 64, () => g.lineStyle(5, 0xffffff).strokeCircle(32, 32, 29));
    gen('square', 16, 16, () => g.fillStyle(0xffffff).fillRect(0, 0, 16, 16));
    gen('triangle', 64, 64, () => g.fillStyle(0xffffff).fillTriangle(32, 2, 62, 60, 2, 60));
    gen('shadow', 64, 24, () => g.fillStyle(0x000000).fillEllipse(32, 12, 64, 24));
    gen('thorn', 16, 32, () => g.fillStyle(0xffffff).fillTriangle(8, 0, 16, 32, 0, 32));
    gen('flower', 64, 64, () => {
      g.fillStyle(0xffffff);
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6;
        g.fillCircle(32 + Math.cos(a) * 18, 32 + Math.sin(a) * 18, 13);
      }
      g.fillStyle(0xdddddd).fillCircle(32, 32, 14);
    });
    gen('mushroom', 64, 64, () => {
      g.fillStyle(0xeeeeee).fillRect(22, 30, 20, 30);
      g.fillStyle(0xffffff).fillEllipse(32, 26, 64, 44);
      g.fillStyle(0xbbbbbb).fillCircle(20, 20, 5).fillCircle(42, 16, 6).fillCircle(36, 32, 4);
    });
    gen('flask', 52, 64, () => {
      g.fillStyle(0xffffff).fillCircle(26, 40, 22);
      g.fillRect(19, 6, 14, 22);
      g.fillStyle(0xcccccc).fillRect(16, 2, 20, 7);
      g.fillStyle(0xffffff, 0.6).fillCircle(18, 34, 6);
    });
    gen('heart', 64, 60, () => {
      g.fillStyle(0xff4d6d).fillCircle(18, 20, 17).fillCircle(46, 20, 17);
      g.fillTriangle(2, 26, 62, 26, 32, 58);
    });
    gen('slot', 80, 80, () => {
      g.fillStyle(0x000000, 0.45).fillRoundedRect(2, 2, 76, 76, 14);
      g.lineStyle(4, 0xffffff, 0.8).strokeRoundedRect(2, 2, 76, 76, 14);
    });
    gen('cauldron', 290, 100, () => {
      g.fillStyle(0xffffff, 0.35).fillRoundedRect(4, 10, 282, 86, 36);
      g.lineStyle(4, 0xffffff, 0.6).strokeRoundedRect(4, 10, 282, 86, 36);
    });
    // 藥材圖示（直接上色，不使用 tint）
    gen('ing_J', 64, 64, () => {
      g.fillStyle(0xff7eb6).fillCircle(32, 36, 24);
      g.fillStyle(0xffb3d4).fillCircle(24, 28, 8);
      g.lineStyle(3, 0x9a2f6e).strokeCircle(32, 36, 24);
    });
    gen('ing_I', 64, 64, () => {
      g.fillStyle(0x7ed4ff).fillPoints([
        new Phaser.Math.Vector2(32, 2), new Phaser.Math.Vector2(54, 32),
        new Phaser.Math.Vector2(32, 62), new Phaser.Math.Vector2(10, 32),
      ], true);
      g.fillStyle(0xd6f3ff).fillTriangle(32, 8, 44, 32, 32, 32);
      g.lineStyle(3, 0x2a6a9a).strokePoints([
        new Phaser.Math.Vector2(32, 2), new Phaser.Math.Vector2(54, 32),
        new Phaser.Math.Vector2(32, 62), new Phaser.Math.Vector2(10, 32),
      ], true);
    });
    gen('ing_S', 64, 64, () => {
      g.fillStyle(0x7eff8a).fillCircle(32, 32, 22);
      g.fillStyle(0x3a9a46).fillCircle(24, 26, 5).fillCircle(40, 30, 6).fillCircle(30, 42, 4);
      g.fillStyle(0x7eff8a).fillCircle(12, 14, 6).fillCircle(54, 50, 5).fillCircle(52, 12, 4);
    });
    gen('ing_F', 64, 64, () => {
      g.fillStyle(0xff8a3d);
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        g.fillCircle(32 + Math.cos(a) * 14, 32 + Math.sin(a) * 14, 12);
      }
      g.fillStyle(0xffd166).fillCircle(32, 32, 9);
      g.fillStyle(0xff4d1a).fillTriangle(32, 2, 40, 18, 24, 18);
    });
    gen('ing_T', 64, 64, () => {
      g.fillStyle(0xfff4c2).fillRect(26, 32, 12, 26);
      g.fillStyle(0xffe14d).fillEllipse(32, 28, 58, 34);
      g.fillStyle(0x6a4a00).fillTriangle(34, 14, 24, 32, 32, 32);
      g.fillTriangle(30, 30, 40, 30, 28, 46);
    });
    gen('snail', 64, 64, () => {
      g.fillStyle(0xffffff).fillEllipse(30, 46, 60, 26);
      g.fillStyle(0xdddddd).fillCircle(36, 30, 22);
      g.lineStyle(4, 0x999999).strokeCircle(36, 30, 13);
      g.fillStyle(0xffffff).fillRect(6, 22, 5, 18).fillRect(14, 20, 5, 20);
    });
    gen('slime', 64, 64, () => {
      g.fillStyle(0xffffff).fillEllipse(32, 40, 60, 44);
      g.fillStyle(0xdddddd).fillCircle(22, 34, 5).fillCircle(42, 34, 5);
    });
    gen('beetle', 64, 64, () => {
      g.fillStyle(0xffffff).fillEllipse(32, 34, 50, 58);
      g.lineStyle(3, 0x888888).lineBetween(32, 8, 32, 62);
      g.fillStyle(0xcccccc).fillCircle(32, 8, 9);
    });
    gen('bomb', 64, 64, () => {
      g.fillStyle(0xffffff).fillCircle(32, 36, 26);
      g.fillStyle(0xffd166).fillTriangle(30, 2, 38, 12, 26, 12);
      g.fillStyle(0xaaaaaa).fillRect(28, 8, 8, 6);
    });
    gen('wisp', 64, 64, () => {
      g.fillStyle(0xffffff).fillCircle(32, 28, 20);
      g.fillTriangle(12, 30, 52, 30, 32, 64);
      g.fillStyle(0x777777).fillCircle(25, 26, 4).fillCircle(39, 26, 4);
    });
    gen('chest', 64, 64, () => {
      g.fillStyle(0x8a5a2a).fillRect(6, 24, 52, 34);
      g.fillStyle(0xa86a32).fillRoundedRect(6, 10, 52, 20, 8);
      g.fillStyle(0xffd166).fillRect(6, 26, 52, 5).fillRect(28, 20, 8, 16);
    });
    gen('fountain', 64, 64, () => {
      g.fillStyle(0x8aa0b8).fillEllipse(32, 50, 60, 22);
      g.fillStyle(0x7ed4ff).fillEllipse(32, 46, 48, 14);
      g.fillStyle(0xb8d8f0).fillRect(28, 14, 8, 32);
      g.fillStyle(0x7ed4ff).fillCircle(32, 12, 9);
    });
    gen('merchant', 64, 64, () => {
      g.fillStyle(0x6a4a9a).fillTriangle(32, 4, 56, 60, 8, 60);
      g.fillStyle(0xf4d8b0).fillCircle(32, 26, 10);
      g.fillStyle(0xffd166).fillCircle(46, 48, 8);
    });
    gen('altar', 64, 64, () => {
      g.fillStyle(0x5a4a6a).fillRect(10, 40, 44, 20);
      g.fillStyle(0x7a6a8a).fillRect(18, 20, 28, 22);
      g.fillStyle(0xb36bff).fillCircle(32, 14, 10);
    });
    gen('stairs', 64, 64, () => {
      g.fillStyle(0x1a1420).fillRoundedRect(4, 4, 56, 56, 10);
      for (let i = 0; i < 4; i++) g.fillStyle(0xffd166, 0.4 + i * 0.15).fillRect(10 + i * 6, 14 + i * 11, 44 - i * 12, 8);
      g.lineStyle(3, 0xffd166).strokeRoundedRect(4, 4, 56, 56, 10);
    });
    gen('coin', 32, 32, () => {
      g.fillStyle(0xffc43d).fillCircle(16, 16, 14);
      g.fillStyle(0xffe58a).fillCircle(13, 13, 6);
      g.lineStyle(2, 0xb07a10).strokeCircle(16, 16, 14);
    });
    gen('leaf', 32, 32, () => {
      g.fillStyle(0xffffff).fillEllipse(16, 16, 30, 14);
      g.fillStyle(0xbbbbbb).fillRect(4, 15, 24, 2);
    });
    // 武器圖示（白色，依稀有度上色）
    gen('wpn_single', 64, 64, () => {
      g.lineStyle(7, 0xffffff).lineBetween(32, 60, 32, 34).lineBetween(32, 34, 14, 10).lineBetween(32, 34, 50, 10);
      g.lineStyle(2, 0xcccccc).lineBetween(14, 10, 50, 10);
    });
    gen('wpn_spread', 64, 64, () => {
      g.fillStyle(0xffffff);
      for (let i = -2; i <= 2; i++) g.fillTriangle(32, 58, 32 + i * 12 - 4, 8, 32 + i * 12 + 4, 8);
    });
    gen('wpn_melee', 64, 64, () => {
      g.lineStyle(6, 0xffffff);
      g.beginPath();
      g.arc(32, 40, 24, Math.PI, Math.PI * 1.9, false);
      g.strokePath();
      g.fillStyle(0xffffff).fillRect(4, 38, 10, 22);
    });
    gen('wpn_boomerang', 64, 64, () => {
      g.fillStyle(0xffffff).fillEllipse(22, 32, 16, 52).fillEllipse(42, 32, 16, 52);
      g.fillStyle(0xbbbbbb).fillCircle(32, 32, 7);
    });
    gen('wpn_lance', 64, 64, () => {
      g.fillStyle(0xffffff).fillRect(29, 18, 6, 44).fillTriangle(32, 0, 42, 20, 22, 20);
    });
    gen('wpn_mortar', 64, 64, () => {
      g.fillStyle(0xffffff).fillRect(20, 14, 22, 36).fillRoundedRect(10, 46, 44, 14, 6);
      g.fillStyle(0xbbbbbb).fillCircle(31, 12, 9);
    });
    gen('wpn_chain', 64, 64, () => {
      g.fillStyle(0xffffff).fillRect(29, 20, 6, 42);
      g.fillPoints([
        new Phaser.Math.Vector2(36, 0), new Phaser.Math.Vector2(22, 18), new Phaser.Math.Vector2(32, 18),
        new Phaser.Math.Vector2(26, 30), new Phaser.Math.Vector2(44, 12), new Phaser.Math.Vector2(34, 12),
      ], true);
    });
    gen('wpn_orb', 64, 64, () => {
      g.fillStyle(0xffffff);
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8;
        g.fillTriangle(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30, 32 + Math.cos(a + 0.3) * 16, 32 + Math.sin(a + 0.3) * 16,
          32 + Math.cos(a - 0.3) * 16, 32 + Math.sin(a - 0.3) * 16);
      }
      g.fillCircle(32, 32, 16);
    });
    gen('relic', 64, 64, () => {
      g.fillStyle(0xffffff).fillPoints([
        new Phaser.Math.Vector2(32, 2), new Phaser.Math.Vector2(60, 24), new Phaser.Math.Vector2(48, 62),
        new Phaser.Math.Vector2(16, 62), new Phaser.Math.Vector2(4, 24),
      ], true);
      g.fillStyle(0x000000, 0.35).fillCircle(32, 34, 18);
    });
    gen('dummy', 64, 64, () => {
      g.fillStyle(0x8a6a4a).fillRect(28, 30, 8, 34);
      g.fillStyle(0xd8b890).fillCircle(32, 22, 18);
      g.fillStyle(0xffffff).fillCircle(32, 22, 11);
      g.fillStyle(0xff4d4d).fillCircle(32, 22, 6);
      g.fillStyle(0xc8a070).fillRect(10, 36, 44, 7);
    });
    gen('bookshelf', 96, 96, () => {
      g.fillStyle(0x6a4a2a).fillRect(4, 4, 88, 88);
      g.fillStyle(0x3a2a1a).fillRect(10, 10, 76, 22).fillRect(10, 38, 76, 22).fillRect(10, 66, 76, 22);
      const cs = [0xff7eb6, 0x7ed4ff, 0x7eff8a, 0xff8a3d, 0xffe14d, 0xc9a3ff];
      for (let r = 0; r < 3; r++) for (let i = 0; i < 8; i++) g.fillStyle(cs[(i + r) % 6]).fillRect(12 + i * 9, 12 + r * 28, 7, 18);
    });
    gen('shelf', 96, 96, () => {
      g.fillStyle(0x7a5530).fillRect(4, 20, 88, 72);
      g.fillStyle(0x3a2a1a).fillRect(10, 26, 76, 26).fillRect(10, 58, 76, 28);
      g.fillStyle(0xffd166).fillCircle(26, 40, 8).fillCircle(70, 72, 8);
      g.fillStyle(0xb36bff).fillCircle(48, 40, 8);
      g.fillStyle(0x4da3ff).fillCircle(48, 72, 8);
      g.fillStyle(0x9a6a3a).fillTriangle(0, 22, 96, 22, 48, 0);
    });
    // 角色佔位圖（白色可上色）
    gen('hero', 64, 64, () => {
      g.fillStyle(0xffffff).fillCircle(32, 36, 24);
      g.fillTriangle(10, 22, 54, 22, 32, -6);
      g.fillStyle(0xcccccc).fillRect(8, 20, 48, 6);
    });
    g.destroy();
    generateSprites(this);

    // 戰場暈邊
    if (!this.textures.exists('vignette')) {
      const tex = this.textures.createCanvas('vignette', 512, 256);
      if (tex) {
        const ctx = tex.getContext();
        const grad = ctx.createRadialGradient(256, 128, 60, 256, 128, 300);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.55, 'rgba(0,0,0,0.05)');
        grad.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 512, 256);
        tex.refresh();
      }
    }
    // 黑暗詛咒：中間透明、外圍漸黑的視野遮罩
    if (!this.textures.exists('darkness')) {
      const tex = this.textures.createCanvas('darkness', 512, 512);
      if (tex) {
        const ctx = tex.getContext();
        const grad = ctx.createRadialGradient(256, 256, 30, 256, 256, 256);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.07, 'rgba(0,0,0,0.1)');
        grad.addColorStop(0.14, 'rgba(0,0,0,0.93)');
        grad.addColorStop(1, 'rgba(0,0,0,0.96)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 512, 512);
        tex.refresh();
      }
    }

    this.scene.start('MainMenu');
  }
}
