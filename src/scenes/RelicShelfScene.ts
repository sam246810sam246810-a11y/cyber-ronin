import Phaser from 'phaser';
import { COLORS, FONT, GAME_H, GAME_W, RARITY, cx } from '../config';
import { RELICS, RELIC_UNLOCK_COST, hexToInt } from '../data';
import { MetaStore } from '../systems/MetaStore';
import { Sound } from '../systems/SoundSystem';
import { ConfirmPicker, guardInput, textButton } from '../ui/widgets';

/** 聖物展示架：查看所有聖物，用時之砂解鎖新的聖物加入掉落池 */
export class RelicShelfScene extends Phaser.Scene {
  constructor() {
    super('RelicShelf');
  }

  create(): void {
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x05030a, 0.92).setInteractive();
    this.add.text(GAME_W / 2, 40, '聖物展示架', { fontFamily: FONT, fontSize: '34px', color: '#ffd166', fontStyle: 'bold' }).setOrigin(0.5);
    const unlocked = RELICS.filter((r) => MetaStore.relicUnlocked(r.id)).length;
    this.add.text(GAME_W / 2, 80, `已解鎖 ${unlocked}/${RELICS.length}　⌛ 時之砂：${MetaStore.sand}　（解鎖後才會在冒險中出現）`, {
      fontFamily: FONT, fontSize: '18px', color: '#9fe3ff',
    }).setOrigin(0.5);

    const detailTitle = this.add.text(GAME_W / 2, 590, '點聖物查看效果', {
      fontFamily: FONT, fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    const detailBody = this.add.text(GAME_W / 2, 622, '', { fontFamily: FONT, fontSize: '18px', color: '#d8d0e6' }).setOrigin(0.5);

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
      const bg = this.add.rectangle(x, y, 148, 96, on ? COLORS.panel : 0x15101c, 1).setStrokeStyle(3, rc, on ? 1 : 0.35)
        .setInteractive({ useHandCursor: true });
      this.add.text(x, y - 18, r.icon, { fontSize: '30px' }).setOrigin(0.5).setAlpha(on ? 1 : 0.35);
      this.add.text(x, y + 24, on ? r.name : `🔒 ⌛${cost}`, {
        fontFamily: FONT, fontSize: '15px', color: on ? '#ffffff' : MetaStore.sand >= cost ? '#9fe3ff' : '#6a6070', fontStyle: 'bold',
      }).setOrigin(0.5);
      bg.on('pointerup', () => {
        detailTitle.setText(`【${RARITY[r.rarity].name}】${r.icon} ${r.name}`).setColor(RARITY[r.rarity].color);
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
    textButton(this, GAME_W / 2, 678, 240, 56, '關閉', () => {
      this.scene.stop();
      this.scene.resume('Game');
    });
  }
}
