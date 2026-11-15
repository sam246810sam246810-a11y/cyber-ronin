import { describe, expect, it } from 'vitest';
import { newGameState, statsOf, equip } from '../src/systems/gameState';
import { craft, enhance, enhanceCost, synthesize } from '../src/systems/forge';
import { equipName, equipStats } from '../src/systems/equipment';

describe('鍛冶屋', () => {
  it('材料不夠不能打造；夠了會扣材料與錢，做出職業武器', () => {
    const s = newGameState('archer');
    expect(craft(s, 'class_weapon').ok).toBe(false);
    s.items = { 玉鋼: 4, 狐火的殘焰: 3 }; s.money = 350;
    const r = craft(s, 'class_weapon');
    expect(r.ok).toBe(true);
    expect(r.item!.base).toBe('moon_bow');
    expect(r.item!.rarity).toBe(1);
    expect(s.items).toEqual({ 玉鋼: 1 });
    expect(s.money).toBe(50);
  });
  it('強化每級 +8%，最多 +5，花費遞增', () => {
    const s = newGameState('swordsman');
    s.items['玉鋼'] = 99; s.money = 9999;
    const sword = s.gear[0]; // 木刀 攻擊 +2
    expect(enhanceCost(0)).toEqual({ mats: { 玉鋼: 1 }, money: 50 });
    for (let i = 0; i < 5; i++) expect(enhance(s, sword.uid).ok).toBe(true);
    expect(enhance(s, sword.uid).ok).toBe(false);
    expect(sword.plus).toBe(5);
    expect(equipStats(sword).atk).toBe(2.8);
    expect(equipName(sword)).toBe('木刀 +5');
    expect(s.items['玉鋼']).toBe(99 - 15);
    expect(statsOf(s).atk).toBe(15); // 12 + 2.8 → 14.8 → 15
  });
  it('合成：3 件同稀有度 → 1 件高一級；穿著的不能用', () => {
    const s = newGameState('onmyoji'); s.money = 500;
    s.gear.push({ uid: 10, base: 'headband', rarity: 0, affixes: [] }, { uid: 11, base: 'tabi', rarity: 0, affixes: [] }, { uid: 12, base: 'bell', rarity: 0, affixes: [] });
    expect(synthesize(s, [10, 11, 1]).ok).toBe(false); // uid 1 是穿著的紙扇
    const r = synthesize(s, [10, 11, 12]);
    expect(r.ok).toBe(true);
    expect(r.item!.rarity).toBe(1);
    expect(r.item!.affixes).toHaveLength(1);
    expect(s.gear.find((g) => g.uid === 10)).toBeUndefined();
    expect(s.money).toBe(400);
    equip(s, r.item!.uid);
  });
  it('稀有度不同不能合成', () => {
    const s = newGameState(); s.money = 500;
    s.gear.push({ uid: 10, base: 'headband', rarity: 0, affixes: [] }, { uid: 11, base: 'tabi', rarity: 1, affixes: [{ stat: 'hp', value: 5 }] }, { uid: 12, base: 'bell', rarity: 0, affixes: [] });
    expect(synthesize(s, [10, 11, 12]).ok).toBe(false);
  });
});
