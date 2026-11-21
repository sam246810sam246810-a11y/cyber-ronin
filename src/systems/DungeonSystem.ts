import { ARENA, ARENA_BOTTOM, ARENA_RIGHT, RARITY } from '../config';
import { ENEMIES, FLOORS_PER_REGION, FUN, REGIONS } from '../data';
import type { Enemy } from '../entities/Enemy';
import { FlowerBoss } from '../entities/bosses/FlowerBoss';
import { MagmaSnail } from '../entities/bosses/MagmaSnail';
import { ThunderKing } from '../entities/bosses/ThunderKing';
import { Beetle } from '../entities/enemies/Beetle';
import { Bomber } from '../entities/enemies/Bomber';
import { Crawler } from '../entities/enemies/Crawler';
import { Hopper } from '../entities/enemies/Hopper';
import { Spitter } from '../entities/enemies/Spitter';
import { Splitter } from '../entities/enemies/Splitter';
import { Wisp } from '../entities/enemies/Wisp';
import type { GameScene } from '../scenes/GameScene';
import type { Material, MinionType, NpcKind, RegionDef, RegionEnemy, RoomModId, RoomType } from '../types';
import { dist, pick, rand, shuffle } from '../utils';
import type { EventKind } from './EventSystem';
import { Sound } from './SoundSystem';
import { rollWeapon } from './WeaponSystem';

export type Dir = 'n' | 's' | 'e' | 'w';
export const DIRS: Record<Dir, { dx: number; dy: number; opposite: Dir }> = {
  n: { dx: 0, dy: -1, opposite: 's' },
  s: { dx: 0, dy: 1, opposite: 'n' },
  e: { dx: 1, dy: 0, opposite: 'w' },
  w: { dx: -1, dy: 0, opposite: 'e' },
};

export interface ShopItem {
  id: 'heal' | 'epic' | 'legendary' | 'card_rare' | 'card_epic' | 'weapon';
  weaponId?: string;
  label: string;
  desc: string;
  price: number;
  sold: boolean;
}

export interface Room {
  gx: number;
  gy: number;
  type: RoomType;
  depth: number;
  doors: Partial<Record<Dir, boolean>>;
  visited: boolean;
  cleared: boolean;
  /** 寶箱已開、事件已用、精英已挑戰 */
  used: boolean;
  /** 離開時留在地上的素材 */
  stash: { mat: Material; x: number; y: number; life: number }[];
  /** 地上的武器 */
  weapons: { id: string; x: number; y: number }[];
  eventKind?: EventKind;
  shop?: ShopItem[];
  /** 房間詞條（祝福 / 詛咒） */
  mod?: RoomModId;
  /** 清空後出現的 NPC */
  npc?: NpcKind;
  npcDone?: boolean;
}

export const isRift = (r?: Room) => r?.type === 'rift_past' || r?.type === 'rift_future';

export type DungeonPhase = 'explore' | 'combat' | 'boss' | 'cards' | 'victory' | 'defeat';

interface QueuedSpawn {
  at: number;
  type: MinionType;
  elite: boolean;
}

const GRID = 7;

/**
 * 爬塔地下城：3 區 × 3 層，每層隨機生成 9～11 間房的格狀地圖。
 * 戰鬥房進入後關門，兩波清完開門；第 3 層盡頭是 Boss 房，其餘層盡頭是樓梯。
 */
export class DungeonSystem {
  phase: DungeonPhase = 'explore';
  regionIndex = 0;
  /** 區域內第幾層，1-based */
  floor = 1;
  rooms: Room[] = [];
  current!: Room;
  boss?: Enemy;
  private queue: QueuedSpawn[] = [];
  private pendingSpawns = 0;
  private wavesLeft: QueuedSpawn[][] = [];
  private phaseTime = 0;
  /** 時空裂縫：結束後要回去的房間 */
  private riftReturn?: { room: Room; fromDir: Dir };
  /** 時間旅商：下一次穿門必定進入裂縫 */
  forceRift = false;

  constructor(private game: GameScene) {}

  get region(): RegionDef {
    return REGIONS[this.regionIndex];
  }

  /** 敵人血量倍率：區域倍率 × 層數成長 */
  get hpMul(): number {
    if (this.current?.type === 'rift_past') return 0.8;
    if (this.current?.type === 'rift_future') {
      const next = REGIONS[Math.min(REGIONS.length - 1, this.regionIndex + 1)];
      return next.hpMul * (this.regionIndex >= REGIONS.length - 1 ? 1.5 : 1.25);
    }
    return this.region.hpMul * (1 + 0.15 * (this.floor - 1));
  }

  get globalFloor(): number {
    return this.regionIndex * FLOORS_PER_REGION + this.floor;
  }

  /** 稀有度權重用的進度（對應舊版的波數尺度） */
  get depthIndex(): number {
    return (this.globalFloor - 1) * 2 + (this.current?.depth ?? 0) * 0.3;
  }

  get isBossFloor(): boolean {
    return this.floor === FLOORS_PER_REGION;
  }

  get label(): string {
    if (this.current?.type === 'rift_past') return '時空裂縫・過去';
    if (this.current?.type === 'rift_future') return '時空裂縫・未來';
    return `${this.region.name} ${this.regionIndex + 1}-${this.floor}`;
  }

  get inRift(): boolean {
    return isRift(this.current);
  }

  get combatActive(): boolean {
    return this.phase === 'combat' || this.phase === 'boss';
  }

  roomAt(gx: number, gy: number): Room | undefined {
    return this.rooms.find((r) => r.gx === gx && r.gy === gy);
  }

  start(): void {
    this.game.onRegionEnter(this.region, this.regionIndex);
    this.generateFloor();
    this.enter(this.rooms[0]);
  }

  // ---- 地圖生成 ----

  private generateFloor(): void {
    const target = 9 + this.regionIndex;
    const c = Math.floor(GRID / 2);
    const cells = new Map<string, { gx: number; gy: number }>();
    const key = (x: number, y: number) => `${x},${y}`;
    cells.set(key(c, c), { gx: c, gy: c });
    const neighbors = (x: number, y: number) =>
      (Object.values(DIRS)).filter((d) => cells.has(key(x + d.dx, y + d.dy))).length;
    let guard = 0;
    while (cells.size < target && guard++ < 2000) {
      const from = pick([...cells.values()]);
      const d = pick(Object.values(DIRS));
      const nx = from.gx + d.dx;
      const ny = from.gy + d.dy;
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID || cells.has(key(nx, ny))) continue;
      // 偏好長出分支：新格子旁邊已有太多房就常常跳過
      if (neighbors(nx, ny) > 1 && Math.random() < 0.7) continue;
      cells.set(key(nx, ny), { gx: nx, gy: ny });
    }

    this.rooms = [...cells.values()].map((p) => ({
      gx: p.gx, gy: p.gy, type: 'combat' as RoomType, depth: 0, doors: {},
      visited: false, cleared: false, used: false, stash: [], weapons: [],
    }));
    for (const r of this.rooms) {
      for (const [dir, d] of Object.entries(DIRS) as [Dir, typeof DIRS.n][]) {
        if (this.roomAt(r.gx + d.dx, r.gy + d.dy)) r.doors[dir] = true;
      }
    }
    // BFS 深度
    const start = this.roomAt(c, c)!;
    start.type = 'start';
    start.cleared = true;
    const seen = new Set<Room>([start]);
    const q: Room[] = [start];
    while (q.length) {
      const r = q.shift()!;
      for (const [dir, d] of Object.entries(DIRS) as [Dir, typeof DIRS.n][]) {
        if (!r.doors[dir]) continue;
        const n = this.roomAt(r.gx + d.dx, r.gy + d.dy)!;
        if (seen.has(n)) continue;
        n.depth = r.depth + 1;
        seen.add(n);
        q.push(n);
      }
    }
    // 起點放第一個
    this.rooms.sort((a, b) => (a === start ? -1 : b === start ? 1 : 0));

    // 指定特殊房：盡頭優先
    const others = this.rooms.filter((r) => r !== start);
    const deadEnds = others.filter((r) => Object.keys(r.doors).length === 1).sort((a, b) => b.depth - a.depth);
    const pool = [...deadEnds, ...shuffle(others.filter((r) => !deadEnds.includes(r)))];
    const take = (pred: (r: Room) => boolean = () => true) => {
      const i = pool.findIndex((r) => r.type === 'combat' && pred(r));
      return i >= 0 ? pool[i] : undefined;
    };
    const exit = deadEnds[0] ?? others.sort((a, b) => b.depth - a.depth)[0];
    exit.type = this.isBossFloor ? 'boss' : 'exit';
    exit.cleared = !this.isBossFloor;
    const specials: RoomType[] = ['treasure', 'shop', 'elite'];
    if (Math.random() < 0.6) specials.push('event');
    for (const t of shuffle(specials)) {
      const r = take((x) => x.depth >= 1);
      if (!r) break;
      r.type = t;
      r.cleared = t !== 'elite';
      if (t === 'event') r.eventKind = Math.random() < 0.5 ? 'fountain' : 'merchant';
      if (t === 'shop') r.shop = this.rollShop();
    }
    // 房間詞條與 NPC
    for (const r of this.rooms) {
      if (r.type === 'combat' && Math.random() < FUN.roomModChance) r.mod = pick(FUN.mods).id;
    }
    const combatRooms = this.rooms.filter((r) => r.type === 'combat');
    if (combatRooms.length && Math.random() < FUN.npcChance) {
      pick(combatRooms).npc = pick(Object.keys(FUN.npcs) as NpcKind[]);
    }
    // 至少留 3 間戰鬥房，不足就把事件房改回戰鬥
    while (this.rooms.filter((r) => r.type === 'combat').length < 3) {
      const r = this.rooms.find((x) => x.type === 'event' || x.type === 'treasure');
      if (!r) break;
      r.type = 'combat';
      r.cleared = false;
    }
  }

  private rollShop(): ShopItem[] {
    const m = 1 + 0.35 * this.regionIndex;
    const all: ShopItem[] = [
      { id: 'heal', label: '療傷藥', desc: '回復 2 點血', price: Math.round(12 * m), sold: false },
      { id: 'epic', label: '史詩素材', desc: '隨機元素的史詩素材 ×1', price: Math.round(16 * m), sold: false },
      { id: 'legendary', label: '傳說素材', desc: '隨機元素的傳說素材 ×1', price: Math.round(36 * m), sold: false },
      { id: 'card_rare', label: '突變卡', desc: '抽一次突變卡（保底稀有）', price: Math.round(24 * m), sold: false },
      { id: 'card_epic', label: '珍稀突變卡', desc: '抽一次突變卡（保底史詩）', price: Math.round(42 * m), sold: false },
    ];
    const w = rollWeapon([30, 45, 20, 5 + this.regionIndex * 4], 1);
    const weapon: ShopItem = {
      id: 'weapon', weaponId: w.id, label: `【${RARITY[w.rarity].name}】${w.name}`, desc: w.desc,
      price: Math.round([12, 30, 50, 80][w.rarity] * m), sold: false,
    };
    return [all[0], weapon, ...shuffle(all.slice(1)).slice(0, 2)];
  }

  // ---- 換房 ----

  /** 走進某個方向的門 */
  go(dir: Dir): void {
    if (this.phase !== 'explore' || !this.current.doors[dir]) return;
    const d = DIRS[dir];
    const next = this.roomAt(this.current.gx + d.dx, this.current.gy + d.dy);
    if (!next) return;
    const riftable = !['start', 'exit', 'boss'].includes(next.type) && !this.inRift;
    if (riftable && (this.forceRift || Math.random() < FUN.riftChance)) {
      this.forceRift = false;
      const kind: RoomType = Math.random() < 0.5 ? 'rift_past' : 'rift_future';
      this.riftReturn = { room: next, fromDir: d.opposite };
      this.game.riftTransition(kind === 'rift_future', () => this.enterRift(kind));
      return;
    }
    this.game.transition(() => this.enter(next, d.opposite));
  }

  private enterRift(kind: RoomType): void {
    const rift: Room = {
      gx: -99, gy: -99, type: kind, depth: this.current.depth + 1, doors: {},
      visited: true, cleared: false, used: false, stash: [], weapons: [],
    };
    this.enter(rift);
    this.game.time.delayedCall(1200, () => {
      if (this.current === rift) this.startCombat(kind === 'rift_future');
    });
  }

  /** 從裂縫回到原本要去的房間 */
  leaveRift(): void {
    const back = this.riftReturn;
    if (!back || !this.inRift) return;
    this.riftReturn = undefined;
    this.game.riftTransition(false, () => {
      this.game.onRiftExit(this.region);
      this.enter(back.room, back.fromDir);
    });
  }

  private enter(room: Room, fromDir?: Dir): void {
    const prev = this.current;
    this.current = room;
    room.visited = true;
    this.phase = 'explore';
    this.phaseTime = 0;
    this.game.onRoomEnter(room, prev, fromDir);
    if (!room.cleared && room.type === 'combat') {
      this.game.time.delayedCall(450, () => {
        if (this.current === room && !room.cleared) this.startCombat(false);
      });
    }
    if (!room.cleared && room.type === 'boss') this.startBoss();
  }

  /** 精英挑戰房：碰祭壇後開始 */
  startEliteChallenge(): void {
    if (this.current.type === 'elite' && !this.current.cleared) this.startCombat(true);
  }

  startCombat(elite: boolean): void {
    if (this.current.mod) this.game.onRoomModStart(this.current.mod);
    this.phase = 'combat';
    this.phaseTime = 0;
    this.game.setDoorsLocked(true);
    let budget = this.region.roomBudget[this.floor - 1] * (elite ? 1.2 : 1) * (1 + 0.04 * this.current.depth);
    let pool: RegionEnemy[] = this.region.enemies.filter((e) => e.minFloor <= this.floor);
    if (this.current.type === 'rift_past') {
      budget = 12;
      pool = REGIONS[0].enemies;
      elite = false;
    } else if (this.current.type === 'rift_future') {
      const next = REGIONS[Math.min(REGIONS.length - 1, this.regionIndex + 1)];
      budget = next.roomBudget[2] * 1.1;
      pool = next.enemies;
    }
    const makeWave = (b: number, forcedElites: number) => {
      const list: QueuedSpawn[] = [];
      let left = b;
      let guard = 0;
      while (left > 0 && guard++ < 100) {
        const total = pool.reduce((s, e) => s + e.weight, 0);
        let r = Math.random() * total;
        const e = pool.find((x) => (r -= x.weight) < 0) ?? pool[0];
        list.push({ at: 0, type: e.type, elite: Math.random() < 0.03 + 0.02 * this.floor });
        left -= e.cost;
      }
      for (let i = 0; i < forcedElites && i < list.length; i++) list[i].elite = true;
      shuffle(list).forEach((s, i) => (s.at = i * (2.6 / Math.max(1, list.length)) + rand(0, 0.2)));
      return list.sort((a, b) => a.at - b.at);
    };
    this.wavesLeft = [makeWave(budget * 0.45, elite ? 1 : 0), makeWave(budget * 0.55, elite ? 2 : 0)];
    this.queue = this.wavesLeft.shift()!;
    if (elite && !this.inRift) this.game.showBanner('精英挑戰！');
  }

  private startBoss(): void {
    this.phase = 'boss';
    this.game.setDoorsLocked(true);
    const type = this.region.boss;
    const def = ENEMIES[type];
    this.game.showBanner(`${def.name} 來襲！`);
    Sound.play('boss');
    const x = (ARENA.x + ARENA_RIGHT) / 2;
    const y = ARENA.y + 200;
    this.game.telegraphs.add({
      duration: 1.6,
      color: 0xb06bff,
      shape: { kind: 'circle', x, y, r: def.radius * 1.4 },
      onDone: () => {
        const B = type === 'boss_snail' ? MagmaSnail : type === 'boss_king' ? ThunderKing : FlowerBoss;
        this.boss = new B(this.game, def, x, y);
        this.game.addEnemy(this.boss);
      },
    });
  }

  update(dt: number): void {
    this.phaseTime += dt;
    if (this.phase === 'combat') {
      while (this.queue.length && this.queue[0].at <= this.phaseTime) {
        const s = this.queue.shift()!;
        this.spawnEnemy(s.type, undefined, undefined, s.elite);
      }
      if (!this.queue.length && this.pendingSpawns === 0 && this.game.enemies.length === 0) {
        if (this.wavesLeft.length) {
          this.queue = this.wavesLeft.shift()!;
          this.phaseTime = -0.6;
        } else {
          this.roomCleared();
        }
      }
    } else if (this.phase === 'boss') {
      if (this.boss && !this.boss.alive) {
        this.boss = undefined;
        this.killAll();
        this.current.cleared = true;
        this.game.setDoorsLocked(false);
        if (this.regionIndex >= REGIONS.length - 1) {
          this.phase = 'victory';
          this.game.onVictory();
        } else {
          this.phase = 'cards';
          this.game.onBossCleared(this.region);
        }
      }
    }
  }

  private roomCleared(): void {
    const room = this.current;
    room.cleared = true;
    this.phase = 'explore';
    this.game.setDoorsLocked(false);
    this.game.onRoomCleared(room);
  }

  /** 卡片選完（Boss / 精英房） */
  afterCards(): void {
    if (this.phase === 'cards') this.phase = 'explore';
  }

  /** 走上樓梯 */
  nextFloor(): void {
    if (this.floor >= FLOORS_PER_REGION) {
      this.regionIndex++;
      this.floor = 1;
      this.game.onRegionEnter(this.region, this.regionIndex);
    } else {
      this.floor++;
    }
    this.generateFloor();
    this.game.onFloorEnter(this.globalFloor);
    this.enter(this.rooms[0]);
    this.game.showBanner(this.floor === 1 ? `第 ${this.regionIndex + 1} 區　${this.region.name}` : `${this.label}`);
  }

  spawnEnemy(type: MinionType, x?: number, y?: number, elite = false, portal = 0.6): void {
    const def = ENEMIES[type];
    const r = def.radius * (elite ? 1.3 : 1);
    if (x === undefined || y === undefined) {
      const pos = this.randomPoint(type === 'spitter' || type === 'wisp' ? 300 : 230);
      x = pos.x;
      y = pos.y;
    }
    x = Math.max(ARENA.x + r, Math.min(ARENA_RIGHT - r, x));
    y = Math.max(ARENA.y + r, Math.min(ARENA_BOTTOM - r, y));
    this.pendingSpawns++;
    const sx = x;
    const sy = y;
    const room = this.current;
    this.game.telegraphs.add({
      duration: portal,
      color: 0xb06bff,
      shape: { kind: 'circle', x: sx, y: sy, r: r + 6 },
      onDone: () => {
        this.pendingSpawns--;
        if (!this.combatActive || this.current !== room) return;
        this.game.addEnemy(this.create(type, sx, sy, elite));
      },
    });
  }

  private create(type: MinionType, x: number, y: number, elite: boolean): Enemy {
    const def = ENEMIES[type];
    switch (type) {
      case 'crawler': return new Crawler(this.game, def, x, y, elite, 'triangle');
      case 'spitter': return new Spitter(this.game, def, x, y, elite, 'flower');
      case 'hopper': return new Hopper(this.game, def, x, y, elite, 'mushroom');
      case 'bomber': return new Bomber(this.game, def, x, y, elite, 'bomb');
      case 'beetle': return new Beetle(this.game, def, x, y, elite, 'beetle');
      case 'splitter': return new Splitter(this.game, def, x, y, elite, 'slime');
      case 'wisp': return new Wisp(this.game, def, x, y, elite, 'wisp');
    }
  }

  private randomPoint(minDist: number): { x: number; y: number } {
    const p = this.game.player;
    let pt = { x: 0, y: 0 };
    for (let i = 0; i < 16; i++) {
      pt = { x: rand(ARENA.x + 50, ARENA_RIGHT - 50), y: rand(ARENA.y + 50, ARENA_BOTTOM - 50) };
      if (dist(pt.x, pt.y, p.x, p.y) >= minDist) break;
    }
    return pt;
  }

  killAll(): void {
    for (let i = 0; i < 5 && this.game.enemies.some((e) => e.alive); i++) {
      [...this.game.enemies].forEach((e) => e.takeDamage(99999, { flash: false }));
    }
  }

  // ---- debug ----
  debugSkip(): void {
    this.queue = [];
    this.wavesLeft = [];
    this.killAll();
  }

  debugNextFloor(): void {
    if (this.phase === 'victory') return;
    this.debugSkip();
    this.phase = 'explore';
    this.game.setDoorsLocked(false);
    if (this.regionIndex >= REGIONS.length - 1 && this.isBossFloor) return;
    this.nextFloor();
  }

  /** 直接到本區 Boss 層的 Boss 房 */
  debugToBoss(): void {
    this.debugSkip();
    this.phase = 'explore';
    while (!this.isBossFloor) this.floor++;
    this.generateFloor();
    const boss = this.rooms.find((r) => r.type === 'boss')!;
    this.enter(boss, 's');
  }
}
