import Phaser from 'phaser';
import { COLORS, FONT, GAME_H, GAME_W } from '../config';
import type { MutationDef } from '../types';
import { textButton } from '../ui/widgets';

export class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }

  create(data: { owned: { def: MutationDef; stacks: number }[] }): void {
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x05030a, 0.82).setInteractive();
    this.add.text(GAME_W / 2, 180, '暫停', {
      fontFamily: FONT, fontSize: '56px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(GAME_W / 2, 280, '已取得的突變', { fontFamily: FONT, fontSize: '26px', color: COLORS.textDim }).setOrigin(0.5);
    const list = data.owned.length
      ? data.owned.map((m) => `${m.def.icon} ${m.def.name} Lv.${m.stacks}`).join('\n')
      : '（還沒有）';
    this.add.text(GAME_W / 2, 330, list, {
      fontFamily: FONT, fontSize: '26px', color: '#ffffff', align: 'center', lineSpacing: 10,
    }).setOrigin(0.5, 0);

    textButton(this, GAME_W / 2, 820, 400, 96, '繼續', () => this.resumeGame(), 0x7a4fc0);
    textButton(this, GAME_W / 2, 940, 400, 86, '配方圖鑑', () => {
      this.scene.launch('Codex', { returnTo: 'Pause' });
      this.scene.pause();
    });
    textButton(this, GAME_W / 2, 1050, 400, 86, '回主選單', () => {
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
