import Phaser from 'phaser';
import { goldify } from '../ui/textStyle';
import { isArtTexture } from '../utils';
import { COLORS, FONT, GAME_H, GAME_W, MYTHIC, SAFE_X, cx } from '../config';
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

  create(data: { returnTo: 'MainMenu' | 'Pause' | 'Game' }): void {
    this.selectedFrame = undefined;
    if (isArtTexture(this, 'bg_codex')) {
      const bgi = this.add.image(GAME_W / 2, GAME_H / 2, 'bg_codex').setInteractive();
      bgi.setScale(Math.max(GAME_W / bgi.width, GAME_H / bgi.height));
      this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x05030a, 0.5);
      this.add.nineslice(GAME_W / 2, 34, 'ui_nameplate', undefined, 270, 60, 34, 34, 22, 22);
      goldify(this.add.text(GAME_W / 2, 34, '配方圖鑑', { fontFamily: FONT, fontSize: '28px' })).setOrigin(0.5);
    } else {
      this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, COLORS.bg, 1).setInteractive();
      this.add.text(GAME_W / 2, 36, '配方圖鑑', { fontFamily: FONT, fontSize: '34px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    }
    this.add.text(GAME_W / 2, 72, `已發現 ${CodexStore.count} / ${CodexStore.total}　（點格子看效果）`, {
      fontFamily: FONT, fontSize: '19px', color: COLORS.textDim,
    }).setOrigin(0.5);

    const tw = 140;
    const th = 74;
    const cols = 7;
    const ox = (GAME_W - cols * (tw + 4)) / 2;
    RECIPE_ORDER.forEach((key, i) => {
      const x = ox + tw / 2 + (i % cols) * (tw + 4);
      const y = 96 + th / 2 + Math.floor(i / cols) * (th + 4);
      const r = RECIPES[key];
      const known = CodexStore.has(key);
      const frame = this.add.rectangle(x, y, tw - 4, th, known ? COLORS.panel : 0x15101c, 1)
        .setStrokeStyle(2, known ? hexToInt(r.color) : 0x2a2235, 1).setInteractive({ useHandCursor: true });
      key.split('').forEach((el, j) => {
        this.add.image(x - 26 + j * 26, y - 16, `ing_${el}`).setDisplaySize(22, 22).setAlpha(known ? 1 : 0.35);
      });
      this.add.text(x, y + 18, known ? r.name : '？', {
        fontFamily: FONT, fontSize: known ? '15px' : '22px', color: known ? '#ffffff' : '#4a4458', fontStyle: 'bold',
      }).setOrigin(0.5);
      frame.on('pointerup', () => this.show(frame,
        known ? r.name : '？？？',
        known ? `${{ pure: '純色', dual: '雙色', tri: '三色' }[r.kind]}藥水\n${r.desc}` : '還沒煉出過這個組合。'));
    });

    const my = 96 + 5 * (th + 4) + 20;
    this.add.text(cx(136) + 346, my, `【${MYTHIC.name}】裂變藥水`, {
      fontFamily: FONT, fontSize: '22px', color: MYTHIC.color, fontStyle: 'bold',
    }).setOrigin(0.5);
    MYTHICS.forEach((m, i) => {
      const x = cx(136) + 82 + i * 176;
      const y = my + 50;
      const known = CodexStore.has(mythicKey(m.id));
      const frame = this.add.rectangle(x, y, 160, 70, known ? 0x3a1420 : 0x15101c, 1)
        .setStrokeStyle(3, known ? hexToInt(m.color) : 0x2a2235, 1).setInteractive({ useHandCursor: true });
      this.add.text(x, y, known ? m.name : '？', {
        fontFamily: FONT, fontSize: known ? '20px' : '26px', color: known ? m.color : '#4a4458', fontStyle: 'bold',
      }).setOrigin(0.5);
      frame.on('pointerup', () => this.show(frame, known ? m.name : '？？？', known ? m.desc : '煉成時有機率裂變出現。'));
    });

    this.add.rectangle(cx(1010), my + 50, 420, 120, COLORS.panel, 1).setStrokeStyle(2, COLORS.accent, 0.4);
    this.detailTitle = this.add.text(cx(812), my, '點格子查看效果', {
      fontFamily: FONT, fontSize: '22px', color: '#ffd166', fontStyle: 'bold',
    });
    this.detailBody = this.add.text(cx(812), my + 30, '', {
      fontFamily: FONT, fontSize: '15px', color: '#e8e0f0', lineSpacing: 3, wordWrap: { width: 396, useAdvancedWrap: true },
    });

    textButton(this, SAFE_X + 110, 40, 160, 54, '返回', () => {
      if (data.returnTo === 'Pause' || data.returnTo === 'Game') {
        this.scene.stop();
        this.scene.resume(data.returnTo);
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
