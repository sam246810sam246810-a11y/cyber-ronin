import { describe, expect, it } from 'vitest';
import { pickVariant, type DialogueVariant } from '../src/systems/dialogue';
import { currentObjective, newGameState, openChest } from '../src/systems/gameState';
import { findInFront } from '../src/systems/interaction';
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
    const stages = [[], ['talked_priest'], ['talked_priest', 'found_well'], ['talked_priest', 'found_well', 'prologue_done']];
    for (const [id, variants] of Object.entries(dialogues)) {
      for (const s of stages) expect(pickVariant(variants as DialogueVariant[], new Set(s)), `${id} @ ${s}`).toBeDefined();
    }
  });
});

describe('openChest', () => {
  it('給獎勵且只能開一次', () => {
    const s = newGameState();
    expect(openChest(s, 'c1', { item: '回復丸', count: 2, money: 120 })).toBe('獲得 回復丸 ×2、120 文');
    expect(s.money).toBe(120);
    expect(s.items['回復丸']).toBe(2);
    expect(openChest(s, 'c1', { money: 999 })).toBeNull();
    expect(s.money).toBe(120);
  });
  it('道具會累加', () => {
    const s = newGameState();
    openChest(s, 'a', { item: '回復丸' }); openChest(s, 'b', { item: '回復丸', count: 2 });
    expect(s.items['回復丸']).toBe(3);
  });
});

describe('currentObjective', () => {
  it('依進度變化', () => {
    expect(currentObjective(new Set())).toContain('宮司爺爺');
    expect(currentObjective(new Set(['talked_priest']))).toContain('古井');
    expect(currentObjective(new Set(['talked_priest', 'found_well']))).toContain('報告');
    expect(currentObjective(new Set(['talked_priest', 'found_well', 'prologue_done']))).toContain('序章完成');
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
