import Phaser from 'phaser';
import { COLORS, FONT, GAME_H, GAME_W, MYTHIC } from '../config';
import { MYTHICS, RECIPES, RECIPE_ORDER, hexToInt, mythicKey } from '../data';
import { CodexStore } from '../systems/CodexStore';
import { textButton } from '../ui/widgets';

/** 配方圖鑑：35 種配方（純色/雙色/三色）+ 4 種神話藥水，點格子看說明 */
export class CodexScene extends Phaser.Scene {
  private detailTitle!: Phaser.GameObjects.Text;
  private detailBody!: Phaser.GameObjects.Text;
  private selectedFrame?: Phaser.GameObjects.Rectangle;

  constructor() {
    super('Codex');
  }

  create(data: { returnTo: 'MainMenu' | 'Pause' }): void {
    this.selectedFrame = undefined;
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, COLORS.bg, 1).setInteractive();
    this.add.text(GAME_W / 2, 46, '配方圖鑑', { fontFamily: FONT, fontSize: '40px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 88, `已發現 ${CodexStore.count} / ${CodexStore.total}　（點格子看效果）`, {
      fontFamily: FONT, fontSize: '19px', color: COLORS.textDim,
    }).setOrigin(0.5);

    const tw = 130;
    const th = 92;
    RECIPE_ORDER.forEach((key, i) => {
      const x = 32 + tw / 2 + (i % 5) * (tw + 2);
      const y = 120 + th / 2 + Math.floor(i / 5) * (th + 4);
      const r = RECIPES[key];
      const known = CodexStore.has(key);
      const frame = this.add.rectangle(x, y, tw - 4, th, known ? COLORS.panel : 0x15101c, 1)
        .setStrokeStyle(2, known ? hexToInt(r.color) : 0x2a2235, 1).setInteractive({ useHandCursor: true });
      key.split('').forEach((el, j) => {
        this.add.image(x - 30 + j * 30, y - 20, `ing_${el}`).setDisplaySize(24, 24).setAlpha(known ? 1 : 0.35);
      });
      this.add.text(x, y + 22, known ? r.name : '？', {
        fontFamily: FONT, fontSize: known ? '15px' : '22px', color: known ? '#ffffff' : '#4a4458', fontStyle: 'bold',
      }).setOrigin(0.5);
      frame.on('pointerup', () => this.show(frame,
        known ? r.name : '？？？',
        known ? `${{ pure: '純色', dual: '雙色', tri: '三色' }[r.kind]}藥水\n${r.desc}` : '還沒煉出過這個組合。'));
    });

    const my = 120 + 7 * (th + 4) + 26;
    this.add.text(GAME_W / 2, my, `【${MYTHIC.name}】裂變藥水`, {
      fontFamily: FONT, fontSize: '22px', color: MYTHIC.color, fontStyle: 'bold',
    }).setOrigin(0.5);
    MYTHICS.forEach((m, i) => {
      const x = 32 + 82 + i * 166;
      const y = my + 60;
      const known = CodexStore.has(mythicKey(m.id));
      const frame = this.add.rectangle(x, y, 160, 70, known ? 0x3a1420 : 0x15101c, 1)
        .setStrokeStyle(3, known ? hexToInt(m.color) : 0x2a2235, 1).setInteractive({ useHandCursor: true });
      this.add.text(x, y, known ? m.name : '？', {
        fontFamily: FONT, fontSize: known ? '20px' : '26px', color: known ? m.color : '#4a4458', fontStyle: 'bold',
      }).setOrigin(0.5);
      frame.on('pointerup', () => this.show(frame, known ? m.name : '？？？', known ? m.desc : '煉成時有機率裂變出現。'));
    });

    this.add.rectangle(GAME_W / 2, 1090, 660, 112, COLORS.panel, 1).setStrokeStyle(2, COLORS.accent, 0.4);
    this.detailTitle = this.add.text(60, 1046, '點上方格子查看效果', {
      fontFamily: FONT, fontSize: '22px', color: '#ffd166', fontStyle: 'bold',
    });
    this.detailBody = this.add.text(60, 1078, '', {
      fontFamily: FONT, fontSize: '17px', color: '#e8e0f0', lineSpacing: 4, wordWrap: { width: 600, useAdvancedWrap: true },
    });

    textButton(this, GAME_W / 2, 1208, 300, 64, '返回', () => {
      if (data.returnTo === 'Pause') {
        this.scene.stop();
        this.scene.resume('Pause');
      } else {
        this.scene.start('MainMenu');
      }
    });
  }

  private show(frame: Phaser.GameObjects.Rectangle, title: string, body: string): void {
    this.selectedFrame?.setFillStyle(this.selectedFrame.getData('fill') as number);
    frame.setData('fill', frame.fillColor);
    frame.setFillStyle(0x4a3a60);
    this.selectedFrame = frame;
    this.detailTitle.setText(title);
    this.detailBody.setText(body.replace(/ /g, ' '));
  }
}
