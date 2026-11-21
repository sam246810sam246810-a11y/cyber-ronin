import Phaser from 'phaser';
import { BAR_H, BAR_Y, COLORS, DEPTH, FONT, GAME_W, RARITY } from '../config';
import { ELEMENT_IDS, RECIPES, hexToInt, potionQuality, recipeKey } from '../data';
import type { BuffSystem } from '../systems/BuffSystem';
import { CodexStore } from '../systems/CodexStore';
import type { CrucibleSystem } from '../systems/CrucibleSystem';
import type { ElementId, Material } from '../types';

/** 坩堝列：3 個槽位（框色＝稀有度，點擊丟棄）＋ 煉成鍵 ＋ 5 元素累積與裂變率 */
export class CrucibleBar {
  private slotBgs: Phaser.GameObjects.Image[] = [];
  private slotIcons: Phaser.GameObjects.Image[] = [];
  private brewBtn: Phaser.GameObjects.Container;
  private brewBg: Phaser.GameObjects.Rectangle;
  private brewText: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private elemTexts = {} as Record<ElementId, Phaser.GameObjects.Text>;
  private fissionText: Phaser.GameObjects.Text;
  private cauldron: Phaser.GameObjects.Image;

  constructor(
    private scene: Phaser.Scene, private crucible: CrucibleSystem, private buffs: BuffSystem, onBrew: () => void,
  ) {
    const cy = BAR_Y + BAR_H / 2;
    scene.add.rectangle(GAME_W / 2, cy, GAME_W, BAR_H, COLORS.bar).setDepth(DEPTH.ui - 1);
    scene.add.rectangle(GAME_W / 2, BAR_Y, GAME_W, 4, COLORS.accent, 0.5).setDepth(DEPTH.ui - 1);
    this.cauldron = scene.add.image(150, cy + 8, 'cauldron').setDepth(DEPTH.ui - 1).setDisplaySize(290, 100).setAlpha(0.5);

    [62, 150, 238].forEach((x, i) => {
      const bg = scene.add.image(x, cy - 8, 'slot').setDepth(DEPTH.ui).setDisplaySize(76, 76)
        .setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => {
        if (this.crucible.slots[i]) scene.tweens.add({ targets: this.slotIcons[i], alpha: 0, duration: 120, yoyo: true });
        this.crucible.discard(i);
      });
      this.slotBgs.push(bg);
      this.slotIcons.push(scene.add.image(x, cy - 8, 'ing_J').setDepth(DEPTH.ui + 1).setDisplaySize(46, 46).setVisible(false));
    });
    this.hint = scene.add.text(150, BAR_Y + BAR_H - 14, '', {
      fontFamily: FONT, fontSize: '15px', color: COLORS.textDim,
    }).setOrigin(0.5).setDepth(DEPTH.ui);

    this.brewBg = scene.add.rectangle(0, 0, 116, 76, COLORS.panelLight).setStrokeStyle(3, COLORS.accent, 0.4);
    this.brewText = scene.add.text(0, 0, '煉成', { fontFamily: FONT, fontSize: '28px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    this.brewBtn = scene.add.container(354, cy - 8, [this.brewBg, this.brewText]).setDepth(DEPTH.ui)
      .setSize(116, 76).setInteractive({ useHandCursor: true });
    this.brewBtn.on('pointerdown', onBrew);

    scene.add.rectangle(568, cy - 4, 284, 96, 0x000000, 0.25).setStrokeStyle(2, COLORS.accent, 0.3).setDepth(DEPTH.ui - 1);
    ELEMENT_IDS.forEach((id, i) => {
      const x = 446 + i * 56;
      scene.add.image(x, cy - 26, `ing_${id}`).setDisplaySize(26, 26).setDepth(DEPTH.ui);
      this.elemTexts[id] = scene.add.text(x, cy + 2, '0', {
        fontFamily: FONT, fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(DEPTH.ui);
    });
    this.fissionText = scene.add.text(568, cy + 30, '', { fontFamily: FONT, fontSize: '16px', color: '#ff8aa0' })
      .setOrigin(0.5).setDepth(DEPTH.ui);

    crucible.on('changed', this.refresh, this);
    buffs.on('changed', this.refresh, this);
    scene.events.once('shutdown', () => {
      crucible.off('changed', this.refresh, this);
      buffs.off('changed', this.refresh, this);
    });
    this.refresh();
  }

  refresh(): void {
    const c = this.crucible;
    c.slots.forEach((m, i) => {
      const icon = this.slotIcons[i];
      if (m) icon.setTexture(`ing_${m.el}`).setVisible(true).setAlpha(1).setDisplaySize(40 + m.r * 3, 40 + m.r * 3);
      else icon.setVisible(false);
      this.slotBgs[i].setTint(m ? hexToInt(RARITY[m.r].color) : 0xffffff).setAlpha(m ? 1 : 0.5);
    });

    const can = c.canBrew;
    this.brewBg.setFillStyle(can ? 0x7a4fc0 : COLORS.panelLight, can ? 1 : 0.6);
    this.brewBg.setStrokeStyle(3, can ? 0xffffff : COLORS.accent, can ? 0.9 : 0.3);
    this.brewText.setText(c.state === 'brewing' ? '煉成中' : '煉成').setAlpha(can ? 1 : 0.5);
    this.scene.tweens.killTweensOf(this.brewBtn);
    this.brewBtn.setScale(1);
    if (can) this.scene.tweens.add({ targets: this.brewBtn, scale: 1.06, duration: 400, yoyo: true, repeat: -1 });

    if (c.filled === 3) {
      const mats = c.slots as Material[];
      const key = recipeKey(mats.map((m) => m.el));
      const q = RARITY[potionQuality(mats)];
      this.hint.setText(`${q.name}品質・${CodexStore.has(key) ? RECIPES[key].name : '未知配方'}`).setColor(q.color);
    } else {
      this.hint.setText('點槽位可丟棄').setColor(COLORS.textDim);
    }

    ELEMENT_IDS.forEach((id) => this.elemTexts[id].setText(String(Math.round(this.buffs.elements[id]))));
    this.fissionText.setText(`裂變率 ${Math.round(c.fissionChance * 100)}%`);
    this.cauldron.setTint(c.filled === 3 ? 0xc9a3ff : 0x6a5a7a);
  }
}
