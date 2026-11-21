import Phaser from 'phaser';
import { COLORS, FONT, GAME_H, GAME_W } from '../config';
import { hexToInt } from '../data';
import type { RunSummary } from './GameScene';
import { textButton } from '../ui/widgets';

/** 暫停：顯示目前的強化狀態 */
export class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }

  create(d: RunSummary): void {
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x05030a, 0.88).setInteractive();
    this.add.text(GAME_W / 2, 70, '暫停', { fontFamily: FONT, fontSize: '48px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 118, `已喝 ${d.drinks} 瓶　果凍 ${d.elements.J}・冰晶 ${d.elements.I}・孢子 ${d.elements.S}`, {
      fontFamily: FONT, fontSize: '22px', color: COLORS.textDim,
    }).setOrigin(0.5);

    // 左欄：角色數值
    this.add.text(60, 165, '角色數值', { fontFamily: FONT, fontSize: '24px', color: '#7ed4ff', fontStyle: 'bold' });
    d.stats.forEach(([k, v], i) => {
      const y = 210 + i * 36;
      this.add.text(60, y, k, { fontFamily: FONT, fontSize: '20px', color: COLORS.textDim });
      this.add.text(330, y, v, { fontFamily: FONT, fontSize: '20px', color: '#ffffff' }).setOrigin(1, 0);
    });

    // 右欄：藥水被動
    this.add.text(380, 165, '藥水被動', { fontFamily: FONT, fontSize: '24px', color: '#ffd166', fontStyle: 'bold' });
    if (!d.passives.length) {
      this.add.text(380, 210, '（還沒喝過藥水）', { fontFamily: FONT, fontSize: '20px', color: COLORS.textDim });
    }
    d.passives.slice(0, 12).forEach((p, i) => {
      const y = 210 + i * 36;
      this.add.circle(392, y + 12, 8, hexToInt(p.color));
      this.add.text(410, y, `${p.legendary ? '★' : ''}${p.name}`, {
        fontFamily: FONT, fontSize: '20px', color: p.legendary ? '#ffb86b' : '#ffffff',
      });
      this.add.text(670, y, `Lv.${p.stacks}`, { fontFamily: FONT, fontSize: '20px', color: '#c9a3ff' }).setOrigin(1, 0);
    });

    const muts = d.mutations.length ? d.mutations.map((m) => `${m.icon}${m.name} Lv.${m.stacks}`).join('　') : '（還沒有）';
    this.add.text(GAME_W / 2, 680, '突變卡', { fontFamily: FONT, fontSize: '22px', color: COLORS.textDim }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 712, muts, {
      fontFamily: FONT, fontSize: '20px', color: '#ffffff', align: 'center', wordWrap: { width: 620, useAdvancedWrap: true },
    }).setOrigin(0.5, 0);

    textButton(this, GAME_W / 2, 880, 400, 96, '繼續', () => this.resumeGame(), 0x7a4fc0);
    textButton(this, GAME_W / 2, 995, 400, 84, '配方圖鑑', () => {
      this.scene.launch('Codex', { returnTo: 'Pause' });
      this.scene.pause();
    });
    textButton(this, GAME_W / 2, 1100, 400, 84, '回主選單', () => {
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
