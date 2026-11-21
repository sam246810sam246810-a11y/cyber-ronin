import Phaser from 'phaser';
import { COLORS, FONT, GAME_H, GAME_W, RIGHT, SAFE_X, cx } from '../config';
import { goldify } from '../ui/textStyle';
import { hasIcon, isArtTexture } from '../utils';
import { META_UPGRADES } from '../data';
import { MetaStore } from '../systems/MetaStore';
import { Sound } from '../systems/SoundSystem';
import { ConfirmPicker, guardInput, textButton } from '../ui/widgets';

/** 大坩堝：用時之砂購買永久升級 */
export class MetaScene extends Phaser.Scene {
  constructor() {
    super('Meta');
  }

  create(): void {
    if (isArtTexture(this, 'bg_meta') && isArtTexture(this, 'ui_tile') && hasIcon(this, 'meta_vitality')) {
      this.createArt();
      return;
    }
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x05030a, 0.9).setInteractive();
    this.add.text(GAME_W / 2, 46, '大坩堝・永久升級', { fontFamily: FONT, fontSize: '36px', color: '#c9a3ff', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 90, `⌛ 時之砂：${MetaStore.sand}　（精英、Boss、時空裂縫、通過的樓層都會給）`, {
      fontFamily: FONT, fontSize: '19px', color: '#9fe3ff',
    }).setOrigin(0.5);

    guardInput(this);
    const cards: { card: Phaser.GameObjects.Container; bg: Phaser.GameObjects.Rectangle; price: Phaser.GameObjects.Text; text: string }[] = [];
    const hint = this.add.text(GAME_W / 2, 620, '點升級查看，再點一次購買', { fontFamily: FONT, fontSize: '18px', color: '#c9c9c9' }).setOrigin(0.5);
    const picker = new ConfirmPicker((i, prev) => {
      if (prev >= 0) {
        cards[prev].bg.setStrokeStyle(3, 0xc9a3ff, 1);
        cards[prev].price.setText(cards[prev].text);
        this.tweens.add({ targets: cards[prev].card, scale: 1, duration: 120 });
      }
      cards[i].bg.setStrokeStyle(6, 0xffffff, 1);
      cards[i].price.setText('再點一次購買');
      this.tweens.add({ targets: cards[i].card, scale: 1.04, duration: 140, ease: 'Back.Out' });
      hint.setText(`再點一次購買「${META_UPGRADES[i].name}」`).setColor('#ffd166');
      Sound.play('card');
    });
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
      cards[i] = { card, bg, price, text: price.text };
      if (can) {
        card.setInteractive({ useHandCursor: true });
        card.on('pointerup', () => picker.tap(i, () => {
          if (MetaStore.buy(u.id)) {
            Sound.play('fission');
            this.scene.restart();
          }
        }, this));
      }
    });
    textButton(this, GAME_W / 2, 664, 260, 64, '關閉', () => {
      this.scene.stop();
      this.scene.resume('Game');
    });
  }

  /** 選單 B：升級磚塊分兩欄圍繞中間的大坩堝，下方是說明列 */
  private createArt(): void {
    const bg = this.add.image(GAME_W / 2, GAME_H / 2, 'bg_meta').setInteractive();
    bg.setScale(Math.max(GAME_W / bg.width, GAME_H / bg.height));
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x05030a, 0.25);
    const title = this.add.nineslice(GAME_W / 2, 46, 'ui_nameplate', undefined, 400, 72, 34, 34, 22, 22);
    goldify(this.add.text(GAME_W / 2, 46, '大坩堝・永久升級', { fontFamily: FONT, fontSize: '30px' })).setOrigin(0.5);
    void title;
    this.add.image(SAFE_X + 40, 44, 'icons', 'sand').setDisplaySize(34, 34);
    goldify(this.add.text(SAFE_X + 62, 44, `時之砂 ${MetaStore.sand}`, { fontFamily: FONT, fontSize: '24px' }), 'silver').setOrigin(0, 0.5);

    guardInput(this);
    const TW = 380, TH = 106;
    const detail = this.add.nineslice(GAME_W / 2, 652, 'ui_notice', undefined, Math.min(900, GAME_W - 80), 112, 80, 80, 50, 40);
    void detail;
    const dIcon = this.add.image(GAME_W / 2 - 380, 656, 'icons', 'meta_vitality').setDisplaySize(64, 64).setVisible(false);
    const dName = goldify(this.add.text(GAME_W / 2 - 330, 636, '', { fontFamily: FONT, fontSize: '24px' })).setOrigin(0, 0.5);
    const dDesc = this.add.text(GAME_W / 2 - 330, 674, '點左右的升級查看，再點一次購買', {
      fontFamily: FONT, fontSize: '18px', color: '#f4e6c8', wordWrap: { width: 560, useAdvancedWrap: true },
    }).setOrigin(0, 0.5);
    const tiles: { card: Phaser.GameObjects.Container; glow: Phaser.GameObjects.Rectangle; price: Phaser.GameObjects.Text; text: string }[] = [];
    const picker = new ConfirmPicker((i, prev) => {
      if (prev >= 0) {
        tiles[prev].glow.setVisible(false);
        tiles[prev].price.setText(tiles[prev].text);
        this.tweens.add({ targets: tiles[prev].card, scale: 1, duration: 120 });
      }
      const u = META_UPGRADES[i];
      tiles[i].glow.setVisible(true);
      tiles[i].price.setText('再點購買');
      this.tweens.add({ targets: tiles[i].card, scale: 1.05, duration: 140, ease: 'Back.Out' });
      dIcon.setFrame(`meta_${u.id}`).setDisplaySize(64, 64).setVisible(true);
      dName.setText(`${u.name}　Lv.${MetaStore.level(u.id)}/${u.max}`);
      dDesc.setText(`每級：${u.desc}　　再點一次購買`);
      Sound.play('card');
    });
    const colX = [GAME_W / 2 - 400, GAME_W / 2 + 400];
    META_UPGRADES.forEach((u, i) => {
      const col = i < 5 ? 0 : 1;
      const row = i % 5;
      const x = colX[col];
      const y = 150 + row * 92;
      const lv = MetaStore.level(u.id);
      const cost = MetaStore.nextCost(u.id);
      const can = cost !== undefined && MetaStore.sand >= cost;
      const glow = this.add.rectangle(0, 0, TW - 10, TH - 22, 0xffd166, 0).setStrokeStyle(4, 0xffe9a0, 1).setVisible(false);
      const tile = this.add.image(0, 0, 'ui_tile').setDisplaySize(TW, TH).setAlpha(can || cost === undefined ? 1 : 0.8);
      const ix = -TW / 2 + TW * 0.182;
      const icon = this.add.image(ix, 0, 'icons', `meta_${u.id}`).setDisplaySize(TH * 0.52, TH * 0.52);
      const name = goldify(this.add.text(ix + 46, -16, u.name, { fontFamily: FONT, fontSize: '20px' }), 'gold', 4).setOrigin(0, 0.5);
      const pips: Phaser.GameObjects.Image[] = [];
      for (let k = 0; k < u.max; k++) {
        pips.push(this.add.image(ix + 54 + k * 20, 16, 'icons', k < lv ? 'pip_on' : 'pip_off').setDisplaySize(18, 18));
      }
      const price = this.add.text(TW / 2 - 26, 16, cost === undefined ? '滿級' : `${cost}`, {
        fontFamily: FONT, fontSize: '20px', color: cost === undefined ? '#7eff8a' : can ? '#9fe3ff' : '#8a8090', fontStyle: 'bold',
        stroke: '#1a0e06', strokeThickness: 4,
      }).setOrigin(1, 0.5);
      const sandIc = cost === undefined ? [] : [this.add.image(TW / 2 - 34 - price.width, 16, 'icons', 'sand').setDisplaySize(20, 20)];
      const card = this.add.container(x, y, [glow, tile, icon, name, ...pips, ...sandIc, price]).setSize(TW, TH);
      tiles[i] = { card, glow, price, text: price.text };
      card.setInteractive({ useHandCursor: true });
      card.on('pointerup', () => picker.tap(i, () => {
        if (can && MetaStore.buy(u.id)) {
          Sound.play('fission');
          this.scene.restart();
        }
      }, this));
    });
    const back = this.add.image(RIGHT - 60, 52, 'icons', 'back').setDisplaySize(64, 64).setInteractive({ useHandCursor: true });
    back.on('pointerup', () => {
      this.scene.stop();
      this.scene.resume('Game');
    });
  }
}
