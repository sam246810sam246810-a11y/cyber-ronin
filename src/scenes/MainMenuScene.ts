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
    const colors = [0xff7eb6, 0x7ed4ff, 0x7eff8a, 0xff8a3d, 0xffe14d];
    for (let i = 0; i < 30; i++) {
      const dot = this.add.image(Math.random() * GAME_W, Math.random() * GAME_H, 'circle')
        .setTint(colors[i % 5]).setAlpha(0.22).setDisplaySize(10 + Math.random() * 16, 10 + Math.random() * 16);
      this.tweens.add({
        targets: dot, y: dot.y - 100 - Math.random() * 80, alpha: 0.05,
        duration: 3000 + Math.random() * 3000, yoyo: true, repeat: -1, ease: 'Sine.InOut',
      });
    }
    const lx = 400;
    this.add.text(lx, 160, '坩堝花園', {
      fontFamily: FONT, fontSize: '92px', color: '#ffffff', fontStyle: 'bold', stroke: '#4a2a6a', strokeThickness: 10,
    }).setOrigin(0.5);
    this.add.image(lx, 380, 'cauldron').setDisplaySize(380, 130).setTint(0xc9a3ff).setAlpha(0.6);
    ['ing_J', 'ing_I', 'ing_S', 'ing_F', 'ing_T'].forEach((k, i) => {
      const img = this.add.image(lx - 140 + i * 70, 310, k).setDisplaySize(56, 56);
      this.tweens.add({ targets: img, y: 290, duration: 900 + i * 150, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    });
    this.add.text(lx, 500, '撿素材 → 湊滿三格 → 煉成喝下 → 越喝越強！', {
      fontFamily: FONT, fontSize: '24px', color: COLORS.textDim,
    }).setOrigin(0.5);

    const rx = 940;
    textButton(this, rx, 250, 420, 104, '開始遊戲', () => this.scene.start('CharacterSelect'), 0x7a4fc0);
    textButton(this, rx, 380, 420, 86, `配方圖鑑  ${CodexStore.count}/${CodexStore.total}`,
      () => this.scene.start('Codex', { returnTo: 'MainMenu' }));
    this.add.text(rx, 520, '左半邊拖曳移動　右下：衝刺 / 技能 / 煉成 / 換武器\n鍵盤：WASD 移動　空白 衝刺　K 煉成　E 技能　Q 換武器', {
      fontFamily: FONT, fontSize: '18px', color: COLORS.textDim, align: 'center', lineSpacing: 10,
    }).setOrigin(0.5);
    this.add.text(GAME_W - 20, GAME_H - 20, 'v0.7 橫向＋時空裂縫版', {
      fontFamily: FONT, fontSize: '15px', color: '#4a4458',
    }).setOrigin(1, 1);
  }
}
