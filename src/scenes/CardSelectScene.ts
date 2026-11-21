import Phaser from 'phaser';
import { COLORS, FONT, GAME_H, GAME_W, RARITY } from '../config';
import { hexToInt } from '../data';
import { textButton } from '../ui/widgets';
import { cardDesc, formatCardValue, type CardOffer } from '../systems/MutationSystem';

export interface CardSelectData {
  title?: string;
  offers: (CardOffer & { owned: number })[];
  onPick: (index: number) => void;
  rerolls?: number;
  onReroll?: () => void;
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
    this.add.text(GAME_W / 2, 90, data.title ?? '突變！', {
      fontFamily: FONT, fontSize: '44px', color: '#ffd166', fontStyle: 'bold', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 145, '選擇一張突變卡', { fontFamily: FONT, fontSize: '24px', color: COLORS.text }).setOrigin(0.5);

    const pickIt = (i: number) => {
      if (this.picked) return;
      this.picked = true;
      this.scene.stop();
      data.onPick(i);
    };

    data.offers.forEach((o, i) => {
      const x = GAME_W / 2 + (i - 1) * 400;
      const y = 400;
      const rar = RARITY[o.rarity];
      const rc = hexToInt(rar.color);
      const bg = this.add.rectangle(0, 0, 370, 380, COLORS.panel, 1).setStrokeStyle(o.rarity >= 2 ? 6 : 4, rc, 1);
      const band = this.add.rectangle(0, -182, 370, 16, rc, 1);
      const iconBg = this.add.circle(0, -90, 58, 0x3a2f45).setStrokeStyle(3, rc, 1);
      const icon = this.add.text(0, -90, o.def.icon, { fontFamily: FONT, fontSize: '56px', color: rar.color }).setOrigin(0.5);
      const rarity = this.add.text(-160, -150, rar.name, { fontFamily: FONT, fontSize: '19px', color: rar.color, fontStyle: 'bold' }).setOrigin(0, 0.5);
      const owned = this.add.text(160, -150, o.owned > 0 ? `已有 ${formatCardValue(o.def, o.owned)}` : 'NEW', {
        fontFamily: FONT, fontSize: '17px', color: o.owned > 0 ? '#7ed4ff' : '#ffd166',
      }).setOrigin(1, 0.5);
      const name = this.add.text(0, 6, o.def.name, { fontFamily: FONT, fontSize: '34px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
      const desc = this.add.text(0, 90, cardDesc(o.def, o.value), {
        fontFamily: FONT, fontSize: '22px', color: '#e8e0f0', align: 'center', wordWrap: { width: 320, useAdvancedWrap: true }, lineSpacing: 6,
      }).setOrigin(0.5);
      const card = this.add.container(x, y, [bg, band, iconBg, icon, rarity, owned, name, desc])
        .setSize(370, 380).setInteractive({ useHandCursor: true });
      card.setScale(0.8).setAlpha(0);
      this.tweens.add({ targets: card, scale: 1, alpha: 1, delay: 120 * i, duration: 220, ease: 'Back.Out' });
      if (o.rarity >= 2) this.tweens.add({ targets: bg, alpha: 0.85, duration: 500, yoyo: true, repeat: -1 });
      card.on('pointerup', () => pickIt(i));
    });

    if (data.rerolls && data.onReroll) {
      textButton(this, GAME_W / 2, 650, 260, 60, `🎲 重抽（剩 ${data.rerolls}）`, () => {
        if (!this.picked) {
          this.picked = true;
          data.onReroll!();
        }
      });
    }
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= data.offers.length) pickIt(n - 1);
    });
  }
}
