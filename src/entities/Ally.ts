import Phaser from 'phaser';
import { isArtTexture } from '../utils';
import { DEPTH } from '../config';
import type { GameScene } from '../scenes/GameScene';

/** 時空因果「種下守護花」：每間戰鬥房長出來、會自動射擊的花 */
export class GuardianFlower {
  private timer = Math.random();
  private sprite: Phaser.GameObjects.Image;

  constructor(private game: GameScene, readonly x: number, readonly y: number) {
    this.sprite = game.add.image(x, y, 'flower').setTint(isArtTexture(game, 'flower') ? 0xffffff : 0x7eff8a).setDisplaySize(56, 56).setDepth(DEPTH.player - 1);
    game.tweens.add({ targets: this.sprite, scale: { from: 0, to: this.sprite.scale }, duration: 300, ease: 'Back.Out' });
  }

  update(dt: number): void {
    this.sprite.setRotation(Math.sin(this.game.time.now / 400) * 0.15);
    this.timer -= dt;
    if (this.timer > 0) return;
    const t = this.game.effects.nearestEnemy(this.x, this.y, 600);
    if (!t) return;
    this.timer = 0.9;
    const a = Math.atan2(t.y - this.y, t.x - this.x);
    this.game.projectiles.fireFriendly(this.x, this.y, a, 620, this.game.buffs.stats.damage * 0.7, {
      radius: 6, color: 0x9bff8a, triggerPassives: false,
    });
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
