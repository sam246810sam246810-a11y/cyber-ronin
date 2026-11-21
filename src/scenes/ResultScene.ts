import Phaser from 'phaser';
import { goldify } from '../ui/textStyle';
import { isArtTexture } from '../utils';
import { COLORS, FONT, GAME_H, GAME_W, cx } from '../config';
import { MYTHICS, RECIPES } from '../data';
import { CodexStore } from '../systems/CodexStore';
import { MetaStore } from '../systems/MetaStore';
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
    const bgKey = d.victory ? 'bg_win' : 'bg_lose';
    if (isArtTexture(this, bgKey)) {
      const bgi = this.add.image(GAME_W / 2, GAME_H / 2, bgKey);
      bgi.setScale(Math.max(GAME_W / bgi.width, GAME_H / bgi.height));
      this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x05030a, 0.45);
      if (isArtTexture(this, 'ui_dialog')) this.add.nineslice(GAME_W / 2, 410, 'ui_dialog', undefined, Math.min(1180, GAME_W - 60), 560, 70, 70, 80, 50).setAlpha(0.94);
    }
    goldify(this.add.text(GAME_W / 2, 64, d.victory ? '勝利！' : '倒下了…', {
      fontFamily: FONT, fontSize: '62px',
    }), d.victory ? 'gold' : 'red').setOrigin(0.5);
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
      ['時之砂', `+${d.sand} ⌛（共 ${MetaStore.sand}）`],
    ];
    rows.forEach(([k, v], i) => {
      const y = 230 + i * 52;
      this.add.text(cx(90), y, k, { fontFamily: FONT, fontSize: '24px', color: COLORS.textDim }).setOrigin(0, 0.5);
      this.add.text(cx(560), y, v, { fontFamily: FONT, fontSize: '24px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(1, 0.5);
    });

    const block = (y: number, title: string, color: string, body: string) => {
      this.add.text(cx(640), y, title, { fontFamily: FONT, fontSize: '21px', color });
      this.add.text(cx(640), y + 32, body, {
        fontFamily: FONT, fontSize: '18px', color: '#ffffff', wordWrap: { width: 580, useAdvancedWrap: true }, lineSpacing: 4,
      });
    };
    block(210, '本局新發現', '#ffd166', d.discoveries.length ? d.discoveries.map(codexName).join('、') : '（沒有）');
    block(320, '藥水被動', '#c9a3ff',
      d.passives.length ? d.passives.slice(0, 10).map((p) => `${p.name} Lv.${Math.round(p.stacks * 10) / 10}`).join('、') : '（沒有）');
    block(560, '聖物', '#ffd166', d.relics.length ? d.relics.map((r) => r.name).join('、') : '（沒有）');
    block(450, '突變卡', '#7ed4ff', d.mutations.length ? d.mutations.map((m) => `${m.name} ${m.value}`).join('、') : '（沒有）');

    textButton(this, GAME_W / 2 + 160, 650, 360, 84, '回到工房', () => this.scene.start('Game', { mode: 'lobby' }), 0x7a4fc0);
    textButton(this, GAME_W / 2 - 220, 650, 300, 70, '回主選單', () => this.scene.start('MainMenu'));
  }
}
