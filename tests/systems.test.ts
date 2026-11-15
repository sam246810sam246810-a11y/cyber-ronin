import { describe, expect, it } from 'vitest';
import { pickVariant, type DialogueVariant } from '../src/systems/dialogue';
import { currentObjective, equip, gainExp, newGameState, openChest, statsOf, unequip } from '../src/systems/gameState';
import { findInFront } from '../src/systems/interaction';
import { collectionReport } from '../src/systems/collection';
import dialogues from '../src/data/dialogues.json';

describe('pickVariant', () => {
  const vs: DialogueVariant[] = [
    { if: ['a'], ifNot: ['b'], lines: [['x', '1']] },
    { ifNot: ['a'], lines: [['x', '2']] },
    { lines: [['x', '3']] },
  ];
  it('依旗標選第一個符合的', () => {
    expect(pickVariant(vs, new Set())?.lines[0][1]).toBe('2');
    expect(pickVariant(vs, new Set(['a']))?.lines[0][1]).toBe('1');
    expect(pickVariant(vs, new Set(['a', 'b']))?.lines[0][1]).toBe('3');
  });
  it('找不到對話時回傳 undefined', () => {
    expect(pickVariant(undefined, new Set())).toBeUndefined();
  });
  it('每段對話資料在任何主線進度都有可用的台詞', () => {
    const stages = [[], ['talked_priest'], ['talked_priest', 'found_well'], ['talked_priest', 'found_well', 'prologue_done'],
      ['talked_priest', 'found_well', 'prologue_done', 'reached_boss_door'], ['talked_priest', 'found_well', 'prologue_done', 'boss_defeated', 'chapter1_done']];
    for (const [id, variants] of Object.entries(dialogues)) {
      for (const s of stages) expect(pickVariant(variants as DialogueVariant[], new Set(s)), `${id} @ ${s}`).toBeDefined();
    }
  });
});

describe('openChest', () => {
  it('給獎勵且只能開一次', () => {
    const s = newGameState();
    expect(openChest(s, 'c1', { item: '回復丸', count: 2, money: 120 })).toEqual({ opened: true, message: '獲得 回復丸 ×2、120 文' });
    expect(s.money).toBe(120);
    expect(s.items['回復丸']).toBe(2);
    expect(openChest(s, 'c1', { money: 999 }).opened).toBe(false);
    expect(s.money).toBe(120);
  });
  it('可以開出裝備', () => {
    const s = newGameState('archer');
    const r = openChest(s, 'g', { gearTier: 2, minRarity: 2 });
    expect(r.opened).toBe(true);
    expect(s.gear).toHaveLength(3);
    expect(s.gear[2].rarity).toBeGreaterThanOrEqual(2);
  });
  it('背包滿了不打開，之後還能再開', () => {
    const s = newGameState(); s.capacity = 0;
    expect(openChest(s, 'c', { item: '回復丸' }).opened).toBe(false);
    s.capacity = 30;
    expect(openChest(s, 'c', { item: '回復丸' }).opened).toBe(true);
  });
});

describe('鑰匙寶箱', () => {
  it('沒有鑰匙打不開，有鑰匙會用掉', () => {
    const s = newGameState();
    expect(openChest(s, 'k', { key: '銅鑰匙', money: 10 })).toEqual({ opened: false, message: '上鎖了。需要「銅鑰匙」' });
    s.items['銅鑰匙'] = 1;
    expect(openChest(s, 'k', { key: '銅鑰匙', money: 10 }).opened).toBe(true);
    expect(s.items['銅鑰匙']).toBeUndefined();
  });
});

describe('收集度', () => {
  it('依寶箱與隱藏地點計算', () => {
    const map = { properties: [{ name: 'displayName', value: '測試' }], layers: [{ name: 'objects', objects: [
      { name: 'c1', type: 'chest' }, { name: 'c2', type: 'chest' }, { name: 'w', type: 'cracked' }, { name: 'n', type: 'npc' }] }] };
    const r = collectionReport({ t: map }, new Set(['c1']), new Set(['secret:w']));
    expect(r.areas[0]).toEqual({ key: 't', name: '測試', chests: [1, 2], secrets: [1, 1] });
    expect(r.percent).toBe(66);
  });
});

describe('裝備與升級（遊戲狀態）', () => {
  it('新遊戲穿著職業初始武器與麻衣', () => {
    const s = newGameState('onmyoji');
    expect(statsOf(s).atk).toBe(9 + 2);
    expect(s.hp).toBe(statsOf(s).maxHp);
  });
  it('換裝備改變能力，不能裝別的職業的武器', () => {
    const s = newGameState('swordsman');
    s.gear.push({ uid: 50, base: 'iron_sword', rarity: 0, affixes: [] }, { uid: 51, base: 'moon_bow', rarity: 0, affixes: [] });
    expect(equip(s, 50)).toBe(true);
    expect(statsOf(s).atk).toBe(16);
    expect(equip(s, 51)).toBe(false);
  });
  it('卸下會讓 HP 不超過新上限', () => {
    const s = newGameState('swordsman');
    s.gear.push({ uid: 9, base: 'magatama', rarity: 0, affixes: [] }); equip(s, 9);
    s.hp = statsOf(s).maxHp; expect(s.hp).toBe(130);
    unequip(s, 'accessory'); expect(s.hp).toBe(120);
  });
  it('升級後 HP 全滿', () => {
    const s = newGameState('swordsman'); s.hp = 10;
    expect(gainExp(s, 25)).toBe(1);
    expect(s.level).toBe(2);
    expect(s.hp).toBe(132);
  });
});

describe('currentObjective', () => {
  it('依進度變化', () => {
    expect(currentObjective(new Set())).toContain('宮司爺爺');
    expect(currentObjective(new Set(['talked_priest']))).toContain('古井');
    expect(currentObjective(new Set(['talked_priest', 'found_well']))).toContain('報告');
    expect(currentObjective(new Set(['talked_priest', 'found_well', 'prologue_done']))).toContain('古井');
    expect(currentObjective(new Set(['talked_priest', 'found_well', 'prologue_done', 'visited:b1', 'visited:b2']))).toContain('B2');
  });
});

describe('findInFront', () => {
  const targets = [{ id: 'npc', x: 100, y: 84 }, { id: 'chest', x: 116, y: 100 }];
  it('找到面向方向的對象', () => {
    expect(findInFront({ x: 100, y: 100 }, 'up', targets)?.id).toBe('npc');
    expect(findInFront({ x: 100, y: 100 }, 'right', targets)?.id).toBe('chest');
  });
  it('背對或太遠時找不到', () => {
    expect(findInFront({ x: 100, y: 100 }, 'down', targets)).toBeUndefined();
    expect(findInFront({ x: 100, y: 160 }, 'up', targets)).toBeUndefined();
  });
});
