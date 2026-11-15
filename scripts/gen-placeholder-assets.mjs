// 產生 M1 用的佔位像素素材：tileset、主角 spritesheet、狐火村 Tiled 地圖。
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
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
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
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return;
    const i = (y * this.w + x) * 4;
    this.buf[i] = (c >> 16) & 255; this.buf[i + 1] = (c >> 8) & 255; this.buf[i + 2] = c & 255; this.buf[i + 3] = 255;
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
  save(path) { writeFileSync(path, png(this.w, this.h, this.buf)); }
}

let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// ---------- Tileset ----------
// 編號（0 起算）與用途；collides 會寫進 Tiled tile 屬性。
const TILES = [
  { name: 'grass' }, { name: 'grass_flower' }, { name: 'path' }, { name: 'water', collides: true },
  { name: 'tree', collides: true }, { name: 'wall', collides: true }, { name: 'roof', collides: true }, { name: 'fence', collides: true },
  { name: 'lantern', collides: true }, { name: 'torii_pillar', collides: true }, { name: 'torii_top', collides: true }, { name: 'stone_floor' },
  { name: 'door', collides: true }, { name: 'bamboo', collides: true }, { name: 'rock', collides: true }, { name: 'bridge' },
];
const COLS = 8;
const ts = new Canvas(COLS * T, Math.ceil(TILES.length / COLS) * T);

const C = {
  grass: 0x5b9a4a, grassD: 0x4a8240, grassL: 0x74b35a, path: 0xc9a66b, pathD: 0xb08d55,
  water: 0x3f7fbf, waterL: 0x7fb3e0, trunk: 0x6b4428, leaf: 0x2f6b3a, leafL: 0x3f8a48,
  wall: 0xe8dcc0, wood: 0x7a5232, roof: 0x3b4a6b, roofL: 0x56688f, red: 0xc23b2f, redD: 0x8f2a22,
  stone: 0x9a9a92, stoneD: 0x77776f, stoneL: 0xb8b8ae, bamboo: 0x7fae4a, bambooD: 0x5a8a34, flower: 0xf0d0e0, yellow: 0xf2c94c,
};

function grassBase(ox, oy) {
  ts.rect(ox, oy, T, T, C.grass);
  for (let i = 0; i < 14; i++) ts.px(ox + Math.floor(rnd() * T), oy + Math.floor(rnd() * T), rnd() > 0.5 ? C.grassD : C.grassL);
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
    ts.rect(ox, oy + 2, T, 3, 0x222222); ts.rect(ox, oy + 5, T, 3, C.red); ts.rect(ox, oy + 11, T, 2, C.red);
  },
  stone_floor(ox, oy) {
    ts.rect(ox, oy, T, T, C.stoneL);
    ts.rect(ox, oy + 7, T, 1, C.stone); ts.rect(ox + 7, oy, 1, 7, C.stone); ts.rect(ox + 3, oy + 8, 1, 8, C.stone); ts.rect(ox + 12, oy + 8, 1, 8, C.stone);
  },
  door(ox, oy) {
    ts.rect(ox, oy, T, T, C.wall);
    ts.rect(ox + 3, oy + 2, 10, 14, C.wood); ts.rect(ox + 7, oy + 2, 1, 14, C.trunk); ts.px(ox + 10, oy + 9, C.yellow);
  },
  bamboo(ox, oy) {
    grassBase(ox, oy);
    for (const x of [2, 7, 12]) { ts.rect(ox + x, oy, 2, T, C.bamboo); ts.rect(ox + x, oy + 5, 2, 1, C.bambooD); ts.rect(ox + x, oy + 11, 2, 1, C.bambooD); }
  },
  rock(ox, oy) {
    grassBase(ox, oy);
    ts.rect(ox + 3, oy + 5, 10, 9, C.stone); ts.rect(ox + 4, oy + 5, 5, 3, C.stoneL); ts.rect(ox + 3, oy + 12, 10, 2, C.stoneD);
  },
  bridge(ox, oy) {
    ts.rect(ox, oy, T, T, C.water);
    ts.rect(ox, oy + 1, T, 14, C.wood);
    for (let x = 0; x < T; x += 4) ts.rect(ox + x, oy + 1, 1, 14, C.trunk);
  },
};
TILES.forEach((t, i) => draw[t.name]((i % COLS) * T, Math.floor(i / COLS) * T));

// ---------- 主角 spritesheet：3 欄（站立、走 1、走 2）× 4 列（下、左、右、上）----------
const pl = new Canvas(3 * T, 4 * T);
const P = { hair: 0x2a1e1e, skin: 0xf2d2b0, white: 0xf4f4f0, red: 0xc8342b, redD: 0x8f2a22, eye: 0x1a1a1a, ribbon: 0xe04848 };
function drawPlayer(col, row) {
  const ox = col * T, oy = row * T;
  const step = col === 0 ? 0 : col === 1 ? 1 : -1;
  // 腿（緋袴）
  pl.rect(ox + 5, oy + 10, 6, 4, P.red);
  pl.rect(ox + 5 + (step > 0 ? 0 : 1), oy + 14, 2, 2, P.redD);
  pl.rect(ox + 9 - (step < 0 ? 0 : 1), oy + 14, 2, 2, P.redD);
  if (step !== 0) pl.rect(ox + (step > 0 ? 4 : 10), oy + 13, 2, 1, P.red);
  // 上衣（白衣）
  pl.rect(ox + 4, oy + 7, 8, 4, P.white);
  pl.rect(ox + 3, oy + 8, 1, 3, P.white); pl.rect(ox + 12, oy + 8, 1, 3, P.white);
  // 頭
  pl.rect(ox + 4, oy + 1, 8, 7, P.hair);
  if (row === 0) { pl.rect(ox + 5, oy + 3, 6, 4, P.skin); pl.px(ox + 6, oy + 5, P.eye); pl.px(ox + 9, oy + 5, P.eye); pl.rect(ox + 7, oy + 7, 2, 1, P.red); }
  if (row === 1) { pl.rect(ox + 4, oy + 3, 4, 4, P.skin); pl.px(ox + 5, oy + 5, P.eye); pl.rect(ox + 11, oy + 3, 2, 6, P.hair); }
  if (row === 2) { pl.rect(ox + 8, oy + 3, 4, 4, P.skin); pl.px(ox + 10, oy + 5, P.eye); pl.rect(ox + 3, oy + 3, 2, 6, P.hair); }
  if (row === 3) { pl.rect(ox + 6, oy + 7, 4, 3, P.hair); pl.rect(ox + 7, oy + 2, 2, 1, P.ribbon); }
}
for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) drawPlayer(c, r);

// ---------- 狐火村地圖（40×30）----------
const W = 40, H = 30;
const id = Object.fromEntries(TILES.map((t, i) => [t.name, i + 1])); // Tiled gid（firstgid = 1）
const ground = new Array(W * H).fill(0);
const obst = new Array(W * H).fill(0);
const set = (layer, x, y, gid) => { if (x >= 0 && y >= 0 && x < W && y < H) layer[y * W + x] = gid; };
const fill = (layer, x, y, w, h, gid) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(layer, x + i, y + j, gid); };

seed = 42;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(ground, x, y, rnd() < 0.08 ? id.grass_flower : id.grass);

// 邊界：北、西、南是樹林，東邊是竹林（之後通往迷霧竹林）
for (let x = 0; x < W; x++) { set(obst, x, 0, id.tree); set(obst, x, 1, id.tree); set(obst, x, H - 1, id.tree); }
for (let y = 0; y < H; y++) { set(obst, 0, y, id.tree); set(obst, W - 1, y, id.bamboo); set(obst, W - 2, y, id.bamboo); }

// 道路：南北主道＋東西主道
fill(ground, 18, 2, 3, H - 3, id.path);
fill(ground, 1, 15, W - 3, 3, id.path);
set(obst, W - 1, 16, 0); set(obst, W - 2, 16, 0); // 東側竹林缺口（M4 才接上出口）

// 神社（北）
fill(ground, 14, 3, 11, 7, id.stone_floor);
fill(obst, 15, 3, 9, 2, id.roof);
fill(obst, 15, 5, 9, 2, id.wall);
set(obst, 19, 6, id.door);
set(obst, 14, 8, id.lantern); set(obst, 24, 8, id.lantern);
// 鳥居
set(obst, 17, 10, id.torii_top); set(obst, 18, 10, id.torii_top); set(obst, 20, 10, id.torii_top); set(obst, 21, 10, id.torii_top);
set(obst, 17, 11, id.torii_pillar); set(obst, 21, 11, id.torii_pillar);

// 民家
function house(x, y, w) {
  fill(obst, x, y, w, 2, id.roof);
  fill(obst, x, y + 2, w, 2, id.wall);
  set(obst, x + Math.floor(w / 2), y + 3, id.door);
  set(ground, x + Math.floor(w / 2), y + 4, id.path);
}
house(4, 6, 6);   // 宮司爺爺家
house(4, 20, 5);  // 民家
house(26, 5, 5);  // 道具屋
house(27, 20, 6); // 鍛冶屋

// 池塘＋小橋（西南）
fill(obst, 9, 23, 7, 4, id.water);
fill(ground, 9, 23, 7, 4, id.water);
for (let x = 9; x < 16; x++) { set(obst, x, 24, 0); set(ground, x, 24, id.bridge); }

// 柵欄＆裝飾
fill(obst, 26, 11, 6, 1, id.fence);
fill(obst, 32, 11, 1, 3, id.fence);
for (const [x, y] of [[8, 12], [30, 26], [35, 4], [3, 27], [24, 13]]) set(obst, x, y, id.rock);
for (const [x, y] of [[2, 3], [3, 10], [12, 12], [34, 8], [36, 22], [23, 27], [33, 27]]) set(obst, x, y, id.tree);
set(obst, 16, 14, id.lantern); set(obst, 22, 14, id.lantern);

const map = {
  compressionlevel: -1, height: H, width: W, infinite: false, orientation: 'orthogonal', renderorder: 'right-down',
  tiledversion: '1.11.0', type: 'map', version: '1.10', tilewidth: T, tileheight: T, nextlayerid: 4, nextobjectid: 2,
  properties: [{ name: 'displayName', type: 'string', value: '狐火村' }],
  layers: [
    { id: 1, name: 'ground', type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data: ground },
    { id: 2, name: 'obstacles', type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data: obst },
    {
      id: 3, name: 'objects', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true,
      objects: [{ id: 1, name: 'spawn', type: 'spawn', x: 19.5 * T, y: 13 * T, width: 0, height: 0, point: true, rotation: 0, visible: true }],
    },
  ],
  tilesets: [{
    firstgid: 1, name: 'village_tiles', image: '../tiles/tiles.png', imagewidth: ts.w, imageheight: ts.h,
    tilewidth: T, tileheight: T, tilecount: TILES.length, columns: COLS, margin: 0, spacing: 0,
    tiles: TILES.map((t, i) => ({ id: i, properties: [{ name: 'name', type: 'string', value: t.name }, { name: 'collides', type: 'bool', value: !!t.collides }] })),
  }],
};

mkdirSync('assets/tiles', { recursive: true }); mkdirSync('assets/sprites', { recursive: true }); mkdirSync('assets/maps', { recursive: true });
ts.save('assets/tiles/tiles.png');
pl.save('assets/sprites/player.png');
writeFileSync('assets/maps/village.json', JSON.stringify(map));
console.log('placeholder assets written: tiles.png, player.png, village.json');
