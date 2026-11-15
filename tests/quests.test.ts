import { describe, expect, it } from 'vitest';
import { newGameState } from '../src/systems/gameState';
import { accept, dailyBounties, isReady, offersFrom, onKill, onPickup, pickupVisible, progressOf, readyFor, turnIn } from '../src/systems/quests';

const withFlags = (...f: string[]) => { const s = newGameState(); f.forEach((x) => s.flags.add(x)); return s; };

describe('任務', () => {
  it('劇情沒到不會出現', () => {
    expect(offersFrom(newGameState(), 'taro')).toEqual([]);
    expect(offersFrom(withFlags('talked_priest'), 'taro')).toEqual(['taro_beetles']);
    expect(offersFrom(withFlags('talked_priest'), 'tesshin')).toEqual([]);
  });
  it('討伐：接了之後打倒才算，到數量後可以交付', () => {
    const s = withFlags('talked_priest');
    expect(onKill(s, 'kitsunebi')).toEqual([]);
    accept(s, 'hunt_kitsunebi');
    for (let i = 0; i < 3; i++) onKill(s, 'kitsunebi');
    expect(isReady(s, 'hunt_kitsunebi')).toBe(false);
    expect(onKill(s, 'kitsunebi')).toEqual(['討伐：狐火：完成！回去交付吧']);
    expect(onKill(s, 'kitsunebi')).toEqual([]); // 不會超過
    expect(readyFor(s, 'board')).toEqual(['hunt_kitsunebi']);
    expect(turnIn(s, 'hunt_kitsunebi')).toBe('完成「討伐：狐火」！獲得 60 文、靈水 ×2');
    expect(s.quests.hunt_kitsunebi.status).toBe('done');
    expect(offersFrom(s, 'board')).not.toContain('hunt_kitsunebi');
  });
  it('收集：看背包數量，交付時收走', () => {
    const s = withFlags('talked_priest');
    accept(s, 'collect_fur');
    s.items['野狐的毛'] = 2;
    expect(progressOf(s, 'collect_fur')).toBe(2);
    expect(turnIn(s, 'collect_fur')).toBeNull();
    s.items['野狐的毛'] = 4;
    expect(turnIn(s, 'collect_fur')).toContain('背包 +10 格');
    expect(s.items['野狐的毛']).toBe(1);
    expect(s.capacity).toBe(40);
  });
  it('撿取：任務進行中才出現，撿過就不再出現', () => {
    const s = withFlags('talked_priest');
    expect(pickupVisible(s, 'beetle', 'b1')).toBe(false);
    accept(s, 'taro_beetles');
    expect(pickupVisible(s, 'beetle', 'b1')).toBe(true);
    s.flags.add('pickup:b1'); onPickup(s, 'beetle');
    expect(pickupVisible(s, 'beetle', 'b1')).toBe(false);
    expect(progressOf(s, 'taro_beetles')).toBe(1);
  });
  it('獎勵可以是裝備與旗標', () => {
    const s = withFlags('prologue_done');
    accept(s, 'tesshin_steel'); s.items['玉鋼'] = 3;
    const gear = s.gear.length;
    turnIn(s, 'tesshin_steel');
    expect(s.gear.length).toBe(gear + 1);
    expect(s.flags.has('forge_unlocked')).toBe(true);
    expect(s.items['玉鋼']).toBeUndefined();
  });
  it('每日懸賞：同一天固定 3 個，只出現已解鎖的怪物', () => {
    const early = dailyBounties('2026-11-15', new Set(['talked_priest']));
    expect(Object.keys(early)).toHaveLength(3);
    expect(Object.values(early).every((q) => !['bonespider', 'chochin'].includes(q.target.kill!))).toBe(true);
    expect(dailyBounties('2026-11-15', new Set(['talked_priest']))).toEqual(early);
    const s = withFlags('talked_priest');
    const id = Object.keys(early)[0];
    accept(s, id);
    for (let i = 0; i < 5; i++) onKill(s, early[id].target.kill!);
    expect(turnIn(s, id)).toContain('完成');
  });
});
