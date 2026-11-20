import Phaser from 'phaser';
import { COLORS, FONT, GAME_H, GAME_W } from '../config';
import type { MutationDef } from '../types';

export interface CardSelectData {
  wave?: number;
  choices: (MutationDef & { stacks: number })[];
  onPick: (id: string) => void;
}

/** 三選一突變卡（疊在暫停的 Game 上） */
export class CardSelectScene extends Phaser.Scene {
  private picked = false;

  constructor() {
    super('CardSelect');
  }

  create(data: CardSelectData): void {
    this.picked = false;
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x05030a, 0.78).setInteractive();

    const title = data.wave ? `第 ${data.wave} 波 清除！` : '突變！';
    this.add.text(GAME_W / 2, 170, title, {
      fontFamily: FONT, fontSize: '44px', color: '#ffd166', fontStyle: 'bold', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 235, '選擇一張突變卡強化藥水', {
      fontFamily: FONT, fontSize: '24px', color: COLORS.text,
    }).setOrigin(0.5);

    data.choices.forEach((c, i) => {
      const y = 420 + i * 250;
      const bg = this.add.rectangle(0, 0, 600, 220, COLORS.panel, 1).setStrokeStyle(4, COLORS.accent, 0.8);
      const iconBg = this.add.circle(-220, 0, 64, 0x3a2f45).setStrokeStyle(3, COLORS.accent, 0.6);
      const icon = this.add.text(-220, 0, c.icon, { fontFamily: FONT, fontSize: '64px', color: '#ffffff' }).setOrigin(0.5);
      const name = this.add.text(-130, -50, c.name, {
        fontFamily: FONT, fontSize: '38px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      const stacks = this.add.text(270, -70, c.stacks > 0 ? `Lv.${c.stacks} → ${c.stacks + 1}` : 'NEW', {
        fontFamily: FONT, fontSize: '22px', color: c.stacks > 0 ? '#7ed4ff' : '#ffd166', fontStyle: 'bold',
      }).setOrigin(1, 0.5);
      const desc = this.add.text(-130, 20, c.desc, {
        fontFamily: FONT, fontSize: '24px', color: '#d8d0e6', wordWrap: { width: 400, useAdvancedWrap: true }, lineSpacing: 6,
      }).setOrigin(0, 0.5);
      const card = this.add.container(GAME_W / 2, y, [bg, iconBg, icon, name, stacks, desc])
        .setSize(600, 220).setInteractive({ useHandCursor: true });
      card.setScale(0.8).setAlpha(0);
      this.tweens.add({ targets: card, scale: 1, alpha: 1, delay: 120 * i, duration: 220, ease: 'Back.Out' });
      card.on('pointerover', () => bg.setStrokeStyle(4, 0xffd166, 1));
      card.on('pointerout', () => bg.setStrokeStyle(4, COLORS.accent, 0.8));
      card.on('pointerup', () => {
        if (this.picked) return;
        this.picked = true;
        this.tweens.add({
          targets: card, scale: 1.08, duration: 120, yoyo: true,
          onComplete: () => {
            this.scene.stop();
            data.onPick(c.id);
          },
        });
      });
    });

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= data.choices.length && !this.picked) {
        this.picked = true;
        this.scene.stop();
        data.onPick(data.choices[n - 1].id);
      }
    });
  }
}
