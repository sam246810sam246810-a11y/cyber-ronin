import Phaser from 'phaser';
import { T } from '../i18n/zh-TW';
import { CHARACTERS } from '../config/balance';
import { COLORS, H, W, textStyle } from '../game/layout';
import { Button, makeButton, menuBackground, setupLogicalCamera } from '../game/ui';
import { formatTime, loadSave, writeSave } from '../game/storage';
import { claimableCount } from '../game/meta';
import { Audio } from '../game/audio';
import { setVibrate, vibrate, vibrateEnabled } from '../game/haptics';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    setupLogicalCamera(this);
    menuBackground(this);
    Audio.playMusic('bgm-menu');
    const save = loadSave();

    const cy = H * 0.15;
    const title = this.add.text(W / 2, cy, T.title, textStyle(56, '#ffffff')).setOrigin(0.5);
    title.setStroke('#ff3d81', 3);
    title.setShadow(0, 0, '#3df5ff', 18, true, true);
    this.add.text(W / 2, cy + 52, T.subtitle, textStyle(26, '#3df5ff')).setOrigin(0.5);
    this.add.text(W / 2, cy + 88, T.alphaTag, textStyle(14, COLORS.dim, false)).setOrigin(0.5);

    // 上次使用的角色
    const char = CHARACTERS[save.lastChar] ?? CHARACTERS.jin;
    const heroY = H * 0.38;
    const glow = this.add.ellipse(W / 2, heroY + 70, 180, 40, COLORS.cyan, 0.15);
    let hero: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
    if (this.anims.exists(`char-${char.id}-idle`)) {
      // 主選單上的角色播放待機動畫
      hero = this.add.sprite(W / 2, heroY + 80, `char-${char.id}-idle-0`).setOrigin(0.5, 0.9).setScale(1.9);
      (hero as Phaser.GameObjects.Sprite).play(`char-${char.id}-idle`);
    } else {
      const portraitKey = this.textures.exists(`portrait-${char.id}`) ? `portrait-${char.id}` : `char-${char.id}`;
      hero = this.add.image(W / 2, heroY, portraitKey).setDisplaySize(190, 190);
    }
    this.tweens.add({ targets: hero, y: hero.y - 6, yoyo: true, repeat: -1, duration: 1600, ease: 'Sine.InOut' });
    this.tweens.add({ targets: glow, alpha: 0.05, yoyo: true, repeat: -1, duration: 1600 });

    const by = H * 0.62;
    makeButton(this, W / 2, by, 320, 76, T.sortie, COLORS.cyan, () => this.scene.start('CharSelect'), 30);
    const bw = 150;
    makeButton(this, W / 2 - 160, by + 92, bw, 58, T.shop, COLORS.gold, () => this.scene.start('Shop'), 21);
    makeButton(this, W / 2, by + 92, bw, 58, '義體', COLORS.cyan, () => this.scene.start('Armory'), 21);
    makeButton(this, W / 2 + 160, by + 92, bw, 58, '抽卡', COLORS.magenta, () => this.scene.start('Gacha'), 21);
    makeButton(this, W / 2 - 80, by + 164, bw, 58, '任務', 0x5dff7a, () => this.scene.start('Missions'), 21);
    makeButton(this, W / 2 + 80, by + 164, bw, 58, T.codex, COLORS.violet, () => this.scene.start('Codex'), 21);
    const n = claimableCount(save);
    writeSave(save);
    if (n > 0) {
      const dot = this.add.circle(W / 2 - 80 + bw / 2 - 6, by + 164 - 26, 13, 0xff2244);
      this.add.text(dot.x, dot.y, String(n), textStyle(13)).setOrigin(0.5);
    }
    this.add.text(16, 26, `晶片 ${save.chips ?? 0}`, textStyle(16, '#7fd4ff')).setOrigin(0, 0.5);

    this.add.text(W / 2, by + 214, T.howTo, { ...textStyle(14, '#c9c6e0', false), align: 'center', lineSpacing: 4 }).setOrigin(0.5, 0);

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
    const vibBtn = makeButton(this, W - 256, H - 26, 96, 36, '', COLORS.cyan, () => {
      setVibrate(!vibrateEnabled());
      vibBtn.setLabel(vibrateEnabled() ? '震動 開' : '震動 關').setActive2(vibrateEnabled());
      if (vibrateEnabled()) vibrate(40);
    }, 14);
    vibBtn.setLabel(vibrateEnabled() ? '震動 開' : '震動 關').setActive2(vibrateEnabled());
    refresh();

    this.input.keyboard?.once('keydown-ENTER', () => this.scene.start('CharSelect'));
  }
}
