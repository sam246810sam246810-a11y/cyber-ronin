import Phaser from 'phaser';
import { COLORS, FONT, GAME_H, GAME_W } from '../config';
import { LEGENDARIES, RECIPES, RECIPE_ORDER, hexToInt, legendaryKey } from '../data';
import { CodexStore } from '../systems/CodexStore';
import { textButton } from '../ui/widgets';

/** 中文換行時不要在數字旁的空格斷開 */
const nbsp = (t: string) => t.replace(/ /g, '\u00a0');

/** 配方圖鑑：10 種配方 + 4 種傳說藥水，未發現的顯示「？」 */
export class CodexScene extends Phaser.Scene {
  constructor() {
    super('Codex');
  }

  create(data: { returnTo: 'MainMenu' | 'Pause' }): void {
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, COLORS.bg, 1).setInteractive();
    this.add.text(GAME_W / 2, 56, '配方圖鑑', { fontFamily: FONT, fontSize: '44px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 104, `已發現 ${CodexStore.count} / ${CodexStore.total}`, {
      fontFamily: FONT, fontSize: '22px', color: COLORS.textDim,
    }).setOrigin(0.5);

    RECIPE_ORDER.forEach((key, i) => {
      const x = 190 + (i % 2) * 340;
      const y = 200 + Math.floor(i / 2) * 136;
      const known = CodexStore.has(key);
      const r = RECIPES[key];
      this.add.rectangle(x, y, 320, 124, COLORS.panel, 1).setStrokeStyle(3, known ? hexToInt(r.color) : 0x3a2f45, 1);
      if (known) {
        key.split('').forEach((ing, j) => this.add.image(x - 126 + j * 30, y - 38, `ing_${ing}`).setDisplaySize(26, 26));
        this.add.text(x - 30, y - 38, r.name, { fontFamily: FONT, fontSize: '24px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0, 0.5);
        this.add.text(x - 144, y + 16, nbsp(r.desc), {
          fontFamily: FONT, fontSize: '16px', color: '#d8d0e6', wordWrap: { width: 290, useAdvancedWrap: true },
        }).setOrigin(0, 0.5);
      } else {
        this.add.text(x, y - 8, '？', { fontFamily: FONT, fontSize: '48px', color: '#4a4458', fontStyle: 'bold' }).setOrigin(0.5);
        this.add.text(x, y + 38, '尚未煉出', { fontFamily: FONT, fontSize: '16px', color: '#4a4458' }).setOrigin(0.5);
      }
    });

    this.add.text(GAME_W / 2, 862, '★ 傳說藥水（煉成時機率裂變）', {
      fontFamily: FONT, fontSize: '24px', color: '#ffb86b', fontStyle: 'bold',
    }).setOrigin(0.5);
    LEGENDARIES.forEach((L, i) => {
      const x = 190 + (i % 2) * 340;
      const y = 935 + Math.floor(i / 2) * 104;
      const known = CodexStore.has(legendaryKey(L.id));
      this.add.rectangle(x, y, 320, 94, known ? 0x3a2414 : COLORS.panel, 1).setStrokeStyle(3, known ? hexToInt(L.color) : 0x3a2f45, 1);
      if (known) {
        this.add.text(x - 144, y - 24, `★ ${L.name}`, { fontFamily: FONT, fontSize: '22px', color: L.color, fontStyle: 'bold' }).setOrigin(0, 0.5);
        this.add.text(x - 144, y + 16, nbsp(L.desc), {
          fontFamily: FONT, fontSize: '15px', color: '#f0e0d0', wordWrap: { width: 290, useAdvancedWrap: true },
        }).setOrigin(0, 0.5);
      } else {
        this.add.text(x, y, '？ 傳說', { fontFamily: FONT, fontSize: '28px', color: '#5a4a3a', fontStyle: 'bold' }).setOrigin(0.5);
      }
    });

    textButton(this, GAME_W / 2, 1200, 320, 76, '返回', () => {
      if (data.returnTo === 'Pause') {
        this.scene.stop();
        this.scene.resume('Pause');
      } else {
        this.scene.start('MainMenu');
      }
    });
  }
}
