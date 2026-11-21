import Phaser from 'phaser';
import { DEPTH } from '../config';
import type { Enemy } from '../entities/Enemy';
import type { GameScene } from '../scenes/GameScene';

export interface ZoneOptions {
  x: number;
  y: number;
  radius: number;
  duration: number;
  color: number;
  /** 跟著玩家移動的光環 */
  followPlayer?: boolean;
  tickInterval?: number;
  onTick?: (inside: Enemy[], zone: Zone) => void;
  onFrame?: (inside: Enemy[], dt: number, zone: Zone) => void;
}

export interface Zone extends ZoneOptions {
  t: number;
  tickT: number;
  gfx: Phaser.GameObjects.Graphics;
  dead: boolean;
}

export interface ExplodeOptions {
  freeze?: number;
  slow?: { factor: number; time: number };
  poison?: { dps: number; time: number };
  knockback?: number;
  onHit?: (e: Enemy) => void;
}

/** 範圍傷害、場地效果與延遲呼叫，給藥水被動使用 */
export class EffectSystem {
  private zones: Zone[] = [];
  private timers: { t: number; fn: () => void }[] = [];

  constructor(private game: GameScene) {}

  update(dt: number): void {
    if (this.timers.length) {
      this.timers.forEach((t) => (t.t -= dt));
      const due = this.timers.filter((t) => t.t <= 0);
      this.timers = this.timers.filter((t) => t.t > 0);
      due.forEach((t) => t.fn());
    }
    const p = this.game.player;
    for (const z of this.zones) {
      z.t += dt;
      if (z.followPlayer) {
        z.x = p.x;
        z.y = p.y;
      }
      z.onFrame?.(this.enemiesInRadius(z.x, z.y, z.radius), dt, z);
      if (z.onTick && z.tickInterval) {
        z.tickT += dt;
        while (z.tickT >= z.tickInterval) {
          z.tickT -= z.tickInterval;
          z.onTick(this.enemiesInRadius(z.x, z.y, z.radius), z);
        }
      }
      if (z.t >= z.duration) z.dead = true;
      this.drawZone(z);
    }
    if (this.zones.some((z) => z.dead)) {
      this.zones = this.zones.filter((z) => {
        if (z.dead) z.gfx.destroy();
        return !z.dead;
      });
    }
  }

  private drawZone(z: Zone): void {
    const g = z.gfx;
    g.clear();
    const remain = z.duration - z.t;
    const fade = remain < 0.5 ? Math.max(0, remain / 0.5) : 1;
    const pulse = 0.85 + 0.15 * Math.sin(z.t * 6);
    g.fillStyle(z.color, (z.followPlayer ? 0.12 : 0.22) * fade);
    g.fillCircle(z.x, z.y, z.radius * pulse);
    g.lineStyle(3, z.color, (z.followPlayer ? 0.35 : 0.7) * fade);
    g.strokeCircle(z.x, z.y, z.radius);
  }

  enemiesInRadius(x: number, y: number, r: number): Enemy[] {
    return this.game.enemies.filter((e) => e.alive && (e.x - x) ** 2 + (e.y - y) ** 2 <= (r + e.radius) ** 2);
  }

  nearestEnemy(x: number, y: number, maxRange: number, exclude?: Set<Enemy>): Enemy | undefined {
    let best: Enemy | undefined;
    let bestD = maxRange * maxRange;
    for (const e of this.game.enemies) {
      if (!e.alive || exclude?.has(e)) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d <= bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  explode(x: number, y: number, r: number, damage: number, color: number, opts: ExplodeOptions = {}): Enemy[] {
    this.game.fx.burst(x, y, r, color);
    const hit = this.enemiesInRadius(x, y, r);
    for (const e of hit) {
      if (opts.freeze) e.applyFreeze(opts.freeze);
      if (opts.slow) e.applySlow(opts.slow.factor, opts.slow.time);
      if (opts.poison) e.applyPoison(opts.poison.dps, opts.poison.time);
      if (opts.knockback) e.knockback(x, y, opts.knockback);
      opts.onHit?.(e);
      e.takeDamage(damage);
    }
    return hit;
  }

  addZone(opts: ZoneOptions): Zone {
    const gfx = this.game.add.graphics().setDepth(DEPTH.zone);
    const z: Zone = { ...opts, t: 0, tickT: 0, gfx, dead: false };
    this.zones.push(z);
    return z;
  }

  delay(seconds: number, fn: () => void): void {
    this.timers.push({ t: seconds, fn });
  }

  /** 冰晶連鎖：依序打中最近的敵人 */
  chain(x: number, y: number, hops: number, damage: number, range: number, color: number, onHit?: (e: Enemy) => void): void {
    const hit = new Set<Enemy>();
    let cx = x;
    let cy = y;
    const hop = (left: number) => {
      if (left <= 0) return;
      const target = this.nearestEnemy(cx, cy, range, hit);
      if (!target) return;
      hit.add(target);
      this.game.fx.line(cx, cy, target.x, target.y, color);
      onHit?.(target);
      target.takeDamage(damage);
      this.game.fx.burst(target.x, target.y, 24, color);
      cx = target.x;
      cy = target.y;
      this.delay(0.08, () => hop(left - 1));
    };
    hop(hops);
  }
}
