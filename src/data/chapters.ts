// 章節與分岔地圖。數值卡關線主要由 hpMult / dmgMult / bossHpMult 與每層成長控制。
export type NodeKind = 'battle' | 'elite' | 'rescue' | 'camp' | 'chest' | 'shop' | 'boss';

export const NODE_INFO: Record<NodeKind, { name: string; icon: string; desc: string }> = {
  battle: { name: '戰鬥', icon: '⚔️', desc: '擊退一群搗蛋鬼' },
  elite: { name: '菁英', icon: '💀', desc: '強敵！擊敗必掉裝備' },
  rescue: { name: '救援', icon: '🐾', desc: '救出受困的動物加入隊伍' },
  camp: { name: '營火', icon: '🏕️', desc: '休息回血，或幫夥伴升星' },
  chest: { name: '寶箱', icon: '🎁', desc: '金幣與免費技能' },
  shop: { name: '行商', icon: '🛒', desc: '用本局金幣購買補給' },
  boss: { name: 'Boss', icon: '👑', desc: '章節頭目' },
};

export interface MapNode { id: number; row: number; x: number; kind: NodeKind; next: number[] }

export interface ChapterDef {
  id: number;
  name: string;
  subtitle: string;
  icon: string;
  bg: [string, string];
  wall: string;
  hpMult: number;
  dmgMult: number;
  bossHpMult: number;
  rowGrowth: number;
  normalPool: string[];
  elites: string[];
  boss: string;
  bossPatternSpeed: number;
  recommendedPower: number;
  firstClearGems: number;
}

export const MAP_ROWS = 9; // 0..7 一般，8 = Boss

export const CHAPTERS: ChapterDef[] = [
  {
    id: 1, name: '第一章', subtitle: '陽光草原', icon: '🌳',
    bg: ['#8fd16a', '#84c962'], wall: '#4f8a3a',
    hpMult: 1, dmgMult: 1, bossHpMult: 1, rowGrowth: 0.12,
    normalPool: ['mushroom', 'bee', 'hedgehog', 'snail'],
    elites: ['kingshroom', 'beequeen'], boss: 'raccoon', bossPatternSpeed: 1,
    recommendedPower: 1200, firstClearGems: 100,
  },
  {
    id: 2, name: '第二章', subtitle: '椰子海灘', icon: '🏖️',
    bg: ['#f3dc9b', '#ecd28c'], wall: '#c9a25a',
    hpMult: 2.4, dmgMult: 1.6, bossHpMult: 1.15, rowGrowth: 0.13,
    normalPool: ['crab', 'frog', 'bee', 'hedgehog', 'mushroom'],
    elites: ['beequeen', 'kingshroom'], boss: 'boar', bossPatternSpeed: 1.1,
    recommendedPower: 2600, firstClearGems: 150,
  },
  {
    id: 3, name: '第三章', subtitle: '棉花糖雪山', icon: '🏔️',
    bg: ['#e4eef7', '#d8e6f2'], wall: '#8aa6c1',
    hpMult: 5.2, dmgMult: 2.5, bossHpMult: 1.3, rowGrowth: 0.14,
    normalPool: ['seal', 'owl', 'frog', 'snail', 'crab'],
    elites: ['kingshroom', 'beequeen'], boss: 'raccoon', bossPatternSpeed: 1.35,
    recommendedPower: 5000, firstClearGems: 200,
  },
];

/** 產生分岔地圖：第 0 層 1 個戰鬥，第 1~7 層 2~3 個隨機節點，第 7 層固定營火，第 8 層 Boss */
export function buildMap(rand: () => number): MapNode[][] {
  const rows: MapNode[][] = [];
  let id = 0;
  const pickKind = (row: number): NodeKind => {
    const table: [NodeKind, number][] = [['battle', 44], ['rescue', 16], ['chest', 10], ['camp', 10], ['shop', 8], ['elite', row >= 3 ? 14 : 0]];
    const total = table.reduce((a, [, w]) => a + w, 0);
    let r = rand() * total;
    for (const [k, w] of table) { r -= w; if (r <= 0) return k; }
    return 'battle';
  };
  for (let row = 0; row < MAP_ROWS; row++) {
    const n = row === 0 || row === MAP_ROWS - 1 ? 1 : 2 + Math.floor(rand() * 2);
    const nodes: MapNode[] = [];
    for (let i = 0; i < n; i++) {
      let kind: NodeKind = row === 0 ? 'battle' : row === MAP_ROWS - 1 ? 'boss' : row === MAP_ROWS - 2 ? 'camp' : row === 1 ? (i === 0 ? 'rescue' : 'battle') : pickKind(row);
      // 同一層不要全部都是非戰鬥
      if (row >= 2 && row < MAP_ROWS - 2 && i === n - 1 && nodes.every((x) => x.kind !== 'battle' && x.kind !== 'elite')) kind = 'battle';
      nodes.push({ id: id++, row, x: n === 1 ? 0.5 : 0.18 + (0.64 * i) / (n - 1), kind, next: [] });
    }
    rows.push(nodes);
  }
  // 連線：每個節點連到下一層最近的 1~2 個；確保下一層每個節點都有入口
  for (let r = 0; r < MAP_ROWS - 1; r++) {
    const cur = rows[r], nxt = rows[r + 1];
    for (const a of cur) {
      const sorted = [...nxt].sort((p, q) => Math.abs(p.x - a.x) - Math.abs(q.x - a.x));
      a.next.push(sorted[0].id);
      if (sorted[1] && rand() < 0.55) a.next.push(sorted[1].id);
    }
    for (const b of nxt) {
      if (!cur.some((a) => a.next.includes(b.id))) {
        const near = [...cur].sort((p, q) => Math.abs(p.x - b.x) - Math.abs(q.x - b.x))[0];
        near.next.push(b.id);
      }
    }
  }
  return rows;
}
