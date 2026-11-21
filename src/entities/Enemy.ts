import Phaser from 'phaser';
import { ARENA, ARENA_BOTTOM, ARENA_RIGHT, COLORS, DEPTH, ELITE } from '../config';
import { hexToInt } from '../data';
import type { EnemyDef } from '../types';
import type { GameScene } from '../scenes/GameScene';
import { clamp } from '../utils';

export interface DamageOptions {
  /** 是否觸發受擊閃白與傷害數字（持續傷害不觸發） */
  flash?: boolean;
  crit?: boolean;
}

/**
 * 敵人基底類別。
 * 狀態效果（減速 / 冰凍 / 中毒 / 擊退 / 解凍引爆）統一在這裡處理，
 * 子類別只需實作 act()（冰凍時不會被呼叫）。
 */
export abstract class Enemy {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  speed: number;
  alive = true;
  /** 跳躍中等情況，不造成接觸傷害也不被推擠 */
  airborne = false;
  /** 冰凍時間倍率（Boss 較抗凍） */
  freezeResist = 1;
  knockbackResist = 1;

  slowFactor = 0;
  slowTimer = 0;
  frozenTimer = 0;
  poisonDps = 0;
  poisonTimer = 0;
  thawDamage = 0;
  private knockVX = 0;
  private knockVY = 0;
  private hitFlash = 0;

  readonly sprite: Phaser.GameObjects.Image;
  protected readonly shadow: Phaser.GameObjects.Image;
  private readonly eliteRing?: Phaser.GameObjects.Image;
  private readonly hpBar: Phaser.GameObjects.Graphics;
  protected readonly baseTint: number;

  constructor(
    protected game: GameScene,
    readonly def: EnemyDef,
    x: number,
    y: number,
    readonly elite = false,
    texture = 'circle',
  ) {
    this.x = x;
    this.y = y;
    this.maxHp = this.hp = def.hp * (elite ? ELITE.hpMul : 1) * (game.waves?.hpMul ?? 1);
    this.radius = def.radius * (elite ? ELITE.radiusMul : 1);
    this.speed = def.speed;
    this.baseTint = hexToInt(def.color);

    const scene = game as Phaser.Scene;
    this.shadow = scene.add.image(x, y + this.radius * 0.8, 'shadow').setDepth(DEPTH.shadow).setAlpha(0.35)
      .setDisplaySize(this.radius * 2, this.radius * 0.8);
    if (elite) {
      this.eliteRing = scene.add.image(x, y, 'ring').setDepth(DEPTH.enemy - 1).setTint(COLORS.gold)
        .setDisplaySize(this.radius * 2.6, this.radius * 2.6);
    }
    this.sprite = scene.add.image(x, y, texture).setDepth(DEPTH.enemy).setTint(this.baseTint)
      .setDisplaySize(this.radius * 2, this.radius * 2);
    this.hpBar = scene.add.graphics().setDepth(DEPTH.enemy + 2);

    // 出場動畫
    this.sprite.setScale(0);
    scene.tweens.add({
      targets: this.sprite,
      scaleX: (this.radius * 2) / this.sprite.width,
      scaleY: (this.radius * 2) / this.sprite.height,
      duration: 200,
      ease: 'Back.Out',
    });
  }

  get frozen(): boolean {
    return this.frozenTimer > 0;
  }

  get speedMul(): number {
    if (this.frozen) return 0;
    return 1 - (this.slowTimer > 0 ? this.slowFactor : 0);
  }

  update(dt: number): void {
    if (!this.alive) return;
    this.tickStatus(dt);
    if (!this.alive) return;

    if (this.knockVX || this.knockVY) {
      this.x += this.knockVX * dt;
      this.y += this.knockVY * dt;
      const decay = Math.pow(0.001, dt);
      this.knockVX *= decay;
      this.knockVY *= decay;
      if (Math.abs(this.knockVX) + Math.abs(this.knockVY) < 5) this.knockVX = this.knockVY = 0;
    }

    if (!this.frozen) this.act(dt);

    this.x = clamp(this.x, ARENA.x + this.radius, ARENA_RIGHT - this.radius);
    this.y = clamp(this.y, ARENA.y + this.radius, ARENA_BOTTOM - this.radius);
    this.sync(dt);
  }

  protected abstract act(dt: number): void;

  private tickStatus(dt: number): void {
    if (this.slowTimer > 0) this.slowTimer -= dt;
    if (this.poisonTimer > 0) {
      this.poisonTimer -= dt;
      this.takeDamage(this.poisonDps * dt, { flash: false });
      if (this.poisonTimer <= 0) this.poisonDps = 0;
    }
    if (this.frozenTimer > 0) {
      this.frozenTimer -= dt;
      if (this.frozenTimer <= 0) {
        this.frozenTimer = 0;
        this.onThaw();
      }
    }
  }

  private onThaw(): void {
    if (this.thawDamage > 0 && this.alive) {
      const dmg = this.thawDamage;
      this.thawDamage = 0;
      this.game.fx.burst(this.x, this.y, this.radius * 2, 0x8fd9c4);
      this.applyPoison(1, 2);
      this.takeDamage(dmg);
    }
  }

  moveToward(tx: number, ty: number, dt: number, speed = this.speed): void {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    const step = Math.min(d, speed * this.speedMul * dt);
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
  }

  takeDamage(amount: number, opts: DamageOptions = {}): void {
    if (!this.alive || amount <= 0) return;
    amount = this.absorb(amount, opts);
    if (amount <= 0) return;
    this.hp -= amount;
    if (opts.flash !== false) {
      this.hitFlash = 0.08;
      this.game.fx.damageNumber(this.x, this.y - this.radius, amount, !!opts.crit);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }

  /** 護盾等吸收傷害的鉤子，回傳實際扣血量 */
  protected absorb(amount: number, _opts: DamageOptions): number {
    return amount;
  }

  applySlow(factor: number, time: number): void {
    if (factor >= this.slowFactor || this.slowTimer <= 0) this.slowFactor = factor;
    this.slowTimer = Math.max(this.slowTimer, time);
  }

  applyFreeze(time: number): void {
    this.frozenTimer = Math.max(this.frozenTimer, time * this.freezeResist);
  }

  applyPoison(dps: number, time: number): void {
    this.poisonDps = Math.max(this.poisonDps, dps);
    this.poisonTimer = Math.max(this.poisonTimer, time);
  }

  knockback(fromX: number, fromY: number, power: number): void {
    const a = Math.atan2(this.y - fromY, this.x - fromX);
    const p = power * 4 * this.knockbackResist;
    this.knockVX += Math.cos(a) * p;
    this.knockVY += Math.sin(a) * p;
  }

  /** 直接位移（黏毒沼澤的拉扯） */
  nudge(dx: number, dy: number): void {
    this.x += dx * this.knockbackResist;
    this.y += dy * this.knockbackResist;
  }

  protected die(): void {
    this.alive = false;
    this.game.telegraphs.cancelOwner(this);
    this.game.onEnemyKilled(this);
    this.destroy();
  }

  protected sync(dt: number): void {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    let tint = this.baseTint;
    if (this.frozen) tint = 0xbfefff;
    else if (this.hitFlash > 0) tint = 0xffffff;
    else if (this.poisonTimer > 0 && Math.floor(this.poisonTimer * 6) % 2 === 0) tint = 0x9cff7e;
    else if (this.slowTimer > 0) tint = 0xc9a3ff;
    this.sprite.setTint(tint);
    this.sprite.setAlpha(this.slowTimer > 0 && !this.frozen ? 0.8 : 1);
    this.sprite.setPosition(this.x, this.y - this.liftOffset());
    this.shadow.setPosition(this.x, this.y + this.radius * 0.8);
    this.eliteRing?.setPosition(this.x, this.y - this.liftOffset());

    this.hpBar.clear();
    if (this.hp < this.maxHp && !this.def.boss) {
      const w = this.radius * 2;
      const bx = this.x - w / 2;
      const by = this.y - this.liftOffset() - this.radius - 10;
      this.hpBar.fillStyle(0x000000, 0.6).fillRect(bx, by, w, 5);
      this.hpBar.fillStyle(this.elite ? COLORS.gold : 0xff6b6b, 1).fillRect(bx, by, w * (this.hp / this.maxHp), 5);
    }
  }

  /** 跳躍時的視覺高度 */
  protected liftOffset(): number {
    return 0;
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
    this.eliteRing?.destroy();
    this.hpBar.destroy();
  }
}
