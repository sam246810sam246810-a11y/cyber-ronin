import { describe, expect, it } from 'vitest';
import { addExp, computeStats, expToNext, LEVEL_CAP } from '../src/systems/progression';
import { BASES, canUse, equipStats, equipValue, generateEquip, rollRarity, sellPrice, type Equip } from '../src/systems/equipment';
import { canAddGear, canAddItem, slotsUsed, type Bag } from '../src/systems/inventory';
import { calcDamage } from '../src/systems/combat';

const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };

describe('升級', () => {
  it('經驗曲線 floor(20 × L^1.6)', () => {
    expect(expToNext(1)).toBe(20);
    expect(expToNext(9)).toBe(672);
  });
  it('一次可以升好幾級，剩餘經驗保留', () => {
    expect(addExp(1, 0, 25)).toEqual({ level: 2, exp: 5, gained: 1 });
    expect(addExp(1, 10, 20 + 60 + 5)).toEqual({ level: 3, exp: 15, gained: 2 });
  });
  it('滿級不再升', () => {
    expect(addExp(LEVEL_CAP, 0, 99999)).toEqual({ level: LEVEL_CAP, exp: 0, gained: 0 });
  });
});

describe('能力值', () => {
  it('Lv1 無裝備＝職業基礎', () => {
    expect(computeStats('swordsman', 1, [])).toEqual({ maxHp: 120, maxMp: 50, atk: 12, def: 8, spd: 100, crit: 5, mpRegen: 1 });
  });
  it('等級成長＋裝備＋百分比詞條', () => {
    const s = computeStats('archer', 3, [{ atk: 4 }, { atkPct: 10, hp: 5 }]);
    // 攻擊 (10 + 2×2 + 4) × 1.1 = 19.8 → 20；HP 90 + 9×2 + 5
    expect(s.atk).toBe(20);
    expect(s.maxHp).toBe(113);
    expect(s.spd).toBe(117);
  });
});

describe('裝備', () => {
  it('稀有度權重：亂數 0 → 普通，接近 1 → 史詩（上限 3）', () => {
    expect(rollRarity(() => 0)).toBe(0);
    expect(rollRarity(() => 0.999)).toBe(3);
    expect(rollRarity(() => 0, 2)).toBe(2);
  });
  it('只產生自己職業能用的武器', () => {
    for (let i = 0; i < 50; i++) {
      const e = generateEquip(Math.random, i, { tier: 1, classId: 'archer', slot: 'weapon' });
      expect(BASES[e.base].class).toBe('archer');
    }
  });
  it('詞條數＝稀有度規定，且不重複', () => {
    const e = generateEquip(seq(0.1, 0.97, 0.3, 0.5, 0.7, 0.2, 0.9), 1, { tier: 1, classId: 'swordsman' });
    expect(e.affixes.length).toBe([0, 1, 2, 3][e.rarity]);
    expect(new Set(e.affixes.map((a) => a.stat)).size).toBe(e.affixes.length);
  });
  it('能力加總與價格', () => {
    const e: Equip = { uid: 1, base: 'hachigane', rarity: 2, affixes: [{ stat: 'hp', value: 7 }, { stat: 'def', value: 1 }] };
    expect(equipStats(e)).toEqual({ def: 3, hp: 12 });
    expect(equipValue(e)).toBe(200);
    expect(sellPrice(200)).toBe(80);
    expect(canUse({ uid: 2, base: 'fox_fan', rarity: 0, affixes: [] }, 'swordsman')).toBe(false);
  });
});

describe('背包', () => {
  const bag = (): Bag => ({ items: { 回復丸: 98 }, gear: [{ uid: 1, base: 'tabi', rarity: 0, affixes: [] }, { uid: 2, base: 'wood_sword', rarity: 0, affixes: [] }], equipped: { weapon: 2 }, capacity: 3 });
  it('穿在身上的不佔格，消耗品每 99 個一格', () => expect(slotsUsed(bag())).toBe(2));
  it('疊到 99 以內不用新格，超過要新格', () => {
    const b = bag();
    expect(canAddItem(b, '回復丸', 1)).toBe(true);
    expect(canAddItem(b, '回復丸', 2)).toBe(true);  // 第 3 格
    b.capacity = 2;
    expect(canAddItem(b, '回復丸', 2)).toBe(false);
    expect(canAddGear(b)).toBe(false);
  });
});

describe('爆擊率', () => {
  it('可以指定爆擊率', () => {
    expect(calcDamage(10, 1, 0, seq(0.5, 0.2), 0.25).crit).toBe(true);
    expect(calcDamage(10, 1, 0, seq(0.5, 0.2)).crit).toBe(false);
  });
});
