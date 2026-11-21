import Phaser from 'phaser';
import { COLORS, FONT, GAME_H, GAME_W, RARITY, cx } from '../config';
import { RELICS, RELIC_UNLOCK_COST, hexToInt } from '../data';
import { MetaStore } from '../systems/MetaStore';
import { Sound } from '../systems/SoundSystem';
import { ConfirmPicker, guardInput, textButton } from '../ui/widgets';
import { iconOrText } from '../ui/icons';
import { goldify } from '../ui/textStyle';
import { hasIcon, isArtTexture } from '../utils';

/** 聖物展示架：查看所有聖物，用時之砂解鎖新的聖物加入掉落池 */
export class RelicShelfScene extends Phaser.Scene {
  constructor() {
    super('RelicShelf');
  }

  create(): void {
    const art = isArtTexture(this, 'bg_relic') && hasIcon(this, `relic_${RELICS[0].id}`) && isArtTexture(this, 'ui_slot');
    if (art) {
      const bgi = this.add.image(GAME_W / 2, GAME_H / 2, 'bg_relic').setInteractive();
      bgi.setScale(Math.max(GAME_W / bgi.width, GAME_H / bgi.height));
      this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x05030a, 0.45);
      this.add.nineslice(GAME_W / 2, 38, 'ui_nameplate', undefined, 300, 64, 34, 34, 22, 22);
      goldify(this.add.text(GAME_W / 2, 38, '聖物展示架', { fontFamily: FONT, fontSize: '28px' })).setOrigin(0.5);
      this.add.nineslice(GAME_W / 2, 600, 'ui_notice', undefined, Math.min(920, GAME_W - 80), 96, 80, 80, 46, 36);
    } else {
      this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x05030a, 0.92).setInteractive();
      this.add.text(GAME_W / 2, 40, '聖物展示架', { fontFamily: FONT, fontSize: '34px', color: '#ffd166', fontStyle: 'bold' }).setOrigin(0.5);
    }
    const unlocked = RELICS.filter((r) => MetaStore.relicUnlocked(r.id)).length;
    this.add.text(GAME_W / 2, 80, `已解鎖 ${unlocked}/${RELICS.length}　⌛ 時之砂：${MetaStore.sand}　（解鎖後才會在冒險中出現）`, {
      fontFamily: FONT, fontSize: '18px', color: '#9fe3ff',
    }).setOrigin(0.5);

    const detailTitle = this.add.text(GAME_W / 2, 586, '點聖物查看效果', {
      fontFamily: FONT, fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    const detailBody = this.add.text(GAME_W / 2, 616, '', { fontFamily: FONT, fontSize: '18px', color: '#d8d0e6' }).setOrigin(0.5);

    guardInput(this);
    let selBg: Phaser.GameObjects.Rectangle | undefined;
    const picker = new ConfirmPicker(() => Sound.play('card'));
    RELICS.forEach((r, i) => {
      const col = i % 6;
      const row = Math.floor(i / 6);
      const x = cx(240 + col * 160);
      const y = 150 + row * 106;
      const on = MetaStore.relicUnlocked(r.id);
      const rc = hexToInt(RARITY[r.rarity].color);
      const cost = RELIC_UNLOCK_COST[r.rarity];
      const bg = this.add.rectangle(x, y, 148, 96, on ? COLORS.panel : 0x15101c, art ? 0 : 1).setStrokeStyle(3, rc, on ? (art ? 0.7 : 1) : 0.35)
        .setInteractive({ useHandCursor: true });
      if (art) {
        // 黃銅格子＋聖物圖示；還沒解鎖的壓暗並加鎖頭
        this.add.image(x, y - 12, 'ui_slot').setDisplaySize(68, 68).setAlpha(on ? 1 : 0.7);
        const ic = iconOrText(this, x, y - 12, `relic_${r.id}`, r.icon, 54);
        if (!on && ic instanceof Phaser.GameObjects.Image) ic.setTint(0x2a2a38);
        if (!on) this.add.image(x + 22, y + 8, 'icons', 'lock').setDisplaySize(24, 24);
        const label = this.add.text(x, y + 34, on ? r.name : `${cost}`, {
          fontFamily: FONT, fontSize: '15px', color: on ? '#ffffff' : MetaStore.sand >= cost ? '#9fe3ff' : '#8a8090', fontStyle: 'bold',
          stroke: '#1a0e06', strokeThickness: 4,
        }).setOrigin(0.5);
        if (!on) this.add.image(x - label.width / 2 - 12, y + 34, 'icons', 'sand').setDisplaySize(18, 18);
      } else {
        this.add.text(x, y - 18, r.icon, { fontSize: '30px' }).setOrigin(0.5).setAlpha(on ? 1 : 0.35);
        this.add.text(x, y + 24, on ? r.name : `🔒 ⌛${cost}`, {
          fontFamily: FONT, fontSize: '15px', color: on ? '#ffffff' : MetaStore.sand >= cost ? '#9fe3ff' : '#6a6070', fontStyle: 'bold',
        }).setOrigin(0.5);
      }
      bg.on('pointerup', () => {
        detailTitle.setText(`【${RARITY[r.rarity].name}】${r.name}`).setColor(RARITY[r.rarity].color);
        selBg?.setStrokeStyle(3, selBg.getData('rc') as number, 1);
        bg.setData('rc', rc);
        bg.setStrokeStyle(6, 0xffffff, 1);
        selBg = bg;
        if (on) {
          detailBody.setText(r.desc).setColor('#d8d0e6');
          return;
        }
        if (MetaStore.sand < cost) {
          detailBody.setText(`${r.desc}　—　解鎖需要 ⌛${cost}（時之砂不足）`).setColor('#d8d0e6');
          return;
        }
        // 第一次點：顯示說明與價格；再點一次才解鎖
        detailBody.setText(`${r.desc}　—　再點一次花 ⌛${cost} 解鎖`).setColor('#ffd166');
        picker.tap(i, () => {
          if (MetaStore.unlockRelic(r.id)) {
            Sound.play('fission');
            this.scene.restart();
          }
        }, this);
      });
    });
    textButton(this, GAME_W / 2, 684, 220, 50, '關閉', () => {
      this.scene.stop();
      this.scene.resume('Game');
    });
  }
}
