import Phaser from 'phaser';
import { COLORS, FONT, GAME_H, GAME_W, RARITY } from '../config';
import { hexToInt } from '../data';
import { cardDesc, formatCardValue, type CardOffer } from '../systems/MutationSystem';

export interface CardSelectData {
  wave?: number;
  region?: string;
  offers: (CardOffer & { owned: number })[];
  onPick: (index: number) => void;
}

/** 三選一突變卡：每張有稀有度，越稀有數值越高 */
export class CardSelectScene extends Phaser.Scene {
  private picked = false;

  constructor() {
    super('CardSelect');
  }

  create(data: CardSelectData): void {
    this.picked = false;
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x05030a, 0.8).setInteractive();
    this.add.text(GAME_W / 2, 170, data.wave ? `${data.region ?? ''} 第 ${data.wave} 波 清除！` : '突變！', {
      fontFamily: FONT, fontSize: '44px', color: '#ffd166', fontStyle: 'bold', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 235, '選擇一張突變卡', { fontFamily: FONT, fontSize: '24px', color: COLORS.text }).setOrigin(0.5);

    const pickIt = (i: number) => {
      if (this.picked) return;
      this.picked = true;
      this.scene.stop();
      data.onPick(i);
    };

    data.offers.forEach((o, i) => {
      const y = 420 + i * 250;
      const rar = RARITY[o.rarity];
      const rc = hexToInt(rar.color);
      const bg = this.add.rectangle(0, 0, 600, 220, COLORS.panel, 1).setStrokeStyle(o.rarity >= 2 ? 6 : 4, rc, 1);
      const band = this.add.rectangle(-300 + 8, 0, 16, 220, rc, 1).setOrigin(0.5);
      const iconBg = this.add.circle(-200, 0, 62, 0x3a2f45).setStrokeStyle(3, rc, 1);
      const icon = this.add.text(-200, 0, o.def.icon, { fontFamily: FONT, fontSize: '60px', color: rar.color }).setOrigin(0.5);
      const rarity = this.add.text(-110, -70, rar.name, { fontFamily: FONT, fontSize: '20px', color: rar.color, fontStyle: 'bold' }).setOrigin(0, 0.5);
      const name = this.add.text(-110, -32, o.def.name, { fontFamily: FONT, fontSize: '36px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0, 0.5);
      const owned = this.add.text(280, -70, o.owned > 0 ? `已有 ${formatCardValue(o.def, o.owned)}` : 'NEW', {
        fontFamily: FONT, fontSize: '18px', color: o.owned > 0 ? '#7ed4ff' : '#ffd166',
      }).setOrigin(1, 0.5);
      const desc = this.add.text(-110, 36, cardDesc(o.def, o.value), {
        fontFamily: FONT, fontSize: '24px', color: '#e8e0f0', wordWrap: { width: 380, useAdvancedWrap: true }, lineSpacing: 6,
      }).setOrigin(0, 0.5);
      const card = this.add.container(GAME_W / 2, y, [bg, band, iconBg, icon, rarity, name, owned, desc])
        .setSize(600, 220).setInteractive({ useHandCursor: true });
      card.setScale(0.8).setAlpha(0);
      this.tweens.add({ targets: card, scale: 1, alpha: 1, delay: 120 * i, duration: 220, ease: 'Back.Out' });
      if (o.rarity >= 2) {
        this.tweens.add({ targets: bg, alpha: 0.85, duration: 500, yoyo: true, repeat: -1 });
      }
      card.on('pointerup', () => pickIt(i));
    });

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= data.offers.length) pickIt(n - 1);
    });
  }
}
