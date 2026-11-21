import Phaser from 'phaser';
import { isArtTexture } from '../utils';
import { DEPTH, FONT, RARITY } from '../config';
import { hexToInt } from '../data';
import type { WeaponDef } from '../types';

/** 地上的武器：碰到就裝備（需先離開範圍才能再次觸發） */
export class WeaponPickup {
  alive = true;
  armed: boolean;
  private t = 0;
  private objs: Phaser.GameObjects.GameObject[];
  private icon: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, readonly weapon: WeaponDef, public x: number, public y: number, armed = true) {
    this.armed = armed;
    const c = hexToInt(RARITY[weapon.rarity].color);
    const glow = scene.add.image(x, y, 'circle').setTint(c).setAlpha(0.28).setDisplaySize(70, 70).setDepth(DEPTH.pickup);
    const ring = scene.add.image(x, y, 'ring').setTint(c).setDisplaySize(64, 64).setDepth(DEPTH.pickup);
    this.icon = scene.add.image(x, y, `wpn_${weapon.kind}`).setTint(isArtTexture(scene, `wpn_${weapon.kind}`) ? 0xffffff : c).setDisplaySize(52, 52).setDepth(DEPTH.pickup + 1);
    const label = scene.add.text(x, y - 46, weapon.name, {
      fontFamily: FONT, fontSize: '17px', color: RARITY[weapon.rarity].color, fontStyle: 'bold', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH.pickup + 2);
    this.objs = [glow, ring, this.icon, label];
    if (weapon.rarity >= 2) {
      const beam = scene.add.rectangle(x, y - 70, 12, 140, c, 0.6).setDepth(DEPTH.pickup);
      scene.tweens.add({ targets: beam, alpha: 0, scaleX: 3, duration: 800, onComplete: () => beam.destroy() });
    }
  }

  update(dt: number): void {
    this.t += dt;
    this.icon.setRotation(Math.sin(this.t * 2) * 0.25);
  }

  destroy(): void {
    this.alive = false;
    this.objs.forEach((o) => o.destroy());
  }
}
