import Phaser from 'phaser';
import { COLORS, FONT, GAME_H, GAME_W } from '../config';
import { RECIPES, RECIPE_ORDER, hexToInt } from '../data';
import { CodexStore } from '../systems/CodexStore';
import { textButton } from '../ui/widgets';

/** 配方圖鑑：未發現的顯示「？」 */
export class CodexScene extends Phaser.Scene {
  constructor() {
    super('Codex');
  }

  create(data: { returnTo: 'MainMenu' | 'Pause' }): void {
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, COLORS.bg, 1).setInteractive();
    this.add.text(GAME_W / 2, 80, '配方圖鑑', {
      fontFamily: FONT, fontSize: '48px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 135, `已發現 ${CodexStore.count} / ${CodexStore.total}`, {
      fontFamily: FONT, fontSize: '24px', color: COLORS.textDim,
    }).setOrigin(0.5);

    RECIPE_ORDER.forEach((key, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 190 + col * 340;
      const y = 250 + row * 168;
      const known = CodexStore.has(key);
      const r = RECIPES[key];
      this.add.rectangle(x, y, 320, 150, COLORS.panel, 1)
        .setStrokeStyle(3, known ? hexToInt(r.color) : 0x3a2f45, known ? 0.9 : 1);
      if (known) {
        key.split('').forEach((ing, j) => {
          this.add.image(x - 120 + j * 34, y - 44, `ing_${ing}`).setDisplaySize(30, 30);
        });
        this.add.image(x + 120, y - 40, 'flask').setTint(hexToInt(r.color)).setDisplaySize(34, 42);
        this.add.text(x - 140, y - 4, r.name, {
          fontFamily: FONT, fontSize: '28px', color: '#ffffff', fontStyle: 'bold',
        }).setOrigin(0, 0.5);
        this.add.text(x - 140, y + 42, r.desc, {
          fontFamily: FONT, fontSize: '17px', color: '#d8d0e6', wordWrap: { width: 290, useAdvancedWrap: true },
        }).setOrigin(0, 0.5);
      } else {
        this.add.text(x, y - 10, '？', { fontFamily: FONT, fontSize: '56px', color: '#4a4458', fontStyle: 'bold' }).setOrigin(0.5);
        this.add.text(x, y + 46, '尚未煉出', { fontFamily: FONT, fontSize: '18px', color: '#4a4458' }).setOrigin(0.5);
      }
    });

    textButton(this, GAME_W / 2, 1150, 360, 90, '返回', () => {
      if (data.returnTo === 'Pause') {
        this.scene.stop();
        this.scene.resume('Pause');
      } else {
        this.scene.start('MainMenu');
      }
    });
  }
}
