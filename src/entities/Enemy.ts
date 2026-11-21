import Phaser from 'phaser';
import { ARENA, ARENA_BOTTOM, ARENA_RIGHT, COLORS, DEPTH, ELITE, ySortDepth } from '../config';
import { hexToInt } from '../data';
import type { EnemyDef } from '../types';
import type { GameScene } from '../scenes/GameScene';
import { clamp, isArtTexture } from '../utils';

export interface DamageOptions {
  /** 是否觸發受擊閃白與傷害數字（持續傷害不觸發） */
  flash?: boolean;
  crit?: boolean;
  /** 命中的元素顏色（傷害跳字與粒子用） */
  color?: number;
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

  readonly sprite: Phaser.GameObjects.Sprite;
  private atkKey?: string;
  private runKey?: string;
  /** 2.5D 生動化：顯示高度、出場、呼吸／走路擺動、受擊壓扁 */
  private displayH = 0;
  private spawnT = 0;
  private walkT = Math.random() * 10;
  private lastX = 0;
  private lastY = 0;
  private hitSquash = 0;
  private readonly hd: boolean;
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
    this.maxHp = this.hp = def.hp * (elite ? ELITE.hpMul : 1) * (game.dungeon?.hpMul ?? 1);
    this.radius = def.radius * (elite ? ELITE.radiusMul : 1);
    this.speed = def.speed * (game.dungeon?.enemySpeedMul ?? 1);
    // 有美術圖就不染色（染色只給程式佔位圖用來區分種類）
    this.baseTint = isArtTexture(game as Phaser.Scene, texture) ? 0xffffff : hexToInt(def.color);

    const scene = game as Phaser.Scene;
    this.shadow = scene.add.image(x, y + this.radius * 0.8, 'shadow').setDepth(DEPTH.shadow).setAlpha(0.35)
      .setDisplaySize(this.radius * 2, this.radius * 0.8);
    if (elite) {
      this.eliteRing = scene.add.image(x, y, 'ring').setDepth(DEPTH.enemy - 1).setTint(COLORS.gold)
        .setDisplaySize(this.radius * 2.6, this.radius * 2.6);
    }
    // 圖比碰撞範圍大一點，比較好辨認
    // 高細節手繪版（hd_*）優先：靜態圖＋程式做呼吸與走路擺動；否則用 GIF 跑步動畫
    this.hd = scene.textures.exists(`hd_${texture}`);
    if (!this.hd && scene.anims.exists(`run_${texture}`)) this.runKey = `run_${texture}`;
    if (!this.hd && scene.anims.exists(`atk_${texture}`)) this.atkKey = `atk_${texture}`;
    // 顯示高度：小怪約畫面高度 14～19%（依碰撞半徑），Boss 維持原本大小
    this.displayH = def.boss ? this.radius * 3.4 : this.radius * 5.6;
    this.sprite = scene.add.sprite(x, y, this.hd ? `hd_${texture}` : this.runKey ?? texture).setDepth(DEPTH.enemy).setTint(this.baseTint)
      .setOrigin(0.5, 0.9).setDisplaySize(this.displayH, this.displayH);
    this.lastX = x;
    this.lastY = y;
    this.hpBar = scene.add.graphics().setDepth(DEPTH.projectile - 1);
    if (this.runKey) {
      this.sprite.play({ key: this.runKey, startFrame: Math.floor(Math.random() * 6) });
      this.sprite.on('animationcomplete', (a: Phaser.Animations.Animation) => {
        if (a.key === this.atkKey && this.runKey) this.sprite.play(this.runKey);
      });
    }

    // 出場動畫改在 sync 裡用 spawnT 做（才不會跟呼吸縮放打架）
    this.sprite.setScale(0);
    this.shadow.setDisplaySize(this.displayH * 0.5, this.displayH * 0.16);
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
    const step = Math.min(d, speed * this.speedMul * this.game.enemySpeedMul * dt);
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
  }

  /** Boss 出招時播攻擊動畫 */
  playAttack(): void {
    if (this.atkKey && this.alive) this.sprite.play(this.atkKey);
  }

  takeDamage(amount: number, opts: DamageOptions = {}): void {
    if (!this.alive || amount <= 0) return;
    amount = this.absorb(amount, opts);
    if (amount <= 0) return;
    this.game.buffs?.recordDamage(Math.min(amount, this.hp));
    this.hp -= amount;
    if (opts.flash !== false) {
      this.hitFlash = 0.075;
      this.hitSquash = 1;
      this.game.fx.hitBurst(this.x, this.y - this.displayH * 0.35, opts.color, !!opts.crit);
      this.game.fx.damageNumber(this.x, this.y - this.displayH * 0.7, amount, !!opts.crit, opts.color);
      this.game.fx.anim('vfx_hit', this.x + (Math.random() - 0.5) * this.radius, this.y - this.radius * 0.4, opts.crit ? 78 : 54);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }

  /** 躲紙箱時的亂晃目標 */
  private confused = { x: 0, y: 0, t: 0 };

  /** 追擊目標：玩家躲進紙箱時改成在附近亂晃 */
  targetPoint(): { x: number; y: number } {
    const p = this.game.player;
    if (!this.game.playerHidden || this.def.boss) return p;
    this.confused.t -= 1 / 30;
    if (this.confused.t <= 0) {
      this.confused = { x: this.x + (Math.random() - 0.5) * 300, y: this.y + (Math.random() - 0.5) * 300, t: 1.5 };
    }
    return this.confused;
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
    this.game.fx.anim('vfx_poof', this.x, this.y - this.radius * 0.3, this.radius * 3.4);
    this.destroy();
  }

  protected sync(dt: number): void {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    let tint = this.baseTint;
    if (this.frozen) tint = 0xbfefff;
    else if (this.poisonTimer > 0 && Math.floor(this.poisonTimer * 6) % 2 === 0) tint = 0x9cff7e;
    else if (this.slowTimer > 0) tint = 0xc9a3ff;
    // 受擊：真正的白閃（tintFill），不是乘法染色
    if (this.hitFlash > 0 && !this.frozen) this.sprite.setTintFill(0xffffff);
    else this.sprite.setTint(tint);
    this.sprite.setAlpha(this.slowTimer > 0 && !this.frozen ? 0.85 : 1);

    // 2.5D 生動化：出場彈出、呼吸、走路上下擺動與傾斜、受擊壓扁
    this.spawnT = Math.min(1, this.spawnT + dt / 0.22);
    const pop = Phaser.Math.Easing.Back.Out(this.spawnT);
    const moved = Math.hypot(this.x - this.lastX, this.y - this.lastY);
    this.lastX = this.x;
    this.lastY = this.y;
    const moving = moved > 0.4 && !this.frozen;
    this.walkT += dt * (moving ? 13 : 3);
    this.hitSquash = Math.max(0, this.hitSquash - dt * 7);
    const breath = moving ? 0 : Math.sin(this.walkT) * 0.025;
    const bob = moving && this.hd ? Math.abs(Math.sin(this.walkT)) * this.displayH * 0.05 : 0;
    const base = this.displayH / this.sprite.frame.height;
    const sq = this.hitSquash * 0.14;
    this.sprite.setScale(base * pop * (1 - breath * 0.5 + sq), base * pop * (1 + breath - sq));
    const dir = this.sprite.flipX ? -1 : 1;
    this.sprite.setRotation(moving ? Math.sin(this.walkT) * 0.06 * dir : 0);
    const feetY = this.y + this.radius * 0.7;
    this.sprite.setPosition(this.x, feetY - this.liftOffset() - bob).setDepth(ySortDepth(this.y));
    this.eliteRing?.setDepth(this.sprite.depth - 0.001);
    // 陰影：跳起來（bob／liftOffset）時縮小變淡
    const lift = bob + this.liftOffset();
    const shrink = Math.max(0.55, 1 - lift / (this.displayH * 0.8));
    this.shadow.setPosition(this.x, feetY).setDisplaySize(this.displayH * 0.5 * shrink * pop, this.displayH * 0.16 * shrink * pop)
      .setAlpha(0.42 * shrink);
    // 精英：腳下的金色光環（貼地的橢圓）
    this.eliteRing?.setPosition(this.x, feetY).setDisplaySize(this.displayH * 0.72, this.displayH * 0.24).setDepth(DEPTH.shadow + 0.5);

    this.hpBar.clear();
    if (this.hp < this.maxHp && !this.def.boss) {
      const w = this.radius * 2;
      const bx = this.x - w / 2;
      const by = this.y + this.radius * 0.7 - this.liftOffset() - this.displayH * 0.95;
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

