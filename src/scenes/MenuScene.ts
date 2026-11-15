import Phaser from 'phaser';
import { T } from '../i18n/zh-TW';
import { COLORS, H, W, textStyle } from '../game/layout';
import { makeButton, setupLogicalCamera } from '../game/ui';
import { formatTime, loadSave } from '../game/storage';
import { TEX } from '../game/textures';

export class MenuScene extends Phaser.Scene {
  private bg!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Menu');
  }

  create() {
    setupLogicalCamera(this);
    this.bg = this.add.graphics();

    const cy = H * 0.3;
    const title = this.add.text(W / 2, cy, T.title, textStyle(58, '#ffffff')).setOrigin(0.5);
    title.setStroke('#ff3d81', 3);
    title.setShadow(0, 0, '#3df5ff', 18, true, true);
    this.add.text(W / 2, cy + 54, T.subtitle, textStyle(26, '#3df5ff')).setOrigin(0.5);
    this.add.text(W / 2, cy + 92, T.mvpTag, textStyle(14, COLORS.dim, false)).setOrigin(0.5);

    const hero = this.add.image(W / 2, H * 0.53, 'player').setScale(2.2 / TEX);
    this.tweens.add({ targets: hero, y: hero.y - 8, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.InOut' });
    const ring = this.add.image(W / 2, H * 0.53, 'ring').setScale(0.9 / TEX).setTint(COLORS.magenta).setAlpha(0.5);
    this.tweens.add({ targets: ring, scale: 1.1 / TEX, alpha: 0.15, yoyo: true, repeat: -1, duration: 1400 });

    makeButton(this, W / 2, H * 0.68, 320, 78, T.start, COLORS.cyan, () => this.scene.start('Game'), 30);

    this.add
      .text(W / 2, H * 0.68 + 80, T.howTo, { ...textStyle(17, '#c9c6e0', false), align: 'center', lineSpacing: 6 })
      .setOrigin(0.5, 0);
    this.add.text(W / 2, H * 0.68 + 150, T.intentHint, textStyle(15, '#ff7ab0', false)).setOrigin(0.5, 0);

    const save = loadSave();
    this.add
      .text(W / 2, H - 46, save.runs > 0 ? T.best(formatTime(save.bestTime), save.bestKills) : T.noBest, textStyle(15, COLORS.dim, false))
      .setOrigin(0.5);

    this.input.keyboard?.once('keydown-ENTER', () => this.scene.start('Game'));
    this.input.keyboard?.once('keydown-SPACE', () => this.scene.start('Game'));
  }

  update(time: number) {
    // 緩慢捲動的霓虹格線
    const g = this.bg;
    g.clear();
    const off = (time / 40) % 64;
    g.lineStyle(1, COLORS.grid, 1);
    for (let x = 0; x <= W; x += 64) g.lineBetween(x, 0, x, H);
    for (let y = -64 + off; y <= H; y += 64) g.lineBetween(0, y, W, y);
    g.fillStyle(COLORS.magenta, 0.05);
    g.fillRect(0, H * 0.3 - 60, W, 120);
  }
}
