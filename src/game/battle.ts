import { CHAPTERS, ChapterDef, RoomSpec, buildRooms, ROOMS_PER_CHAPTER } from '../data/chapters';
import { ENEMIES, EnemyDef } from '../data/enemies';
import { SKILLS, SKILL_MAP, SkillDef, SkillId, xpNeed } from '../data/skills';
import type { BaseStats } from '../meta/state';
import { getImage, sprite, whiteSprite } from '../core/assets';
import { sfx, vibrate } from '../core/audio';
import { Input } from '../core/input';
import { track } from '../core/track';
import { Pool, Rect, clamp, dist2, fmtNum, rand, randInt } from './util';

// ---- 世界座標（直式 540 x 960）----
export const VW = 540;
export const VH = 960;
const RX0 = 24, RX1 = 516, RY0 = 130, RY1 = 930;
const DOOR_X0 = 226, DOOR_X1 = 314;
const TAU = Math.PI * 2;

const LAYOUTS: Rect[][] = [
  [],
  [{ x: 80, y: 430, w: 110, h: 60 }, { x: 350, y: 430, w: 110, h: 60 }],
  [{ x: 220, y: 470, w: 100, h: 100 }],
  [{ x: 70, y: 260, w: 80, h: 80 }, { x: 390, y: 260, w: 80, h: 80 }, { x: 70, y: 640, w: 80, h: 80 }, { x: 390, y: 640, w: 80, h: 80 }],
  [{ x: 24, y: 470, w: 170, h: 50 }, { x: 346, y: 470, w: 170, h: 50 }],
  [{ x: 110, y: 300, w: 70, h: 70 }, { x: 360, y: 380, w: 70, h: 70 }, { x: 200, y: 610, w: 70, h: 70 }],
];

interface Bullet {
  x: number; y: number; vx: number; vy: number; r: number; dmg: number;
  enemy: boolean; pierce: boolean; wall: number; rico: number; hits: Enemy[];
  life: number; color: string; spin: number; src: string;
}
interface Enemy {
  id: number; def: EnemyDef; x: number; y: number; r: number; hp: number; maxHp: number;
  vx: number; vy: number; kx: number; ky: number; flash: number; squash: number;
  state: number; t: number; t2: number; ang: number; tx: number; ty: number; count: number;
  spawn: number; burnT: number; burnDps: number; burnTick: number; slowT: number; slowAmt: number;
  orbitCd: number; alive: boolean; dmgMult: number; ps: number; phase2: boolean; hop: number;
}
interface Coin { x: number; y: number; vx: number; vy: number; v: number; magnet: boolean; t: number }
interface Particle { x: number; y: number; vx: number; vy: number; t: number; life: number; size: number; color: string; kind: 0 | 1 | 2; grav: number }
interface DmgText { x: number; y: number; vy: number; t: number; text: string; kind: 0 | 1 | 2 | 3 }
interface Arc { pts: number[]; t: number }

export interface RunResult {
  win: boolean; chapter: number; roomsCleared: number; gold: number; kills: number;
  eliteKills: number; bossKills: number; level: number; evolutions: number;
  reachedBoss: boolean; bossHpPct: number | null; skills: Partial<Record<SkillId, number>>;
}

export interface BattleHooks {
  levelUp(choices: SkillDef[], canReroll: boolean): void;
  died(canRevive: boolean): void;
  finished(r: RunResult): void;
}

type State = 'play' | 'pick' | 'dead' | 'trans' | 'end' | 'pause';

export class Battle {
  ctx: CanvasRenderingContext2D;
  ch: ChapterDef;
  rooms: RoomSpec[];
  roomIdx = 0;
  state: State = 'trans';
  prevState: State = 'play';

  // 玩家
  p = { x: VW / 2, y: RY1 - 80, r: 18, hp: 0, invuln: 0, flash: 0, face: -Math.PI / 2, moving: false, stillT: 0, fireT: 0, squash: 0, flip: 1 };
  atk = 0; aspd = 0; crit = 0; critDmg = 0; maxHp = 0; speed = 0; dmgReduce = 0;
  skills: Partial<Record<SkillId, number>> = {};
  level = 1; xp = 0; pendingLevels = 0;

  enemies: Enemy[] = [];
  bullets = new Pool<Bullet>(() => ({ x: 0, y: 0, vx: 0, vy: 0, r: 0, dmg: 0, enemy: false, pierce: false, wall: 0, rico: 0, hits: [], life: 0, color: '', spin: 0, src: '' }));
  coins = new Pool<Coin>(() => ({ x: 0, y: 0, vx: 0, vy: 0, v: 0, magnet: false, t: 0 }));
  parts = new Pool<Particle>(() => ({ x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 0, size: 0, color: '', kind: 0, grav: 0 }));
  texts = new Pool<DmgText>(() => ({ x: 0, y: 0, vy: 0, t: 0, text: '', kind: 0 }));
  arcs: Arc[] = [];
  obstacles: Rect[] = [];

  doorOpen = false;
  clearT = 0;
  freeze = 0;
  shake = 0;
  time = 0;
  fade = 1;
  fadeDir = -1;
  banner: { text: string; sub: string; t: number; color: string } | null = null;
  boss: Enemy | null = null;
  reachedBoss = false;
  lastBossHpPct: number | null = null;
  hurtFlash = 0;
  evoFlash = 0;
  orbitAng = 0;

  curSrc = '';
  hurtBy: Record<string, number> = {};
  kills = 0; eliteKills = 0; bossKills = 0; goldRun = 0; evolutions = 0;
  reviveUsed = false; rerollUsed = false;
  nextId = 1;

  private raf = 0;
  private acc = 0;
  private lastT = 0;
  private scale = 1; private offX = 0; private offY = 0; private dpr = 1;
  private floor: CanvasPattern | null = null;
  fps = 60; private fpsAcc = 0; private fpsN = 0;
  bot = false;
  timeScale = 1;

  constructor(private canvas: HTMLCanvasElement, private input: Input, private hooks: BattleHooks, chapter: number, private base: BaseStats) {
    this.ctx = canvas.getContext('2d')!;
    this.ch = CHAPTERS[chapter - 1];
    this.rooms = buildRooms(this.ch, Math.random);
    this.recalc();
    this.p.hp = this.maxHp;
    this.buildFloor();
    this.resize();
    this.setupRoom(0);
    track('run_start', { chapter });
  }

  // ================= 生命週期 =================
  start() {
    this.input.enabled = true;
    this.lastT = performance.now();
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      let dt = (t - this.lastT) / 1000;
      this.lastT = t;
      if (dt > 0.1) dt = 0.1;
      this.fpsAcc += dt; this.fpsN++;
      if (this.fpsAcc >= 0.5) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
      this.acc += dt * this.timeScale;
      const step = 1 / 60;
      const maxN = 4 * this.timeScale;
      let n = 0;
      while (this.acc >= step && n < maxN) { this.update(step); this.acc -= step; n++; }
      if (n === maxN) this.acc = 0;
      this.render();
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.input.enabled = false;
    this.input.reset();
  }

  pause() { if (this.state === 'play') { this.prevState = this.state; this.state = 'pause'; this.input.reset(); } }
  resume() { if (this.state === 'pause') { this.state = this.prevState; this.lastT = performance.now(); } }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.floor(window.innerWidth * this.dpr);
    const chh = Math.floor(window.innerHeight * this.dpr);
    this.canvas.width = cw; this.canvas.height = chh;
    this.scale = Math.min(cw / VW, chh / VH);
    this.offX = (cw - VW * this.scale) / 2;
    this.offY = (chh - VH * this.scale) / 2;
    this.input.maxR = 60 * this.scale / this.dpr;
  }

  L(id: SkillId) { return this.skills[id] ?? 0; }

  recalc() {
    const b = this.base;
    const oldMax = this.maxHp;
    this.atk = b.atk * (1 + 0.2 * this.L('atk'));
    this.aspd = b.aspd * (1 + 0.15 * this.L('aspd'));
    this.crit = Math.min(1, b.crit + 0.08 * this.L('crit'));
    this.critDmg = b.critDmg + 0.4 * this.L('critdmg');
    this.maxHp = Math.round(b.maxHp * (1 + 0.2 * this.L('maxhp')));
    this.speed = b.speed;
    this.dmgReduce = b.dmgReduce;
    if (oldMax) this.p.hp = Math.min(this.maxHp, this.p.hp + Math.max(0, this.maxHp - oldMax));
  }

  // ================= 房間 =================
  setupRoom(i: number) {
    this.roomIdx = i;
    const spec = this.rooms[i];
    this.enemies = [];
    this.bullets.clear(); this.coins.clear(); this.arcs = [];
    this.obstacles = LAYOUTS[spec.layout] ?? [];
    this.doorOpen = false;
    this.clearT = 0;
    this.boss = null;
    this.p.x = VW / 2; this.p.y = RY1 - 70; this.p.fireT = 0.3;
    for (const [id, count] of spec.enemies) for (let k = 0; k < count; k++) this.spawnEnemy(id, spec.kind !== 'normal' && ENEMIES[id].rank !== 'normal');
    if (spec.kind === 'boss') {
      this.reachedBoss = true;
      this.banner = { text: `BOSS`, sub: ENEMIES[this.ch.boss].name, t: 2.2, color: '#ff5a5a' };
      sfx.boss(); this.shake = 10; vibrate([60, 40, 60]);
    } else if (spec.kind === 'elite') {
      this.banner = { text: '菁英來襲', sub: ENEMIES[spec.enemies[0][0]].name, t: 1.8, color: '#ffb02e' };
      sfx.boss();
    }
  }

  spawnEnemy(id: string, center = false, x?: number, y?: number): Enemy {
    const def = ENEMIES[id];
    const growth = 1 + this.ch.roomGrowth * this.roomIdx;
    const hpMult = this.ch.hpMult * growth * (def.rank === 'boss' ? this.ch.bossHpMult : 1);
    let px = x ?? 0, py = y ?? 0;
    if (x === undefined) {
      if (center) { px = VW / 2; py = def.rank === 'boss' ? 300 : 320; }
      else {
        for (let tries = 0; tries < 40; tries++) {
          px = rand(RX0 + 40, RX1 - 40); py = rand(RY0 + 50, RY0 + 450);
          if (dist2(px, py, this.p.x, this.p.y) < 230 * 230) continue;
          if (this.obstacles.some((o) => px > o.x - 30 && px < o.x + o.w + 30 && py > o.y - 30 && py < o.y + o.h + 30)) continue;
          if (this.enemies.some((e) => dist2(px, py, e.x, e.y) < 50 * 50)) continue;
          break;
        }
      }
    }
    const e: Enemy = {
      id: this.nextId++, def, x: px, y: py, r: def.r, hp: def.hp * hpMult, maxHp: def.hp * hpMult,
      vx: 0, vy: 0, kx: 0, ky: 0, flash: 0, squash: 0, state: 0, t: rand(0.6, 1.4), t2: 0, ang: 0, tx: px, ty: py, count: 0,
      spawn: 0.5, burnT: 0, burnDps: 0, burnTick: 0, slowT: 0, slowAmt: 0, orbitCd: 0, alive: true,
      dmgMult: this.ch.dmgMult, ps: def.rank === 'boss' ? this.ch.bossPatternSpeed : 1, phase2: false, hop: 0,
    };
    if (def.rank === 'boss') { e.t = 1.8; this.boss = e; }
    this.enemies.push(e);
    this.puff(px, py, def.color, 10);
    return e;
  }

  // ================= 更新 =================
  update(dt: number) {
    this.time += dt;
    this.updateFx(dt);
    if (this.state === 'trans') { this.updateFade(dt); return; }
    if (this.state !== 'play') return;
    if (this.freeze > 0) { this.freeze -= dt; return; }

    this.updatePlayer(dt);
    this.updateOrbit(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updateCoins(dt);
    this.checkRoom(dt);
    if (this.pendingLevels > 0 && this.state === 'play') this.openPick();
  }

  updateFade(dt: number) {
    this.fade += this.fadeDir * dt * 3.2;
    if (this.fadeDir > 0 && this.fade >= 1) {
      this.fade = 1;
      this.setupRoom(this.roomIdx + 1);
      this.fadeDir = -1;
    } else if (this.fadeDir < 0 && this.fade <= 0) {
      this.fade = 0;
      this.state = 'play';
    }
  }

  updatePlayer(dt: number) {
    const p = this.p;
    const mv = this.bot ? this.botMove() : this.input.move();
    const mag = Math.hypot(mv.x, mv.y);
    p.moving = mag > 0.05;
    p.invuln -= dt; p.flash -= dt; p.squash = Math.max(0, p.squash - dt * 5);
    if (p.moving) {
      p.x += mv.x * this.speed * dt;
      p.y += mv.y * this.speed * dt;
      p.face = Math.atan2(mv.y, mv.x);
      if (Math.abs(mv.x) > 0.1) p.flip = mv.x < 0 ? -1 : 1;
      p.stillT = 0;
      if (Math.random() < dt * 14) this.addPart(p.x + rand(-6, 6), p.y + p.r - 2, rand(-20, 20), rand(-30, -10), 0.35, 4, 'rgba(255,255,255,0.7)', 0, 0);
    } else {
      p.stillT += dt;
    }
    for (const o of this.obstacles) pushOut(p, o);
    const inDoor = this.doorOpen && p.x > DOOR_X0 + p.r * 0.6 && p.x < DOOR_X1 - p.r * 0.6;
    p.x = clamp(p.x, RX0 + p.r, RX1 - p.r);
    p.y = clamp(p.y, inDoor ? RY0 - 60 : RY0 + p.r, RY1 - p.r);

    p.fireT -= dt;
    const target = this.aimTarget();
    if (!p.moving && target) {
      p.face = Math.atan2(target.y - p.y, target.x - p.x);
      if (Math.abs(target.x - p.x) > 4) p.flip = target.x < p.x ? -1 : 1;
      if (p.fireT <= 0 && p.stillT > 0.04) { this.fire(target); p.fireT = 1 / this.aspd; }
    }
    if (inDoor && p.y < RY0 - 10 && this.state === 'play') this.nextRoom();
  }

  nextRoom() {
    if (this.roomIdx + 1 >= this.rooms.length) return;
    this.state = 'trans'; this.fadeDir = 1;
    sfx.door();
  }

  nearest(x: number, y: number, exclude?: Enemy[], maxD = Infinity, needLos = false): Enemy | null {
    let best: Enemy | null = null, bd = maxD * maxD;
    for (const e of this.enemies) {
      if (!e.alive || e.spawn > 0.25 || (exclude && exclude.includes(e))) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < bd && (!needLos || this.los(x, y, e.x, e.y))) { bd = d; best = e; }
    }
    return best;
  }

  /** 兩點之間是否沒有障礙物遮擋 */
  los(x1: number, y1: number, x2: number, y2: number): boolean {
    for (const o of this.obstacles) if (segHitsRect(x1, y1, x2, y2, o)) return false;
    return true;
  }

  /** 自動瞄準：優先看得到的敵人 */
  aimTarget(): Enemy | null {
    return this.nearest(this.p.x, this.p.y, undefined, Infinity, true) ?? this.nearest(this.p.x, this.p.y);
  }

  fire(t: Enemy) {
    const p = this.p;
    const a = Math.atan2(t.y - p.y, t.x - p.x);
    const ms = this.L('multishot');
    const n = 1 + ms;
    const dmg = this.atk * Math.pow(0.9, ms);
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 15;
      this.pBullet(p.x + Math.cos(a + Math.PI / 2) * off, p.y + Math.sin(a + Math.PI / 2) * off, a, dmg);
    }
    const dg = this.L('diagonal');
    if (dg >= 1) for (const s of [-1, 1]) this.pBullet(p.x, p.y, a + s * 0.42, dmg);
    if (dg >= 2) for (const s of [-1, 1]) this.pBullet(p.x, p.y, a + s * 0.85, dmg);
    if (this.L('backshot')) this.pBullet(p.x, p.y, a + Math.PI, dmg);
    if (this.L('sideshot')) for (const s of [-1, 1]) this.pBullet(p.x, p.y, a + s * Math.PI / 2, dmg);
    p.squash = 1;
    sfx.shoot();
    this.addPart(p.x + Math.cos(a) * 22, p.y + Math.sin(a) * 22, Math.cos(a) * 60, Math.sin(a) * 60, 0.12, 10, '#fff7c2', 1, 0);
  }

  pBullet(x: number, y: number, a: number, dmg: number) {
    const b = this.bullets.obtain();
    const sp = 760;
    b.x = x + Math.cos(a) * 16; b.y = y + Math.sin(a) * 16;
    b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
    b.r = 7; b.dmg = dmg; b.enemy = false;
    b.pierce = this.L('pierce') > 0; b.wall = this.L('wallbounce') ? 2 : 0; b.rico = this.L('ricochet');
    b.hits.length = 0; b.life = 1.6; b.spin = rand(0, TAU);
    b.color = this.L('evo_sun') ? '#ff8c2a' : this.L('fire') ? '#ffb347' : this.L('ice') ? '#9fe6ff' : this.L('lightning') ? '#d9c6ff' : '#ffe45c';
  }

  eBullet(x: number, y: number, a: number, speed: number, dmg: number, r = 8, color = '#ff4f7b') {
    const b = this.bullets.obtain();
    b.src = this.curSrc;
    b.x = x; b.y = y; b.vx = Math.cos(a) * speed; b.vy = Math.sin(a) * speed;
    b.r = r; b.dmg = dmg; b.enemy = true; b.pierce = false; b.wall = 0; b.rico = 0;
    b.hits.length = 0; b.life = 6; b.color = color; b.spin = 0;
  }

  ring(e: Enemy, n: number, speed: number, offset = 0, r = 8) {
    for (let i = 0; i < n; i++) this.eBullet(e.x, e.y, offset + (i / n) * TAU, speed, e.def.bullet * e.dmgMult, r);
    sfx.enemyShot();
  }

  spread(e: Enemy, n: number, gap: number, speed: number, r = 8) {
    const a = Math.atan2(this.p.y - e.y, this.p.x - e.x);
    for (let i = 0; i < n; i++) this.eBullet(e.x, e.y, a + (i - (n - 1) / 2) * gap, speed, e.def.bullet * e.dmgMult, r);
    sfx.enemyShot();
  }

  updateOrbit(dt: number) {
    const evo = this.L('evo_petal') > 0;
    const n = evo ? 6 : this.L('orbit');
    if (!n) return;
    this.orbitAng += dt * (evo ? 4.4 : 3.2);
    const R = evo ? 95 + Math.sin(this.time * 3) * 12 : 68;
    const size = evo ? 22 : 13;
    const dmg = this.atk * (evo ? 0.6 : 0.3);
    for (let i = 0; i < n; i++) {
      const a = this.orbitAng + (i / n) * TAU;
      const ox = this.p.x + Math.cos(a) * R, oy = this.p.y + Math.sin(a) * R;
      for (const e of this.enemies) {
        if (!e.alive || e.spawn > 0 || e.orbitCd > this.time) continue;
        if (dist2(ox, oy, e.x, e.y) < (size + e.r) ** 2) {
          e.orbitCd = this.time + 0.35;
          this.hitEnemy(e, dmg, Math.cos(a + Math.PI / 2), Math.sin(a + Math.PI / 2), false);
        }
      }
      // 抵銷敵方子彈
      if (evo) for (let k = this.bullets.active.length - 1; k >= 0; k--) {
        const b = this.bullets.active[k];
        if (b.enemy && dist2(ox, oy, b.x, b.y) < (size + b.r) ** 2) { this.puff(b.x, b.y, '#ffc0de', 4); this.bullets.release(k); }
      }
    }
  }

  // ---------------- 敵人 ----------------
  updateEnemies(dt: number) {
    const p = this.p;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.spawn > 0) { e.spawn -= dt; continue; }
      e.flash -= dt; e.squash = Math.max(0, e.squash - dt * 6);
      // 狀態異常
      if (e.slowT > 0) e.slowT -= dt;
      if (e.burnT > 0) {
        e.burnT -= dt; e.burnTick -= dt;
        if (e.burnTick <= 0) {
          e.burnTick = 0.5;
          this.damage(e, e.burnDps * 0.5, 3);
          if (!e.alive) continue;
        }
        if (Math.random() < dt * 10) this.addPart(e.x + rand(-e.r, e.r) * 0.6, e.y - rand(0, e.r), rand(-10, 10), rand(-60, -30), 0.4, 5, '#ff8a3d', 0, 0);
      }
      const slow = e.slowT > 0 ? 1 - e.slowAmt : 1;
      const k = dt * slow * e.ps;
      e.vx = 0; e.vy = 0;
      this.curSrc = e.def.id;
      this.ai(e, k, dt * slow);
      if (!e.alive) continue;
      // 擊退
      e.x += (e.vx * slow + e.kx) * dt;
      e.y += (e.vy * slow + e.ky) * dt;
      const damp = Math.min(1, dt * 12);
      e.kx -= e.kx * damp; e.ky -= e.ky * damp;
      if (!e.def.flying) for (const o of this.obstacles) pushOut(e, o);
      const bx = clamp(e.x, RX0 + e.r, RX1 - e.r), by = clamp(e.y, RY0 + e.r, RY1 - e.r);
      if (bx !== e.x || by !== e.y) { e.x = bx; e.y = by; if (e.state === 2 && (e.def.ai === 'dasher' || e.def.ai === 'raccoon' || e.def.ai === 'boar')) this.onWallHit(e); }
      // 碰撞玩家
      if (e.hop < 0.3 && dist2(e.x, e.y, p.x, p.y) < (e.r + p.r - 4) ** 2) {
        if (p.invuln <= 0) { const a = Math.atan2(p.y - e.y, p.x - e.x); p.x += Math.cos(a) * 34; p.y += Math.sin(a) * 34; }
        this.hurt(e.def.contact * e.dmgMult, 'touch:' + e.def.id);
      }
    }
    // 敵人互相推開
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
      const a = es[i], b = es[j];
      if (!a.alive || !b.alive || a.def.flying !== b.def.flying) continue;
      const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
      const d2v = dx * dx + dy * dy;
      if (d2v < rr * rr && d2v > 0.01) {
        const d = Math.sqrt(d2v), push = (rr - d) * 0.5;
        const wa = a.def.rank === 'normal' ? 1 : 0.1, wb = b.def.rank === 'normal' ? 1 : 0.1;
        a.x -= (dx / d) * push * wa; a.y -= (dy / d) * push * wa;
        b.x += (dx / d) * push * wb; b.y += (dy / d) * push * wb;
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive);
  }

  onWallHit(e: Enemy) {
    if (e.def.ai === 'boar') {
      this.ring(e, 20, 230, rand(0, 1), 9);
      this.shake = Math.max(this.shake, 12); sfx.explode(); vibrate(30);
      this.puff(e.x, e.y, '#c9a27a', 20);
      e.state = 0; e.t = 0.9 / e.ps;
    } else if (e.def.ai === 'raccoon') {
      e.ang = Math.atan2(this.p.y - e.y, this.p.x - e.x) + rand(-0.3, 0.3);
      this.shake = Math.max(this.shake, 6);
    } else {
      // 刺蝟 / 企鵝反彈
      if (e.x <= RX0 + e.r + 1 || e.x >= RX1 - e.r - 1) e.ang = Math.PI - e.ang;
      if (e.y <= RY0 + e.r + 1 || e.y >= RY1 - e.r - 1) e.ang = -e.ang;
    }
  }

  ai(e: Enemy, k: number, dtRaw: number) {
    const p = this.p;
    const toP = Math.atan2(p.y - e.y, p.x - e.x);
    const sp = e.def.speed;
    e.t -= k;
    switch (e.def.ai) {
      case 'chaser': {
        const w = Math.sin(this.time * 3 + e.id) * 0.5;
        e.vx = Math.cos(toP + w) * sp; e.vy = Math.sin(toP + w) * sp;
        break;
      }
      case 'shooter': {
        if (e.state === 0) {
          if (dist2(e.x, e.y, e.tx, e.ty) < 400 || e.t2 <= 0) { e.tx = rand(RX0 + 50, RX1 - 50); e.ty = rand(RY0 + 60, RY0 + 520); e.t2 = 2.5; }
          e.t2 -= dtRaw;
          const a = Math.atan2(e.ty - e.y, e.tx - e.x);
          e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp;
          if (e.t <= 0) { e.state = 1; e.t = 0.45; }
        } else {
          e.squash = 0.6;
          if (e.t <= 0) {
            if (e.def.id === 'owl') this.spread(e, 3, 0.28, 250); else this.spread(e, 1, 0, 270);
            e.state = 0; e.t = rand(1.8, 2.6);
          }
        }
        break;
      }
      case 'dasher': {
        const penguin = e.def.id === 'penguin';
        if (e.state === 0) {
          e.vx = Math.sin(this.time * 20 + e.id) * 10;
          if (e.t <= 0) { e.state = 1; e.t = 0.55; e.ang = toP; }
        } else if (e.state === 1) {
          e.ang = toP; e.squash = 0.8;
          if (e.t <= 0) { e.state = 2; e.t = penguin ? 0.8 : 0.5; }
        } else {
          const s = penguin ? 480 : 540;
          e.vx = Math.cos(e.ang) * s; e.vy = Math.sin(e.ang) * s;
          if (Math.random() < 0.4) this.addPart(e.x, e.y + e.r * 0.6, rand(-20, 20), rand(-20, 0), 0.3, 6, 'rgba(255,255,255,0.6)', 0, 0);
          if (e.t <= 0) { e.state = 0; e.t = rand(0.9, 1.5); }
        }
        break;
      }
      case 'crab': {
        e.t2 += dtRaw;
        e.vx = Math.sign(p.x - e.x || 1) * sp * 0.6 + Math.sin(e.t2 * 2.4 + e.id) * sp;
        e.vy = (clamp(p.y - 260, RY0 + 60, RY0 + 500) - e.y) * 0.8;
        if (e.t <= 0) { this.spread(e, 3, 0.3, 240); e.t = rand(2.2, 2.9); e.squash = 1; }
        break;
      }
      case 'tank': {
        e.vx = Math.cos(toP) * sp; e.vy = Math.sin(toP) * sp;
        if (e.t <= 0) { this.ring(e, 8, 170, rand(0, 1)); e.t = rand(3.6, 4.4); e.squash = 1; }
        break;
      }
      case 'frog': {
        if (e.state === 0) {
          if (e.t <= 0) { e.state = 1; e.t = 0.42; e.ang = toP + rand(-0.3, 0.3); }
        } else {
          e.hop = Math.sin((1 - e.t / 0.42) * Math.PI) * 26;
          e.vx = Math.cos(e.ang) * 330; e.vy = Math.sin(e.ang) * 330;
          if (e.t <= 0) {
            e.hop = 0; e.state = 0; e.t = rand(1.1, 1.6); e.squash = 1;
            for (let i = 0; i < 4; i++) this.eBullet(e.x, e.y, Math.PI / 4 + (i * Math.PI) / 2, 220, e.def.bullet * e.dmgMult);
            this.puff(e.x, e.y + e.r, '#ffffff', 6);
          }
        }
        break;
      }
      case 'kingshroom': {
        e.vx = Math.cos(toP) * sp; e.vy = Math.sin(toP) * sp;
        if (!e.phase2 && e.hp < e.maxHp * 0.5) {
          e.phase2 = true;
          for (let i = 0; i < 3; i++) this.spawnEnemy('mushroom', false, e.x + Math.cos(i * 2.1) * 70, e.y + Math.sin(i * 2.1) * 70);
          this.banner = { text: '國王發怒了！', sub: '', t: 1.2, color: '#ff7043' };
        }
        if (e.t <= 0) {
          this.ring(e, e.phase2 ? 14 : 10, e.phase2 ? 200 : 170, e.count++ * 0.3, 9);
          e.t = e.phase2 ? 2.2 : 3; e.squash = 1; this.shake = Math.max(this.shake, 3);
        }
        break;
      }
      case 'beequeen': {
        e.t2 += dtRaw;
        e.tx = VW / 2 + Math.sin(e.t2 * 0.9) * 170; e.ty = RY0 + 170 + Math.sin(e.t2 * 1.7) * 50;
        e.vx = (e.tx - e.x) * 2; e.vy = (e.ty - e.y) * 2;
        if (e.state === 0) { // 瞄準連發
          if (e.t <= 0) { this.spread(e, 5, 0.22, 270); e.count++; e.t = 0.45; if (e.count >= 3) { e.state = 1; e.count = 0; e.t = 0.8; } }
        } else if (e.state === 1) { // 螺旋
          if (e.t <= 0) {
            e.ang += 0.38;
            for (let i = 0; i < 3; i++) this.eBullet(e.x, e.y, e.ang + (i * TAU) / 3, 190, e.def.bullet * e.dmgMult);
            e.t = 0.11; e.count++;
            if (e.count >= 22) { e.state = 2; e.count = 0; e.t = 0.6; }
          }
        } else if (e.t <= 0) { // 召喚
          if (this.enemies.length < 7) { this.spawnEnemy('bee', false, e.x - 50, e.y + 30); this.spawnEnemy('bee', false, e.x + 50, e.y + 30); }
          e.state = 0; e.t = 1.2;
        }
        break;
      }
      case 'raccoon': this.aiRaccoon(e, toP); break;
      case 'boar': this.aiBoar(e, toP); break;
    }
  }

  aiRaccoon(e: Enemy, toP: number) {
    if (!e.phase2 && e.hp < e.maxHp * 0.5) {
      e.phase2 = true; e.ps *= 1.2;
      this.banner = { text: '浣熊大盜認真了！', sub: '', t: 1.4, color: '#ff5a5a' };
      this.spawnEnemy('mushroom', false, 120, 300); this.spawnEnemy('mushroom', false, 420, 300);
      sfx.boss(); this.shake = 10;
    }
    switch (e.state) {
      case 0: { // 走位
        const tx = VW / 2 + Math.sin(this.time * 0.8) * 120, ty = 300;
        e.vx = (tx - e.x) * 1.5; e.vy = (ty - e.y) * 1.5;
        if (e.t <= 0) {
          const opts = e.phase2 ? [1, 3, 4, 5] : [1, 3, 4];
          e.state = opts[(e.count++) % opts.length]; e.t = 0.7; e.t2 = 0;
        }
        break;
      }
      case 1: // 衝刺預警
        e.ang = toP; e.squash = 0.8;
        if (e.t <= 0) { e.state = 2; e.t = 0.55; }
        break;
      case 2: // 衝刺
        e.vx = Math.cos(e.ang) * 620; e.vy = Math.sin(e.ang) * 620;
        if (Math.random() < 0.5) this.addPart(e.x, e.y + e.r * 0.6, rand(-30, 30), rand(-30, 0), 0.35, 8, 'rgba(255,255,255,0.6)', 0, 0);
        if (e.t <= 0) {
          e.t2++;
          if (e.t2 < 3) { e.state = 1; e.t = 0.45; } else { e.state = 0; e.t = 1.0; }
        }
        break;
      case 3: // 環形彈
        if (e.t <= 0) {
          this.ring(e, 18, 200, e.t2 * 0.17, 9); e.t2++; e.t = 0.38; e.squash = 1;
          if (e.t2 >= 3) { e.state = 0; e.t = 1.1; }
        }
        break;
      case 4: // 丟橡果（扇形）
        if (e.t <= 0) {
          this.spread(e, 5, 0.2, 300, 10); e.t2++; e.t = 0.35;
          if (e.t2 >= 3) { e.state = 0; e.t = 1.0; }
        }
        break;
      case 5: // 螺旋（二階段）
        if (e.t <= 0) {
          e.ang += 0.31;
          for (let i = 0; i < 2; i++) this.eBullet(e.x, e.y, e.ang + i * Math.PI, 210, e.def.bullet * e.dmgMult);
          e.t = 0.07; e.t2++;
          if (e.t2 >= 36) { e.state = 0; e.t = 1.2; }
        }
        break;
    }
  }

  aiBoar(e: Enemy, toP: number) {
    if (!e.phase2 && e.hp < e.maxHp * 0.5) {
      e.phase2 = true; e.ps *= 1.2;
      this.banner = { text: '野豬將軍暴走！', sub: '', t: 1.4, color: '#ff5a5a' };
      sfx.boss(); this.shake = 10;
    }
    switch (e.state) {
      case 0:
        e.vx = Math.cos(toP) * 40; e.vy = Math.sin(toP) * 40;
        if (e.t <= 0) { const opts = [1, 3, 1, 4]; e.state = opts[(e.count++) % opts.length]; e.t = 0.75; e.t2 = 0; }
        break;
      case 1: e.ang = toP; e.squash = 0.9; if (e.t <= 0) { e.state = 2; e.t = 3; } break;
      case 2:
        e.vx = Math.cos(e.ang) * 700; e.vy = Math.sin(e.ang) * 700;
        if (Math.random() < 0.6) this.addPart(e.x, e.y + e.r * 0.6, rand(-30, 30), rand(-30, 0), 0.4, 9, 'rgba(210,180,140,0.8)', 0, 0);
        if (e.t <= 0) { e.state = 0; e.t = 0.8; }
        break;
      case 3: // 踩地震波
        if (e.t <= 0) {
          this.ring(e, 14, 160, e.t2 * 0.22, 10); e.t2++; e.t = 0.5; e.squash = 1; this.shake = Math.max(this.shake, 5);
          if (e.t2 >= (e.phase2 ? 4 : 3)) { e.state = 0; e.t = 1; }
        }
        break;
      case 4: // 召喚刺蝟
        if (e.t <= 0) {
          if (this.enemies.length < 6) { this.spawnEnemy('hedgehog', false, 100, 260); this.spawnEnemy('hedgehog', false, 440, 260); }
          e.state = 0; e.t = 1;
        }
        break;
    }
  }

  // ---------------- 子彈 ----------------
  updateBullets(dt: number) {
    const arr = this.bullets.active;
    const p = this.p;
    for (let i = arr.length - 1; i >= 0; i--) {
      const b = arr[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; b.spin += dt * 12;
      let dead = b.life <= 0;
      // 牆壁
      if (!dead && (b.x < RX0 || b.x > RX1 || b.y < RY0 || b.y > RY1)) {
        if (b.wall > 0) {
          b.wall--;
          if (b.x < RX0 || b.x > RX1) b.vx = -b.vx;
          if (b.y < RY0 || b.y > RY1) b.vy = -b.vy;
          b.x = clamp(b.x, RX0, RX1); b.y = clamp(b.y, RY0, RY1);
          b.hits.length = 0;
        } else dead = true;
      }
      // 障礙物
      if (!dead) for (const o of this.obstacles) {
        if (b.x > o.x && b.x < o.x + o.w && b.y > o.y && b.y < o.y + o.h) {
          if (b.wall > 0) {
            b.wall--;
            const dl = b.x - o.x, dr = o.x + o.w - b.x, dtp = b.y - o.y, db = o.y + o.h - b.y;
            const m = Math.min(dl, dr, dtp, db);
            if (m === dl || m === dr) b.vx = -b.vx; else b.vy = -b.vy;
            b.x += b.vx * dt * 2; b.y += b.vy * dt * 2;
          } else dead = true;
          break;
        }
      }
      if (dead) { this.puff(b.x, b.y, b.enemy ? '#ff9db5' : '#fff2a8', 3); this.bullets.release(i); continue; }

      if (b.enemy) {
        if (dist2(b.x, b.y, p.x, p.y) < (b.r + p.r * 0.72) ** 2) {
          this.hurt(b.dmg, 'shot:' + b.src);
          this.puff(b.x, b.y, '#ff6b8b', 6);
          this.bullets.release(i);
        }
        continue;
      }
      // 玩家子彈打敵人
      for (const e of this.enemies) {
        if (!e.alive || e.spawn > 0 || b.hits.includes(e)) continue;
        if (e.hop > 14) continue;
        if (dist2(b.x, b.y, e.x, e.y) < (b.r + e.r) ** 2) {
          b.hits.push(e);
          const len = Math.hypot(b.vx, b.vy) || 1;
          this.hitEnemy(e, b.dmg, b.vx / len, b.vy / len, true);
          if (b.rico > 0) {
            const nx = this.nearest(b.x, b.y, b.hits, 320);
            if (nx) {
              b.rico--; b.dmg *= 0.8;
              const a = Math.atan2(nx.y - b.y, nx.x - b.x);
              b.vx = Math.cos(a) * len; b.vy = Math.sin(a) * len; b.life = 1;
              continue;
            }
          }
          if (b.pierce) { b.dmg *= 0.67; continue; }
          dead = true;
          break;
        }
      }
      if (dead) this.bullets.release(i);
    }
  }

  hitEnemy(e: Enemy, base: number, dx: number, dy: number, fromBullet: boolean) {
    const isCrit = Math.random() < this.crit;
    const dmg = base * (isCrit ? this.critDmg : 1) * rand(0.92, 1.08);
    const kb = e.def.rank === 'normal' ? 170 : e.def.rank === 'elite' ? 25 : 8;
    e.kx += dx * kb; e.ky += dy * kb;
    e.squash = 1;
    this.damage(e, dmg, isCrit ? 1 : 0);
    if (isCrit) { sfx.crit(); this.shake = Math.max(this.shake, 2.5); } else sfx.hit();
    for (let i = 0; i < (isCrit ? 6 : 3); i++) this.addPart(e.x - dx * e.r * 0.5, e.y - dy * e.r * 0.5, -dx * rand(60, 180) + rand(-60, 60), -dy * rand(60, 180) + rand(-60, 60), 0.3, isCrit ? 5 : 3.5, isCrit ? '#fff27a' : '#ffffff', 0, 0);
    if (!fromBullet) return;
    // ---- 屬性觸發 ----
    const fire = this.L('fire'), evoSun = this.L('evo_sun');
    if (fire || evoSun) { e.burnT = 2.6; e.burnDps = Math.max(e.burnDps, this.atk * (evoSun ? 0.45 : 0.15 * fire)); }
    if (this.L('ice')) { e.slowT = 1.6; e.slowAmt = this.L('ice') >= 2 ? 0.55 : 0.4; }
    if (evoSun) {
      sfx.explode();
      this.addPart(e.x, e.y, 0, 0, 0.35, 78, 'rgba(255,150,40,0.9)', 2, 0);
      for (let i = 0; i < 10; i++) this.addPart(e.x, e.y, rand(-260, 260), rand(-260, 260), 0.45, 6, '#ffb347', 0, 0);
      for (const o of this.enemies) if (o !== e && o.alive && dist2(o.x, o.y, e.x, e.y) < 80 * 80) this.damage(o, this.atk * 0.5, 2);
      this.shake = Math.max(this.shake, 2);
    }
    const lt = this.L('lightning'), evoT = this.L('evo_thunder');
    if (lt || evoT) {
      const n = evoT ? 5 : lt;
      const dmgL = this.atk * (evoT ? 0.6 : 0.2 + 0.07 * lt);
      const chain: Enemy[] = [e];
      let cur = e;
      for (let i = 0; i < n; i++) {
        const nx = this.nearest(cur.x, cur.y, chain, evoT ? 230 : 180);
        if (!nx) break;
        chain.push(nx);
        this.arcs.push({ pts: zig(cur.x, cur.y, nx.x, nx.y), t: 0.18 });
        this.damage(nx, dmgL, 2);
        cur = nx;
      }
      if (chain.length > 1) sfx.zap();
    }
  }

  damage(e: Enemy, dmg: number, kind: 0 | 1 | 2 | 3) {
    if (!e.alive) return;
    e.hp -= dmg;
    e.flash = 0.09;
    const t = this.texts.obtain();
    t.x = e.x + rand(-10, 10); t.y = e.y - e.r - 4; t.vy = kind === 1 ? -110 : -80; t.t = kind === 1 ? 0.9 : 0.7;
    t.text = fmtNum(dmg) + (kind === 1 ? '!' : ''); t.kind = kind;
    if (e === this.boss) this.lastBossHpPct = Math.max(0, e.hp / e.maxHp);
    if (e.hp <= 0) this.kill(e);
  }

  kill(e: Enemy) {
    e.alive = false;
    this.kills++;
    const rank = e.def.rank;
    this.gainXp(e.def.xp * (1 + 0.1 * this.roomIdx));
    const gold = e.def.gold * (1 + 0.15 * (this.ch.id - 1));
    const nCoins = rank === 'boss' ? 26 : rank === 'elite' ? 14 : randInt(2, 4);
    for (let i = 0; i < nCoins; i++) {
      const c = this.coins.obtain();
      const a = rand(0, TAU), s = rand(80, 260);
      c.x = e.x; c.y = e.y; c.vx = Math.cos(a) * s; c.vy = Math.sin(a) * s; c.v = gold / nCoins; c.magnet = false; c.t = 0;
    }
    // 爆開
    sfx.kill();
    this.addPart(e.x, e.y, 0, 0, 0.3, e.r * 1.6, 'rgba(255,255,255,0.9)', 2, 0);
    for (let i = 0; i < 14; i++) this.addPart(e.x, e.y, rand(-280, 280), rand(-320, 160), rand(0.4, 0.7), rand(4, 8), i % 3 ? e.def.color : '#ffffff', i % 4 === 0 ? 1 : 0, 600);
    const ls = this.L('lifesteal');
    if (ls) this.heal(this.maxHp * 0.02 * ls);
    if (rank === 'elite') { this.eliteKills++; this.freeze = 0.12; this.shake = 12; vibrate(50); }
    if (rank === 'boss') {
      this.bossKills++; this.freeze = 0.35; this.shake = 22; vibrate([80, 40, 120]);
      this.lastBossHpPct = 0;
      for (let i = 0; i < 4; i++) setTimeout(() => sfx.explode(), i * 120);
      for (const o of this.enemies) if (o.alive && o !== e) this.kill(o);
      // 迭代中不能直接清空物件池，標記過期，下一幀自然移除
      for (const b of this.bullets.active) if (b.enemy) b.life = 0;
    } else if (rank === 'normal') this.freeze = Math.max(this.freeze, 0.025);
  }

  heal(n: number) {
    const before = this.p.hp;
    this.p.hp = Math.min(this.maxHp, this.p.hp + n);
    const d = this.p.hp - before;
    if (d >= 1) {
      const t = this.texts.obtain();
      t.x = this.p.x; t.y = this.p.y - 34; t.vy = -60; t.t = 0.8; t.text = '+' + fmtNum(d); t.kind = 3;
    }
  }

  hurt(dmg: number, src = '?') {
    const p = this.p;
    if (p.invuln > 0 || this.state !== 'play') return;
    const d = dmg * (1 - this.dmgReduce);
    this.hurtBy[src] = (this.hurtBy[src] ?? 0) + Math.round(d);
    p.hp -= d;
    p.invuln = 0.75; p.flash = 0.2; this.hurtFlash = 0.35;
    this.shake = Math.max(this.shake, 9); this.freeze = 0.06;
    sfx.hurt(); vibrate(45);
    const t = this.texts.obtain();
    t.x = p.x; t.y = p.y - 30; t.vy = -70; t.t = 0.8; t.text = '-' + fmtNum(d); t.kind = 2;
    if (p.hp <= 0) {
      p.hp = 0;
      this.state = 'dead';
      this.input.reset();
      track('death', { chapter: this.ch.id, room: this.roomIdx + 1, bossHp: this.lastBossHpPct, level: this.level, by: src, hurtBy: this.hurtBy });
      setTimeout(() => this.hooks.died(!this.reviveUsed), 650);
    }
  }

  revive() {
    this.reviveUsed = true;
    this.p.hp = this.maxHp;
    this.p.invuln = 2.5;
    for (let i = this.bullets.active.length - 1; i >= 0; i--) if (this.bullets.active[i].enemy) this.bullets.release(i);
    for (const e of this.enemies) {
      const a = Math.atan2(e.y - this.p.y, e.x - this.p.x);
      e.kx += Math.cos(a) * 600; e.ky += Math.sin(a) * 600;
    }
    this.addPart(this.p.x, this.p.y, 0, 0, 0.5, 160, 'rgba(255,240,150,0.9)', 2, 0);
    this.state = 'play';
    sfx.levelup();
    track('revive', { room: this.roomIdx + 1 });
  }

  giveUp() { this.finish(false); }

  // ---------------- 經驗 / 升級 ----------------
  gainXp(n: number) {
    this.xp += n;
    while (this.xp >= xpNeed(this.level)) {
      this.xp -= xpNeed(this.level);
      this.level++;
      this.pendingLevels++;
    }
  }

  rollChoices(): SkillDef[] {
    const L = (id: SkillId) => this.L(id);
    const evos = SKILLS.filter((s) => s.evo && !L(s.id) && Object.entries(s.requires ?? {}).every(([k, v]) => L(k as SkillId) >= (v as number)));
    const pool = SKILLS.filter((s) => !s.evo && L(s.id) < s.maxLv && !(s.id === 'orbit' && L('evo_petal')));
    const out: SkillDef[] = [];
    if (evos.length) out.push(evos[randInt(0, evos.length - 1)]);
    while (out.length < 3 && pool.length) {
      const total = pool.reduce((a, s) => a + s.weight, 0);
      let r = Math.random() * total;
      let idx = 0;
      for (; idx < pool.length; idx++) { r -= pool[idx].weight; if (r <= 0) break; }
      out.push(pool.splice(Math.min(idx, pool.length - 1), 1)[0]);
    }
    return out;
  }

  openPick() {
    this.state = 'pick';
    this.input.reset();
    sfx.levelup();
    this.addPart(this.p.x, this.p.y, 0, 0, 0.5, 120, 'rgba(120,220,255,0.8)', 2, 0);
    this.hooks.levelUp(this.bot ? this.rollChoices() : this.rollChoices(), !this.rerollUsed);
  }

  reroll(): SkillDef[] {
    this.rerollUsed = true;
    track('skill_reroll', {});
    return this.rollChoices();
  }

  pickSkill(id: SkillId) {
    const def = SKILL_MAP[id];
    this.skills[id] = this.L(id) + 1;
    if (id === 'heal') this.heal(this.maxHp * 0.4);
    if (def.evo) {
      this.evolutions++;
      this.evoFlash = 1;
      this.banner = { text: def.name.replace('超武・', ''), sub: '超武覺醒！', t: 1.8, color: '#ffd23f' };
      sfx.evo(); vibrate([40, 30, 80]); this.shake = 8;
      for (let i = 0; i < 40; i++) this.addPart(this.p.x, this.p.y, rand(-400, 400), rand(-400, 400), 0.8, rand(4, 9), i % 2 ? '#ffd23f' : '#ffffff', 1, 0);
    } else sfx.pick();
    this.recalc();
    this.pendingLevels--;
    track('skill_pick', { id, lv: this.skills[id], level: this.level, room: this.roomIdx + 1 });
    this.state = 'play';
    this.p.invuln = Math.max(this.p.invuln, 0.5);
  }

  // ---------------- 金幣 / 房間 ----------------
  updateCoins(dt: number) {
    const p = this.p;
    const arr = this.coins.active;
    for (let i = arr.length - 1; i >= 0; i--) {
      const c = arr[i];
      c.t += dt;
      const d2v = dist2(c.x, c.y, p.x, p.y);
      if ((this.doorOpen && c.t > 0.35) || d2v < 70 * 70) c.magnet = true;
      if (c.magnet) {
        const d = Math.sqrt(d2v) || 1;
        const s = 500 + c.t * 900;
        c.vx += ((p.x - c.x) / d * s - c.vx) * Math.min(1, dt * 8);
        c.vy += ((p.y - c.y) / d * s - c.vy) * Math.min(1, dt * 8);
      } else {
        const damp = Math.min(1, dt * 5);
        c.vx -= c.vx * damp; c.vy -= c.vy * damp;
      }
      c.x += c.vx * dt; c.y += c.vy * dt;
      c.x = clamp(c.x, RX0 + 6, RX1 - 6); c.y = clamp(c.y, RY0 - 40, RY1 - 6);
      if (d2v < 24 * 24) {
        this.goldRun += c.v;
        sfx.coin();
        this.addPart(c.x, c.y, rand(-40, 40), rand(-80, -30), 0.3, 4, '#ffe066', 1, 0);
        this.coins.release(i);
      }
    }
  }

  checkRoom(dt: number) {
    if (this.doorOpen) {
      this.clearT += dt;
      if (this.rooms[this.roomIdx].kind === 'boss' && this.clearT > 2.2 && this.state === 'play') this.finish(true);
      return;
    }
    if (this.enemies.some((e) => e.alive)) return;
    this.doorOpen = true;
    this.clearT = 0;
    sfx.door();
    for (const c of this.coins.active) c.t = 0;
    track('room_clear', { chapter: this.ch.id, room: this.roomIdx + 1, hp: Math.round((this.p.hp / this.maxHp) * 100) });
    if (this.rooms[this.roomIdx].kind === 'boss') this.banner = { text: '章節通關！', sub: '', t: 2.2, color: '#5ce07a' };
  }

  finish(win: boolean) {
    if (this.state === 'end') return;
    this.state = 'end';
    const cleared = win ? ROOMS_PER_CHAPTER : this.roomIdx + (this.doorOpen ? 1 : 0);
    const r: RunResult = {
      win, chapter: this.ch.id, roomsCleared: cleared, gold: Math.round(this.goldRun), kills: this.kills,
      eliteKills: this.eliteKills, bossKills: this.bossKills, level: this.level, evolutions: this.evolutions,
      reachedBoss: this.reachedBoss, bossHpPct: this.reachedBoss ? this.lastBossHpPct ?? 1 : null, skills: { ...this.skills },
    };
    track('run_end', { ...r, skills: undefined });
    if (win) sfx.win();
    setTimeout(() => this.hooks.finished(r), win ? 200 : 0);
  }

  // ---------------- 自動測試機器人（?bot=1）----------------
  botMove(): { x: number; y: number } {
    const p = this.p;
    const blockedBy = (tx: number, ty: number) => this.obstacles.find((o) => segHitsRect(p.x, p.y, tx, ty, { x: o.x - p.r, y: o.y - p.r, w: o.w + p.r * 2, h: o.h + p.r * 2 }));
    const sidestep = (o: Rect, tx: number) => {
      const left = o.x - p.r - 10, right = o.x + o.w + p.r + 10;
      const goLeft = Math.abs(p.x - left) + Math.abs(tx - left) < Math.abs(p.x - right) + Math.abs(tx - right) ? left > RX0 + p.r : right > RX1 - p.r;
      return { x: goLeft ? -1 : 1, y: 0.15 };
    };
    if (this.doorOpen) {
      const tx = VW / 2, ty = RY0 - 80;
      const o = blockedBy(tx, ty);
      if (o) return sidestep(o, tx);
      const a = Math.atan2(ty - p.y, tx - p.x);
      return { x: Math.cos(a), y: Math.sin(a) };
    }
    let dx = 0, dy = 0;
    for (const b of this.bullets.active) {
      if (!b.enemy) continue;
      const d2v = dist2(b.x, b.y, p.x, p.y);
      if (d2v < 130 * 130) {
        // 子彈是否朝自己飛來
        if ((p.x - b.x) * b.vx + (p.y - b.y) * b.vy <= 0) continue;
        const d = Math.sqrt(d2v) || 1;
        const s = Math.sign((p.x - b.x) * b.vy - (p.y - b.y) * b.vx) || 1;
        const sp = Math.hypot(b.vx, b.vy) || 1;
        dx += (-b.vy / sp) * s * (130 - d); dy += (b.vx / sp) * s * (130 - d);
      }
    }
    for (const e of this.enemies) {
      const d2v = dist2(e.x, e.y, p.x, p.y);
      const danger = e.def.ai === 'dasher' && e.state >= 1 ? 260 : e.r + 120;
      if (d2v < danger * danger) { const d = Math.sqrt(d2v) || 1; dx += ((p.x - e.x) / d) * (danger - d) * 1.5; dy += ((p.y - e.y) / d) * (danger - d) * 1.5; }
    }
    // 繞圈：加入切線方向，避免被逼到角落
    if (dx || dy) {
      const cx = VW / 2 - p.x, cy = 640 - p.y;
      const tx = -dy, ty = dx;
      const sgn = tx * cx + ty * cy >= 0 ? 1 : -1;
      dx += tx * 0.6 * sgn; dy += ty * 0.6 * sgn;
    }
    // 不要貼牆
    if (p.x < RX0 + 70) dx += (RX0 + 70 - p.x) * 2; if (p.x > RX1 - 70) dx -= (p.x - RX1 + 70) * 2;
    if (p.y > RY1 - 60) dy -= (p.y - RY1 + 60) * 2; if (p.y < RY0 + 200) dy += (RY0 + 200 - p.y);
    const m = Math.hypot(dx, dy);
    if (m > 25) return { x: dx / m, y: dy / m };
    // 沒危險：若看不到任何敵人就橫移找角度
    const t = this.nearest(p.x, p.y);
    if (t && !this.nearest(p.x, p.y, undefined, Infinity, true)) {
      const o = blockedBy(t.x, t.y);
      if (o) return sidestep(o, t.x);
    }
    return { x: 0, y: 0 };
  }

  // ================= 特效 =================
  addPart(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, kind: 0 | 1 | 2, grav: number) {
    if (this.parts.active.length > 900) return;
    const p = this.parts.obtain();
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.t = life; p.life = life; p.size = size; p.color = color; p.kind = kind; p.grav = grav;
  }

  puff(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) this.addPart(x, y, rand(-120, 120), rand(-120, 120), rand(0.2, 0.4), rand(3, 6), color, 0, 0);
  }

  updateFx(dt: number) {
    const pa = this.parts.active;
    for (let i = pa.length - 1; i >= 0; i--) {
      const p = pa[i];
      p.t -= dt;
      if (p.t <= 0) { this.parts.release(i); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const damp = Math.min(1, dt * 3);
      p.vx -= p.vx * damp; p.vy -= p.vy * damp * (p.grav ? 0.2 : 1);
    }
    const ta = this.texts.active;
    for (let i = ta.length - 1; i >= 0; i--) {
      const t = ta[i];
      t.t -= dt; t.y += t.vy * dt; t.vy *= 0.92;
      if (t.t <= 0) this.texts.release(i);
    }
    for (const a of this.arcs) a.t -= dt;
    this.arcs = this.arcs.filter((a) => a.t > 0);
    this.shake = Math.max(0, this.shake - dt * 40);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.evoFlash = Math.max(0, this.evoFlash - dt * 1.5);
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
  }

  buildFloor() {
    const tile = getImage(`tile_ch${this.ch.id}`);
    const c = document.createElement('canvas');
    const s = 60;
    c.width = c.height = tile ? 240 : s * 2;
    const g = c.getContext('2d')!;
    if (tile) g.drawImage(tile, 0, 0, 240, 240);
    else {
      g.fillStyle = this.ch.bg[0]; g.fillRect(0, 0, s * 2, s * 2);
      g.fillStyle = this.ch.bg[1]; g.fillRect(s, 0, s, s); g.fillRect(0, s, s, s);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(rand(0, s * 2), rand(0, s * 2), rand(1.5, 3), 0, TAU); g.fill(); }
    }
    this.floor = this.ctx.createPattern(c, 'repeat');
  }

  // ================= 繪製 =================
  render() {
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = this.ch.wall;
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const sx = this.shake ? rand(-this.shake, this.shake) : 0;
    const sy = this.shake ? rand(-this.shake, this.shake) : 0;
    g.setTransform(this.scale, 0, 0, this.scale, this.offX + sx * this.scale, this.offY + sy * this.scale);

    this.drawRoom(g);
    this.drawCoins(g);
    this.drawEntities(g);
    this.drawBullets(g);
    this.drawFx(g);
    g.setTransform(this.scale, 0, 0, this.scale, this.offX, this.offY);
    this.drawHud(g);
    this.drawOverlay(g);
    this.drawJoystick(g);
  }

  drawRoom(g: CanvasRenderingContext2D) {
    // 地板
    g.fillStyle = this.floor ?? this.ch.bg[0];
    g.fillRect(RX0, RY0, RX1 - RX0, RY1 - RY0);
    // 內陰影
    const grd = g.createLinearGradient(0, RY0, 0, RY0 + 40);
    grd.addColorStop(0, 'rgba(0,0,0,0.22)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(RX0, RY0, RX1 - RX0, 40);
    // 牆
    g.fillStyle = this.ch.wall;
    g.fillRect(0, RY0 - 30, RX0, RY1 - RY0 + 60);
    g.fillRect(RX1, RY0 - 30, VW - RX1, RY1 - RY0 + 60);
    g.fillRect(0, RY1, VW, VH - RY1);
    g.fillRect(0, RY0 - 30, DOOR_X0, 30);
    g.fillRect(DOOR_X1, RY0 - 30, VW - DOOR_X1, 30);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(0, RY0 - 30, DOOR_X0, 6); g.fillRect(DOOR_X1, RY0 - 30, VW - DOOR_X1, 6);
    // 門
    if (this.doorOpen) {
      const pulse = 0.5 + Math.sin(this.time * 6) * 0.5;
      g.fillStyle = `rgba(255,250,200,${0.35 + pulse * 0.35})`;
      g.fillRect(DOOR_X0, RY0 - 30, DOOR_X1 - DOOR_X0, 34);
      g.fillStyle = '#fff';
      g.font = '900 28px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('▲', VW / 2, RY0 + 30 - pulse * 10);
    } else {
      g.fillStyle = '#5b4636';
      g.fillRect(DOOR_X0, RY0 - 30, DOOR_X1 - DOOR_X0, 30);
      g.fillStyle = '#8b6b50';
      for (let x = DOOR_X0 + 8; x < DOOR_X1; x += 16) g.fillRect(x, RY0 - 28, 6, 26);
    }
    // 障礙物
    const img = getImage(`obstacle_ch${this.ch.id}`);
    for (const o of this.obstacles) {
      g.fillStyle = 'rgba(0,0,0,0.18)';
      roundRect(g, o.x + 4, o.y + 8, o.w, o.h, 12); g.fill();
      if (img) { g.drawImage(img, o.x - 6, o.y - 10, o.w + 12, o.h + 16); continue; }
      g.fillStyle = this.ch.obstacle; roundRect(g, o.x, o.y, o.w, o.h, 12); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.22)'; roundRect(g, o.x + 4, o.y + 4, o.w - 8, Math.min(18, o.h / 3), 8); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3; roundRect(g, o.x, o.y, o.w, o.h, 12); g.stroke();
    }
  }

  drawCoins(g: CanvasRenderingContext2D) {
    const spr = sprite('fx_coin', 14, '', '#ffd23f', '#b8860b');
    for (const c of this.coins.active) {
      const w = Math.abs(Math.cos(this.time * 8 + c.x)) * 14 + 2;
      g.drawImage(spr, c.x - w / 2, c.y - 7, w, 14);
    }
  }

  drawEntities(g: CanvasRenderingContext2D) {
    const list: (Enemy | null)[] = [...this.enemies, null];
    list.sort((a, b) => (a ? a.y : this.p.y) - (b ? b.y : this.p.y));
    for (const e of list) {
      if (e) this.drawEnemy(g, e); else this.drawPlayer(g);
    }
    // 守護葉片
    const evo = this.L('evo_petal') > 0;
    const n = evo ? 6 : this.L('orbit');
    if (n) {
      const R = evo ? 95 + Math.sin(this.time * 3) * 12 : 68;
      const size = evo ? 22 : 13;
      for (let i = 0; i < n; i++) {
        const a = this.orbitAng + (i / n) * TAU;
        const x = this.p.x + Math.cos(a) * R, y = this.p.y + Math.sin(a) * R;
        g.save(); g.translate(x, y); g.rotate(a * 2);
        g.fillStyle = evo ? '#ff9ecb' : '#6fd46a';
        g.beginPath(); g.ellipse(0, 0, size, size * 0.5, 0, 0, TAU); g.fill();
        g.strokeStyle = evo ? '#c2407e' : '#2f7a2c'; g.lineWidth = 2.5; g.stroke();
        g.restore();
      }
    }
  }

  drawShadow(g: CanvasRenderingContext2D, x: number, y: number, r: number, lift = 0) {
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.beginPath(); g.ellipse(x, y + r * 0.85, r * (0.9 - lift * 0.01), r * 0.32, 0, 0, TAU); g.fill();
  }

  drawEnemy(g: CanvasRenderingContext2D, e: Enemy) {
    const def = e.def;
    const lift = def.flying ? 18 + Math.sin(this.time * 6 + e.id) * 4 : e.hop;
    this.drawShadow(g, e.x, e.y, e.r, lift);
    // 預警線
    if ((def.ai === 'dasher' || def.ai === 'raccoon' || def.ai === 'boar') && e.state === 1) {
      g.save();
      g.beginPath(); g.rect(RX0, RY0, RX1 - RX0, RY1 - RY0); g.clip();
      g.strokeStyle = `rgba(255,60,60,${0.35 + Math.sin(this.time * 30) * 0.2})`;
      g.lineWidth = e.r * 1.4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(e.x + Math.cos(e.ang) * 700, e.y + Math.sin(e.ang) * 700); g.stroke();
      g.restore();
    }
    const sp = e.spawn > 0 ? 1 - e.spawn / 0.5 : 1;
    const sq = e.squash * 0.18;
    const size = e.r * 2.3;
    const y = e.y - lift;
    g.save();
    g.globalAlpha = Math.max(0.1, sp);
    g.translate(e.x, y);
    g.scale((1 + sq) * sp * (this.p.x < e.x ? -1 : 1), (1 - sq) * sp);
    const key = `enemy_${def.id}`;
    g.drawImage(sprite(key, size, def.icon, def.color), -size / 2, -size / 2, size, size);
    if (e.flash > 0) { g.globalAlpha = 0.85; g.drawImage(whiteSprite(key, size, def.icon, def.color), -size / 2, -size / 2, size, size); }
    g.restore();
    if (e.slowT > 0) { g.strokeStyle = 'rgba(140,220,255,0.8)'; g.lineWidth = 3; g.beginPath(); g.arc(e.x, y, e.r + 4, 0, TAU); g.stroke(); }
    // 血條
    if (def.rank !== 'boss' && e.hp < e.maxHp && e.spawn <= 0) {
      const w = def.rank === 'elite' ? 90 : 40, h = def.rank === 'elite' ? 8 : 5;
      const bx = e.x - w / 2, by = y - e.r - 14;
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(bx - 1, by - 1, w + 2, h + 2);
      g.fillStyle = '#ff4d4d'; g.fillRect(bx, by, w * Math.max(0, e.hp / e.maxHp), h);
    }
  }

  drawPlayer(g: CanvasRenderingContext2D) {
    const p = this.p;
    if (this.state === 'dead') { g.globalAlpha = 0.5; }
    this.drawShadow(g, p.x, p.y, p.r);
    const blink = p.invuln > 0 && Math.floor(this.time * 20) % 2 === 0;
    const size = 48;
    const bob = p.moving ? Math.abs(Math.sin(this.time * 14)) * 4 : 0;
    const sq = p.squash * 0.12;
    g.save();
    g.translate(p.x, p.y - bob);
    g.scale(p.flip * (1 + sq), 1 - sq);
    if (!blink) g.drawImage(sprite('hero', size, '🐶', '#ffcf8a'), -size / 2, -size / 2, size, size);
    if (p.flash > 0) { g.globalAlpha = 0.7; g.drawImage(whiteSprite('hero', size, '🐶', '#ffcf8a'), -size / 2, -size / 2, size, size); }
    g.restore();
    g.globalAlpha = 1;
    // 瞄準方向小箭頭
    if (!p.moving && this.enemies.length) {
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.save(); g.translate(p.x + Math.cos(p.face) * 32, p.y + Math.sin(p.face) * 32); g.rotate(p.face);
      g.beginPath(); g.moveTo(7, 0); g.lineTo(-4, -5); g.lineTo(-4, 5); g.closePath(); g.fill(); g.restore();
    }
    // 頭上血條
    const w = 56, bx = p.x - w / 2, by = p.y - 44;
    g.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(g, bx - 2, by - 2, w + 4, 11, 4); g.fill();
    g.fillStyle = p.hp / this.maxHp < 0.3 ? '#ff5a5a' : '#59d65f';
    roundRect(g, bx, by, w * (p.hp / this.maxHp), 7, 3); g.fill();
    g.fillStyle = '#fff'; g.font = '800 12px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 3;
    g.strokeText(String(Math.ceil(p.hp)), p.x, by - 2); g.fillText(String(Math.ceil(p.hp)), p.x, by - 2);
  }

  drawBullets(g: CanvasRenderingContext2D) {
    const star = getImage('fx_bullet');
    g.save();
    for (const b of this.bullets.active) {
      if (b.enemy) {
        g.fillStyle = 'rgba(60,0,20,0.6)';
        g.beginPath(); g.arc(b.x, b.y, b.r + 2.5, 0, TAU); g.fill();
        g.fillStyle = b.color;
        g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.fill();
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(b.x - b.r * 0.25, b.y - b.r * 0.25, b.r * 0.42, 0, TAU); g.fill();
      }
    }
    g.globalCompositeOperation = 'lighter';
    for (const b of this.bullets.active) {
      if (b.enemy) continue;
      const a = Math.atan2(b.vy, b.vx);
      g.strokeStyle = b.color; g.globalAlpha = 0.45; g.lineWidth = b.r * 1.3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - Math.cos(a) * 26, b.y - Math.sin(a) * 26); g.stroke();
      g.globalAlpha = 1;
      if (star) { g.save(); g.translate(b.x, b.y); g.rotate(b.spin); g.drawImage(star, -b.r * 1.6, -b.r * 1.6, b.r * 3.2, b.r * 3.2); g.restore(); }
      else {
        g.fillStyle = b.color; g.beginPath(); starPath(g, b.x, b.y, b.r * 1.5, b.r * 0.7, b.spin); g.fill();
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(b.x, b.y, b.r * 0.45, 0, TAU); g.fill();
      }
    }
    // 閃電
    for (const a of this.arcs) {
      g.globalAlpha = a.t / 0.18;
      g.strokeStyle = '#bfa8ff'; g.lineWidth = 7;
      g.beginPath(); g.moveTo(a.pts[0], a.pts[1]); for (let i = 2; i < a.pts.length; i += 2) g.lineTo(a.pts[i], a.pts[i + 1]); g.stroke();
      g.strokeStyle = '#ffffff'; g.lineWidth = 2.5; g.stroke();
    }
    g.restore();
  }

  drawFx(g: CanvasRenderingContext2D) {
    for (const p of this.parts.active) {
      const k = p.t / p.life;
      g.globalAlpha = Math.min(1, k * 1.5);
      if (p.kind === 2) {
        g.strokeStyle = p.color; g.lineWidth = 6 * k;
        g.beginPath(); g.arc(p.x, p.y, p.size * (1 - k * 0.8), 0, TAU); g.stroke();
      } else if (p.kind === 1) {
        g.fillStyle = p.color; g.beginPath(); starPath(g, p.x, p.y, p.size * k + 1, p.size * k * 0.45, p.t * 6); g.fill();
      } else {
        g.fillStyle = p.color; g.beginPath(); g.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, TAU); g.fill();
      }
    }
    g.globalAlpha = 1;
    // 傷害數字
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    for (const t of this.texts.active) {
      const crit = t.kind === 1;
      const life = crit ? 0.9 : 0.7;
      const age = life - t.t;
      const pop = crit ? 1 + Math.max(0, 0.6 - age * 4) : 1 + Math.max(0, 0.3 - age * 3);
      const size = (crit ? 30 : t.kind === 3 ? 18 : t.kind === 2 ? 22 : 18) * pop;
      g.globalAlpha = Math.min(1, t.t * 3);
      g.font = `900 ${size}px system-ui,sans-serif`;
      g.strokeStyle = 'rgba(40,20,10,0.85)'; g.lineWidth = crit ? 6 : 4;
      g.strokeText(t.text, t.x, t.y);
      g.fillStyle = crit ? '#ffd23f' : t.kind === 2 ? '#ff5a5a' : t.kind === 3 ? '#6dff8a' : t.kind === 0 ? '#ffffff' : '#ffb26b';
      g.fillText(t.text, t.x, t.y);
    }
    g.globalAlpha = 1;
  }

  drawHud(g: CanvasRenderingContext2D) {
    // 頂部底色
    g.fillStyle = 'rgba(20,30,45,0.85)';
    g.fillRect(0, 0, VW, 92);
    // 等級 + 經驗條
    const need = xpNeed(this.level);
    g.fillStyle = 'rgba(255,255,255,0.15)'; roundRect(g, 74, 22, 300, 16, 8); g.fill();
    g.fillStyle = '#58c7ff'; roundRect(g, 74, 22, 300 * Math.min(1, this.xp / need), 16, 8); g.fill();
    g.fillStyle = '#2b7de0'; g.beginPath(); g.arc(50, 30, 24, 0, TAU); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#fff'; g.font = '900 13px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Lv', 50, 20); g.font = '900 20px system-ui,sans-serif'; g.fillText(String(this.level), 50, 37);
    // 房間
    g.textAlign = 'left'; g.font = '800 17px system-ui,sans-serif';
    const kind = this.rooms[this.roomIdx].kind;
    g.fillStyle = kind === 'boss' ? '#ff7a7a' : kind === 'elite' ? '#ffc04d' : '#ffffff';
    g.fillText(`${this.ch.subtitle}  ${this.roomIdx + 1}/${ROOMS_PER_CHAPTER}`, 74, 62);
    g.textAlign = 'right'; g.fillStyle = '#ffe066';
    g.fillText(`🪙 ${fmtNum(this.goldRun)}`, 455, 62);
    if (location.search.includes('fps')) { g.fillStyle = '#9f9'; g.font = '700 12px monospace'; g.fillText(`${this.fps}fps b${this.bullets.active.length} p${this.parts.active.length}`, 530, 84); }
    // Boss 血條
    if (this.boss && this.boss.alive) {
      const w = 440, x = (VW - w) / 2, y = 104;
      g.fillStyle = 'rgba(0,0,0,0.6)'; roundRect(g, x - 3, y - 3, w + 6, 22, 8); g.fill();
      g.fillStyle = '#ff4d4d'; roundRect(g, x, y, w * Math.max(0, this.boss.hp / this.boss.maxHp), 16, 6); g.fill();
      g.fillStyle = '#fff'; g.font = '800 13px system-ui,sans-serif'; g.textAlign = 'center';
      g.fillText(`${this.boss.def.name}  ${fmtNum(Math.max(0, this.boss.hp))}`, VW / 2, y + 9);
    }
  }

  drawOverlay(g: CanvasRenderingContext2D) {
    if (this.hurtFlash > 0 || this.p.hp / this.maxHp < 0.25) {
      const a = Math.max(this.hurtFlash, this.p.hp / this.maxHp < 0.25 ? 0.18 + Math.sin(this.time * 6) * 0.08 : 0);
      const grd = g.createRadialGradient(VW / 2, VH / 2, VH * 0.3, VW / 2, VH / 2, VH * 0.7);
      grd.addColorStop(0, 'rgba(255,0,0,0)'); grd.addColorStop(1, `rgba(255,0,40,${a})`);
      g.fillStyle = grd; g.fillRect(0, 0, VW, VH);
    }
    if (this.evoFlash > 0) { g.fillStyle = `rgba(255,240,180,${this.evoFlash * 0.5})`; g.fillRect(0, 0, VW, VH); }
    if (this.banner) {
      const b = this.banner;
      const k = Math.min(1, (2.2 - b.t) * 5, b.t * 3);
      g.save();
      g.globalAlpha = Math.max(0, Math.min(1, k));
      g.translate(VW / 2, 400); g.scale(0.8 + k * 0.2, 0.8 + k * 0.2);
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(-VW / 2, -48, VW, b.sub ? 100 : 76);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '900 44px system-ui,sans-serif'; g.lineWidth = 8; g.strokeStyle = '#2a1a10';
      g.strokeText(b.text, 0, -10); g.fillStyle = b.color; g.fillText(b.text, 0, -10);
      if (b.sub) { g.font = '800 22px system-ui,sans-serif'; g.fillStyle = '#fff'; g.fillText(b.sub, 0, 32); }
      g.restore();
    }
    if (this.fade > 0) { g.fillStyle = `rgba(10,14,20,${this.fade})`; g.fillRect(0, 0, VW, VH); }
  }

  drawJoystick(g: CanvasRenderingContext2D) {
    if (!this.input.active || this.state !== 'play') return;
    const toW = (cx: number, cy: number) => [(cx * this.dpr - this.offX) / this.scale, (cy * this.dpr - this.offY) / this.scale];
    const [ox, oy] = toW(this.input.ox, this.input.oy);
    const [cx, cy] = toW(this.input.cx, this.input.cy);
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 3;
    g.beginPath(); g.arc(ox, oy, 60, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath(); g.arc(cx, cy, 26, 0, TAU); g.fill();
  }
}

// ---------- 工具 ----------
/** 線段是否穿過矩形（Liang–Barsky） */
function segHitsRect(x1: number, y1: number, x2: number, y2: number, r: Rect): boolean {
  const dx = x2 - x1, dy = y2 - y1;
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

function pushOut(e: { x: number; y: number; r: number }, o: Rect) {
  const cx = clamp(e.x, o.x, o.x + o.w), cy = clamp(e.y, o.y, o.y + o.h);
  const dx = e.x - cx, dy = e.y - cy;
  const d2v = dx * dx + dy * dy;
  if (d2v >= e.r * e.r) return;
  if (d2v < 0.0001) {
    const l = e.x - o.x, r = o.x + o.w - e.x, t = e.y - o.y, b = o.y + o.h - e.y;
    const m = Math.min(l, r, t, b);
    if (m === l) e.x = o.x - e.r; else if (m === r) e.x = o.x + o.w + e.r; else if (m === t) e.y = o.y - e.r; else e.y = o.y + o.h + e.r;
    return;
  }
  const d = Math.sqrt(d2v);
  e.x += (dx / d) * (e.r - d); e.y += (dy / d) * (e.r - d);
}

function zig(x1: number, y1: number, x2: number, y2: number): number[] {
  const pts = [x1, y1];
  const n = 5;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    pts.push(x1 + (x2 - x1) * t + rand(-12, 12), y1 + (y2 - y1) * t + rand(-12, 12));
  }
  pts.push(x2, y2);
  return pts;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  w = Math.max(0, w);
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function starPath(g: CanvasRenderingContext2D, x: number, y: number, R: number, r: number, rot: number) {
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5;
    const rr = i % 2 ? r : R;
    if (i) g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}
