import { PARTNERS, PartnerId, RECRUITABLE } from './partners';

// 夥伴召喚（抽蛋）。所有機率公開於遊戲內「機率說明」。
// 稀有度：0 白 1 綠 2 藍 3 紫 4 金 5 紅

export const PULL_COST = { single: 200, ten: 1800 };
/** 抽到已擁有的夥伴 → 轉成碎片 */
export const DUPE_SHARDS = [10, 15, 20, 30, 50, 80];

export interface Banner {
  id: string;
  name: string;
  odds: number[];          // 各稀有度機率
  pity: number;            // 幾抽內必出保底
  pityMinRarity?: number;  // 常駐池：保底稀有度
  featured?: PartnerId;    // 限時池：主打夥伴
  featuredShare?: number;  // 主打在其稀有度中的佔比
}

export const STANDARD: Banner = {
  id: 'standard', name: '常駐召喚',
  odds: [0.40, 0.30, 0.18, 0.09, 0.03, 0],
  pity: 50, pityMinRarity: 4,
};

// 限時卡池每週輪替主打
export const ROTATION: PartnerId[] = ['dragon', 'unicorn', 'panda', 'dolphin'];
export const WEEK_MS = 7 * 86400000;

export function limitedBanner(weekIndex: number): Banner {
  const featured = ROTATION[((weekIndex % ROTATION.length) + ROTATION.length) % ROTATION.length];
  const r = PARTNERS[featured].rarity;
  const odds = [0.38, 0.30, 0.18, 0.09, 0.04, r === 5 ? 0.01 : 0];
  return { id: `limited_${weekIndex}`, name: `限時召喚・${PARTNERS[featured].name}`, odds, pity: 60, featured, featuredShare: 0.5 };
}

/** 某卡池中可以抽到的夥伴（神話只在主打為神話時出現） */
export function poolOf(b: Banner, rarity: number): PartnerId[] {
  return RECRUITABLE.filter((p) => PARTNERS[p].rarity === rarity && (!PARTNERS[p].limited || p === b.featured));
}

/** 每個夥伴的實際機率（顯示用） */
export function partnerOdds(b: Banner): { p: PartnerId; odds: number }[] {
  const out: { p: PartnerId; odds: number }[] = [];
  b.odds.forEach((o, r) => {
    if (!o) return;
    const pool = poolOf(b, r);
    for (const p of pool) {
      let share = 1 / pool.length;
      if (b.featured && PARTNERS[b.featured].rarity === r) share = p === b.featured ? b.featuredShare! : (1 - b.featuredShare!) / Math.max(1, pool.length - 1);
      if (pool.length === 1) share = 1;
      out.push({ p, odds: o * share });
    }
  });
  return out.sort((a, c) => PARTNERS[c.p].rarity - PARTNERS[a.p].rarity || c.odds - a.odds);
}
