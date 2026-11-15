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
  // 32– 古井地城
  { name: 'dfloor' }, { name: 'dwall', collides: true }, { name: 'dwall_torch', collides: true }, { name: 'web_floor' },
  { name: 'stairs_down' }, { name: 'stairs_up' }, { name: 'plate_off' }, { name: 'plate_on' },
  { name: 'push_block' }, { name: 'gate' }, { name: 'cracked' }, { name: 'stone_lantern_off' },
  { name: 'stone_lantern_on' }, { name: 'iron_chest' }, { name: 'iron_chest_open' }, { name: 'gold_chest' },
  { name: 'gold_chest_open' }, { name: 'boss_door' }, { name: 'bones' },
  { name: 'jizo' }, { name: 'cocoon' }, { name: 'web_wall' }, { name: 'notice_board' },
  // 55– 第二章：河童沼澤、水神祠
  { name: 'mud' }, { name: 'reeds' }, { name: 'lily' }, { name: 'swamp_water', collides: true }, { name: 'plank' },
  { name: 'moss_wall', collides: true }, { name: 'moss_floor' }, { name: 'shallow' }, { name: 'lever_off' }, { name: 'lever_on' }, { name: 'water_gate' },
  // 66– 第三章：天狗山
  { name: 'cliff', collides: true }, { name: 'pine', collides: true }, { name: 'steps' }, { name: 'bell' }, { name: 'trial_stone' }, { name: 'trial_stone_done' },
  // 72– 第四章：鬼之城、黃泉之門
  { name: 'castle_floor' }, { name: 'castle_wall', collides: true }, { name: 'ruin', collides: true }, { name: 'ash' },
  { name: 'yomi_floor' }, { name: 'yomi_wall', collides: true }, { name: 'barrel' }, { name: 'seal_stone' }, { name: 'seal_door' },
  // 81– 生活系統、第五章
  { name: 'cookpot' }, { name: 'sand' }, { name: 'sea', collides: true }, { name: 'coral', collides: true }, { name: 'coral_floor' }, { name: 'palace_wall', collides: true }, { name: 'pearl' },
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
function dfloor(ox, oy) {
  ts.rect(ox, oy, T, T, 0x4a4656);
  ts.rect(ox, oy + 7, T, 1, 0x3e3a4a); ts.rect(ox + 7, oy, 1, 7, 0x3e3a4a); ts.rect(ox + 3, oy + 8, 1, 8, 0x3e3a4a); ts.rect(ox + 12, oy + 8, 1, 8, 0x3e3a4a);
  for (let i = 0; i < 6; i++) ts.px(ox + Math.floor(rnd() * T), oy + Math.floor(rnd() * T), 0x55505f);
}
function dwall(ox, oy) {
  ts.rect(ox, oy, T, T, 0x2a2634);
  for (let y = 0; y < T; y += 4) { ts.rect(ox, oy + y, T, 1, 0x1c1924); const off = (y / 4) % 2 ? 4 : 0; for (let x = off; x < T; x += 8) ts.rect(ox + x, oy + y, 1, 4, 0x1c1924); }
  ts.rect(ox, oy + 1, T, 1, 0x3a3546);
}
function swampWater(ox, oy) {
  ts.rect(ox, oy, T, T, 0x2e5a4a);
  for (const [x, y] of [[2, 4], [9, 7], [4, 12], [12, 13]]) ts.rect(ox + x, oy + y, 3, 1, 0x4a7a6a);
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
  dfloor: dfloor,
  dwall: dwall,
  dwall_torch(ox, oy) {
    dwall(ox, oy);
    ts.rect(ox + 7, oy + 8, 2, 6, C.wood); ts.rect(ox + 6, oy + 4, 4, 4, C.ember); ts.rect(ox + 7, oy + 3, 2, 3, C.yellow); ts.px(ox + 7, oy + 2, 0xfff2b0);
  },
  web_floor(ox, oy) {
    dfloor(ox, oy);
    const W = 0xcfcfd8;
    for (let i = 0; i < 16; i++) { ts.px(ox + i, oy + i, W); ts.px(ox + 15 - i, oy + i, W); }
    ts.rect(ox, oy + 8, T, 1, W); ts.rect(ox + 8, oy, 1, T, W);
  },
  stairs_down(ox, oy) {
    ts.rect(ox, oy, T, T, 0x14121c);
    for (let i = 0; i < 4; i++) ts.rect(ox + 1 + i, oy + 2 + i * 3, 14 - i * 2, 2, [0x6a6478, 0x55505f, 0x403b4c, 0x2e2a38][i]);
  },
  stairs_up(ox, oy) {
    dfloor(ox, oy);
    ts.rect(ox + 4, oy, 2, T, C.straw); ts.rect(ox + 10, oy, 2, T, C.straw);
    for (let y = 2; y < T; y += 4) ts.rect(ox + 4, oy + y, 8, 1, C.wood);
  },
  plate_off(ox, oy) {
    ts.rect(ox + 1, oy + 1, 14, 14, 0x403b4c); ts.rect(ox + 2, oy + 2, 12, 12, 0x5e586c);
    ts.rect(ox + 6, oy + 6, 4, 4, 0x2e2a38);
  },
  plate_on(ox, oy) {
    ts.rect(ox + 1, oy + 1, 14, 14, 0x2a6a8a); ts.rect(ox + 2, oy + 2, 12, 12, 0x4fb8ff);
    ts.rect(ox + 6, oy + 6, 4, 4, 0xbfe8ff);
  },
  push_block(ox, oy) {
    ts.rect(ox + 1, oy + 2, 14, 14, 0x6a6a72); ts.rect(ox + 2, oy + 1, 12, 12, 0x9a9aa2); ts.rect(ox + 3, oy + 2, 10, 3, 0xb8b8c0);
    ts.rect(ox + 6, oy + 6, 4, 4, 0x77777f); ts.px(ox + 7, oy + 7, C.yellow);
  },
  gate(ox, oy) {
    for (const x of [1, 5, 9, 13]) { ts.rect(ox + x, oy, 2, T, 0x5a5a66); ts.px(ox + x, oy, 0x9a9aa8); }
    ts.rect(ox, oy + 3, T, 2, 0x44444e); ts.rect(ox, oy + 11, T, 2, 0x44444e);
  },
  cracked(ox, oy) {
    dwall(ox, oy);
    const K = 0x14121c;
    for (const [x, y] of [[7, 1], [8, 2], [7, 3], [6, 4], [7, 5], [9, 5], [10, 6], [5, 6], [4, 7], [7, 8], [8, 9], [7, 10], [6, 11], [8, 12]]) ts.px(ox + x, oy + y, K);
  },
  stone_lantern_off(ox, oy) {
    ts.rect(ox + 6, oy + 9, 4, 6, 0x77776f); ts.rect(ox + 3, oy + 2, 10, 2, 0x5e5e58);
    ts.rect(ox + 5, oy + 4, 6, 5, 0x77776f); ts.rect(ox + 7, oy + 5, 2, 3, 0x2a2634); ts.rect(ox + 4, oy + 14, 8, 2, 0x5e5e58);
  },
  stone_lantern_on(ox, oy) {
    ts.rect(ox + 6, oy + 9, 4, 6, 0x9a9a92); ts.rect(ox + 3, oy + 2, 10, 2, 0x77776f);
    ts.rect(ox + 5, oy + 4, 6, 5, 0x9a9a92); ts.rect(ox + 7, oy + 5, 2, 3, 0x7fd8ff); ts.px(ox + 7, oy + 5, 0xffffff); ts.rect(ox + 4, oy + 14, 8, 2, 0x77776f);
  },
  iron_chest(ox, oy) {
    ts.rect(ox + 2, oy + 5, 12, 10, 0x5a5a66); ts.rect(ox + 2, oy + 5, 12, 3, 0x7a7a88); ts.rect(ox + 2, oy + 8, 12, 1, 0x3a3a44);
    ts.rect(ox + 6, oy + 8, 4, 4, 0xb87333); ts.rect(ox + 7, oy + 9, 2, 2, 0x1a1a1a);
  },
  iron_chest_open(ox, oy) {
    ts.rect(ox + 2, oy + 2, 12, 4, 0x7a7a88); ts.rect(ox + 2, oy + 6, 12, 3, C.dark); ts.rect(ox + 2, oy + 9, 12, 6, 0x5a5a66);
  },
  gold_chest(ox, oy) {
    ts.rect(ox + 1, oy + 4, 14, 11, 0xc23b2f); ts.rect(ox + 1, oy + 4, 14, 3, 0xe04848);
    ts.rect(ox + 1, oy + 4, 1, 11, C.yellow); ts.rect(ox + 14, oy + 4, 1, 11, C.yellow); ts.rect(ox + 1, oy + 8, 14, 1, C.yellow);
    ts.rect(ox + 6, oy + 7, 4, 4, C.yellow); ts.px(ox + 7, oy + 8, 0xfff2b0);
  },
  gold_chest_open(ox, oy) {
    ts.rect(ox + 1, oy + 1, 14, 4, 0xe04848); ts.rect(ox + 1, oy + 5, 14, 3, C.dark); ts.rect(ox + 1, oy + 8, 14, 7, 0xc23b2f);
    ts.rect(ox + 1, oy + 1, 1, 14, C.yellow); ts.rect(ox + 14, oy + 1, 1, 14, C.yellow);
  },
  boss_door(ox, oy) {
    ts.rect(ox, oy, T, T, 0x2a1e1e); ts.rect(ox + 1, oy + 1, 14, 15, 0x4a2a2a); ts.rect(ox + 7, oy + 1, 2, 15, 0x2a1e1e);
    for (let i = 0; i < 16; i += 2) { ts.px(ox + 2 + (i % 12), oy + i, 0xdddddd); ts.px(ox + 13 - (i % 10), oy + i + 1, 0xdddddd); }
    ts.rect(ox + 5, oy + 7, 6, 3, 0xc23b2f);
  },
  jizo(ox, oy) {
    const S = 0x9a9a92, L = 0xb8b8ae, D = 0x6a6a64, R = 0xc23b2f;
    ts.rect(ox + 3, oy + 13, 10, 3, D); ts.rect(ox + 4, oy + 6, 8, 8, S); ts.rect(ox + 5, oy + 1, 6, 6, L);
    ts.px(ox + 6, oy + 4, D); ts.px(ox + 9, oy + 4, D); ts.rect(ox + 7, oy + 5, 2, 1, D);
    ts.rect(ox + 4, oy + 7, 8, 4, R); ts.rect(ox + 5, oy + 10, 6, 1, 0x8f2a22); ts.rect(ox + 6, oy + 11, 4, 2, L);
  },
  cocoon(ox, oy) {
    const W = 0xe8e4d8, G = 0xb8b4a8;
    ts.rect(ox + 7, oy, 2, 3, G); ts.rect(ox + 4, oy + 3, 8, 12, W); ts.rect(ox + 5, oy + 2, 6, 1, W); ts.rect(ox + 5, oy + 15, 6, 1, W);
    for (let y = 4; y < 15; y += 3) ts.rect(ox + 4, oy + y, 8, 1, G);
    ts.rect(ox + 6, oy + 5, 4, 3, 0xf2d2b0); ts.px(ox + 7, oy + 6, 0x1a1a1a); ts.px(ox + 9, oy + 6, 0x1a1a1a); ts.rect(ox + 6, oy + 4, 4, 1, 0x2a1e1e);
  },
  web_wall(ox, oy) {
    const W = 0xe8e4f0, G = 0xa8a4b8;
    for (let i = 0; i < 16; i++) { ts.px(ox + i, oy + i, W); ts.px(ox + 15 - i, oy + i, W); ts.px(ox + i, oy + 8, G); ts.px(ox + 8, oy + i, G); }
    for (const r of [3, 6]) for (let a = 0; a < 16; a++) { const t = (a / 16) * Math.PI * 2; ts.px(ox + 8 + Math.round(Math.cos(t) * r), oy + 8 + Math.round(Math.sin(t) * r), W); }
  },
  notice_board(ox, oy) {
    ts.rect(ox + 2, oy + 9, 2, 7, C.wood); ts.rect(ox + 12, oy + 9, 2, 7, C.wood);
    ts.rect(ox, oy + 1, T, 10, C.woodD); ts.rect(ox + 1, oy + 2, 14, 8, C.woodL); ts.rect(ox, oy, T, 2, C.roof);
    ts.rect(ox + 2, oy + 3, 5, 5, C.white); ts.rect(ox + 9, oy + 3, 5, 4, 0xf2e6c9); ts.rect(ox + 3, oy + 4, 3, 1, C.red); ts.rect(ox + 10, oy + 4, 3, 1, C.dark);
  },
  mud(ox, oy) {
    ts.rect(ox, oy, T, T, 0x6a5a3a);
    for (let i = 0; i < 12; i++) ts.px(ox + Math.floor(rnd() * T), oy + Math.floor(rnd() * T), rnd() > 0.5 ? 0x5a4a2e : 0x7a6a48);
    ts.rect(ox + 3, oy + 9, 4, 2, 0x4e4028); ts.rect(ox + 10, oy + 4, 3, 2, 0x4e4028);
  },
  reeds(ox, oy) {
    grassBase(ox, oy);
    for (const x of [2, 5, 8, 11, 13]) { ts.rect(ox + x, oy + 4 + (x % 3), 1, 12 - (x % 3), 0x8aa04a); ts.rect(ox + x, oy + 3 + (x % 3), 1, 2, 0x6a4a2a); }
  },
  lily(ox, oy) {
    swampWater(ox, oy);
    ts.rect(ox + 2, oy + 3, 12, 10, 0x4a9a4a); ts.rect(ox + 3, oy + 2, 10, 12, 0x4a9a4a); ts.rect(ox + 8, oy + 7, 5, 1, 0x2a6a2a);
    ts.rect(ox + 4, oy + 4, 3, 2, 0x6aba6a); ts.px(ox + 10, oy + 10, 0xf0d0e0);
  },
  swamp_water: swampWater,
  plank(ox, oy) {
    swampWater(ox, oy);
    ts.rect(ox + 1, oy, 14, T, 0x8a6a42);
    for (let y = 0; y < T; y += 4) ts.rect(ox + 1, oy + y, 14, 1, 0x6a4a2a);
    ts.rect(ox + 1, oy, 1, T, 0x5a3a20); ts.rect(ox + 14, oy, 1, T, 0x5a3a20);
  },
  moss_wall(ox, oy) {
    dwall(ox, oy);
    for (let i = 0; i < 18; i++) ts.px(ox + Math.floor(rnd() * T), oy + Math.floor(rnd() * T), rnd() > 0.5 ? 0x3a6a3a : 0x2a5030);
    ts.rect(ox, oy + 1, T, 1, 0x4a7a4a);
  },
  moss_floor(ox, oy) {
    dfloor(ox, oy);
    for (let i = 0; i < 8; i++) ts.px(ox + Math.floor(rnd() * T), oy + Math.floor(rnd() * T), 0x4a6a4a);
  },
  shallow(ox, oy) {
    ts.rect(ox, oy, T, T, 0x3a6a7a);
    for (const [x, y] of [[2, 3], [9, 6], [4, 11], [11, 13]]) ts.rect(ox + x, oy + y, 3, 1, 0x6aa0b0);
    ts.px(ox + 7, oy + 2, 0x8ac0d0);
  },
  lever_off(ox, oy) {
    ts.rect(ox + 3, oy + 11, 10, 4, 0x5a5a66); ts.rect(ox + 4, oy + 10, 8, 1, 0x7a7a88);
    ts.rect(ox + 5, oy + 3, 2, 8, C.wood); ts.rect(ox + 4, oy + 2, 4, 2, C.red);
  },
  lever_on(ox, oy) {
    ts.rect(ox + 3, oy + 11, 10, 4, 0x5a5a66); ts.rect(ox + 4, oy + 10, 8, 1, 0x7a7a88);
    ts.rect(ox + 9, oy + 3, 2, 8, C.wood); ts.rect(ox + 8, oy + 2, 4, 2, 0x4fd84f);
  },
  cliff(ox, oy) {
    ts.rect(ox, oy, T, T, 0x6a6258);
    for (let y = 0; y < T; y += 5) { ts.rect(ox, oy + y, T, 1, 0x4e4840); ts.rect(ox + ((y * 3) % 11), oy + y + 1, 4, 3, 0x7e766a); }
    ts.rect(ox, oy, T, 1, 0x8a8276);
  },
  pine(ox, oy) {
    grassBase(ox, oy);
    ts.rect(ox + 7, oy + 12, 2, 4, C.trunk);
    ts.rect(ox + 6, oy + 1, 4, 3, 0x1f4a2e); ts.rect(ox + 4, oy + 4, 8, 4, 0x245634); ts.rect(ox + 2, oy + 8, 12, 4, 0x2a6238);
    ts.px(ox + 7, oy + 2, 0x3a7a48); ts.rect(ox + 5, oy + 5, 2, 1, 0x3a7a48); ts.rect(ox + 4, oy + 9, 3, 1, 0x3a7a48);
  },
  steps(ox, oy) {
    ts.rect(ox, oy, T, T, 0x9a9488);
    for (let y = 0; y < T; y += 4) { ts.rect(ox, oy + y, T, 1, 0x6a6458); ts.rect(ox, oy + y + 1, T, 1, 0xb8b2a6); }
  },
  bell(ox, oy) {
    ts.rect(ox + 2, oy, 12, 2, C.wood); ts.rect(ox + 2, oy, 2, 16, C.wood); ts.rect(ox + 12, oy, 2, 16, C.wood);
    ts.rect(ox + 5, oy + 3, 6, 8, 0xb87333); ts.rect(ox + 4, oy + 10, 8, 2, 0xd89353); ts.rect(ox + 6, oy + 4, 2, 5, 0xe8b373); ts.rect(ox + 7, oy + 12, 2, 2, 0x8a5a2a);
  },
  trial_stone(ox, oy) {
    ts.rect(ox + 3, oy + 2, 10, 13, 0x77776f); ts.rect(ox + 4, oy + 1, 8, 1, 0x9a9a92); ts.rect(ox + 2, oy + 14, 12, 2, 0x5e5e58);
    ts.rect(ox + 6, oy + 4, 4, 1, 0x3a3a34); ts.rect(ox + 7, oy + 5, 2, 6, 0x3a3a34); ts.rect(ox + 5, oy + 8, 6, 1, 0x3a3a34);
  },
  trial_stone_done(ox, oy) {
    ts.rect(ox + 3, oy + 2, 10, 13, 0x9a9a92); ts.rect(ox + 4, oy + 1, 8, 1, 0xb8b8ae); ts.rect(ox + 2, oy + 14, 12, 2, 0x77776f);
    ts.rect(ox + 6, oy + 4, 4, 1, C.yellow); ts.rect(ox + 7, oy + 5, 2, 6, C.yellow); ts.rect(ox + 5, oy + 8, 6, 1, C.yellow);
  },
  castle_floor(ox, oy) {
    ts.rect(ox, oy, T, T, 0x5a2a26);
    for (let y = 3; y < T; y += 4) ts.rect(ox, oy + y, T, 1, 0x3e1a18);
    ts.px(ox + 4, oy + 1, 0x7a3a34); ts.px(ox + 11, oy + 9, 0x7a3a34);
  },
  castle_wall(ox, oy) {
    ts.rect(ox, oy, T, T, 0x1a1418); ts.rect(ox, oy, T, 2, 0x3a2a2a);
    ts.rect(ox, oy + 7, T, 1, 0xb8902a); ts.rect(ox + 7, oy, 2, T, 0x2a2024); ts.px(ox + 3, oy + 4, 0xb8902a); ts.px(ox + 12, oy + 11, 0xb8902a);
  },
  ruin(ox, oy) {
    ts.rect(ox, oy, T, T, 0x4a4040);
    ts.rect(ox + 1, oy + 6, 14, 10, 0x2a2020); ts.rect(ox + 2, oy + 3, 3, 13, 0x1a1414); ts.rect(ox + 10, oy + 1, 3, 15, 0x1a1414);
    ts.rect(ox + 4, oy + 9, 7, 1, 0x3a2a24); ts.px(ox + 6, oy + 12, 0xc23b2f); ts.px(ox + 9, oy + 13, 0xe8823a);
  },
  ash(ox, oy) {
    ts.rect(ox, oy, T, T, 0x4a4446);
    for (let i = 0; i < 12; i++) ts.px(ox + Math.floor(rnd() * T), oy + Math.floor(rnd() * T), rnd() > 0.5 ? 0x3a3436 : 0x5e5658);
    if (rnd() > 0.6) ts.px(ox + Math.floor(rnd() * T), oy + Math.floor(rnd() * T), 0xc23b2f);
  },
  yomi_floor(ox, oy) {
    ts.rect(ox, oy, T, T, 0x2a1a3a);
    ts.rect(ox, oy + 7, T, 1, 0x3a2a4e); ts.rect(ox + 7, oy, 1, 7, 0x3a2a4e); ts.rect(ox + 3, oy + 8, 1, 8, 0x3a2a4e); ts.rect(ox + 12, oy + 8, 1, 8, 0x3a2a4e);
    ts.px(ox + 5, oy + 3, 0x8a5aff);
  },
  yomi_wall(ox, oy) {
    ts.rect(ox, oy, T, T, 0x140a1e);
    for (let y = 0; y < T; y += 4) ts.rect(ox, oy + y, T, 1, 0x241634);
    ts.px(ox + 4, oy + 6, 0xb08aff); ts.px(ox + 11, oy + 13, 0xb08aff);
  },
  barrel(ox, oy) {
    ts.rect(ox + 3, oy + 3, 10, 12, 0x8a6a42); ts.rect(ox + 2, oy + 5, 12, 8, 0x8a6a42);
    ts.rect(ox + 2, oy + 5, 12, 1, 0x3a2a1a); ts.rect(ox + 2, oy + 12, 12, 1, 0x3a2a1a);
    ts.rect(ox + 4, oy + 2, 8, 2, 0xe8e4d8); ts.rect(ox + 6, oy + 7, 4, 4, 0xe8e4d8); ts.rect(ox + 7, oy + 8, 2, 2, 0xc23b2f);
  },
  seal_stone(ox, oy) {
    ts.rect(ox + 4, oy + 1, 8, 14, 0x5a4a7a); ts.rect(ox + 3, oy + 13, 10, 3, 0x3a2a5a);
    ts.rect(ox + 5, oy + 3, 6, 1, 0xe8e4d8); ts.rect(ox + 7, oy + 4, 2, 7, 0xe8e4d8); ts.rect(ox + 5, oy + 7, 6, 1, 0xe8e4d8);
    ts.px(ox + 6, oy + 2, 0xb08aff);
  },
  seal_door(ox, oy) {
    ts.rect(ox, oy, T, T, 0x2a1418); ts.rect(ox + 1, oy + 1, 14, 15, 0x4a2a2a);
    ts.rect(ox + 3, oy + 3, 10, 10, 0xe8e4d8); ts.rect(ox + 4, oy + 4, 8, 8, 0xc23b2f); ts.rect(ox + 6, oy + 6, 4, 4, 0xf2c94c);
  },
  cookpot(ox, oy) {
    ts.rect(ox + 2, oy + 12, 12, 3, 0x5a5a62); ts.rect(ox + 6, oy + 13, 4, 2, C.ember);
    ts.rect(ox + 3, oy + 5, 10, 8, 0x2a2a30); ts.rect(ox + 2, oy + 5, 12, 2, 0x4a4a54); ts.rect(ox + 4, oy + 6, 8, 2, 0xd8c890);
    ts.px(ox + 6, oy + 2, 0xe8e8e8); ts.px(ox + 9, oy + 1, 0xe8e8e8); ts.px(ox + 7, oy + 3, 0xe8e8e8);
  },
  sand(ox, oy) {
    ts.rect(ox, oy, T, T, 0xe0cc94);
    for (let i = 0; i < 10; i++) ts.px(ox + Math.floor(rnd() * T), oy + Math.floor(rnd() * T), rnd() > 0.5 ? 0xc8b47c : 0xf0e0b0);
  },
  sea(ox, oy) {
    ts.rect(ox, oy, T, T, 0x2a6ab0);
    for (const [x, y] of [[1, 3], [8, 6], [3, 11], [11, 13]]) ts.rect(ox + x, oy + y, 5, 1, 0x6aa8e0);
  },
  coral(ox, oy) {
    ts.rect(ox, oy, T, T, 0x2a5a8a);
    ts.rect(ox + 3, oy + 4, 2, 12, 0xff7a8a); ts.rect(ox + 1, oy + 6, 6, 2, 0xff7a8a); ts.rect(ox + 9, oy + 2, 2, 14, 0xffa86a); ts.rect(ox + 8, oy + 5, 5, 2, 0xffa86a);
    ts.px(ox + 13, oy + 9, 0xfff2b0);
  },
  coral_floor(ox, oy) {
    ts.rect(ox, oy, T, T, 0x3a7aa8);
    for (let i = 0; i < 8; i++) ts.px(ox + Math.floor(rnd() * T), oy + Math.floor(rnd() * T), rnd() > 0.5 ? 0x5a9ac8 : 0x2a6a98);
    ts.px(ox + 4, oy + 4, 0xfff2b0);
  },
  palace_wall(ox, oy) {
    ts.rect(ox, oy, T, T, 0x8a2a3a); ts.rect(ox, oy, T, 3, 0x2a8a7a); ts.rect(ox, oy + 3, T, 1, 0xf2c94c);
    ts.rect(ox + 2, oy + 6, 3, 8, 0x6a1a2a); ts.rect(ox + 11, oy + 6, 3, 8, 0x6a1a2a);
  },
  pearl(ox, oy) {
    ts.rect(ox + 2, oy + 10, 12, 5, 0xc8a8d8); ts.rect(ox + 3, oy + 9, 10, 1, 0xe8c8f8);
    ts.rect(ox + 5, oy + 3, 6, 6, 0xf8f0ff); ts.rect(ox + 4, oy + 4, 8, 4, 0xf8f0ff); ts.px(ox + 6, oy + 4, 0xffffff);
  },
  water_gate(ox, oy) {
    ts.rect(ox, oy, T, T, 0x1e4a5a);
    for (const [x, y] of [[1, 2], [8, 5], [3, 9], [10, 12]]) ts.rect(ox + x, oy + y, 4, 1, 0x4a8aa0);
    ts.rect(ox, oy, T, 1, 0x6aa0b0); ts.rect(ox, oy + 15, T, 1, 0x0e2a3a);
  },
  bones(ox, oy) {
    dfloor(ox, oy);
    ts.rect(ox + 3, oy + 9, 7, 1, 0xe8e4d8); ts.rect(ox + 2, oy + 8, 2, 3, 0xe8e4d8); ts.rect(ox + 9, oy + 8, 2, 3, 0xe8e4d8);
    ts.rect(ox + 10, oy + 3, 3, 3, 0xe8e4d8); ts.px(ox + 11, oy + 4, C.dark);
  },
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
  ['kawataro', 'kappa'],
  ['yashamaru', { hair: 0xe8e8f0, skin: 0xe0d0c8, top: 0x1a1a24, bottom: 0x2a2a3a, feet: 0x101018, lips: 0x8a2a4a }],
  ['santa', { hair: 0x6a4a2a, skin: 0xc89a6a, top: 0x8a6a3a, bottom: 0x6a5a2a, feet: 0x4a3a1a }],
  ['oba', { hair: 0xc8c8c8, skin: 0xe8c6a0, top: 0x8a5a3a, bottom: 0x5a3a2a, feet: 0x3a2a1a, bun: true }],
  ['fisher', { hair: 0xd9c27a, skin: 0xd8a880, top: 0x3a5a8a, bottom: 0x2a3a5a, feet: 0x1a2a3a, beard: 0x5a4a3a }],
  ['hermit', { hair: 0x2a2a2a, skin: 0xd8b090, top: 0xf0f0e8, bottom: 0xe0e0d8, feet: 0x8a8a80, beard: 0x5a5a5a }],
  ['onimother', { hair: 0xe8e8e8, skin: 0xd86a5a, top: 0x6a3a6a, bottom: 0x4a2a4a, feet: 0x2a1a2a, lips: 0x8a2a2a }],
  ['kame', 'turtle'],
  ['otohime', { hair: 0x1a1a3a, skin: 0xf8e0d0, top: 0xe85a8a, bottom: 0x8a5ae8, feet: 0x5a3aa8, lips: 0xe04848, bun: true, ribbon: 0xf2c94c }],
];
const npc = new Canvas(2 * T, NPCS.length * T);
function drawKappaKid(cv, ox, oy) {
  const G = 0x5ab05a, D = 0x3a803a, Y = 0xf2c94c, W = 0xdfe8ef;
  cv.rect(ox + 5, oy + 9, 6, 5, G); cv.rect(ox + 4, oy + 9, 8, 3, 0x8a6a3a); // 龜殼
  cv.rect(ox + 4, oy + 2, 8, 7, G); cv.rect(ox + 5, oy + 1, 6, 2, W); cv.rect(ox + 6, oy, 4, 1, 0x9ad0e8); // 皿
  cv.px(ox + 6, oy + 5, 0x1a1a1a); cv.px(ox + 9, oy + 5, 0x1a1a1a); cv.rect(ox + 7, oy + 7, 2, 1, Y);
  cv.rect(ox + 5, oy + 14, 2, 2, D); cv.rect(ox + 9, oy + 14, 2, 2, D);
}
function drawTurtle(cv, ox, oy) {
  const G = 0x6ab06a, S = 0x5a7a3a, SL = 0x8aa05a, Y = 0xf2c94c;
  cv.rect(ox + 2, oy + 6, 12, 8, S); cv.rect(ox + 3, oy + 5, 10, 1, S); for (const [x, y] of [[4, 7], [8, 7], [6, 10], [10, 10]]) cv.rect(ox + x, oy + y, 3, 2, SL);
  cv.rect(ox + 6, oy + 1, 4, 5, G); cv.px(ox + 7, oy + 2, 0x1a1a1a); cv.px(ox + 9, oy + 2, 0x1a1a1a);
  cv.rect(ox + 1, oy + 12, 3, 3, G); cv.rect(ox + 12, oy + 12, 3, 3, G); cv.rect(ox + 13, oy + 7, 2, 2, G);
  cv.rect(ox + 6, oy + 0, 4, 1, Y);
}
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
    if (pal === 'fox') drawFox(tmp, 0, 0); else if (pal === 'kappa') drawKappaKid(tmp, 0, 0); else if (pal === 'turtle') drawTurtle(tmp, 0, 0); else drawPerson(tmp, 0, 0, pal, 0, 0);
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
const en = new Canvas(2 * T, 16 * T);
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
function bonespider(ox, oy, f) {
  const B = 0xe8e4d8, D = 0x9a968a, R = 0xb04aff;
  const s = f ? 1 : 0;
  en.rect(ox + 5, oy + 6, 6, 5, B); en.rect(ox + 6, oy + 4, 4, 3, B); en.px(ox + 6, oy + 5, R); en.px(ox + 9, oy + 5, R);
  for (const [x, dir] of [[4, -1], [11, 1]]) for (let i = 0; i < 3; i++) {
    en.rect(ox + x + dir * (i === 1 ? 2 : 1), oy + 6 + i * 2 + (i === 1 ? s : 0), 2, 1, D);
    en.px(ox + x + dir * 3, oy + 7 + i * 2 + (i === 1 ? s : -s), D);
  }
  en.rect(ox + 7, oy + 8, 2, 2, D);
}
function kappa(ox, oy, f) {
  const G = 0x4a9a4a, D = 0x2a6a2a, Y = 0xf2c94c, W = 0xdfe8ef, S = 0x7a5a2a;
  const s = f ? 1 : 0;
  en.rect(ox + 3, oy + 7, 10, 6, S); en.rect(ox + 4, oy + 8, 8, 4, 0x9a7a3a); // 殼
  en.rect(ox + 4, oy + 2 + s, 8, 6, G); en.rect(ox + 5, oy + 1 + s, 6, 2, W); en.rect(ox + 6, oy + s, 4, 1, 0x9ad0e8);
  en.px(ox + 5, oy + 4 + s, 0xff3a3a); en.px(ox + 10, oy + 4 + s, 0xff3a3a); en.rect(ox + 6, oy + 6 + s, 4, 2, Y);
  en.rect(ox + 2, oy + 8, 2, 3, G); en.rect(ox + 12, oy + 8, 2, 3, G);
  en.rect(ox + 4, oy + 13, 3, 3 - s, D); en.rect(ox + 9, oy + 13, 3, 2 + s, D);
}
function dorotabou(ox, oy, f) {
  const M = 0x6a5a3a, L = 0x8a7a52, D = 0x4a3e26;
  const s = f ? 1 : 0;
  en.rect(ox + 3, oy + 6 + s, 10, 10 - s, M); en.rect(ox + 4, oy + 4 + s, 8, 3, M); en.rect(ox + 5, oy + 3 + s, 6, 1, L);
  en.rect(ox + 5, oy + 7 + s, 2, 2, 0xffe08a); // 只有一隻眼
  en.rect(ox + 1, oy + 9, 2, 4, M); en.rect(ox + 13, oy + 8 - s, 2, 4, M);
  for (const [x, y] of [[4, 12], [9, 10], [11, 14], [6, 15]]) en.px(ox + x, oy + y, D);
  en.rect(ox + 7, oy + 11 + s, 3, 1, D);
}
function suiko(ox, oy, f) {
  const B = 0x3a6a8a, L = 0x6aa0c8, W = 0xe8f0f8, R = 0xff4a4a;
  const s = f ? 1 : 0;
  en.rect(ox + 2, oy + 6, 12, 8, B); en.rect(ox + 3, oy + 3 + s, 10, 5, B); en.rect(ox + 4, oy + 2 + s, 8, 1, L);
  for (let x = 3; x < 13; x += 2) en.px(ox + x, oy + 8, L); // 鱗
  en.px(ox + 5, oy + 5 + s, R); en.px(ox + 10, oy + 5 + s, R); en.rect(ox + 6, oy + 7 + s, 4, 1, W);
  en.rect(ox + 1, oy + 1 + s, 2, 3, W); en.rect(ox + 13, oy + 1 + s, 2, 3, W); // 角
  en.rect(ox + 3, oy + 14, 3, 2, B); en.rect(ox + 10, oy + 14, 3, 2, B); en.rect(ox + 13, oy + 10, 3, 2, B);
}
function karasu(ox, oy, f) {
  const K = 0x1a1a24, B = 0x2a2a3a, Y = 0xf2c94c, R = 0xc23b2f, W = 0xe8e8f0;
  const s = f ? 1 : 0;
  en.rect(ox + 1, oy + 5 - s, 4, 6, K); en.rect(ox + 11, oy + 5 - s, 4, 6, K); // 翅膀
  en.rect(ox + 4, oy + 6, 8, 7, B); en.rect(ox + 5, oy + 7, 6, 5, R); // 修驗服
  en.rect(ox + 5, oy + 1 + s, 6, 5, K); en.rect(ox + 6, oy + 4 + s, 4, 2, Y); en.px(ox + 6, oy + 3 + s, W); en.px(ox + 9, oy + 3 + s, W);
  en.rect(ox + 6, oy, 4, 1, R); // 頭巾
  en.rect(ox + 5, oy + 13, 2, 3, K); en.rect(ox + 9, oy + 13, 2, 3, K);
}
function yamawaro(ox, oy, f) {
  const H = 0x8a6a3a, S = 0xc89a6a, D = 0x5a4a2a;
  const s = f ? 1 : 0;
  en.rect(ox + 3, oy + 2 + s, 10, 12, H); en.rect(ox + 4, oy + 1 + s, 8, 1, H);
  en.rect(ox + 5, oy + 4 + s, 6, 5, S); en.rect(ox + 7, oy + 5 + s, 2, 2, 0x1a1a1a); // 一隻眼
  en.rect(ox + 6, oy + 8 + s, 4, 1, D);
  en.rect(ox + 1, oy + 7, 2, 5, H); en.rect(ox + 13, oy + 7 - s, 2, 5, H); en.rect(ox + 12, oy + 4 - s, 3, 3, 0x9a9a92); // 拿石頭
  en.rect(ox + 4, oy + 14, 3, 2, D); en.rect(ox + 9, oy + 14, 3, 2, D);
}
function kamaitachi(ox, oy, f) {
  const W = 0xe8e0d0, G = 0xb8b0a0, S = 0xd8d8e8;
  const s = f ? 1 : 0;
  en.rect(ox + 2, oy + 7, 10, 4, W); en.rect(ox + 10, oy + 5, 4, 4, W); en.px(ox + 12, oy + 6, 0xc23b2f); en.rect(ox + 13, oy + 4, 1, 2, W);
  en.rect(ox, oy + 6 + s, 3, 2, G); // 尾巴
  en.rect(ox + 3, oy + 11, 2, 2 - s, G); en.rect(ox + 9, oy + 11, 2, 1 + s, G);
  en.rect(ox + 4, oy + 3, 1, 4, S); en.rect(ox + 5, oy + 2, 3, 1, S); // 鐮刀
  en.rect(ox + 11, oy + 10, 4, 1, S); en.rect(ox + 14, oy + 9, 1, 2, S);
}
// 鬼：用淺灰色畫，遊戲裡再染成紅鬼、青鬼、茨木童子
function oni(ox, oy, f) {
  const B = 0xd8d8d8, D = 0xa8a8a8, Y = 0xf2c94c, K = 0x1a1a1a, W = 0xffffff;
  const s = f ? 1 : 0;
  en.rect(ox + 3, oy + 3 + s, 10, 10, B); en.rect(ox + 4, oy + 2 + s, 8, 1, B);
  en.rect(ox + 4, oy, 2, 3, Y); en.rect(ox + 10, oy, 2, 3, Y); // 角
  en.rect(ox + 5, oy + 5 + s, 2, 2, Y); en.rect(ox + 9, oy + 5 + s, 2, 2, Y); en.px(ox + 6, oy + 6 + s, K); en.px(ox + 10, oy + 6 + s, K);
  en.rect(ox + 5, oy + 9 + s, 6, 2, K); en.px(ox + 5, oy + 9 + s, W); en.px(ox + 10, oy + 9 + s, W); // 獠牙
  en.rect(ox + 4, oy + 12, 8, 2, 0x8a6a2a); en.rect(ox + 5, oy + 12, 1, 2, Y); en.rect(ox + 9, oy + 12, 1, 2, Y); // 虎皮裙
  en.rect(ox + 1, oy + 5, 2, 6, D); en.rect(ox + 13, oy + 3 - s, 2, 8, 0x6a5a4a); en.rect(ox + 12, oy + 2 - s, 4, 3, 0x6a5a4a); // 狼牙棒
  en.rect(ox + 4, oy + 14, 3, 2, D); en.rect(ox + 9, oy + 14, 3, 2, D);
}
function gaki(ox, oy, f) {
  const S = 0x9a8a7a, D = 0x6a5a4a, K = 0x1a1a1a;
  const s = f ? 1 : 0;
  en.rect(ox + 5, oy + 3 + s, 6, 5, S); en.px(ox + 6, oy + 5 + s, K); en.px(ox + 9, oy + 5 + s, K); en.rect(ox + 7, oy + 7 + s, 2, 1, K);
  en.rect(ox + 4, oy + 8, 8, 5, S); en.rect(ox + 5, oy + 9, 6, 3, 0xb8a898); // 大肚子
  en.rect(ox + 3, oy + 8 + s, 1, 4, D); en.rect(ox + 12, oy + 8 - s, 1, 4, D);
  en.rect(ox + 5, oy + 13, 2, 3 - s, D); en.rect(ox + 9, oy + 13, 2, 2 + s, D);
}
function crab(ox, oy, f) {
  const R = 0xd84a3a, L = 0xff7a5a, K = 0x1a1a1a;
  const s = f ? 1 : 0;
  en.rect(ox + 3, oy + 7, 10, 6, R); en.rect(ox + 4, oy + 6, 8, 1, L);
  en.px(ox + 6, oy + 5, K); en.px(ox + 9, oy + 5, K); en.rect(ox + 6, oy + 4, 1, 2, R); en.rect(ox + 9, oy + 4, 1, 2, R);
  en.rect(ox + 0, oy + 4 - s, 3, 4, L); en.rect(ox + 13, oy + 4 + s, 3, 4, L); en.rect(ox + 2, oy + 7, 2, 1, R); en.rect(ox + 12, oy + 7, 2, 1, R); // 大鉗子
  for (const x of [3, 5, 10, 12]) en.rect(ox + x, oy + 13, 1, 3 - (x % 2 ? s : 0), R);
}
function isonna(ox, oy, f) {
  const H = 0x1a1a2a, S = 0xd8e0e8, W = 0xe8f0f8;
  const s = f ? 1 : 0;
  en.rect(ox + 3, oy + 1, 10, 14, H); en.rect(ox + 2, oy + 6, 1, 9 + s, H); en.rect(ox + 13, oy + 6, 1, 9 - s, H); // 長髮
  en.rect(ox + 5, oy + 3, 6, 5, S); en.px(ox + 6, oy + 5, 0x8a2a4a); en.px(ox + 9, oy + 5, 0x8a2a4a);
  en.rect(ox + 5, oy + 8, 6, 6, W); en.rect(ox + 4, oy + 14, 8, 2, 0x6aa8e0);
}
function chochin(ox, oy, f) {
  const P = 0xf2e0b0, L = 0xe8823a, R = 0xc23b2f, K = 0x2a1e1e;
  const s = f ? 1 : 0;
  en.rect(ox + 4, oy + 1 + s, 8, 2, K); en.rect(ox + 3, oy + 3 + s, 10, 10, P); en.rect(ox + 4, oy + 13 + s, 8, 2, K);
  for (let y = 5; y < 13; y += 3) en.rect(ox + 3, oy + y + s, 10, 1, 0xd8c690);
  en.rect(ox + 5, oy + 6 + s, 2, 2, K); en.rect(ox + 9, oy + 6 + s, 2, 2, K); en.px(ox + 6, oy + 6 + s, L);
  en.rect(ox + 6, oy + 9 + s, 4, 3, R); en.rect(ox + 7, oy + 11 + s, 2, 3, 0xff6a6a); // 舌頭
  en.px(ox + 3, oy + 4 + s, L); en.px(ox + 12, oy + 4 + s, L);
}
for (let f = 0; f < 2; f++) {
  kitsunebi(f * T, 0, f); karakasa(f * T, T, f); nogitsune(f * T, 2 * T, f); dummy(f * T, 3 * T);
  bonespider(f * T, 4 * T, f); chochin(f * T, 5 * T, f);
  kappa(f * T, 6 * T, f); dorotabou(f * T, 7 * T, f); suiko(f * T, 8 * T, f);
  karasu(f * T, 9 * T, f); yamawaro(f * T, 10 * T, f); kamaitachi(f * T, 11 * T, f);
  oni(f * T, 12 * T, f); gaki(f * T, 13 * T, f);
  crab(f * T, 14 * T, f); isonna(f * T, 15 * T, f);
}

// ---------- 土蜘蛛（32×32，4 格：待機 0、待機 1、舉腳 2、發光 3）----------
const BS = 32;
const boss = new Canvas(4 * BS, BS);
function drawBoss(ox, f) {
  const B = f === 3 ? 0x5a1a1a : 0x2a2230, D = 0x1a1420, L = f === 3 ? 0xff5a3a : 0x4a3e58, W = 0xe8e4d8, R = 0xff3a3a;
  const bob = f === 1 ? 1 : 0;
  // 腳：左右各 4 隻
  for (let i = 0; i < 4; i++) {
    const y = 11 + i * 4 + bob, lift = f === 2 && i === 0 ? -6 : 0;
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? 9 : 22;
      boss.rect(ox + (side < 0 ? x0 - 6 : x0), oy0(y + lift), 7, 2, L);
      boss.rect(ox + (side < 0 ? x0 - 8 : x0 + 6), oy0(y + 2 + lift), 2, 5, L);
    }
  }
  // 身體
  boss.rect(ox + 9, 14 + bob, 14, 12, B); boss.rect(ox + 10, 13 + bob, 12, 1, B); boss.rect(ox + 11, 26 + bob, 10, 2, B);
  boss.rect(ox + 13, 17 + bob, 6, 2, W); boss.rect(ox + 15, 19 + bob, 2, 5, W); boss.rect(ox + 12, 22 + bob, 8, 1, W); // 背上的紋
  // 頭
  boss.rect(ox + 11, 6 + bob, 10, 8, D); boss.rect(ox + 12, 5 + bob, 8, 1, D);
  for (const [x, y] of [[12, 8], [14, 7], [17, 7], [19, 8], [13, 10], [18, 10]]) boss.px(ox + x, y + bob, R);
  boss.rect(ox + 13, 13 + bob, 2, 3, W); boss.rect(ox + 17, 13 + bob, 2, 3, W); // 毒牙
}
const oy0 = (y) => y;
for (let f = 0; f < 4; f++) drawBoss(f * BS, f);

// ---------- 河童王（32×32，4 格）----------
const kk = new Canvas(4 * BS, BS);
function drawKappaKing(ox, f) {
  const G = f === 3 ? 0x2a6a4a : 0x3a8a4a, D = 0x2a5a2a, S = 0x6a4a22, SL = 0x9a7a3a, Y = 0xf2c94c, W = 0xdfe8ef, R = 0xff3a3a;
  const bob = f === 1 ? 1 : 0, dry = f === 3;
  kk.rect(ox + 6, 12 + bob, 20, 14, S); kk.rect(ox + 8, 13 + bob, 16, 11, SL); // 大龜殼
  for (let x = 10; x < 24; x += 4) kk.rect(ox + x, 15 + bob, 2, 7, S);
  kk.rect(ox + 9, 4 + bob, 14, 10, G); kk.rect(ox + 10, 3 + bob, 12, 1, G);
  kk.rect(ox + 10, 1 + bob, 12, 3, W); kk.rect(ox + 12, 1 + bob, 8, 2, dry ? 0x8a8a8a : 0x5ab0e8); // 皿（乾掉時變灰）
  kk.rect(ox + 8, 0 + bob, 16, 1, Y); kk.rect(ox + 10, -1 + bob + 1, 2, 1, Y); kk.rect(ox + 20, bob, 2, 1, Y); // 王冠
  kk.rect(ox + 11, 7 + bob, 3, 2, R); kk.rect(ox + 18, 7 + bob, 3, 2, R); kk.rect(ox + 13, 10 + bob, 6, 3, Y);
  const arm = f === 2 ? -6 : 0;
  kk.rect(ox + 2, 14 + arm, 5, 4, G); kk.rect(ox + 25, 14 + (f === 2 ? 0 : arm), 5, 4, G);
  kk.rect(ox + 0, 18 + arm, 4, 3, D); kk.rect(ox + 28, 18, 4, 3, D);
  kk.rect(ox + 8, 26, 6, 5, D); kk.rect(ox + 18, 26, 6, 5, D);
}
for (let f = 0; f < 4; f++) drawKappaKing(f * BS, f);

// ---------- 大天狗（32×32，4 格）----------
const dt = new Canvas(4 * BS, BS);
function drawDaitengu(ox, f) {
  const R = f === 3 ? 0xff5a3a : 0xc23b2f, RD = 0x8a2a22, W = 0xe8e8f0, K = 0x1a1a24, B = 0x2a2a3a, Y = 0xf2c94c;
  const bob = f === 1 ? 1 : 0, wing = f === 2 ? -4 : 0;
  dt.rect(ox + 0, 8 + wing, 8, 14, K); dt.rect(ox + 24, 8 + wing, 8, 14, K); // 黑色大翅膀
  dt.rect(ox + 1, 10 + wing, 6, 1, B); dt.rect(ox + 25, 10 + wing, 6, 1, B); dt.rect(ox + 1, 14 + wing, 6, 1, B); dt.rect(ox + 25, 14 + wing, 6, 1, B);
  dt.rect(ox + 8, 13 + bob, 16, 15, W); dt.rect(ox + 10, 15 + bob, 12, 3, Y); dt.rect(ox + 15, 13 + bob, 2, 15, 0xb8b8c8); // 修驗服
  dt.rect(ox + 10, 3 + bob, 12, 11, R); dt.rect(ox + 11, 2 + bob, 10, 1, R); // 紅臉
  dt.rect(ox + 15, 6 + bob, 3, 7, RD); dt.rect(ox + 16, 12 + bob, 3, 2, RD); // 長鼻子
  dt.rect(ox + 11, 6 + bob, 3, 1, W); dt.rect(ox + 19, 6 + bob, 3, 1, W); dt.px(ox + 12, 6 + bob, K); dt.px(ox + 20, 6 + bob, K);
  dt.rect(ox + 10, 1 + bob, 12, 2, W); // 白眉白髮
  dt.rect(ox + 13, 0 + bob, 6, 2, K); // 頭巾
  dt.rect(ox + 26, 18, 4, 10, 0x8a6a42); dt.rect(ox + 25, 16, 6, 3, 0x3a7a3a); // 羽扇
  dt.rect(ox + 10, 28, 4, 4, K); dt.rect(ox + 18, 28, 4, 4, K);
}
for (let f = 0; f < 4; f++) drawDaitengu(f * BS, f);

// ---------- 酒吞童子（32×32）----------
const sd = new Canvas(4 * BS, BS);
function drawShuten(ox, f) {
  const R = f === 3 ? 0xff6a5a : 0xd84a3a, RD = 0x8a2a22, K = 0x1a1a1a, Y = 0xf2c94c, W = 0xffffff, P = 0x6a3a8a;
  const bob = f === 1 ? 1 : 0;
  sd.rect(ox + 7, 12 + bob, 18, 16, P); sd.rect(ox + 9, 14 + bob, 14, 3, Y); // 華麗的衣服
  sd.rect(ox + 9, 2 + bob, 14, 12, R); sd.rect(ox + 8, 4 + bob, 16, 8, R);
  sd.rect(ox + 8, 0 + bob, 3, 4, Y); sd.rect(ox + 21, 0 + bob, 3, 4, Y); // 角
  sd.rect(ox + 7, 1 + bob, 18, 3, 0xe8e8e8); // 白髮
  sd.rect(ox + 11, 6 + bob, 3, 2, Y); sd.rect(ox + 18, 6 + bob, 3, 2, Y); sd.px(ox + 12, 7 + bob, K); sd.px(ox + 19, 7 + bob, K);
  sd.rect(ox + 12, 10 + bob, 8, 2, K); sd.px(ox + 12, 10 + bob, W); sd.px(ox + 19, 10 + bob, W);
  sd.rect(ox + 10, 9 + bob, 2, 1, 0xff9a8a); sd.rect(ox + 20, 9 + bob, 2, 1, 0xff9a8a); // 醉紅
  const arm = f === 2 ? -8 : 0;
  sd.rect(ox + 1, 14 + arm, 6, 4, R); sd.rect(ox + 0, 4 + arm, 4, 12, 0x5a4a3a); sd.rect(ox - 1 + 1, 2 + arm, 6, 5, 0x5a4a3a); // 鐵棒
  sd.rect(ox + 25, 14, 6, 4, R); sd.rect(ox + 27, 10, 5, 5, 0xe8e4d8); sd.rect(ox + 28, 11, 3, 2, 0xc23b2f); // 酒葫蘆
  sd.rect(ox + 9, 28, 5, 4, RD); sd.rect(ox + 18, 28, 5, 4, RD);
}
for (let f = 0; f < 4; f++) drawShuten(f * BS, f);

// ---------- 百鬼之主（32×32）----------
const hk = new Canvas(4 * BS, BS);
function drawHyakki(ox, f) {
  const B = f === 3 ? 0x6a3aaa : 0x3a1a5a, L = 0x8a5aff, W = 0xe8e4ff, K = 0x0a0612;
  const bob = f === 1 ? 1 : 0;
  hk.rect(ox + 2, 8 + bob, 28, 22, B); hk.rect(ox + 5, 5 + bob, 22, 4, B); hk.rect(ox + 9, 2 + bob, 14, 4, B); // 黑霧般的身體
  for (const [x, y] of [[6, 10], [24, 12], [10, 20], [20, 22], [15, 14], [4, 24], [27, 22]]) { hk.rect(ox + x, y + bob, 3, 2, W); hk.px(ox + x + 1, y + bob, K); } // 很多眼睛
  hk.rect(ox + 11, 26 + bob, 10, 2, K); for (let x = 12; x < 21; x += 2) hk.px(ox + x, 26 + bob, W);
  hk.rect(ox + 13, 0 + bob, 6, 2, L); hk.rect(ox + 15, -1 + bob + 1, 2, 1, W);
  if (f === 2) for (let i = 0; i < 6; i++) hk.rect(ox + i * 5, 30, 3, 2, L);
}
for (let f = 0; f < 4; f++) drawHyakki(f * BS, f);

// ---------- 海坊主（32×32）----------
const ub = new Canvas(4 * BS, BS);
function drawUmibozu(ox, f) {
  const B = f === 3 ? 0x3a3a6a : 0x1a1a2e, L = 0x2a2a4a, W = 0xf8f8ff, Y = 0xf2e8a0;
  const bob = f === 1 ? 1 : 0;
  ub.rect(ox + 6, 4 + bob, 20, 24, B); ub.rect(ox + 8, 2 + bob, 16, 2, B); ub.rect(ox + 4, 10 + bob, 24, 16, B); // 光頭的巨大黑影
  ub.rect(ox + 4, 26, 24, 6, 0x2a6ab0); for (let x = 4; x < 28; x += 4) ub.rect(ox + x, 25 + (x % 8 ? 1 : 0), 3, 1, 0x8ac8f0); // 海浪
  ub.rect(ox + 10, 10 + bob, 4, 4, Y); ub.rect(ox + 18, 10 + bob, 4, 4, Y); ub.px(ox + 11, 11 + bob, 0x1a1a1a); ub.px(ox + 19, 11 + bob, 0x1a1a1a);
  ub.rect(ox + 12, 18 + bob, 8, 2, L); ub.rect(ox + 11, 6 + bob, 3, 1, L);
  if (f === 2) { ub.rect(ox + 0, 12, 4, 10, B); ub.rect(ox + 28, 12, 4, 10, B); } // 舉起手
  ub.px(ox + 9, 5 + bob, W);
}
for (let f = 0; f < 4; f++) drawUmibozu(f * BS, f);

// ---------- 特效／投射物：arrow 0、talisman 1、fire 2、coin 3 ----------
const fx = new Canvas(16 * T, T);
fx.rect(2, 7, 11, 1, 0x8a6a3a); fx.rect(12, 6, 3, 3, 0xd8d8d8); fx.px(15, 7, 0xd8d8d8); fx.rect(1, 6, 2, 1, 0xf4f4f0); fx.rect(1, 8, 2, 1, 0xf4f4f0);
fx.rect(T + 4, 3, 8, 10, 0xf4f0d8); fx.rect(T + 4, 3, 8, 2, 0xc23b2f); fx.rect(T + 6, 6, 4, 1, 0x1a1a1a); fx.rect(T + 7, 7, 2, 4, 0x1a1a1a);
fx.rect(2 * T + 4, 3, 8, 10, 0xf2c94c); fx.rect(2 * T + 4, 3, 8, 2, 0xe8823a); fx.rect(2 * T + 6, 6, 4, 5, 0xc23b2f); fx.rect(2 * T + 7, 5, 2, 2, 0xffe08a);
fx.rect(3 * T + 5, 5, 6, 6, 0xf2c94c); fx.rect(3 * T + 4, 6, 8, 4, 0xf2c94c); fx.rect(3 * T + 7, 7, 2, 2, 0x8a6a1a); fx.px(3 * T + 6, 6, 0xfff2b0);
// 5：獨角仙
fx.rect(5 * T + 5, 6, 6, 7, 0x4a2a1a); fx.rect(5 * T + 6, 7, 4, 5, 0x6a3a22); fx.rect(5 * T + 7, 2, 2, 4, 0x4a2a1a); fx.rect(5 * T + 6, 2, 1, 1, 0x4a2a1a); fx.rect(5 * T + 9, 2, 1, 1, 0x4a2a1a);
fx.rect(5 * T + 4, 8, 1, 3, 0x2a1a10); fx.rect(5 * T + 11, 8, 1, 3, 0x2a1a10); fx.px(5 * T + 7, 8, 0xc8a070);
// 6：護身符
fx.rect(6 * T + 5, 4, 6, 9, 0xc23b2f); fx.rect(6 * T + 6, 5, 4, 7, 0xe04848); fx.rect(6 * T + 7, 2, 2, 3, C.yellow); fx.rect(6 * T + 6, 7, 4, 2, C.yellow);
fx.rect(7 * T + 5, 5, 6, 6, 0x6a5a3a); fx.rect(7 * T + 4, 6, 8, 4, 0x6a5a3a); fx.rect(7 * T + 6, 6, 3, 2, 0x8a7a52);
fx.rect(8 * T + 3, 6, 10, 5, 0xdfe8ef); fx.rect(8 * T + 4, 5, 8, 1, 0xdfe8ef); fx.rect(8 * T + 5, 7, 6, 2, 0x9ad0e8);
// 9：羽毛（烏天狗、大天狗的投射物）
fx.rect(9 * T + 3, 7, 10, 2, 0x1a1a24); fx.rect(9 * T + 5, 6, 6, 1, 0x2a2a3a); fx.rect(9 * T + 5, 9, 6, 1, 0x2a2a3a); fx.px(9 * T + 13, 7, 0xe8e8f0);
// 10：柿子（任務物品）
fx.rect(10 * T + 4, 5, 8, 8, 0xe8823a); fx.rect(10 * T + 5, 4, 6, 10, 0xe8823a); fx.rect(10 * T + 6, 3, 4, 2, 0x3a6a2a); fx.px(10 * T + 6, 6, 0xffb06a);
// 11：草藥、12：鈴的碎片、13：風箏
fx.rect(11 * T + 7, 6, 2, 8, 0x3a7a3a); fx.rect(11 * T + 4, 5, 4, 3, 0x5ab05a); fx.rect(11 * T + 8, 3, 4, 3, 0x5ab05a); fx.rect(11 * T + 5, 9, 3, 2, 0x5ab05a); fx.px(11 * T + 10, 4, 0xf0d0e0);
fx.rect(12 * T + 5, 6, 6, 5, 0xb87333); fx.rect(12 * T + 4, 10, 4, 2, 0xd89353); fx.px(12 * T + 7, 7, 0xe8b373); fx.rect(12 * T + 9, 5, 2, 2, 0x8a5a2a);
fx.rect(13 * T + 4, 2, 8, 8, 0xc23b2f); fx.rect(13 * T + 5, 3, 6, 6, 0xf2e6c9); fx.rect(13 * T + 7, 4, 2, 4, 0xc23b2f); fx.rect(13 * T + 8, 10, 1, 5, 0xe8e4d8); fx.px(13 * T + 9, 13, 0xe8e4d8);
// 14：釣點（水面波紋）
for (const [r, a] of [[6, 0xffffff], [3, 0xbfe8ff]]) for (let k = 0; k < 16; k++) { const t = (k / 16) * Math.PI * 2; fx.px(14 * T + 8 + Math.round(Math.cos(t) * r), 8 + Math.round(Math.sin(t) * r * 0.5), a); }
// 15：貝殼（任務物品）
fx.rect(15 * T + 4, 6, 8, 6, 0xf8d8e8); fx.rect(15 * T + 5, 5, 6, 1, 0xf8d8e8); for (const x of [5, 7, 9]) fx.rect(15 * T + x, 6, 1, 6, 0xd8a8c8); fx.rect(15 * T + 6, 12, 4, 2, 0xe8b8d8);
fx.rect(4 * T + 5, 5, 6, 6, 0xb04aff); fx.rect(4 * T + 4, 6, 8, 4, 0xb04aff); fx.rect(4 * T + 6, 6, 4, 4, 0xe8d8ff); fx.px(4 * T + 3, 8, 0xe8d8ff); fx.px(4 * T + 12, 8, 0xe8d8ff);

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
  npcAt(m, 'oba', 7, 18);
  obj(m, 'fishspot', 'village_fish', tilePoint(16, 25), { spot: 'pond' });
  npcAt(m, 'taro', 25, 17);
  sign(m, 'sign_village', 22, 18, 'sign_village');
  obj(m, 'board', 'village_board', tilePoint(17, 13));
  obj(m, 'portal', 'tower_portal', tilePoint(12, 5), { showFlag: 'game_cleared' });
  // 南邊：往河童沼澤（第二章）
  m.fill('obst', 18, H - 1, 3, 1, 0); m.fill('ground', 18, H - 1, 3, 1, gid.path);
  exit(m, tileRect(18, H - 1, 3, 1), 'swamp', 'north', 'down');
  spawn(m, 'south', 19, H - 3);
  for (let x = 18; x <= 20; x++) obj(m, 'blocker', `rope_s_${x}`, tilePoint(x, H - 2), { flag: 'ch2_started', dialogue: 'blocker_swamp' });
  // 西邊：往天狗山（第三章）
  m.fill('obst', 0, 15, 1, 3, 0); m.fill('ground', 0, 15, 1, 3, gid.path);
  exit(m, tileRect(0, 15, 1, 3), 'mountain', 'south', 'right');
  spawn(m, 'west', 2, 16);
  for (let y = 15; y <= 17; y++) obj(m, 'blocker', `rope_w_${y}`, tilePoint(1, y), { flag: 'ch3_started', dialogue: 'blocker_mountain' });
  obj(m, 'jizo', 'village_jizo', tilePoint(23, 12)); spawn(m, 'jizo', 23, 13);
  chest(m, 'village_chest', 36, 3, { money: 30, gearTier: 1 });

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
], (m) => { chest(m, 'home_chest', 2, 6, { item: '回復丸', count: 3 }); sign(m, 'home_note', 9, 3, 'home_note'); obj(m, 'cook', 'home_cook', tilePoint(4, 7)); });
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
  chest(m, 'forest_chest_south', 4, 17, { money: 80, gearTier: 1 });
  chest(m, 'forest_chest_secret', 3, 3, { item: '神器碎片', count: 1, money: 120, gearTier: 2, minRarity: 2 });
  chest(m, 'forest_chest_well', 31, 17, { item: '靈水', count: 1, gearTier: 1, minRarity: 1 });
  obj(m, 'foxfire', 'foxfire_secret', tilePoint(9, 3));
  obj(m, 'foxfire', 'foxfire_path', tilePoint(14, 6));
  obj(m, 'well', 'old_well', tilePoint(28, 15), { dialogue: 'well' });
  spawn(m, 'well', 28, 16);
  obj(m, 'secret', 'forest_pocket', tileRect(2, 2, 5, 4));
  sign(m, 'sign_forest', 25, 13, 'sign_forest');
  for (const [x, y, i] of [[16, 5, 1], [9, 18, 2], [30, 16, 3]]) obj(m, 'pickup', `herb_${i}`, tilePoint(x, y), { group: 'herb', frame: 11, label: '草藥' });
  for (const [x, y, i] of [[18, 5, 1], [8, 17, 2], [24, 15, 3]]) obj(m, 'pickup', `beetle_${i}`, tilePoint(x, y), { group: 'beetle', frame: 5, label: '獨角仙' });
  obj(m, 'pickup', 'charm_1', tilePoint(11, 10), { group: 'charm', frame: 6, label: '阿梅的護身符' });
  const enemies = [
    ['kitsunebi', 9, 10], ['karakasa', 15, 4], ['kitsunebi', 17, 5], ['nogitsune', 22, 4], ['nogitsune', 23, 3],
    ['karakasa', 26, 9], ['kitsunebi', 25, 16], ['nogitsune', 29, 17], ['nogitsune', 31, 14], ['karakasa', 7, 17], ['kitsunebi', 5, 16],
  ];
  enemies.forEach(([kind, x, y], i) => obj(m, 'enemy', `${kind}_${i}`, tilePoint(x, y), { kind }));

  // 東邊：往鬼之城（最終章）
  m.fill('obst', 33, 15, 3, 2, 0); m.fill('ground', 33, 15, 3, 2, gid.path);
  exit(m, tileRect(35, 15, 1, 2), 'oni_road', 'west', 'right');
  spawn(m, 'oni', 32, 15);
  for (let y = 15; y <= 16; y++) obj(m, 'blocker', `rope_e_${y}`, tilePoint(34, y), { flag: 'ch4_started', dialogue: 'blocker_oni' });
  maps.forest = toTiled(m, { displayName: '迷霧竹林', fog: true });
}


// ---------- 古井地城 ----------
function dungeon(W, H) {
  const m = newMap(W, H, 'dfloor');
  m.fill('obst', 0, 0, W, H, gid.dwall);
  m.carve = (x, y, w, h) => m.fill('obst', x, y, w, h, 0);
  m.torch = (x, y) => { m.set('obst', x, y, gid.dwall_torch); obj(m, 'light', `light_${x}_${y}`, tilePoint(x, y + 1)); };
  return m;
}
const block = (m, id, x, y, group, dir) => obj(m, 'block', id, tilePoint(x, y), { group, dir });
const plate = (m, id, x, y, group) => obj(m, 'plate', id, tilePoint(x, y), { group });
const gateAt = (m, id, x, y, group) => { m.set('obst', x, y, 0); obj(m, 'gate', id, tilePoint(x, y), { group }); };
const cracked = (m, id, x, y) => { m.set('obst', x, y, 0); obj(m, 'cracked', id, tilePoint(x, y)); };
const enemy = (m, kind, x, y, extra = {}) => obj(m, 'enemy', `${kind}_${x}_${y}`, tilePoint(x, y), { kind, ...extra });
const lantern = (m, id, x, y, group, label, order) => obj(m, 'lantern', id, tilePoint(x, y), { group, label, order });
const stairs = (m, x, y, up, toMap, toSpawn, face) => { m.set('ground', x, y, gid[up ? 'stairs_up' : 'stairs_down']); exit(m, tileRect(x, y), toMap, toSpawn, face); };
function webs(m, list) { for (const [x, y] of list) m.set('ground', x, y, gid.web_floor); }
function bones(m, list) { for (const [x, y] of list) m.set('ground', x, y, gid.bones); }

// B1：推石頭開門＋裂牆密室拿鑰匙＋鐵箱
{
  const m = dungeon(30, 18);
  m.carve(1, 1, 5, 6);  m.carve(6, 4, 1, 1);        // 入口
  m.carve(7, 1, 14, 10);                             // 大廳
  m.carve(21, 5, 1, 1); m.carve(22, 1, 7, 10);       // 機關房
  m.carve(7, 12, 5, 4);                              // 密室
  m.carve(22, 12, 7, 5);                             // 樓梯間
  cracked(m, 'b1_crack', 9, 11);
  gateAt(m, 'b1_gate', 25, 11, 'b1');
  stairs(m, 2, 2, true, 'forest', 'well', 'down'); spawn(m, 'up', 2, 3);
  stairs(m, 25, 14, false, 'b2', 'up', 'down'); spawn(m, 'down', 25, 13);
  block(m, 'b1_block', 24, 5, 'b1', 'right'); plate(m, 'b1_plate', 27, 5, 'b1');
  sign(m, 'b1_sign', 23, 2, 'sign_b1');
  obj(m, 'jizo', 'b1_jizo', tilePoint(4, 2)); spawn(m, 'jizo', 4, 3);
  chest(m, 'b1_chest', 8, 9, { item: '回復丸', count: 2 });
  chest(m, 'b1_secret_chest', 9, 14, { item: '銅鑰匙', count: 1, money: 60 });
  chest(m, 'b1_iron_chest', 19, 2, { key: '銅鑰匙', gearTier: 1, minRarity: 2 });
  enemy(m, 'kitsunebi', 12, 3); enemy(m, 'bonespider', 15, 7); enemy(m, 'bonespider', 10, 8); enemy(m, 'kitsunebi', 26, 8);
  m.torch(3, 0); m.torch(13, 0); m.torch(25, 0);
  webs(m, [[7, 1], [20, 10], [28, 1], [1, 6]]); bones(m, [[16, 9], [11, 2], [27, 15]]);
  maps.b1 = toTiled(m, { displayName: '古井地城 B1', dark: true });
}

// B2：石燈籠順序謎題＋提燈鬼守衛寶箱＋裂牆密室
{
  const m = dungeon(32, 20);
  m.carve(1, 1, 6, 6); m.carve(7, 3, 6, 1);          // 入口＋走廊
  m.carve(13, 1, 10, 12);                            // 大廳
  m.carve(23, 4, 1, 1); m.carve(24, 1, 7, 8);        // 燈籠房
  m.carve(24, 10, 7, 5);                             // 樓梯間
  m.carve(17, 13, 1, 1); m.carve(13, 14, 10, 5);     // 提燈鬼的房間
  m.carve(1, 8, 4, 3);                               // 密室
  cracked(m, 'b2_crack', 3, 7);
  gateAt(m, 'b2_gate', 27, 9, 'b2');
  stairs(m, 2, 2, true, 'b1', 'down', 'down'); spawn(m, 'up', 2, 3);
  stairs(m, 27, 12, false, 'b3', 'up', 'down'); spawn(m, 'down', 27, 11);
  lantern(m, 'b2_l_sun', 25, 2, 'b2', '日', 2);
  lantern(m, 'b2_l_star', 27, 2, 'b2', '星', 3);
  lantern(m, 'b2_l_moon', 29, 2, 'b2', '月', 1);
  sign(m, 'b2_mural', 18, 1 + 1, 'mural_b2');
  sign(m, 'b2_hairpin', 15, 10, 'hairpin');
  chest(m, 'b2_chest', 5, 5, { item: '靈水', count: 1, money: 40 });
  chest(m, 'b2_secret_chest', 2, 9, { gearTier: 1, minRarity: 1, money: 80 });
  chest(m, 'b2_guard_chest', 20, 17, { guard: 'b2_elite', gearTier: 2, minRarity: 2, money: 150 });
  enemy(m, 'chochin', 16, 16, { guard: 'b2_elite' }); enemy(m, 'kitsunebi', 14, 15);
  enemy(m, 'bonespider', 15, 4); enemy(m, 'bonespider', 21, 9); enemy(m, 'kitsunebi', 19, 6);
  m.torch(4, 0); m.torch(17, 0); m.torch(27, 0); m.torch(15, 13); m.torch(20, 13);
  webs(m, [[13, 1], [22, 12], [30, 1], [1, 1]]); bones(m, [[18, 11], [6, 1], [21, 15]]);
  maps.b2 = toTiled(m, { displayName: '古井地城 B2', dark: true });
}

// B3：兩顆石頭兩塊踏板＋裂牆密室＋土蜘蛛的門
{
  const m = dungeon(30, 20);
  m.carve(1, 14, 6, 5); m.carve(7, 16, 4, 1);        // 入口＋走廊
  m.carve(11, 9, 12, 10);                            // 機關大廳
  m.carve(13, 2, 9, 6);                              // 門前廳
  m.carve(24, 11, 4, 5);                             // 密室
  cracked(m, 'b3_crack', 23, 13);
  gateAt(m, 'b3_gate', 17, 8, 'b3');
  stairs(m, 2, 15, true, 'b2', 'down', 'down'); spawn(m, 'up', 2, 16);
  block(m, 'b3_block_a', 14, 15, 'b3', 'up'); plate(m, 'b3_plate_a', 14, 11, 'b3');
  block(m, 'b3_block_b', 20, 12, 'b3', 'down'); plate(m, 'b3_plate_b', 20, 16, 'b3');
  sign(m, 'b3_sign', 12, 9, 'sign_b3');
  m.set('obst', 17, 1, 0); obj(m, 'bossdoor', 'b3_boss_door', tilePoint(17, 1), { dialogue: 'boss_door' });
  chest(m, 'b3_chest', 14, 3, { item: '大回復丸', count: 1, money: 100 });
  obj(m, 'jizo', 'b3_jizo', tilePoint(20, 3)); spawn(m, 'jizo', 20, 4);
  chest(m, 'b3_secret_chest', 26, 13, { gearTier: 2, minRarity: 1 });
  enemy(m, 'bonespider', 12, 17); enemy(m, 'bonespider', 22, 10); enemy(m, 'kitsunebi', 17, 17); enemy(m, 'nogitsune', 17, 13);
  m.torch(3, 13); m.torch(14, 8); m.torch(20, 8); m.torch(15, 1); m.torch(19, 1);
  webs(m, [[13, 2], [21, 2], [11, 18], [22, 18], [21, 7], [13, 7]]); bones(m, [[16, 4], [19, 5], [4, 17]]);
  maps.b3 = toTiled(m, { displayName: '古井地城 B3', dark: true });
}

// 土蜘蛛的巢穴（Boss 戰）
{
  const m = dungeon(24, 16);
  m.carve(2, 2, 20, 12);
  spawn(m, 'entry', 12, 12);
  obj(m, 'boss', 'tsuchigumo', tilePoint(12, 5), { kind: 'tsuchigumo' });
  for (const [x, y] of [[3, 3], [20, 3], [3, 12], [20, 12]]) obj(m, 'bosslantern', `lair_lantern_${x}_${y}`, tilePoint(x, y));
  obj(m, 'cocoon', 'cocoon_ken', tilePoint(10, 2)); obj(m, 'cocoon', 'cocoon_hana', tilePoint(14, 2));
  m.torch(6, 1); m.torch(17, 1); m.torch(1, 8); m.torch(22, 8);
  webs(m, [[2, 2], [21, 2], [2, 13], [21, 13], [8, 7], [16, 9], [11, 10], [5, 6], [18, 5]]);
  bones(m, [[6, 11], [17, 12], [9, 4]]);
  maps.lair = toTiled(m, { displayName: '土蜘蛛的巢穴', dark: true, boss: true });
}


// ================= 第二章 =================
const lever = (m, id, x, y, group) => obj(m, 'lever', id, tilePoint(x, y), { group });
const waterGate = (m, id, x, y, group) => { m.set('obst', x, y, 0); obj(m, 'watergate', id, tilePoint(x, y), { group }); };

// 河童沼澤（44×30）
{
  const W = 44, H = 30;
  const m = newMap(W, H, 'grass');
  seed = 2026;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const r = rnd(); if (r < 0.12) m.set('ground', x, y, gid.reeds); else if (r < 0.2) m.set('ground', x, y, gid.mud); }
  for (let x = 0; x < W; x++) { m.set('obst', x, 0, gid.tree); m.set('obst', x, H - 1, gid.tree); }
  for (let y = 0; y < H; y++) { m.set('obst', 0, y, gid.tree); m.set('obst', W - 1, y, gid.tree); }
  // 北邊入口
  m.fill('obst', 20, 0, 3, 1, 0); m.fill('ground', 20, 0, 3, 4, gid.path);
  exit(m, tileRect(20, 0, 3, 1), 'village', 'south', 'up');
  spawn(m, 'north', 21, 2);
  // 大池塘＋木橋
  m.fill('obst', 6, 8, 12, 8, gid.swamp_water); m.fill('ground', 6, 8, 12, 8, gid.swamp_water);
  for (let x = 6; x < 18; x++) { m.set('obst', x, 12, 0); m.set('ground', x, 12, gid.plank); }
  for (const [x, y] of [[8, 9], [15, 14], [10, 15], [16, 9]]) m.set('ground', x, y, gid.lily);
  // 東邊的河＋橋
  m.fill('obst', 28, 1, 3, 15, gid.swamp_water); m.fill('ground', 28, 1, 3, 15, gid.swamp_water);
  for (let x = 28; x < 31; x++) { m.set('obst', x, 7, 0); m.set('ground', x, 7, gid.plank); }
  // 水神祠所在的小島（四周是水，只能從水門進）
  m.fill('obst', 33, 16, 10, 13, gid.swamp_water); m.fill('ground', 33, 16, 10, 13, gid.swamp_water);
  m.fill('obst', 35, 18, 7, 10, 0); m.fill('ground', 35, 18, 7, 10, gid.mud);
  for (const x of [33, 34]) waterGate(m, `swamp_gate_${x}`, x, 22, 'swamp');
  m.set('obst', 40, 19, gid.torii_top); m.set('obst', 38, 19, gid.torii_top);
  m.set('ground', 39, 19, gid.stairs_down); exit(m, tileRect(39, 19), 'suijin1', 'up', 'down');
  spawn(m, 'shrine', 39, 21);
  // 西邊的祕密小空間（從蘆葦叢鑽進去）
  m.fill('obst', 1, 14, 4, 6, gid.tree); m.fill('obst', 1, 15, 3, 3, 0); m.fill('ground', 1, 15, 3, 3, gid.grass);
  m.set('obst', 4, 16, 0); m.set('ground', 4, 16, gid.reeds);
  obj(m, 'secret', 'swamp_pocket', tileRect(1, 15, 3, 3));
  // 樹與泥地
  for (const [x, y] of [[3, 4], [10, 3], [25, 4], [36, 10], [24, 20], [12, 24], [5, 25], [18, 18], [41, 5]]) m.set('obst', x, y, gid.tree);
  m.fill('ground', 19, 18, 6, 6, gid.mud);
  // 物件
  lever(m, 'swamp_lever_w', 4, 4, 'swamp'); lever(m, 'swamp_lever_s', 22, 26, 'swamp'); lever(m, 'swamp_lever_e', 38, 4, 'swamp');
  sign(m, 'swamp_sign', 23, 3, 'sign_swamp');
  obj(m, 'jizo', 'swamp_jizo', tilePoint(18, 3), { spawn: 'jizo' }); spawn(m, 'jizo', 18, 4);
  npcAt(m, 'kawataro', 24, 14);
  npcAt(m, 'fisher', 18, 13);
  obj(m, 'fishspot', 'swamp_fish', tilePoint(5, 10), { spot: 'swamp' });
  obj(m, 'pickup', 'kite_1', tilePoint(40, 3), { group: 'kite', frame: 13, label: '太郎的風箏' });
  chest(m, 'swamp_chest_1', 12, 20, { item: '大回復丸', count: 1, money: 120 });
  chest(m, 'swamp_chest_2', 40, 9, { gearTier: 3, money: 80 });
  chest(m, 'swamp_chest_secret', 2, 16, { item: '神器碎片', count: 1, gearTier: 3, minRarity: 2, money: 200 });
  chest(m, 'swamp_chest_island', 37, 26, { gearTier: 3, minRarity: 1, item: '萬能符', count: 2 });
  obj(m, 'pickup', 'dish_1', tilePoint(14, 4), { group: 'dish', frame: 8, label: '河太郎的皿' });
  const es = [['kappa', 8, 18], ['kappa', 19, 10], ['kappa', 26, 12], ['kappa', 36, 7], ['dorotabou', 21, 21], ['dorotabou', 14, 26], ['dorotabou', 30, 24],
    ['aokitsunebi', 10, 5], ['aokitsunebi', 34, 13], ['aokitsunebi', 4, 22]];
  es.forEach(([k, x, y], i) => obj(m, 'enemy', `${k}_${i}`, tilePoint(x, y), { kind: k }));
  // 南邊：往海邊（第五章）
  m.fill('obst', 20, H - 1, 3, 1, 0); m.fill('ground', 20, H - 2, 3, 2, gid.path);
  exit(m, tileRect(20, H - 1, 3, 1), 'coast', 'north', 'down');
  spawn(m, 'south', 21, H - 3);
  for (let x = 20; x <= 22; x++) obj(m, 'blocker', `rope_c_${x}`, tilePoint(x, H - 2), { flag: 'ch5_started', dialogue: 'blocker_coast' });
  maps.swamp = toTiled(m, { displayName: '河童沼澤', fog: true, tier: 3 });
}

function shrineFloor(W, H) {
  const m = newMap(W, H, 'moss_floor');
  m.fill('obst', 0, 0, W, H, gid.moss_wall);
  m.carve = (x, y, w, h) => m.fill('obst', x, y, w, h, 0);
  m.torch = (x, y) => { m.set('obst', x, y, gid.dwall_torch); obj(m, 'light', `light_${x}_${y}`, tilePoint(x, y + 1)); };
  return m;
}
const shallow = (m, x, y, w, h) => m.fill('ground', x, y, w, h, gid.shallow);

// 水神祠 B1：拉桿開水門＋推石頭＋裂牆
{
  const m = shrineFloor(30, 18);
  m.carve(1, 1, 6, 6); m.carve(7, 3, 4, 1); m.carve(11, 1, 10, 10); m.carve(22, 1, 7, 10); m.carve(22, 12, 7, 5); m.carve(13, 12, 5, 4);
  shallow(m, 11, 6, 10, 3); shallow(m, 22, 8, 7, 3);
  waterGate(m, 'w1_gate_a', 21, 5, 'w1a');
  gateAt(m, 'w1_gate_b', 25, 11, 'w1b');
  cracked(m, 'w1_crack', 15, 11);
  stairs(m, 2, 2, true, 'swamp', 'shrine', 'down'); spawn(m, 'up', 2, 3);
  stairs(m, 25, 14, false, 'suijin2', 'up', 'down'); spawn(m, 'down', 25, 13);
  obj(m, 'jizo', 'w1_jizo', tilePoint(5, 2), { spawn: 'jizo' }); spawn(m, 'jizo', 5, 3);
  lever(m, 'w1_lever', 12, 9, 'w1a');
  block(m, 'w1_block', 24, 4, 'w1b', 'down'); plate(m, 'w1_plate', 24, 7, 'w1b');
  sign(m, 'w1_sign', 13, 2, 'sign_w1');
  chest(m, 'w1_chest', 19, 2, { item: '靈水', count: 2, money: 100 });
  chest(m, 'w1_chest_b', 27, 2, { gearTier: 3, minRarity: 1 });
  chest(m, 'w1_secret_chest', 15, 14, { gearTier: 3, minRarity: 2, money: 150 });
  enemy(m, 'kappa', 14, 5); enemy(m, 'kappa', 18, 8); enemy(m, 'aokitsunebi', 16, 3); enemy(m, 'dorotabou', 27, 9);
  m.torch(3, 0); m.torch(15, 0); m.torch(25, 0);
  maps.suijin1 = toTiled(m, { displayName: '水神祠 B1', dark: true, tier: 3 });
}

// 水神祠 B2：燈籠順序＋水虎守衛寶箱＋河童王的門
{
  const m = shrineFloor(32, 20);
  m.carve(1, 1, 6, 6); m.carve(7, 3, 6, 1); m.carve(13, 1, 10, 12); m.carve(23, 4, 1, 1); m.carve(24, 1, 7, 8);
  m.carve(24, 10, 7, 6); m.carve(17, 13, 1, 1); m.carve(13, 14, 10, 5); m.carve(1, 8, 4, 3);
  shallow(m, 13, 8, 10, 4); shallow(m, 24, 12, 7, 3);
  cracked(m, 'w2_crack', 3, 7);
  waterGate(m, 'w2_gate', 27, 9, 'w2');
  stairs(m, 2, 2, true, 'suijin1', 'down', 'down'); spawn(m, 'up', 2, 3);
  obj(m, 'jizo', 'w2_jizo', tilePoint(25, 14), { spawn: 'jizo' }); spawn(m, 'jizo', 25, 13);
  lantern(m, 'w2_l_rice', 25, 2, 'w2', '稻', 3);
  lantern(m, 'w2_l_water', 27, 2, 'w2', '水', 1);
  lantern(m, 'w2_l_wood', 29, 2, 'w2', '木', 2);
  sign(m, 'w2_mural', 18, 2, 'mural_w2');
  m.set('obst', 31, 12, 0); obj(m, 'bossdoor', 'w2_kappa_door', tilePoint(31, 12), { dialogue: 'kappa_door' });
  chest(m, 'w2_chest', 5, 5, { item: '大回復丸', count: 2, money: 100 });
  chest(m, 'w2_secret_chest', 2, 9, { gearTier: 3, minRarity: 2 });
  chest(m, 'w2_guard_chest', 20, 17, { guard: 'w2_elite', gearTier: 3, minRarity: 3, money: 300 });
  enemy(m, 'suiko', 16, 16, { guard: 'w2_elite' }); enemy(m, 'aokitsunebi', 14, 15);
  enemy(m, 'kappa', 15, 4); enemy(m, 'dorotabou', 21, 10); enemy(m, 'kappa', 19, 6);
  m.torch(4, 0); m.torch(17, 0); m.torch(27, 0); m.torch(15, 13); m.torch(20, 13);
  maps.suijin2 = toTiled(m, { displayName: '水神祠 B2', dark: true, tier: 3 });
}

// 河童王的水殿（Boss）
{
  const m = shrineFloor(24, 16);
  m.carve(2, 2, 20, 12);
  shallow(m, 2, 2, 20, 12);
  for (let y = 4; y < 12; y += 3) for (let x = 5; x < 20; x += 5) m.set('ground', x, y, gid.moss_floor);
  spawn(m, 'entry', 12, 12);
  obj(m, 'boss', 'kappa_king', tilePoint(12, 5), { kind: 'kappaking' });
  obj(m, 'cameo', 'yashamaru', tilePoint(12, 3), { npc: 'yashamaru', hideFlag: 'kappa_defeated' });
  for (const [x, y] of [[3, 3], [20, 3], [3, 12], [20, 12]]) obj(m, 'sluice', `sluice_${x}_${y}`, tilePoint(x, y));
  m.torch(6, 1); m.torch(17, 1); m.torch(1, 8); m.torch(22, 8);
  maps.kappa_lair = toTiled(m, { displayName: '河童王的水殿', dark: true, boss: true, tier: 3 });
}


// ================= 第三章 =================
// 天狗山（44×32）：三個試煉、山風
{
  const W = 44, H = 32;
  const m = newMap(W, H, 'grass');
  seed = 333;
  m.fill('obst', 0, 0, W, H, gid.cliff);
  const carve = (x, y, w, h, g = 'grass') => { m.fill('obst', x, y, w, h, 0); m.fill('ground', x, y, w, h, gid[g]); };
  carve(1, 26, 10, 4);                 // 登山口
  m.fill('obst', 0, 27, 1, 2, 0); m.fill('ground', 0, 27, 1, 2, gid.path);
  exit(m, tileRect(0, 27, 1, 2), 'village', 'west', 'left'); spawn(m, 'south', 2, 27);
  carve(8, 18, 4, 9); m.fill('ground', 9, 18, 2, 9, gid.steps);   // 往上的石階
  carve(8, 13, 3, 6); m.fill('ground', 9, 13, 1, 6, gid.steps);
  carve(4, 4, 12, 9);                  // 力之試煉的平台
  carve(12, 20, 16, 3);                // 山風步道（往西吹）
  carve(22, 22, 14, 8);                // 速之試煉的原野
  carve(30, 8, 4, 14); m.fill('ground', 31, 8, 2, 14, gid.steps);  // 往北的山道（往南吹）
  carve(26, 3, 14, 6);                 // 智之試煉的崖邊
  carve(24, 3, 2, 1); carve(18, 1, 6, 3);   // 山頂
  carve(36, 26, 4, 1); carve(40, 25, 3, 4); // 祕密的小平台
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!m.get('obst', x, y) && m.get('ground', x, y) === gid.grass && rnd() < 0.1) m.set('ground', x, y, gid.grass_flower);
  for (const [x, y] of [[5, 11], [15, 5], [13, 12], [25, 28], [35, 23], [28, 7], [39, 3], [2, 29], [10, 28]]) m.set('obst', x, y, gid.pine);
  gateAt(m, 'summit_gate', 24, 3, 'trials');
  m.set('ground', 20, 1, gid.stairs_up); exit(m, tileRect(20, 1), 'tengu_temple', 'up', 'down'); spawn(m, 'summit', 20, 2);
  obj(m, 'wind', 'wind_ledge', tileRect(14, 20, 12, 3), { dx: -1, dy: 0, power: 55 });
  obj(m, 'wind', 'wind_path', tileRect(30, 10, 4, 9), { dx: 0, dy: 1, power: 60 });
  obj(m, 'trial', 'trial_power', tilePoint(10, 5), { trial: 'power', group: 'trials' });
  obj(m, 'trial', 'trial_wisdom', tilePoint(36, 4), { trial: 'wisdom', dialogue: 'trial_wisdom', group: 'trials' });
  obj(m, 'trial', 'trial_speed', tilePoint(24, 24), { trial: 'speed', group: 'trials' });
  for (const [x, y, i] of [[34, 23, 1], [34, 28, 2], [23, 28, 3], [29, 25, 4]]) obj(m, 'relay', `relay_${i}`, tilePoint(x, y));
  obj(m, 'jizo', 'mountain_jizo', tilePoint(6, 27), { spawn: 'jizo' }); spawn(m, 'jizo', 6, 28);
  sign(m, 'mountain_sign', 4, 27, 'sign_mountain');
  npcAt(m, 'santa', 10, 24);
  npcAt(m, 'hermit', 34, 6);
  obj(m, 'secret', 'mountain_ledge', tileRect(40, 25, 3, 4));
  chest(m, 'mt_chest_1', 5, 5, { item: '大回復丸', count: 2, money: 200 });
  chest(m, 'mt_chest_2', 38, 7, { gearTier: 4, money: 150 });
  chest(m, 'mt_chest_3', 35, 29, { item: '萬能符', count: 2, gearTier: 4 });
  chest(m, 'mt_chest_secret', 41, 26, { item: '神器碎片', count: 1, gearTier: 4, minRarity: 2, money: 300 });
  for (const [x, y, i] of [[14, 7, 1], [32, 13, 2], [27, 21, 3]]) obj(m, 'pickup', `kaki_${i}`, tilePoint(x, y), { group: 'kaki', frame: 10, label: '柿子' });
  const es = [['karasu', 12, 9], ['karasu', 28, 25], ['karasu', 33, 5], ['yamawaro', 9, 20], ['yamawaro', 31, 16], ['yamawaro', 26, 27], ['kamaitachi', 6, 10], ['kamaitachi', 20, 21], ['kamaitachi', 32, 24]];
  es.forEach(([k, x, y], i) => obj(m, 'enemy', `${k}_${i}`, tilePoint(x, y), { kind: k }));
  maps.mountain = toTiled(m, { displayName: '天狗山', tier: 4 });
}

// 天狗寺（30×20）
{
  const m = newMap(30, 20, 'wood_floor');
  m.fill('obst', 0, 0, 30, 20, gid.inner_wall);
  m.carve = (x, y, w, h) => m.fill('obst', x, y, w, h, 0);
  m.torch = (x, y) => { obj(m, 'light', `light_${x}_${y}`, tilePoint(x, y + 1)); };
  m.carve(1, 1, 6, 6); m.carve(7, 3, 4, 1); m.carve(11, 1, 10, 10); m.carve(22, 1, 7, 10); m.carve(22, 12, 7, 5);
  m.carve(15, 11, 1, 1); m.carve(11, 12, 9, 6); m.carve(1, 8, 4, 3);
  m.fill('ground', 11, 4, 10, 4, gid.tatami);
  gateAt(m, 't_gate_a', 21, 5, 'ta'); gateAt(m, 't_gate_b', 25, 11, 'tb'); cracked(m, 't_crack', 3, 7);
  stairs(m, 2, 2, true, 'mountain', 'summit', 'down'); spawn(m, 'up', 2, 3);
  obj(m, 'jizo', 't_jizo_entry', tilePoint(5, 2), { spawn: 'jizo_entry' }); spawn(m, 'jizo_entry', 5, 3);
  obj(m, 'jizo', 't_jizo', tilePoint(23, 13), { spawn: 'jizo' }); spawn(m, 'jizo', 23, 14);
  lever(m, 't_lever', 12, 9, 'ta');
  block(m, 't_block', 24, 4, 'tb', 'down'); plate(m, 't_plate', 24, 7, 'tb');
  sign(m, 't_sign', 13, 2, 'sign_temple');
  for (const [x, y, i] of [[13, 7, 1], [27, 5, 2], [12, 15, 3]]) obj(m, 'pickup', `bellpiece_${i}`, tilePoint(x, y), { group: 'bellpiece', frame: 12, label: '鈴的碎片' });
  m.set('obst', 25, 17, 0); obj(m, 'bossdoor', 't_tengu_door', tilePoint(25, 17), { dialogue: 'tengu_door' });
  chest(m, 't_chest', 19, 2, { item: '大回復丸', count: 2, money: 200 });
  chest(m, 't_chest_b', 27, 2, { gearTier: 4, minRarity: 1 });
  chest(m, 't_secret_chest', 2, 9, { gearTier: 4, minRarity: 2, money: 250 });
  chest(m, 't_guard_chest', 18, 16, { guard: 't_elite', gearTier: 4, minRarity: 3, money: 400 });
  enemy(m, 'oogarasu', 14, 15, { guard: 't_elite' }); enemy(m, 'kamaitachi', 12, 13);
  enemy(m, 'karasu', 14, 3); enemy(m, 'yamawaro', 18, 8); enemy(m, 'kamaitachi', 16, 6); enemy(m, 'karasu', 27, 9);
  m.torch(3, 0); m.torch(15, 0); m.torch(25, 0); m.torch(13, 11); m.torch(18, 11);
  maps.tengu_temple = toTiled(m, { displayName: '天狗寺', tier: 4 });
}

// 大天狗的山頂（Boss）
{
  const W = 24, H = 16;
  const m = newMap(W, H, 'stone_floor');
  m.fill('obst', 0, 0, W, H, gid.cliff);
  m.fill('obst', 2, 2, 20, 12, 0);
  for (const [x, y] of [[2, 2], [21, 2], [2, 13], [21, 13], [7, 7], [16, 8]]) m.set('ground', x, y, gid.grass);
  spawn(m, 'entry', 12, 12);
  obj(m, 'boss', 'daitengu', tilePoint(12, 5), { kind: 'daitengu' });
  obj(m, 'cameo', 'yashamaru2', tilePoint(12, 3), { npc: 'yashamaru', hideFlag: 'tengu_defeated' });
  for (const [x, y] of [[3, 3], [20, 3], [3, 12], [20, 12]]) obj(m, 'bell', `bell_${x}_${y}`, tilePoint(x, y));
  maps.tengu_lair = toTiled(m, { displayName: '大天狗的山頂', boss: true, tier: 4 });
}


// ================= 第四章 =================
const sealDoor = (m, id, x, y, item, label) => { m.set('obst', x, y, 0); obj(m, 'sealgate', id, tilePoint(x, y), { item, label }); };

// 鬼之城下（40×26）
{
  const W = 40, H = 26;
  const m = newMap(W, H, 'ash');
  seed = 444;
  for (let x = 0; x < W; x++) { m.set('obst', x, 0, gid.castle_wall); m.set('obst', x, H - 1, gid.ruin); }
  for (let y = 0; y < H; y++) { m.set('obst', 0, y, gid.ruin); m.set('obst', W - 1, y, gid.castle_wall); }
  m.fill('obst', 0, 12, 1, 2, 0); m.fill('ground', 0, 11, 30, 4, gid.path);
  exit(m, tileRect(0, 12, 1, 2), 'forest', 'oni', 'left'); spawn(m, 'west', 2, 12);
  m.fill('ground', 30, 2, 4, 13, gid.path);
  // 燒毀的村子
  for (const [x, y, w, h] of [[4, 3, 4, 3], [11, 4, 5, 2], [4, 17, 5, 3], [14, 18, 4, 3], [22, 4, 4, 3], [22, 18, 5, 2]]) m.fill('obst', x, y, w, h, gid.ruin);
  for (const [x, y] of [[9, 8], [18, 9], [26, 9], [7, 21], [20, 22], [35, 18], [36, 8]]) m.set('obst', x, y, gid.ruin);
  // 城門
  m.fill('obst', 28, 1, 8, 1, gid.castle_wall);
  m.set('ground', 32, 1, gid.stairs_up); m.set('obst', 32, 1, 0); exit(m, tileRect(32, 1), 'oni_castle1', 'up', 'down'); spawn(m, 'gate', 32, 3);
  // 祕密：燒毀的倉庫後面
  m.fill('obst', 34, 19, 5, 6, gid.ruin); m.fill('obst', 35, 20, 3, 3, 0); m.set('obst', 34, 21, 0);
  obj(m, 'secret', 'oni_storehouse', tileRect(35, 20, 3, 3));
  chest(m, 'oni_chest_secret', 36, 21, { item: '神器碎片', count: 1, gearTier: 4, minRarity: 3, money: 500 });
  chest(m, 'oni_chest_1', 6, 7, { item: '大回復丸', count: 3, money: 300 });
  chest(m, 'oni_chest_silver', 24, 8, { key: '銀鑰匙', gearTier: 4, minRarity: 4, money: 800 });
  obj(m, 'jizo', 'oni_jizo', tilePoint(3, 9), { spawn: 'jizo' }); spawn(m, 'jizo', 3, 10);
  sign(m, 'oni_sign', 4, 10, 'sign_oni');
  sign(m, 'oni_ruin', 17, 16, 'oni_ruin');
  obj(m, 'npc', 'onimother', tilePoint(10, 15), { npc: 'onimother', dialogue: 'onimother', showFlag: 'oni_child_freed' });
  const es = [['gaki', 8, 13], ['gaki', 12, 10], ['gaki', 16, 14], ['gaki', 20, 12], ['aka_oni', 25, 13], ['ao_oni', 31, 9], ['aka_oni', 13, 21], ['ao_oni', 29, 20], ['onibi', 20, 6], ['onibi', 33, 5]];
  es.forEach(([k, x, y], i) => obj(m, 'enemy', `${k}_${i}`, tilePoint(x, y), { kind: k }));
  maps.oni_road = toTiled(m, { displayName: '鬼之城下', tier: 4 });
}

function castleFloor(W, H) {
  const m = newMap(W, H, 'castle_floor');
  m.fill('obst', 0, 0, W, H, gid.castle_wall);
  m.carve = (x, y, w, h) => m.fill('obst', x, y, w, h, 0);
  m.torch = (x, y) => { m.set('obst', x, y, gid.dwall_torch); obj(m, 'light', `light_${x}_${y}`, tilePoint(x, y + 1)); };
  return m;
}

// 鬼之城一樓：河童王的冠開水封門、拉桿＋推石、茨木童子
{
  const m = castleFloor(30, 20);
  m.carve(1, 1, 6, 6); m.carve(7, 3, 4, 1); m.carve(11, 1, 10, 10); m.carve(22, 1, 7, 10); m.carve(22, 12, 7, 5);
  m.carve(15, 11, 1, 1); m.carve(11, 12, 9, 6); m.carve(1, 8, 4, 3);
  m.fill('ground', 11, 4, 10, 4, gid.tatami);
  gateAt(m, 'c1_gate_a', 21, 5, 'c1a'); gateAt(m, 'c1_gate_b', 25, 11, 'c1b');
  sealDoor(m, 'c1_water_seal', 3, 7, '河童王的冠', '水封之門');
  stairs(m, 2, 2, true, 'oni_road', 'gate', 'down'); spawn(m, 'up', 2, 3);
  stairs(m, 25, 14, false, 'oni_castle2', 'up', 'down'); spawn(m, 'down', 25, 13);
  obj(m, 'jizo', 'c1_jizo', tilePoint(5, 2), { spawn: 'jizo' }); spawn(m, 'jizo', 5, 3);
  lever(m, 'c1_lever', 12, 9, 'c1a');
  block(m, 'c1_block', 24, 4, 'c1b', 'down'); plate(m, 'c1_plate', 24, 7, 'c1b');
  sign(m, 'c1_sign', 13, 2, 'sign_c1');
  sign(m, 'c1_cell', 19, 2, 'oni_child');
  chest(m, 'c1_chest_b', 27, 2, { gearTier: 4, minRarity: 2 });
  chest(m, 'c1_seal_chest', 2, 9, { item: '大回復丸', count: 3, gearTier: 4, minRarity: 3 });
  chest(m, 'c1_guard_chest', 18, 16, { guard: 'c1_elite', gearTier: 4, minRarity: 3, money: 600 });
  enemy(m, 'ibaraki', 14, 15, { guard: 'c1_elite' }); enemy(m, 'gaki', 12, 13);
  enemy(m, 'aka_oni', 14, 5); enemy(m, 'ao_oni', 18, 8); enemy(m, 'onibi', 16, 3); enemy(m, 'gaki', 27, 9);
  m.torch(3, 0); m.torch(15, 0); m.torch(25, 0); m.torch(13, 11); m.torch(18, 11);
  maps.oni_castle1 = toTiled(m, { displayName: '鬼之城 一樓', dark: true, tier: 4 });
}

// 鬼之城二樓：大天狗的團扇開風門、燈籠順序（鬼→人→狐）
{
  const m = castleFloor(32, 18);
  m.carve(1, 1, 6, 6); m.carve(7, 3, 6, 1); m.carve(13, 1, 10, 12); m.carve(23, 4, 1, 1); m.carve(24, 1, 7, 8); m.carve(24, 10, 7, 6);
  stairs(m, 2, 2, true, 'oni_castle1', 'down', 'down'); spawn(m, 'up', 2, 3);
  obj(m, 'jizo', 'c2_jizo', tilePoint(25, 13), { spawn: 'jizo' }); spawn(m, 'jizo', 25, 12);
  sealDoor(m, 'c2_wind_seal', 23, 4, '大天狗的團扇', '風之門');
  lantern(m, 'c2_l_fox', 25, 2, 'c2', '狐', 3);
  lantern(m, 'c2_l_oni', 27, 2, 'c2', '鬼', 1);
  lantern(m, 'c2_l_man', 29, 2, 'c2', '人', 2);
  sign(m, 'c2_mural', 18, 2, 'mural_c2');
  gateAt(m, 'c2_gate', 27, 9, 'c2');
  m.set('obst', 31, 12, 0); obj(m, 'bossdoor', 'c2_shuten_door', tilePoint(31, 12), { dialogue: 'shuten_door' });
  chest(m, 'c2_chest', 5, 5, { item: '萬能符', count: 3, money: 300 });
  chest(m, 'c2_chest_b', 14, 11, { gearTier: 4, minRarity: 2 });
  enemy(m, 'aka_oni', 15, 4); enemy(m, 'ao_oni', 20, 9); enemy(m, 'onibi', 17, 6); enemy(m, 'aka_oni', 27, 7); enemy(m, 'gaki', 21, 3);
  m.torch(4, 0); m.torch(17, 0); m.torch(27, 0);
  maps.oni_castle2 = toTiled(m, { displayName: '鬼之城 二樓', dark: true, tier: 4 });
}

// 天守閣（酒吞童子）
{
  const m = castleFloor(24, 16);
  m.carve(2, 2, 20, 12);
  m.fill('ground', 2, 2, 20, 12, gid.tatami);
  spawn(m, 'entry', 12, 12);
  obj(m, 'boss', 'shuten', tilePoint(12, 5), { kind: 'shuten' });
  obj(m, 'cameo', 'yashamaru3', tilePoint(12, 3), { npc: 'yashamaru', hideFlag: 'shuten_defeated' });
  for (const [x, y] of [[3, 3], [20, 3], [3, 12], [20, 12]]) obj(m, 'barrel', `barrel_${x}_${y}`, tilePoint(x, y));
  m.torch(6, 1); m.torch(17, 1); m.torch(1, 8); m.torch(22, 8);
  maps.shuten_lair = toTiled(m, { displayName: '天守閣', dark: true, boss: true, tier: 4 });
}

// 黃泉之門（隱藏章）
{
  const m = newMap(26, 18, 'yomi_floor');
  m.fill('obst', 0, 0, 26, 18, gid.yomi_wall);
  m.fill('obst', 2, 2, 22, 14, 0);
  spawn(m, 'entry', 13, 14);
  obj(m, 'boss', 'hyakki', tilePoint(13, 6), { kind: 'hyakki' });
  for (const [x, y] of [[3, 3], [22, 3], [3, 14], [22, 14]]) obj(m, 'sealstone', `seal_${x}_${y}`, tilePoint(x, y));
  maps.yomi = toTiled(m, { displayName: '黃泉之門', dark: true, boss: true, tier: 4 });
}


// ================= 第五章：龍宮 =================
// 海邊（40×24）
{
  const W = 40, H = 24;
  const m = newMap(W, H, 'sand');
  seed = 555;
  m.fill('obst', 0, 0, W, 1, gid.tree); m.fill('obst', 0, 0, 1, H, gid.tree); m.fill('obst', W - 1, 0, 1, H, gid.tree);
  m.fill('obst', 1, 1, W - 2, 2, gid.pine); m.fill('ground', 1, 1, W - 2, 2, gid.grass);
  m.fill('obst', 20, 0, 3, 3, 0); m.fill('ground', 20, 0, 3, 3, gid.path);
  exit(m, tileRect(20, 0, 3, 1), 'swamp', 'south', 'up'); spawn(m, 'north', 21, 2);
  // 海（下方），岸邊的岩石與珊瑚
  m.fill('obst', 1, 16, W - 2, H - 16, gid.sea); m.fill('ground', 1, 16, W - 2, H - 16, gid.sea);
  for (const [x, y] of [[6, 15], [14, 15], [27, 15], [35, 14], [3, 9], [32, 7], [12, 6]]) m.set('obst', x, y, gid.rock);
  for (const [x, y] of [[10, 17], [24, 17], [33, 18]]) m.set('obst', x, y, gid.coral);
  // 小屋
  m.fill('obst', 4, 4, 6, 2, gid.roof); m.fill('obst', 4, 6, 6, 1, gid.wall);
  obj(m, 'cook', 'coast_cook', tilePoint(7, 8));
  obj(m, 'jizo', 'coast_jizo', tilePoint(11, 8), { spawn: 'jizo' }); spawn(m, 'jizo', 11, 9);
  sign(m, 'coast_sign', 18, 4, 'sign_coast');
  // 海龜：帶人去龍宮
  npcAt(m, 'kame', 21, 15, 'kame');
  obj(m, 'fishspot', 'coast_fish_1', tilePoint(16, 15), { spot: 'sea' });
  obj(m, 'fishspot', 'coast_fish_2', tilePoint(30, 15), { spot: 'sea' });
  // 祕密：岩石後面的小海灣
  m.fill('obst', 34, 3, 5, 4, gid.rock); m.fill('obst', 35, 4, 3, 2, 0); m.set('obst', 34, 5, 0);
  obj(m, 'secret', 'coast_cove', tileRect(35, 4, 3, 2));
  chest(m, 'coast_chest_secret', 36, 4, { gearTier: 5, minRarity: 3, money: 800 });
  chest(m, 'coast_chest_1', 2, 13, { item: '大回復丸', count: 3, money: 500 });
  for (const [x, y, i] of [[8, 12, 1], [26, 10, 2], [37, 13, 3]]) obj(m, 'pickup', `shell_${i}`, tilePoint(x, y), { group: 'shell', frame: 15, label: '漂亮的貝殼' });
  const es = [['crab', 9, 13], ['crab', 25, 13], ['crab', 33, 11], ['isonna', 16, 9], ['isonna', 29, 9], ['umi_imp', 13, 11], ['umi_imp', 22, 8], ['umi_imp', 36, 9]];
  es.forEach(([k, x, y], i) => obj(m, 'enemy', `${k}_${i}`, tilePoint(x, y), { kind: k }));
  maps.coast = toTiled(m, { displayName: '海邊', tier: 5 });
}

function palaceFloor(W, H) {
  const m = newMap(W, H, 'coral_floor');
  m.fill('obst', 0, 0, W, H, gid.palace_wall);
  m.carve = (x, y, w, h) => m.fill('obst', x, y, w, h, 0);
  m.torch = (x, y) => { obj(m, 'light', `light_${x}_${y}`, tilePoint(x, y + 1)); };
  return m;
}

// 龍宮 一樓：珠的順序（赤→青→白）＋推石＋濡女
{
  const m = palaceFloor(30, 20);
  m.carve(1, 1, 6, 6); m.carve(7, 3, 4, 1); m.carve(11, 1, 10, 10); m.carve(21, 5, 1, 1); m.carve(22, 1, 7, 10); m.carve(22, 12, 7, 5);
  m.carve(11, 12, 9, 6); m.carve(20, 15, 1, 1);
  for (const [x, y] of [[13, 3], [18, 8], [24, 9]]) m.set('obst', x, y, gid.coral);
  m.set('ground', 2, 2, gid.stairs_up); exit(m, tileRect(2, 2), 'coast', 'jizo', 'down'); spawn(m, 'up', 2, 3);
  obj(m, 'jizo', 'r1_jizo', tilePoint(5, 2), { spawn: 'jizo' }); spawn(m, 'jizo', 5, 3);
  lantern(m, 'r1_l_white', 23, 2, 'r1a', '白', 3);
  lantern(m, 'r1_l_red', 25, 2, 'r1a', '赤', 1);
  lantern(m, 'r1_l_blue', 27, 2, 'r1a', '青', 2);
  sign(m, 'r1_mural', 16, 2, 'mural_r1');
  gateAt(m, 'r1_gate', 15, 11, 'r1a');   // 燈籠 → 濡女的房間
  block(m, 'r1_block', 13, 13, 'r1b', 'right'); plate(m, 'r1_plate', 17, 13, 'r1b');
  gateAt(m, 'r1_gate_b', 21, 15, 'r1b');   // 推石 → 樓梯間
  m.set('ground', 25, 14, gid.stairs_down); exit(m, tileRect(25, 14), 'ryugu2', 'up', 'down'); spawn(m, 'down', 25, 13);
  chest(m, 'r1_chest', 19, 2, { item: '萬能符', count: 3, money: 600 });
  chest(m, 'r1_guard_chest', 18, 16, { guard: 'r1_elite', gearTier: 5, minRarity: 3, money: 1000 });
  enemy(m, 'nureonna', 14, 16, { guard: 'r1_elite' });
  enemy(m, 'crab', 14, 6); enemy(m, 'isonna', 18, 4); enemy(m, 'umi_imp', 16, 9); enemy(m, 'umi_imp', 27, 7);
  m.torch(3, 0); m.torch(15, 0); m.torch(25, 0);
  maps.ryugu1 = toTiled(m, { displayName: '龍宮 一樓', tier: 5 });
}

// 龍宮 二樓：拉桿開水門＋裂牆＋海坊主的門
{
  const m = palaceFloor(30, 18);
  m.carve(1, 1, 6, 6); m.carve(7, 3, 6, 1); m.carve(13, 1, 10, 12); m.carve(24, 1, 5, 12); m.carve(1, 8, 4, 3);
  m.set('ground', 2, 2, gid.stairs_up); exit(m, tileRect(2, 2), 'ryugu1', 'down', 'down'); spawn(m, 'up', 2, 3);
  for (let y = 1; y <= 12; y++) { m.set('obst', 23, y, gid.sea); m.set('ground', 23, y, gid.sea); }
  waterGate(m, 'r2_gate', 23, 6, 'r2'); waterGate(m, 'r2_gate2', 23, 7, 'r2');
  lever(m, 'r2_lever_a', 14, 2, 'r2'); lever(m, 'r2_lever_b', 21, 11, 'r2');
  cracked(m, 'r2_crack', 3, 7);
  obj(m, 'jizo', 'r2_jizo', tilePoint(26, 10), { spawn: 'jizo' }); spawn(m, 'jizo', 26, 11);
  m.set('obst', 29, 6, 0); obj(m, 'bossdoor', 'r2_umibozu_door', tilePoint(29, 6), { dialogue: 'umibozu_door' });
  npcAt(m, 'otohime', 26, 3, 'otohime');
  chest(m, 'r2_chest', 5, 5, { item: '大回復丸', count: 3, gearTier: 5 });
  chest(m, 'r2_secret_chest', 2, 9, { gearTier: 5, minRarity: 3, money: 1200 });
  enemy(m, 'crab', 16, 5); enemy(m, 'isonna', 20, 9); enemy(m, 'umi_imp', 15, 10); enemy(m, 'isonna', 18, 3);
  m.torch(4, 0); m.torch(17, 0); m.torch(26, 0);
  maps.ryugu2 = toTiled(m, { displayName: '龍宮 二樓', tier: 5 });
}

// 海坊主的漩渦（Boss）
{
  const m = newMap(24, 16, 'coral_floor');
  m.fill('obst', 0, 0, 24, 16, gid.sea); m.fill('ground', 0, 0, 24, 16, gid.sea);
  m.fill('obst', 2, 2, 20, 12, 0); m.fill('ground', 2, 2, 20, 12, gid.coral_floor);
  spawn(m, 'entry', 12, 12);
  obj(m, 'boss', 'umibozu', tilePoint(12, 5), { kind: 'umibozu' });
  for (const [x, y] of [[3, 3], [20, 3], [3, 12], [20, 12]]) obj(m, 'pearlstone', `pearl_${x}_${y}`, tilePoint(x, y));
  maps.umibozu_lair = toTiled(m, { displayName: '海坊主的漩渦', boss: true, tier: 5 });
}

// 百鬼塔（破關後）：每層都用這張場地，妖怪由程式依樓層產生
{
  const m = newMap(22, 14, 'castle_floor');
  m.fill('obst', 0, 0, 22, 14, gid.castle_wall);
  m.fill('obst', 2, 2, 18, 10, 0);
  for (const [x, y] of [[6, 5], [15, 5], [6, 9], [15, 9]]) m.set('ground', x, y, gid.yomi_floor);
  spawn(m, 'entry', 11, 10);
  maps.tower = toTiled(m, { displayName: '百鬼塔', dark: true, tier: 4 });
}

mkdirSync('assets/tiles', { recursive: true }); mkdirSync('assets/sprites', { recursive: true }); mkdirSync('assets/maps', { recursive: true });
ts.save('assets/tiles/tiles.png');
pl.save('assets/sprites/player.png');
npc.save('assets/sprites/npcs.png');
en.save('assets/sprites/enemies.png');
boss.save('assets/sprites/boss.png');
kk.save('assets/sprites/kappaking.png');
dt.save('assets/sprites/daitengu.png');
sd.save('assets/sprites/shuten.png');
hk.save('assets/sprites/hyakki.png');
ub.save('assets/sprites/umibozu.png');
fx.save('assets/sprites/fx.png');
for (const [k, v] of Object.entries(maps)) writeFileSync(`assets/maps/${k}.json`, JSON.stringify(v));
writeFileSync('src/data/npcs.json', JSON.stringify(Object.fromEntries(NPCS.map(([id], i) => [id, { frame: i * 2 }])), null, 2) + '\n');
console.log('assets written:', Object.keys(maps).join(', '));
