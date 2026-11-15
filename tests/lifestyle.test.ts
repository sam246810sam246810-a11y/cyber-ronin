import { describe, expect, it } from 'vitest';
import { FISH, inZone, rollFish } from '../src/systems/fishing';
import { canCook, cook, FOODS, tickBuffs } from '../src/systems/cooking';
import { newGameState, statsOf, useItem } from '../src/systems/gameState';

describe('釣魚', () => {
  it('依權重抽魚', () => {
    expect(rollFish('pond', () => 0).name).toBe('鯽魚');
    expect(rollFish('pond', () => 0.999).name).toBe('金鯉');
    expect(rollFish('sea', () => 0).name).toBe('鯛魚');
  });
  it('綠色區域判定', () => {
    expect(inZone(0.5, 0.2)).toBe(true);
    expect(inZone(0.61, 0.2)).toBe(false);
  });
  it('每個釣點都有魚', () => { for (const k of Object.keys(FISH)) expect(FISH[k].length).toBeGreaterThan(0); });
});

describe('料理與加成', () => {
  it('材料夠才能煮，會扣材料', () => {
    const s = newGameState();
    const f = FOODS.find((x) => x.name === '鯛魚飯')!;
    expect(canCook(s, f)).toBe(false);
    s.items = { 鯛魚: 1, 回復丸: 2 };
    expect(cook(s, '鯛魚飯')).toContain('鯛魚飯');
    expect(s.items).toEqual({ 回復丸: 1, 鯛魚飯: 1 });
  });
  it('吃了有加成，時間到就沒了', () => {
    const s = newGameState('swordsman');
    const base = statsOf(s).atk;
    s.items['鯛魚飯'] = 1;
    expect(useItem(s, '鯛魚飯')).toContain('攻擊 +20%');
    expect(statsOf(s).atk).toBe(Math.round(base * 1.2));
    tickBuffs(s.buffs, 200);
    expect(statsOf(s).atk).toBe(base);
  });
});
