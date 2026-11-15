// 戰鬥規則（PRD 4.4–4.7、7.6）的純函式，不依賴 Phaser。

export type Rng = () => number;

export interface DamageResult { amount: number; crit: boolean }

export const CRIT_CHANCE = 0.05;
export const CRIT_MULT = 1.5;

/** 傷害 = max(1, 攻擊 × 倍率 − 防禦 × 0.5) × 亂數(0.9~1.1)，爆擊（預設 5%）×1.5，四捨五入。 */
export function calcDamage(atk: number, mult: number, def: number, rng: Rng = Math.random, critChance = CRIT_CHANCE): DamageResult {
  const base = Math.max(1, atk * mult - def * 0.5);
  const variance = 0.9 + rng() * 0.2;
  const crit = rng() < critChance;
  return { amount: Math.max(1, Math.round(base * variance * (crit ? CRIT_MULT : 1))), crit };
}

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTY: Record<Difficulty, { name: string; enemyHp: number; enemyAtk: number; exp: number; drop: number }> = {
  easy: { name: '簡單', enemyHp: 0.6, enemyAtk: 0.5, exp: 1.2, drop: 1.0 },
  normal: { name: '普通', enemyHp: 1.0, enemyAtk: 1.0, exp: 1.0, drop: 1.0 },
  hard: { name: '困難', enemyHp: 1.4, enemyAtk: 1.3, exp: 1.0, drop: 1.2 },
};

export function scaleEnemy<T extends { hp: number; atk: number; exp: number }>(base: T, diff: Difficulty): T {
  const d = DIFFICULTY[diff];
  return { ...base, hp: Math.round(base.hp * d.enemyHp), atk: Math.max(base.atk > 0 ? 1 : 0, Math.round(base.atk * d.enemyAtk)), exp: Math.round(base.exp * d.exp) };
}

// ---------- 狀態異常 ----------
export type StatusKind = 'poison' | 'paralyze' | 'burn' | 'slow';
export const STATUS_DURATION: Record<StatusKind, number> = { poison: 8, paralyze: 1.5, burn: 5, slow: 3 };
export const STATUS_NAME: Record<StatusKind, string> = { poison: '毒', paralyze: '麻', burn: '燒', slow: '慢' };
/** 剩餘秒數；0 或不存在＝沒有該狀態 */
export type Statuses = Partial<Record<StatusKind, number>>;

export function applyStatus(s: Statuses, kind: StatusKind): void {
  s[kind] = Math.max(s[kind] ?? 0, STATUS_DURATION[kind]);
}

/** 經過 dt 秒：減少剩餘時間，回傳這段時間的持續傷害（可能是小數，由呼叫端累積）。 */
export function tickStatuses(s: Statuses, dt: number, maxHp: number): number {
  let dmg = 0;
  for (const k of Object.keys(s) as StatusKind[]) {
    const left = s[k] ?? 0;
    if (left <= 0) { delete s[k]; continue; }
    const t = Math.min(dt, left);
    if (k === 'poison') dmg += maxHp * 0.02 * t;
    if (k === 'burn') dmg += 3 * t;
    s[k] = left - dt;
    if ((s[k] ?? 0) <= 0) delete s[k];
  }
  return dmg;
}

export const hasStatus = (s: Statuses, k: StatusKind) => (s[k] ?? 0) > 0;
/** 燒傷時攻擊 −20% */
export const atkModifier = (s: Statuses) => (hasStatus(s, 'burn') ? 0.8 : 1);

// ---------- 消耗品 ----------
export interface ItemEffect { hp?: number; mp?: number; cure?: StatusKind[] }
export const ITEMS: Record<string, ItemEffect> = {
  '回復丸': { hp: 50 },
  '大回復丸': { hp: 150 },
  '靈水': { mp: 30 },
  '解毒草': { cure: ['poison', 'burn'] },
  '萬能符': { cure: ['poison', 'burn', 'paralyze', 'slow'] },
  '擴充布袋': {},
};

export interface Vitals { hp: number; maxHp: number; mp: number; maxMp: number; statuses: Statuses }

/**
 * 快捷道具鈕要用哪一個（PRD 7.6）：
 * 有毒或燒傷先解；HP 少於 60% 先補血（缺很多用大回復丸）；MP 不到一半補 MP；
 * 都不需要時，HP 或 MP 沒滿就補。全滿或沒有可用道具回傳 null。
 */
export function chooseQuickItem(items: Record<string, number>, v: Vitals): string | null {
  const has = (n: string) => (items[n] ?? 0) > 0;
  if (hasStatus(v.statuses, 'paralyze') && has('萬能符')) return '萬能符';
  if (hasStatus(v.statuses, 'poison') || hasStatus(v.statuses, 'burn')) {
    if (has('解毒草')) return '解毒草';
    if (has('萬能符')) return '萬能符';
  }
  const missing = v.maxHp - v.hp;
  const hpItem = missing >= 120 && has('大回復丸') ? '大回復丸' : has('回復丸') ? '回復丸' : has('大回復丸') ? '大回復丸' : null;
  if (v.hp < v.maxHp * 0.6 && hpItem) return hpItem;
  if (v.mp < v.maxMp * 0.5 && has('靈水')) return '靈水';
  if (missing > 0 && hpItem) return hpItem;
  if (v.mp < v.maxMp && has('靈水')) return '靈水';
  return null;
}

/** 套用道具效果（會修改 v）。回傳簡短描述。 */
export function applyItem(name: string, v: Vitals): string {
  const e = ITEMS[name];
  if (!e) return '';
  const parts: string[] = [];
  if (e.hp) { const before = v.hp; v.hp = Math.min(v.maxHp, v.hp + e.hp); parts.push(`HP +${v.hp - before}`); }
  if (e.mp) { const before = v.mp; v.mp = Math.min(v.maxMp, v.mp + e.mp); parts.push(`MP +${v.mp - before}`); }
  if (e.cure) { e.cure.forEach((k) => delete v.statuses[k]); parts.push('解除異常'); }
  return `${name}：${parts.join('、')}`;
}

// ---------- 自動瞄準 ----------
export interface AimCandidate { x: number; y: number }
/**
 * 自動瞄準：在 range 內找最近的目標。面向方向前方（±90°）的目標距離打 7 折，
 * 所以同樣遠時會優先打面前的那隻，但背後很近的敵人還是會被選到。
 * 回傳目標索引，沒有回傳 -1。
 */
export function pickAimTarget(from: AimCandidate, aim: AimCandidate, targets: AimCandidate[], range: number): number {
  let best = -1, bestScore = Infinity;
  targets.forEach((t, i) => {
    const dx = t.x - from.x, dy = t.y - from.y, d = Math.hypot(dx, dy);
    if (d > range) return;
    const ahead = dx * aim.x + dy * aim.y >= 0;
    const score = ahead ? d * 0.7 : d;
    if (score < bestScore) { bestScore = score; best = i; }
  });
  return best;
}

// ---------- 劍士連段 ----------
export const COMBO_WINDOW = 0.5;
/** 下一段是第幾段（0、1、2）。距離上一段太久或已經打完第三段就從 0 開始。 */
export function nextComboStep(prevStep: number, secondsSinceLast: number): number {
  if (prevStep < 0 || prevStep >= 2 || secondsSinceLast > COMBO_WINDOW) return 0;
  return prevStep + 1;
}
export const COMBO_MULT = [1.0, 1.0, 1.4];
