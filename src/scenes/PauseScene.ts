import Phaser from 'phaser';
import { COLORS, FONT, GAME_H, GAME_W, MYTHIC } from '../config';
import { ELEMENTS, hexToInt } from '../data';
import type { RunSummary } from './GameScene';
import { textButton } from '../ui/widgets';

/** 暫停：顯示目前的強化狀態 */
export class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }

  create(d: RunSummary): void {
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x05030a, 0.9).setInteractive();
    this.add.text(GAME_W / 2, 56, '暫停', { fontFamily: FONT, fontSize: '44px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 100, `${d.character}　已喝 ${d.drinks} 瓶`, { fontFamily: FONT, fontSize: '22px', color: COLORS.textDim }).setOrigin(0.5);
    ELEMENTS.forEach((e, i) => {
      const x = 120 + i * 120;
      this.add.image(x - 18, 140, `ing_${e.id}`).setDisplaySize(28, 28);
      this.add.text(x + 2, 140, String(Math.round(d.elements[e.id] * 10) / 10), {
        fontFamily: FONT, fontSize: '20px', color: e.color, fontStyle: 'bold',
      }).setOrigin(0, 0.5);
    });

    this.add.text(50, 180, '角色數值', { fontFamily: FONT, fontSize: '22px', color: '#7ed4ff', fontStyle: 'bold' });
    d.stats.forEach(([k, v], i) => {
      const y = 218 + i * 34;
      this.add.text(50, y, k, { fontFamily: FONT, fontSize: '19px', color: COLORS.textDim });
      this.add.text(330, y, v, { fontFamily: FONT, fontSize: '19px', color: '#ffffff' }).setOrigin(1, 0);
    });

    this.add.text(370, 180, '藥水被動', { fontFamily: FONT, fontSize: '22px', color: '#ffd166', fontStyle: 'bold' });
    if (!d.passives.length) this.add.text(370, 218, '（還沒喝過藥水）', { fontFamily: FONT, fontSize: '19px', color: COLORS.textDim });
    d.passives.slice(0, 12).forEach((p, i) => {
      const y = 218 + i * 34;
      this.add.circle(382, y + 11, 7, hexToInt(p.color));
      this.add.text(396, y, p.name, { fontFamily: FONT, fontSize: '19px', color: p.mythic ? MYTHIC.color : '#ffffff' });
      this.add.text(676, y, `Lv.${Math.round(p.stacks * 10) / 10}`, { fontFamily: FONT, fontSize: '19px', color: '#c9a3ff' }).setOrigin(1, 0);
    });

    const muts = d.mutations.length ? d.mutations.map((m) => `${m.icon}${m.name} ${m.value}`).join('　') : '（還沒有）';
    this.add.text(GAME_W / 2, 650, '突變卡', { fontFamily: FONT, fontSize: '22px', color: COLORS.textDim }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 682, muts, {
      fontFamily: FONT, fontSize: '19px', color: '#ffffff', align: 'center', wordWrap: { width: 640, useAdvancedWrap: true },
    }).setOrigin(0.5, 0);

    textButton(this, GAME_W / 2, 900, 400, 92, '繼續', () => this.resumeGame(), 0x7a4fc0);
    textButton(this, GAME_W / 2, 1010, 400, 80, '配方圖鑑', () => {
      this.scene.launch('Codex', { returnTo: 'Pause' });
      this.scene.pause();
    });
    textButton(this, GAME_W / 2, 1110, 400, 80, '回主選單', () => {
      this.scene.stop('Game');
      this.scene.start('MainMenu');
    }, 0x5a2a3a);
    this.input.keyboard?.on('keydown-ESC', () => this.resumeGame());
  }

  private resumeGame(): void {
    this.scene.stop();
    this.scene.resume('Game');
  }
}
