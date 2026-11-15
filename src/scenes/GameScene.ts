import Phaser from 'phaser';
import {
  BOSSES,
  BossDef,
  CHARACTERS,
  CharDef,
  CharId,
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
  SWARMS,
  UNLOCKS,
  WAVES,
  WEAPONS,
  WEAPON_POOL,
  WeaponId,
  WeaponStats,
  enemyHpMult,
  runReward,
  xpToNext,
} from '../config/balance';
import { T } from '../i18n/zh-TW';
import { COLORS, H, W, Z, textStyle } from '../game/layout';
import { SpatialGrid } from '../game/SpatialGrid';
import { TEX } from '../game/textures';
import { SaveData, loadSave, writeSave } from '../game/storage';
import { Audio } from '../game/audio';
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
  phase: number;
  baseScale: number;
  // 病毒
  virusT: number;
  virusDps: number;
  virusSpread: number;
  virusTick: number;
  // 槍兵
  gunT: number;
  // Boss 專用
  boss: BossDef | null;
  bossState: 'chase' | 'tele' | 'dash' | 'spiral';
  bossT: number;
  ringT: number;
  spiralT: number;
  summonT: number;
  fireT: number;
  spinA: number;
  aimX: number;
  aimY: number;
  title: string;
}

interface Projectile {
  active: boolean;
  kind: 'shuriken' | 'fuma';
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  bounces: number;
  last: Enemy | null;
  hits: Set<Enemy>;
  returning: boolean;
}

interface Hook {
  active: boolean;
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  target: Enemy;
  speed: number;
  damage: number;
  radius: number;
  life: number;
}

interface Strike {
  active: boolean;
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  t: number;
  r: number;
  damage: number;
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
  timer2: number;
  stats: WeaponStats;
  angle: number;
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
  bonus: number;
  newBest: boolean;
  unlocked: string[];
}

const tmp: Enemy[] = [];
const tmp2: Enemy[] = [];

const PICKUP_TEX: Record<Exclude<PickupKind, 'gem'>, string> = {
  heal: 'pickup-heal',
  magnet: 'pickup-magnet',
  chest: 'pickup-chest',
  credit: 'pickup-credit',
};

export class GameScene extends Phaser.Scene {
  ui!: UIScene;
  save!: SaveData;
  char!: CharDef;

  // 玩家
  px = 0;
  py = 0;
  hp = PLAYER.maxHp;
  maxHp = PLAYER.maxHp;
  faceX = 0;
  faceY = -1;
  moving = false;
  invuln = 0;
  hurtFlash = 0;
  playerImg!: Phaser.GameObjects.Image;
  facingImg!: Phaser.GameObjects.Image;
  shadowG!: Phaser.GameObjects.Graphics;

  // 衍生屬性
  might = 1;
  cdMult = 1;
  armor = 0;
  pickupR = PLAYER.pickupRadius;
  speed = PLAYER.speed;
  areaMult = 1;
  regen = 0;
  intentMult = 1;
  xpMult = 1;

  // 局內狀態
  t = 0;
  kills = 0;
  bossKills = 0;
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
  seenEnemies = new Set<string>();

  weapons: WeaponInst[] = [];
  passives = new Map<PassiveId, number>();

  // 物件池
  enemies: Enemy[] = [];
  activeEnemies: Enemy[] = [];
  bosses: Enemy[] = [];
  projectiles: Projectile[] = [];
  hooks: Hook[] = [];
  strikes: Strike[] = [];
  bullets: Bullet[] = [];
  pickups: Pickup[] = [];
  gemCount = 0;
  slashes: Slash[] = [];
  dmgTexts: DmgText[] = [];
  droneImgs: Phaser.GameObjects.Image[] = [];
  groundTiles: Phaser.GameObjects.Image[] = [];
  fieldImg!: Phaser.GameObjects.Image;
  grid = new SpatialGrid<Enemy>(64);

  // 生成
  spawnAcc = 0;
  nextElite = 0;
  nextBoss = 0;
  nextSwarm = 0;

  fx!: Phaser.GameObjects.Graphics;
  hpBar!: Phaser.GameObjects.Graphics;
  sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  /** 由 UIScene 寫入的搖桿方向（長度 0～1） */
  joy = { x: 0, y: 0 };

  /** 除錯用：每幀模擬幾步（自動化平衡測試用） */
  simSpeed = 1;
  /** 除錯用：自動操作（自動化平衡測試用） */
  debugBot: ((g: GameScene) => void) | null = null;

  private onVisibility = () => {
    if (document.hidden) this.pauseByUser();
  };

  constructor() {
    super('Game');
  }

  // ---------- 初始化 ----------
  create(data: { char?: CharId }) {
    this.resetState();
    this.save = loadSave();
    const charId = data?.char && this.save.chars.includes(data.char) ? data.char : this.save.lastChar;
    this.char = CHARACTERS[this.save.chars.includes(charId) ? charId : 'jin'];

    const cam = this.cameras.main;
    cam.setZoom(Z);
    cam.setBackgroundColor(COLORS.bg);

    // 地面：用幾張無縫圖塊鋪滿畫面
    const tile = this.textures.exists('ground') ? 'ground' : null;
    if (tile) {
      const size = this.groundSize();
      const cols = Math.ceil(W / size) + 1;
      const rows = Math.ceil(H / size) + 1;
      for (let i = 0; i < cols * rows; i++) {
        this.groundTiles.push(this.add.image(0, 0, tile).setOrigin(0).setDisplaySize(size, size).setDepth(-10).setAlpha(0.5));
      }
    }

    this.shadowG = this.add.graphics().setDepth(0);
    this.fx = this.add.graphics().setDepth(3);
    this.hpBar = this.add.graphics().setDepth(11);
    this.fieldImg = this.add.image(0, 0, 'ring').setDepth(4).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
    this.playerImg = this.add.image(0, 0, `char-${this.char.id}`).setScale(0.62).setDepth(10).setOrigin(0.5, 0.8);
    this.facingImg = this.add.image(0, 0, 'facing').setScale(1 / TEX).setDepth(10).setAlpha(0.7);
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
    this.keys = kb ? (kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>) : {};

    // 局外強化
    const up = this.save.upgrades;
    this.rerolls = RUN.rerolls + (up.reroll ?? 0);
    this.banishes = RUN.banishes + (up.banish ?? 0);
    this.locks = RUN.locks + (up.lock ?? 0);

    this.addWeapon(this.char.weapon);
    this.recalc();
    this.hp = this.maxHp;

    for (let i = 0; i < 12; i++) this.spawnEnemy('drone');

    document.addEventListener('visibilitychange', this.onVisibility);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('visibilitychange', this.onVisibility);
    });

    this.scene.launch('UI');
    this.ui = this.scene.get('UI') as UIScene;
    Audio.playMusic('bgm-battle');
  }

  private groundSize() {
    return 384;
  }

  private resetState() {
    this.px = 0;
    this.py = 0;
    this.faceX = 0;
    this.faceY = -1;
    this.moving = false;
    this.invuln = 0;
    this.hurtFlash = 0;
    this.t = 0;
    this.kills = 0;
    this.bossKills = 0;
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
    this.banished = new Set();
    this.locked = null;
    this.modal = false;
    this.ended = false;
    this.invincible = false;
    this.finalSpawned = false;
    this.finalKilled = false;
    this.dawnAnnounced = false;
    this.inventoryVersion = 0;
    this.seenEnemies = new Set();
    this.weapons = [];
    this.passives = new Map();
    this.enemies = [];
    this.activeEnemies = [];
    this.bosses = [];
    this.projectiles = [];
    this.hooks = [];
    this.strikes = [];
    this.bullets = [];
    this.pickups = [];
    this.gemCount = 0;
    this.slashes = [];
    this.dmgTexts = [];
    this.droneImgs = [];
    this.groundTiles = [];
    this.spawnAcc = 0;
    this.nextElite = 0;
    this.nextBoss = 0;
    this.nextSwarm = 0;
    this.joy = { x: 0, y: 0 };
    this.simSpeed = 1;
    this.debugBot = null;
  }

  // ---------- 屬性 ----------
  passiveLevel(id: PassiveId): number {
    return this.passives.get(id) ?? 0;
  }

  recalc() {
    const up = this.save.upgrades;
    this.might = 1 + 0.1 * this.passiveLevel('might') + 0.05 * (up.might ?? 0);
    this.cdMult = 1 - 0.07 * this.passiveLevel('haste');
    this.armor = PLAYER.armor + this.char.armor + this.passiveLevel('armor');
    const newMax = this.char.maxHp + 10 * this.passiveLevel('armor') + 10 * (up.hp ?? 0);
    if (newMax > this.maxHp) this.hp += newMax - this.maxHp;
    this.maxHp = newMax;
    this.hp = Math.min(this.hp, this.maxHp);
    this.pickupR = PLAYER.pickupRadius * (1 + 0.3 * this.passiveLevel('magnet') + 0.1 * (up.pickup ?? 0));
    this.speed = PLAYER.speed * this.char.speedMult * (1 + 0.08 * this.passiveLevel('camo') + 0.03 * (up.speed ?? 0));
    this.areaMult = 1 + 0.1 * this.passiveLevel('overclock');
    this.regen = 0.4 * this.passiveLevel('nano');
    this.intentMult = this.char.intentMult * (1 + 0.15 * this.passiveLevel('intent'));
    this.xpMult = 1 + 0.05 * (up.growth ?? 0);
    for (const w of this.weapons) w.stats = this.computeStats(w.id, w.level);
    this.inventoryVersion++;
  }

  computeStats(id: WeaponId, level: number): WeaponStats {
    const def = WEAPONS[id];
    const s = { ...def.base };
    for (let i = 0; i < level - 1 && i < def.levels.length; i++) {
      const d = def.levels[i].delta;
      for (const k of Object.keys(d) as (keyof WeaponStats)[]) s[k] += d[k] ?? 0;
    }
    if (def.projectile) s.amount += this.char?.extraAmount ?? 0;
    s.area *= this.areaMult;
    return s;
  }

  addWeapon(id: WeaponId) {
    this.weapons.push({ id, level: 1, timer: 0.3, timer2: 1, stats: this.computeStats(id, 1), angle: 0 });
    this.markSeenWeapon(id);
    this.inventoryVersion++;
  }

  private markSeenWeapon(id: WeaponId) {
    if (!this.save.seenWeapons.includes(id)) this.save.seenWeapons.push(id);
  }

  maxLevel(id: WeaponId): number {
    return WEAPONS[id].levels.length + 1;
  }

  /** 已解鎖（不需要成就，或已達成成就） */
  isUnlocked(id: WeaponId | PassiveId): boolean {
    return !UNLOCKS.some((u) => u.id === id) || this.save.unlocked.includes(id);
  }

  // ---------- 主迴圈 ----------
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
    this.updateHooks(dt);
    this.updateStrikes(dt);
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
    while (this.nextBoss < BOSSES.length && this.t >= BOSSES[this.nextBoss].at) {
      const b = BOSSES[this.nextBoss++];
      this.spawnBoss(b);
      this.ui.banner(T.bossWarn(b.title), '#ff2244', 2.6);
      Audio.play('sfx-bosswarn', 0.6);
      Audio.playMusic('bgm-boss');
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
    const img = this.add.image(0, 0, 'e-drone').setDepth(5).setVisible(false);
    const e = { img, active: false } as Enemy;
    this.enemies.push(e);
    return e;
  }

  spawnEnemy(kind: EnemyKind, at?: [number, number]): Enemy {
    const def = ENEMIES[kind];
    const e = this.obtainEnemy();
    const [x, y] = at ?? this.spawnPoint(def.radius + 30);
    const mult = kind === 'boss' ? 1 : enemyHpMult(this.t);
    Object.assign(e, {
      active: true,
      def,
      x,
      y,
      hp: def.hp * mult,
      maxHp: def.hp * mult,
      speed: def.speed * (0.92 + Math.random() * 0.16),
      damage: def.damage * (1 + this.t / 600),
      radius: def.radius,
      xp: def.xp,
      kx: 0,
      ky: 0,
      flash: 0,
      slow: 0,
      lastDrone: -99,
      phase: Math.random() * 10,
      baseScale: 0.5,
      virusT: 0,
      virusDps: 0,
      virusSpread: 0,
      virusTick: 0,
      gunT: 1 + Math.random() * 2,
      boss: null,
      bossState: 'chase',
      bossT: 0,
      ringT: 2,
      spiralT: 4,
      summonT: 3,
      fireT: 0,
      spinA: 0,
      aimX: 0,
      aimY: 0,
      title: def.name,
    });
    const tex = this.textures.exists(def.tex) ? def.tex : `e-${kind}`;
    e.baseScale = tex === def.tex ? 0.5 : 1 / TEX;
    e.img.setTexture(tex).setVisible(true).setPosition(x, y).clearTint().setAlpha(1).setScale(e.baseScale).setFlipX(false);
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

  private spawnBoss(b: BossDef) {
    const e = this.spawnEnemy('boss', [this.px, this.py - H / 2 - 90]);
    e.maxHp = e.hp = b.hp;
    e.boss = b;
    e.title = b.title;
    e.speed = b.speed;
    e.radius = b.radius;
    if (this.textures.exists(b.tex)) {
      e.img.setTexture(b.tex);
      e.baseScale = 0.5;
      e.img.setScale(0.5);
    }
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
    this.moving = len > 0.05;
    if (this.moving) {
      const l = Math.hypot(mx, my);
      this.faceX = mx / l;
      this.faceY = my / l;
    }
    this.px += mx * this.speed * dt;
    this.py += my * this.speed * dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.regen > 0 && this.hp > 0) this.hp = Math.min(this.maxHp, this.hp + this.regen * dt);
  }

  private hurt(amount: number) {
    if (this.invuln > 0 || this.ended || this.modal) return;
    const dmg = Math.max(1, Math.round(amount - this.armor));
    this.invuln = PLAYER.iframes;
    this.hurtFlash = 0.15;
    this.cameras.main.shake(90, 0.004);
    Audio.play('sfx-hurt', 0.5, 120);
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
      const kind = e.def.kind;
      if (kind === 'boss') {
        this.updateBoss(e, dt);
      } else {
        let dx = this.px - e.x;
        let dy = this.py - e.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > 950 && kind !== 'elite') {
          const [nx, ny] = this.spawnPoint(e.radius + 30);
          e.x = nx;
          e.y = ny;
          continue;
        }
        dx /= d;
        dy /= d;
        let sp = e.speed * (e.slow > 0 ? 0.6 : 1);
        if (kind === 'gunner') {
          // 保持距離：太近就後退，適中就側移
          if (d < 170) sp = -sp * 0.8;
          else if (d < 250) {
            const side = e.phase > 5 ? 1 : -1;
            const ox = -dy * side;
            const oy = dx * side;
            dx = ox;
            dy = oy;
            sp *= 0.6;
          }
          e.gunT -= dt;
          if (e.gunT <= 0 && d < 420) {
            e.gunT = 3.2 + Math.random();
            const bx = (this.px - e.x) / d;
            const by = (this.py - e.y) / d;
            this.fireBullet(e.x, e.y, bx * 150, by * 150, e.damage, 0x9dff3d);
          }
        }
        e.x += (dx * sp + e.kx) * dt;
        e.y += (dy * sp + e.ky) * dt;
      }
      e.kx *= 0.86;
      e.ky *= 0.86;
      if (e.slow > 0) e.slow -= dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.virusT > 0) {
        e.virusT -= dt;
        e.virusTick -= dt;
        if (e.virusTick <= 0) {
          e.virusTick = 0.5;
          this.damageEnemy(e, e.virusDps * 0.5 * this.might, 0, 0, false, true);
          if (!e.active) continue;
        }
      }

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
          const push = ((min - dd) / dd) * (kind === 'boss' ? 0.05 : 0.35);
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
    const b = e.boss!;
    e.bossT += dt;
    const dx = this.px - e.x;
    const dy = this.py - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const canDash = b.variant !== 'spider';
    const canRing = b.variant !== 'spider';
    const canSpiral = b.variant !== 'oni';
    const canSummon = b.variant === 'spider';

    if (e.bossState === 'chase') {
      const sp = e.speed * (e.slow > 0 ? 0.85 : 1) * (d > 700 ? 2.5 : 1);
      e.x += (dx / d) * sp * dt;
      e.y += (dy / d) * sp * dt;
      if (canRing) {
        e.ringT -= dt;
        if (e.ringT <= 0) {
          e.ringT = b.final ? 3.6 : 5.5;
          const n = b.final ? 20 : 12;
          const off = Math.random() * Math.PI;
          for (let i = 0; i < n; i++) {
            const a = off + (i / n) * Math.PI * 2;
            this.fireBullet(e.x, e.y, Math.cos(a) * 150, Math.sin(a) * 150, e.damage * 0.6);
          }
        }
      }
      if (canSummon) {
        e.summonT -= dt;
        if (e.summonT <= 0) {
          e.summonT = 7;
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            this.spawnEnemy('drone', [e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70]);
          }
        }
      }
      if (canSpiral) {
        e.spiralT -= dt;
        if (e.spiralT <= 0 && d < 650) {
          e.bossState = 'spiral';
          e.bossT = 0;
          e.spiralT = b.final ? 9 : 5.5;
          return;
        }
      }
      if (canDash && e.bossT > (b.final ? 3.5 : 4.5) && d < 600) {
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
    } else if (e.bossState === 'dash') {
      e.x += e.aimX * 460 * dt;
      e.y += e.aimY * 460 * dt;
      if (e.bossT > 0.55) {
        e.bossState = 'chase';
        e.bossT = 0;
      }
    } else {
      // 旋轉彈幕：原地噴出 3 條旋轉的子彈
      e.fireT -= dt;
      e.spinA += dt * 2.2;
      if (e.fireT <= 0) {
        e.fireT = 0.13;
        for (let i = 0; i < 3; i++) {
          const a = e.spinA + (i / 3) * Math.PI * 2;
          this.fireBullet(e.x, e.y, Math.cos(a) * 140, Math.sin(a) * 140, e.damage * 0.5, 0xff7ad9);
        }
      }
      if (e.bossT > 2.4) {
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

  damageEnemy(e: Enemy, amount: number, kx = 0, ky = 0, fromIai = false, quiet = false) {
    if (!e.active) return;
    const dmg = Math.max(1, Math.round(amount));
    e.hp -= dmg;
    e.flash = 0.08;
    if (e.def.kind !== 'boss') {
      const res = e.def.kind === 'elite' ? 0.2 : 1;
      e.kx += kx * res;
      e.ky += ky * res;
    }
    this.showDamage(e.x, e.y - e.radius, dmg);
    if (!quiet) Audio.play('sfx-hit', 0.18, 70, 400);
    if (e.hp <= 0) this.killEnemy(e, fromIai);
  }

  private killEnemy(e: Enemy, fromIai: boolean) {
    e.active = false;
    e.img.setVisible(false);
    this.kills++;
    this.sparks.setParticleTint(e.def.color);
    const kind = e.def.kind;
    this.seenEnemies.add(e.boss ? `boss-${e.boss.variant}` : kind);
    this.sparks.explode(kind === 'boss' ? 40 : kind === 'elite' ? 18 : 5, e.x, e.y);
    Audio.play('sfx-kill', 0.22, 45, 500);
    if (!fromIai) {
      this.intent += (kind === 'elite' ? INTENT.eliteBonus : kind === 'boss' ? 0 : 1) * this.intentMult;
      this.lastKillT = this.t;
    }
    // 病毒擴散
    if (e.virusT > 0 && e.virusSpread > 0) {
      const near = this.grid.query(e.x, e.y, 130, tmp2);
      let n = e.virusSpread;
      for (const o of near) {
        if (n <= 0) break;
        if (!o.active || o === e || o.virusT > 0) continue;
        this.infect(o, e.virusDps, 3, e.virusSpread - 1);
        n--;
      }
    }
    this.dropGem(e.x, e.y, e.xp);
    if (kind === 'elite' || kind === 'boss') {
      this.dropPickup('chest', e.x + 12, e.y);
      if (kind === 'boss') {
        this.bossKills++;
        this.cameras.main.shake(300, 0.012);
        this.ui.banner(T.bossDown, '#ffc83d');
        if (!this.bosses.some((b) => b.active && b !== e)) Audio.playMusic('bgm-battle');
        if (e.boss?.final) {
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

  private infect(e: Enemy, dps: number, duration: number, spread: number) {
    e.virusT = duration;
    e.virusDps = dps;
    e.virusSpread = Math.max(0, spread);
    e.virusTick = 0.5;
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
            Audio.play('sfx-slash', 0.32, 90, 300);
            if (w.id === 'sakura') this.slashCircle(105 * s.area, dmg);
            else {
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
        case 'drones':
        case 'crows': {
          w.angle += s.speed * dt;
          const pulse = w.id === 'crows' ? 0.75 + 0.4 * Math.sin(this.t * 2.2) : 1;
          const r = 78 * s.area * pulse;
          const n = s.amount;
          const hitCd = Math.max(0.2, s.cooldown * this.cdMult);
          for (let i = 0; i < n; i++) {
            const a = w.angle + (i / n) * Math.PI * 2;
            const x = this.px + Math.cos(a) * r;
            const y = this.py + Math.sin(a) * r;
            const img = this.droneImg(droneIdx++, w.id === 'crows');
            img.setPosition(x, y).setRotation(a + Math.PI / 2);
            const near = this.grid.query(x, y, 44, tmp2);
            const hitR = w.id === 'crows' ? 18 : 12;
            for (const e of near) {
              if (!e.active) continue;
              const rr = e.radius + hitR;
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
        case 'shuriken':
        case 'fuma': {
          w.timer -= dt;
          if (w.timer <= 0) {
            const targets = this.nearestEnemies(s.amount, 420);
            if (targets.length === 0) {
              w.timer = 0.2;
              break;
            }
            w.timer = Math.max(0.25, s.cooldown * this.cdMult);
            Audio.play('sfx-throw', 0.3, 80, 300);
            for (let i = 0; i < s.amount; i++) {
              const tgt = targets[i % targets.length];
              const a0 = Math.atan2(tgt.y - this.py, tgt.x - this.px);
              const spread = i >= targets.length ? (i - targets.length + 1) * 0.3 : 0;
              const a = a0 + spread;
              this.fireProjectile(w.id, Math.cos(a) * s.speed, Math.sin(a) * s.speed, dmg, s.bounce, s.area);
            }
          }
          break;
        }
        case 'field':
        case 'raijin': {
          fieldOn = true;
          const r = 64 * s.area;
          const col = w.id === 'raijin' ? 0x7fa8ff : WEAPONS.field.color;
          this.fieldImg
            .setVisible(true)
            .setPosition(this.px, this.py)
            .setScale((2 * r) / (128 * TEX))
            .setTint(col)
            .setAlpha(0.5 + Math.sin(this.t * 6) * 0.12);
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
                this.damageEnemy(e, dmg, 0, 0, false, true);
              }
            }
          }
          if (w.id === 'raijin') {
            w.timer2 -= dt;
            if (w.timer2 <= 0) {
              w.timer2 = s.duration;
              this.lightning(s.amount, r * 2.2, dmg * 3);
            }
          }
          break;
        }
        case 'laser': {
          w.timer -= dt;
          if (w.timer <= 0) {
            const targets = this.nearestEnemies(8, 380);
            if (targets.length === 0) {
              w.timer = 0.2;
              break;
            }
            w.timer = Math.max(0.3, s.cooldown * this.cdMult);
            Audio.play('sfx-laser', 0.3, 80, 300);
            for (let i = 0; i < s.amount; i++) {
              const tgt = targets[Math.floor(Math.random() * targets.length)];
              const a = Math.atan2(tgt.y - this.py, tgt.x - this.px) + (i > 0 ? (Math.random() - 0.5) * 0.6 : 0);
              this.fireLaser(Math.cos(a), Math.sin(a), 330 * s.area, 9 * s.area, dmg);
            }
          }
          break;
        }
        case 'virus': {
          w.timer -= dt;
          if (w.timer <= 0) {
            const cands = this.nearestEnemies(s.amount + 6, 380).filter((e) => e.virusT <= 0);
            if (cands.length === 0) {
              w.timer = 0.3;
              break;
            }
            w.timer = Math.max(0.4, s.cooldown * this.cdMult);
            for (let i = 0; i < Math.min(s.amount, cands.length); i++) {
              const e = cands[i];
              this.infect(e, s.damage, s.duration, s.bounce);
              this.sparks.setParticleTint(0x5dff7a);
              this.sparks.explode(4, e.x, e.y);
            }
          }
          break;
        }
        case 'orbital': {
          w.timer -= dt;
          if (w.timer <= 0) {
            w.timer = Math.max(0.5, s.cooldown * this.cdMult);
            const onScreen = this.activeEnemies.filter(
              (e) => e.active && Math.abs(e.x - this.px) < W / 2 && Math.abs(e.y - this.py) < H / 2,
            );
            for (let i = 0; i < s.amount; i++) {
              let x: number;
              let y: number;
              if (onScreen.length) {
                const e = onScreen[Math.floor(Math.random() * onScreen.length)];
                x = e.x;
                y = e.y;
              } else {
                x = this.px + (Math.random() - 0.5) * 300;
                y = this.py + (Math.random() - 0.5) * 300;
              }
              this.addStrike(x, y, 56 * s.area, dmg);
            }
          }
          break;
        }
        case 'hook': {
          w.timer -= dt;
          if (w.timer <= 0) {
            const targets = this.nearestEnemies(s.amount + 4, 320).filter((e) => e.def.kind !== 'boss');
            if (targets.length === 0) {
              w.timer = 0.3;
              break;
            }
            w.timer = Math.max(0.4, s.cooldown * this.cdMult);
            Audio.play('sfx-throw', 0.25, 80, 600);
            // 優先抓遠一點的敵人
            const sorted = targets.reverse();
            for (let i = 0; i < Math.min(s.amount, sorted.length); i++) this.fireHook(sorted[i], s.speed, dmg, 46 * s.area);
          }
          break;
        }
      }
    }
    for (let i = droneIdx; i < this.droneImgs.length; i++) this.droneImgs[i].setVisible(false);
    if (!fieldOn) this.fieldImg.setVisible(false);
  }

  private droneImg(i: number, crow: boolean) {
    while (this.droneImgs.length <= i) {
      const key = this.textures.exists('proj-kunai') ? 'proj-kunai' : 'drone';
      this.droneImgs.push(this.add.image(0, 0, key).setScale(key === 'drone' ? 1 / TEX : 0.55).setDepth(9));
    }
    const img = this.droneImgs[i].setVisible(true);
    const base = img.texture.key === 'drone' ? 1 / TEX : 0.55;
    img.setScale(crow ? base * 1.5 : base);
    if (crow) img.setTint(0x223322);
    else img.clearTint();
    return img;
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

  private fireLaser(dx: number, dy: number, len: number, halfW: number, dmg: number) {
    const x0 = this.px;
    const y0 = this.py;
    const x1 = x0 + dx * len;
    const y1 = y0 + dy * len;
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const near = this.grid.query(mx, my, len / 2 + 30, tmp2);
    for (const e of near) {
      if (!e.active) continue;
      const ex = e.x - x0;
      const ey = e.y - y0;
      const proj = ex * dx + ey * dy;
      if (proj < 0 || proj > len) continue;
      const perp = Math.abs(ex * dy - ey * dx);
      if (perp <= halfW + e.radius) this.damageEnemy(e, dmg, dx * 120, dy * 120);
    }
    this.addSlash((g) => {
      g.lineStyle(halfW * 2.6, 0x3df5ff, 0.35);
      g.lineBetween(x0, y0, x1, y1);
      g.lineStyle(halfW * 0.9, 0xffffff, 1);
      g.lineBetween(x0, y0, x1, y1);
    }, 0.14);
  }

  private lightning(n: number, range: number, dmg: number) {
    const cands = this.activeEnemies.filter((e) => e.active && (e.x - this.px) ** 2 + (e.y - this.py) ** 2 < range * range);
    if (cands.length === 0) return;
    Audio.play('sfx-laser', 0.25, 100, 900);
    for (let i = 0; i < n; i++) {
      const e = cands[Math.floor(Math.random() * cands.length)];
      if (!e.active) continue;
      const x = e.x;
      const y = e.y;
      this.damageEnemy(e, dmg, 0, 0, false, true);
      // 同時打到附近的敵人
      for (const o of this.grid.query(x, y, 40, tmp)) if (o.active && o !== e && (o.x - x) ** 2 + (o.y - y) ** 2 < 40 * 40) this.damageEnemy(o, dmg * 0.5, 0, 0, false, true);
      this.addSlash((g) => {
        g.lineStyle(3, 0xbfd4ff, 1);
        g.beginPath();
        let lx = x + (Math.random() - 0.5) * 30;
        let ly = y - 220;
        g.moveTo(lx, ly);
        for (let k = 1; k <= 6; k++) {
          lx = x + (Math.random() - 0.5) * 24 * (1 - k / 6);
          ly = y - 220 + (220 * k) / 6;
          g.lineTo(lx, ly);
        }
        g.strokePath();
        g.fillStyle(0x7fa8ff, 0.4);
        g.fillCircle(x, y, 26);
      }, 0.18);
    }
  }

  private addStrike(x: number, y: number, r: number, dmg: number) {
    let s = this.strikes.find((q) => !q.active);
    if (!s) {
      const key = this.textures.exists('proj-reticle') ? 'proj-reticle' : 'ring';
      s = { active: false, img: this.add.image(0, 0, key).setDepth(3), x: 0, y: 0, t: 0, r: 0, damage: 0 };
      this.strikes.push(s);
    }
    Object.assign(s, { active: true, x, y, t: 0.7, r, damage: dmg });
    s.img.setPosition(x, y).setVisible(true).setAlpha(0.9).setDisplaySize(r * 2, r * 2);
  }

  private updateStrikes(dt: number) {
    for (const s of this.strikes) {
      if (!s.active) continue;
      s.t -= dt;
      s.img.setRotation(s.img.rotation + dt * 3).setAlpha(0.5 + 0.5 * Math.sin(s.t * 30));
      if (s.t > 0) continue;
      s.active = false;
      s.img.setVisible(false);
      const near = this.grid.query(s.x, s.y, s.r + 30, tmp2);
      for (const e of near) {
        if (!e.active) continue;
        const dx = e.x - s.x;
        const dy = e.y - s.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d <= s.r + e.radius * 0.5) this.damageEnemy(e, s.damage, (dx / d) * 140, (dy / d) * 140, false, true);
      }
      Audio.play('sfx-orbital', 0.32, 120);
      this.sparks.setParticleTint(0xff4d5e);
      this.sparks.explode(14, s.x, s.y);
      const x = s.x;
      const y = s.y;
      const r = s.r;
      this.addSlash((g) => {
        g.fillStyle(0xff4d5e, 0.35);
        g.fillCircle(x, y, r);
        g.fillStyle(0xffd0d8, 0.8);
        g.fillCircle(x, y, r * 0.45);
        g.lineStyle(6, 0xff4d5e, 0.6);
        g.lineBetween(x, y - 260, x, y);
      }, 0.22);
    }
  }

  private fireHook(target: Enemy, speed: number, dmg: number, radius: number) {
    let h = this.hooks.find((q) => !q.active);
    if (!h) {
      const key = this.textures.exists('proj-kunai') ? 'proj-kunai' : 'drone';
      h = { active: false, img: this.add.image(0, 0, key).setScale(0.6).setDepth(9).setTint(0xd8e0f0), x: 0, y: 0, target, speed: 0, damage: 0, radius: 0, life: 0 };
      this.hooks.push(h);
    }
    Object.assign(h, { active: true, x: this.px, y: this.py, target, speed, damage: dmg, radius, life: 1.2 });
    h.img.setVisible(true);
  }

  private updateHooks(dt: number) {
    for (const h of this.hooks) {
      if (!h.active) continue;
      h.life -= dt;
      const tx = h.target.x;
      const ty = h.target.y;
      const dx = tx - h.x;
      const dy = ty - h.y;
      const d = Math.hypot(dx, dy) || 1;
      const step = h.speed * dt;
      if (!h.target.active || h.life <= 0) {
        h.active = false;
        h.img.setVisible(false);
        continue;
      }
      if (d <= step + h.target.radius) {
        // 命中：把目標和附近的敵人拉向玩家
        const near = this.grid.query(tx, ty, h.radius + 30, tmp2);
        for (const e of near) {
          if (!e.active || e.def.kind === 'boss') continue;
          if ((e.x - tx) ** 2 + (e.y - ty) ** 2 > h.radius * h.radius && e !== h.target) continue;
          const px = this.px - e.x;
          const py = this.py - e.y;
          const pd = Math.hypot(px, py) || 1;
          const pull = Math.max(0, pd - 50) * 3.2;
          this.damageEnemy(e, h.damage, (px / pd) * pull, (py / pd) * pull);
        }
        h.active = false;
        h.img.setVisible(false);
        continue;
      }
      h.x += (dx / d) * step;
      h.y += (dy / d) * step;
      h.img.setPosition(h.x, h.y).setRotation(Math.atan2(dy, dx));
    }
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

  private fireProjectile(kind: 'shuriken' | 'fuma', vx: number, vy: number, damage: number, bounces: number, area: number) {
    let p = this.projectiles.find((x) => !x.active);
    if (!p) {
      const key = this.textures.exists('proj-shuriken') ? 'proj-shuriken' : 'shuriken';
      p = {
        active: false,
        kind,
        img: this.add.image(0, 0, key).setDepth(8),
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        damage: 0,
        bounces: 0,
        last: null,
        hits: new Set(),
        returning: false,
      };
      this.projectiles.push(p);
    }
    const base = p.img.texture.key === 'shuriken' ? 1 / TEX : 0.5;
    Object.assign(p, { active: true, kind, x: this.px, y: this.py, vx, vy, life: kind === 'fuma' ? 2.2 : 1.4, damage, bounces, last: null, returning: false });
    p.hits.clear();
    p.img.setVisible(true).setPosition(p.x, p.y).setScale(kind === 'fuma' ? base * 2.3 * area : base);
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      if (p.kind === 'fuma') {
        // 飛出去再飛回來
        if (!p.returning && p.life < 1.5) {
          p.returning = true;
          p.hits.clear();
        }
        if (p.returning) {
          const dx = this.px - p.x;
          const dy = this.py - p.y;
          const d = Math.hypot(dx, dy) || 1;
          const sp = Math.hypot(p.vx, p.vy);
          p.vx = (dx / d) * sp;
          p.vy = (dy / d) * sp;
          if (d < 20) p.life = 0;
        }
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.img.setPosition(p.x, p.y).setRotation(p.img.rotation + dt * 18);
      if (p.life <= 0) {
        p.active = false;
        p.img.setVisible(false);
        continue;
      }
      const hitR = p.kind === 'fuma' ? 26 : 8;
      const near = this.grid.query(p.x, p.y, 40 + hitR, tmp2);
      for (const e of near) {
        if (!e.active || e === p.last) continue;
        const rr = e.radius + hitR;
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        if (dx * dx + dy * dy > rr * rr) continue;
        const sp = Math.hypot(p.vx, p.vy) || 1;
        if (p.kind === 'fuma') {
          if (p.hits.has(e)) continue;
          p.hits.add(e);
          this.damageEnemy(e, p.damage, (p.vx / sp) * 100, (p.vy / sp) * 100);
          continue;
        }
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

  private fireBullet(x: number, y: number, vx: number, vy: number, damage: number, tint = 0xffffff) {
    let b = this.bullets.find((q) => !q.active);
    if (!b) {
      b = { active: false, img: this.add.image(0, 0, 'bullet').setScale(1 / TEX).setDepth(9), x: 0, y: 0, vx: 0, vy: 0, life: 0, damage: 0 };
      this.bullets.push(b);
    }
    Object.assign(b, { active: true, x, y, vx, vy, life: 5, damage });
    b.img.setVisible(true).setPosition(x, y);
    if (tint === 0xffffff) b.img.clearTint();
    else b.img.setTint(tint);
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
    p.img.setTexture(this.gemTexture(value)).setScale(1 / TEX).setVisible(true).setPosition(x, y).setDepth(1);
    this.gemCount++;
  }

  dropPickup(kind: Exclude<PickupKind, 'gem'>, x: number, y: number, value = 0) {
    const p = this.obtainPickup();
    Object.assign(p, { active: true, kind, x, y, value, flying: false, speed: 0 });
    const tex = this.textures.exists(PICKUP_TEX[kind]) ? PICKUP_TEX[kind] : kind;
    const scale = tex === kind ? 1 / TEX : kind === 'chest' ? 0.55 : 0.5;
    p.img.setTexture(tex).setScale(scale).setVisible(true).setPosition(x, y).setDepth(2);
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
        Audio.play('sfx-gem', 0.16, 45, 300);
        this.addXp(p.value * this.xpMult);
        break;
      case 'heal':
        this.hp = Math.min(this.maxHp, this.hp + DROPS.healAmount);
        Audio.play('sfx-revive', 0.3);
        break;
      case 'magnet':
        for (const q of this.pickups)
          if (q.active && q.kind === 'gem' && !q.flying) {
            q.flying = true;
            q.speed = 200;
          }
        Audio.play('sfx-chest', 0.3);
        break;
      case 'credit':
        this.credits += p.value;
        Audio.play('sfx-gem', 0.25, 45, 900);
        break;
      case 'chest':
        Audio.play('sfx-chest', 0.5);
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
        this.markSeenWeapon(evo.result);
        this.inventoryVersion++;
        this.ui.banner(T.evolved(WEAPONS[evo.result].name), '#ff7ad9', 2.6);
        this.cameras.main.flash(250, 255, 122, 217);
        Audio.play('sfx-levelup', 0.6);
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
      Audio.play('sfx-iai', 0.7);
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
      const dmg = kind === 'boss' ? e.maxHp * INTENT.bossDamagePct : kind === 'elite' ? e.maxHp * INTENT.eliteDamagePct : e.hp + 1;
      this.damageEnemy(e, dmg, 0, 0, true, true);
    }
    this.cameras.main.shake(260, 0.012);
    for (const p of this.pickups) {
      if (!p.active || p.kind !== 'gem' || p.flying) continue;
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      p.flying = true;
      p.speed = 250;
    }
    for (const b of this.bullets)
      if (b.active) {
        b.active = false;
        b.img.setVisible(false);
      }
  }

  // ---------- 升級選擇 ----------
  private validChoices(): Choice[] {
    const list: Choice[] = [];
    const hasEvolvedFrom = (id: WeaponId) => EVOLUTIONS.some((ev) => ev.weapon === id && this.weapons.some((w) => w.id === ev.result));
    for (const id of WEAPON_POOL) {
      if (hasEvolvedFrom(id) || !this.isUnlocked(id)) continue;
      const w = this.weapons.find((x) => x.id === id);
      if (w) {
        if (w.level < this.maxLevel(id)) list.push({ kind: 'weapon', id });
      } else if (this.weapons.length < RUN.weaponSlots) list.push({ kind: 'weapon', id });
    }
    for (const id of PASSIVE_POOL) {
      if (!this.isUnlocked(id)) continue;
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
          w.level = Math.min(this.maxLevel(w.id), w.level + 1);
          w.stats = this.computeStats(w.id, w.level);
        } else if (this.weapons.length < RUN.weaponSlots) this.addWeapon(c.id);
        break;
      }
      case 'passive':
        if (!this.passives.has(c.id) && this.passives.size >= RUN.passiveSlots) break;
        this.passives.set(c.id, Math.min(PASSIVES[c.id].maxLevel, this.passiveLevel(c.id) + 1));
        if (!this.save.seenPassives.includes(c.id)) this.save.seenPassives.push(c.id);
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

  choiceInfo(c: Choice): { name: string; desc: string; tag: string; icon: string; color: number; isNew: boolean; evoHint: string } {
    switch (c.kind) {
      case 'weapon': {
        const def = WEAPONS[c.id];
        const w = this.weapons.find((x) => x.id === c.id);
        const evo = EVOLUTIONS.find((e) => e.weapon === c.id);
        const evoHint = evo ? T.evoHint(PASSIVES[evo.passive].name, WEAPONS[evo.result].name) : '';
        if (!w) return { name: def.name, desc: def.desc, tag: T.isNew, icon: `icon-${c.id}`, color: def.color, isNew: true, evoHint };
        return { name: def.name, desc: def.levels[w.level - 1]?.desc ?? '', tag: T.lv(w.level, w.level + 1), icon: `icon-${c.id}`, color: def.color, isNew: false, evoHint };
      }
      case 'passive': {
        const def = PASSIVES[c.id];
        const lv = this.passives.get(c.id);
        const evo = EVOLUTIONS.find((e) => e.passive === c.id);
        const evoHint = evo ? T.evoHintP(WEAPONS[evo.weapon].name, WEAPONS[evo.result].name) : '';
        if (lv === undefined) return { name: def.name, desc: def.desc, tag: T.isNew, icon: `icon-${c.id}`, color: def.color, isNew: true, evoHint };
        return { name: def.name, desc: def.desc, tag: T.lv(lv, lv + 1), icon: `icon-${c.id}`, color: def.color, isNew: false, evoHint };
      }
      case 'heal':
        return { name: T.heal, desc: T.healDesc, tag: '', icon: 'icon-heal', color: 0x5dff7a, isNew: false, evoHint: '' };
      case 'credits':
        return { name: T.credits, desc: T.creditsDesc, tag: '', icon: 'icon-credits', color: 0xffd84d, isNew: false, evoHint: '' };
    }
  }

  private openLevelUp() {
    this.modal = true;
    this.scene.pause();
    Audio.play('sfx-levelup', 0.45, 300);
    this.ui.showLevelUp(this.level - this.pendingLevels + 1, this.rollChoices());
  }

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
      if ((e.x - this.px) ** 2 + (e.y - this.py) ** 2 < 280 * 280) this.damageEnemy(e, e.hp + 1, 0, 0, true, true);
    }
    for (const b of this.bullets)
      if (b.active) {
        b.active = false;
        b.img.setVisible(false);
      }
    this.cameras.main.flash(300, 61, 245, 255);
    Audio.play('sfx-revive', 0.6);
    this.closeModal();
  }

  endRun(victory: boolean) {
    if (this.ended) return;
    this.ended = true;
    this.modal = true;
    const wasRunning = this.scene.isActive();
    const save = this.save;
    const newBest = this.t > save.bestTime || (victory && this.kills > save.bestKills);
    const bonus = runReward({ time: this.t, kills: this.kills, bossKills: this.bossKills, victory });
    save.bestTime = Math.max(save.bestTime, this.t);
    save.bestKills = Math.max(save.bestKills, this.kills);
    save.bestLevel = Math.max(save.bestLevel, this.level);
    save.totalKills += this.kills;
    save.bossKills += this.bossKills;
    save.iaiTotal += this.iaiCount;
    save.runs++;
    if (victory) save.wins++;
    save.credits += this.credits + bonus;
    save.totalCredits += this.credits + bonus;
    save.lastChar = this.char.id;
    for (const k of this.seenEnemies) if (!save.seenEnemies.includes(k)) save.seenEnemies.push(k);
    // 檢查新解鎖
    const unlocked: string[] = [];
    for (const u of UNLOCKS) {
      if (save.unlocked.includes(u.id) || !u.check(save)) continue;
      save.unlocked.push(u.id);
      unlocked.push(u.kind === 'weapon' ? WEAPONS[u.id as WeaponId].name : PASSIVES[u.id as PassiveId].name);
    }
    writeSave(save);
    if (wasRunning) this.scene.pause();
    Audio.stopMusic();
    Audio.play(victory ? 'sfx-victory' : 'sfx-defeat', 0.6);
    const result: RunResult = { victory, time: this.t, kills: this.kills, level: this.level, credits: this.credits, bonus, newBest, unlocked };
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
  debugMaxWeapons() {
    for (const w of this.weapons) {
      w.level = this.maxLevel(w.id);
      w.stats = this.computeStats(w.id, w.level);
      const evo = EVOLUTIONS.find((e) => e.weapon === w.id);
      if (evo && !this.passives.has(evo.passive) && this.passives.size < RUN.passiveSlots) this.passives.set(evo.passive, 1);
    }
    this.recalc();
  }
  debugGive(id: WeaponId) {
    if (!this.weapons.some((w) => w.id === id)) this.addWeapon(id);
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

    // 地面圖塊
    if (this.groundTiles.length) {
      const size = this.groundSize();
      const cols = Math.ceil(W / size) + 1;
      const x0 = Math.floor((this.px - W / 2) / size) * size;
      const y0 = Math.floor((this.py - H / 2) / size) * size;
      this.groundTiles.forEach((img, i) => img.setPosition(x0 + (i % cols) * size, y0 + Math.floor(i / cols) * size));
    }

    // 影子
    const sg = this.shadowG;
    sg.clear();
    sg.fillStyle(0x000000, 0.35);
    sg.fillEllipse(this.px, this.py + 4, 26, 9);

    // 玩家：走路時上下晃動
    const blink = this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0;
    const bob = this.moving ? Math.abs(Math.sin(this.t * 12)) * 3 : Math.sin(this.t * 3) * 0.8;
    this.playerImg
      .setPosition(this.px, this.py + 6 - bob)
      .setAlpha(blink ? 0.45 : 1)
      .setFlipX(this.faceX < -0.1);
    if (this.hurtFlash > 0) this.playerImg.setTintFill(0xff3d81);
    else this.playerImg.clearTint();
    this.facingImg.setPosition(this.px + this.faceX * 26, this.py + this.faceY * 26).setRotation(Math.atan2(this.faceY, this.faceX));

    // 敵人
    for (const e of this.activeEnemies) {
      if (!e.active) continue;
      const wob = Math.sin(this.t * 8 + e.phase);
      e.img.setPosition(e.x, e.y + wob * 1.5).setFlipX(e.x > this.px);
      e.img.setScale(e.baseScale * (1 + wob * 0.03), e.baseScale * (1 - wob * 0.03));
      if (e.flash > 0) e.img.setTintFill(0xffffff);
      else if (e.virusT > 0) e.img.setTint(0x9dffb0);
      else if (e.slow > 0) e.img.setTint(0x9fb0ff);
      else e.img.clearTint();
      if (e.def.kind === 'boss' || e.def.kind === 'elite') sg.fillEllipse(e.x, e.y + e.radius * 0.8, e.radius * 2, e.radius * 0.6);
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
    // 鉤爪鎖鏈
    for (const h of this.hooks) {
      if (!h.active) continue;
      fx.lineStyle(2, 0xb8c4d8, 0.9);
      fx.lineBetween(this.px, this.py, h.x, h.y);
    }

    // 生命條
    const hb = this.hpBar;
    hb.clear();
    const bw = 40;
    hb.fillStyle(0x000000, 0.6);
    hb.fillRect(this.px - bw / 2 - 1, this.py + 13, bw + 2, 6);
    hb.fillStyle(this.hp / this.maxHp < 0.3 ? 0xff3d81 : 0x5dff7a, 1);
    hb.fillRect(this.px - bw / 2, this.py + 14, bw * (this.hp / this.maxHp), 4);
  }
}

function currentWave(t: number) {
  let seg = WAVES[0];
  for (const w of WAVES) if (t >= w.from) seg = w;
  return seg;
}

function pickWeighted(weights: Partial<Record<'drone' | 'thug' | 'husk' | 'gunner', number>>): EnemyKind {
  const entries = Object.entries(weights) as ['drone' | 'thug' | 'husk' | 'gunner', number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[0][0];
}
