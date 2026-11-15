import { describe, expect, it } from 'vitest';
import { deserialize, formatPlayTime, serialize } from '../src/systems/save';
import { equip, newGameState, statsOf } from '../src/systems/gameState';

describe('存檔', () => {
  it('存了再讀回來內容一樣', () => {
    const s = newGameState('archer', 'hard');
    s.level = 4; s.exp = 33; s.money = 512; s.items = { 回復丸: 3, 銅鑰匙: 1 }; s.bond = 2; s.playTime = 1234;
    s.flags.add('talked_priest'); s.flags.add('gate:b1'); s.openedChests.add('home_chest');
    s.gear.push({ uid: 7, base: 'half_bow', rarity: 2, affixes: [{ stat: 'crit', value: 3 }, { stat: 'hp', value: 9 }] });
    equip(s, 7);
    const file = JSON.parse(JSON.stringify(serialize(s, 'b2', 'up', '古井地城 B2', 1000)));
    const r = deserialize(file)!;
    expect(r.map).toBe('b2'); expect(r.spawn).toBe('up');
    expect(r.state.flags.has('gate:b1')).toBe(true);
    expect(r.state.openedChests.has('home_chest')).toBe(true);
    expect(r.state.equipped.weapon).toBe(7);
    expect(statsOf(r.state)).toEqual(statsOf(s));
    expect({ ...r.state, flags: 0, openedChests: 0 }).toEqual({ ...s, flags: 0, openedChests: 0 });
  });
  it('存檔不會跟遊戲中的狀態共用物件', () => {
    const s = newGameState();
    const f = serialize(s, 'village', 'start', '狐火村');
    s.items['回復丸'] = 5; s.gear[0].affixes.push({ stat: 'hp', value: 1 });
    expect(f.state.items['回復丸']).toBeUndefined();
    expect(f.state.gear[0].affixes).toHaveLength(0);
  });
  it('壞掉或太新的存檔回傳 null', () => {
    expect(deserialize(null)).toBeNull();
    expect(deserialize({ v: 99, map: 'x', state: {} })).toBeNull();
    expect(deserialize({ v: 1, map: 'x', state: { classId: 'ninja' } })).toBeNull();
  });
  it('舊存檔缺少的欄位用預設值補上', () => {
    const r = deserialize({ v: 1, map: 'village', spawn: 'start', state: { classId: 'onmyoji', level: 3 } })!;
    expect(r.state.level).toBe(3);
    expect(r.state.bond).toBe(0);
    expect(r.state.flags.size).toBe(0);
    expect(r.state.hp).toBe(statsOf(r.state).maxHp);
  });
  it('遊玩時間顯示', () => {
    expect(formatPlayTime(59)).toBe('0 分');
    expect(formatPlayTime(3725)).toBe('1 小時 2 分');
  });
});
