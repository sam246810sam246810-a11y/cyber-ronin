import Phaser from 'phaser';
import { Enemy, type HitOptions } from './Enemy';
import { tickStatuses, type Difficulty } from '../systems/combat';
import { bossPhase } from '../systems/boss';
import type { Vec2 } from '../systems/movement';

type Act = 'wait' | 'walk' | 'cannonTele' | 'slapTele' | 'roar' | 'fanTele' | 'waveTele' | 'dry' | 'recover';

/**
 * 河童王（第二章 Boss）。
 * 第 1 階段：水砲（直線 3 連發）、拍擊（前方紅圈）。
 * 第 2 階段：再加上召喚河童、扇形水彈（5 方向）。
 * 第 3 階段：快 30%，再加上大浪（橫掃一整排，用閃避的無敵時間穿過去）。
 * 打開四角的水閘讓頭上的皿乾掉：動彈不得 4 秒，受到的傷害 ×1.5。
 */
export class KappaKing extends Enemy {
  phase: 1 | 2 | 3 = 1;
  private act: Act = 'wait';
  private actUntil = 0;
  private aimDir: Vec2 = { x: 0, y: 1 };
  private lockPos: Vec2 = { x: 0, y: 0 };
  private readonly gfx: Phaser.GameObjects.Graphics;
  private summonReadyAt = 0;
  private lastParalyze = -99999;
  minionCount: () => number = () => 0;
  arena = { x: 0, y: 0, w: 0, h: 0 };

  constructor(scene: Phaser.Scene, x: number, y: number, difficulty: Difficulty) {
    super(scene, x, y, 'kappaking', difficulty);
    this.setTexture('kappaking', 0).setScale(1);
    (this.body as Phaser.Physics.Arcade.Body).setSize(24, 14).setOffset(4, 16).setImmovable(true);
    this.gfx = scene.add.graphics().setDepth(4);
  }

  start(time: number): void { this.act = 'walk'; this.actUntil = time + 1200; }
  get started(): boolean { return this.act !== 'wait'; }
  get isStunned(): boolean { return this.act === 'dry'; }
  private get tempo(): number { return this.phase === 3 ? 0.75 : 1; }

  /** 水閘打開：皿乾掉 */
  stun(ms: number): void {
    if (!this.alive) return;
    this.gfx.clear();
    this.act = 'dry'; this.actUntil = this.scene.time.now + ms;
    this.setVelocity(0, 0).setFrame(3).setTint(0xb8c0c8);
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
    if (p > this.phase && this.act !== 'dry') {
      this.phase = p;
      this.emit('phase', this, p);
      this.gfx.clear(); this.clearTint();
      this.act = 'roar'; this.actUntil = time + 900;
      this.scene.cameras.main.shake(600, 0.01);
    }

    const me = this.center;
    const dx = target.x - me.x, dy = target.y - me.y, dist = Math.hypot(dx, dy) || 1;
    const toward = { x: dx / dist, y: dy / dist };
    const done = time >= this.actUntil;
    const anim = Math.floor(time / 260) % 2;
    const g = this.gfx;

    switch (this.act) {
      case 'walk': {
        const sp = this.phase === 3 ? 44 : 32;
        this.setVelocity(toward.x * sp, toward.y * sp).setFrame(anim);
        if (done) this.choose(time, dist, toward, target);
        break;
      }
      case 'slapTele':
        this.setVelocity(0, 0).setFrame(2);
        this.setTint(Math.floor(time / 80) % 2 ? 0xffffff : 0xff6a6a);
        g.clear().fillStyle(0xff3a3a, 0.15 + 0.25 * (1 - (this.actUntil - time) / (650 * this.tempo))).fillCircle(this.lockPos.x, this.lockPos.y, 32)
          .lineStyle(1.5, 0xff3a3a, 0.9).strokeCircle(this.lockPos.x, this.lockPos.y, 32);
        if (done) { g.clear(); this.clearTint(); this.emit('aoe', this, { x: this.lockPos.x, y: this.lockPos.y, r: 32, mult: 1.3 }); this.recover(time, 500); }
        break;
      case 'cannonTele':
        this.setVelocity(0, 0).setFrame(anim);
        g.clear().lineStyle(2, 0x5ab0e8, 0.35 + 0.4 * anim).lineBetween(me.x, me.y, me.x + this.aimDir.x * 240, me.y + this.aimDir.y * 240);
        if (done) {
          g.clear();
          for (let i = 0; i < 3; i++) this.scene.time.delayedCall(i * 120, () => { if (this.alive) this.emit('shoot', this, this.aimDir, 210); });
          this.recover(time, 600);
        }
        break;
      case 'fanTele': {
        this.setVelocity(0, 0).setFrame(2);
        const base = Math.atan2(this.aimDir.y, this.aimDir.x);
        g.clear().lineStyle(1.5, 0x5ab0e8, 0.3 + 0.3 * anim);
        for (const d of [-0.6, -0.3, 0, 0.3, 0.6]) g.lineBetween(me.x, me.y, me.x + Math.cos(base + d) * 120, me.y + Math.sin(base + d) * 120);
        if (done) {
          g.clear();
          for (const d of [-0.6, -0.3, 0, 0.3, 0.6]) this.emit('shoot', this, { x: Math.cos(base + d), y: Math.sin(base + d) }, 150);
          this.recover(time, 700);
        }
        break;
      }
      case 'waveTele': {
        this.setVelocity(0, 0).setFrame(3);
        const k = 1 - (this.actUntil - time) / 1300;
        g.clear().fillStyle(0x3a8ae8, 0.12 + 0.28 * k).fillRect(this.arena.x, this.lockPos.y - 22, this.arena.w, 44)
          .lineStyle(1.5, 0x8ac8ff, 0.9).strokeRect(this.arena.x, this.lockPos.y - 22, this.arena.w, 44);
        if (done) {
          g.clear();
          this.emit('band', this, { y: this.lockPos.y, h: 44, mult: 1.5 });
          this.scene.cameras.main.shake(300, 0.01);
          this.recover(time, 900);
        }
        break;
      }
      case 'roar':
        this.setVelocity(0, 0).setFrame(2);
        if (done) {
          if (this.phase >= 2 && time >= this.summonReadyAt && this.minionCount() < 2) { this.emit('summon', this); this.summonReadyAt = time + 12000; }
          this.recover(time, 300);
        }
        break;
      case 'dry':
        this.setVelocity(0, 0).setFrame(3);
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
    if (dist < 52) options.push('slapTele', 'slapTele');
    options.push('cannonTele');
    if (this.phase >= 2) {
      options.push('fanTele');
      if (time >= this.summonReadyAt && this.minionCount() < 2) options.push('roar');
    }
    if (this.phase === 3) options.push('waveTele', 'waveTele');
    const pick = options[Math.floor(Math.random() * options.length)];
    this.aimDir = { ...toward };
    const me = this.center;
    this.act = pick;
    switch (pick) {
      case 'slapTele': this.lockPos = { x: me.x + toward.x * 16, y: me.y + toward.y * 16 }; this.actUntil = time + 650 * this.tempo; break;
      case 'cannonTele': this.actUntil = time + 800 * this.tempo; break;
      case 'fanTele': this.actUntil = time + 750 * this.tempo; break;
      case 'waveTele': this.lockPos = { ...target }; this.actUntil = time + 1300; break;
      case 'roar': this.actUntil = time + 700; this.scene.cameras.main.shake(400, 0.006); break;
    }
  }

  hit(amount: number, crit: boolean, _from: Vec2, opts: HitOptions = {}): boolean {
    if (!this.alive || this.act === 'wait') return false;
    if (opts.burn) this.statuses.burn = Math.max(this.statuses.burn ?? 0, 5);
    const now = this.scene.time.now;
    if (opts.paralyze && now - this.lastParalyze > 6000 && this.act !== 'dry') { this.lastParalyze = now; this.stun(800); }
    const n = this.act === 'dry' ? Math.round(amount * 1.5) : amount;
    this.damage(n, crit, crit ? '#ffd84a' : this.act === 'dry' ? '#9fd8ff' : '#ffffff');
    if (!this.alive) this.gfx.destroy();
    return !this.alive;
  }

  recoil(): void { /* 不會退開 */ }
}
