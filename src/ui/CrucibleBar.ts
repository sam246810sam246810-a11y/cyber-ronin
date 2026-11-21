import Phaser from 'phaser';
import { COLORS, DEPTH, FONT, RARITY, TOP_H } from '../config';
import { ELEMENT_IDS, RECIPES, hexToInt, potionQuality, recipeKey } from '../data';
import type { BuffSystem } from '../systems/BuffSystem';
import { CodexStore } from '../systems/CodexStore';
import type { CrucibleSystem } from '../systems/CrucibleSystem';
import type { ElementId, Material } from '../types';

/** 上方資訊列中央：3 個槽位（框色＝稀有度，點擊丟棄）＋ 煉成鍵 ＋ 5 元素累積與裂變率 */
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
    const cy = 40;
    this.cauldron = scene.add.image(370, cy + 4, 'cauldron').setDepth(DEPTH.ui - 1).setDisplaySize(236, 76).setAlpha(0.45);
    [300, 370, 440].forEach((x, i) => {
      const bg = scene.add.image(x, cy, 'slot').setDepth(DEPTH.ui).setDisplaySize(60, 60).setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => {
        if (this.crucible.slots[i]) scene.tweens.add({ targets: this.slotIcons[i], alpha: 0, duration: 120, yoyo: true });
        this.crucible.discard(i);
      });
      this.slotBgs.push(bg);
      this.slotIcons.push(scene.add.image(x, cy, 'ing_J').setDepth(DEPTH.ui + 1).setDisplaySize(38, 38).setVisible(false));
    });
    this.hint = scene.add.text(370, TOP_H - 10, '', { fontFamily: FONT, fontSize: '13px', color: COLORS.textDim })
      .setOrigin(0.5).setDepth(DEPTH.ui);

    this.brewBg = scene.add.rectangle(0, 0, 104, 58, COLORS.panelLight).setStrokeStyle(3, COLORS.accent, 0.4);
    this.brewText = scene.add.text(0, 0, '煉成', { fontFamily: FONT, fontSize: '24px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    this.brewBtn = scene.add.container(540, cy, [this.brewBg, this.brewText]).setDepth(DEPTH.ui)
      .setSize(104, 58).setInteractive({ useHandCursor: true });
    this.brewBtn.on('pointerdown', onBrew);

    scene.add.rectangle(745, cy + 2, 270, 78, 0x000000, 0.25).setStrokeStyle(2, COLORS.accent, 0.3).setDepth(DEPTH.ui - 1);
    ELEMENT_IDS.forEach((id, i) => {
      const x = 640 + i * 52;
      scene.add.image(x, cy - 12, `ing_${id}`).setDisplaySize(24, 24).setDepth(DEPTH.ui);
      this.elemTexts[id] = scene.add.text(x, cy + 13, '0', { fontFamily: FONT, fontSize: '16px', color: '#ffffff', fontStyle: 'bold' })
        .setOrigin(0.5).setDepth(DEPTH.ui);
    });
    this.fissionText = scene.add.text(745, cy + 33, '', { fontFamily: FONT, fontSize: '13px', color: '#ff8aa0' })
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
      if (m) icon.setTexture(`ing_${m.el}`).setVisible(true).setAlpha(1).setDisplaySize(34 + m.r * 3, 34 + m.r * 3);
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
