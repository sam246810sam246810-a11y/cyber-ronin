import Phaser from 'phaser';
import { COLORS, FONT, GAME_H, GAME_W, cx } from '../config';
import { META_UPGRADES } from '../data';
import { MetaStore } from '../systems/MetaStore';
import { Sound } from '../systems/SoundSystem';
import { textButton } from '../ui/widgets';

/** 大坩堝：用時之砂購買永久升級 */
export class MetaScene extends Phaser.Scene {
  constructor() {
    super('Meta');
  }

  create(): void {
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x05030a, 0.9).setInteractive();
    this.add.text(GAME_W / 2, 46, '大坩堝・永久升級', { fontFamily: FONT, fontSize: '36px', color: '#c9a3ff', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 90, `⌛ 時之砂：${MetaStore.sand}　（精英、Boss、時空裂縫、通過的樓層都會給）`, {
      fontFamily: FONT, fontSize: '19px', color: '#9fe3ff',
    }).setOrigin(0.5);

    META_UPGRADES.forEach((u, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = cx(340 + col * 600);
      const y = 160 + row * 96;
      const lv = MetaStore.level(u.id);
      const cost = MetaStore.nextCost(u.id);
      const can = cost !== undefined && MetaStore.sand >= cost;
      const bg = this.add.rectangle(0, 0, 570, 84, COLORS.panel, 1).setStrokeStyle(3, can ? 0xc9a3ff : 0x3a2f45, 1);
      const icon = this.add.text(-255, 0, u.icon, { fontSize: '34px' }).setOrigin(0.5);
      const name = this.add.text(-220, -18, `${u.name}　Lv.${lv}/${u.max}`, {
        fontFamily: FONT, fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      const desc = this.add.text(-220, 16, `每級：${u.desc}`, { fontFamily: FONT, fontSize: '16px', color: '#d8d0e6' }).setOrigin(0, 0.5);
      const pips = this.add.graphics();
      for (let k = 0; k < u.max; k++) pips.fillStyle(k < lv ? 0xc9a3ff : 0x3a2f45, 1).fillRect(110 + k * 14, -26, 10, 10);
      const price = this.add.text(270, 14, cost === undefined ? '已滿級' : `⌛ ${cost}`, {
        fontFamily: FONT, fontSize: '22px', color: cost === undefined ? '#7eff8a' : can ? '#9fe3ff' : '#6a6070', fontStyle: 'bold',
      }).setOrigin(1, 0.5);
      const card = this.add.container(x, y, [bg, icon, name, desc, pips, price]).setSize(570, 84);
      if (can) {
        card.setInteractive({ useHandCursor: true });
        card.on('pointerup', () => {
          if (MetaStore.buy(u.id)) {
            Sound.play('fission');
            this.scene.restart();
          }
        });
      }
    });
    textButton(this, GAME_W / 2, 664, 260, 64, '關閉', () => {
      this.scene.stop();
      this.scene.resume('Game');
    });
  }
}
