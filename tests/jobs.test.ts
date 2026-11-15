import { describe, expect, it } from 'vitest';
import { canChangeJob, changeJob, className, learnedSkills, newGameState, setSkillSlot, statsOf } from '../src/systems/gameState';
import skills from '../src/data/skills.json';
import jobs from '../src/data/jobs.json';
import classes from '../src/data/classes.json';

describe('技能與轉職', () => {
  it('Lv6、Lv9 學會新技能', () => {
    const s = newGameState('archer');
    expect(learnedSkills(s)).toEqual(['triple', 'bind']);
    s.level = 6; expect(learnedSkills(s)).toEqual(['triple', 'bind', 'backstep']);
    s.level = 9; expect(learnedSkills(s)).toEqual(['triple', 'bind', 'backstep', 'arrow_rain']);
  });
  it('換技能鈕：沒學會的不能裝，裝到另一格的會交換', () => {
    const s = newGameState('swordsman');
    expect(setSkillSlot(s, 0, 'iai')).toBe(false);
    s.level = 9;
    expect(setSkillSlot(s, 0, 'iai')).toBe(true);
    expect(s.skillSlots).toEqual(['iai', 'thrust']);
    setSkillSlot(s, 1, 'iai');
    expect(s.skillSlots).toEqual(['thrust', 'iai']);
  });
  it('轉職：Lv10 且第一章結束；屬性 +10%，學會 2 個新技能', () => {
    const s = newGameState('onmyoji'); s.level = 10;
    expect(canChangeJob(s)).toBe(false);
    s.flags.add('chapter1_done');
    const before = statsOf(s);
    expect(changeJob(s, 'kensei')).toBe(false); // 不是陰陽師的轉職
    expect(changeJob(s, 'shikigami')).toBe(true);
    expect(statsOf(s).maxHp).toBe(Math.round(before.maxHp * 1.1));
    expect(s.skillSlots).toEqual(['twin', 'guardian']);
    expect(learnedSkills(s)).toContain('guardian');
    expect(className(s)).toBe('式神使');
    expect(changeJob(s, 'daionmyoji')).toBe(false); // 只能轉一次
  });
  it('所有職業與轉職的技能都有資料', () => {
    const all = [...Object.values(classes).flatMap((c) => [...c.skills, ...Object.keys(c.later)]), ...Object.values(jobs).flatMap((j) => j.skills)];
    for (const id of all) expect(skills, id).toHaveProperty(id);
  });
});
