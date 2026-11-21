import Phaser from 'phaser';
import { COLORS, DEPTH, FONT, RARITY, RIGHT } from '../config';
import { RECIPES, hexToInt, potionQuality, recipeKey } from '../data';
import type { BuffSystem } from '../systems/BuffSystem';
import { CodexStore } from '../systems/CodexStore';
import type { CrucibleSystem } from '../systems/CrucibleSystem';
import type { Material } from '../types';

/** 右下小坩堝：3 格（框色＝稀有度，點擊丟棄），上方小字顯示品質 / 配方 / 裂變率 */
export class CrucibleBar {
  private slotBgs: Phaser.GameObjects.Image[] = [];
  private slotIcons: Phaser.GameObjects.Image[] = [];
  private hint: Phaser.GameObjects.Text;
  private panel: Phaser.GameObjects.Rectangle;
  /** 煉成按鈕會用到的位置（爆光特效） */
  readonly cx: number;
  readonly cy: number;

  constructor(scene: Phaser.Scene, private crucible: CrucibleSystem, buffs: BuffSystem) {
    const size = 50;
    const gap = 6;
    this.cy = 386;
    this.cx = RIGHT - 150;
    this.panel = scene.add.rectangle(this.cx, this.cy, 3 * size + 4 * gap, size + 2 * gap, 0x120d18, 0.55)
      .setStrokeStyle(2, COLORS.accent, 0.35).setDepth(DEPTH.ui - 1);
    [-1, 0, 1].forEach((k, i) => {
      const x = this.cx + k * (size + gap);
      const bg = scene.add.image(x, this.cy, 'slot').setDepth(DEPTH.ui).setDisplaySize(size, size).setAlpha(0.8)
        .setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => {
        if (this.crucible.slots[i]) scene.tweens.add({ targets: this.slotIcons[i], alpha: 0, duration: 120, yoyo: true });
        this.crucible.discard(i);
      });
      this.slotBgs.push(bg);
      this.slotIcons.push(scene.add.image(x, this.cy, 'ing_J').setDepth(DEPTH.ui + 1).setDisplaySize(32, 32).setVisible(false));
    });
    this.hint = scene.add.text(this.cx, this.cy - size / 2 - 16, '', {
      fontFamily: FONT, fontSize: '14px', color: COLORS.textDim, stroke: '#000', strokeThickness: 3,
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
    c.slots.forEach((m, i) => {
      const icon = this.slotIcons[i];
      if (m) icon.setTexture(`ing_${m.el}`).setVisible(true).setAlpha(1).setDisplaySize(28 + m.r * 3, 28 + m.r * 3);
      else icon.setVisible(false);
      this.slotBgs[i].setTint(m ? hexToInt(RARITY[m.r].color) : 0xffffff).setAlpha(m ? 1 : 0.6);
    });
    const fission = `裂變 ${Math.round(c.fissionChance * 100)}%`;
    if (c.filled === 3) {
      const mats = c.slots as Material[];
      const key = recipeKey(mats.map((m) => m.el));
      const q = RARITY[potionQuality(mats)];
      this.hint.setText(`${q.name}・${CodexStore.has(key) ? RECIPES[key].name : '未知配方'}　${fission}`).setColor(q.color);
      this.panel.setStrokeStyle(3, hexToInt(q.color), 0.9);
    } else {
      this.hint.setText(c.filled ? fission : '').setColor('#ff9ab0');
      this.panel.setStrokeStyle(2, COLORS.accent, 0.35);
    }
  }
}
