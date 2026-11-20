import Phaser from 'phaser';
import { COLORS, FONT, GAME_W } from '../config';
import { RECIPES } from '../data';
import { CodexStore } from '../systems/CodexStore';
import { textButton } from '../ui/widgets';
import { formatTime } from '../utils';

export interface ResultData {
  victory: boolean;
  time: number;
  kills: number;
  wave: number;
  discoveries: string[];
  mutations: { name: string; stacks: number }[];
}

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(d: ResultData): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.add.text(GAME_W / 2, 170, d.victory ? '勝利！' : '倒下了…', {
      fontFamily: FONT, fontSize: '72px', color: d.victory ? '#ffd166' : '#ff6b6b', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 8,
    }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 250, d.victory ? '食人巨花被擊敗了' : d.wave > 10 ? '倒在 Boss 戰' : `倒在第 ${d.wave} 波`, {
      fontFamily: FONT, fontSize: '26px', color: COLORS.textDim,
    }).setOrigin(0.5);

    const rows: [string, string][] = [
      ['存活時間', formatTime(d.time)],
      ['擊殺數', String(d.kills)],
      ['圖鑑進度', `${CodexStore.count}/${CodexStore.total}`],
    ];
    rows.forEach(([k, v], i) => {
      const y = 360 + i * 64;
      this.add.text(150, y, k, { fontFamily: FONT, fontSize: '30px', color: COLORS.textDim }).setOrigin(0, 0.5);
      this.add.text(GAME_W - 150, y, v, { fontFamily: FONT, fontSize: '34px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(1, 0.5);
    });

    this.add.text(GAME_W / 2, 580, '本局新發現的配方', { fontFamily: FONT, fontSize: '26px', color: '#ffd166' }).setOrigin(0.5);
    const disc = d.discoveries.length ? d.discoveries.map((k) => RECIPES[k]?.name ?? k).join('、') : '（沒有）';
    this.add.text(GAME_W / 2, 625, disc, {
      fontFamily: FONT, fontSize: '26px', color: '#ffffff', align: 'center', wordWrap: { width: 600, useAdvancedWrap: true },
    }).setOrigin(0.5, 0);

    this.add.text(GAME_W / 2, 740, '突變', { fontFamily: FONT, fontSize: '26px', color: '#7ed4ff' }).setOrigin(0.5);
    const muts = d.mutations.length ? d.mutations.map((m) => `${m.name} Lv.${m.stacks}`).join('、') : '（沒有）';
    this.add.text(GAME_W / 2, 785, muts, {
      fontFamily: FONT, fontSize: '24px', color: '#ffffff', align: 'center', wordWrap: { width: 600, useAdvancedWrap: true },
    }).setOrigin(0.5, 0);

    textButton(this, GAME_W / 2, 1000, 420, 104, '再玩一次', () => this.scene.start('Game'), 0x7a4fc0);
    textButton(this, GAME_W / 2, 1125, 420, 86, '回主選單', () => this.scene.start('MainMenu'));
  }
}
