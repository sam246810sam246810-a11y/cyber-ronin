import Phaser from 'phaser';
import { COLORS, FONT, GAME_H, GAME_W, RIGHT, SAFE_X, cx } from '../config';
import { isArtTexture } from '../utils';
import { CodexStore } from '../systems/CodexStore';
import { canFullscreen, textButton, toggleFullscreen } from '../ui/widgets';

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('MainMenu');
  }

  create(): void {
    // 戰鬥中螢幕尺寸改變過：回到主選單時重建畫面
    this.time.delayedCall(50, () => (window as unknown as { __checkLayout?: () => void }).__checkLayout?.());
    this.cameras.main.setBackgroundColor(COLORS.bg);
    if (isArtTexture(this, 'bg_menu') && isArtTexture(this, 'logo')) {
      this.createArt();
      return;
    }
    const colors = [0xff7eb6, 0x7ed4ff, 0x7eff8a, 0xff8a3d, 0xffe14d];
    for (let i = 0; i < 30; i++) {
      const dot = this.add.image(Math.random() * GAME_W, Math.random() * GAME_H, 'circle')
        .setTint(colors[i % 5]).setAlpha(0.22).setDisplaySize(10 + Math.random() * 16, 10 + Math.random() * 16);
      this.tweens.add({
        targets: dot, y: dot.y - 100 - Math.random() * 80, alpha: 0.05,
        duration: 3000 + Math.random() * 3000, yoyo: true, repeat: -1, ease: 'Sine.InOut',
      });
    }
    const lx = cx(400);
    this.add.text(lx, 160, '坩堝花園', {
      fontFamily: FONT, fontSize: '92px', color: '#ffffff', fontStyle: 'bold', stroke: '#4a2a6a', strokeThickness: 10,
    }).setOrigin(0.5);
    this.add.image(lx, 420, 'cauldron').setDisplaySize(380, 110).setTint(0xc9a3ff).setAlpha(0.6);
    ['ing_J', 'ing_I', 'ing_S', 'ing_F', 'ing_T'].forEach((k, i) => {
      const img = this.add.image(lx - 190 + i * 95 + (i >= 2 ? 0 : 0), 300, k).setDisplaySize(44, 44).setVisible(i !== 2);
      this.tweens.add({ targets: img, y: 286, duration: 900 + i * 150, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    });
    this.add.text(lx, 242, '～ 時空貓咪煉金術師 ～', { fontFamily: FONT, fontSize: '26px', color: '#ffd166' }).setOrigin(0.5);
    const cat = this.add.image(lx, 378, 'cat_apprentice').setDisplaySize(120, 120);
    this.tweens.add({ targets: cat, y: 368, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.add.text(lx, 500, '時鐘博士打翻了時之坩堝，時空亂成一團！\n撿素材 → 湊滿三格 → 煉成喝下 → 越喝越強，喵！', {
      fontFamily: FONT, fontSize: '21px', color: COLORS.textDim, align: 'center', lineSpacing: 8,
    }).setOrigin(0.5);

    const rx = cx(940);
    textButton(this, rx, 250, 420, 104, '進入工房', () => this.scene.start('Game', { mode: 'lobby' }), 0x7a4fc0);
    textButton(this, rx, 380, 420, 86, `配方圖鑑  ${CodexStore.count}/${CodexStore.total}`,
      () => this.scene.start('Codex', { returnTo: 'MainMenu' }));
    if (canFullscreen()) textButton(this, rx, 480, 260, 64, '⛶ 全螢幕', () => void toggleFullscreen());
    this.add.text(rx, 580, '左半邊拖曳移動　右下：衝刺 / 技能 / 煉成 / 換武器\n鍵盤：WASD 移動　空白 衝刺　K 煉成　E 技能　Q 換武器', {
      fontFamily: FONT, fontSize: '18px', color: COLORS.textDim, align: 'center', lineSpacing: 10,
    }).setOrigin(0.5);
    this.add.text(GAME_W - 20, GAME_H - 20, 'v0.9 工房大廳＋聖物版', {
      fontFamily: FONT, fontSize: '15px', color: '#4a4458',
    }).setOrigin(1, 1);
  }

  /** 主選單 A：四隻貓圍著大坩堝的夜晚工房＋Logo，按鈕在右下 */
  private createArt(): void {
    const bg = this.add.image(GAME_W / 2, GAME_H / 2, 'bg_menu');
    bg.setScale(Math.max(GAME_W / bg.width, GAME_H / bg.height));
    // 背景慢慢推近，畫面比較有生命感
    this.tweens.add({ targets: bg, scale: bg.scale * 1.04, duration: 9000, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    const logo = this.add.image(GAME_W / 2, 118, 'logo');
    logo.setScale(Math.min(560 / logo.width, 210 / logo.height));
    this.tweens.add({ targets: logo, y: 110, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    // 漂浮的光點
    for (let i = 0; i < 24; i++) {
      const dot = this.add.image(Math.random() * GAME_W, 300 + Math.random() * 400, 'proj_orb')
        .setTint([0xffd166, 0xc9a3ff, 0x7ed4ff][i % 3]).setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.5).setDisplaySize(10 + Math.random() * 14, 10 + Math.random() * 14);
      this.tweens.add({
        targets: dot, y: dot.y - 120 - Math.random() * 100, alpha: 0,
        duration: 3500 + Math.random() * 3000, repeat: -1, delay: Math.random() * 3000,
      });
    }
    const rx = RIGHT - 250;
    textButton(this, rx, 470, 380, 92, '進入工房', () => this.scene.start('Game', { mode: 'lobby' }), 0x7a4fc0);
    textButton(this, rx, 572, 380, 72, `配方圖鑑  ${CodexStore.count}/${CodexStore.total}`,
      () => this.scene.start('Codex', { returnTo: 'MainMenu' }));
    if (canFullscreen()) textButton(this, rx, 656, 240, 56, '⛶ 全螢幕', () => void toggleFullscreen());
    this.add.text(SAFE_X + 24, GAME_H - 18, '左半邊拖曳移動　右下：衝刺／技能／煉成／換武器', {
      fontFamily: FONT, fontSize: '16px', color: '#f4e6c8', stroke: '#1a0e06', strokeThickness: 4,
    }).setOrigin(0, 1);
  }
}
