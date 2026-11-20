import Phaser from 'phaser';
import { BAR_H, BAR_Y, COLORS, DEPTH, FONT, GAME_W } from '../config';
import { INGREDIENT_MAP, hexToInt } from '../data';
import type { CrucibleSystem } from '../systems/CrucibleSystem';
import { CodexStore } from '../systems/CodexStore';
import { recipeKey } from '../data';
import type { IngredientId } from '../types';

/** 坩堝列：3 個槽位（點擊丟棄）＋ 煉成鍵 ＋ 藥水架 */
export class CrucibleBar {
  private slotBgs: Phaser.GameObjects.Image[] = [];
  private slotIcons: Phaser.GameObjects.Image[] = [];
  private brewBtn: Phaser.GameObjects.Container;
  private brewBg: Phaser.GameObjects.Rectangle;
  private brewText: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private rackIcons: Phaser.GameObjects.Image[] = [];
  private rackText: Phaser.GameObjects.Text;
  private cauldron: Phaser.GameObjects.Image;

  constructor(private scene: Phaser.Scene, private crucible: CrucibleSystem, onBrew: () => void) {
    const cy = BAR_Y + BAR_H / 2;
    scene.add.rectangle(GAME_W / 2, cy, GAME_W, BAR_H, COLORS.bar).setDepth(DEPTH.ui - 1);
    scene.add.rectangle(GAME_W / 2, BAR_Y, GAME_W, 4, COLORS.accent, 0.5).setDepth(DEPTH.ui - 1);

    this.cauldron = scene.add.image(150, cy + 8, 'cauldron').setDepth(DEPTH.ui - 1).setDisplaySize(290, 100).setAlpha(0.5);

    const slotX = [62, 150, 238];
    slotX.forEach((x, i) => {
      const bg = scene.add.image(x, cy - 4, 'slot').setDepth(DEPTH.ui).setDisplaySize(76, 76)
        .setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => {
        if (this.crucible.slots[i]) {
          scene.tweens.add({ targets: this.slotIcons[i], alpha: 0, duration: 120, yoyo: true });
        }
        this.crucible.discard(i);
      });
      const icon = scene.add.image(x, cy - 4, 'ing_J').setDepth(DEPTH.ui + 1).setDisplaySize(46, 46).setVisible(false);
      this.slotBgs.push(bg);
      this.slotIcons.push(icon);
    });
    this.hint = scene.add.text(150, BAR_Y + BAR_H - 12, '點槽位可丟棄', {
      fontFamily: FONT, fontSize: '15px', color: COLORS.textDim,
    }).setOrigin(0.5).setDepth(DEPTH.ui);

    // 煉成鍵
    this.brewBg = scene.add.rectangle(0, 0, 130, 76, COLORS.panelLight).setStrokeStyle(3, COLORS.accent, 0.4);
    this.brewText = scene.add.text(0, 0, '煉成', {
      fontFamily: FONT, fontSize: '28px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.brewBtn = scene.add.container(370, cy - 4, [this.brewBg, this.brewText]).setDepth(DEPTH.ui)
      .setSize(130, 76).setInteractive({ useHandCursor: true });
    this.brewBtn.on('pointerdown', () => {
      if (this.crucible.canBrew) scene.tweens.add({ targets: this.brewBtn, scale: 0.92, duration: 60, yoyo: true });
      onBrew();
    });

    // 藥水架
    scene.add.rectangle(580, cy - 4, 236, 84, 0x000000, 0.25).setStrokeStyle(2, COLORS.accent, 0.3).setDepth(DEPTH.ui - 1);
    for (let i = 0; i < 2; i++) {
      this.rackIcons.push(
        scene.add.image(500 + i * 44, cy - 4, 'flask').setDepth(DEPTH.ui).setDisplaySize(38, 46).setVisible(false),
      );
    }
    this.rackText = scene.add.text(600, cy - 4, '', {
      fontFamily: FONT, fontSize: '20px', color: COLORS.text, wordWrap: { width: 120 }, align: 'left',
    }).setOrigin(0, 0.5).setDepth(DEPTH.ui);

    crucible.on('changed', this.refresh, this);
    scene.events.once('shutdown', () => crucible.off('changed', this.refresh, this));
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

    const full = c.filled === 3;
    const can = c.canBrew;
    this.brewBg.setFillStyle(can ? 0x7a4fc0 : COLORS.panelLight, can ? 1 : 0.6);
    this.brewBg.setStrokeStyle(3, can ? 0xffffff : COLORS.accent, can ? 0.9 : 0.3);
    this.brewText.setText(c.state === 'brewing' ? '煉成中' : '煉成').setAlpha(can ? 1 : 0.5);
    if (can) {
      this.scene.tweens.killTweensOf(this.brewBtn);
      this.brewBtn.setScale(1);
      this.scene.tweens.add({ targets: this.brewBtn, scale: 1.06, duration: 400, yoyo: true, repeat: -1 });
    } else {
      this.scene.tweens.killTweensOf(this.brewBtn);
      this.brewBtn.setScale(1);
    }

    if (full && c.rack.length > 0) this.hint.setText('先把手上的藥水丟出去');
    else if (full) {
      const key = recipeKey(c.slots as IngredientId[]);
      this.hint.setText(CodexStore.has(key) ? '已知配方' : '未知配方…？');
    } else this.hint.setText('點槽位可丟棄');

    this.rackIcons.forEach((icon, i) => {
      const r = c.rack[i];
      icon.setVisible(!!r);
      if (r) icon.setTint(hexToInt(r.color));
    });
    this.rackIcons[1].setAlpha(c.rackCapacity > 1 ? 1 : 0.3);
    const top = c.rack[0];
    this.rackText.setX(c.rack.length > 1 ? 560 : 528);
    this.rackText.setText(top ? top.name : c.rackCapacity > 1 ? '藥水架 0/2' : '藥水架\n（空）');
    this.rackText.setColor(top ? '#ffffff' : COLORS.textDim);
    this.cauldron.setTint(full ? 0xc9a3ff : 0x6a5a7a);
  }
}
