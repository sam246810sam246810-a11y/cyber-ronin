import Phaser from 'phaser';
import enemies from '../data/enemies.json';
import { applyStatus, hasStatus, scaleEnemy, tickStatuses, type Difficulty, type Statuses } from '../systems/combat';
import { floatText } from '../combat/fx';
import type { Vec2 } from '../systems/movement';

export type EnemyKind = keyof typeof enemies;
type State = 'idle' | 'chase' | 'tele' | 'dash' | 'rest' | 'return';
type Behaviour = 'chase' | 'hop' | 'dash' | 'shooter' | 'slam' | 'none';
/** 每種怪物用哪一套 AI（第二章的怪物沿用第一章的行為，數值不同） */
const BEHAVIOUR: Record<string, Behaviour> = {
  kitsunebi: 'chase', aokitsunebi: 'chase', karakasa: 'hop', nogitsune: 'dash', kappa: 'dash',
  bonespider: 'shooter', dorotabou: 'shooter', chochin: 'slam', suiko: 'slam', dummy: 'none',
  karasu: 'shooter', yamawaro: 'hop', kamaitachi: 'dash', oogarasu: 'slam',
};

const SIGHT = 100;   // 進入視野開始追擊
const LEASH = 200;   // 離開原位太遠就回去

export interface HitOptions { paralyze?: boolean; burn?: boolean; knock?: number }

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  readonly kind: EnemyKind;
  readonly info: (typeof enemies)[EnemyKind];
  hp: number;
  readonly maxHp: number;
  alive = true;
  statuses: Statuses = {};
  private readonly home: Vec2;
  private ai: State = 'idle';
  private stateUntil = 0;
  private dashReadyAt = 0;
  private shootReadyAt = 0;
  private warn?: Phaser.GameObjects.Arc;
  readonly elite: boolean;
  private baseTint?: number;
  private get behaviour(): Behaviour { return BEHAVIOUR[this.kind] ?? 'chase'; }
  private restoreTint(): void { if (this.baseTint) this.setTint(this.baseTint); else this.clearTint(); }
  readonly guard?: string;
  private dir: Vec2 = { x: 0, y: 0 };
  private hitstunUntil = 0;
  protected dotAccum = 0;
  private readonly bar: Phaser.GameObjects.Graphics;
  private barUntil = 0;
  private readonly seed = Math.random() * 1000;

  constructor(scene: Phaser.Scene, x: number, y: number, kind: EnemyKind, difficulty: Difficulty, guard?: string) {
    super(scene, x, y, 'enemies', enemies[kind].frame);
    this.kind = kind;
    this.info = scaleEnemy(enemies[kind], difficulty);
    this.hp = this.maxHp = this.info.hp;
    this.home = { x, y };
    this.elite = !!(enemies[kind] as { elite?: boolean }).elite;
    this.guard = guard;
    this.shootReadyAt = scene.time.now + 800 + Math.random() * 800;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(12, 10).setOffset(2, 6);
    if (kind === 'dummy') body.setImmovable(true);
    if (this.elite) this.setScale(1.4);
    const tint = (enemies[kind] as { tint?: number }).tint;
    if (tint) { this.baseTint = tint; this.setTint(tint); }
    this.bar = scene.add.graphics().setDepth(120000);
  }

  get center(): Vec2 { const b = this.body as Phaser.Physics.Arcade.Body; return { x: b.center.x, y: b.center.y }; }
  /** 正在預備攻擊（給玩家看的預兆） */
  get telegraphing(): boolean { return this.ai === 'tele'; }

  update(time: number, dt: number, target: Vec2): void {
    if (!this.alive) return;
    this.setDepth(this.y);
    this.setFrame(this.info.frame + (Math.floor((time + this.seed) / 280) % 2));
    this.drawBar(time);

    const dot = tickStatuses(this.statuses, dt, this.maxHp);
    if (dot > 0) {
      this.dotAccum += dot;
      if (this.dotAccum >= 1) { const n = Math.floor(this.dotAccum); this.dotAccum -= n; this.damage(n, false, '#ff9a4a'); if (!this.alive) return; }
    }
    if (hasStatus(this.statuses, 'paralyze')) { this.setVelocity(0, 0); this.setTint(0xfff27a); return; }
    if (hasStatus(this.statuses, 'burn')) this.setTint(0xffb08a); else if (this.ai !== 'tele') this.restoreTint();
    if (time < this.hitstunUntil) { const b = this.body as Phaser.Physics.Arcade.Body; b.velocity.scale(0.85); return; }
    if (this.behaviour === 'none') { this.setVelocity(0, 0); return; }

    const me = this.center;
    const toT = { x: target.x - me.x, y: target.y - me.y };
    const dist = Math.hypot(toT.x, toT.y) || 1;
    const toward = { x: toT.x / dist, y: toT.y / dist };
    const fromHome = Math.hypot(this.x - this.home.x, this.y - this.home.y);

    if (fromHome > LEASH && this.ai !== 'return') this.ai = 'return';
    if (this.ai === 'return') {
      if (fromHome < 8) { this.ai = 'idle'; this.setVelocity(0, 0); return; }
      const hx = this.home.x - this.x, hy = this.home.y - this.y, hd = Math.hypot(hx, hy);
      this.setVelocity((hx / hd) * 60, (hy / hd) * 60);
      return;
    }

    const dashTele = ({ kappa: 500, kamaitachi: 380 } as Record<string, number>)[this.kind] ?? 600;
    const dashSpeed = ({ kappa: 230, kamaitachi: 280 } as Record<string, number>)[this.kind] ?? 190;
    switch (this.behaviour) {
      case 'chase': {
        if (dist < SIGHT) this.setVelocity(toward.x * this.info.speed, toward.y * this.info.speed);
        else {
          const t = time / 1000 + this.seed;
          const wx = this.home.x + Math.cos(t * 0.8) * 18 - this.x, wy = this.home.y + Math.sin(t * 1.1) * 12 - this.y;
          this.setVelocity(wx * 1.5, wy * 1.5);
        }
        break;
      }
      case 'hop': {
        // 蹲下預備 → 跳向玩家 → 休息
        if (this.ai === 'tele' && time >= this.stateUntil) { this.ai = 'dash'; this.stateUntil = time + 350; this.dir = toward; this.setScale(0.9, 1.15); }
        else if (this.ai === 'dash' && time >= this.stateUntil) { this.ai = 'rest'; this.stateUntil = time + 700; this.setScale(1); }
        else if (this.ai === 'rest' && time >= this.stateUntil) this.ai = 'idle';
        if (this.ai === 'idle' && dist < SIGHT + 10) { this.ai = 'tele'; this.stateUntil = time + 480; this.setScale(1.15, 0.8); }
        if (this.ai === 'dash') this.setVelocity(this.dir.x * this.info.speed, this.dir.y * this.info.speed);
        else this.setVelocity(0, 0);
        break;
      }
      case 'dash': {
        if (this.ai === 'tele') {
          this.setVelocity(0, 0);
          this.setTint(Math.floor(time / 60) % 2 ? 0xffffff : 0xff6a6a);
          if (time >= this.stateUntil) { this.ai = 'dash'; this.stateUntil = time + 280; this.dir = toward; this.restoreTint(); }
        } else if (this.ai === 'dash') {
          this.setVelocity(this.dir.x * dashSpeed, this.dir.y * dashSpeed);
          if (time >= this.stateUntil) { this.ai = 'rest'; this.stateUntil = time + 450; }
        } else if (this.ai === 'rest') {
          this.setVelocity(0, 0);
          if (time >= this.stateUntil) this.ai = 'idle';
        } else if (dist < SIGHT + 20) {
          if (dist < 60 && time >= this.dashReadyAt) { this.ai = 'tele'; this.stateUntil = time + dashTele; this.dashReadyAt = time + 2000; }
          else this.setVelocity(toward.x * this.info.speed, toward.y * this.info.speed);
        } else this.setVelocity(0, 0);
        break;
      }
      case 'shooter': {
        // 保持距離，閃紫光後吐毒絲
        if (this.ai === 'tele') {
          this.setVelocity(0, 0);
          this.setTint(Math.floor(time / 70) % 2 ? 0xffffff : 0xb04aff);
          if (time >= this.stateUntil) { this.restoreTint(); this.emit('shoot', this, toward); this.ai = 'rest'; this.stateUntil = time + 500; this.shootReadyAt = time + (this.kind === 'dorotabou' ? 2600 : 2200); }
        } else if (this.ai === 'rest') {
          this.setVelocity(0, 0);
          if (time >= this.stateUntil) this.ai = 'idle';
        } else if (dist < SIGHT + 30) {
          if (time >= this.shootReadyAt && dist < 140) { this.ai = 'tele'; this.stateUntil = time + 550; }
          else if (dist < 50) this.setVelocity(-toward.x * this.info.speed * 1.3, -toward.y * this.info.speed * 1.3);
          else if (dist > 95) this.setVelocity(toward.x * this.info.speed, toward.y * this.info.speed);
          else { const side = this.seed % 2 < 1 ? 1 : -1; this.setVelocity(-toward.y * this.info.speed * side, toward.x * this.info.speed * side); }
        } else this.setVelocity(0, 0);
        break;
      }
      case 'slam': {
        // 精英：慢慢逼近，地上出現紅圈後重擊
        if (this.ai === 'tele') {
          this.setVelocity(0, 0);
          const k = 1 - (this.stateUntil - time) / 750;
          this.warn?.setPosition(this.center.x, this.center.y).setFillStyle(0xff3a3a, 0.15 + 0.3 * k);
          if (time >= this.stateUntil) {
            this.emit('aoe', this, { x: this.center.x, y: this.center.y, r: this.kind === 'chochin' ? 30 : 36 });
            this.warn?.destroy(); this.warn = undefined;
            this.ai = 'rest'; this.stateUntil = time + 700; this.dashReadyAt = time + 2200;
          }
        } else if (this.ai === 'rest') {
          this.setVelocity(0, 0);
          if (time >= this.stateUntil) this.ai = 'idle';
        } else if (dist < SIGHT + 20) {
          if (dist < 36 && time >= this.dashReadyAt) {
            this.ai = 'tele'; this.stateUntil = time + 750;
            this.warn = this.scene.add.circle(me.x, me.y, this.kind === 'chochin' ? 30 : 36, 0xff3a3a, 0.15).setStrokeStyle(1.5, 0xff3a3a, 0.9).setDepth(5);
          } else this.setVelocity(toward.x * this.info.speed, toward.y * this.info.speed);
        } else this.setVelocity(0, 0);
        break;
      }
    }
    if (this.body) this.setFlipX((this.body as Phaser.Physics.Arcade.Body).velocity.x > 5);
  }

  /** 撞到主角後退開一下，避免貼著連續傷害。 */
  recoil(from: Vec2): void {
    const me = this.center, dx = me.x - from.x, dy = me.y - from.y, d = Math.hypot(dx, dy) || 1;
    this.setVelocity((dx / d) * 120, (dy / d) * 120);
    this.hitstunUntil = this.scene.time.now + 250;
    this.ai = 'rest'; this.stateUntil = this.scene.time.now + 900; this.setScale(this.elite ? 1.4 : 1);
    this.warn?.destroy(); this.warn = undefined;
  }

  /** 被攻擊。回傳是否被打倒。 */
  hit(amount: number, crit: boolean, from: Vec2, opts: HitOptions = {}): boolean {
    if (!this.alive) return false;
    if (opts.paralyze) applyStatus(this.statuses, 'paralyze');
    if (opts.burn) applyStatus(this.statuses, 'burn');
    if (this.kind !== 'dummy') {
      const me = this.center, dx = me.x - from.x, dy = me.y - from.y, d = Math.hypot(dx, dy) || 1, k = (opts.knock ?? 130) * (this.elite ? 0.25 : 1);
      this.setVelocity((dx / d) * k, (dy / d) * k);
      this.hitstunUntil = this.scene.time.now + (this.elite ? 60 : 200);
      // 精英的重擊不會被普通攻擊打斷
      if (!this.elite && (this.ai === 'tele' || this.ai === 'dash')) { this.ai = 'rest'; this.stateUntil = this.scene.time.now + 300; this.setScale(1); this.restoreTint(); }
    }
    this.damage(amount, crit, crit ? '#ffd84a' : '#ffffff');
    return !this.alive;
  }

  protected damage(amount: number, crit: boolean, color: string): void {
    this.hp -= amount;
    this.barUntil = this.scene.time.now + 2500;
    floatText(this.scene, this.x, this.y - 8, crit ? `${amount}!` : String(amount), color, crit ? 11 : 9);
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => { if (this.alive) this.restoreTint(); });
    if (this.kind === 'dummy') { if (this.hp < this.maxHp * 0.5) this.hp = this.maxHp; return; }
    if (this.hp <= 0) this.die();
  }

  private die(): void {
    this.alive = false;
    this.bar.destroy();
    this.warn?.destroy();
    (this.body as Phaser.Physics.Arcade.Body).enable = false;
    this.scene.tweens.add({ targets: this, alpha: 0, scale: 1.6, duration: 280, onComplete: () => this.destroy() });
    this.emit('killed', this);
  }

  private drawBar(time: number): void {
    this.bar.clear();
    if (time > this.barUntil || this.kind === 'dummy') return;
    const w = this.elite ? 22 : 14, x = this.x - w / 2, y = this.y - (this.elite ? 15 : 11);
    this.bar.fillStyle(0x14121c, 0.8).fillRect(x - 1, y - 1, w + 2, 4);
    this.bar.fillStyle(0xe04848, 1).fillRect(x, y, Math.max(0, (this.hp / this.maxHp) * w), 2);
  }
}
