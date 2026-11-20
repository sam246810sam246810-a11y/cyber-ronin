import Phaser from 'phaser';
import { ARENA, ARENA_BOTTOM, ARENA_RIGHT, COLORS, DEPTH, PLAYER } from '../config';
import type { GameScene } from '../scenes/GameScene';
import type { Enemy } from '../entities/Enemy';

export interface BulletOptions {
  radius?: number;
  color?: number;
  poison?: { dps: number; time: number };
  slow?: { factor: number; time: number };
  texture?: string;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  damage: number;
  friendly: boolean;
  sprite: Phaser.GameObjects.Image;
  opts: BulletOptions;
  dead: boolean;
}

/** 玩家種子彈、敵人尖刺、冰毒針等直線投射物 */
export class ProjectileSystem {
  private bullets: Bullet[] = [];

  constructor(private game: GameScene) {}

  fireFriendly(x: number, y: number, angle: number, speed: number, damage: number, opts: BulletOptions = {}): void {
    this.spawn(x, y, angle, speed, damage, true, opts);
  }

  fireEnemy(x: number, y: number, angle: number, speed: number, damage = 1): void {
    this.spawn(x, y, angle, speed, damage, false, { radius: 8, color: COLORS.enemyBullet, texture: 'thorn' });
  }

  private spawn(x: number, y: number, angle: number, speed: number, damage: number, friendly: boolean, opts: BulletOptions): void {
    const r = opts.radius ?? PLAYER.bulletRadius;
    const sprite = this.game.add.image(x, y, opts.texture ?? 'circle')
      .setTint(opts.color ?? COLORS.bullet)
      .setDepth(DEPTH.projectile)
      .setRotation(angle + Math.PI / 2);
    if (opts.texture === 'thorn') sprite.setDisplaySize(r * 1.6, r * 3.2);
    else sprite.setDisplaySize(r * 2, r * 2);
    this.bullets.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r, damage, friendly, sprite, opts, dead: false,
    });
  }

  update(dt: number, enemies: Enemy[]): void {
    const p = this.game.player;
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.sprite.setPosition(b.x, b.y);
      if (b.x < ARENA.x - 20 || b.x > ARENA_RIGHT + 20 || b.y < ARENA.y - 20 || b.y > ARENA_BOTTOM + 20) {
        b.dead = true;
        continue;
      }
      if (b.friendly) {
        for (const e of enemies) {
          if (!e.alive || e.airborne) continue;
          const rr = e.radius + b.r;
          if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 <= rr * rr) {
            if (b.opts.poison) e.applyPoison(b.opts.poison.dps, b.opts.poison.time);
            if (b.opts.slow) e.applySlow(b.opts.slow.factor, b.opts.slow.time);
            e.takeDamage(b.damage);
            this.game.fx.sparks(b.x, b.y, b.opts.color ?? COLORS.bullet, 3);
            b.dead = true;
            break;
          }
        }
      } else {
        const rr = p.radius * 0.7 + b.r;
        if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 <= rr * rr && !p.invulnerable) {
          this.game.hurtPlayer(b.damage);
          b.dead = true;
        }
      }
    }
    if (this.bullets.some((b) => b.dead)) {
      this.bullets = this.bullets.filter((b) => {
        if (b.dead) b.sprite.destroy();
        return !b.dead;
      });
    }
  }

  clearEnemyBullets(): void {
    this.bullets = this.bullets.filter((b) => {
      if (!b.friendly) b.sprite.destroy();
      return b.friendly;
    });
  }

  get count(): number {
    return this.bullets.length;
  }
}
