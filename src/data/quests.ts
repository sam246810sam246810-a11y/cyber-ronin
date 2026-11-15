// 新手 7 日嘉年華。合規設計：免費玩家完成約 2/3 任務即可拿到最終大獎。
export type CounterKey =
  | 'kills' | 'rooms' | 'runs' | 'upgrades' | 'merges' | 'chests'
  | 'eliteKills' | 'bossKills' | 'chapterClears' | 'evolutions' | 'logins' | 'builds' | 'recruits';

export interface QuestDef { id: string; day: number; text: string; key: CounterKey; target: number; points: number }

const q = (day: number, key: CounterKey, target: number, points: number, text: string): QuestDef =>
  ({ id: `d${day}_${key}_${target}`, day, key, target, points, text });

export const QUESTS: QuestDef[] = [
  q(1, 'logins', 1, 10, '登入遊戲 1 天'),
  q(1, 'rooms', 4, 10, '累計完成 4 場戰鬥'),
  q(1, 'kills', 50, 10, '累計擊倒 50 個敵人'),
  q(1, 'upgrades', 3, 10, '強化裝備 3 次'),
  q(2, 'logins', 2, 10, '登入遊戲 2 天'),
  q(2, 'kills', 150, 10, '累計擊倒 150 個敵人'),
  q(2, 'chests', 2, 10, '開啟寶箱 2 次'),
  q(2, 'builds', 2, 10, '村莊建造 / 升級 2 次'),
  q(3, 'logins', 3, 10, '登入遊戲 3 天'),
  q(3, 'merges', 1, 15, '合成裝備 1 次'),
  q(3, 'recruits', 12, 10, '累計招募 12 隻夥伴'),
  q(3, 'evolutions', 1, 15, '在冒險中發動 1 次合體技'),
  q(4, 'logins', 4, 10, '登入遊戲 4 天'),
  q(4, 'kills', 400, 10, '累計擊倒 400 個敵人'),
  q(4, 'builds', 5, 10, '村莊建造 / 升級 5 次'),
  q(4, 'eliteKills', 5, 15, '擊倒 5 個菁英怪'),
  q(5, 'logins', 5, 10, '登入遊戲 5 天'),
  q(5, 'chapterClears', 1, 20, '通關任意章節 1 次'),
  q(5, 'chests', 6, 10, '開啟寶箱 6 次'),
  q(5, 'rooms', 40, 10, '累計完成 40 場戰鬥'),
  q(6, 'logins', 6, 10, '登入遊戲 6 天'),
  q(6, 'builds', 10, 15, '村莊建造 / 升級 10 次'),
  q(6, 'kills', 900, 10, '累計擊倒 900 個敵人'),
  q(6, 'bossKills', 3, 15, '擊倒 Boss 3 次'),
  q(7, 'logins', 7, 10, '登入遊戲 7 天'),
  q(7, 'upgrades', 25, 10, '強化裝備 25 次'),
  q(7, 'runs', 20, 10, '累計冒險 20 次'),
  q(7, 'evolutions', 4, 20, '累計發動 4 次合體技'),
];

export const QUEST_TOTAL_POINTS = QUESTS.reduce((a, b) => a + b.points, 0);

export interface Milestone { points: number; label: string; icon: string; gold?: number; gems?: number; item?: { tpl: string; rarity: number } }
export const MILESTONES: Milestone[] = [
  { points: 40, label: '金幣 ×3000', icon: '🪙', gold: 3000 },
  { points: 80, label: '鑽石 ×200', icon: '💎', gems: 200 },
  { points: 120, label: '史詩 星星項圈', icon: '⭐', item: { tpl: 'star', rarity: 3 } },
  { points: 160, label: '鑽石 ×400', icon: '💎', gems: 400 },
  { points: 220, label: '傳說 鈴鐺魔杖', icon: '🪄', item: { tpl: 'wand', rarity: 4 } },
];

export const CARNIVAL_DAYS = 7;
export const CARNIVAL_CLAIM_DAYS = 9; // 第 8、9 天仍可領取
// 每日加速包（透明呈現：直接加積分）
export const CARNIVAL_PACK = { ntd: 60, points: 40, gems: 300 };
