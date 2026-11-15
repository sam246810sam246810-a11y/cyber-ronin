import Phaser from 'phaser';
import { T } from '../i18n/zh-TW';
import { CHARACTERS } from '../config/balance';
import { COLORS, H, W, textStyle } from '../game/layout';
import { Button, makeButton, menuBackground, setupLogicalCamera } from '../game/ui';
import { formatTime, loadSave } from '../game/storage';
import { Audio } from '../game/audio';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    setupLogicalCamera(this);
    menuBackground(this);
    Audio.playMusic('bgm-menu');
    const save = loadSave();

    const cy = H * 0.17;
    const title = this.add.text(W / 2, cy, T.title, textStyle(56, '#ffffff')).setOrigin(0.5);
    title.setStroke('#ff3d81', 3);
    title.setShadow(0, 0, '#3df5ff', 18, true, true);
    this.add.text(W / 2, cy + 52, T.subtitle, textStyle(26, '#3df5ff')).setOrigin(0.5);
    this.add.text(W / 2, cy + 88, T.alphaTag, textStyle(14, COLORS.dim, false)).setOrigin(0.5);

    // 上次使用的角色
    const char = CHARACTERS[save.lastChar] ?? CHARACTERS.jin;
    const heroY = H * 0.43;
    const glow = this.add.ellipse(W / 2, heroY + 70, 180, 40, COLORS.cyan, 0.15);
    const portraitKey = this.textures.exists(`portrait-${char.id}`) ? `portrait-${char.id}` : `char-${char.id}`;
    const hero = this.add.image(W / 2, heroY, portraitKey).setDisplaySize(190, 190);
    this.tweens.add({ targets: hero, y: heroY - 8, yoyo: true, repeat: -1, duration: 1600, ease: 'Sine.InOut' });
    this.tweens.add({ targets: glow, alpha: 0.05, yoyo: true, repeat: -1, duration: 1600 });

    const by = H * 0.64;
    makeButton(this, W / 2, by, 320, 76, T.sortie, COLORS.cyan, () => this.scene.start('CharSelect'), 30);
    makeButton(this, W / 2 - 82, by + 96, 156, 60, T.shop, COLORS.gold, () => this.scene.start('Shop'), 22);
    makeButton(this, W / 2 + 82, by + 96, 156, 60, T.codex, COLORS.violet, () => this.scene.start('Codex'), 22);

    this.add.text(W / 2, by + 150, T.howTo, { ...textStyle(15, '#c9c6e0', false), align: 'center', lineSpacing: 5 }).setOrigin(0.5, 0);

    this.add.text(16, H - 24, save.runs > 0 ? T.best(formatTime(save.bestTime), save.bestKills) : T.noBest, textStyle(13, COLORS.dim, false)).setOrigin(0, 0.5);
    this.add.text(W - 16, 26, `◆ ${save.credits}`, textStyle(18, '#ffd84d')).setOrigin(1, 0.5);

    // 音樂／音效開關
    let musicBtn: Button;
    let sfxBtn: Button;
    const refresh = () => {
      musicBtn.setLabel(Audio.musicOn ? T.musicOn : T.musicOff).setActive2(Audio.musicOn);
      sfxBtn.setLabel(Audio.sfxOn ? T.sfxOn : T.sfxOff).setActive2(Audio.sfxOn);
    };
    musicBtn = makeButton(this, W - 156, H - 26, 96, 36, '', COLORS.cyan, () => {
      Audio.setMusic(!Audio.musicOn);
      if (Audio.musicOn) Audio.playMusic('bgm-menu');
      refresh();
    }, 14);
    sfxBtn = makeButton(this, W - 56, H - 26, 96, 36, '', COLORS.cyan, () => {
      Audio.setSfx(!Audio.sfxOn);
      refresh();
    }, 14);
    refresh();

    this.input.keyboard?.once('keydown-ENTER', () => this.scene.start('CharSelect'));
  }
}
