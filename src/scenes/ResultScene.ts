import Phaser from 'phaser';
import { COLORS, FONT, GAME_W } from '../config';
import { MYTHICS, RECIPES } from '../data';
import { CodexStore } from '../systems/CodexStore';
import { textButton } from '../ui/widgets';
import { formatTime } from '../utils';
import type { RunSummary } from './GameScene';

export interface ResultData extends RunSummary {
  victory: boolean;
  time: number;
  kills: number;
  wave: number;
  fissions: number;
  discoveries: string[];
  unlocks: string[];
}

const codexName = (k: string) =>
  k.startsWith('M:') ? `【神話】${MYTHICS.find((m) => `M:${m.id}` === k)?.name ?? k}` : RECIPES[k]?.name ?? k;

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(d: ResultData): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.add.text(GAME_W / 2, 110, d.victory ? '勝利！' : '倒下了…', {
      fontFamily: FONT, fontSize: '68px', color: d.victory ? '#ffd166' : '#ff6b6b', fontStyle: 'bold', stroke: '#000', strokeThickness: 8,
    }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 180, `${d.character}・${d.victory ? '征服了雷雲山頂！' : `倒在 ${d.region}`}`, {
      fontFamily: FONT, fontSize: '24px', color: COLORS.textDim,
    }).setOrigin(0.5);

    let y = 230;
    if (d.unlocks.length) {
      const t = this.add.text(GAME_W / 2, y + 10, `🔓 新角色解鎖：${d.unlocks.join('、')}`, {
        fontFamily: FONT, fontSize: '26px', color: '#ffd166', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.tweens.add({ targets: t, scale: 1.08, duration: 500, yoyo: true, repeat: -1 });
      y += 50;
    }

    const rows: [string, string][] = [
      ['存活時間', formatTime(d.time)],
      ['擊殺數', String(d.kills)],
      ['喝下藥水', `${d.drinks} 瓶（裂變 ${d.fissions}）`],
      ['圖鑑進度', `${CodexStore.count}/${CodexStore.total}`],
    ];
    rows.forEach(([k, v], i) => {
      const ry = y + 40 + i * 52;
      this.add.text(120, ry, k, { fontFamily: FONT, fontSize: '26px', color: COLORS.textDim }).setOrigin(0, 0.5);
      this.add.text(GAME_W - 120, ry, v, { fontFamily: FONT, fontSize: '28px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(1, 0.5);
    });

    const block = (by: number, title: string, color: string, body: string) => {
      this.add.text(GAME_W / 2, by, title, { fontFamily: FONT, fontSize: '22px', color }).setOrigin(0.5);
      this.add.text(GAME_W / 2, by + 34, body, {
        fontFamily: FONT, fontSize: '20px', color: '#ffffff', align: 'center', wordWrap: { width: 620, useAdvancedWrap: true },
      }).setOrigin(0.5, 0);
    };
    block(y + 270, '本局新發現', '#ffd166', d.discoveries.length ? d.discoveries.map(codexName).join('、') : '（沒有）');
    block(y + 400, '藥水被動', '#c9a3ff',
      d.passives.length ? d.passives.slice(0, 10).map((p) => `${p.name} Lv.${Math.round(p.stacks * 10) / 10}`).join('、') : '（沒有）');
    block(y + 540, '突變卡', '#7ed4ff', d.mutations.length ? d.mutations.map((m) => `${m.name} ${m.value}`).join('、') : '（沒有）');

    textButton(this, GAME_W / 2, 1060, 420, 96, '再玩一次', () => this.scene.start('CharacterSelect'), 0x7a4fc0);
    textButton(this, GAME_W / 2, 1170, 420, 80, '回主選單', () => this.scene.start('MainMenu'));
  }
}
