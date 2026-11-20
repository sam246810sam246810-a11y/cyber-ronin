import Phaser from 'phaser';
import { ARENA, ARENA_BOTTOM, ARENA_RIGHT, DEPTH, POTION } from '../config';
import { hexToInt } from '../data';
import type { Enemy } from '../entities/Enemy';
import { POTION_EFFECTS } from '../potions/registry';
import type { ExplodeOptions, PotionContext, ZoneOptions } from '../potions/types';
import type { GameScene } from '../scenes/GameScene';
import type { PotionParams, RecipeDef } from '../types';
import { clamp, rand } from '../utils';
import type { BulletOptions } from './ProjectileSystem';

interface Flight {
  recipe: RecipeDef;
  params: PotionParams;
  color: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
  arc: number;
  bouncesLeft: number;
  pierceLeft: number;
  pierced: Set<Enemy>;
  mini: boolean;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
}

interface Zone extends ZoneOptions {
  t: number;
  tickT: number;
  gfx: Phaser.GameObjects.Graphics;
}

/**
 * 投擲中的藥水、落地後的場地效果，並實作 PotionContext 給各藥水效果使用。
 * 通用的突變行為（彈跳、分裂、連投、穿透）都在這裡處理，個別效果不需要知道。
 */
export class PotionSystem implements PotionContext {
  private flights: Flight[] = [];
  private zones: Zone[] = [];
  private timers: { t: number; fn: () => void }[] = [];

  constructor(private game: GameScene) {}

  /** 投擲一瓶藥水（會依連投數量分成多發） */
  throw(recipe: RecipeDef, fromX: number, fromY: number, targetX: number, targetY: number): void {
    const params = this.game.mutations.apply(recipe.params, recipe.key);
    const color = hexToInt(recipe.color);
    const baseAngle = Math.atan2(targetY - fromY, targetX - fromX);
    const d = Math.hypot(targetX - fromX, targetY - fromY);
    const n = Math.max(1, Math.round(params.count));
    const spread = 0.26;
    for (let i = 0; i < n; i++) {
      const a = baseAngle + (i - (n - 1) / 2) * spread;
      const tx = clamp(fromX + Math.cos(a) * d, ARENA.x + 10, ARENA_RIGHT - 10);
      const ty = clamp(fromY + Math.sin(a) * d, ARENA.y + 10, ARENA_BOTTOM - 10);
      this.launch(recipe, params, color, fromX, fromY, tx, ty, POTION.flightTime, POTION.arcHeight, false);
    }
  }

  private launch(
    recipe: RecipeDef, params: PotionParams, color: number,
    sx: number, sy: number, tx: number, ty: number, dur: number, arc: number, mini: boolean,
  ): void {
    const size = mini ? 16 : 26;
    const shadow = this.game.add.image(sx, sy, 'shadow').setDepth(DEPTH.shadow).setAlpha(0.4).setDisplaySize(size, size * 0.4);
    const sprite = this.game.add.image(sx, sy, 'flask').setTint(color).setDepth(DEPTH.projectile).setDisplaySize(size, size * 1.2);
    this.flights.push({
      recipe, params, color, sx, sy, tx, ty, t: 0, dur, arc,
      bouncesLeft: Math.round(params.bounces), pierceLeft: Math.round(params.pierce), pierced: new Set(),
      mini, sprite, shadow,
    });
  }

  update(dt: number): void {
    // 延遲呼叫
    if (this.timers.length) {
      this.timers.forEach((t) => (t.t -= dt));
      const due = this.timers.filter((t) => t.t <= 0);
      this.timers = this.timers.filter((t) => t.t > 0);
      due.forEach((t) => t.fn());
    }

    // 飛行中
    const landed: Flight[] = [];
    for (const f of this.flights) {
      f.t = Math.min(f.dur, f.t + dt);
      const k = f.t / f.dur;
      const gx = f.sx + (f.tx - f.sx) * k;
      const gy = f.sy + (f.ty - f.sy) * k;
      const h = Math.sin(k * Math.PI) * f.arc;
      f.shadow.setPosition(gx, gy);
      f.sprite.setPosition(gx, gy - h).setRotation(f.sprite.rotation + dt * 12);
      if (f.pierceLeft > 0) {
        for (const e of this.game.enemies) {
          if (f.pierceLeft <= 0) break;
          if (!e.alive || f.pierced.has(e)) continue;
          if ((e.x - gx) ** 2 + (e.y - gy) ** 2 <= (e.radius + POTION.pierceHitRadius) ** 2) {
            f.pierced.add(e);
            f.pierceLeft--;
            e.takeDamage(Math.max(1, f.params.damage));
            this.game.fx.sparks(e.x, e.y, f.color, 5);
          }
        }
      }
      if (f.t >= f.dur) landed.push(f);
    }
    if (landed.length) {
      this.flights = this.flights.filter((f) => !landed.includes(f));
      landed.forEach((f) => this.land(f));
    }

    // 場地效果
    for (const z of this.zones) {
      z.t += dt;
      const inside = this.enemiesInRadius(z.x, z.y, z.radius);
      z.onFrame?.(inside, dt, z);
      if (z.onTick && z.tickInterval) {
        z.tickT += dt;
        while (z.tickT >= z.tickInterval) {
          z.tickT -= z.tickInterval;
          z.onTick(this.enemiesInRadius(z.x, z.y, z.radius), z);
        }
      }
      this.drawZone(z);
    }
    if (this.zones.some((z) => z.t >= z.duration)) {
      this.zones = this.zones.filter((z) => {
        if (z.t >= z.duration) z.gfx.destroy();
        return z.t < z.duration;
      });
    }
  }

  private land(f: Flight): void {
    const effect = POTION_EFFECTS[f.recipe.id];
    effect?.(this, f.tx, f.ty, f.params, f.recipe, f.color);
    if (!f.mini) this.game.cameras.main.shake(60, 0.003);

    if (f.bouncesLeft > 0) {
      // 彈跳：朝附近敵人跳，沒有就沿原方向前進
      const target = this.nearestEnemy(f.tx, f.ty, 260);
      let nx: number;
      let ny: number;
      if (target && (target.x - f.tx) ** 2 + (target.y - f.ty) ** 2 > 400) {
        nx = target.x;
        ny = target.y;
      } else {
        const a = Math.atan2(f.ty - f.sy, f.tx - f.sx) + rand(-0.4, 0.4);
        nx = f.tx + Math.cos(a) * 120;
        ny = f.ty + Math.sin(a) * 120;
      }
      nx = clamp(nx, ARENA.x + 10, ARENA_RIGHT - 10);
      ny = clamp(ny, ARENA.y + 10, ARENA_BOTTOM - 10);
      f.sx = f.tx;
      f.sy = f.ty;
      f.tx = nx;
      f.ty = ny;
      f.t = 0;
      f.dur = 0.32;
      f.arc = f.arc * 0.6;
      f.bouncesLeft--;
      this.flights.push(f);
      return;
    }

    f.sprite.destroy();
    f.shadow.destroy();

    // 分裂：最後一次落地分出小藥水
    const splits = Math.round(f.params.splits);
    if (!f.mini && splits > 0) {
      const mini: PotionParams = {
        ...f.params,
        extra: { ...f.params.extra },
        damage: f.params.damage * 0.5,
        radius: f.params.radius * 0.6,
        bounces: 0, splits: 0, count: 1, pierce: 0,
      };
      const offset = Math.random() * Math.PI * 2;
      for (let i = 0; i < splits; i++) {
        const a = offset + (Math.PI * 2 * i) / splits;
        const d = rand(90, 150);
        const tx = clamp(f.tx + Math.cos(a) * d, ARENA.x + 10, ARENA_RIGHT - 10);
        const ty = clamp(f.ty + Math.sin(a) * d, ARENA.y + 10, ARENA_BOTTOM - 10);
        this.launch(f.recipe, mini, f.color, f.tx, f.ty, tx, ty, 0.35, 50, true);
      }
    }
  }

  private drawZone(z: Zone): void {
    const g = z.gfx;
    g.clear();
    const remain = z.duration - z.t;
    const fade = remain < 0.5 ? Math.max(0, remain / 0.5) : 1;
    const pulse = 0.85 + 0.15 * Math.sin(z.t * 6);
    g.fillStyle(z.color, 0.22 * fade);
    g.fillCircle(z.x, z.y, z.radius * pulse);
    g.lineStyle(3, z.color, 0.7 * fade);
    g.strokeCircle(z.x, z.y, z.radius);
  }

  // ---- PotionContext ----

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

  addZone(opts: ZoneOptions): void {
    const gfx = this.game.add.graphics().setDepth(DEPTH.zone);
    this.zones.push({ ...opts, t: 0, tickT: 0, gfx });
  }

  fireBullet(x: number, y: number, angle: number, speed: number, damage: number, opts?: BulletOptions): void {
    this.game.projectiles.fireFriendly(x, y, angle, speed, damage, opts);
  }

  delay(seconds: number, fn: () => void): void {
    this.timers.push({ t: seconds, fn });
  }

  line(x1: number, y1: number, x2: number, y2: number, color: number): void {
    this.game.fx.line(x1, y1, x2, y2, color);
  }

  burst(x: number, y: number, r: number, color: number): void {
    this.game.fx.burst(x, y, r, color);
  }

  get activeCount(): number {
    return this.flights.length + this.zones.length;
  }
}
