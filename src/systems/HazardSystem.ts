import Phaser from 'phaser';
import { DEPTH } from '../config';
import type { GameScene } from '../scenes/GameScene';

interface Hazard {
  x: number;
  y: number;
  r: number;
  t: number;
  duration: number;
  color: number;
  gfx: Phaser.GameObjects.Graphics;
}

/** 對玩家有害的地面（熔岩痕跡等），站在上面會受傷 */
export class HazardSystem {
  private list: Hazard[] = [];

  constructor(private game: GameScene) {}

  add(x: number, y: number, r: number, duration: number, color = 0xff5a2a): void {
    const gfx = this.game.add.graphics().setDepth(DEPTH.zone);
    this.list.push({ x, y, r, t: 0, duration, color, gfx });
  }

  update(dt: number): void {
    const p = this.game.player;
    for (const h of this.list) {
      h.t += dt;
      const fade = Math.min(1, (h.duration - h.t) / 0.6);
      h.gfx.clear();
      h.gfx.fillStyle(h.color, 0.35 * fade).fillCircle(h.x, h.y, h.r);
      h.gfx.fillStyle(0xffd166, 0.25 * fade).fillCircle(h.x, h.y, h.r * (0.5 + 0.1 * Math.sin(h.t * 8)));
      if (h.t > 0.4 && (p.x - h.x) ** 2 + (p.y - h.y) ** 2 < (h.r + p.radius * 0.4) ** 2) this.game.hurtPlayer(1);
    }
    if (this.list.some((h) => h.t >= h.duration)) {
      this.list = this.list.filter((h) => {
        if (h.t >= h.duration) h.gfx.destroy();
        return h.t < h.duration;
      });
    }
  }

  clear(): void {
    this.list.forEach((h) => h.gfx.destroy());
    this.list = [];
  }
}
