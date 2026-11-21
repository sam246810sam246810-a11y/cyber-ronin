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
    this.add.text(GAME_W / 2, 64, d.victory ? '勝利！' : '倒下了…', {
      fontFamily: FONT, fontSize: '62px', color: d.victory ? '#ffd166' : '#ff6b6b', fontStyle: 'bold', stroke: '#000', strokeThickness: 8,
    }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 124, `${d.character}・${d.victory ? '征服了雷雲山頂！' : `倒在 ${d.region}`}`, {
      fontFamily: FONT, fontSize: '22px', color: COLORS.textDim,
    }).setOrigin(0.5);
    if (d.unlocks.length) {
      const t = this.add.text(GAME_W / 2, 166, `🔓 新角色解鎖：${d.unlocks.join('、')}`, {
        fontFamily: FONT, fontSize: '24px', color: '#ffd166', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.tweens.add({ targets: t, scale: 1.08, duration: 500, yoyo: true, repeat: -1 });
    }

    const rows: [string, string][] = [
      ['存活時間', formatTime(d.time)],
      ['擊殺數', String(d.kills)],
      ['喝下藥水', `${d.drinks} 瓶（裂變 ${d.fissions}）`],
      ['圖鑑進度', `${CodexStore.count}/${CodexStore.total}`],
      ['武器', d.weapons.map((w) => w.name).join(' ／ ')],
    ];
    rows.forEach(([k, v], i) => {
      const y = 230 + i * 52;
      this.add.text(90, y, k, { fontFamily: FONT, fontSize: '24px', color: COLORS.textDim }).setOrigin(0, 0.5);
      this.add.text(560, y, v, { fontFamily: FONT, fontSize: '24px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(1, 0.5);
    });

    const block = (y: number, title: string, color: string, body: string) => {
      this.add.text(640, y, title, { fontFamily: FONT, fontSize: '21px', color });
      this.add.text(640, y + 32, body, {
        fontFamily: FONT, fontSize: '18px', color: '#ffffff', wordWrap: { width: 580, useAdvancedWrap: true }, lineSpacing: 4,
      });
    };
    block(210, '本局新發現', '#ffd166', d.discoveries.length ? d.discoveries.map(codexName).join('、') : '（沒有）');
    block(320, '藥水被動', '#c9a3ff',
      d.passives.length ? d.passives.slice(0, 10).map((p) => `${p.name} Lv.${Math.round(p.stacks * 10) / 10}`).join('、') : '（沒有）');
    block(450, '突變卡', '#7ed4ff', d.mutations.length ? d.mutations.map((m) => `${m.name} ${m.value}`).join('、') : '（沒有）');

    textButton(this, GAME_W / 2 + 160, 650, 360, 84, '再玩一次', () => this.scene.start('CharacterSelect'), 0x7a4fc0);
    textButton(this, GAME_W / 2 - 220, 650, 300, 70, '回主選單', () => this.scene.start('MainMenu'));
  }
}
