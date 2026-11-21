import Phaser from 'phaser';
import { iconOrText } from '../ui/icons';
import { isArtTexture } from '../utils';
import { DEPTH, FONT, RARITY } from '../config';
import { hexToInt } from '../data';
import type { RelicDef } from '../types';

/** 地上的聖物：碰到就拿（滿格時會詢問要換掉哪一個） */
export class RelicPickup {
  alive = true;
  armed: boolean;
  private t = 0;
  private objs: Phaser.GameObjects.GameObject[];
  private icon: Phaser.GameObjects.Image | Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, readonly relic: RelicDef, public x: number, public y: number, armed = true) {
    this.armed = armed;
    const c = hexToInt(RARITY[relic.rarity].color);
    const glow = scene.add.image(x, y, 'circle').setTint(c).setAlpha(0.3).setDisplaySize(76, 76).setDepth(DEPTH.pickup);
    const gem = scene.add.image(x, y, 'relic').setTint(isArtTexture(scene, 'relic') ? 0xffffff : c).setDisplaySize(56, 56).setDepth(DEPTH.pickup);
    this.icon = iconOrText(scene, x, y, `relic_${relic.id}`, relic.icon, 60).setDepth(DEPTH.pickup + 1);
    if (this.icon instanceof Phaser.GameObjects.Image) gem.setVisible(false);
    const label = scene.add.text(x, y - 46, `聖物・${relic.name}`, {
      fontFamily: FONT, fontSize: '16px', color: RARITY[relic.rarity].color, fontStyle: 'bold', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH.pickup + 2);
    this.objs = [glow, gem, this.icon, label];
    if (relic.rarity >= 2) {
      const beam = scene.add.rectangle(x, y - 70, 12, 140, c, 0.6).setDepth(DEPTH.pickup);
      scene.tweens.add({ targets: beam, alpha: 0, scaleX: 3, duration: 800, onComplete: () => beam.destroy() });
    }
  }

  update(dt: number): void {
    this.t += dt;
    this.icon.setY(this.y + Math.sin(this.t * 3) * 4);
  }

  destroy(): void {
    this.alive = false;
    this.objs.forEach((o) => o.destroy());
  }
}
