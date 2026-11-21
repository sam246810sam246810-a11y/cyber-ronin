import type { Dir, Room } from './DungeonSystem';
import { SCENES, SCENE_SIZE, type NRect, type SceneDef } from '../data/scenes';

/**
 * 大地圖（探索房間）：
 * - 每間房比螢幕大，鏡頭跟隨玩家；房間形狀與擺設依房間座標＋樓層固定隨機（回到同一間長得一樣）。
 * - 碰撞：可走範圍＝房間內部 ∪ 有門那一側的走廊；擋路物（牆塊、桌子、水池…）會把角色推出去。
 * - 走廊盡頭就是下一間房：玩家走進走廊夠深就換房。
 *
 * 狀態放在模組層級（WORLD），Player / Enemy / ProjectileSystem 不用拿 scene 就能查碰撞。
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 擋路物：shots＝會不會擋子彈（水池不擋、桌子牆塊擋） */
export interface Block extends Rect {
  shots: boolean;
  kind: PropKind | 'wall';
  /** 視覺用：圖片底部對齊的 y（2.5D 前後排序） */
}

export type PropKind = 'table' | 'pond' | 'planter' | 'pillar' | 'shelf' | 'crates' | 'statue' | 'cauldron';

export interface Prop {
  kind: PropKind;
  /** 碰撞框（世界座標） */
  box: Block;
}

export interface Corridor extends Rect {
  dir: Dir;
  /** 走過這條線就換房（n/s 是 y、w/e 是 x）；沒有就用積木房間的預設 */
  exitAt?: number;
}

export interface RoomLayout {
  /** 房間內部（可走區）在世界座標的範圍 */
  interior: Rect;
  /** 整個世界（含牆、走廊）的範圍，給鏡頭邊界用 */
  world: Rect;
  shape: 'hall' | 'pillars' | 'L' | 'cross';
  walls: Block[];
  props: Prop[];
  grass: Rect[];
  corridors: Corridor[];
  /** 手工場景房間：整張圖就是這間房 */
  scene?: { key: string; flip: boolean };
  /** 沒用到的出口：畫木箱堵住 */
  plugs?: (Rect & { dir: Dir })[];
}

/** 牆、走廊尺寸 */
export const WALL = { back: 170, side: 70, bottom: 56, corridorW: 210, corridorLen: 300, door: 230 };

export const WORLD = {
  active: false,
  /** 戰鬥中門被封住：玩家不能進走廊 */
  locked: false,
  layout: undefined as RoomLayout | undefined,
  blocks: [] as Block[],
};

// ---------------- 產生房間 ----------------

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 擺設尺寸（碰撞框）與是否擋子彈 */
export const PROP_SPEC: Record<PropKind, { w: number; h: number; shots: boolean }> = {
  table: { w: 190, h: 70, shots: true },
  pond: { w: 260, h: 150, shots: false },
  planter: { w: 170, h: 60, shots: true },
  pillar: { w: 70, h: 56, shots: true },
  shelf: { w: 150, h: 50, shots: true },
  crates: { w: 110, h: 66, shots: true },
  statue: { w: 80, h: 60, shots: true },
  cauldron: { w: 150, h: 80, shots: true },
};

const overlap = (a: Rect, b: Rect, pad = 0) =>
  a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;

/**
 * 依房間類型決定大小與形狀。
 * screenW：目前畫面寬（房間至少比螢幕大一些，鏡頭才有得跟）。
 */
export function generateLayout(room: Room, floorSeed: number, screenW: number): RoomLayout {
  const rnd = mulberry(room.gx * 7349 + room.gy * 9151 + floorSeed * 104729 + 17);
  const big = room.type === 'combat' || room.type === 'elite';
  const boss = room.type === 'boss';
  const W = Math.round(screenW * (boss ? 1.45 : big ? 1.55 + rnd() * 0.6 : 1.2 + rnd() * 0.25));
  const H = Math.round(720 * (boss ? 1.45 : big ? 1.5 + rnd() * 0.5 : 1.15 + rnd() * 0.2));
  const margin = { left: WALL.side + WALL.corridorLen, top: WALL.back + WALL.corridorLen, right: WALL.side + WALL.corridorLen, bottom: WALL.bottom + WALL.corridorLen };
  const interior: Rect = { x: margin.left, y: margin.top, w: W, h: H };
  const world: Rect = { x: 0, y: 0, w: W + margin.left + margin.right, h: H + margin.top + margin.bottom };
  const cx = interior.x + W / 2;
  const cy = interior.y + H / 2;

  // 中央十字通道（通往四個門、房間中心放事件物件）不放任何東西
  const lane = 130;
  const lanes: Rect[] = [
    { x: interior.x, y: cy - lane, w: W, h: lane * 2 },
    { x: cx - lane, y: interior.y, w: lane * 2, h: H },
  ];
  const free = (r: Rect, taken: Rect[], pad = 30) =>
    !lanes.some((l) => overlap(r, l, 10)) && !taken.some((t) => overlap(r, t, pad))
    && r.x > interior.x + 20 && r.y > interior.y + 20 && r.x + r.w < interior.x + W - 20 && r.y + r.h < interior.y + H - 20;

  const shapes: RoomLayout['shape'][] = boss ? ['hall'] : big ? ['pillars', 'L', 'cross', 'hall'] : ['hall', 'pillars'];
  const shape = shapes[Math.floor(rnd() * shapes.length)];
  const walls: Block[] = [];
  const qw = W / 2 - lane - 20;
  const qh = H / 2 - lane - 20;
  if (shape === 'L') {
    // 隨機挑一個角落整塊封起來 → L 形房間
    const corner = Math.floor(rnd() * 4);
    const w = qw * (0.75 + rnd() * 0.2);
    const h = qh * (0.75 + rnd() * 0.2);
    const x = corner % 2 === 0 ? interior.x : cx + lane + 20 + (qw - w);
    const y = corner < 2 ? interior.y : cy + lane + 20 + (qh - h);
    walls.push({ x, y, w, h, shots: true, kind: 'wall' });
  } else if (shape === 'cross') {
    // 四個角落各一塊 → 十字形
    for (let c = 0; c < 4; c++) {
      const w = qw * (0.45 + rnd() * 0.25);
      const h = qh * (0.45 + rnd() * 0.25);
      const x = c % 2 === 0 ? interior.x : interior.x + W - w;
      const y = c < 2 ? interior.y : interior.y + H - h;
      walls.push({ x, y, w, h, shots: true, kind: 'wall' });
    }
  } else if (shape === 'pillars') {
    // 每個象限 1 根粗石柱
    for (let c = 0; c < 4; c++) {
      const w = 110 + rnd() * 60;
      const h = 80 + rnd() * 40;
      const x = (c % 2 === 0 ? interior.x + qw * 0.35 : cx + lane + 20 + qw * 0.45) + rnd() * 40;
      const y = (c < 2 ? interior.y + qh * 0.35 : cy + lane + 20 + qh * 0.4) + rnd() * 30;
      const r = { x, y, w, h };
      if (free(r, walls)) walls.push({ ...r, shots: true, kind: 'wall' });
    }
  }

  // 擺設：放在四個象限，不擋中央通道
  const props: Prop[] = [];
  const taken: Rect[] = [...walls];
  const pool: PropKind[] = boss ? ['pillar', 'pillar', 'statue'] : ['table', 'pond', 'planter', 'pillar', 'shelf', 'crates', 'statue', 'crates', 'planter'];
  const want = boss ? 3 : big ? 5 + Math.floor(rnd() * 4) : 3 + Math.floor(rnd() * 2);
  let usedPond = false;
  for (let tries = 0; props.length < want && tries < 80; tries++) {
    let kind = pool[Math.floor(rnd() * pool.length)];
    if (kind === 'pond' && usedPond) kind = 'crates';
    const s = PROP_SPEC[kind];
    const r = { x: interior.x + 30 + rnd() * (W - s.w - 60), y: interior.y + 40 + rnd() * (H - s.h - 80), w: s.w, h: s.h };
    if (!free(r, taken, 50)) continue;
    if (kind === 'pond') usedPond = true;
    props.push({ kind, box: { ...r, shots: s.shots, kind } });
    taken.push(r);
  }

  // 草叢（可以躲，沒有碰撞）
  const grass: Rect[] = [];
  const nGrass = boss ? 0 : big ? 2 + Math.floor(rnd() * 2) : Math.floor(rnd() * 2);
  for (let tries = 0; grass.length < nGrass && tries < 60; tries++) {
    const r = { x: interior.x + 30 + rnd() * (W - 260), y: interior.y + 40 + rnd() * (H - 200), w: 200 + rnd() * 60, h: 120 + rnd() * 40 };
    if (!free(r, taken, 20)) continue;
    grass.push(r);
    taken.push(r);
  }

  // 有門的方向開走廊
  const corridors: Corridor[] = [];
  const cw = WALL.corridorW;
  const len = WALL.corridorLen;
  if (room.doors.n) corridors.push({ dir: 'n', x: cx - cw / 2, y: interior.y - WALL.back - len + 40, w: cw, h: WALL.back + len - 40 + 4 });
  if (room.doors.s) corridors.push({ dir: 's', x: cx - cw / 2, y: interior.y + H - 4, w: cw, h: WALL.bottom + len });
  if (room.doors.w) corridors.push({ dir: 'w', x: interior.x - WALL.side - len, y: cy - cw / 2, w: WALL.side + len + 4, h: cw });
  if (room.doors.e) corridors.push({ dir: 'e', x: interior.x + W - 4, y: cy - cw / 2, w: WALL.side + len, h: cw });

  return { interior, world, shape, walls, props, grass, corridors };
}

/** 套用房間：之後碰撞查詢都以這間為準 */
export function activateLayout(l: RoomLayout | undefined): void {
  WORLD.layout = l;
  WORLD.active = !!l;
  WORLD.blocks = l ? [...l.walls, ...l.props.map((p) => p.box)] : [];
}

// ---------------- 碰撞查詢 ----------------

const inside = (r: Rect, x: number, y: number, pad: number) =>
  x >= r.x + pad && x <= r.x + r.w - pad && y >= r.y + pad && y <= r.y + r.h - pad;

function clampInto(r: Rect, x: number, y: number, pad: number): { x: number; y: number } {
  return {
    x: Math.max(r.x + pad, Math.min(r.x + r.w - pad, x)),
    y: Math.max(r.y + pad, Math.min(r.y + r.h - pad, y)),
  };
}

/**
 * 把圓形（角色）放回合法位置：先確保在可走範圍（內部，玩家另外可以進走廊），再推出擋路物。
 */
export function resolveCircle(x: number, y: number, r: number, allowCorridors: boolean): { x: number; y: number } {
  const l = WORLD.layout;
  if (!l) return { x, y };
  const areas: Rect[] = allowCorridors ? [l.interior, ...l.corridors] : [l.interior];
  if (!areas.some((a) => inside(a, x, y, r))) {
    let best = clampInto(l.interior, x, y, r);
    let bestD = (best.x - x) ** 2 + (best.y - y) ** 2;
    for (const a of areas) {
      const c = clampInto(a, x, y, Math.min(r, a.w / 2 - 1, a.h / 2 - 1));
      const d = (c.x - x) ** 2 + (c.y - y) ** 2;
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    x = best.x;
    y = best.y;
  }
  for (const b of WORLD.blocks) {
    const nx = Math.max(b.x, Math.min(b.x + b.w, x));
    const ny = Math.max(b.y, Math.min(b.y + b.h, y));
    const dx = x - nx;
    const dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = nx + (dx / d) * r;
      y = ny + (dy / d) * r;
    } else {
      // 圓心已經在方塊裡：往最近的邊推出去
      const pushL = x - b.x + r;
      const pushR = b.x + b.w - x + r;
      const pushU = y - b.y + r;
      const pushD = b.y + b.h - y + r;
      const m = Math.min(pushL, pushR, pushU, pushD);
      if (m === pushL) x = b.x - r;
      else if (m === pushR) x = b.x + b.w + r;
      else if (m === pushU) y = b.y - r;
      else y = b.y + b.h + r;
    }
  }
  return { x, y };
}

/** 子彈是否撞到會擋子彈的東西 */
export function blocksShot(x: number, y: number): boolean {
  if (!WORLD.active) return false;
  return WORLD.blocks.some((b) => b.shots && x > b.x && x < b.x + b.w && y > b.y - 30 && y < b.y + b.h);
}

/** 這個位置能不能放東西（生怪、掉落物） */
export function isFree(x: number, y: number, r: number): boolean {
  const l = WORLD.layout;
  if (!l) return true;
  if (!inside(l.interior, x, y, r)) return false;
  return !WORLD.blocks.some((b) => overlap({ x: x - r, y: y - r, w: r * 2, h: r * 2 }, b));
}

/** 從某點附近找一個空位 */
export function nearestFree(x: number, y: number, r: number): { x: number; y: number } {
  if (isFree(x, y, r)) return { x, y };
  for (let ring = 1; ring < 30; ring++) {
    const n = 12 + ring * 2;
    for (let k = 0; k < n; k++) {
      const a = (Math.PI * 2 * k) / n;
      const px = x + Math.cos(a) * ring * 30;
      const py = y + Math.sin(a) * ring * 30;
      if (isFree(px, py, r)) return { x: px, y: py };
    }
  }
  // 還找不到：整個房間掃一遍，挑離原點最近的空位
  const l = WORLD.layout;
  if (l) {
    let best: { x: number; y: number } | undefined;
    let bd = Infinity;
    for (let py = l.interior.y + r; py <= l.interior.y + l.interior.h - r; py += 24) {
      for (let px = l.interior.x + r; px <= l.interior.x + l.interior.w - r; px += 24) {
        if (!isFree(px, py, r)) continue;
        const d = (px - x) ** 2 + (py - y) ** 2;
        if (d < bd) { bd = d; best = { x: px, y: py }; }
      }
    }
    if (best) return best;
  }
  return resolveCircle(x, y, r, false);
}

/** 玩家是否在草叢裡 */
export function inGrass(x: number, y: number): boolean {
  const l = WORLD.layout;
  return !!l && l.grass.some((g) => inside(g, x, y, 0));
}

/** 玩家走進走廊夠深 → 回傳方向（換房） */
export function corridorExit(x: number, y: number): Dir | undefined {
  const l = WORLD.layout;
  if (!l) return undefined;
  const i = l.interior;
  for (const c of l.corridors) {
    if (!inside(c, x, y, 0)) continue;
    if (c.exitAt !== undefined) {
      if ((c.dir === 'n' && y < c.exitAt) || (c.dir === 's' && y > c.exitAt)
        || (c.dir === 'w' && x < c.exitAt) || (c.dir === 'e' && x > c.exitAt)) return c.dir;
      continue;
    }
    if (c.dir === 'n' && y < i.y - WALL.back - 120) return 'n';
    if (c.dir === 's' && y > i.y + i.h + WALL.bottom + 120) return 's';
    if (c.dir === 'w' && x < i.x - WALL.side - 120) return 'w';
    if (c.dir === 'e' && x > i.x + i.w + WALL.side + 120) return 'e';
  }
  return undefined;
}

/** 從某個方向進房時，玩家出現的位置（剛走出走廊、站在門口內側） */
export function entryPoint(dir: Dir): { x: number; y: number } {
  const l = WORLD.layout!;
  const i = l.interior;
  // 對準那個方向的出口（場景房間的側門不一定在正中間）
  const c = l.corridors.find((k) => k.dir === dir);
  const cx = c && (dir === 'n' || dir === 's') ? c.x + c.w / 2 : i.x + i.w / 2;
  const cy = c && (dir === 'w' || dir === 'e') ? c.y + c.h / 2 : i.y + i.h / 2;
  if (dir === 'n') return { x: cx, y: i.y + 70 };
  if (dir === 's') return { x: cx, y: i.y + i.h - 70 };
  if (dir === 'w') return { x: i.x + 70, y: cy };
  return { x: i.x + i.w - 70, y: cy };
}

// ---------------- 手工場景房間 ----------------

/**
 * 依場景資料建立房間：可走範圍＝地板＋有門的出口走廊；擋路物照圖上的位置；
 * 沒門的出口用擋路物封住（renderer 會在那裡畫木箱）。flip＝左右翻轉（西門東門互換）。
 */
export function buildSceneLayout(room: Room, def: SceneDef, flip: boolean): RoomLayout {
  const W = SCENE_SIZE.w;
  const H = SCENE_SIZE.h;
  const toRect = (r: NRect): Rect => {
    const x0 = flip ? 1 - r[2] : r[0];
    const x1 = flip ? 1 - r[0] : r[2];
    return { x: x0 * W, y: r[1] * H, w: (x1 - x0) * W, h: (r[3] - r[1]) * H };
  };
  const interior = toRect(def.floor);
  const walls: Block[] = def.blocks.map((b) => ({ ...toRect(b.r), shots: b.shots, kind: b.shots ? 'wall' : 'pond' }));
  const corridors: Corridor[] = [];
  const plugs: (Rect & { dir: Dir })[] = [];
  // 翻轉時，圖上的西門變成東門
  const src: Record<Dir, NRect> = flip ? { ...def.exits, w: def.exits.e, e: def.exits.w } : def.exits;
  for (const dir of ['n', 's', 'w', 'e'] as Dir[]) {
    const r = toRect(src[dir]);
    if (room.doors[dir]) {
      const exitAt = dir === 'n' ? r.y + r.h * 0.35 : dir === 's' ? r.y + r.h * 0.75
        : dir === 'w' ? r.x + r.w * 0.35 : r.x + r.w * 0.65;
      corridors.push({ ...r, dir, exitAt });
    } else {
      // 封住：門口那一段放擋路物
      const plug = dir === 'n' ? { x: r.x - 10, y: interior.y - 40, w: r.w + 20, h: 60 }
        : dir === 's' ? { x: r.x - 10, y: interior.y + interior.h - 30, w: r.w + 20, h: 60 }
          : dir === 'w' ? { x: interior.x - 30, y: r.y, w: 70, h: r.h }
            : { x: interior.x + interior.w - 40, y: r.y, w: 70, h: r.h };
      plugs.push({ ...plug, dir });
      walls.push({ ...plug, shots: true, kind: 'crates' });
    }
  }
  return {
    interior,
    world: { x: 0, y: 0, w: W, h: H },
    shape: 'hall',
    walls,
    props: [],
    grass: def.grass.map(toRect),
    corridors,
    scene: { key: def.key, flip },
    plugs,
  };
}

/** 依房型挑一張場景（同一間房固定、相鄰房盡量不同） */
export function pickScene(room: Room, seed: number): { def: SceneDef; flip: boolean } {
  const want = room.type === 'boss' ? 'boss' : room.type === 'start' ? 'start'
    : room.type === 'combat' || room.type === 'elite' ? 'combat' : 'calm';
  const pool = SCENES.filter((s) => s.tags.includes(want));
  const list = pool.length ? pool : SCENES;
  const h = Math.abs(Math.imul(room.gx * 73856093 ^ room.gy * 19349663, 2654435761) + seed) >>> 0;
  return { def: list[h % list.length], flip: ((h >> 8) & 1) === 1 };
}

/** 這個圓（敵人）放在這裡會不會撞到擋路物或走出地板 */
export function circleBlocked(x: number, y: number, r: number): boolean {
  const l = WORLD.layout;
  if (!l) return false;
  const i = l.interior;
  if (x < i.x + r || x > i.x + i.w - r || y < i.y + r || y > i.y + i.h - r) return true;
  for (const b of WORLD.blocks) {
    const nx = Math.max(b.x, Math.min(b.x + b.w, x));
    const ny = Math.max(b.y, Math.min(b.y + b.h, y));
    if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) return true;
  }
  return false;
}
