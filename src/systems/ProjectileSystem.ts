import Phaser from 'phaser';
import { ARENA, ARENA_BOTTOM, ARENA_RIGHT, COLORS, DEPTH, PLAYER } from '../config';
import type { GameScene } from '../scenes/GameScene';
import type { Enemy } from '../entities/Enemy';
import { Sound } from './SoundSystem';

export interface BulletOptions {
  radius?: number;
  color?: number;
  poison?: { dps: number; time: number };
  slow?: { factor: number; time: number };
  texture?: string;
  pierce?: number;
  bounces?: number;
  /** 命中時小範圍爆炸（混沌原液） */
  splash?: number;
  freezeChance?: number;
  critChance?: number;
  /** 觸發藥水被動的 onHit（只有主武器） */
  triggerPassives?: boolean;
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
  pierceLeft: number;
  bouncesLeft: number;
  hit: Set<Enemy>;
  speed: number;
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
      pierceLeft: opts.pierce ?? 0, bouncesLeft: opts.bounces ?? 0, hit: new Set(), speed,
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
          if (!e.alive || e.airborne || b.hit.has(e)) continue;
          const rr = e.radius + b.r;
          if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 <= rr * rr) {
            this.hitEnemy(b, e);
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

  private hitEnemy(b: Bullet, e: Enemy): void {
    b.hit.add(e);
    const o = b.opts;
    if (o.poison) e.applyPoison(o.poison.dps, o.poison.time);
    if (o.slow) e.applySlow(o.slow.factor, o.slow.time);
    if (o.freezeChance && Math.random() < o.freezeChance) e.applyFreeze(0.8);
    const crit = !!o.critChance && Math.random() < o.critChance;
    const dmg = crit ? b.damage * 2 : b.damage;
    if (o.triggerPassives) this.game.buffs.onHit(e, dmg);
    e.knockback(b.x - b.vx * 0.05, b.y - b.vy * 0.05, crit ? 14 : 6);
    e.takeDamage(dmg, { crit });
    Sound.play(crit ? 'crit' : 'hit');
    this.game.fx.sparks(b.x, b.y, o.color ?? COLORS.bullet, 3);
    if (o.splash) {
      this.game.effects.explode(b.x, b.y, o.splash, b.damage * 0.5, 0xe06bff);
    }
    if (b.bouncesLeft > 0) {
      const next = this.game.effects.nearestEnemy(b.x, b.y, 260, b.hit);
      if (next) {
        b.bouncesLeft--;
        const a = Math.atan2(next.y - b.y, next.x - b.x);
        b.vx = Math.cos(a) * b.speed;
        b.vy = Math.sin(a) * b.speed;
        b.sprite.setRotation(a + Math.PI / 2);
        return;
      }
    }
    if (b.pierceLeft > 0) {
      b.pierceLeft--;
      return;
    }
    b.dead = true;
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
