import Phaser from 'phaser';
import { Enemy, type HitOptions } from './Enemy';
import { tickStatuses, type Difficulty } from '../systems/combat';
import type { Vec2 } from '../systems/movement';
import { bossPhase } from '../systems/boss';

type Act = 'wait' | 'walk' | 'swipeTele' | 'spitTele' | 'roar' | 'poolTele' | 'chargeTele' | 'charge' | 'stun' | 'recover';


/**
 * 土蜘蛛。
 * 第 1 階段：前腳揮擊、直線吐絲。第 2 階段：再加上召喚骨蜘蛛、毒池。
 * 第 3 階段：狂暴（動作快 30%），再加上衝撞、蛛網封路。
 * 點亮場地四角的石燈籠會讓它硬直 3 秒，這段時間受到的傷害 ×1.5。
 */
export class Boss extends Enemy {
  phase: 1 | 2 | 3 = 1;
  private act: Act = 'wait';
  private actUntil = 0;
  private aimDir: Vec2 = { x: 0, y: 1 };
  private lockPos: Vec2 = { x: 0, y: 0 };
  private readonly gfx: Phaser.GameObjects.Graphics;
  private summonReadyAt = 0;
  private websReadyAt = 0;
  private lastParalyze = -99999;
  /** World 告訴 Boss 目前有幾隻小怪 */
  minionCount: () => number = () => 0;

  constructor(scene: Phaser.Scene, x: number, y: number, difficulty: Difficulty) {
    super(scene, x, y, 'tsuchigumo', difficulty);
    this.setTexture('boss', 0).setScale(1);
    (this.body as Phaser.Physics.Arcade.Body).setSize(24, 14).setOffset(4, 16).setImmovable(true);
    this.gfx = scene.add.graphics().setDepth(4);
  }

  /** 戰鬥開始（劇情對話結束後） */
  start(time: number): void { this.act = 'walk'; this.actUntil = time + 1200; }

  get isStunned(): boolean { return this.act === 'stun'; }
  get started(): boolean { return this.act !== 'wait'; }
  private get tempo(): number { return this.phase === 3 ? 0.77 : 1; }

  stun(ms: number): void {
    if (!this.alive) return;
    const now = this.scene.time.now;
    this.gfx.clear();
    this.act = 'stun'; this.actUntil = now + ms;
    this.setVelocity(0, 0).setFrame(0).setTint(0x8a9ad8);
  }

  update(time: number, dt: number, target: Vec2): void {
    if (!this.alive) return;
    this.setDepth(this.y + 8);
    const dot = tickStatuses(this.statuses, dt, this.maxHp);
    if (dot > 0) {
      this.dotAccum += dot;
      if (this.dotAccum >= 1) { const n = Math.floor(this.dotAccum); this.dotAccum -= n; this.damage(n, false, '#ff9a4a'); if (!this.alive) return; }
    }
    if (this.act === 'wait') { this.setVelocity(0, 0); return; }

    const p = bossPhase(this.hp, this.maxHp);
    if (p > this.phase) {
      this.phase = p;
      this.emit('phase', this, p);
      this.gfx.clear(); this.clearTint();
      this.act = 'roar'; this.actUntil = time + 900;
      this.scene.cameras.main.shake(600, 0.01);
      if (p === 2) this.summonReadyAt = 0;
    }

    const me = this.center;
    const dx = target.x - me.x, dy = target.y - me.y, dist = Math.hypot(dx, dy) || 1;
    const toward = { x: dx / dist, y: dy / dist };
    const done = time >= this.actUntil;
    const anim = Math.floor(time / 260) % 2;

    switch (this.act) {
      case 'walk': {
        const sp = this.phase === 3 ? 42 : 30;
        this.setVelocity(toward.x * sp, toward.y * sp).setFrame(anim);
        if (done) this.choose(time, dist, toward, target);
        break;
      }
      case 'swipeTele': {
        this.setVelocity(0, 0).setFrame(2);
        this.setTint(Math.floor(time / 80) % 2 ? 0xffffff : 0xff6a6a);
        this.gfx.clear().fillStyle(0xff3a3a, 0.12 + 0.25 * (1 - (this.actUntil - time) / (600 * this.tempo)))
          .fillCircle(this.lockPos.x, this.lockPos.y, 30).lineStyle(1.5, 0xff3a3a, 0.9).strokeCircle(this.lockPos.x, this.lockPos.y, 30);
        if (done) {
          this.gfx.clear(); this.clearTint();
          this.emit('aoe', this, { x: this.lockPos.x, y: this.lockPos.y, r: 30, mult: 1.3 });
          this.recover(time, 500);
        }
        break;
      }
      case 'spitTele': {
        this.setVelocity(0, 0).setFrame(anim);
        const len = 220;
        this.gfx.clear().lineStyle(2, 0xff3a3a, 0.35 + 0.4 * anim).lineBetween(me.x, me.y, me.x + this.aimDir.x * len, me.y + this.aimDir.y * len);
        if (done) {
          this.gfx.clear();
          for (let i = 0; i < 3; i++) this.scene.time.delayedCall(i * 130, () => { if (this.alive) this.emit('shoot', this, this.aimDir, 190); });
          this.recover(time, 600);
        }
        break;
      }
      case 'roar':
        this.setVelocity(0, 0).setFrame(3);
        if (done) {
          this.setFrame(0);
          if (this.phase >= 2 && time >= this.summonReadyAt && this.minionCount() < 2) { this.emit('summon', this); this.summonReadyAt = time + 12000; }
          this.recover(time, 300);
        }
        break;
      case 'poolTele': {
        this.setVelocity(0, 0).setFrame(anim);
        const k = 1 - (this.actUntil - time) / (1000 * this.tempo);
        this.gfx.clear().fillStyle(0xb04aff, 0.1 + 0.25 * k).fillCircle(this.lockPos.x, this.lockPos.y, 22)
          .lineStyle(1.5, 0xb04aff, 0.9).strokeCircle(this.lockPos.x, this.lockPos.y, 22);
        if (done) { this.gfx.clear(); this.emit('pool', this, { ...this.lockPos }); this.recover(time, 300); }
        break;
      }
      case 'chargeTele':
        this.setVelocity(0, 0).setFrame(3);
        this.setTint(Math.floor(time / 70) % 2 ? 0xff3a3a : 0xffffff);
        this.gfx.clear().lineStyle(3, 0xff3a3a, 0.3).lineBetween(me.x, me.y, me.x + this.aimDir.x * 260, me.y + this.aimDir.y * 260);
        if (done) { this.gfx.clear(); this.clearTint(); this.act = 'charge'; this.actUntil = time + 700; }
        break;
      case 'charge': {
        this.setVelocity(this.aimDir.x * 230, this.aimDir.y * 230).setFrame(3);
        const b = this.body as Phaser.Physics.Arcade.Body;
        if (done || b.blocked.left || b.blocked.right || b.blocked.up || b.blocked.down) {
          if (!done) this.scene.cameras.main.shake(200, 0.008);
          this.setFrame(0);
          this.recover(time, 800);
        }
        break;
      }
      case 'stun':
        this.setVelocity(0, 0).setFrame(0);
        if (done) { this.clearTint(); this.act = 'walk'; this.actUntil = time + 600; }
        break;
      case 'recover':
        this.setVelocity(0, 0).setFrame(anim);
        if (done) { this.act = 'walk'; this.actUntil = time + Phaser.Math.Between(700, 1100) * this.tempo; }
        break;
    }
  }

  private recover(time: number, ms: number): void { this.act = 'recover'; this.actUntil = time + ms * this.tempo; }

  private choose(time: number, dist: number, toward: Vec2, target: Vec2): void {
    const options: Act[] = [];
    if (dist < 50) options.push('swipeTele', 'swipeTele');
    options.push('spitTele');
    if (this.phase >= 2) {
      options.push('poolTele');
      if (time >= this.summonReadyAt && this.minionCount() < 2) options.push('roar');
    }
    if (this.phase === 3) {
      options.push('chargeTele', 'chargeTele');
      if (time >= this.websReadyAt) options.push('webs' as Act);
    }
    const pick = options[Math.floor(Math.random() * options.length)];
    this.aimDir = { ...toward };
    const me = this.center;
    switch (pick) {
      case 'swipeTele':
        this.lockPos = { x: me.x + toward.x * 16, y: me.y + toward.y * 16 };
        this.act = 'swipeTele'; this.actUntil = time + 600 * this.tempo; break;
      case 'spitTele': this.act = 'spitTele'; this.actUntil = time + 800 * this.tempo; break;
      case 'poolTele': this.lockPos = { ...target }; this.act = 'poolTele'; this.actUntil = time + 1000 * this.tempo; break;
      case 'roar': this.act = 'roar'; this.actUntil = time + 700; this.scene.cameras.main.shake(400, 0.006); break;
      case 'chargeTele': this.act = 'chargeTele'; this.actUntil = time + 800; break;
      default:
        // 蛛網封路
        this.websReadyAt = time + 9000;
        this.emit('webs', this, { ...target });
        this.recover(time, 400);
    }
  }

  /** Boss 不會被擊退；硬直中受到的傷害 ×1.5；麻痺改成短暫硬直（6 秒冷卻） */
  hit(amount: number, crit: boolean, _from: Vec2, opts: HitOptions = {}): boolean {
    if (!this.alive || this.act === 'wait') return false;
    if (opts.burn) this.statuses.burn = Math.max(this.statuses.burn ?? 0, 5);
    const now = this.scene.time.now;
    if (opts.paralyze && now - this.lastParalyze > 6000 && this.act !== 'stun') { this.lastParalyze = now; this.stun(800); }
    const n = this.act === 'stun' ? Math.round(amount * 1.5) : amount;
    this.damage(n, crit, crit ? '#ffd84a' : this.act === 'stun' ? '#9fd8ff' : '#ffffff');
    if (!this.alive) this.gfx.destroy();
    return !this.alive;
  }

  recoil(): void { /* Boss 撞到人不會退開 */ }
}
