import Phaser from 'phaser';
import {
  BOSS_SPAWNS,
  DROPS,
  ELITE_TIMES,
  ENEMIES,
  EVOLUTIONS,
  EnemyDef,
  EnemyKind,
  INTENT,
  PASSIVES,
  PASSIVE_POOL,
  PLAYER,
  PassiveId,
  RUN,
  STARTER_WEAPON,
  SWARMS,
  WAVES,
  WEAPONS,
  WEAPON_POOL,
  WeaponId,
  WeaponStats,
  enemyHpMult,
  xpToNext,
} from '../config/balance';
import { T } from '../i18n/zh-TW';
import { COLORS, H, W, Z, textStyle } from '../game/layout';
import { SpatialGrid } from '../game/SpatialGrid';
import { TEX } from '../game/textures';
import { loadSave, writeSave } from '../game/storage';
import type { UIScene } from './UIScene';

// ---------- 型別 ----------
interface Enemy {
  active: boolean;
  def: EnemyDef;
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  radius: number;
  xp: number;
  kx: number;
  ky: number;
  flash: number;
  slow: number;
  lastDrone: number;
  // Boss 專用
  bossState: 'chase' | 'tele' | 'dash';
  bossT: number;
  ringT: number;
  aimX: number;
  aimY: number;
  final: boolean;
  title: string;
}

interface Projectile {
  active: boolean;
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  bounces: number;
  last: Enemy | null;
}

interface Bullet {
  active: boolean;
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
}

type PickupKind = 'gem' | 'heal' | 'magnet' | 'chest' | 'credit';
interface Pickup {
  active: boolean;
  kind: PickupKind;
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  value: number;
  flying: boolean;
  speed: number;
}

interface Slash {
  g: Phaser.GameObjects.Graphics;
  life: number;
  max: number;
}

interface DmgText {
  t: Phaser.GameObjects.Text;
  life: number;
}

export interface WeaponInst {
  id: WeaponId;
  level: number;
  timer: number;
  stats: WeaponStats;
  angle: number; // 無人機角度
}

export type Choice =
  | { kind: 'weapon'; id: WeaponId }
  | { kind: 'passive'; id: PassiveId }
  | { kind: 'heal' }
  | { kind: 'credits' };

export function choiceKey(c: Choice): string {
  return c.kind === 'weapon' || c.kind === 'passive' ? `${c.kind}:${c.id}` : c.kind;
}

export interface RunResult {
  victory: boolean;
  time: number;
  kills: number;
  level: number;
  credits: number;
  newBest: boolean;
}

const tmp: Enemy[] = [];
const tmp2: Enemy[] = [];

export class GameScene extends Phaser.Scene {
  ui!: UIScene;

  // 玩家
  px = 0;
  py = 0;
  hp = PLAYER.maxHp;
  maxHp = PLAYER.maxHp;
  faceX = 0;
  faceY = -1;
  invuln = 0;
  hurtFlash = 0;
  playerImg!: Phaser.GameObjects.Image;
  facingImg!: Phaser.GameObjects.Image;

  // 衍生屬性
  might = 1;
  cdMult = 1;
  armor = 0;
  pickupR = PLAYER.pickupRadius;

  // 局內狀態
  t = 0;
  kills = 0;
  level = 1;
  xp = 0;
  xpNext = xpToNext(1);
  credits = 0;
  pendingLevels = 0;
  intent = 0;
  iaiCount = 0;
  lastKillT = -99;
  iaiFreeze = 0;
  revivesLeft = RUN.revives;
  rerolls = RUN.rerolls;
  banishes = RUN.banishes;
  locks = RUN.locks;
  banished = new Set<string>();
  locked: Choice | null = null;
  modal = false;
  ended = false;
  invincible = false;
  finalSpawned = false;
  finalKilled = false;
  dawnAnnounced = false;
  inventoryVersion = 0;

  weapons: WeaponInst[] = [];
  passives = new Map<PassiveId, number>();

  // 物件池
  enemies: Enemy[] = [];
  activeEnemies: Enemy[] = [];
  bosses: Enemy[] = [];
  projectiles: Projectile[] = [];
  bullets: Bullet[] = [];
  pickups: Pickup[] = [];
  gemCount = 0;
  slashes: Slash[] = [];
  dmgTexts: DmgText[] = [];
  droneImgs: Phaser.GameObjects.Image[] = [];
  fieldImg!: Phaser.GameObjects.Image;
  grid = new SpatialGrid<Enemy>(64);

  // 生成
  spawnAcc = 0;
  nextElite = 0;
  nextBoss = 0;
  nextSwarm = 0;

  bg!: Phaser.GameObjects.Graphics;
  fx!: Phaser.GameObjects.Graphics;
  hpBar!: Phaser.GameObjects.Graphics;
  sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  /** 由 UIScene 寫入的搖桿方向（長度 0～1） */
  joy = { x: 0, y: 0 };

  private onVisibility = () => {
    if (document.hidden) this.pauseByUser();
  };

  constructor() {
    super('Game');
  }

  // ---------- 初始化 ----------
  create() {
    this.resetState();
    const cam = this.cameras.main;
    cam.setZoom(Z);
    cam.setBackgroundColor(COLORS.bg);

    this.bg = this.add.graphics().setDepth(-10);
    this.fx = this.add.graphics().setDepth(3);
    this.hpBar = this.add.graphics().setDepth(11);
    this.fieldImg = this.add.image(0, 0, 'ring').setDepth(4).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
    this.playerImg = this.add.image(0, 0, 'player').setScale(1 / TEX).setDepth(10);
    this.facingImg = this.add.image(0, 0, 'facing').setScale(1 / TEX).setDepth(10).setAlpha(0.8);
    this.sparks = this.add.particles(0, 0, 'spark', {
      lifespan: 380,
      speed: { min: 60, max: 220 },
      scale: { start: 0.55, end: 0 },
      blendMode: 'ADD',
      emitting: false,
    });
    this.sparks.setDepth(12);

    for (let i = 0; i < 40; i++) {
      const t = this.add.text(0, 0, '', textStyle(15)).setOrigin(0.5).setDepth(20).setVisible(false);
      t.setStroke('#07060d', 4);
      this.dmgTexts.push({ t, life: 0 });
    }

    const kb = this.input.keyboard;
    this.keys = kb
      ? (kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>)
      : {};

    this.addWeapon(STARTER_WEAPON);
    this.recalc();
    this.hp = this.maxHp;

    // 第一波先在畫面外放幾隻
    for (let i = 0; i < 12; i++) this.spawnEnemy('drone');

    document.addEventListener('visibilitychange', this.onVisibility);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('visibilitychange', this.onVisibility);
    });

    this.scene.launch('UI');
    this.ui = this.scene.get('UI') as UIScene;
  }

  private resetState() {
    this.px = 0;
    this.py = 0;
    this.faceX = 0;
    this.faceY = -1;
    this.invuln = 0;
    this.hurtFlash = 0;
    this.t = 0;
    this.kills = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNext = xpToNext(1);
    this.credits = 0;
    this.pendingLevels = 0;
    this.intent = 0;
    this.iaiCount = 0;
    this.lastKillT = -99;
    this.iaiFreeze = 0;
    this.revivesLeft = RUN.revives;
    this.rerolls = RUN.rerolls;
    this.banishes = RUN.banishes;
    this.locks = RUN.locks;
    this.banished = new Set();
    this.locked = null;
    this.modal = false;
    this.ended = false;
    this.invincible = false;
    this.finalSpawned = false;
    this.finalKilled = false;
    this.dawnAnnounced = false;
    this.inventoryVersion = 0;
    this.weapons = [];
    this.passives = new Map();
    this.enemies = [];
    this.activeEnemies = [];
    this.bosses = [];
    this.projectiles = [];
    this.bullets = [];
    this.pickups = [];
    this.gemCount = 0;
    this.slashes = [];
    this.dmgTexts = [];
    this.droneImgs = [];
    this.spawnAcc = 0;
    this.nextElite = 0;
    this.nextBoss = 0;
    this.nextSwarm = 0;
    this.joy = { x: 0, y: 0 };
  }

  // ---------- 屬性 ----------
  passiveLevel(id: PassiveId): number {
    return this.passives.get(id) ?? 0;
  }

  recalc() {
    this.might = 1 + 0.1 * this.passiveLevel('might');
    this.cdMult = 1 - 0.07 * this.passiveLevel('haste');
    this.armor = PLAYER.armor + this.passiveLevel('armor');
    const newMax = PLAYER.maxHp + 10 * this.passiveLevel('armor');
    if (newMax > this.maxHp) this.hp += newMax - this.maxHp;
    this.maxHp = newMax;
    this.pickupR = PLAYER.pickupRadius * (1 + 0.3 * this.passiveLevel('magnet'));
    this.inventoryVersion++;
  }

  computeStats(id: WeaponId, level: number): WeaponStats {
    const def = WEAPONS[id];
    const s = { ...def.base };
    for (let i = 0; i < level - 1 && i < def.levels.length; i++) {
      const d = def.levels[i].delta;
      for (const k of Object.keys(d) as (keyof WeaponStats)[]) s[k] += d[k] ?? 0;
    }
    return s;
  }

  addWeapon(id: WeaponId) {
    this.weapons.push({ id, level: 1, timer: 0.3, stats: this.computeStats(id, 1), angle: 0 });
    this.inventoryVersion++;
  }

  maxLevel(id: WeaponId): number {
    return WEAPONS[id].levels.length + 1;
  }

  // ---------- 主迴圈 ----------
  /** 除錯用：每幀模擬幾步（自動化平衡測試用） */
  simSpeed = 1;
  /** 除錯用：自動操作（自動化平衡測試用） */
  debugBot: ((g: GameScene) => void) | null = null;

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs, 50) / 1000;
    for (let i = 0; i < this.simSpeed; i++) {
      if (this.modal || this.ended) break;
      this.step(dt);
    }
  }

  private step(dt: number) {
    this.compactEnemies();
    this.updateEffects(dt);

    if (this.iaiFreeze > 0) {
      this.iaiFreeze -= dt;
      if (this.iaiFreeze <= 0) this.executeIai();
      this.render();
      return;
    }

    this.t += dt;
    this.updateTimeline(dt);
    this.debugBot?.(this);
    this.updatePlayer(dt);

    this.grid.clear();
    for (const e of this.activeEnemies) this.grid.insert(e);

    this.updateEnemies(dt);
    this.updateWeapons(dt);
    this.updateProjectiles(dt);
    this.updateBullets(dt);
    this.updatePickups(dt);
    this.updateIntent(dt);
    this.compactEnemies();
    this.render();

    if (this.ended || this.modal) return;
    if (this.t >= RUN.duration && this.finalKilled) {
      this.endRun(true);
      return;
    }
    if (this.pendingLevels > 0) this.openLevelUp();
  }

  // ---------- 時間軸 ----------
  private updateTimeline(dt: number) {
    const seg = currentWave(this.t);
    const alive = this.activeEnemies.length;
    this.spawnAcc += seg.rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (alive < RUN.maxEnemies) this.spawnEnemy(pickWeighted(seg.weights));
    }

    while (this.nextElite < ELITE_TIMES.length && this.t >= ELITE_TIMES[this.nextElite]) {
      this.nextElite++;
      this.spawnEnemy('elite');
      this.ui.banner(T.eliteWarn, '#ffc83d');
    }
    while (this.nextSwarm < SWARMS.length && this.t >= SWARMS[this.nextSwarm]) {
      this.nextSwarm++;
      this.spawnSwarm();
      this.ui.banner(T.swarmWarn, '#ff3d81');
    }
    while (this.nextBoss < BOSS_SPAWNS.length && this.t >= BOSS_SPAWNS[this.nextBoss].at) {
      const b = BOSS_SPAWNS[this.nextBoss++];
      this.spawnBoss(b.hp, b.title, b.final);
      this.ui.banner(T.bossWarn(b.title), '#ff2244', 2.6);
      if (b.final) this.finalSpawned = true;
    }
    if (!this.dawnAnnounced && this.t >= RUN.duration) {
      this.dawnAnnounced = true;
      if (!this.finalKilled) this.ui.banner(T.finalPush, '#ff2244', 2.6);
    }
  }

  private spawnPoint(margin = 40): [number, number] {
    const vx = this.px - W / 2;
    const vy = this.py - H / 2;
    if (Math.random() < 0.7) {
      return [vx + Math.random() * W, Math.random() < 0.5 ? vy - margin : vy + H + margin];
    }
    return [Math.random() < 0.5 ? vx - margin : vx + W + margin, vy + Math.random() * H];
  }

  private obtainEnemy(): Enemy {
    for (const e of this.enemies) if (!e.active && !e.img.visible) return e;
    const img = this.add.image(0, 0, 'e-drone').setScale(1 / TEX).setDepth(5).setVisible(false);
    const e: Enemy = {
      active: false,
      def: ENEMIES.drone,
      img,
      x: 0,
      y: 0,
      hp: 1,
      maxHp: 1,
      speed: 0,
      damage: 0,
      radius: 8,
      xp: 1,
      kx: 0,
      ky: 0,
      flash: 0,
      slow: 0,
      lastDrone: -99,
      bossState: 'chase',
      bossT: 0,
      ringT: 0,
      aimX: 0,
      aimY: 0,
      final: false,
      title: '',
    };
    this.enemies.push(e);
    return e;
  }

  spawnEnemy(kind: EnemyKind, at?: [number, number]): Enemy {
    const def = ENEMIES[kind];
    const e = this.obtainEnemy();
    const [x, y] = at ?? this.spawnPoint(def.radius + 30);
    const mult = kind === 'boss' ? 1 : enemyHpMult(this.t);
    e.active = true;
    e.def = def;
    e.x = x;
    e.y = y;
    e.maxHp = e.hp = def.hp * mult;
    e.speed = def.speed * (0.92 + Math.random() * 0.16);
    e.damage = def.damage * (1 + this.t / 600);
    e.radius = def.radius;
    e.xp = def.xp;
    e.kx = e.ky = 0;
    e.flash = 0;
    e.slow = 0;
    e.lastDrone = -99;
    e.bossState = 'chase';
    e.bossT = 0;
    e.ringT = 0;
    e.final = false;
    e.title = def.name;
    e.img.setTexture(`e-${kind}`).setVisible(true).setPosition(x, y).clearTint().setAlpha(1);
    e.img.setDepth(kind === 'boss' ? 7 : kind === 'elite' ? 6 : 5);
    this.activeEnemies.push(e);
    return e;
  }

  private spawnSwarm() {
    const n = 30;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.spawnEnemy('drone', [this.px + Math.cos(a) * 320, this.py + Math.sin(a) * 640]);
    }
  }

  private spawnBoss(hp: number, title: string, final: boolean) {
    const e = this.spawnEnemy('boss', [this.px, this.py - H / 2 - 80]);
    e.maxHp = e.hp = hp;
    e.final = final;
    e.title = title;
    e.speed = ENEMIES.boss.speed * (final ? 1.15 : 1);
    e.ringT = 2;
    if (final) e.img.setScale(1.25 / TEX);
    else e.img.setScale(1 / TEX);
    e.radius = ENEMIES.boss.radius * (final ? 1.25 : 1);
    this.bosses.push(e);
  }

  // ---------- 玩家 ----------
  private updatePlayer(dt: number) {
    let mx = this.joy.x;
    let my = this.joy.y;
    const k = this.keys;
    if (k.A?.isDown || k.LEFT?.isDown) mx -= 1;
    if (k.D?.isDown || k.RIGHT?.isDown) mx += 1;
    if (k.W?.isDown || k.UP?.isDown) my -= 1;
    if (k.S?.isDown || k.DOWN?.isDown) my += 1;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    if (len > 0.05) {
      const l = Math.hypot(mx, my);
      this.faceX = mx / l;
      this.faceY = my / l;
    }
    this.px += mx * PLAYER.speed * dt;
    this.py += my * PLAYER.speed * dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
  }

  private hurt(amount: number) {
    if (this.invuln > 0 || this.ended || this.modal) return;
    const dmg = Math.max(1, Math.round(amount - this.armor));
    this.invuln = PLAYER.iframes;
    this.hurtFlash = 0.15;
    this.cameras.main.shake(90, 0.004);
    if (this.invincible) return;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.hp = 0;
      this.onDeath();
    }
  }

  // ---------- 敵人 ----------
  private updateEnemies(dt: number) {
    const pr = PLAYER.radius;
    for (const e of this.activeEnemies) {
      if (!e.active) continue;
      if (e.def.kind === 'boss') {
        this.updateBoss(e, dt);
      } else {
        let dx = this.px - e.x;
        let dy = this.py - e.y;
        const d = Math.hypot(dx, dy) || 1;
        // 太遠的一般敵人移到玩家附近重新出現
        if (d > 950 && e.def.kind !== 'elite') {
          const [nx, ny] = this.spawnPoint(e.radius + 30);
          e.x = nx;
          e.y = ny;
          continue;
        }
        dx /= d;
        dy /= d;
        const sp = e.speed * (e.slow > 0 ? 0.6 : 1);
        e.x += (dx * sp + e.kx) * dt;
        e.y += (dy * sp + e.ky) * dt;
      }
      e.kx *= 0.86;
      e.ky *= 0.86;
      if (e.slow > 0) e.slow -= dt;
      if (e.flash > 0) e.flash -= dt;

      // 互相推開，避免全部疊在一起
      const near = this.grid.query(e.x, e.y, e.radius + 18, tmp);
      for (let i = 0; i < near.length; i++) {
        const o = near[i];
        if (o === e || !o.active) continue;
        const ox = e.x - o.x;
        const oy = e.y - o.y;
        const min = (e.radius + o.radius) * 0.85;
        const d2 = ox * ox + oy * oy;
        if (d2 < min * min && d2 > 0.0001) {
          const dd = Math.sqrt(d2);
          const push = ((min - dd) / dd) * (e.def.kind === 'boss' ? 0.05 : 0.35);
          e.x += ox * push;
          e.y += oy * push;
        }
      }

      const cx = this.px - e.x;
      const cy = this.py - e.y;
      const rr = e.radius + pr;
      if (cx * cx + cy * cy < rr * rr) this.hurt(e.damage);
    }
  }

  private updateBoss(e: Enemy, dt: number) {
    e.bossT += dt;
    const dx = this.px - e.x;
    const dy = this.py - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (e.bossState === 'chase') {
      const sp = e.speed * (e.slow > 0 ? 0.85 : 1) * (d > 700 ? 2.5 : 1);
      e.x += (dx / d) * sp * dt;
      e.y += (dy / d) * sp * dt;
      e.ringT -= dt;
      if (e.ringT <= 0) {
        e.ringT = e.final ? 3.6 : 5.5;
        const n = e.final ? 20 : e.maxHp > 5000 ? 16 : 12;
        const off = Math.random() * Math.PI;
        for (let i = 0; i < n; i++) {
          const a = off + (i / n) * Math.PI * 2;
          this.fireBullet(e.x, e.y, Math.cos(a) * 150, Math.sin(a) * 150, e.damage * 0.6);
        }
      }
      if (e.bossT > (e.final ? 3.5 : 4.5) && d < 600) {
        e.bossState = 'tele';
        e.bossT = 0;
        e.aimX = dx / d;
        e.aimY = dy / d;
      }
    } else if (e.bossState === 'tele') {
      if (e.bossT > 0.8) {
        e.bossState = 'dash';
        e.bossT = 0;
      }
    } else {
      e.x += e.aimX * 460 * dt;
      e.y += e.aimY * 460 * dt;
      if (e.bossT > 0.55) {
        e.bossState = 'chase';
        e.bossT = 0;
      }
    }
  }

  private compactEnemies() {
    let j = 0;
    for (let i = 0; i < this.activeEnemies.length; i++) {
      const e = this.activeEnemies[i];
      if (e.active) this.activeEnemies[j++] = e;
    }
    this.activeEnemies.length = j;
    this.bosses = this.bosses.filter((b) => b.active);
  }

  damageEnemy(e: Enemy, amount: number, kx = 0, ky = 0, fromIai = false) {
    if (!e.active) return;
    const dmg = Math.round(amount);
    e.hp -= dmg;
    e.flash = 0.08;
    if (e.def.kind !== 'boss') {
      const res = e.def.kind === 'elite' ? 0.2 : 1;
      e.kx += kx * res;
      e.ky += ky * res;
    }
    this.showDamage(e.x, e.y - e.radius, dmg);
    if (e.hp <= 0) this.killEnemy(e, fromIai);
  }

  private killEnemy(e: Enemy, fromIai: boolean) {
    e.active = false;
    e.img.setVisible(false);
    this.kills++;
    this.sparks.setParticleTint(e.def.color);
    const kind = e.def.kind;
    this.sparks.explode(kind === 'boss' ? 40 : kind === 'elite' ? 18 : 5, e.x, e.y);
    if (!fromIai) {
      this.intent += kind === 'elite' ? INTENT.eliteBonus : kind === 'boss' ? 0 : 1;
      this.lastKillT = this.t;
    }
    this.dropGem(e.x, e.y, e.xp);
    if (kind === 'elite' || kind === 'boss') {
      this.dropPickup('chest', e.x + 12, e.y);
      if (kind === 'boss') {
        this.cameras.main.shake(300, 0.012);
        this.ui.banner(T.bossDown, '#ffc83d');
        if (e.final) {
          this.finalKilled = true;
          if (this.t < RUN.duration) this.ui.banner(T.waitDawn, '#3df5ff', 2.4);
        }
      }
    } else {
      const r = Math.random();
      if (r < DROPS.heal) this.dropPickup('heal', e.x, e.y);
      else if (r < DROPS.heal + DROPS.magnet) this.dropPickup('magnet', e.x, e.y);
      else if (r < DROPS.heal + DROPS.magnet + DROPS.credit) this.dropPickup('credit', e.x, e.y, 1 + Math.floor(Math.random() * 4));
    }
  }

  // ---------- 武器 ----------
  private updateWeapons(dt: number) {
    let droneIdx = 0;
    let fieldOn = false;
    for (const w of this.weapons) {
      const s = w.stats;
      const dmg = s.damage * this.might;
      switch (w.id) {
        case 'katana':
        case 'sakura': {
          w.timer -= dt;
          if (w.timer <= 0) {
            w.timer = Math.max(0.2, s.cooldown * this.cdMult);
            if (w.id === 'sakura') this.slashCircle(105 * s.area, dmg);
            else {
              // 自動朝最近的敵人斬擊；附近沒有敵人時朝移動方向
              const R = 105 * s.area;
              let ax = this.faceX;
              let ay = this.faceY;
              const tgt = this.nearestEnemies(1, R + 50)[0];
              if (tgt) {
                const l = Math.hypot(tgt.x - this.px, tgt.y - this.py) || 1;
                ax = (tgt.x - this.px) / l;
                ay = (tgt.y - this.py) / l;
              }
              this.slashFan(ax, ay, R, dmg, WEAPONS.katana.color);
              if (s.amount >= 2) this.slashFan(-ax, -ay, R, dmg, WEAPONS.katana.color);
            }
          }
          break;
        }
        case 'drones': {
          w.angle += s.speed * dt;
          const r = 78 * s.area;
          const n = s.amount;
          const hitCd = Math.max(0.2, s.cooldown * this.cdMult);
          for (let i = 0; i < n; i++) {
            const a = w.angle + (i / n) * Math.PI * 2;
            const x = this.px + Math.cos(a) * r;
            const y = this.py + Math.sin(a) * r;
            const img = this.droneImg(droneIdx++);
            img.setPosition(x, y).setRotation(a + Math.PI / 2);
            const near = this.grid.query(x, y, 40, tmp2);
            for (const e of near) {
              if (!e.active) continue;
              const rr = e.radius + 12;
              const ex = e.x - x;
              const ey = e.y - y;
              if (ex * ex + ey * ey < rr * rr && this.t - e.lastDrone >= hitCd) {
                e.lastDrone = this.t;
                const l = Math.hypot(e.x - this.px, e.y - this.py) || 1;
                this.damageEnemy(e, dmg, ((e.x - this.px) / l) * 90, ((e.y - this.py) / l) * 90);
              }
            }
          }
          break;
        }
        case 'shuriken': {
          w.timer -= dt;
          if (w.timer <= 0) {
            const targets = this.nearestEnemies(s.amount, 420);
            if (targets.length === 0) {
              w.timer = 0.2;
              break;
            }
            w.timer = Math.max(0.25, s.cooldown * this.cdMult);
            for (let i = 0; i < s.amount; i++) {
              const tgt = targets[i % targets.length];
              const dx = tgt.x - this.px;
              const dy = tgt.y - this.py;
              const l = Math.hypot(dx, dy) || 1;
              const spread = i >= targets.length ? (i - targets.length + 1) * 0.25 : 0;
              const a = Math.atan2(dy / l, dx / l) + spread;
              this.fireProjectile(Math.cos(a) * s.speed, Math.sin(a) * s.speed, dmg, s.bounce);
            }
          }
          break;
        }
        case 'field': {
          fieldOn = true;
          const r = 64 * s.area;
          this.fieldImg
            .setVisible(true)
            .setPosition(this.px, this.py)
            .setScale((2 * r) / (128 * TEX))
            .setTint(WEAPONS.field.color)
            .setAlpha(0.55 + Math.sin(this.t * 6) * 0.12);
          w.timer -= dt;
          if (w.timer <= 0) {
            w.timer = Math.max(0.2, s.cooldown * this.cdMult);
            const near = this.grid.query(this.px, this.py, r + 40, tmp2);
            for (const e of near) {
              if (!e.active) continue;
              const rr = r + e.radius * 0.5;
              const ex = e.x - this.px;
              const ey = e.y - this.py;
              if (ex * ex + ey * ey < rr * rr) {
                e.slow = 0.6;
                this.damageEnemy(e, dmg);
              }
            }
          }
          break;
        }
      }
    }
    for (let i = droneIdx; i < this.droneImgs.length; i++) this.droneImgs[i].setVisible(false);
    if (!fieldOn) this.fieldImg.setVisible(false);
  }

  private droneImg(i: number) {
    while (this.droneImgs.length <= i) {
      this.droneImgs.push(this.add.image(0, 0, 'drone').setScale(1 / TEX).setDepth(9));
    }
    return this.droneImgs[i].setVisible(true);
  }

  private slashFan(fx: number, fy: number, R: number, dmg: number, color: number) {
    const arc = (140 * Math.PI) / 180;
    const cosHalf = Math.cos(arc / 2);
    const near = this.grid.query(this.px, this.py, R + 30, tmp2);
    for (const e of near) {
      if (!e.active) continue;
      const dx = e.x - this.px;
      const dy = e.y - this.py;
      const d = Math.hypot(dx, dy) || 1;
      if (d > R + e.radius) continue;
      const dot = (dx * fx + dy * fy) / d;
      if (dot >= cosHalf || d < e.radius + PLAYER.radius + 8) {
        this.damageEnemy(e, dmg, (dx / d) * 160, (dy / d) * 160);
      }
    }
    const a = Math.atan2(fy, fx);
    this.addSlash((g) => {
      g.fillStyle(color, 0.22);
      g.slice(this.px, this.py, R, a - arc / 2, a + arc / 2, false);
      g.fillPath();
      g.lineStyle(4, 0xffffff, 0.95);
      g.beginPath();
      g.arc(this.px, this.py, R * 0.92, a - arc / 2 + 0.1, a + arc / 2 - 0.1, false);
      g.strokePath();
      g.lineStyle(2, color, 1);
      g.beginPath();
      g.arc(this.px, this.py, R, a - arc / 2, a + arc / 2, false);
      g.strokePath();
    }, 0.16);
  }

  private slashCircle(R: number, dmg: number) {
    const near = this.grid.query(this.px, this.py, R + 30, tmp2);
    for (const e of near) {
      if (!e.active) continue;
      const dx = e.x - this.px;
      const dy = e.y - this.py;
      const d = Math.hypot(dx, dy) || 1;
      if (d <= R + e.radius) this.damageEnemy(e, dmg, (dx / d) * 180, (dy / d) * 180);
    }
    const color = WEAPONS.sakura.color;
    const rot = this.t * 7;
    this.addSlash((g) => {
      g.fillStyle(color, 0.16);
      g.fillCircle(this.px, this.py, R);
      g.lineStyle(4, 0xffffff, 0.9);
      for (let i = 0; i < 3; i++) {
        const a = rot + (i / 3) * Math.PI * 2;
        g.beginPath();
        g.arc(this.px, this.py, R * 0.9, a, a + 1.6, false);
        g.strokePath();
      }
      g.lineStyle(2, color, 1);
      g.strokeCircle(this.px, this.py, R);
    }, 0.2);
    this.sparks.setParticleTint(color);
    this.sparks.explode(8, this.px, this.py);
  }

  private addSlash(draw: (g: Phaser.GameObjects.Graphics) => void, life: number) {
    let s = this.slashes.find((x) => x.life <= 0);
    if (!s) {
      s = { g: this.add.graphics().setDepth(9).setBlendMode(Phaser.BlendModes.ADD), life: 0, max: 1 };
      this.slashes.push(s);
    }
    s.g.clear().setVisible(true).setAlpha(1);
    draw(s.g);
    s.life = s.max = life;
  }

  private nearestEnemies(n: number, maxDist: number): Enemy[] {
    const res: { e: Enemy; d: number }[] = [];
    const md2 = maxDist * maxDist;
    for (const e of this.activeEnemies) {
      if (!e.active) continue;
      const dx = e.x - this.px;
      const dy = e.y - this.py;
      const d = dx * dx + dy * dy;
      if (d > md2) continue;
      if (res.length < n) {
        res.push({ e, d });
        res.sort((a, b) => a.d - b.d);
      } else if (d < res[res.length - 1].d) {
        res[res.length - 1] = { e, d };
        res.sort((a, b) => a.d - b.d);
      }
    }
    return res.map((r) => r.e);
  }

  private fireProjectile(vx: number, vy: number, damage: number, bounces: number) {
    let p = this.projectiles.find((x) => !x.active);
    if (!p) {
      p = {
        active: false,
        img: this.add.image(0, 0, 'shuriken').setScale(1 / TEX).setDepth(8),
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        damage: 0,
        bounces: 0,
        last: null,
      };
      this.projectiles.push(p);
    }
    p.active = true;
    p.x = this.px;
    p.y = this.py;
    p.vx = vx;
    p.vy = vy;
    p.life = 1.4;
    p.damage = damage;
    p.bounces = bounces;
    p.last = null;
    p.img.setVisible(true).setPosition(p.x, p.y);
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.img.setPosition(p.x, p.y).setRotation(p.img.rotation + dt * 18);
      if (p.life <= 0) {
        p.active = false;
        p.img.setVisible(false);
        continue;
      }
      const near = this.grid.query(p.x, p.y, 40, tmp2);
      for (const e of near) {
        if (!e.active || e === p.last) continue;
        const rr = e.radius + 8;
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        if (dx * dx + dy * dy > rr * rr) continue;
        const sp = Math.hypot(p.vx, p.vy) || 1;
        this.damageEnemy(e, p.damage, (p.vx / sp) * 80, (p.vy / sp) * 80);
        p.last = e;
        if (p.bounces > 0) {
          p.bounces--;
          const next = this.findBounceTarget(p.x, p.y, e);
          if (next) {
            const nx = next.x - p.x;
            const ny = next.y - p.y;
            const l = Math.hypot(nx, ny) || 1;
            p.vx = (nx / l) * sp;
            p.vy = (ny / l) * sp;
            p.life = Math.max(p.life, 0.8);
          }
        } else {
          p.active = false;
          p.img.setVisible(false);
        }
        break;
      }
    }
  }

  private findBounceTarget(x: number, y: number, exclude: Enemy): Enemy | null {
    const near = this.grid.query(x, y, 240, tmp);
    let best: Enemy | null = null;
    let bd = 240 * 240;
    for (const e of near) {
      if (!e.active || e === exclude) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  private fireBullet(x: number, y: number, vx: number, vy: number, damage: number) {
    let b = this.bullets.find((q) => !q.active);
    if (!b) {
      b = { active: false, img: this.add.image(0, 0, 'bullet').setScale(1 / TEX).setDepth(9), x: 0, y: 0, vx: 0, vy: 0, life: 0, damage: 0 };
      this.bullets.push(b);
    }
    Object.assign(b, { active: true, x, y, vx, vy, life: 5, damage });
    b.img.setVisible(true).setPosition(x, y);
  }

  private updateBullets(dt: number) {
    for (const b of this.bullets) {
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      b.img.setPosition(b.x, b.y);
      const dx = b.x - this.px;
      const dy = b.y - this.py;
      const rr = PLAYER.radius + 5;
      if (dx * dx + dy * dy < rr * rr) {
        this.hurt(b.damage);
        b.life = 0;
      }
      if (b.life <= 0) {
        b.active = false;
        b.img.setVisible(false);
      }
    }
  }

  // ---------- 掉落物 ----------
  private obtainPickup(): Pickup {
    let p = this.pickups.find((x) => !x.active);
    if (!p) {
      p = { active: false, kind: 'gem', img: this.add.image(0, 0, 'gem1').setScale(1 / TEX).setDepth(1), x: 0, y: 0, value: 0, flying: false, speed: 0 };
      this.pickups.push(p);
    }
    return p;
  }

  private gemTexture(v: number) {
    return v >= 20 ? 'gem3' : v >= 5 ? 'gem2' : 'gem1';
  }

  dropGem(x: number, y: number, value: number) {
    if (this.gemCount >= RUN.maxGems) {
      // 經驗晶片太多時合併到既有的晶片上
      const gems = this.pickups.filter((p) => p.active && p.kind === 'gem' && !p.flying);
      if (gems.length) {
        const g = gems[Math.floor(Math.random() * gems.length)];
        g.value += value;
        g.img.setTexture(this.gemTexture(g.value));
        return;
      }
    }
    const p = this.obtainPickup();
    Object.assign(p, { active: true, kind: 'gem', x, y, value, flying: false, speed: 0 });
    p.img.setTexture(this.gemTexture(value)).setVisible(true).setPosition(x, y).setDepth(1);
    this.gemCount++;
  }

  dropPickup(kind: Exclude<PickupKind, 'gem'>, x: number, y: number, value = 0) {
    const p = this.obtainPickup();
    Object.assign(p, { active: true, kind, x, y, value, flying: false, speed: 0 });
    p.img.setTexture(kind).setVisible(true).setPosition(x, y).setDepth(2);
  }

  private updatePickups(dt: number) {
    const r2 = this.pickupR * this.pickupR;
    for (const p of this.pickups) {
      if (!p.active) continue;
      const dx = this.px - p.x;
      const dy = this.py - p.y;
      const d2 = dx * dx + dy * dy;
      const reach = p.kind === 'chest' ? 34 * 34 : r2;
      if (!p.flying && d2 < reach) {
        p.flying = true;
        p.speed = 120;
      }
      if (p.flying) {
        const d = Math.sqrt(d2) || 1;
        p.speed += 900 * dt;
        const step = Math.min(d, p.speed * dt);
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
        p.img.setPosition(p.x, p.y);
        if (d < PLAYER.radius + 6) this.collect(p);
      }
    }
  }

  private collect(p: Pickup) {
    p.active = false;
    p.img.setVisible(false);
    switch (p.kind) {
      case 'gem':
        this.gemCount--;
        this.addXp(p.value);
        break;
      case 'heal':
        this.hp = Math.min(this.maxHp, this.hp + DROPS.healAmount);
        break;
      case 'magnet':
        for (const q of this.pickups) if (q.active && q.kind === 'gem' && !q.flying) {
          q.flying = true;
          q.speed = 200;
        }
        break;
      case 'credit':
        this.credits += p.value;
        break;
      case 'chest':
        this.openChest();
        break;
    }
  }

  addXp(v: number) {
    this.xp += v;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = xpToNext(this.level);
      this.pendingLevels++;
    }
  }

  private openChest() {
    this.credits += 10;
    for (const evo of EVOLUTIONS) {
      const w = this.weapons.find((x) => x.id === evo.weapon);
      if (w && w.level >= this.maxLevel(w.id) && this.passiveLevel(evo.passive) > 0) {
        w.id = evo.result;
        w.level = 1;
        w.stats = this.computeStats(evo.result, 1);
        w.timer = 0.1;
        this.inventoryVersion++;
        this.ui.banner(T.evolved(WEAPONS[evo.result].name), '#ff7ad9', 2.6);
        this.cameras.main.flash(250, 255, 122, 217);
        return;
      }
    }
    const options: Choice[] = [];
    for (const w of this.weapons) if (w.level < this.maxLevel(w.id)) options.push({ kind: 'weapon', id: w.id });
    for (const [id, lv] of this.passives) if (lv < PASSIVES[id].maxLevel) options.push({ kind: 'passive', id });
    if (options.length === 0) {
      this.credits += 30;
      this.ui.banner(T.chestCredits, '#ffd84d');
      return;
    }
    const c = options[Math.floor(Math.random() * options.length)];
    this.applyChoice(c);
    if (c.kind === 'weapon') {
      const w = this.weapons.find((x) => x.id === c.id)!;
      this.ui.banner(T.chestUp(WEAPONS[c.id].name, w.level), '#ffc83d');
    } else if (c.kind === 'passive') {
      this.ui.banner(T.chestUp(PASSIVES[c.id].name, this.passiveLevel(c.id)), '#ffc83d');
    }
  }

  // ---------- 殺意與居合・一閃 ----------
  intentThreshold(): number {
    return Math.min(INTENT.maxThreshold, INTENT.baseThreshold * (1 + INTENT.growth * this.iaiCount));
  }

  private updateIntent(dt: number) {
    if (this.t - this.lastKillT > INTENT.decayDelay) this.intent = Math.max(0, this.intent - INTENT.decayPerSec * dt);
    if (this.intent >= this.intentThreshold() && !this.ended) {
      this.intent = 0;
      this.iaiCount++;
      this.iaiFreeze = INTENT.freeze;
      this.ui.playIai();
    }
  }

  private executeIai() {
    const x0 = this.px - W / 2 - 40;
    const x1 = this.px + W / 2 + 40;
    const y0 = this.py - H / 2 - 40;
    const y1 = this.py + H / 2 + 40;
    for (const e of this.activeEnemies) {
      if (!e.active || e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1) continue;
      const kind = e.def.kind;
      const dmg =
        kind === 'boss'
          ? e.maxHp * INTENT.bossDamagePct
          : kind === 'elite'
            ? e.maxHp * INTENT.eliteDamagePct
            : e.hp + 1;
      this.damageEnemy(e, dmg, 0, 0, true);
    }
    this.cameras.main.shake(260, 0.012);
    // 一閃之後，畫面上的經驗晶片全部吸過來
    for (const p of this.pickups) {
      if (!p.active || p.kind !== 'gem' || p.flying) continue;
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      p.flying = true;
      p.speed = 250;
    }
    for (const b of this.bullets) if (b.active) {
      b.active = false;
      b.img.setVisible(false);
    }
  }

  // ---------- 升級選擇 ----------
  private validChoices(): Choice[] {
    const list: Choice[] = [];
    const hasEvolvedFrom = (id: WeaponId) => EVOLUTIONS.some((ev) => ev.weapon === id && this.weapons.some((w) => w.id === ev.result));
    for (const id of WEAPON_POOL) {
      if (hasEvolvedFrom(id)) continue;
      const w = this.weapons.find((x) => x.id === id);
      if (w) {
        if (w.level < this.maxLevel(id)) list.push({ kind: 'weapon', id });
      } else if (this.weapons.length < RUN.weaponSlots) list.push({ kind: 'weapon', id });
    }
    for (const id of PASSIVE_POOL) {
      const lv = this.passives.get(id);
      if (lv !== undefined) {
        if (lv < PASSIVES[id].maxLevel) list.push({ kind: 'passive', id });
      } else if (this.passives.size < RUN.passiveSlots) list.push({ kind: 'passive', id });
    }
    return list.filter((c) => !this.banished.has(choiceKey(c)));
  }

  rollChoices(exclude: Choice[] = []): Choice[] {
    const ex = new Set(exclude.map(choiceKey));
    let pool = this.validChoices().filter((c) => !ex.has(choiceKey(c)));
    const out: Choice[] = [];
    if (this.locked && pool.some((c) => choiceKey(c) === choiceKey(this.locked!))) {
      out.push(this.locked);
      pool = pool.filter((c) => choiceKey(c) !== choiceKey(this.locked!));
    }
    Phaser.Utils.Array.Shuffle(pool);
    while (out.length < 3 && pool.length) out.push(pool.pop()!);
    if (out.length < 3 && !ex.has('heal')) out.push({ kind: 'heal' });
    if (out.length < 3 && !ex.has('credits')) out.push({ kind: 'credits' });
    return out;
  }

  /** 放逐：換掉一張卡片；回傳替代的卡片（沒有可換的就回傳 null） */
  banishChoice(c: Choice, shown: Choice[]): Choice | null {
    if (this.banishes <= 0 || c.kind === 'heal' || c.kind === 'credits') return c;
    this.banishes--;
    this.banished.add(choiceKey(c));
    if (this.locked && choiceKey(this.locked) === choiceKey(c)) this.locked = null;
    const others = shown.filter((s) => s !== c);
    const pool = this.validChoices().filter((v) => !others.some((o) => choiceKey(o) === choiceKey(v)));
    if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
    return null;
  }

  lockChoice(c: Choice) {
    if (this.locks <= 0) return;
    this.locks--;
    this.locked = c;
  }

  rerollChoices(): Choice[] | null {
    if (this.rerolls <= 0) return null;
    this.rerolls--;
    return this.rollChoices();
  }

  applyChoice(c: Choice) {
    if (this.locked && choiceKey(this.locked) === choiceKey(c)) this.locked = null;
    switch (c.kind) {
      case 'weapon': {
        const w = this.weapons.find((x) => x.id === c.id);
        if (w) {
          w.level++;
          w.stats = this.computeStats(w.id, w.level);
        } else this.addWeapon(c.id);
        break;
      }
      case 'passive':
        this.passives.set(c.id, this.passiveLevel(c.id) + 1);
        break;
      case 'heal':
        this.hp = Math.min(this.maxHp, this.hp + DROPS.healAmount);
        break;
      case 'credits':
        this.credits += 25;
        break;
    }
    this.recalc();
  }

  choiceInfo(c: Choice): { name: string; desc: string; tag: string; icon: string; color: number; isNew: boolean } {
    switch (c.kind) {
      case 'weapon': {
        const def = WEAPONS[c.id];
        const w = this.weapons.find((x) => x.id === c.id);
        if (!w) return { name: def.name, desc: def.desc, tag: T.isNew, icon: `icon-${c.id}`, color: def.color, isNew: true };
        return { name: def.name, desc: def.levels[w.level - 1]?.desc ?? '', tag: T.lv(w.level, w.level + 1), icon: `icon-${c.id}`, color: def.color, isNew: false };
      }
      case 'passive': {
        const def = PASSIVES[c.id];
        const lv = this.passives.get(c.id);
        if (lv === undefined) return { name: def.name, desc: def.desc, tag: T.isNew, icon: `icon-${c.id}`, color: def.color, isNew: true };
        return { name: def.name, desc: def.desc, tag: T.lv(lv, lv + 1), icon: `icon-${c.id}`, color: def.color, isNew: false };
      }
      case 'heal':
        return { name: T.heal, desc: T.healDesc, tag: '', icon: 'icon-heal', color: 0x5dff7a, isNew: false };
      case 'credits':
        return { name: T.credits, desc: T.creditsDesc, tag: '', icon: 'icon-credits', color: 0xffd84d, isNew: false };
    }
  }

  private openLevelUp() {
    this.modal = true;
    this.scene.pause();
    this.ui.showLevelUp(this.level - this.pendingLevels + 1, this.rollChoices());
  }

  /** UI 選完一張卡之後呼叫 */
  levelChoiceDone() {
    this.pendingLevels--;
    if (this.pendingLevels > 0) {
      this.ui.showLevelUp(this.level - this.pendingLevels + 1, this.rollChoices());
      return;
    }
    this.closeModal();
  }

  closeModal() {
    this.modal = false;
    this.joy.x = this.joy.y = 0;
    this.scene.resume();
  }

  pauseByUser() {
    if (this.modal || this.ended) return;
    this.modal = true;
    this.scene.pause();
    this.ui.showPause();
  }

  // ---------- 死亡、復活、結算 ----------
  private onDeath() {
    if (this.revivesLeft > 0) {
      this.modal = true;
      this.scene.pause();
      this.ui.showRevive();
    } else this.endRun(false);
  }

  revive() {
    this.revivesLeft--;
    this.hp = this.maxHp;
    this.invuln = 2.5;
    for (const e of this.activeEnemies) {
      if (!e.active || e.def.kind === 'boss') continue;
      if ((e.x - this.px) ** 2 + (e.y - this.py) ** 2 < 280 * 280) this.damageEnemy(e, e.hp + 1, 0, 0, true);
    }
    for (const b of this.bullets) if (b.active) {
      b.active = false;
      b.img.setVisible(false);
    }
    this.cameras.main.flash(300, 61, 245, 255);
    this.closeModal();
  }

  endRun(victory: boolean) {
    if (this.ended) return;
    this.ended = true;
    this.modal = true;
    const wasRunning = this.scene.isActive();
    const save = loadSave();
    const newBest = this.t > save.bestTime || (victory && this.kills > save.bestKills);
    save.bestTime = Math.max(save.bestTime, this.t);
    save.bestKills = Math.max(save.bestKills, this.kills);
    save.totalCredits += this.credits;
    save.runs++;
    writeSave(save);
    if (wasRunning) this.scene.pause();
    const result: RunResult = { victory, time: this.t, kills: this.kills, level: this.level, credits: this.credits, newBest };
    this.ui.showResults(result);
  }

  // ---------- 除錯 ----------
  debugSkip(sec: number) {
    this.t += sec;
  }
  debugLevel() {
    this.addXp(this.xpNext - this.xp);
  }
  debugChest() {
    this.dropPickup('chest', this.px, this.py - 20);
  }
  debugMaxKatana() {
    const w = this.weapons.find((x) => x.id === 'katana');
    if (w) {
      w.level = this.maxLevel('katana');
      w.stats = this.computeStats('katana', w.level);
    }
    if (!this.passives.has('haste')) this.passives.set('haste', 1);
    this.recalc();
  }

  // ---------- 特效與繪製 ----------
  showDamage(x: number, y: number, v: number) {
    const d = this.dmgTexts.find((q) => q.life <= 0);
    if (!d) return;
    d.life = 0.5;
    d.t.setText(String(v)).setPosition(x + (Math.random() - 0.5) * 10, y).setVisible(true).setAlpha(1);
    d.t.setColor(v >= 100 ? '#ffc83d' : '#ffffff').setFontSize(v >= 100 ? 19 : 15);
  }

  private updateEffects(dt: number) {
    for (const s of this.slashes) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.g.setAlpha(Math.max(0, s.life / s.max));
      if (s.life <= 0) s.g.setVisible(false);
    }
    for (const d of this.dmgTexts) {
      if (d.life <= 0) continue;
      d.life -= dt;
      d.t.y -= 50 * dt;
      d.t.setAlpha(Math.min(1, d.life * 4));
      if (d.life <= 0) d.t.setVisible(false);
    }
  }

  private render() {
    const cam = this.cameras.main;
    cam.centerOn(this.px, this.py);

    // 背景格線與霓虹裝飾
    const g = this.bg;
    g.clear();
    const x0 = this.px - W / 2 - 64;
    const y0 = this.py - H / 2 - 64;
    const gs = 64;
    g.lineStyle(1, COLORS.grid, 1);
    for (let x = Math.floor(x0 / gs) * gs; x < x0 + W + 128; x += gs) g.lineBetween(x, y0, x, y0 + H + 128);
    for (let y = Math.floor(y0 / gs) * gs; y < y0 + H + 128; y += gs) g.lineBetween(x0, y, x0 + W + 128, y);
    const cs = 256;
    for (let cx = Math.floor(x0 / cs); cx * cs < x0 + W + 128; cx++) {
      for (let cy = Math.floor(y0 / cs); cy * cs < y0 + H + 128; cy++) {
        const h = hash(cx, cy);
        if (h % 3 !== 0) continue;
        const col = [0xff3d81, 0x3df5ff, 0x8a5cff][h % 7 % 3];
        const rx = cx * cs + (h % 160) + 20;
        const ry = cy * cs + ((h >> 8) % 160) + 20;
        const rw = 30 + ((h >> 4) % 50);
        const rh = 10 + ((h >> 12) % 26);
        g.fillStyle(col, 0.06);
        g.fillRect(rx, ry, rw, rh);
        g.lineStyle(1, col, 0.22);
        g.strokeRect(rx, ry, rw, rh);
      }
    }

    // 玩家
    const blink = this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0;
    this.playerImg.setPosition(this.px, this.py).setAlpha(blink ? 0.45 : 1);
    if (this.hurtFlash > 0) this.playerImg.setTintFill(0xff3d81);
    else this.playerImg.clearTint();
    this.facingImg.setPosition(this.px + this.faceX * 20, this.py + this.faceY * 20).setRotation(Math.atan2(this.faceY, this.faceX));

    // 敵人
    for (const e of this.activeEnemies) {
      if (!e.active) continue;
      e.img.setPosition(e.x, e.y);
      if (e.flash > 0) e.img.setTintFill(0xffffff);
      else if (e.slow > 0) e.img.setTint(0x9fb0ff);
      else e.img.clearTint();
    }

    // Boss 預警線
    const fx = this.fx;
    fx.clear();
    for (const b of this.bosses) {
      if (!b.active) continue;
      if (b.bossState === 'tele') {
        const a = 0.35 + 0.35 * Math.sin(b.bossT * 30);
        fx.lineStyle(b.radius * 1.6, 0xff2244, a * 0.35);
        fx.lineBetween(b.x, b.y, b.x + b.aimX * 520, b.y + b.aimY * 520);
        fx.lineStyle(2, 0xff2244, 0.9);
        fx.lineBetween(b.x, b.y, b.x + b.aimX * 520, b.y + b.aimY * 520);
      }
    }

    // 生命條
    const hb = this.hpBar;
    hb.clear();
    const bw = 40;
    hb.fillStyle(0x000000, 0.6);
    hb.fillRect(this.px - bw / 2 - 1, this.py + 21, bw + 2, 6);
    hb.fillStyle(this.hp / this.maxHp < 0.3 ? 0xff3d81 : 0x5dff7a, 1);
    hb.fillRect(this.px - bw / 2, this.py + 22, bw * (this.hp / this.maxHp), 4);
  }
}

function currentWave(t: number) {
  let seg = WAVES[0];
  for (const w of WAVES) if (t >= w.from) seg = w;
  return seg;
}

function pickWeighted(weights: Partial<Record<'drone' | 'thug' | 'husk', number>>): EnemyKind {
  const entries = Object.entries(weights) as ['drone' | 'thug' | 'husk', number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[0][0];
}

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}
