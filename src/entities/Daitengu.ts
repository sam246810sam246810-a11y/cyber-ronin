import Phaser from 'phaser';
import { Enemy, type HitOptions } from './Enemy';
import { tickStatuses, type Difficulty } from '../systems/combat';
import { bossPhase } from '../systems/boss';
import type { Vec2 } from '../systems/movement';

type Act = 'wait' | 'walk' | 'featherTele' | 'diveTele' | 'dive' | 'roar' | 'tornadoTele' | 'galeTele' | 'fallen' | 'recover';

/**
 * 大天狗（第三章 Boss）。
 * 第 1 階段：羽毛扇射（5 方向）、俯衝斬（紅線預兆後直線衝過來）。
 * 第 2 階段：再加上召喚烏天狗、旋風（會追著主角跑 5 秒）。
 * 第 3 階段：快 25%，再加上狂風（把主角吹離，太近會受傷）。
 * 敲響場地四角的神木之鈴：大天狗從空中掉下來，動彈不得 3.5 秒，受到的傷害 ×1.5。
 */
export class Daitengu extends Enemy {
  phase: 1 | 2 | 3 = 1;
  private act: Act = 'wait';
  private actUntil = 0;
  private aimDir: Vec2 = { x: 0, y: 1 };
  private lockPos: Vec2 = { x: 0, y: 0 };
  private readonly gfx: Phaser.GameObjects.Graphics;
  private summonReadyAt = 0;
  private lastParalyze = -99999;
  minionCount: () => number = () => 0;

  constructor(scene: Phaser.Scene, x: number, y: number, difficulty: Difficulty) {
    super(scene, x, y, 'daitengu', difficulty);
    this.setTexture('daitengu', 0).setScale(1);
    (this.body as Phaser.Physics.Arcade.Body).setSize(20, 14).setOffset(6, 16).setImmovable(true);
    this.gfx = scene.add.graphics().setDepth(4);
  }

  start(time: number): void { this.act = 'walk'; this.actUntil = time + 1200; }
  get started(): boolean { return this.act !== 'wait'; }
  get isStunned(): boolean { return this.act === 'fallen'; }
  private get tempo(): number { return this.phase === 3 ? 0.75 : 1; }

  /** 神木之鈴：從空中掉下來 */
  stun(ms: number): void {
    if (!this.alive) return;
    this.gfx.clear();
    this.act = 'fallen'; this.actUntil = this.scene.time.now + ms;
    this.setVelocity(0, 0).setFrame(0).setTint(0xa8a8c8).setAngle(-15);
    this.scene.cameras.main.shake(200, 0.008);
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
    if (p > this.phase && this.act !== 'fallen') {
      this.phase = p;
      this.emit('phase', this, p);
      this.gfx.clear(); this.clearTint(); this.setAngle(0);
      this.act = 'roar'; this.actUntil = time + 900;
      this.scene.cameras.main.shake(600, 0.01);
    }

    const me = this.center;
    const dx = target.x - me.x, dy = target.y - me.y, dist = Math.hypot(dx, dy) || 1;
    const toward = { x: dx / dist, y: dy / dist };
    const done = time >= this.actUntil;
    const anim = Math.floor(time / 220) % 2;
    const g = this.gfx;
    // 平常在空中飄：上下浮動
    if (this.act !== 'fallen') this.setAngle(0);

    switch (this.act) {
      case 'walk': {
        const sp = this.phase === 3 ? 50 : 38;
        // 保持一點距離繞著主角飛
        const want = dist > 70 ? 1 : dist < 40 ? -1 : 0;
        this.setVelocity(toward.x * sp * want - toward.y * sp * 0.6, toward.y * sp * want + toward.x * sp * 0.6).setFrame(anim);
        if (done) this.choose(time, dist, toward, target);
        break;
      }
      case 'featherTele': {
        this.setVelocity(0, 0).setFrame(2);
        const base = Math.atan2(this.aimDir.y, this.aimDir.x);
        g.clear().lineStyle(1.5, 0x8a8aff, 0.25 + 0.3 * anim);
        for (const d of [-0.5, -0.25, 0, 0.25, 0.5]) g.lineBetween(me.x, me.y, me.x + Math.cos(base + d) * 120, me.y + Math.sin(base + d) * 120);
        if (done) {
          g.clear();
          for (const d of [-0.5, -0.25, 0, 0.25, 0.5]) this.emit('shoot', this, { x: Math.cos(base + d), y: Math.sin(base + d) }, 170);
          this.recover(time, 600);
        }
        break;
      }
      case 'diveTele':
        this.setVelocity(0, 0).setFrame(3);
        this.setTint(Math.floor(time / 70) % 2 ? 0xff5a3a : 0xffffff);
        g.clear().lineStyle(3, 0xff3a3a, 0.35).lineBetween(me.x, me.y, me.x + this.aimDir.x * 260, me.y + this.aimDir.y * 260);
        if (done) { g.clear(); this.clearTint(); this.act = 'dive'; this.actUntil = time + 600; }
        break;
      case 'dive': {
        this.setVelocity(this.aimDir.x * 250, this.aimDir.y * 250).setFrame(3);
        const b = this.body as Phaser.Physics.Arcade.Body;
        if (done || b.blocked.left || b.blocked.right || b.blocked.up || b.blocked.down) { this.setFrame(0); this.recover(time, 700); }
        break;
      }
      case 'tornadoTele': {
        this.setVelocity(0, 0).setFrame(2);
        const k = 1 - (this.actUntil - time) / (900 * this.tempo);
        g.clear().lineStyle(1.5, 0xb8c8ff, 0.5 + 0.4 * k).strokeCircle(this.lockPos.x, this.lockPos.y, 8 + 10 * k);
        if (done) { g.clear(); this.emit('tornado', this, { ...this.lockPos }); this.recover(time, 400); }
        break;
      }
      case 'galeTele': {
        this.setVelocity(0, 0).setFrame(2);
        const k = 1 - (this.actUntil - time) / 1000;
        g.clear().lineStyle(2, 0xd8e8ff, 0.3 + 0.5 * k);
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + time / 300; g.lineBetween(me.x + Math.cos(a) * 16, me.y + Math.sin(a) * 16, me.x + Math.cos(a) * (30 + 40 * k), me.y + Math.sin(a) * (30 + 40 * k)); }
        if (done) { g.clear(); this.emit('gale', this, { x: me.x, y: me.y, r: 46 }); this.recover(time, 700); }
        break;
      }
      case 'roar':
        this.setVelocity(0, 0).setFrame(2);
        if (done) {
          if (this.phase >= 2 && time >= this.summonReadyAt && this.minionCount() < 2) { this.emit('summon', this); this.summonReadyAt = time + 12000; }
          this.recover(time, 300);
        }
        break;
      case 'fallen':
        this.setVelocity(0, 0).setFrame(0);
        if (done) { this.clearTint(); this.setAngle(0); this.act = 'walk'; this.actUntil = time + 600; }
        break;
      case 'recover':
        this.setVelocity(0, 0).setFrame(anim);
        if (done) { this.act = 'walk'; this.actUntil = time + Phaser.Math.Between(700, 1100) * this.tempo; }
        break;
    }
  }

  private recover(time: number, ms: number): void { this.act = 'recover'; this.actUntil = time + ms * this.tempo; }

  private choose(time: number, _dist: number, toward: Vec2, target: Vec2): void {
    const options: Act[] = ['featherTele', 'diveTele'];
    if (this.phase >= 2) {
      options.push('tornadoTele');
      if (time >= this.summonReadyAt && this.minionCount() < 2) options.push('roar');
    }
    if (this.phase === 3) options.push('galeTele', 'galeTele');
    const pick = options[Math.floor(Math.random() * options.length)];
    this.aimDir = { ...toward };
    this.act = pick;
    switch (pick) {
      case 'featherTele': this.actUntil = time + 750 * this.tempo; break;
      case 'diveTele': this.actUntil = time + 800; break;
      case 'tornadoTele': this.lockPos = { ...target }; this.actUntil = time + 900 * this.tempo; break;
      case 'galeTele': this.actUntil = time + 1000; break;
      case 'roar': this.actUntil = time + 700; this.scene.cameras.main.shake(400, 0.006); break;
    }
  }

  hit(amount: number, crit: boolean, _from: Vec2, opts: HitOptions = {}): boolean {
    if (!this.alive || this.act === 'wait') return false;
    if (opts.burn) this.statuses.burn = Math.max(this.statuses.burn ?? 0, 5);
    const now = this.scene.time.now;
    if (opts.paralyze && now - this.lastParalyze > 6000 && this.act !== 'fallen') { this.lastParalyze = now; this.stun(800); }
    const n = this.act === 'fallen' ? Math.round(amount * 1.5) : amount;
    this.damage(n, crit, crit ? '#ffd84a' : this.act === 'fallen' ? '#9fd8ff' : '#ffffff');
    if (!this.alive) this.gfx.destroy();
    return !this.alive;
  }

  recoil(): void { /* 不會退開 */ }
}
