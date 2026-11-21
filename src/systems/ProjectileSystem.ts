import Phaser from 'phaser';
import { ARENA, ARENA_BOTTOM, ARENA_RIGHT, COLORS, DEPTH, PLAYER } from '../config';
import type { GameScene } from '../scenes/GameScene';
import type { Enemy } from '../entities/Enemy';
import { Sound } from './SoundSystem';

/** 命中效果：子彈、近戰、連鎖閃電共用 */
export interface HitOptions {
  poison?: { dps: number; time: number };
  slow?: { factor: number; time: number };
  /** 命中時小範圍爆炸（混沌原液） */
  splash?: number;
  freezeChance?: number;
  critChance?: number;
  knockback?: number;
  /** 觸發藥水被動的 onHit（只有玩家武器） */
  triggerPassives?: boolean;
  color?: number;
}

export interface BulletOptions extends HitOptions {
  radius?: number;
  texture?: string;
  /** 長條形子彈（長槍、針） */
  long?: boolean;
  pierce?: number;
  bounces?: number;
  /** 飛行距離上限 */
  maxDist?: number;
  /** 到最遠距離後飛回玩家（回力葉刃） */
  boomerang?: boolean;
  /** 消失時呼叫（太陽花砲爆炸） */
  onExpire?: (x: number, y: number) => void;
  spin?: number;
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
  traveled: number;
  returning: boolean;
}

/** 直線投射物（玩家武器、敵人尖刺、冰毒針…） */
export class ProjectileSystem {
  private bullets: Bullet[] = [];

  constructor(private game: GameScene) {}

  fireFriendly(x: number, y: number, angle: number, speed: number, damage: number, opts: BulletOptions = {}): void {
    this.spawn(x, y, angle, speed, damage, true, opts);
  }

  fireEnemy(x: number, y: number, angle: number, speed: number, damage = 1): void {
    this.spawn(x, y, angle, speed, damage, false, { radius: 8, color: COLORS.enemyBullet, texture: 'thorn', long: true });
  }

  private spawn(x: number, y: number, angle: number, speed: number, damage: number, friendly: boolean, opts: BulletOptions): void {
    const r = opts.radius ?? PLAYER.bulletRadius;
    const sprite = this.game.add.image(x, y, opts.texture ?? 'circle')
      .setTint(opts.color ?? COLORS.bullet)
      .setDepth(DEPTH.projectile)
      .setRotation(angle + Math.PI / 2);
    if (opts.long || opts.texture === 'thorn') sprite.setDisplaySize(r * 1.6, r * 3.2);
    else sprite.setDisplaySize(r * 2, r * 2);
    this.bullets.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r, damage, friendly, sprite, opts, dead: false,
      pierceLeft: opts.pierce ?? 0, bouncesLeft: opts.bounces ?? 0, hit: new Set(), speed, traveled: 0, returning: false,
    });
  }

  update(dt: number, enemies: Enemy[]): void {
    const p = this.game.player;
    for (const b of this.bullets) {
      if (b.returning) {
        const a = Math.atan2(p.y - b.y, p.x - b.x);
        b.vx = Math.cos(a) * b.speed * 1.15;
        b.vy = Math.sin(a) * b.speed * 1.15;
        if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 < (p.radius + 10) ** 2) {
          b.dead = true;
          continue;
        }
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.traveled += b.speed * dt;
      b.sprite.setPosition(b.x, b.y);
      if (b.opts.spin) b.sprite.setRotation(b.sprite.rotation + b.opts.spin * dt);
      if (b.opts.maxDist && !b.returning && b.traveled >= b.opts.maxDist) {
        if (b.opts.boomerang) {
          b.returning = true;
          b.hit.clear();
        } else {
          this.expire(b);
          continue;
        }
      }
      if (!b.returning && (b.x < ARENA.x - 20 || b.x > ARENA_RIGHT + 20 || b.y < ARENA.y - 20 || b.y > ARENA_BOTTOM + 20)) {
        if (b.opts.boomerang) {
          b.returning = true;
          b.hit.clear();
        } else {
          this.expire(b);
        }
        continue;
      }
      if (b.friendly) {
        for (const e of enemies) {
          if (!e.alive || e.airborne || b.hit.has(e)) continue;
          const rr = e.radius + b.r;
          if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 <= rr * rr) {
            this.hitEnemy(b, e);
            if (b.dead) break;
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

  private expire(b: Bullet): void {
    b.dead = true;
    b.opts.onExpire?.(b.x, b.y);
  }

  /**
   * 對敵人造成一次「武器命中」：暴擊、附毒、減速、冰凍、爆炸、擊退與藥水被動。
   * 回傳是否暴擊。
   */
  applyHit(e: Enemy, damage: number, o: HitOptions, fromX: number, fromY: number): boolean {
    if (!e.alive) return false;
    if (o.poison) e.applyPoison(o.poison.dps, o.poison.time);
    if (o.slow) e.applySlow(o.slow.factor, o.slow.time);
    if (o.freezeChance && Math.random() < o.freezeChance) e.applyFreeze(0.8);
    const crit = !!o.critChance && Math.random() < o.critChance;
    const dmg = crit ? damage * 2 : damage;
    if (o.triggerPassives) this.game.buffs.onHit(e, dmg);
    e.knockback(fromX, fromY, (o.knockback ?? 6) * (crit ? 2 : 1));
    e.takeDamage(dmg, { crit });
    Sound.play(crit ? 'crit' : 'hit');
    if (o.splash) this.game.effects.explode(e.x, e.y, o.splash, dmg * 0.5, 0xe06bff);
    return crit;
  }

  private hitEnemy(b: Bullet, e: Enemy): void {
    b.hit.add(e);
    this.applyHit(e, b.damage, b.opts, b.x - b.vx * 0.05, b.y - b.vy * 0.05);
    this.game.fx.sparks(b.x, b.y, b.opts.color ?? COLORS.bullet, 3);
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
    if (b.opts.boomerang) return;
    this.expire(b);
  }

  clearAll(): void {
    this.bullets.forEach((b) => b.sprite.destroy());
    this.bullets = [];
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
