// 章節與房間設定。數值卡關線主要由 hpMult / dmgMult / bossHpMult 控制。
export interface RoomSpec {
  enemies: [string, number][];
  layout: number;
  kind: 'normal' | 'elite' | 'boss';
}

export interface ChapterDef {
  id: number;
  name: string;
  subtitle: string;
  icon: string;
  bg: [string, string];      // 地板雙色格
  wall: string;
  obstacle: string;
  hpMult: number;
  dmgMult: number;
  bossHpMult: number;
  roomGrowth: number;        // 每房間敵人血量成長
  normalPool: string[];
  elites: [string, string];
  boss: string;
  bossPatternSpeed: number;
  recommendedPower: number;  // 推薦戰力（顯示用）
  firstClearGems: number;
}

export const ROOMS_PER_CHAPTER = 15;

export const CHAPTERS: ChapterDef[] = [
  {
    id: 1, name: '第一章', subtitle: '陽光草原', icon: '🌳',
    bg: ['#8fd16a', '#84c962'], wall: '#4f8a3a', obstacle: '#6b8f4e',
    hpMult: 1, dmgMult: 1, bossHpMult: 1, roomGrowth: 0.07,
    normalPool: ['mushroom', 'bee', 'hedgehog', 'snail'],
    elites: ['kingshroom', 'beequeen'], boss: 'raccoon', bossPatternSpeed: 1,
    recommendedPower: 1200, firstClearGems: 100,
  },
  {
    id: 2, name: '第二章', subtitle: '椰子海灘', icon: '🏖️',
    bg: ['#f3dc9b', '#ecd28c'], wall: '#c9a25a', obstacle: '#a3835a',
    hpMult: 2.4, dmgMult: 1.6, bossHpMult: 1.15, roomGrowth: 0.08,
    normalPool: ['crab', 'frog', 'bee', 'hedgehog', 'mushroom'],
    elites: ['beequeen', 'kingshroom'], boss: 'boar', bossPatternSpeed: 1.1,
    recommendedPower: 2600, firstClearGems: 150,
  },
  {
    id: 3, name: '第三章', subtitle: '棉花糖雪山', icon: '🏔️',
    bg: ['#e4eef7', '#d8e6f2'], wall: '#8aa6c1', obstacle: '#9bb4cc',
    hpMult: 5.2, dmgMult: 2.5, bossHpMult: 1.3, roomGrowth: 0.09,
    normalPool: ['penguin', 'owl', 'frog', 'snail', 'crab'],
    elites: ['kingshroom', 'beequeen'], boss: 'raccoon', bossPatternSpeed: 1.35,
    recommendedPower: 5000, firstClearGems: 200,
  },
];

// 根據章節產生 15 個房間：前 70% 爽快、5/10 菁英、15 Boss
export function buildRooms(ch: ChapterDef, rand: () => number): RoomSpec[] {
  const rooms: RoomSpec[] = [];
  const pick = () => ch.normalPool[Math.floor(rand() * ch.normalPool.length)];
  for (let i = 1; i <= ROOMS_PER_CHAPTER; i++) {
    if (i === 5) rooms.push({ enemies: [[ch.elites[0], 1]], layout: 0, kind: 'elite' });
    else if (i === 10) rooms.push({ enemies: [[ch.elites[1], 1], [pick(), 2]], layout: 3, kind: 'elite' });
    else if (i === ROOMS_PER_CHAPTER) rooms.push({ enemies: [[ch.boss, 1]], layout: 0, kind: 'boss' });
    else {
      const count = Math.min(2 + Math.floor(i / 2.2), 8);
      const map = new Map<string, number>();
      for (let k = 0; k < count; k++) {
        const id = pick();
        map.set(id, (map.get(id) ?? 0) + 1);
      }
      rooms.push({ enemies: [...map.entries()], layout: 1 + Math.floor(rand() * 5), kind: 'normal' });
    }
  }
  return rooms;
}
