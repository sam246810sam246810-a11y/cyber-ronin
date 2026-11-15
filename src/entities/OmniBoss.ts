import Phaser from 'phaser';
import { Enemy, type EnemyKind, type HitOptions } from './Enemy';
import { tickStatuses, type Difficulty } from '../systems/combat';
import { bossPhase } from '../systems/boss';
import type { Vec2 } from '../systems/movement';

/** 可以組合的招式 */
export type Move = 'slam' | 'line3' | 'fan' | 'summon' | 'pool' | 'tornado' | 'band' | 'charge' | 'rampage' | 'gale' | 'breath';

export interface BossConfig {
  texture: string;
  /** 每個階段可以用的招式（後面的階段會加上前面的） */
  moves: [Move[], Move[], Move[]];
  /** 召喚的小怪 */
  minions: EnemyKind[];
  /** 被打倒前「動彈不得」時的顏色 */
  stunTint: number;
  slamRadius: number;
  shotTint?: number;
}

export const BOSS_CONFIGS: Record<string, BossConfig> = {
  // 酒吞童子：鐵棒重擊、火焰吐息 → 召喚餓鬼、衝撞 → 連續暴衝
  shuten: { texture: 'shuten', moves: [['slam', 'slam', 'breath'], ['summon', 'charge'], ['rampage', 'breath']], minions: ['gaki', 'gaki'], stunTint: 0xc8a8ff, slamRadius: 36 },
  // 百鬼之主：前三章 Boss 的招式全部都會
  hyakki: { texture: 'hyakki', moves: [['fan', 'slam', 'pool'], ['summon', 'tornado', 'band'], ['gale', 'line3', 'charge']], minions: ['onibi', 'gaki'], stunTint: 0xe8e8ff, slamRadius: 40, shotTint: 0xb08aff },
};

type Act = 'wait' | 'walk' | 'tele' | 'charge' | 'roar' | 'stun' | 'recover';

/** 可設定招式的 Boss（第四章的酒吞童子、隱藏章的百鬼之主） */
export class OmniBoss extends Enemy {
  phase: 1 | 2 | 3 = 1;
  readonly cfg: BossConfig;
  private act: Act = 'wait';
  private move: Move = 'slam';
  private actUntil = 0;
  private aimDir: Vec2 = { x: 0, y: 1 };
  private lockPos: Vec2 = { x: 0, y: 0 };
  private chargesLeft = 0;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private summonReadyAt = 0;
  private lastParalyze = -99999;
  minionCount: () => number = () => 0;
  arena = { x: 0, y: 0, w: 0, h: 0 };

  constructor(scene: Phaser.Scene, x: number, y: number, kind: 'shuten' | 'hyakki', difficulty: Difficulty) {
    super(scene, x, y, kind, difficulty);
    this.cfg = BOSS_CONFIGS[kind];
    this.setTexture(this.cfg.texture, 0).setScale(1);
    (this.body as Phaser.Physics.Arcade.Body).setSize(22, 14).setOffset(5, 16).setImmovable(true);
    this.gfx = scene.add.graphics().setDepth(4);
  }

  start(time: number): void { this.act = 'walk'; this.actUntil = time + 1200; }
  get started(): boolean { return this.act !== 'wait'; }
  get isStunned(): boolean { return this.act === 'stun'; }
  private get tempo(): number { return this.phase === 3 ? 0.75 : 1; }

  stun(ms: number): void {
    if (!this.alive) return;
    this.gfx.clear();
    this.act = 'stun'; this.actUntil = this.scene.time.now + ms; this.chargesLeft = 0;
    this.setVelocity(0, 0).setFrame(0).setTint(this.cfg.stunTint);
  }

  private available(): Move[] {
    const m = [...this.cfg.moves[0]];
    if (this.phase >= 2) m.push(...this.cfg.moves[1]);
    if (this.phase >= 3) m.push(...this.cfg.moves[2]);
    return m;
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
    if (p > this.phase && this.act !== 'stun') {
      this.phase = p;
      this.emit('phase', this, p);
      this.gfx.clear(); this.clearTint();
      this.act = 'roar'; this.actUntil = time + 900; this.chargesLeft = 0;
      this.scene.cameras.main.shake(600, 0.01);
    }

    const me = this.center;
    const dx = target.x - me.x, dy = target.y - me.y, dist = Math.hypot(dx, dy) || 1;
    const toward = { x: dx / dist, y: dy / dist };
    const done = time >= this.actUntil;
    const anim = Math.floor(time / 240) % 2;
    const g = this.gfx;

    switch (this.act) {
      case 'walk': {
        const sp = this.phase === 3 ? 46 : 34;
        this.setVelocity(toward.x * sp, toward.y * sp).setFrame(anim);
        if (done) this.choose(time, dist, toward, target);
        break;
      }
      case 'tele':
        this.setVelocity(0, 0);
        this.drawTele(time, me);
        if (done) { g.clear(); this.clearTint(); this.release(time, me, target); }
        break;
      case 'charge': {
        this.setVelocity(this.aimDir.x * 240, this.aimDir.y * 240).setFrame(3);
        const b = this.body as Phaser.Physics.Arcade.Body;
        if (done || b.blocked.left || b.blocked.right || b.blocked.up || b.blocked.down) {
          if (!done) this.scene.cameras.main.shake(200, 0.008);
          if (this.chargesLeft > 0) {
            // 連續暴衝：重新瞄準再衝
            this.chargesLeft--;
            const d2 = { x: target.x - this.center.x, y: target.y - this.center.y }, l = Math.hypot(d2.x, d2.y) || 1;
            this.aimDir = { x: d2.x / l, y: d2.y / l };
            this.move = 'charge'; this.act = 'tele'; this.actUntil = time + 450;
          } else { this.setFrame(0); this.recover(time, 800); }
        }
        break;
      }
      case 'roar':
        this.setVelocity(0, 0).setFrame(2);
        if (done) this.recover(time, 300);
        break;
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
    let moves = this.available();
    if (dist > 60) moves = moves.filter((m) => m !== 'slam');
    if (time < this.summonReadyAt || this.minionCount() >= 2) moves = moves.filter((m) => m !== 'summon');
    const move = moves[Math.floor(Math.random() * moves.length)] ?? 'line3';
    this.move = move;
    this.aimDir = { ...toward };
    const me = this.center;
    const teleMs: Record<Move, number> = { slam: 650, line3: 800, fan: 750, summon: 700, pool: 1000, tornado: 900, band: 1300, charge: 800, rampage: 700, gale: 1000, breath: 900 };
    this.lockPos = move === 'slam' ? { x: me.x + toward.x * 16, y: me.y + toward.y * 16 } : { ...target };
    if (move === 'rampage') { this.chargesLeft = 2; this.move = 'charge'; }
    this.act = 'tele';
    this.actUntil = time + teleMs[move] * (move === 'band' || move === 'gale' ? 1 : this.tempo);
    if (move === 'summon') this.scene.cameras.main.shake(400, 0.006);
  }

  private drawTele(time: number, me: Vec2): void {
    const g = this.gfx, anim = Math.floor(time / 90) % 2, R = this.cfg.slamRadius;
    g.clear();
    switch (this.move) {
      case 'slam':
        this.setFrame(2).setTint(anim ? 0xffffff : 0xff6a6a);
        g.fillStyle(0xff3a3a, 0.25).fillCircle(this.lockPos.x, this.lockPos.y, R).lineStyle(1.5, 0xff3a3a, 0.9).strokeCircle(this.lockPos.x, this.lockPos.y, R);
        break;
      case 'line3': case 'breath':
        this.setFrame(anim);
        g.lineStyle(this.move === 'breath' ? 6 : 2, this.move === 'breath' ? 0xff8a3a : 0xff3a3a, 0.3 + 0.3 * anim).lineBetween(me.x, me.y, me.x + this.aimDir.x * 200, me.y + this.aimDir.y * 200);
        break;
      case 'fan': {
        this.setFrame(2);
        const base = Math.atan2(this.aimDir.y, this.aimDir.x);
        g.lineStyle(1.5, 0xb08aff, 0.3 + 0.3 * anim);
        for (let i = -3; i <= 3; i++) g.lineBetween(me.x, me.y, me.x + Math.cos(base + i * 0.22) * 120, me.y + Math.sin(base + i * 0.22) * 120);
        break;
      }
      case 'pool':
        g.fillStyle(0xb04aff, 0.25).fillCircle(this.lockPos.x, this.lockPos.y, 22).lineStyle(1.5, 0xb04aff, 0.9).strokeCircle(this.lockPos.x, this.lockPos.y, 22);
        break;
      case 'tornado':
        g.lineStyle(1.5, 0xd8e8ff, 0.8).strokeCircle(this.lockPos.x, this.lockPos.y, 8 + 6 * anim);
        break;
      case 'band':
        g.fillStyle(0x8a5aff, 0.25).fillRect(this.arena.x, this.lockPos.y - 22, this.arena.w, 44).lineStyle(1.5, 0xb08aff, 0.9).strokeRect(this.arena.x, this.lockPos.y - 22, this.arena.w, 44);
        break;
      case 'charge':
        this.setFrame(3).setTint(anim ? 0xff3a3a : 0xffffff);
        g.lineStyle(3, 0xff3a3a, 0.35).lineBetween(me.x, me.y, me.x + this.aimDir.x * 260, me.y + this.aimDir.y * 260);
        break;
      case 'gale':
        this.setFrame(2);
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + time / 300; g.lineStyle(2, 0xd8e8ff, 0.6).lineBetween(me.x + Math.cos(a) * 16, me.y + Math.sin(a) * 16, me.x + Math.cos(a) * 60, me.y + Math.sin(a) * 60); }
        break;
      case 'summon':
        this.setFrame(2);
        break;
    }
  }

  private release(time: number, me: Vec2, _target: Vec2): void {
    switch (this.move) {
      case 'slam': this.emit('aoe', this, { x: this.lockPos.x, y: this.lockPos.y, r: this.cfg.slamRadius, mult: 1.3 }); this.recover(time, 600); break;
      case 'line3':
        for (let i = 0; i < 3; i++) this.scene.time.delayedCall(i * 120, () => { if (this.alive) this.emit('shoot', this, this.aimDir, 210); });
        this.recover(time, 600); break;
      case 'fan': {
        const base = Math.atan2(this.aimDir.y, this.aimDir.x);
        for (let i = -3; i <= 3; i++) this.emit('shoot', this, { x: Math.cos(base + i * 0.22), y: Math.sin(base + i * 0.22) }, 160);
        this.recover(time, 700); break;
      }
      case 'breath': this.emit('breath', this, { x: me.x, y: me.y, dir: this.aimDir }); this.recover(time, 700); break;
      case 'pool': this.emit('pool', this, { ...this.lockPos }); this.recover(time, 300); break;
      case 'tornado': this.emit('tornado', this, { ...this.lockPos }); this.recover(time, 400); break;
      case 'band': this.emit('band', this, { y: this.lockPos.y, h: 44, mult: 1.5 }); this.scene.cameras.main.shake(300, 0.01); this.recover(time, 900); break;
      case 'gale': this.emit('gale', this, { x: me.x, y: me.y, r: 46 }); this.recover(time, 700); break;
      case 'summon': this.emit('summon', this); this.summonReadyAt = time + 12000; this.recover(time, 300); break;
      case 'charge': this.act = 'charge'; this.actUntil = time + 700; break;
      case 'rampage': break;
    }
  }

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

  recoil(): void { /* 不會退開 */ }
}
