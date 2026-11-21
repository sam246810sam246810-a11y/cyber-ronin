import Phaser from 'phaser';
import { BAR_H, BAR_Y, COLORS, DEPTH, FONT, GAME_W } from '../config';
import { INGREDIENT_MAP, hexToInt, recipeKey } from '../data';
import type { BuffSystem } from '../systems/BuffSystem';
import { CodexStore } from '../systems/CodexStore';
import type { CrucibleSystem } from '../systems/CrucibleSystem';
import type { IngredientId } from '../types';

/** 坩堝列：3 個槽位（點擊丟棄）＋ 煉成鍵 ＋ 已累積的屬性與裂變率 */
export class CrucibleBar {
  private slotBgs: Phaser.GameObjects.Image[] = [];
  private slotIcons: Phaser.GameObjects.Image[] = [];
  private brewBtn: Phaser.GameObjects.Container;
  private brewBg: Phaser.GameObjects.Rectangle;
  private brewText: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private elemTexts: Record<IngredientId, Phaser.GameObjects.Text>;
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
      const bg = scene.add.image(x, cy - 4, 'slot').setDepth(DEPTH.ui).setDisplaySize(76, 76)
        .setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => {
        if (this.crucible.slots[i]) scene.tweens.add({ targets: this.slotIcons[i], alpha: 0, duration: 120, yoyo: true });
        this.crucible.discard(i);
      });
      this.slotBgs.push(bg);
      this.slotIcons.push(scene.add.image(x, cy - 4, 'ing_J').setDepth(DEPTH.ui + 1).setDisplaySize(46, 46).setVisible(false));
    });
    this.hint = scene.add.text(150, BAR_Y + BAR_H - 12, '點槽位可丟棄', {
      fontFamily: FONT, fontSize: '15px', color: COLORS.textDim,
    }).setOrigin(0.5).setDepth(DEPTH.ui);

    this.brewBg = scene.add.rectangle(0, 0, 124, 76, COLORS.panelLight).setStrokeStyle(3, COLORS.accent, 0.4);
    this.brewText = scene.add.text(0, 0, '煉成', {
      fontFamily: FONT, fontSize: '28px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.brewBtn = scene.add.container(364, cy - 4, [this.brewBg, this.brewText]).setDepth(DEPTH.ui)
      .setSize(124, 76).setInteractive({ useHandCursor: true });
    this.brewBtn.on('pointerdown', onBrew);

    // 屬性面板
    scene.add.rectangle(574, cy - 4, 248, 92, 0x000000, 0.25).setStrokeStyle(2, COLORS.accent, 0.3).setDepth(DEPTH.ui - 1);
    const ids: IngredientId[] = ['J', 'I', 'S'];
    this.elemTexts = {} as Record<IngredientId, Phaser.GameObjects.Text>;
    ids.forEach((id, i) => {
      const x = 476 + i * 80;
      scene.add.image(x, cy - 22, `ing_${id}`).setDisplaySize(26, 26).setDepth(DEPTH.ui);
      this.elemTexts[id] = scene.add.text(x + 16, cy - 22, '0', {
        fontFamily: FONT, fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0, 0.5).setDepth(DEPTH.ui);
    });
    this.fissionText = scene.add.text(574, cy + 20, '', {
      fontFamily: FONT, fontSize: '18px', color: '#ffd166',
    }).setOrigin(0.5).setDepth(DEPTH.ui);

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
    c.slots.forEach((id, i) => {
      const icon = this.slotIcons[i];
      if (id) icon.setTexture(`ing_${id}`).setVisible(true).setAlpha(1).setDisplaySize(46, 46);
      else icon.setVisible(false);
      this.slotBgs[i].setTint(id ? hexToInt(INGREDIENT_MAP[id].color) : 0xffffff).setAlpha(id ? 0.9 : 0.6);
    });

    const can = c.canBrew;
    this.brewBg.setFillStyle(can ? 0x7a4fc0 : COLORS.panelLight, can ? 1 : 0.6);
    this.brewBg.setStrokeStyle(3, can ? 0xffffff : COLORS.accent, can ? 0.9 : 0.3);
    this.brewText.setText(c.state === 'brewing' ? '煉成中' : '煉成').setAlpha(can ? 1 : 0.5);
    this.scene.tweens.killTweensOf(this.brewBtn);
    this.brewBtn.setScale(1);
    if (can) this.scene.tweens.add({ targets: this.brewBtn, scale: 1.06, duration: 400, yoyo: true, repeat: -1 });

    if (c.filled === 3) {
      const key = recipeKey(c.slots as IngredientId[]);
      this.hint.setText(CodexStore.has(key) ? '已知配方，按煉成喝下' : '未知配方…？');
    } else this.hint.setText('點槽位可丟棄');

    (['J', 'I', 'S'] as IngredientId[]).forEach((id) => this.elemTexts[id].setText(String(this.buffs.elements[id])));
    this.fissionText.setText(`裂變率 ${Math.round(c.fissionChance * 100)}%`);
    this.cauldron.setTint(c.filled === 3 ? 0xc9a3ff : 0x6a5a7a);
  }
}
