import { MAP_ROWS, NodeKind } from '../data/chapters';
import { ENEMIES, EnemyDef } from '../data/enemies';
import { PARTNERS, awakenTier, starDmg } from '../data/partners';
import { RARITIES } from '../data/equipment';
import { xpNeed } from '../data/skills';
import { getImage, hasImage, sprite, whiteSprite } from '../core/assets';
import { sfx, vibrate } from '../core/audio';
import { Input } from '../core/input';
import { track } from '../core/track';
import { Pool, clamp, dist2, fmtNum, rand, randInt } from './util';
import type { Member, Run } from './run';

// ---- 世界座標（直式 540 x 960）----
export const VW = 540;
export const VH = 960;
const RX0 = 22, RX1 = 518, RY0 = 130, RY1 = 936;
const TAU = Math.PI * 2;
const ENEMY_HP_SCALE = 1.75; // 隊伍火力比單人高，敵人血量整體放大

interface Bullet {
  x: number; y: number; vx: number; vy: number; r: number; dmg: number;
  enemy: boolean; pierce: boolean; hits: Enemy[]; life: number; color: string; spin: number; src: string;
  aoe: number; burn: number; slow: number; kind: BKind; // 0 星 1 火球 2 紅蘿蔔 3 雪球/墨汁 4 龜殼 5 羽毛 6 浪
  owner: Member | null; homing: boolean; ret: boolean; age: number;
}
type BKind = 0 | 1 | 2 | 3 | 4 | 5 | 6;
interface Enemy {
  id: number; def: EnemyDef; x: number; y: number; r: number; hp: number; maxHp: number;
  vx: number; vy: number; kx: number; ky: number; flash: number; squash: number;
  state: number; t: number; t2: number; ang: number; tx: number; ty: number; count: number;
  spawn: number; burnT: number; burnDps: number; burnTick: number; slowT: number; slowAmt: number;
  alive: boolean; dmgMult: number; ps: number; phase2: boolean; hop: number;
}
interface Pickup { x: number; y: number; vx: number; vy: number; v: number; xp: boolean; magnet: boolean; t: number }
interface Particle { x: number; y: number; vx: number; vy: number; t: number; life: number; size: number; color: string; kind: 0 | 1 | 2; grav: number }
interface DmgText { x: number; y: number; vy: number; t: number; text: string; kind: 0 | 1 | 2 | 3 }
interface Arc { pts: number[]; t: number; color: string }
interface Pos { x: number; y: number; m: Member }

export interface BattleHooks {
  levelUp(): void;
  died(canRevive: boolean): void;
  cleared(): void;
}

type State = 'play' | 'pick' | 'dead' | 'end' | 'pause';

/** 一場戰鬥（地圖上的一個戰鬥 / 菁英 / Boss 節點） */
export class Battle {
  ctx: CanvasRenderingContext2D;
  state: State = 'play';
  prevState: State = 'play';

  head = { x: VW / 2, y: RY1 - 120, ang: -Math.PI / 2 };
  pos: Pos[] = [];      // 每幀計算的隊員位置
  slots = new Map<Member, { x: number; y: number }>();

  enemies: Enemy[] = [];
  bullets = new Pool<Bullet>(() => ({ x: 0, y: 0, vx: 0, vy: 0, r: 0, dmg: 0, enemy: false, pierce: false, hits: [], life: 0, color: '', spin: 0, src: '', aoe: 0, burn: 0, slow: 0, kind: 0, owner: null, homing: false, ret: false, age: 0 }));
  pickups = new Pool<Pickup>(() => ({ x: 0, y: 0, vx: 0, vy: 0, v: 0, xp: false, magnet: false, t: 0 }));
  parts = new Pool<Particle>(() => ({ x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 0, size: 0, color: '', kind: 0, grav: 0 }));
  texts = new Pool<DmgText>(() => ({ x: 0, y: 0, vy: 0, t: 0, text: '', kind: 0 }));
  arcs: Arc[] = [];

  waves: [string, number][][] = [];
  waveIdx = -1;
  waveT = 0;
  clearT = -1;
  freeze = 0;
  shake = 0;
  time = 0;
  fade = 1;
  banner: { text: string; sub: string; t: number; color: string } | null = null;
  boss: Enemy | null = null;
  hurtFlash = 0;
  evoFlash = 0;
  curSrc = '';
  hurtBy: Record<string, number> = {};
  pendingLevels = 0;
  nextId = 1;
  hpMult: number;

  private raf = 0;
  private acc = 0;
  private lastT = 0;
  private scale = 1; private offX = 0; private offY = 0; private dpr = 1;
  private floor: CanvasPattern | null = null;
  fps = 60; private fpsAcc = 0; private fpsN = 0;
  bot = false;
  timeScale = 1;
  stopOnRelease = false;
  regenT = 0;
  tutMove = false;
  tutT = 0;
  onTutDone: (() => void) | null = null;

  constructor(private canvas: HTMLCanvasElement, private input: Input, private hooks: BattleHooks, public run: Run, public kind: NodeKind, public row: number) {
    this.ctx = canvas.getContext('2d')!;
    const ch = run.ch;
    this.hpMult = ch.hpMult * (1 + ch.rowGrowth * row) * ENEMY_HP_SCALE;
    this.buildWaves();
    this.buildFloor();
    this.resize();
    this.layout();
    for (const m of run.team) { m.invuln = 0; m.flash = 0; }
    if (kind === 'boss') {
      run.reachedBoss = true;
      this.banner = { text: 'BOSS', sub: ENEMIES[ch.boss].name, t: 2.2, color: '#ff5a5a' };
      sfx.boss(); this.shake = 10; vibrate([60, 40, 60]);
    } else if (kind === 'elite') {
      this.banner = { text: '菁英來襲', sub: '', t: 1.6, color: '#ffb02e' };
    }
    this.nextWave();
  }

  buildWaves() {
    const ch = this.run.ch;
    const pool = ch.normalPool;
    const pick = () => pool[randInt(0, pool.length - 1)];
    const group = (n: number): [string, number][] => {
      const m = new Map<string, number>();
      for (let i = 0; i < n; i++) { const id = pick(); m.set(id, (m.get(id) ?? 0) + 1); }
      return [...m.entries()];
    };
    const r = this.row;
    if (this.kind === 'boss') this.waves = [[[ch.boss, 1]]];
    else if (this.kind === 'elite') this.waves = [group(3 + Math.floor(r / 2)), [[ch.elites[randInt(0, ch.elites.length - 1)], 1], ...group(2)]];
    else {
      const nw = r >= 4 ? 3 : 2;
      for (let w = 0; w < nw; w++) this.waves.push(group(3 + Math.floor(r * 0.9) + w));
    }
  }

  nextWave() {
    this.waveIdx++;
    this.waveT = 0;
    const w = this.waves[this.waveIdx];
    for (const [id, n] of w) for (let k = 0; k < n; k++) this.spawnEnemy(id);
    if (this.waves.length > 1 && this.kind !== 'boss' && !this.banner) this.banner = { text: `第 ${this.waveIdx + 1} 波`, sub: '', t: 1.0, color: '#ffffff' };
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

  stop() { cancelAnimationFrame(this.raf); this.input.enabled = false; this.input.reset(); }
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
    this.input.maxR = (60 * this.scale) / this.dpr;
  }

  spawnEnemy(id: string, x?: number, y?: number): Enemy {
    const def = ENEMIES[id];
    const hp = def.hp * this.hpMult * (def.rank === 'boss' ? this.run.ch.bossHpMult : 1);
    let px = x ?? 0, py = y ?? 0;
    if (x === undefined) {
      if (def.rank !== 'normal') { px = VW / 2; py = RY0 + 170; }
      else {
        for (let tries = 0; tries < 40; tries++) {
          px = rand(RX0 + 40, RX1 - 40); py = rand(RY0 + 40, RY1 - 40);
          if (this.pos.some((p) => dist2(px, py, p.x, p.y) < 200 * 200)) continue;
          if (this.enemies.some((e) => e.alive && dist2(px, py, e.x, e.y) < 50 * 50)) continue;
          break;
        }
      }
    }
    const e: Enemy = {
      id: this.nextId++, def, x: px, y: py, r: def.r, hp, maxHp: hp,
      vx: 0, vy: 0, kx: 0, ky: 0, flash: 0, squash: 0, state: 0, t: rand(0.8, 1.6), t2: 0, ang: 0, tx: px, ty: py, count: 0,
      spawn: 0.7, burnT: 0, burnDps: 0, burnTick: 0, slowT: 0, slowAmt: 0, alive: true,
      dmgMult: this.run.ch.dmgMult * (1 + 0.05 * this.row), ps: def.rank === 'boss' ? this.run.ch.bossPatternSpeed : 1, phase2: false, hop: 0,
    };
    if (def.rank === 'boss') { e.t = 1.8; this.boss = e; }
    this.enemies.push(e);
    return e;
  }

  // ================= 更新 =================
  update(dt: number) {
    this.time += dt;
    this.updateFx(dt);
    if (this.fade > 0) this.fade = Math.max(0, this.fade - dt * 3);
    if (this.state !== 'play') return;
    if (this.freeze > 0) { this.freeze -= dt; return; }

    this.updateMove(dt);
    if (this.run.forestRegen) {
      this.regenT += dt;
      if (this.regenT >= 5) { this.regenT = 0; for (const p of this.pos) this.healMember(p.m, p.m.maxHp * 0.03, p.x, p.y, true); }
    }
    this.updateWeapons(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updatePickups(dt);
    this.checkWaves(dt);
    if (this.pendingLevels > 0 && this.state === 'play') this.openPick();
  }

  // ---------------- 移動 ----------------
  /** 拖曳控制方向，隊伍一直移動；夥伴圍在隊長身邊 */
  updateMove(dt: number) {
    const h = this.head;
    const mv = this.bot ? this.botMove() : this.input.move();
    const mag = Math.hypot(mv.x, mv.y);
    const steering = mag > 0.2;
    if (this.tutMove && this.input.active) {
      this.tutT += dt;
      if (this.tutT > 1.2) { this.tutMove = false; this.onTutDone?.(); }
    }
    const idle = !steering && this.stopOnRelease && !this.bot;
    if (!idle) {
      if (steering) {
        const want = Math.atan2(mv.y, mv.x);
        let d = want - h.ang;
        while (d > Math.PI) d -= TAU;
        while (d < -Math.PI) d += TAU;
        const turn = 14 * dt;
        h.ang += clamp(d, -turn, turn);
      }
      const sp = this.run.speed;
      let nx = h.x + Math.cos(h.ang) * sp * dt;
      let ny = h.y + Math.sin(h.ang) * sp * dt;
      const r = 24;
      if (nx < RX0 + r || nx > RX1 - r) { if (!steering) h.ang = Math.PI - h.ang; nx = clamp(nx, RX0 + r, RX1 - r); }
      if (ny < RY0 + r || ny > RY1 - r) { if (!steering) h.ang = -h.ang; ny = clamp(ny, RY0 + r, RY1 - r); }
      h.x = nx; h.y = ny;
      if (Math.random() < dt * 10) this.addPart(h.x + rand(-6, 6), h.y + 14, rand(-20, 20), rand(-30, -10), 0.35, 4, 'rgba(255,255,255,0.7)', 0, 0);
    }
    this.layout(dt);
    for (const m of this.run.team) { m.flash -= dt; m.invuln -= dt; }
  }

  /** 夥伴陣形：圍在隊長身邊兩圈，平滑跟上 */
  layout(dt = 1) {
    this.pos.length = 0;
    const alive = this.run.team.filter((m) => !m.down);
    const h = this.head;
    const k = Math.min(1, dt * 9);
    alive.forEach((m, i) => {
      let ox = 0, oy = 0;
      if (i > 0) {
        const ring1 = Math.min(alive.length - 1, 6);
        const inRing1 = i <= 6;
        const n = inRing1 ? ring1 : alive.length - 7;
        const j = inRing1 ? i - 1 : i - 7;
        const R = inRing1 ? 50 : 92;
        const a = -Math.PI / 2 + (j / n) * TAU + (inRing1 ? 0 : Math.PI / n);
        ox = Math.cos(a) * R; oy = Math.sin(a) * R * 0.85;
      }
      const tx = clamp(h.x + ox, RX0 + 16, RX1 - 16), ty = clamp(h.y + oy, RY0 + 16, RY1 - 16);
      let s = this.slots.get(m);
      if (!s) { s = { x: tx, y: ty }; this.slots.set(m, s); }
      if (i === 0) { s.x = h.x; s.y = h.y; } else { s.x += (tx - s.x) * k; s.y += (ty - s.y) * k; }
      this.pos.push({ x: s.x, y: s.y, m });
    });
  }

  toWorld(cx: number, cy: number): [number, number] {
    return [(cx * this.dpr - this.offX) / this.scale, (cy * this.dpr - this.offY) / this.scale];
  }

  nearestMember(x: number, y: number): Pos | undefined {
    let best: Pos | undefined, bd = Infinity;
    for (const p of this.pos) { const d = dist2(x, y, p.x, p.y); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  nearest(x: number, y: number, exclude?: Enemy[], maxD = Infinity): Enemy | null {
    let best: Enemy | null = null, bd = maxD * maxD;
    for (const e of this.enemies) {
      if (!e.alive || e.spawn > 0.2 || (exclude && exclude.includes(e))) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ---------------- 隊員武器 ----------------
  updateWeapons(dt: number) {
    const run = this.run;
    for (const p of this.pos) {
      const m = p.m;
      const def = PARTNERS[m.pid];
      m.cdT -= dt * run.aspdMul;
      if (m.cdT > 0) continue;
      const dmg = run.atk * def.dmg * starDmg(m.star) * run.plvMul(m.pid);
      if (def.weapon === 'heal') {
        const target = this.pos.filter((q) => q.m.hp < q.m.maxHp * 0.98).sort((a, b) => a.m.hp / a.m.maxHp - b.m.hp / b.m.maxHp)[0];
        if (target) {
          const amt = target.m.maxHp * 0.07 * starDmg(m.star) * (run.combos.has('combo_hug') ? 2 : 1);
          this.healMember(target.m, amt, target.x, target.y);
          this.arcs.push({ pts: [p.x, p.y, (p.x + target.x) / 2, (p.y + target.y) / 2 - 20, target.x, target.y], t: 0.25, color: '#7dff9a' });
          m.cdT = def.cd;
          continue;
        }
        const t = this.nearest(p.x, p.y, undefined, def.range);
        if (t) { this.shoot(p, t, dmg, 0, 520, '#f7d77c', 5); m.cdT = def.cd * 0.6; }
        continue;
      }
      if (def.weapon === 'kungfu') {
        const R = def.range + 6 * m.star;
        const hit = this.enemies.filter((e) => e.alive && e.spawn <= 0 && dist2(e.x, e.y, p.x, p.y) < (R + e.r) ** 2);
        if (!hit.length) continue;
        for (const e of hit) {
          const a = Math.atan2(e.y - p.y, e.x - p.x);
          this.hitEnemy(e, dmg, Math.cos(a) * 1.2, Math.sin(a) * 1.2);
          if (e.def.rank === 'normal') { e.slowT = Math.max(e.slowT, 0.35); e.slowAmt = 1; }
          this.addPart(e.x, e.y, 0, 0, 0.18, e.r + 6, 'rgba(255,255,255,0.9)', 2, 0);
        }
        m.cdT = def.cd;
        continue;
      }
      if (def.weapon === 'slam') {
        const R = def.range + 10 * m.star;
        if (!this.enemies.some((e) => e.alive && e.spawn <= 0 && dist2(e.x, e.y, p.x, p.y) < (R + e.r) ** 2)) continue;
        for (const e of this.enemies) {
          if (!e.alive || e.spawn > 0 || dist2(e.x, e.y, p.x, p.y) > (R + e.r) ** 2) continue;
          const a = Math.atan2(e.y - p.y, e.x - p.x);
          this.hitEnemy(e, dmg, Math.cos(a) * 2.2, Math.sin(a) * 2.2);
        }
        this.addPart(p.x, p.y, 0, 0, 0.35, R, 'rgba(255,220,160,0.9)', 2, 0);
        this.shake = Math.max(this.shake, 3);
        sfx.explode();
        m.cdT = def.cd;
        continue;
      }
      const t = this.nearest(p.x, p.y, undefined, def.range);
      if (!t) continue;
      m.cdT = def.cd;
      switch (def.weapon) {
        case 'star': {
          const a = Math.atan2(t.y - p.y, t.x - p.x);
          if (run.combos.has('combo_unity')) for (let i = -2; i <= 2; i++) this.shootAng(p, a + i * 0.22, dmg, 0, 760, '#ffe45c', 7);
          else {
            const n = m.star >= 5 ? 3 : m.star >= 3 ? 2 : 1;
            for (let i = 0; i < n; i++) {
              const off = (i - (n - 1) / 2) * 13;
              this.shootAng({ x: p.x + Math.cos(a + Math.PI / 2) * off, y: p.y + Math.sin(a + Math.PI / 2) * off }, a, dmg, 0, 760, '#ffe45c', 7);
            }
          }
          sfx.shoot();
          break;
        }
        case 'fire': {
          const meteor = run.combos.has('combo_meteor');
          const b = this.shoot(p, t, dmg, 1, 520, '#ff8a3d', meteor ? 16 : 10);
          b.aoe = meteor ? 110 : m.star >= 3 ? 65 : 45;
          b.burn = run.atk * 0.15 * starDmg(m.star) * (meteor ? 2 : 1);
          break;
        }
        case 'rapid': {
          const bl = run.combos.has('combo_blizzard');
          const b = this.shoot(p, t, dmg, 2, 820, bl ? '#bfefff' : '#ff9f43', 5, m.star >= 3 ? rand(-0.12, 0.12) : 0);
          if (bl) { b.pierce = true; b.slow = 0.4; }
          break;
        }
        case 'chain': {
          const meteor = run.combos.has('combo_meteor');
          const n = meteor ? 6 : 3 + (m.star >= 3 ? 1 : 0) + (m.star >= 5 ? 1 : 0);
          const chain: Enemy[] = [];
          let cx = p.x, cy = p.y;
          let cur: Enemy | null = t;
          for (let i = 0; i < n && cur; i++) {
            chain.push(cur);
            this.arcs.push({ pts: zig(cx, cy, cur.x, cur.y), t: 0.18, color: '#bfa8ff' });
            this.hitEnemy(cur, dmg, 0, 0);
            if (meteor) { cur.burnT = 2.5; cur.burnDps = Math.max(cur.burnDps, run.atk * 0.2); }
            cx = cur.x; cy = cur.y;
            cur = this.nearest(cx, cy, chain, 200);
          }
          sfx.zap();
          break;
        }
        case 'boomerang': {
          const b = this.shoot(p, t, dmg, 4, 460, '#7cbf6a', 12 + m.star);
          b.pierce = true; b.ret = true; b.owner = m; b.life = 2.6;
          break;
        }
        case 'ink': {
          const a = Math.atan2(t.y - p.y, t.x - p.x);
          const n = m.star >= 3 ? 5 : 3;
          for (let i = 0; i < n; i++) {
            const b = this.shootAng(p, a + (i - (n - 1) / 2) * 0.28, dmg, 3, 420, '#7d4fb0', 8);
            b.aoe = 34; b.slow = 0.35;
          }
          break;
        }
        case 'homing': {
          const n = 3 + (m.star >= 3 ? 1 : 0) + (m.star >= 5 ? 1 : 0);
          const a = Math.atan2(t.y - p.y, t.x - p.x);
          for (let i = 0; i < n; i++) {
            const b = this.shootAng(p, a + (i - (n - 1) / 2) * 0.7, dmg, 5, 420, '#5fd38a', 6);
            b.homing = true; b.life = 2.2;
          }
          break;
        }
        case 'wave': {
          const b = this.shoot(p, t, dmg, 6, 380, '#4fb3ff', 30 + m.star * 3);
          b.pierce = true; b.life = 1.6;
          this.shake = Math.max(this.shake, 2);
          break;
        }
        case 'rainbow': {
          const a = Math.atan2(t.y - p.y, t.x - p.x);
          const L = def.range + 40;
          const ex = p.x + Math.cos(a) * L, ey = p.y + Math.sin(a) * L;
          const w = 18 + m.star * 2;
          for (const e of this.enemies) {
            if (!e.alive || e.spawn > 0) continue;
            if (segDist2(p.x, p.y, ex, ey, e.x, e.y) < (w + e.r) ** 2) this.hitEnemy(e, dmg, Math.cos(a) * 0.6, Math.sin(a) * 0.6);
          }
          ['#ff6b6b', '#ffd23f', '#5ce07a', '#58c7ff', '#b48cf2'].forEach((c, i) => {
            const o = (i - 2) * 4;
            const ox = Math.cos(a + Math.PI / 2) * o, oy = Math.sin(a + Math.PI / 2) * o;
            this.arcs.push({ pts: [p.x + ox, p.y + oy, ex + ox, ey + oy], t: 0.22, color: c });
          });
          for (const q of this.pos) this.healMember(q.m, q.m.maxHp * 0.015 * starDmg(m.star), q.x, q.y, true);
          sfx.zap();
          break;
        }
        case 'breath': {
          const a = Math.atan2(t.y - p.y, t.x - p.x);
          const R = def.range + 10 * m.star, half = 0.45;
          for (const e of this.enemies) {
            if (!e.alive || e.spawn > 0) continue;
            const d = Math.sqrt(dist2(e.x, e.y, p.x, p.y));
            if (d > R + e.r) continue;
            let da = Math.atan2(e.y - p.y, e.x - p.x) - a;
            while (da > Math.PI) da -= TAU;
            while (da < -Math.PI) da += TAU;
            if (Math.abs(da) > half + e.r / Math.max(d, 1)) continue;
            this.hitEnemy(e, dmg, Math.cos(a) * 0.3, Math.sin(a) * 0.3);
            e.burnT = 2; e.burnDps = Math.max(e.burnDps, run.atk * 0.3 * starDmg(m.star));
          }
          for (let i = 0; i < 6; i++) {
            const aa = a + rand(-half, half), sp = rand(250, 420);
            this.addPart(p.x, p.y, Math.cos(aa) * sp, Math.sin(aa) * sp, 0.45, rand(6, 11), i % 2 ? '#ff8a3d' : '#ffd23f', 0, 0);
          }
          break;
        }
        case 'frost': {
          const b = this.shoot(p, t, dmg, 3, 460, '#e8f6ff', 9);
          b.aoe = run.combos.has('combo_blizzard') ? 120 : m.star >= 3 ? 75 : 55;
          b.slow = 0.4;
          break;
        }
      }
    }
  }

  shoot(from: { x: number; y: number }, t: Enemy, dmg: number, kind: BKind, sp: number, color: string, r: number, jitter = 0): Bullet {
    const d = Math.sqrt(dist2(from.x, from.y, t.x, t.y)) / sp;
    const a = Math.atan2(t.y + t.vy * d * 0.5 - from.y, t.x + t.vx * d * 0.5 - from.x) + jitter;
    return this.shootAng(from, a, dmg, kind, sp, color, r);
  }

  shootAng(from: { x: number; y: number }, a: number, dmg: number, kind: BKind, sp: number, color: string, r: number): Bullet {
    const b = this.bullets.obtain();
    b.x = from.x + Math.cos(a) * 14; b.y = from.y + Math.sin(a) * 14;
    b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
    b.r = r; b.dmg = dmg; b.enemy = false; b.pierce = false; b.hits.length = 0;
    b.life = 1.4; b.color = color; b.spin = rand(0, TAU); b.src = ''; b.aoe = 0; b.burn = 0; b.slow = 0; b.kind = kind;
    b.owner = null; b.homing = false; b.ret = false; b.age = 0;
    return b;
  }

  eBullet(x: number, y: number, a: number, speed: number, dmg: number, r = 8, color = '#ff4f7b') {
    const b = this.bullets.obtain();
    b.src = this.curSrc;
    b.x = x; b.y = y; b.vx = Math.cos(a) * speed; b.vy = Math.sin(a) * speed;
    b.r = r; b.dmg = dmg; b.enemy = true; b.pierce = false; b.hits.length = 0;
    b.life = 6; b.color = color; b.spin = 0; b.aoe = 0; b.burn = 0; b.slow = 0; b.kind = 0;
    b.owner = null; b.homing = false; b.ret = false; b.age = 0;
  }

  ring(e: Enemy, n: number, speed: number, offset = 0, r = 8) {
    for (let i = 0; i < n; i++) this.eBullet(e.x, e.y, offset + (i / n) * TAU, speed, e.def.bullet * e.dmgMult, r);
    sfx.enemyShot();
  }

  spread(e: Enemy, tx: number, ty: number, n: number, gap: number, speed: number, r = 8) {
    const a = Math.atan2(ty - e.y, tx - e.x);
    for (let i = 0; i < n; i++) this.eBullet(e.x, e.y, a + (i - (n - 1) / 2) * gap, speed, e.def.bullet * e.dmgMult, r);
    sfx.enemyShot();
  }

  // ---------------- 敵人 ----------------
  updateEnemies(dt: number) {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.spawn > 0) { e.spawn -= dt; continue; }
      e.flash -= dt; e.squash = Math.max(0, e.squash - dt * 6);
      if (e.slowT > 0) e.slowT -= dt;
      if (e.burnT > 0) {
        e.burnT -= dt; e.burnTick -= dt;
        if (e.burnTick <= 0) { e.burnTick = 0.5; this.damage(e, e.burnDps * 0.5, 3); if (!e.alive) continue; }
        if (Math.random() < dt * 10) this.addPart(e.x + rand(-e.r, e.r) * 0.6, e.y - rand(0, e.r), rand(-10, 10), rand(-60, -30), 0.4, 5, '#ff8a3d', 0, 0);
      }
      const slow = (e.slowT > 0 ? 1 - e.slowAmt : 1) * (1 - this.run.enemySlow);
      e.vx = 0; e.vy = 0;
      this.curSrc = e.def.id;
      const tg = this.nearestMember(e.x, e.y);
      if (!tg) continue;
      this.ai(e, dt * slow * e.ps, dt * slow, tg.x, tg.y);
      if (!e.alive) continue;
      e.x += (e.vx * slow + e.kx) * dt;
      e.y += (e.vy * slow + e.ky) * dt;
      const damp = Math.min(1, dt * 10);
      e.kx -= e.kx * damp; e.ky -= e.ky * damp;
      const bx = clamp(e.x, RX0 + e.r, RX1 - e.r), by = clamp(e.y, RY0 + e.r, RY1 - e.r);
      if (bx !== e.x || by !== e.y) { e.x = bx; e.y = by; if (e.state === 2 && (e.def.ai === 'dasher' || e.def.ai === 'raccoon' || e.def.ai === 'boar')) this.onWallHit(e); }
      if (e.hop < 0.3) for (const p of this.pos) {
        if (dist2(e.x, e.y, p.x, p.y) < (e.r + 16) ** 2) {
          this.hurtMember(p, e.def.contact * e.dmgMult, 'touch:' + e.def.id);
          const a = Math.atan2(e.y - p.y, e.x - p.x);
          if (e.def.rank === 'normal') { e.kx += Math.cos(a) * 260; e.ky += Math.sin(a) * 260; }
          break;
        }
      }
    }
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
      this.ring(e, 18, 220, rand(0, 1), 9);
      this.shake = Math.max(this.shake, 12); sfx.explode(); vibrate(30);
      this.puff(e.x, e.y, '#c9a27a', 20);
      e.state = 0; e.t = 0.9 / e.ps;
    } else if (e.def.ai === 'raccoon') {
      e.ang += Math.PI + rand(-0.4, 0.4);
      this.shake = Math.max(this.shake, 6);
    } else {
      if (e.x <= RX0 + e.r + 1 || e.x >= RX1 - e.r - 1) e.ang = Math.PI - e.ang;
      if (e.y <= RY0 + e.r + 1 || e.y >= RY1 - e.r - 1) e.ang = -e.ang;
    }
  }

  ai(e: Enemy, k: number, dtRaw: number, px: number, py: number) {
    const toP = Math.atan2(py - e.y, px - e.x);
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
          if (dist2(e.x, e.y, e.tx, e.ty) < 400 || e.t2 <= 0) { e.tx = rand(RX0 + 50, RX1 - 50); e.ty = rand(RY0 + 60, RY1 - 60); e.t2 = 2.5; }
          e.t2 -= dtRaw;
          const a = Math.atan2(e.ty - e.y, e.tx - e.x);
          e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp;
          if (e.t <= 0) { e.state = 1; e.t = 0.5; }
        } else {
          e.squash = 0.6;
          if (e.t <= 0) {
            if (e.def.id === 'owl') this.spread(e, px, py, 3, 0.28, 240); else this.spread(e, px, py, 1, 0, 250);
            e.state = 0; e.t = rand(2.0, 2.8);
          }
        }
        break;
      }
      case 'dasher': {
        if (e.state === 0) {
          e.vx = Math.sin(this.time * 20 + e.id) * 10;
          if (e.t <= 0) { e.state = 1; e.t = 0.6; e.ang = toP; }
        } else if (e.state === 1) {
          e.ang = toP; e.squash = 0.8;
          if (e.t <= 0) { e.state = 2; e.t = e.def.id === 'seal' ? 0.8 : 0.5; }
        } else {
          const s = e.def.id === 'seal' ? 460 : 520;
          e.vx = Math.cos(e.ang) * s; e.vy = Math.sin(e.ang) * s;
          if (Math.random() < 0.4) this.addPart(e.x, e.y + e.r * 0.6, rand(-20, 20), rand(-20, 0), 0.3, 6, 'rgba(255,255,255,0.6)', 0, 0);
          if (e.t <= 0) { e.state = 0; e.t = rand(1.2, 1.8); }
        }
        break;
      }
      case 'crab': {
        e.t2 += dtRaw;
        e.vx = Math.sign(px - e.x || 1) * sp * 0.5 + Math.sin(e.t2 * 2.4 + e.id) * sp;
        e.vy = Math.sign(py - e.y) * sp * 0.3;
        if (e.t <= 0) { this.spread(e, px, py, 3, 0.3, 230); e.t = rand(2.4, 3.1); e.squash = 1; }
        break;
      }
      case 'tank': {
        e.vx = Math.cos(toP) * sp; e.vy = Math.sin(toP) * sp;
        if (e.t <= 0) { this.ring(e, 8, 160, rand(0, 1)); e.t = rand(3.8, 4.6); e.squash = 1; }
        break;
      }
      case 'frog': {
        if (e.state === 0) {
          if (e.t <= 0) { e.state = 1; e.t = 0.42; e.ang = toP + rand(-0.3, 0.3); }
        } else {
          e.hop = Math.sin((1 - e.t / 0.42) * Math.PI) * 26;
          e.vx = Math.cos(e.ang) * 320; e.vy = Math.sin(e.ang) * 320;
          if (e.t <= 0) {
            e.hop = 0; e.state = 0; e.t = rand(1.3, 1.8); e.squash = 1;
            for (let i = 0; i < 4; i++) this.eBullet(e.x, e.y, Math.PI / 4 + (i * Math.PI) / 2, 210, e.def.bullet * e.dmgMult);
            this.puff(e.x, e.y + e.r, '#ffffff', 6);
          }
        }
        break;
      }
      case 'kingshroom': {
        e.vx = Math.cos(toP) * sp; e.vy = Math.sin(toP) * sp;
        if (!e.phase2 && e.hp < e.maxHp * 0.5) {
          e.phase2 = true;
          for (let i = 0; i < 3; i++) this.spawnEnemy('mushroom', e.x + Math.cos(i * 2.1) * 70, e.y + Math.sin(i * 2.1) * 70);
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
        e.tx = VW / 2 + Math.sin(e.t2 * 0.9) * 170; e.ty = RY0 + 200 + Math.sin(e.t2 * 1.7) * 60;
        e.vx = (e.tx - e.x) * 2; e.vy = (e.ty - e.y) * 2;
        if (e.state === 0) {
          if (e.t <= 0) { this.spread(e, px, py, 5, 0.22, 260); e.count++; e.t = 0.5; if (e.count >= 3) { e.state = 1; e.count = 0; e.t = 0.8; } }
        } else if (e.state === 1) {
          if (e.t <= 0) {
            e.ang += 0.38;
            for (let i = 0; i < 3; i++) this.eBullet(e.x, e.y, e.ang + (i * TAU) / 3, 180, e.def.bullet * e.dmgMult);
            e.t = 0.12; e.count++;
            if (e.count >= 20) { e.state = 2; e.count = 0; e.t = 0.6; }
          }
        } else if (e.t <= 0) {
          if (this.enemies.length < 8) { this.spawnEnemy('bee', e.x - 50, e.y + 30); this.spawnEnemy('bee', e.x + 50, e.y + 30); }
          e.state = 0; e.t = 1.2;
        }
        break;
      }
      case 'raccoon': this.aiRaccoon(e, toP, px, py); break;
      case 'boar': this.aiBoar(e, toP); break;
    }
  }

  aiRaccoon(e: Enemy, toP: number, px: number, py: number) {
    if (!e.phase2 && e.hp < e.maxHp * 0.5) {
      e.phase2 = true; e.ps *= 1.2;
      this.banner = { text: '浣熊大盜認真了！', sub: '', t: 1.4, color: '#ff5a5a' };
      this.spawnEnemy('mushroom', 120, 300); this.spawnEnemy('mushroom', 420, 300);
      sfx.boss(); this.shake = 10;
    }
    switch (e.state) {
      case 0: {
        const tx = VW / 2 + Math.sin(this.time * 0.8) * 140, ty = RY0 + 220 + Math.cos(this.time * 0.6) * 80;
        e.vx = (tx - e.x) * 1.5; e.vy = (ty - e.y) * 1.5;
        if (e.t <= 0) { const opts = e.phase2 ? [1, 3, 4, 5] : [1, 3, 4]; e.state = opts[e.count++ % opts.length]; e.t = 0.7; e.t2 = 0; }
        break;
      }
      case 1: e.ang = toP; e.squash = 0.8; if (e.t <= 0) { e.state = 2; e.t = 0.55; } break;
      case 2:
        e.vx = Math.cos(e.ang) * 600; e.vy = Math.sin(e.ang) * 600;
        if (Math.random() < 0.5) this.addPart(e.x, e.y + e.r * 0.6, rand(-30, 30), rand(-30, 0), 0.35, 8, 'rgba(255,255,255,0.6)', 0, 0);
        if (e.t <= 0) { e.t2++; if (e.t2 < 3) { e.state = 1; e.t = 0.5; } else { e.state = 0; e.t = 1.1; } }
        break;
      case 3:
        if (e.t <= 0) { this.ring(e, 16, 190, e.t2 * 0.2, 9); e.t2++; e.t = 0.42; e.squash = 1; if (e.t2 >= 3) { e.state = 0; e.t = 1.2; } }
        break;
      case 4:
        if (e.t <= 0) { this.spread(e, px, py, 5, 0.2, 280, 10); e.t2++; e.t = 0.4; if (e.t2 >= 3) { e.state = 0; e.t = 1.1; } }
        break;
      case 5:
        if (e.t <= 0) {
          e.ang += 0.31;
          for (let i = 0; i < 2; i++) this.eBullet(e.x, e.y, e.ang + i * Math.PI, 200, e.def.bullet * e.dmgMult);
          e.t = 0.08; e.t2++;
          if (e.t2 >= 34) { e.state = 0; e.t = 1.2; }
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
        if (e.t <= 0) { const opts = [1, 3, 1, 4]; e.state = opts[e.count++ % opts.length]; e.t = 0.8; e.t2 = 0; }
        break;
      case 1: e.ang = toP; e.squash = 0.9; if (e.t <= 0) { e.state = 2; e.t = 3; } break;
      case 2:
        e.vx = Math.cos(e.ang) * 650; e.vy = Math.sin(e.ang) * 650;
        if (Math.random() < 0.6) this.addPart(e.x, e.y + e.r * 0.6, rand(-30, 30), rand(-30, 0), 0.4, 9, 'rgba(210,180,140,0.8)', 0, 0);
        if (e.t <= 0) { e.state = 0; e.t = 0.8; }
        break;
      case 3:
        if (e.t <= 0) { this.ring(e, 14, 150, e.t2 * 0.22, 10); e.t2++; e.t = 0.55; e.squash = 1; this.shake = Math.max(this.shake, 5); if (e.t2 >= (e.phase2 ? 4 : 3)) { e.state = 0; e.t = 1; } }
        break;
      case 4:
        if (e.t <= 0) { if (this.enemies.length < 6) { this.spawnEnemy('hedgehog', 100, 300); this.spawnEnemy('hedgehog', 440, 300); } e.state = 0; e.t = 1; }
        break;
    }
  }

  // ---------------- 子彈 ----------------
  updateBullets(dt: number) {
    const arr = this.bullets.active;
    for (let i = arr.length - 1; i >= 0; i--) {
      const b = arr[i];
      b.age += dt;
      if (b.homing && b.age > 0.12) {
        const t = this.nearest(b.x, b.y, undefined, 360);
        if (t) {
          const sp = Math.hypot(b.vx, b.vy);
          const want = Math.atan2(t.y - b.y, t.x - b.x);
          let cur = Math.atan2(b.vy, b.vx), d = want - cur;
          while (d > Math.PI) d -= TAU;
          while (d < -Math.PI) d += TAU;
          cur += clamp(d, -7 * dt, 7 * dt);
          b.vx = Math.cos(cur) * sp; b.vy = Math.sin(cur) * sp;
        }
      }
      if (b.ret && b.age > 0.55) {
        const o = this.pos.find((q) => q.m === b.owner);
        if (!o) b.life = 0;
        else {
          if (b.age - dt <= 0.55) b.hits.length = 0; // 回程可以再打一次
          const sp = 560, a = Math.atan2(o.y - b.y, o.x - b.x);
          b.vx += (Math.cos(a) * sp - b.vx) * Math.min(1, dt * 6);
          b.vy += (Math.sin(a) * sp - b.vy) * Math.min(1, dt * 6);
          if (dist2(b.x, b.y, o.x, o.y) < 24 * 24) b.life = 0;
        }
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; b.spin += dt * 12;
      if (b.ret && b.age <= 0.55 && (b.x < RX0 || b.x > RX1 || b.y < RY0 || b.y > RY1)) b.age = 0.56;
      let dead = b.life <= 0 || b.x < RX0 - 10 || b.x > RX1 + 10 || b.y < RY0 - 10 || b.y > RY1 + 10;
      if (dead && b.ret && b.life > 0) dead = false;
      if (dead) { if (b.aoe) this.explode(b); else this.puff(b.x, b.y, b.enemy ? '#ff9db5' : '#fff2a8', 3); this.bullets.release(i); continue; }
      if (b.enemy) {
        for (const p of this.pos) {
          if (dist2(b.x, b.y, p.x, p.y) < (b.r + 13) ** 2) {
            this.hurtMember(p, b.dmg, 'shot:' + b.src);
            this.puff(b.x, b.y, '#ff6b8b', 6);
            dead = true;
            break;
          }
        }
        if (dead) this.bullets.release(i);
        continue;
      }
      for (const e of this.enemies) {
        if (!e.alive || e.spawn > 0 || b.hits.includes(e) || e.hop > 14) continue;
        if (dist2(b.x, b.y, e.x, e.y) < (b.r + e.r) ** 2) {
          b.hits.push(e);
          const len = Math.hypot(b.vx, b.vy) || 1;
          if (b.aoe) { this.explode(b); dead = true; break; }
          this.hitEnemy(e, b.dmg, b.vx / len, b.vy / len);
          if (b.slow) { e.slowT = 1.5; e.slowAmt = b.slow; }
          if (b.pierce) { b.dmg *= 0.8; continue; }
          dead = true;
          break;
        }
      }
      if (dead) this.bullets.release(i);
    }
  }

  explode(b: Bullet) {
    const R = b.aoe;
    for (const e of this.enemies) {
      if (!e.alive || e.spawn > 0 || dist2(e.x, e.y, b.x, b.y) > (R + e.r) ** 2) continue;
      const a = Math.atan2(e.y - b.y, e.x - b.x);
      this.hitEnemy(e, b.dmg, Math.cos(a) * 0.7, Math.sin(a) * 0.7);
      if (b.burn) { e.burnT = 2.6; e.burnDps = Math.max(e.burnDps, b.burn); }
      if (b.slow) { e.slowT = 1.6; e.slowAmt = b.slow; }
    }
    const fire = b.kind === 1;
    this.addPart(b.x, b.y, 0, 0, 0.35, R, fire ? 'rgba(255,150,40,0.9)' : 'rgba(200,240,255,0.95)', 2, 0);
    for (let i = 0; i < 8; i++) this.addPart(b.x, b.y, rand(-220, 220), rand(-220, 220), 0.4, 5, fire ? '#ffb347' : '#ffffff', 0, 0);
    if (R > 90) { this.shake = Math.max(this.shake, 4); sfx.explode(); }
  }

  hitEnemy(e: Enemy, base: number, dx: number, dy: number) {
    const run = this.run;
    const isCrit = Math.random() < run.crit;
    const dmg = base * (isCrit ? run.critDmg : 1) * rand(0.92, 1.08);
    const kb = e.def.rank === 'normal' ? 150 : e.def.rank === 'elite' ? 20 : 6;
    e.kx += dx * kb; e.ky += dy * kb;
    e.squash = 1;
    this.damage(e, dmg, isCrit ? 1 : 0);
    if (isCrit) { sfx.crit(); this.shake = Math.max(this.shake, 2); } else sfx.hit();
    for (let i = 0; i < (isCrit ? 5 : 2); i++) this.addPart(e.x, e.y, rand(-150, 150), rand(-150, 150), 0.3, isCrit ? 5 : 3.5, isCrit ? '#fff27a' : '#ffffff', 0, 0);
  }

  damage(e: Enemy, dmg: number, kind: 0 | 1 | 2 | 3) {
    if (!e.alive) return;
    e.hp -= dmg;
    e.flash = 0.09;
    if (this.texts.active.length < 120) {
      const t = this.texts.obtain();
      t.x = e.x + rand(-12, 12); t.y = e.y - e.r - 4; t.vy = kind === 1 ? -110 : -80; t.t = kind === 1 ? 0.9 : 0.7;
      t.text = fmtNum(dmg) + (kind === 1 ? '!' : ''); t.kind = kind;
    }
    if (e === this.boss) this.run.bossHpPct = Math.max(0, e.hp / e.maxHp);
    if (e.hp <= 0) this.kill(e);
  }

  kill(e: Enemy) {
    e.alive = false;
    const run = this.run;
    run.kills++;
    const rank = e.def.rank;
    const nXp = rank === 'boss' ? 16 : rank === 'elite' ? 10 : 2;
    const xpEach = (e.def.xp * (1 + 0.12 * this.row)) / nXp;
    const gold = e.def.gold * (1 + 0.15 * (run.ch.id - 1)) * run.bonus.goldMul;
    const nCoins = rank === 'boss' ? 20 : rank === 'elite' ? 10 : randInt(1, 3);
    for (let i = 0; i < nXp + nCoins; i++) {
      const c = this.pickups.obtain();
      const a = rand(0, TAU), s = rand(80, 240);
      c.x = e.x; c.y = e.y; c.vx = Math.cos(a) * s; c.vy = Math.sin(a) * s;
      c.xp = i < nXp; c.v = c.xp ? xpEach : gold / nCoins; c.magnet = false; c.t = 0;
    }
    sfx.kill();
    this.addPart(e.x, e.y, 0, 0, 0.3, e.r * 1.6, 'rgba(255,255,255,0.9)', 2, 0);
    for (let i = 0; i < 12; i++) this.addPart(e.x, e.y, rand(-280, 280), rand(-320, 160), rand(0.4, 0.7), rand(4, 8), i % 3 ? e.def.color : '#ffffff', i % 4 === 0 ? 1 : 0, 600);
    const ls = run.L('lifesteal');
    if (ls) for (const p of this.pos) this.healMember(p.m, p.m.maxHp * 0.015 * ls, p.x, p.y, true);
    if (rank === 'elite') { run.eliteKills++; this.freeze = 0.12; this.shake = 12; vibrate(50); }
    if (rank === 'boss') {
      run.bossKills++; this.freeze = 0.35; this.shake = 22; vibrate([80, 40, 120]);
      run.bossHpPct = 0;
      for (let i = 0; i < 4; i++) setTimeout(() => sfx.explode(), i * 120);
      for (const o of this.enemies) if (o.alive && o !== e) this.kill(o);
      // 迭代中不能清空物件池，標記過期，下一幀自然移除
      for (const b of this.bullets.active) if (b.enemy) b.life = 0;
    } else if (rank === 'normal') this.freeze = Math.max(this.freeze, 0.02);
  }

  healMember(m: Member, n: number, x: number, y: number, quiet = false) {
    if (m.down) return;
    const before = m.hp;
    m.hp = Math.min(m.maxHp, m.hp + n);
    const d = m.hp - before;
    if (d >= 1 && !quiet) {
      const t = this.texts.obtain();
      t.x = x; t.y = y - 30; t.vy = -60; t.t = 0.7; t.text = '+' + fmtNum(d); t.kind = 3;
    }
  }

  hurtMember(p: Pos, dmg: number, src: string) {
    const m = p.m;
    if (m.invuln > 0 || this.state !== 'play' || m.down) return;
    const d = dmg * (1 - this.run.dmgReduce);
    m.hp -= d;
    m.invuln = 0.6; m.flash = 0.2;
    this.hurtBy[src] = (this.hurtBy[src] ?? 0) + Math.round(d);
    const leader = m === this.run.leader;
    this.shake = Math.max(this.shake, leader ? 8 : 4);
    if (leader) { this.hurtFlash = 0.3; this.freeze = 0.05; vibrate(40); }
    sfx.hurt();
    const t = this.texts.obtain();
    t.x = p.x; t.y = p.y - 26; t.vy = -70; t.t = 0.7; t.text = '-' + fmtNum(d); t.kind = 2;
    if (m.hp <= 0) {
      m.hp = 0; m.down = true;
      this.puff(p.x, p.y, PARTNERS[m.pid].color, 18);
      this.addPart(p.x, p.y, 0, 0, 0.5, 50, 'rgba(255,255,255,0.8)', 2, 0);
      if (leader) {
        this.state = 'dead';
        this.input.reset();
        track('death', { chapter: this.run.ch.id, row: this.row, kind: this.kind, bossHp: this.run.bossHpPct, level: this.run.level, team: this.run.team.length, by: src, hurtBy: this.hurtBy });
        setTimeout(() => this.hooks.died(!this.run.reviveUsed), 650);
      } else {
        this.banner = { text: `${PARTNERS[m.pid].name} 倒下了`, sub: '營火可以救回來', t: 1.2, color: '#ffb0b0' };
        this.layout();
      }
    }
  }

  revive() {
    const run = this.run;
    run.reviveUsed = true;
    run.leader.down = false; run.leader.hp = run.leader.maxHp;
    for (const m of run.team) if (m.down) { m.down = false; m.hp = m.maxHp * 0.5; }
    for (const m of run.team) m.invuln = 2.5;
    for (let i = this.bullets.active.length - 1; i >= 0; i--) if (this.bullets.active[i].enemy) this.bullets.release(i);
    for (const e of this.enemies) {
      const a = Math.atan2(e.y - this.head.y, e.x - this.head.x);
      e.kx += Math.cos(a) * 600; e.ky += Math.sin(a) * 600;
    }
    this.layout();
    this.addPart(this.head.x, this.head.y, 0, 0, 0.5, 180, 'rgba(255,240,150,0.9)', 2, 0);
    this.state = 'play';
    sfx.levelup();
    track('revive', { row: this.row });
  }

  // ---------------- 經驗 / 拾取 / 波次 ----------------
  gainXp(n: number) {
    const run = this.run;
    run.xp += n;
    while (run.xp >= xpNeed(run.level)) { run.xp -= xpNeed(run.level); run.level++; this.pendingLevels++; }
  }

  openPick() {
    this.state = 'pick';
    this.input.reset();
    sfx.levelup();
    this.addPart(this.head.x, this.head.y, 0, 0, 0.5, 120, 'rgba(120,220,255,0.8)', 2, 0);
    this.hooks.levelUp();
  }

  /** UI 選完卡片後呼叫 */
  afterPick(isCombo: boolean, name: string) {
    this.pendingLevels--;
    if (isCombo) {
      this.evoFlash = 1;
      this.banner = { text: name.replace('合體・', ''), sub: '合體技發動！', t: 1.8, color: '#ffd23f' };
      sfx.evo(); vibrate([40, 30, 80]); this.shake = 8;
      for (let i = 0; i < 40; i++) this.addPart(this.head.x, this.head.y, rand(-400, 400), rand(-400, 400), 0.8, rand(4, 9), i % 2 ? '#ffd23f' : '#ffffff', 1, 0);
    } else sfx.pick();
    this.layout();
    for (const m of this.run.team) m.invuln = Math.max(m.invuln, 0.5);
    this.state = 'play';
  }

  updatePickups(dt: number) {
    const arr = this.pickups.active;
    const R = this.run.pickupR;
    for (let i = arr.length - 1; i >= 0; i--) {
      const c = arr[i];
      c.t += dt;
      let near: Pos | undefined, nd = Infinity;
      for (const p of this.pos) { const d = dist2(c.x, c.y, p.x, p.y); if (d < nd) { nd = d; near = p; } }
      if (!near) break;
      if ((this.clearT >= 0 && c.t > 0.3) || nd < R * R) c.magnet = true;
      if (c.magnet) {
        const d = Math.sqrt(nd) || 1;
        const s = 520 + c.t * 900;
        c.vx += ((near.x - c.x) / d * s - c.vx) * Math.min(1, dt * 8);
        c.vy += ((near.y - c.y) / d * s - c.vy) * Math.min(1, dt * 8);
      } else {
        const damp = Math.min(1, dt * 5);
        c.vx -= c.vx * damp; c.vy -= c.vy * damp;
      }
      c.x += c.vx * dt; c.y += c.vy * dt;
      c.x = clamp(c.x, RX0 + 6, RX1 - 6); c.y = clamp(c.y, RY0 + 6, RY1 - 6);
      if (nd < 22 * 22) {
        if (c.xp) { this.gainXp(c.v); sfx.pick(); } else { this.run.gold += c.v; sfx.coin(); }
        this.addPart(c.x, c.y, rand(-40, 40), rand(-80, -30), 0.3, 4, c.xp ? '#7fdcff' : '#ffe066', 1, 0);
        this.pickups.release(i);
      }
    }
  }

  checkWaves(dt: number) {
    this.waveT += dt;
    const alive = this.enemies.filter((e) => e.alive).length;
    if (this.clearT >= 0) {
      this.clearT += dt;
      if (this.clearT > 1.4 && this.state === 'play' && this.pendingLevels === 0) this.finish();
      return;
    }
    const more = this.waveIdx < this.waves.length - 1;
    if (more && (alive <= 1 || this.waveT > 14)) { this.nextWave(); return; }
    if (!more && alive === 0) {
      this.clearT = 0;
      sfx.door();
      for (const c of this.pickups.active) c.t = 0;
      this.banner = { text: this.kind === 'boss' ? '章節通關！' : '戰鬥勝利！', sub: '', t: 1.4, color: '#5ce07a' };
    }
  }

  finish() {
    if (this.state === 'end') return;
    this.state = 'end';
    const run = this.run;
    run.battles++;
    track('node_clear', { chapter: run.ch.id, row: this.row, kind: this.kind, team: run.team.length, hp: Math.round((run.leader.hp / run.leader.maxHp) * 100) });
    if (this.kind === 'boss') sfx.win();
    this.hooks.cleared();
  }

  // ---------------- 自動測試機器人（?bot=1）----------------
  botMove(): { x: number; y: number } {
    const h = this.head;
    let dx = 0, dy = 0;
    for (const b of this.bullets.active) {
      if (!b.enemy) continue;
      for (const p of this.pos.slice(0, 3)) {
        const d2v = dist2(b.x, b.y, p.x, p.y);
        if (d2v > 120 * 120 || (p.x - b.x) * b.vx + (p.y - b.y) * b.vy <= 0) continue;
        const d = Math.sqrt(d2v) || 1;
        dx += ((h.x - b.x) / d) * (120 - d); dy += ((h.y - b.y) / d) * (120 - d);
      }
    }
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d2v = dist2(e.x, e.y, h.x, h.y);
      const danger = (e.def.ai === 'dasher' || e.def.rank === 'boss') && e.state >= 1 ? 240 : e.r + 110;
      if (d2v < danger * danger) { const d = Math.sqrt(d2v) || 1; dx += ((h.x - e.x) / d) * (danger - d) * 1.6; dy += ((h.y - e.y) / d) * (danger - d) * 1.6; }
    }
    if (Math.hypot(dx, dy) > 20) return { x: dx, y: dy };
    let best: Pickup | null = null, bd = 260 * 260;
    for (const c of this.pickups.active) { const d = dist2(c.x, c.y, h.x, h.y); if (d < bd) { bd = d; best = c; } }
    if (best) return { x: best.x - h.x, y: best.y - h.y };
    const cx = VW / 2, cy = (RY0 + RY1) / 2;
    const a = Math.atan2(h.y - cy, h.x - cx) + 0.9;
    return { x: cx + Math.cos(a) * 220 - h.x, y: cy + Math.sin(a) * 300 - h.y };
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
    const ch = this.run.ch;
    const tile = getImage(`tile_ch${ch.id}`);
    const c = document.createElement('canvas');
    const s = 60;
    c.width = c.height = tile ? 240 : s * 2;
    const g = c.getContext('2d')!;
    if (tile) g.drawImage(tile, 0, 0, 240, 240);
    else {
      g.fillStyle = ch.bg[0]; g.fillRect(0, 0, s * 2, s * 2);
      g.fillStyle = ch.bg[1]; g.fillRect(s, 0, s, s); g.fillRect(0, s, s, s);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(rand(0, s * 2), rand(0, s * 2), rand(1.5, 3), 0, TAU); g.fill(); }
    }
    this.floor = this.ctx.createPattern(c, 'repeat');
  }

  // ================= 繪製 =================
  render() {
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = this.run.ch.wall;
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const sx = this.shake ? rand(-this.shake, this.shake) : 0;
    const sy = this.shake ? rand(-this.shake, this.shake) : 0;
    g.setTransform(this.scale, 0, 0, this.scale, this.offX + sx * this.scale, this.offY + sy * this.scale);
    this.drawArena(g);
    this.drawPickups(g);
    this.drawSpawnMarks(g);
    this.drawEntities(g);
    this.drawBullets(g);
    this.drawFx(g);
    g.setTransform(this.scale, 0, 0, this.scale, this.offX, this.offY);
    this.drawHud(g);
    this.drawOverlay(g);
    this.drawJoystick(g);
    if (this.tutMove && this.state === 'play') this.drawTutorial(g);
  }

  drawTutorial(g: CanvasRenderingContext2D) {
    const y = 760;
    g.fillStyle = 'rgba(20,30,45,0.78)';
    roundRect(g, 40, y - 70, VW - 80, 150, 22); g.fill();
    const hx = VW / 2 + Math.sin(this.time * 2.5) * 90;
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 4; g.setLineDash([8, 8]);
    g.beginPath(); g.moveTo(VW / 2 - 100, y - 10); g.lineTo(VW / 2 + 100, y - 10); g.stroke(); g.setLineDash([]);
    g.font = '44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('👆', hx, y - 18);
    g.fillStyle = '#fff'; g.font = '900 22px system-ui,sans-serif';
    g.fillText('按住任意處拖曳，帶隊伍轉向', VW / 2, y + 36);
    g.font = '700 15px system-ui,sans-serif'; g.fillStyle = '#ffe066';
    g.fillText(this.stopOnRelease ? '放開手指隊伍會停下・夥伴自動攻擊' : '放開手指隊伍會繼續前進・夥伴自動攻擊', VW / 2, y + 62);
  }

  drawArena(g: CanvasRenderingContext2D) {
    g.fillStyle = this.floor ?? this.run.ch.bg[0];
    g.fillRect(RX0, RY0, RX1 - RX0, RY1 - RY0);
    const grd = g.createLinearGradient(0, RY0, 0, RY0 + 40);
    grd.addColorStop(0, 'rgba(0,0,0,0.2)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(RX0, RY0, RX1 - RX0, 40);
    g.strokeStyle = 'rgba(90,60,35,0.55)'; g.lineWidth = 6;
    roundRect(g, RX0 - 3, RY0 - 3, RX1 - RX0 + 6, RY1 - RY0 + 6, 14); g.stroke();
    g.fillStyle = 'rgba(120,85,50,0.6)';
    for (let x = RX0 + 20; x < RX1; x += 44) { g.fillRect(x, RY0 - 8, 6, 10); g.fillRect(x, RY1 - 2, 6, 10); }
  }

  drawPickups(g: CanvasRenderingContext2D) {
    const coin = sprite('fx_coin', 14, '', '#ffd23f', '#b8860b');
    for (const c of this.pickups.active) {
      if (c.xp) {
        g.fillStyle = '#4fc3ff';
        g.beginPath(); g.moveTo(c.x, c.y - 7); g.lineTo(c.x + 5, c.y); g.lineTo(c.x, c.y + 7); g.lineTo(c.x - 5, c.y); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(c.x - 1.5, c.y - 4, 3, 3);
      } else {
        const w = Math.abs(Math.cos(this.time * 8 + c.x)) * 14 + 2;
        g.drawImage(coin, c.x - w / 2, c.y - 7, w, 14);
      }
    }
  }

  drawSpawnMarks(g: CanvasRenderingContext2D) {
    for (const e of this.enemies) {
      if (e.spawn <= 0) continue;
      const k = 1 - e.spawn / 0.7;
      g.strokeStyle = `rgba(255,70,70,${0.4 + 0.4 * Math.sin(this.time * 20)})`;
      g.lineWidth = 3;
      g.beginPath(); g.arc(e.x, e.y, e.r * (1.6 - k * 0.6), 0, TAU); g.stroke();
    }
  }

  drawEntities(g: CanvasRenderingContext2D) {
    if (this.pos.length > 1) {
      // 陣形底圈
      const h = this.head, R = this.pos.length > 7 ? 112 : 72;
      g.fillStyle = 'rgba(255,255,255,0.10)'; g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 2;
      g.beginPath(); g.ellipse(h.x, h.y + 8, R, R * 0.8, 0, 0, TAU); g.fill(); g.stroke();
    }
    const list: { y: number; f: () => void }[] = [];
    for (const e of this.enemies) if (e.alive && e.spawn <= 0.35) list.push({ y: e.y, f: () => this.drawEnemy(g, e) });
    this.pos.forEach((p, i) => list.push({ y: p.y, f: () => this.drawMember(g, p, i) }));
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.f();
    const h = this.head;
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.save(); g.translate(h.x + Math.cos(h.ang) * 34, h.y + Math.sin(h.ang) * 34); g.rotate(h.ang);
    g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, -6); g.lineTo(-5, 6); g.closePath(); g.fill(); g.restore();
  }

  drawShadow(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.beginPath(); g.ellipse(x, y + r * 0.85, r * 0.9, r * 0.32, 0, 0, TAU); g.fill();
  }

  drawMember(g: CanvasRenderingContext2D, p: Pos, i: number) {
    const m = p.m;
    const def = PARTNERS[m.pid];
    const leader = i === 0;
    const size = leader ? 46 : 38;
    const aw = awakenTier(this.run.bonus.plv?.[m.pid] ?? 1);
    const rc = def.rarity >= 0 ? RARITIES[def.rarity].color : '#ffd23f';
    // 稀有度底圈 + 覺醒光環
    g.save();
    g.globalAlpha = 0.55;
    g.strokeStyle = rc; g.lineWidth = aw ? 4 : 2.5;
    g.beginPath(); g.ellipse(p.x, p.y + size * 0.34, size * 0.5, size * 0.18, 0, 0, TAU); g.stroke();
    if (aw) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 5 + i);
      const grd = g.createRadialGradient(p.x, p.y, 4, p.x, p.y, size * (0.75 + pulse * 0.1));
      grd.addColorStop(0, rc + '00'); grd.addColorStop(0.6, rc + '55'); grd.addColorStop(1, rc + '00');
      g.globalAlpha = 0.9; g.fillStyle = grd;
      g.beginPath(); g.arc(p.x, p.y, size * 0.85, 0, TAU); g.fill();
    }
    g.restore();
    if (aw === 2 && Math.random() < 0.25) this.addPart(p.x + rand(-16, 16), p.y + rand(-16, 10), 0, rand(-50, -20), 0.6, 3.5, rc, 1, 0);
    this.drawShadow(g, p.x, p.y, size * 0.4);
    const blink = m.invuln > 0 && m.invuln < 2 && Math.floor(this.time * 20) % 2 === 0;
    const bob = Math.abs(Math.sin(this.time * 12 + i * 0.9)) * 4;
    const baseKey = m.pid === 'shiba' ? 'hero' : `partner_${m.pid}`;
    const key = aw && hasImage(`${baseKey}_awaken`) ? `${baseKey}_awaken` : baseKey;
    const flip = Math.cos(this.head.ang) < 0 ? -1 : 1;
    g.save();
    g.translate(p.x, p.y - bob);
    g.scale(flip, 1);
    if (!blink) g.drawImage(sprite(key, size, def.icon, def.color), -size / 2, -size / 2, size, size);
    if (m.flash > 0) { g.globalAlpha = 0.7; g.drawImage(whiteSprite(key, size, def.icon, def.color), -size / 2, -size / 2, size, size); }
    g.restore();
    if (leader || aw === 2) { g.font = leader ? '18px sans-serif' : '13px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(leader ? '👑' : '✨', p.x, p.y - size / 2 - 6 - bob); }
    const w = leader ? 46 : 36, bx = p.x - w / 2, by = p.y + size / 2 - 2;
    g.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(g, bx - 1, by - 1, w + 2, 7, 3); g.fill();
    g.fillStyle = m.hp / m.maxHp < 0.3 ? '#ff5a5a' : '#59d65f';
    roundRect(g, bx, by, w * Math.max(0, m.hp / m.maxHp), 5, 2); g.fill();
    g.fillStyle = '#ffd23f';
    for (let s = 0; s < m.star; s++) { g.beginPath(); starPath(g, p.x - (m.star - 1) * 4 + s * 8, by + 11, 4, 1.8, -Math.PI / 2); g.fill(); }
  }

  drawEnemy(g: CanvasRenderingContext2D, e: Enemy) {
    const def = e.def;
    const lift = def.flying ? 18 + Math.sin(this.time * 6 + e.id) * 4 : e.hop;
    this.drawShadow(g, e.x, e.y, e.r);
    if ((def.ai === 'dasher' || def.ai === 'raccoon' || def.ai === 'boar') && e.state === 1) {
      g.save();
      g.beginPath(); g.rect(RX0, RY0, RX1 - RX0, RY1 - RY0); g.clip();
      g.strokeStyle = `rgba(255,60,60,${0.35 + Math.sin(this.time * 30) * 0.2})`;
      g.lineWidth = e.r * 1.4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(e.x + Math.cos(e.ang) * 700, e.y + Math.sin(e.ang) * 700); g.stroke();
      g.restore();
    }
    const sp = e.spawn > 0 ? 1 - e.spawn / 0.35 : 1;
    const sq = e.squash * 0.18;
    const size = e.r * 2.3;
    const y = e.y - lift;
    const tg = this.pos[0];
    g.save();
    g.globalAlpha = Math.max(0.1, sp);
    g.translate(e.x, y);
    g.scale((1 + sq) * sp * (tg && tg.x < e.x ? -1 : 1), (1 - sq) * sp);
    const key = `enemy_${def.id}`;
    g.drawImage(sprite(key, size, def.icon, def.color), -size / 2, -size / 2, size, size);
    if (e.flash > 0) { g.globalAlpha = 0.85; g.drawImage(whiteSprite(key, size, def.icon, def.color), -size / 2, -size / 2, size, size); }
    g.restore();
    if (e.slowT > 0) { g.strokeStyle = 'rgba(140,220,255,0.8)'; g.lineWidth = 3; g.beginPath(); g.arc(e.x, y, e.r + 4, 0, TAU); g.stroke(); }
    if (def.rank !== 'boss' && e.hp < e.maxHp && e.spawn <= 0) {
      const w = def.rank === 'elite' ? 90 : 40, h = def.rank === 'elite' ? 8 : 5;
      const bx = e.x - w / 2, by = y - e.r - 14;
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(bx - 1, by - 1, w + 2, h + 2);
      g.fillStyle = '#ff4d4d'; g.fillRect(bx, by, w * Math.max(0, e.hp / e.maxHp), h);
    }
  }

  drawBullets(g: CanvasRenderingContext2D) {
    const star = getImage('fx_bullet');
    g.save();
    for (const b of this.bullets.active) {
      if (!b.enemy) continue;
      g.fillStyle = 'rgba(60,0,20,0.6)';
      g.beginPath(); g.arc(b.x, b.y, b.r + 2.5, 0, TAU); g.fill();
      g.fillStyle = b.color;
      g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(b.x - b.r * 0.25, b.y - b.r * 0.25, b.r * 0.42, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = 'lighter';
    for (const b of this.bullets.active) {
      if (b.enemy) continue;
      const a = Math.atan2(b.vy, b.vx);
      const tail = b.kind === 2 ? 14 : 24;
      g.strokeStyle = b.color; g.globalAlpha = 0.4; g.lineWidth = b.r * 1.2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - Math.cos(a) * tail, b.y - Math.sin(a) * tail); g.stroke();
      g.globalAlpha = 1;
      if (b.kind === 0) {
        if (star) { g.save(); g.translate(b.x, b.y); g.rotate(b.spin); g.drawImage(star, -b.r * 1.6, -b.r * 1.6, b.r * 3.2, b.r * 3.2); g.restore(); }
        else { g.fillStyle = b.color; g.beginPath(); starPath(g, b.x, b.y, b.r * 1.5, b.r * 0.7, b.spin); g.fill(); }
      } else if (b.kind === 4) {
        g.save(); g.translate(b.x, b.y); g.rotate(b.spin * 1.5);
        g.fillStyle = '#5c9a4c'; g.beginPath(); g.ellipse(0, 0, b.r, b.r * 0.8, 0, 0, TAU); g.fill();
        g.strokeStyle = '#c8f0a8'; g.lineWidth = 2; g.beginPath(); g.moveTo(-b.r * 0.6, 0); g.lineTo(b.r * 0.6, 0); g.moveTo(0, -b.r * 0.5); g.lineTo(0, b.r * 0.5); g.stroke();
        g.restore(); continue;
      } else if (b.kind === 5) {
        g.save(); g.translate(b.x, b.y); g.rotate(a);
        g.fillStyle = b.color; g.beginPath(); g.ellipse(0, 0, b.r * 2, b.r * 0.7, 0, 0, TAU); g.fill();
        g.restore(); continue;
      } else if (b.kind === 6) {
        g.save(); g.translate(b.x, b.y); g.rotate(a);
        g.strokeStyle = 'rgba(120,200,255,0.9)'; g.lineWidth = 8; g.lineCap = 'round';
        g.beginPath(); g.arc(-b.r * 0.4, 0, b.r, -1.1, 1.1); g.stroke();
        g.strokeStyle = '#ffffff'; g.lineWidth = 3;
        g.beginPath(); g.arc(-b.r * 0.3, 0, b.r * 0.85, -0.9, 0.9); g.stroke();
        g.restore(); continue;
      } else if (b.kind === 2) {
        g.save(); g.translate(b.x, b.y); g.rotate(a);
        g.fillStyle = b.color; g.beginPath(); g.moveTo(b.r * 2.2, 0); g.lineTo(-b.r, -b.r); g.lineTo(-b.r, b.r); g.closePath(); g.fill();
        g.restore();
      } else {
        g.fillStyle = b.color; g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.fill();
      }
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(b.x, b.y, b.r * 0.4, 0, TAU); g.fill();
    }
    for (const a of this.arcs) {
      g.globalAlpha = Math.min(1, a.t / 0.18);
      g.strokeStyle = a.color; g.lineWidth = 7;
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
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    for (const t of this.texts.active) {
      const crit = t.kind === 1;
      const life = crit ? 0.9 : 0.7;
      const age = life - t.t;
      const pop = crit ? 1 + Math.max(0, 0.6 - age * 4) : 1 + Math.max(0, 0.3 - age * 3);
      const size = (crit ? 28 : t.kind === 2 ? 20 : 16) * pop;
      g.globalAlpha = Math.min(1, t.t * 3);
      g.font = `900 ${size}px system-ui,sans-serif`;
      g.strokeStyle = 'rgba(40,20,10,0.85)'; g.lineWidth = crit ? 6 : 4;
      g.strokeText(t.text, t.x, t.y);
      g.fillStyle = crit ? '#ffd23f' : t.kind === 2 ? '#ff5a5a' : t.kind === 3 ? (t.text[0] === '+' ? '#6dff8a' : '#ffb26b') : '#ffffff';
      g.fillText(t.text, t.x, t.y);
    }
    g.globalAlpha = 1;
  }

  drawHud(g: CanvasRenderingContext2D) {
    const run = this.run;
    g.fillStyle = 'rgba(20,30,45,0.85)';
    g.fillRect(0, 0, VW, 92);
    const need = xpNeed(run.level);
    g.fillStyle = 'rgba(255,255,255,0.15)'; roundRect(g, 74, 22, 300, 16, 8); g.fill();
    g.fillStyle = '#58c7ff'; roundRect(g, 74, 22, 300 * Math.min(1, run.xp / need), 16, 8); g.fill();
    g.fillStyle = '#2b7de0'; g.beginPath(); g.arc(50, 30, 24, 0, TAU); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#fff'; g.font = '900 13px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Lv', 50, 20); g.font = '900 20px system-ui,sans-serif'; g.fillText(String(run.level), 50, 37);
    g.textAlign = 'left'; g.font = '800 16px system-ui,sans-serif';
    g.fillStyle = this.kind === 'boss' ? '#ff7a7a' : this.kind === 'elite' ? '#ffc04d' : '#ffffff';
    const wave = this.waves.length > 1 ? `・第 ${Math.min(this.waveIdx + 1, this.waves.length)}/${this.waves.length} 波` : '';
    g.fillText(`第 ${this.row + 1}/${MAP_ROWS} 層${wave}`, 74, 62);
    g.textAlign = 'right'; g.fillStyle = '#ffe066';
    g.fillText(`🪙 ${fmtNum(run.gold)}`, 455, 62);
    if (location.search.includes('fps')) { g.fillStyle = '#9f9'; g.font = '700 12px monospace'; g.fillText(`${this.fps}fps b${this.bullets.active.length} p${this.parts.active.length}`, 530, 84); }
    if (this.boss && this.boss.alive) {
      const w = 440, x = (VW - w) / 2, y = 104;
      g.fillStyle = 'rgba(0,0,0,0.6)'; roundRect(g, x - 3, y - 3, w + 6, 22, 8); g.fill();
      g.fillStyle = '#ff4d4d'; roundRect(g, x, y, w * Math.max(0, this.boss.hp / this.boss.maxHp), 16, 6); g.fill();
      g.fillStyle = '#fff'; g.font = '800 13px system-ui,sans-serif'; g.textAlign = 'center';
      g.fillText(`${this.boss.def.name}  ${fmtNum(Math.max(0, this.boss.hp))}`, VW / 2, y + 9);
    }
  }

  drawOverlay(g: CanvasRenderingContext2D) {
    const L = this.run.leader;
    const low = L.hp / L.maxHp < 0.25;
    if (this.hurtFlash > 0 || low) {
      const a = Math.max(this.hurtFlash, low ? 0.18 + Math.sin(this.time * 6) * 0.08 : 0);
      const grd = g.createRadialGradient(VW / 2, VH / 2, VH * 0.3, VW / 2, VH / 2, VH * 0.7);
      grd.addColorStop(0, 'rgba(255,0,0,0)'); grd.addColorStop(1, `rgba(255,0,40,${a})`);
      g.fillStyle = grd; g.fillRect(0, 0, VW, VH);
    }
    if (this.evoFlash > 0) { g.fillStyle = `rgba(255,240,180,${this.evoFlash * 0.5})`; g.fillRect(0, 0, VW, VH); }
    if (this.banner) {
      const b = this.banner;
      g.save();
      g.globalAlpha = Math.max(0, Math.min(1, b.t * 3));
      g.translate(VW / 2, 420);
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(-VW / 2, -44, VW, b.sub ? 96 : 72);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '900 40px system-ui,sans-serif'; g.lineWidth = 8; g.strokeStyle = '#2a1a10';
      g.strokeText(b.text, 0, -8); g.fillStyle = b.color; g.fillText(b.text, 0, -8);
      if (b.sub) { g.font = '800 20px system-ui,sans-serif'; g.fillStyle = '#fff'; g.fillText(b.sub, 0, 30); }
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
function zig(x1: number, y1: number, x2: number, y2: number): number[] {
  const pts = [x1, y1];
  for (let i = 1; i < 5; i++) { const t = i / 5; pts.push(x1 + (x2 - x1) * t + rand(-12, 12), y1 + (y2 - y1) * t + rand(-12, 12)); }
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

function segDist2(x1: number, y1: number, x2: number, y2: number, px: number, py: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const l = dx * dx + dy * dy || 1;
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / l, 0, 1);
  return dist2(px, py, x1 + dx * t, y1 + dy * t);
}
