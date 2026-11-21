import Phaser from 'phaser';
import { COLORS, FONT, GAME_H, GAME_W } from '../config';
import { CodexStore } from '../systems/CodexStore';
import { textButton } from '../ui/widgets';

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('MainMenu');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);

    // 背景漂浮孢子
    for (let i = 0; i < 24; i++) {
      const colors = [0xff7eb6, 0x7ed4ff, 0x7eff8a, 0xff8a3d, 0xffe14d];
      const dot = this.add.image(Math.random() * GAME_W, Math.random() * GAME_H, 'circle')
        .setTint(colors[i % 5]).setAlpha(0.25).setDisplaySize(10 + Math.random() * 16, 10 + Math.random() * 16);
      this.tweens.add({
        targets: dot, y: dot.y - 120 - Math.random() * 100, alpha: 0.05,
        duration: 3000 + Math.random() * 3000, yoyo: true, repeat: -1, ease: 'Sine.InOut',
      });
    }

    this.add.image(GAME_W / 2, 400, 'cauldron').setDisplaySize(360, 130).setTint(0xc9a3ff).setAlpha(0.6);
    ['ing_J', 'ing_I', 'ing_S', 'ing_F', 'ing_T'].forEach((k, i) => {
      const img = this.add.image(GAME_W / 2 - 140 + i * 70, 330, k).setDisplaySize(56, 56);
      this.tweens.add({ targets: img, y: 310, duration: 900 + i * 150, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    });

    this.add.text(GAME_W / 2, 200, '坩堝花園', {
      fontFamily: FONT, fontSize: '84px', color: '#ffffff', fontStyle: 'bold', stroke: '#4a2a6a', strokeThickness: 10,
    }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 520, '撿藥材 → 湊滿三格 → 煉成喝下 → 越喝越強！', {
      fontFamily: FONT, fontSize: '26px', color: COLORS.textDim,
    }).setOrigin(0.5);

    textButton(this, GAME_W / 2, 700, 420, 110, '開始遊戲', () => this.scene.start('CharacterSelect'), 0x7a4fc0);
    textButton(this, GAME_W / 2, 850, 420, 90, `配方圖鑑  ${CodexStore.count}/${CodexStore.total}`,
      () => this.scene.start('Codex', { returnTo: 'MainMenu' }));

    this.add.text(GAME_W / 2, 1060, '左下：搖桿移動　右下：衝刺 / 煉成\n鍵盤：WASD 移動　空白鍵 衝刺　J 或 K 煉成', {
      fontFamily: FONT, fontSize: '20px', color: COLORS.textDim, align: 'center', lineSpacing: 10,
    }).setOrigin(0.5);
    this.add.text(GAME_W / 2, GAME_H - 40, 'v0.3 稀有度＋角色版', {
      fontFamily: FONT, fontSize: '16px', color: '#4a4458',
    }).setOrigin(0.5);
  }
}
