import { describe, expect, it } from 'vitest';
import { enemyPower, newGamePlus, newGameState } from '../src/systems/gameState';
import { ACHIEVEMENTS, grantAchievement, newlyUnlocked } from '../src/systems/achievements';
import { floorPlan, floorRewardRarity, TOWER_FLOORS } from '../src/systems/tower';
import { generateEquip } from '../src/systems/equipment';
import bestiary from '../src/data/bestiary.json';
import enemies from '../src/data/enemies.json';

describe('成就', () => {
  it('一共 21 個、id 不重複', () => {
    expect(ACHIEVEMENTS.length).toBe(21);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(21);
  });
  it('達成後給獎勵，而且只會給一次', () => {
    const s = newGameState(); s.kills.kitsunebi = 1;
    const got = newlyUnlocked(s, { collection: 0 });
    expect(got.map((a) => a.id)).toEqual(['first_kill']);
    expect(grantAchievement(s, got[0])).toContain('初次除妖');
    expect(s.items['回復丸']).toBe(3);
    expect(newlyUnlocked(s, { collection: 0 })).toEqual([]);
  });
});

describe('圖鑑', () => {
  it('除了稻草人，每種妖怪都有圖鑑資料', () => {
    for (const k of Object.keys(enemies)) if (k !== 'dummy') expect(bestiary, k).toHaveProperty(k);
  });
});

describe('百鬼塔', () => {
  it('10 層；5、8、10 層是 Boss；越高越強', () => {
    expect(floorPlan(5).boss).toBe('kappaking');
    expect(floorPlan(8).boss).toBe('daitengu');
    expect(floorPlan(TOWER_FLOORS).boss).toBe('hyakki');
    expect(floorPlan(1).enemies.length).toBe(4);
    expect(floorPlan(9).power).toBeGreaterThan(floorPlan(2).power);
  });
  it('第 10 層的獎勵是傳說', () => {
    expect(floorRewardRarity(10)).toBe(4);
    const e = generateEquip(Math.random, 1, { tier: 4, classId: 'archer', minRarity: 4 });
    expect(e.rarity).toBe(4);
  });
});

describe('二周目', () => {
  it('保留等級、裝備、金錢；劇情與劇情道具重來；敵人變強', () => {
    const s = newGameState('archer'); s.level = 18; s.money = 9999; s.job = 'hunter';
    s.items = { 神器碎片: 5, 大回復丸: 3, 銀鑰匙: 1 }; s.flags.add('game_cleared'); s.flags.add('ach:boss1'); s.openedChests.add('x');
    const n = newGamePlus(s);
    expect(n.level).toBe(18); expect(n.money).toBe(9999); expect(n.job).toBe('hunter');
    expect(n.items).toEqual({ 大回復丸: 3 });
    expect(n.flags.has('game_cleared')).toBe(false); expect(n.flags.has('ach:boss1')).toBe(true);
    expect(n.openedChests.size).toBe(0);
    expect(n.ngPlus).toBe(1); expect(enemyPower(n)).toBe(1.6);
  });
});
