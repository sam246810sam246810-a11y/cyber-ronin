import Phaser from 'phaser';
import { COLORS, FONT, GAME_W } from '../config';
import { LEGENDARIES, RECIPES } from '../data';
import { CodexStore } from '../systems/CodexStore';
import { textButton } from '../ui/widgets';
import { formatTime } from '../utils';
import type { RunSummary } from './GameScene';

export interface ResultData extends RunSummary {
  victory: boolean;
  time: number;
  kills: number;
  wave: number;
  discoveries: string[];
}

const codexName = (k: string) =>
  k.startsWith('L:') ? `★${LEGENDARIES.find((l) => `L:${l.id}` === k)?.name ?? k}` : RECIPES[k]?.name ?? k;

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(d: ResultData): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.add.text(GAME_W / 2, 140, d.victory ? '勝利！' : '倒下了…', {
      fontFamily: FONT, fontSize: '72px', color: d.victory ? '#ffd166' : '#ff6b6b', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 8,
    }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 215, d.victory ? '食人巨花被擊敗了' : d.wave > 10 ? '倒在 Boss 戰' : `倒在第 ${d.wave} 波`, {
      fontFamily: FONT, fontSize: '26px', color: COLORS.textDim,
    }).setOrigin(0.5);

    const legend = d.passives.filter((p) => p.legendary).reduce((s, p) => s + p.stacks, 0);
    const rows: [string, string][] = [
      ['存活時間', formatTime(d.time)],
      ['擊殺數', String(d.kills)],
      ['喝下藥水', `${d.drinks} 瓶（傳說 ${legend}）`],
      ['圖鑑進度', `${CodexStore.count}/${CodexStore.total}`],
    ];
    rows.forEach(([k, v], i) => {
      const y = 300 + i * 58;
      this.add.text(130, y, k, { fontFamily: FONT, fontSize: '28px', color: COLORS.textDim }).setOrigin(0, 0.5);
      this.add.text(GAME_W - 130, y, v, { fontFamily: FONT, fontSize: '30px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(1, 0.5);
    });

    const block = (y: number, title: string, color: string, body: string) => {
      this.add.text(GAME_W / 2, y, title, { fontFamily: FONT, fontSize: '24px', color }).setOrigin(0.5);
      this.add.text(GAME_W / 2, y + 38, body, {
        fontFamily: FONT, fontSize: '22px', color: '#ffffff', align: 'center', wordWrap: { width: 620, useAdvancedWrap: true },
      }).setOrigin(0.5, 0);
    };
    block(560, '本局新發現', '#ffd166', d.discoveries.length ? d.discoveries.map(codexName).join('、') : '（沒有）');
    block(680, '藥水被動', '#c9a3ff',
      d.passives.length ? d.passives.map((p) => `${p.legendary ? '★' : ''}${p.name} Lv.${p.stacks}`).join('、') : '（沒有）');
    block(820, '突變卡', '#7ed4ff', d.mutations.length ? d.mutations.map((m) => `${m.name} Lv.${m.stacks}`).join('、') : '（沒有）');

    textButton(this, GAME_W / 2, 1030, 420, 100, '再玩一次', () => this.scene.start('Game'), 0x7a4fc0);
    textButton(this, GAME_W / 2, 1150, 420, 84, '回主選單', () => this.scene.start('MainMenu'));
  }
}
