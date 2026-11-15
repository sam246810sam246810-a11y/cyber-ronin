// 產生佔位像素素材：tileset、主角與 NPC spritesheet、所有 Tiled 地圖（JSON）。
// 之後換成正式素材包時，只要保持相同的 tile 編號或重做地圖即可。
// 執行：npm run assets
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

const T = 16;

// ---------- PNG 編碼 ----------
function png(w, h, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

class Canvas {
  constructor(w, h) { this.w = w; this.h = h; this.buf = Buffer.alloc(w * h * 4); }
  px(x, y, c) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || c == null) return;
    const i = (y * this.w + x) * 4;
    this.buf[i] = (c >> 16) & 255; this.buf[i + 1] = (c >> 8) & 255; this.buf[i + 2] = c & 255; this.buf[i + 3] = 255;
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
  save(path) { writeFileSync(path, png(this.w, this.h, this.buf)); }
}

let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// ---------- Tileset ----------
// 編號（0 起算）＝ spritesheet frame；Tiled gid = 編號 + 1。collides 寫進 tile 屬性。
// 25–29 是「物件」用的圖（透明背景），只當精靈使用，不放進 tile 圖層。
const TILES = [
  { name: 'grass' }, { name: 'grass_flower' }, { name: 'path' }, { name: 'water', collides: true },
  { name: 'tree', collides: true }, { name: 'wall', collides: true }, { name: 'roof', collides: true }, { name: 'fence', collides: true },
  { name: 'lantern', collides: true }, { name: 'torii_pillar', collides: true }, { name: 'torii_top', collides: true }, { name: 'stone_floor' },
  { name: 'door' }, { name: 'bamboo', collides: true }, { name: 'rock', collides: true }, { name: 'bridge' },
  { name: 'wood_floor' }, { name: 'tatami' }, { name: 'inner_wall', collides: true }, { name: 'mat' },
  { name: 'shelf', collides: true }, { name: 'counter', collides: true }, { name: 'futon', collides: true }, { name: 'anvil', collides: true },
  { name: 'altar', collides: true }, { name: 'chest_closed' }, { name: 'chest_open' }, { name: 'shimenawa' },
  { name: 'well' }, { name: 'sign' }, { name: 'irori', collides: true }, { name: 'bamboo_secret' },
];
const COLS = 8;
const ts = new Canvas(COLS * T, Math.ceil(TILES.length / COLS) * T);

const C = {
  grass: 0x5b9a4a, grassD: 0x4a8240, grassL: 0x74b35a, path: 0xc9a66b, pathD: 0xb08d55,
  water: 0x3f7fbf, waterL: 0x7fb3e0, trunk: 0x6b4428, leaf: 0x2f6b3a, leafL: 0x3f8a48,
  wall: 0xe8dcc0, wood: 0x7a5232, woodL: 0xa8794a, woodD: 0x5a3a20, roof: 0x3b4a6b, roofL: 0x56688f, red: 0xc23b2f, redD: 0x8f2a22,
  stone: 0x9a9a92, stoneD: 0x77776f, stoneL: 0xb8b8ae, bamboo: 0x7fae4a, bambooD: 0x5a8a34, flower: 0xf0d0e0, yellow: 0xf2c94c,
  tatami: 0xc8c27a, tatamiD: 0x8a9a4a, white: 0xf4f4f0, blue: 0x3f5f9f, dark: 0x222222, straw: 0xd9c27a, ember: 0xe8823a,
};

function grassBase(ox, oy) {
  ts.rect(ox, oy, T, T, C.grass);
  for (let i = 0; i < 14; i++) ts.px(ox + Math.floor(rnd() * T), oy + Math.floor(rnd() * T), rnd() > 0.5 ? C.grassD : C.grassL);
}
function woodFloor(ox, oy) {
  ts.rect(ox, oy, T, T, C.woodL);
  for (let y = 3; y < T; y += 4) ts.rect(ox, oy + y, T, 1, C.wood);
  ts.px(ox + 5, oy + 1, C.wood); ts.px(ox + 11, oy + 5, C.wood); ts.px(ox + 3, oy + 9, C.wood); ts.px(ox + 13, oy + 13, C.wood);
}
function bamboo(ox, oy) {
  grassBase(ox, oy);
  for (const x of [2, 7, 12]) { ts.rect(ox + x, oy, 2, T, C.bamboo); ts.rect(ox + x, oy + 5, 2, 1, C.bambooD); ts.rect(ox + x, oy + 11, 2, 1, C.bambooD); }
}

const draw = {
  grass: grassBase,
  grass_flower(ox, oy) {
    grassBase(ox, oy);
    for (const [x, y] of [[3, 4], [11, 9], [6, 12]]) { ts.px(ox + x, oy + y, C.flower); ts.px(ox + x + 1, oy + y, C.yellow); }
  },
  path(ox, oy) {
    ts.rect(ox, oy, T, T, C.path);
    for (let i = 0; i < 10; i++) ts.px(ox + Math.floor(rnd() * T), oy + Math.floor(rnd() * T), C.pathD);
  },
  water(ox, oy) {
    ts.rect(ox, oy, T, T, C.water);
    for (const [x, y] of [[2, 4], [9, 7], [4, 12], [12, 13]]) ts.rect(ox + x, oy + y, 3, 1, C.waterL);
  },
  tree(ox, oy) {
    grassBase(ox, oy);
    ts.rect(ox + 6, oy + 11, 4, 5, C.trunk);
    ts.rect(ox + 2, oy + 1, 12, 11, C.leaf);
    ts.rect(ox + 4, oy + 2, 5, 4, C.leafL);
  },
  wall(ox, oy) {
    ts.rect(ox, oy, T, T, C.wall);
    ts.rect(ox, oy, 2, T, C.wood); ts.rect(ox + 14, oy, 2, T, C.wood); ts.rect(ox, oy + 7, T, 2, C.wood);
  },
  roof(ox, oy) {
    ts.rect(ox, oy, T, T, C.roof);
    for (let y = 0; y < T; y += 4) ts.rect(ox, oy + y, T, 1, C.roofL);
  },
  fence(ox, oy) {
    grassBase(ox, oy);
    ts.rect(ox, oy + 6, T, 2, C.wood); ts.rect(ox, oy + 11, T, 2, C.wood);
    ts.rect(ox + 2, oy + 4, 2, 11, C.wood); ts.rect(ox + 12, oy + 4, 2, 11, C.wood);
  },
  lantern(ox, oy) {
    ts.rect(ox, oy, T, T, C.stoneL);
    ts.rect(ox + 6, oy + 9, 4, 6, C.stone); ts.rect(ox + 3, oy + 2, 10, 2, C.stoneD);
    ts.rect(ox + 5, oy + 4, 6, 5, C.stone); ts.rect(ox + 7, oy + 5, 2, 3, C.yellow); ts.rect(ox + 4, oy + 14, 8, 2, C.stoneD);
  },
  torii_pillar(ox, oy) {
    ts.rect(ox, oy, T, T, C.stoneL);
    ts.rect(ox + 5, oy, 6, T, C.red); ts.rect(ox + 9, oy, 2, T, C.redD);
  },
  torii_top(ox, oy) {
    ts.rect(ox, oy, T, T, C.stoneL);
    ts.rect(ox, oy + 2, T, 3, C.dark); ts.rect(ox, oy + 5, T, 3, C.red); ts.rect(ox, oy + 11, T, 2, C.red);
  },
  stone_floor(ox, oy) {
    ts.rect(ox, oy, T, T, C.stoneL);
    ts.rect(ox, oy + 7, T, 1, C.stone); ts.rect(ox + 7, oy, 1, 7, C.stone); ts.rect(ox + 3, oy + 8, 1, 8, C.stone); ts.rect(ox + 12, oy + 8, 1, 8, C.stone);
  },
  door(ox, oy) {
    ts.rect(ox, oy, T, T, C.wall);
    ts.rect(ox + 3, oy + 2, 10, 14, C.wood); ts.rect(ox + 7, oy + 2, 1, 14, C.trunk); ts.px(ox + 10, oy + 9, C.yellow);
    ts.rect(ox + 4, oy + 3, 3, 5, C.wall); ts.rect(ox + 9, oy + 3, 3, 5, C.wall); // 障子窗格
  },
  bamboo,
  rock(ox, oy) {
    grassBase(ox, oy);
    ts.rect(ox + 3, oy + 5, 10, 9, C.stone); ts.rect(ox + 4, oy + 5, 5, 3, C.stoneL); ts.rect(ox + 3, oy + 12, 10, 2, C.stoneD);
  },
  bridge(ox, oy) {
    ts.rect(ox, oy, T, T, C.water);
    ts.rect(ox, oy + 1, T, 14, C.wood);
    for (let x = 0; x < T; x += 4) ts.rect(ox + x, oy + 1, 1, 14, C.trunk);
  },
  wood_floor: woodFloor,
  tatami(ox, oy) {
    ts.rect(ox, oy, T, T, C.tatami);
    ts.rect(ox, oy, T, 1, C.tatamiD); ts.rect(ox, oy, 1, T, C.tatamiD);
    for (let y = 2; y < T; y += 2) ts.rect(ox + 2, oy + y, 13, 1, 0xbdb66c);
  },
  inner_wall(ox, oy) {
    ts.rect(ox, oy, T, T, C.wall);
    ts.rect(ox, oy + 12, T, 4, C.wood); ts.rect(ox, oy, T, 2, C.woodD); ts.rect(ox + 7, oy + 2, 2, 10, C.wood);
  },
  mat(ox, oy) {
    woodFloor(ox, oy);
    ts.rect(ox + 1, oy + 3, 14, 12, C.redD); ts.rect(ox + 2, oy + 4, 12, 10, C.red);
    ts.rect(ox + 6, oy + 12, 4, 2, C.yellow); // 往下的提示
  },
  shelf(ox, oy) {
    woodFloor(ox, oy);
    ts.rect(ox + 1, oy, 14, 14, C.wood); ts.rect(ox + 2, oy + 1, 12, 5, C.woodD); ts.rect(ox + 2, oy + 7, 12, 5, C.woodD);
    ts.rect(ox + 3, oy + 3, 2, 3, C.red); ts.rect(ox + 7, oy + 2, 3, 4, C.blue); ts.rect(ox + 11, oy + 4, 2, 2, C.yellow);
    ts.rect(ox + 4, oy + 9, 3, 3, C.white); ts.rect(ox + 9, oy + 8, 2, 4, C.bamboo);
  },
  counter(ox, oy) {
    woodFloor(ox, oy);
    ts.rect(ox, oy + 3, T, 4, C.woodL); ts.rect(ox, oy + 3, T, 1, C.white); ts.rect(ox, oy + 7, T, 9, C.woodD);
    ts.rect(ox, oy + 10, T, 1, C.wood);
  },
  futon(ox, oy) {
    ts.rect(ox, oy, T, T, C.tatami);
    ts.rect(ox + 2, oy + 1, 12, 14, C.white); ts.rect(ox + 2, oy + 6, 12, 9, C.blue); ts.rect(ox + 4, oy + 2, 8, 3, 0xffffff);
  },
  anvil(ox, oy) {
    woodFloor(ox, oy);
    ts.rect(ox + 2, oy + 4, 12, 4, 0x4a4a52); ts.rect(ox + 5, oy + 8, 6, 4, 0x3a3a40); ts.rect(ox + 3, oy + 12, 10, 3, 0x4a4a52);
    ts.rect(ox + 3, oy + 4, 8, 1, 0x7a7a88);
  },
  altar(ox, oy) {
    woodFloor(ox, oy);
    ts.rect(ox + 1, oy + 4, 14, 10, C.redD); ts.rect(ox + 1, oy + 4, 14, 2, C.red);
    ts.rect(ox + 5, oy + 1, 6, 6, C.yellow); ts.rect(ox + 6, oy + 2, 4, 4, 0xfff2b0);
  },
  chest_closed(ox, oy) {
    ts.rect(ox + 2, oy + 5, 12, 10, C.wood); ts.rect(ox + 2, oy + 5, 12, 3, C.woodL);
    ts.rect(ox + 2, oy + 8, 12, 1, C.woodD); ts.rect(ox + 2, oy + 14, 12, 1, C.woodD);
    ts.rect(ox + 7, oy + 7, 2, 4, C.yellow); ts.rect(ox + 2, oy + 5, 1, 10, C.yellow); ts.rect(ox + 13, oy + 5, 1, 10, C.yellow);
  },
  chest_open(ox, oy) {
    ts.rect(ox + 2, oy + 2, 12, 4, C.woodL); ts.rect(ox + 2, oy + 6, 12, 3, C.dark);
    ts.rect(ox + 2, oy + 9, 12, 6, C.wood); ts.rect(ox + 2, oy + 14, 12, 1, C.woodD);
    ts.rect(ox + 2, oy + 2, 1, 13, C.yellow); ts.rect(ox + 13, oy + 2, 1, 13, C.yellow);
  },
  shimenawa(ox, oy) {
    ts.rect(ox + 1, oy + 2, 2, 14, C.wood); ts.rect(ox + 13, oy + 2, 2, 14, C.wood);
    ts.rect(ox, oy + 4, T, 3, C.straw); ts.rect(ox, oy + 6, T, 1, 0xb39a55);
    for (const x of [4, 10]) { ts.rect(ox + x, oy + 7, 2, 2, C.white); ts.rect(ox + x + 1, oy + 9, 2, 2, C.white); ts.rect(ox + x, oy + 11, 2, 2, C.white); }
  },
  well(ox, oy) {
    ts.rect(ox + 1, oy + 6, 14, 10, C.stone); ts.rect(ox + 1, oy + 6, 14, 2, C.stoneL); ts.rect(ox + 3, oy + 8, 10, 6, 0x111118);
    ts.rect(ox + 1, oy, 2, 8, C.wood); ts.rect(ox + 13, oy, 2, 8, C.wood); ts.rect(ox, oy, T, 2, C.woodD);
    ts.rect(ox + 4, oy + 9, 8, 1, 0xdddddd); ts.rect(ox + 6, oy + 11, 5, 1, 0xdddddd); // 蜘蛛絲
  },
  sign(ox, oy) {
    ts.rect(ox + 7, oy + 8, 2, 8, C.wood);
    ts.rect(ox + 2, oy + 2, 12, 7, C.woodL); ts.rect(ox + 2, oy + 8, 12, 1, C.woodD);
    ts.rect(ox + 4, oy + 4, 8, 1, C.woodD); ts.rect(ox + 4, oy + 6, 6, 1, C.woodD);
  },
  irori(ox, oy) {
    ts.rect(ox, oy, T, T, C.tatami);
    ts.rect(ox + 2, oy + 2, 12, 12, C.woodD); ts.rect(ox + 4, oy + 4, 8, 8, 0x8a8278);
    ts.rect(ox + 6, oy + 6, 4, 4, C.ember); ts.px(ox + 7, oy + 7, C.yellow);
  },
  bamboo_secret(ox, oy) { bamboo(ox, oy); ts.px(ox + 5, oy + 8, 0x9fd8ff); }, // 只差一顆藍色小點
};
TILES.forEach((t, i) => draw[t.name]((i % COLS) * T, Math.floor(i / COLS) * T));

// ---------- 人物 ----------
function drawPerson(cv, ox, oy, p, row = 0, col = 0) {
  const step = col === 0 ? 0 : col === 1 ? 1 : -1;
  // 下半身
  cv.rect(ox + 5, oy + 10, 6, 4, p.bottom);
  cv.rect(ox + 5 + (step > 0 ? 0 : 1), oy + 14, 2, 2, p.feet);
  cv.rect(ox + 9 - (step < 0 ? 0 : 1), oy + 14, 2, 2, p.feet);
  if (step !== 0) cv.rect(ox + (step > 0 ? 4 : 10), oy + 13, 2, 1, p.bottom);
  // 上衣
  cv.rect(ox + 4, oy + 7, 8, 4, p.top);
  cv.rect(ox + 3, oy + 8, 1, 3, p.top); cv.rect(ox + 12, oy + 8, 1, 3, p.top);
  if (p.apron) cv.rect(ox + 5, oy + 8, 6, 5, p.apron);
  // 頭
  cv.rect(ox + 4, oy + 1, 8, 7, p.hair);
  if (row === 0) {
    cv.rect(ox + 5, oy + 3, 6, 4, p.skin); cv.px(ox + 6, oy + 5, 0x1a1a1a); cv.px(ox + 9, oy + 5, 0x1a1a1a);
    if (p.beard) cv.rect(ox + 6, oy + 7, 4, 2, p.beard);
    else if (p.lips) cv.rect(ox + 7, oy + 7, 2, 1, p.lips);
  }
  if (row === 1) { cv.rect(ox + 4, oy + 3, 4, 4, p.skin); cv.px(ox + 5, oy + 5, 0x1a1a1a); cv.rect(ox + 11, oy + 3, 2, 6, p.hair); }
  if (row === 2) { cv.rect(ox + 8, oy + 3, 4, 4, p.skin); cv.px(ox + 10, oy + 5, 0x1a1a1a); cv.rect(ox + 3, oy + 3, 2, 6, p.hair); }
  if (row === 3) { cv.rect(ox + 6, oy + 7, 4, 3, p.hair); if (p.ribbon) cv.rect(ox + 7, oy + 2, 2, 1, p.ribbon); }
  if (p.bun) cv.rect(ox + 6, oy, 4, 2, p.hair);
}

// 主角：3 欄（站立、走 1、走 2）× 4 列（下、左、右、上）
const pl = new Canvas(3 * T, 4 * T);
const AKARI = { hair: 0x2a1e1e, skin: 0xf2d2b0, top: 0xf4f4f0, bottom: 0xc8342b, feet: 0x8f2a22, lips: 0xc8342b, ribbon: 0xe04848 };
for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) drawPerson(pl, c * T, r * T, AKARI, r, c);

// NPC：每列一位，2 欄（待機兩格，第二格往下 1px 做呼吸感）
const NPCS = [
  ['priest', { hair: 0xe8e8e8, skin: 0xe8c6a0, top: 0xf4f4f0, bottom: 0x6a3f8f, feet: 0x4a2a66, beard: 0xe8e8e8 }],
  ['kon', 'fox'],
  ['rin', { hair: 0x3a2618, skin: 0xf2d2b0, top: 0x3f6fbf, bottom: 0x2a4a8a, feet: 0x1a2a4a, lips: 0xd04848, bun: true }],
  ['tesshin', { hair: 0xd8a880, skin: 0xd8a880, top: 0x5a4a3a, bottom: 0x3a2e24, feet: 0x2a221a, apron: 0x7a5232, beard: 0x3a2a1a }],
  ['ume', { hair: 0x4a3020, skin: 0xf2d2b0, top: 0x4f8a5a, bottom: 0x3a6a44, feet: 0x2a4a30, lips: 0xc06060, bun: true }],
  ['taro', { hair: 0x1a1a1a, skin: 0xf0c8a0, top: 0xe8823a, bottom: 0x5a5a8a, feet: 0x3a3a5a }],
];
const npc = new Canvas(2 * T, NPCS.length * T);
function drawFox(cv, ox, oy) {
  const O = 0xe8823a, W = 0xf8f0e0, D = 0xb05a20;
  cv.rect(ox + 4, oy + 8, 8, 6, O); cv.rect(ox + 5, oy + 12, 6, 2, W);
  cv.rect(ox + 11, oy + 9, 4, 3, O); cv.rect(ox + 13, oy + 7, 2, 3, W); // 尾巴
  cv.rect(ox + 4, oy + 3, 8, 6, O); cv.rect(ox + 5, oy + 6, 6, 3, W);
  cv.rect(ox + 4, oy + 1, 2, 3, O); cv.rect(ox + 10, oy + 1, 2, 3, O); cv.px(ox + 5, oy + 2, D); cv.px(ox + 10, oy + 2, D);
  cv.px(ox + 6, oy + 5, 0x1a1a1a); cv.px(ox + 9, oy + 5, 0x1a1a1a); cv.px(ox + 7, oy + 7, 0x1a1a1a);
  cv.rect(ox + 5, oy + 14, 2, 2, D); cv.rect(ox + 9, oy + 14, 2, 2, D);
}
NPCS.forEach(([, pal], r) => {
  for (let c = 0; c < 2; c++) {
    const tmp = new Canvas(T, T + 1);
    if (pal === 'fox') drawFox(tmp, 0, 0); else drawPerson(tmp, 0, 0, pal, 0, 0);
    // 複製到 sheet，第二格往下 1px（只保留身體上半部位移，腳不動）
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const sy = c === 1 && y < 12 ? y - 1 : y;
      if (sy < 0) continue;
      const i = (sy * T + x) * 4;
      if (tmp.buf[i + 3]) npc.px(c * T + x, r * T + y, (tmp.buf[i] << 16) | (tmp.buf[i + 1] << 8) | tmp.buf[i + 2]);
    }
  }
});

// ---------- 怪物：每列一種，2 欄動畫 ----------
// 順序要和 src/data/enemies.json 的 frame 對應：kitsunebi 0、karakasa 2、nogitsune 4、dummy 6
const en = new Canvas(2 * T, 4 * T);
function kitsunebi(ox, oy, f) {
  const B = 0x4fb8ff, L = 0xbfe8ff, W = 0xffffff, D = 0x1f6fbf;
  const s = f ? 1 : 0;
  en.rect(ox + 4, oy + 6 + s, 8, 8, B); en.rect(ox + 5, oy + 4 + s, 6, 3, B); en.rect(ox + 6, oy + 2 + s, 4, 3, L);
  en.rect(ox + 7, oy + (f ? 1 : 0), 2, 3, L); en.rect(ox + 3, oy + 9 + s, 1, 4, D); en.rect(ox + 12, oy + 9 + s, 1, 4, D);
  en.rect(ox + 6, oy + 8 + s, 4, 4, L); en.px(ox + 6, oy + 9 + s, W); en.px(ox + 9, oy + 9 + s, W);
  en.px(ox + 6, oy + 10 + s, 0x1a1a3a); en.px(ox + 9, oy + 10 + s, 0x1a1a3a);
}
function karakasa(ox, oy, f) {
  const P = 0x9f4fbf, PL = 0xc78fdf, Y = 0xf2c94c, S = 0x6b4428;
  const s = f ? 1 : 0;
  en.rect(ox + 2, oy + 3 + s, 12, 3, P); en.rect(ox + 4, oy + 1 + s, 8, 2, P); en.rect(ox + 1, oy + 6 + s, 14, 3, PL);
  en.rect(ox + 5, oy + 4 + s, 6, 4, 0xf4f4f0); en.rect(ox + 6, oy + 5 + s, 3, 2, Y); en.px(ox + 7, oy + 5 + s, 0x1a1a1a);
  en.rect(ox + 7, oy + 9 + s, 2, 5 - s, S); en.rect(ox + 6, oy + 9 + s, 1, 1, 0xd04848); en.rect(ox + 7, oy + 10, 3, 1, 0xd04848); // 舌頭
  en.rect(ox + 6, oy + 14, 4, 2, 0xf2d2b0);
}
function nogitsune(ox, oy, f) {
  const O = 0x5a4a6a, L = 0x8a7a9a, R = 0xff4848;
  const s = f ? 1 : 0;
  en.rect(ox + 2, oy + 7, 10, 5, O); en.rect(ox + 11, oy + 5 + s, 3, 4, O); en.rect(ox + 13, oy + 3 + s, 2, 3, L);
  en.rect(ox + 1, oy + 4, 6, 6, O); en.rect(ox + 1, oy + 2, 2, 3, O); en.rect(ox + 5, oy + 2, 2, 3, O);
  en.px(ox + 2, oy + 6, R); en.px(ox + 5, oy + 6, R); en.rect(ox + 2, oy + 8, 4, 2, L);
  en.rect(ox + 3, oy + 12, 2, 3 - s, O); en.rect(ox + 9, oy + 12, 2, 2 + s, O);
}
function dummy(ox, oy) {
  const S = 0xd9c27a, W = 0x7a5232;
  en.rect(ox + 7, oy + 4, 2, 12, W); en.rect(ox + 2, oy + 6, 12, 2, W);
  en.rect(ox + 4, oy + 5, 8, 7, S); en.rect(ox + 5, oy + 1, 6, 5, S); en.rect(ox + 4, oy + 0, 8, 2, 0x8a6a3a);
  en.px(ox + 6, oy + 3, 0x1a1a1a); en.px(ox + 9, oy + 3, 0x1a1a1a); en.rect(ox + 7, oy + 8, 2, 2, 0xc23b2f);
}
for (let f = 0; f < 2; f++) { kitsunebi(f * T, 0, f); karakasa(f * T, T, f); nogitsune(f * T, 2 * T, f); dummy(f * T, 3 * T); }

// ---------- 特效／投射物：arrow 0、talisman 1、fire 2、coin 3 ----------
const fx = new Canvas(4 * T, T);
fx.rect(2, 7, 11, 1, 0x8a6a3a); fx.rect(12, 6, 3, 3, 0xd8d8d8); fx.px(15, 7, 0xd8d8d8); fx.rect(1, 6, 2, 1, 0xf4f4f0); fx.rect(1, 8, 2, 1, 0xf4f4f0);
fx.rect(T + 4, 3, 8, 10, 0xf4f0d8); fx.rect(T + 4, 3, 8, 2, 0xc23b2f); fx.rect(T + 6, 6, 4, 1, 0x1a1a1a); fx.rect(T + 7, 7, 2, 4, 0x1a1a1a);
fx.rect(2 * T + 4, 3, 8, 10, 0xf2c94c); fx.rect(2 * T + 4, 3, 8, 2, 0xe8823a); fx.rect(2 * T + 6, 6, 4, 5, 0xc23b2f); fx.rect(2 * T + 7, 5, 2, 2, 0xffe08a);
fx.rect(3 * T + 5, 5, 6, 6, 0xf2c94c); fx.rect(3 * T + 4, 6, 8, 4, 0xf2c94c); fx.rect(3 * T + 7, 7, 2, 2, 0x8a6a1a); fx.px(3 * T + 6, 6, 0xfff2b0);

// ---------- 地圖工具 ----------
const gid = Object.fromEntries(TILES.map((t, i) => [t.name, i + 1]));
const tilePoint = (x, y) => ({ x: x * T + T / 2, y: y * T + T / 2 });
const tileRect = (x, y, w = 1, h = 1) => ({ x: x * T, y: y * T, width: w * T, height: h * T });

function newMap(W, H, groundFill) {
  const m = { W, H, ground: new Array(W * H).fill(gid[groundFill]), obst: new Array(W * H).fill(0), objects: [] };
  m.set = (layer, x, y, g) => { if (x >= 0 && y >= 0 && x < W && y < H) m[layer][y * W + x] = g; };
  m.fill = (layer, x, y, w, h, g) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) m.set(layer, x + i, y + j, g); };
  m.get = (layer, x, y) => m[layer][y * W + x];
  return m;
}
let nextObjId = 1;
const prop = (name, value) => ({ name, type: typeof value === 'number' ? 'int' : typeof value === 'boolean' ? 'bool' : 'string', value });
function obj(m, type, name, at, props = {}) {
  const base = 'width' in at ? at : { ...at, width: 0, height: 0, point: true };
  m.objects.push({
    id: nextObjId++, name, type, rotation: 0, visible: true, ...base,
    properties: Object.entries(props).map(([k, v]) => prop(k, v)),
  });
}
const spawn = (m, name, x, y) => obj(m, 'spawn', name, tilePoint(x, y));
const exit = (m, rect, toMap, toSpawn, face = 'down') => obj(m, 'exit', `to_${toMap}`, rect, { map: toMap, spawn: toSpawn, face });
const npcAt = (m, id, x, y, dialogue) => obj(m, 'npc', id, tilePoint(x, y), { npc: id, dialogue: dialogue ?? id });
const chest = (m, id, x, y, reward) => obj(m, 'chest', id, tilePoint(x, y), reward);
const sign = (m, id, x, y, dialogue) => obj(m, 'sign', id, tilePoint(x, y), { dialogue });

function toTiled(m, props) {
  return {
    compressionlevel: -1, width: m.W, height: m.H, infinite: false, orientation: 'orthogonal', renderorder: 'right-down',
    tiledversion: '1.11.0', type: 'map', version: '1.10', tilewidth: T, tileheight: T, nextlayerid: 4, nextobjectid: nextObjId,
    properties: Object.entries(props).map(([k, v]) => prop(k, v)),
    layers: [
      { id: 1, name: 'ground', type: 'tilelayer', width: m.W, height: m.H, x: 0, y: 0, opacity: 1, visible: true, data: m.ground },
      { id: 2, name: 'obstacles', type: 'tilelayer', width: m.W, height: m.H, x: 0, y: 0, opacity: 1, visible: true, data: m.obst },
      { id: 3, name: 'objects', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: m.objects },
    ],
    tilesets: [{
      firstgid: 1, name: 'village_tiles', image: '../tiles/tiles.png', imagewidth: ts.w, imageheight: ts.h,
      tilewidth: T, tileheight: T, tilecount: TILES.length, columns: COLS, margin: 0, spacing: 0,
      tiles: TILES.map((t, i) => ({ id: i, properties: [prop('name', t.name), prop('collides', !!t.collides)] })),
    }],
  };
}

// 室內：用文字畫地圖
const ROOM_LEGEND = {
  '#': ['wood_floor', 'inner_wall'], '.': ['wood_floor', 0], 't': ['tatami', 0], 'm': ['mat', 0], 's': ['wood_floor', 'shelf'],
  'c': ['wood_floor', 'counter'], 'f': ['tatami', 'futon'], 'a': ['wood_floor', 'anvil'], 'A': ['wood_floor', 'altar'], 'i': ['tatami', 'irori'],
};
function room(rows) {
  const H = rows.length, W = rows[0].length;
  const m = newMap(W, H, 'wood_floor');
  rows.forEach((row, y) => {
    if (row.length !== W) throw new Error(`room row ${y} has length ${row.length}, expected ${W}: "${row}"`);
    [...row].forEach((ch, x) => {
      const [g, o] = ROOM_LEGEND[ch] ?? (() => { throw new Error(`unknown room char ${ch}`); })();
      m.set('ground', x, y, gid[g]); if (o) m.set('obst', x, y, gid[o]);
    });
  });
  const matX = rows[H - 1].indexOf('m');
  return { m, matX, matY: H - 1 };
}

const maps = {};

// ---------- 狐火村（40×30）----------
{
  const W = 40, H = 30;
  const m = newMap(W, H, 'grass');
  seed = 42;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rnd() < 0.08) m.set('ground', x, y, gid.grass_flower);

  for (let x = 0; x < W; x++) { m.set('obst', x, 0, gid.tree); m.set('obst', x, 1, gid.tree); m.set('obst', x, H - 1, gid.tree); }
  for (let y = 0; y < H; y++) { m.set('obst', 0, y, gid.tree); m.set('obst', W - 1, y, gid.bamboo); m.set('obst', W - 2, y, gid.bamboo); }

  m.fill('ground', 18, 2, 3, H - 3, gid.path);
  m.fill('ground', 1, 15, W - 1, 3, gid.path);
  m.fill('obst', W - 2, 15, 2, 3, 0); // 東側竹林入口

  // 神社
  m.fill('ground', 14, 3, 11, 7, gid.stone_floor);
  m.fill('obst', 15, 3, 9, 2, gid.roof);
  m.fill('obst', 15, 5, 9, 2, gid.wall);
  m.set('obst', 19, 6, gid.door);
  m.set('obst', 14, 8, gid.lantern); m.set('obst', 24, 8, gid.lantern);
  for (const x of [17, 18, 20, 21]) m.set('obst', x, 10, gid.torii_top);
  m.set('obst', 17, 11, gid.torii_pillar); m.set('obst', 21, 11, gid.torii_pillar);

  const doors = {};
  function house(key, x, y, w) {
    m.fill('obst', x, y, w, 2, gid.roof);
    m.fill('obst', x, y + 2, w, 2, gid.wall);
    const dx = x + Math.floor(w / 2), dy = y + 3;
    m.set('obst', dx, dy, gid.door);
    m.set('ground', dx, dy + 1, gid.path);
    doors[key] = [dx, dy];
  }
  house('home', 4, 6, 6);
  house('minka', 4, 20, 5);
  house('shop', 26, 5, 5);
  house('forge', 27, 20, 6);
  doors.shrine = [19, 6];

  // 池塘＋小橋
  m.fill('obst', 9, 23, 7, 4, gid.water);
  m.fill('ground', 9, 23, 7, 4, gid.water);
  for (let x = 9; x < 16; x++) { m.set('obst', x, 24, 0); m.set('ground', x, 24, gid.bridge); }

  m.fill('obst', 26, 11, 6, 1, gid.fence);
  m.fill('obst', 32, 11, 1, 3, gid.fence);
  for (const [x, y] of [[8, 12], [30, 26], [35, 5], [3, 27], [24, 13]]) m.set('obst', x, y, gid.rock);
  for (const [x, y] of [[2, 3], [3, 10], [12, 12], [34, 8], [36, 22], [23, 27], [33, 27]]) m.set('obst', x, y, gid.tree);
  m.set('obst', 16, 14, gid.lantern); m.set('obst', 22, 14, gid.lantern);

  spawn(m, 'start', 19, 13);
  for (const [key, [dx, dy]] of Object.entries(doors)) {
    exit(m, tileRect(dx, dy), key, 'door', 'up');
    spawn(m, `from_${key}`, dx, dy + 1);
  }
  exit(m, tileRect(W - 1, 15, 1, 3), 'forest', 'west', 'right');
  spawn(m, 'east', W - 3, 16);
  for (let y = 15; y <= 17; y++) obj(m, 'blocker', `rope_${y}`, tilePoint(W - 2, y), { flag: 'talked_priest', dialogue: 'blocker_forest' });

  obj(m, 'enemy', 'dummy', tilePoint(6, 13), { kind: 'dummy' });
  sign(m, 'sign_dummy', 7, 13, 'sign_dummy');
  npcAt(m, 'ume', 13, 21);
  npcAt(m, 'taro', 25, 17);
  sign(m, 'sign_village', 22, 18, 'sign_village');
  chest(m, 'village_chest', 36, 3, { money: 30 });

  maps.village = toTiled(m, { displayName: '狐火村' });
}

// ---------- 室內 ----------
function interior(key, name, rows, extra) {
  const { m, matX, matY } = room(rows);
  exit(m, tileRect(matX, matY), 'village', `from_${key}`, 'down');
  spawn(m, 'door', matX, matY - 1);
  extra?.(m);
  maps[key] = toTiled(m, { displayName: name });
}
interior('home', '燈的家', [
  '############',
  '#ss..ff...s#',
  '#....ff....#',
  '#..........#',
  '#...tttt...#',
  '#...tiit...#',
  '#...tttt...#',
  '#..........#',
  '#####m######',
], (m) => { chest(m, 'home_chest', 2, 6, { item: '回復丸', count: 3 }); sign(m, 'home_note', 9, 3, 'home_note'); });
interior('minka', '阿梅的家', [
  '############',
  '#ff..s..ff.#',
  '#..........#',
  '#...tttt...#',
  '#...tiit...#',
  '#...tttt...#',
  '#..........#',
  '#..........#',
  '#####m######',
], (m) => { chest(m, 'minka_chest', 10, 7, { item: '解毒草', count: 1 }); });
interior('shop', '道具屋「鈴屋」', [
  '############',
  '#ssss.sssss#',
  '#..........#',
  '#cccccc....#',
  '#..........#',
  '#..........#',
  '#.t..t..t..#',
  '#..........#',
  '#####m######',
], (m) => { npcAt(m, 'rin', 3, 2); });
interior('forge', '鍛冶屋', [
  '############',
  '#s..a..i..s#',
  '#..........#',
  '#..........#',
  '#.a........#',
  '#..........#',
  '#......s...#',
  '#..........#',
  '#####m######',
], (m) => { npcAt(m, 'tesshin', 4, 2); });
interior('shrine', '狐火神社', [
  '##############',
  '#....AAAA....#',
  '#....tttt....#',
  '#............#',
  '#.s........s.#',
  '#............#',
  '#............#',
  '#............#',
  '######m#######',
], (m) => { npcAt(m, 'priest', 6, 3); npcAt(m, 'kon', 9, 4); });

// ---------- 迷霧竹林（36×22）----------
{
  const W = 36, H = 22;
  const m = newMap(W, H, 'grass');
  seed = 99;
  m.fill('obst', 0, 0, W, H, gid.bamboo);
  const carve = (x, y, w, h, ground = 'grass') => { m.fill('obst', x, y, w, h, 0); m.fill('ground', x, y, w, h, gid[ground]); };
  carve(0, 9, 16, 3); m.fill('ground', 0, 10, 15, 1, gid.path);          // 入口往東
  carve(13, 3, 3, 8); m.fill('ground', 14, 4, 1, 7, gid.path);           // 往北
  carve(11, 2, 9, 5);                                                     // 北邊空地
  carve(2, 2, 5, 4);                                                      // 祕密小空間
  m.fill('obst', 7, 3, 4, 1, gid.bamboo_secret);                          // 密道：看起來是竹子，其實走得過去
  carve(19, 3, 9, 3); m.fill('ground', 19, 4, 8, 1, gid.path);           // 往東
  carve(25, 5, 3, 9); m.fill('ground', 26, 5, 1, 9, gid.path);           // 往南
  carve(23, 13, 10, 6);                                                   // 古井空地
  carve(6, 11, 3, 5); m.fill('ground', 7, 11, 1, 5, gid.path);           // 南邊岔路
  carve(3, 15, 8, 5);                                                     // 南邊空地
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!m.get('obst', x, y) && m.get('ground', x, y) === gid.grass && rnd() < 0.1) m.set('ground', x, y, gid.grass_flower);
  for (const [x, y] of [[24, 17], [32, 13], [10, 19], [18, 2], [3, 19]]) m.set('obst', x, y, gid.rock);

  spawn(m, 'west', 2, 10);
  exit(m, tileRect(0, 9, 1, 3), 'village', 'east', 'left');
  chest(m, 'forest_chest_south', 4, 17, { money: 80 });
  chest(m, 'forest_chest_secret', 3, 3, { item: '回復丸', count: 2, money: 120 });
  chest(m, 'forest_chest_well', 31, 17, { item: '靈水', count: 1 });
  obj(m, 'foxfire', 'foxfire_secret', tilePoint(9, 3));
  obj(m, 'foxfire', 'foxfire_path', tilePoint(14, 6));
  obj(m, 'well', 'old_well', tilePoint(28, 15), { dialogue: 'well' });
  sign(m, 'sign_forest', 25, 13, 'sign_forest');
  const enemies = [
    ['kitsunebi', 9, 10], ['karakasa', 15, 4], ['kitsunebi', 17, 5], ['nogitsune', 22, 4], ['nogitsune', 23, 3],
    ['karakasa', 26, 9], ['kitsunebi', 25, 16], ['nogitsune', 29, 17], ['nogitsune', 31, 14], ['karakasa', 7, 17], ['kitsunebi', 5, 16],
  ];
  enemies.forEach(([kind, x, y], i) => obj(m, 'enemy', `${kind}_${i}`, tilePoint(x, y), { kind }));

  maps.forest = toTiled(m, { displayName: '迷霧竹林', fog: true });
}

mkdirSync('assets/tiles', { recursive: true }); mkdirSync('assets/sprites', { recursive: true }); mkdirSync('assets/maps', { recursive: true });
ts.save('assets/tiles/tiles.png');
pl.save('assets/sprites/player.png');
npc.save('assets/sprites/npcs.png');
en.save('assets/sprites/enemies.png');
fx.save('assets/sprites/fx.png');
for (const [k, v] of Object.entries(maps)) writeFileSync(`assets/maps/${k}.json`, JSON.stringify(v));
writeFileSync('src/data/npcs.json', JSON.stringify(Object.fromEntries(NPCS.map(([id], i) => [id, { frame: i * 2 }])), null, 2) + '\n');
console.log('assets written:', Object.keys(maps).join(', '));
