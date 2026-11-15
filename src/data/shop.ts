// 商店與禮包設定（M1 為模擬金流，不會實際扣款）
// 合規原則：價值對比一律以「商店實際售價」計算，不使用虛構原價。

export interface GemPack { id: string; ntd: number; gems: number; icon: string }
export const GEM_PACKS: GemPack[] = [
  { id: 'g30', ntd: 30, gems: 100, icon: '💎' },
  { id: 'g150', ntd: 150, gems: 550, icon: '💎' },
  { id: 'g300', ntd: 300, gems: 1200, icon: '💎' },
  { id: 'g990', ntd: 990, gems: 4200, icon: '💎' },
];
// 基準匯率：最小包的每鑽石價格，用來計算真實價值對比
export const NTD_PER_GEM = GEM_PACKS[0].ntd / GEM_PACKS[0].gems;

export interface ChestDef {
  id: string; name: string; icon: string;
  cost: { gold?: number; gems?: number };
  odds: number[];           // 各稀有度機率（白綠藍紫金紅）
  pity?: { every: number; minRarity: number };
}
export const CHESTS: ChestDef[] = [
  { id: 'wood', name: '木頭寶箱', icon: '📦', cost: { gold: 1200 }, odds: [0.7, 0.27, 0.03, 0, 0, 0] },
  { id: 'gold', name: '黃金寶箱', icon: '🎁', cost: { gems: 300 }, odds: [0, 0, 0.7, 0.25, 0.05, 0], pity: { every: 10, minRarity: 4 } },
];

// 失敗時觸發的「突破禮包」
export const BREAKTHROUGH_OFFER = {
  id: 'breakthrough',
  title: '突破禮包',
  ntd: 30,
  gems: 300,
  gold: 5000,
  item: { tpl: 'wand', rarity: 3 },
  durationMs: 60 * 60 * 1000,
  cooldownMs: 24 * 60 * 60 * 1000,
};

export const FIRST_PURCHASE_GIFT = { tpl: 'moon', rarity: 3 };

export const REVIVE_GEMS = 30;
export const DAILY_AD_GEMS = { perAd: 20, max: 3 };
