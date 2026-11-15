// 檢查地圖可以破關：從入口走得到所有寶箱、出口；推石頭的路線是空的、終點是踏板。
import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/data/maps';

interface TObj { name: string; type: string; x: number; y: number; width?: number; height?: number; properties?: { name: string; value: unknown }[] }
interface TMap { width: number; height: number; layers: { name: string; data?: number[]; objects?: TObj[] }[]; tilesets: { tiles: { id: number; properties: { name: string; value: unknown }[] }[] }[] }

const prop = (o: TObj, k: string) => o.properties?.find((p) => p.name === k)?.value;
const DIR: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function analyze(key: string) {
  const m = MAPS[key] as unknown as TMap;
  const W = m.width, H = m.height;
  const collides = new Set(m.tilesets[0].tiles.filter((t) => t.properties.find((p) => p.name === 'collides')?.value).map((t) => t.id + 1));
  const obst = m.layers.find((l) => l.name === 'obstacles')!.data!;
  const objs = m.layers.find((l) => l.name === 'objects')!.objects!;
  const tile = (o: TObj) => [Math.floor(o.x / 16), Math.floor(o.y / 16)] as const;
  const solidObj = new Set<string>();
  for (const o of objs) if (['chest', 'sign', 'npc', 'well', 'block', 'lantern', 'bossdoor', 'jizo', 'cocoon', 'bosslantern', 'board', 'lever', 'sluice', 'trial', 'relay', 'bell', 'barrel', 'sealstone'].includes(o.type)) solidObj.add(tile(o).join(','));
  const wall = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || collides.has(obst[y * W + x]);
  return { W, H, objs, tile, wall, solidObj };
}

/** 從 start 走得到的格子。裂牆與門視為已打開（玩家可以打破、解謎）。 */
function reachable(a: ReturnType<typeof analyze>, start: readonly [number, number], blocked: Set<string>) {
  const seen = new Set<string>([start.join(',')]);
  const q = [start];
  while (q.length) {
    const [x, y] = q.shift()!;
    for (const [dx, dy] of Object.values(DIR)) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (seen.has(k) || a.wall(nx, ny) || blocked.has(k)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return seen;
}

describe.each(['village', 'forest', 'b1', 'b2', 'b3', 'lair', 'swamp', 'suijin1', 'suijin2', 'kappa_lair', 'mountain', 'tengu_temple', 'tengu_lair', 'oni_road', 'oni_castle1', 'oni_castle2', 'shuten_lair', 'yomi'])('地圖 %s', (key) => {
  const a = analyze(key);
  const start = a.objs.find((o) => o.type === 'spawn')!;
  const reach = reachable(a, a.tile(start), a.solidObj);
  const near = (x: number, y: number) => Object.values(DIR).some(([dx, dy]) => reach.has(`${x + dx},${y + dy}`));

  it('所有寶箱、告示牌、燈籠都走得到旁邊', () => {
    for (const o of a.objs.filter((o) => ['chest', 'sign', 'lantern', 'npc', 'well', 'bossdoor', 'jizo', 'bosslantern', 'board', 'pickup', 'lever', 'sluice', 'trial', 'relay', 'bell', 'barrel', 'sealstone', 'sealgate'].includes(o.type))) {
      const [x, y] = a.tile(o);
      expect(near(x, y), `${o.name} @ ${x},${y}`).toBe(true);
    }
  });

  it('所有出口走得到', () => {
    for (const o of a.objs.filter((o) => o.type === 'exit')) {
      const [x, y] = a.tile(o);
      const cells = [];
      for (let i = 0; i < (o.width ?? 16) / 16; i++) for (let j = 0; j < (o.height ?? 16) / 16; j++) cells.push(`${x + i},${y + j}`);
      expect(cells.some((c) => reach.has(c) || near(+c.split(',')[0], +c.split(',')[1])), o.name).toBe(true);
    }
  });

  it('推石頭：站位走得到，路線上沒東西，終點是同一組的踏板', () => {
    for (const b of a.objs.filter((o) => o.type === 'block')) {
      const [bx, by] = a.tile(b);
      const [dx, dy] = DIR[String(prop(b, 'dir'))];
      expect(reach.has(`${bx - dx},${by - dy}`), `${b.name} 推的位置`).toBe(true);
      const plates = a.objs.filter((o) => o.type === 'plate' && prop(o, 'group') === prop(b, 'group')).map((o) => a.tile(o).join(','));
      let x = bx, y = by, hit = false;
      for (let i = 0; i < 12; i++) {
        x += dx; y += dy;
        expect(a.wall(x, y) || a.solidObj.has(`${x},${y}`), `${b.name} 路線 ${x},${y}`).toBe(false);
        if (plates.includes(`${x},${y}`)) { hit = true; break; }
      }
      expect(hit, `${b.name} 推得到踏板`).toBe(true);
    }
  });

  it('門都有對應的踏板或燈籠', () => {
    for (const g of a.objs.filter((o) => o.type === 'gate' || o.type === 'watergate')) {
      const group = prop(g, 'group');
      expect(a.objs.some((o) => (o.type === 'plate' || o.type === 'lantern' || o.type === 'lever' || o.type === 'trial') && prop(o, 'group') === group), g.name).toBe(true);
    }
  });
});
