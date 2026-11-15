import { describe, expect, it } from 'vitest';
import { applyItem, applyStatus, atkModifier, calcDamage, chooseQuickItem, nextComboStep, scaleEnemy, tickStatuses, type Statuses, type Vitals } from '../src/systems/combat';

const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };

describe('calcDamage', () => {
  it('依公式計算（亂數 0.5 → 倍率 1.0，不爆擊）', () => {
    expect(calcDamage(12, 1, 2, seq(0.5, 0.9))).toEqual({ amount: 11, crit: false });
  });
  it('防禦很高時至少 1', () => {
    expect(calcDamage(1, 1, 100, seq(0, 0.9)).amount).toBe(1);
  });
  it('爆擊 ×1.5', () => {
    expect(calcDamage(10, 2, 0, seq(0.5, 0.01))).toEqual({ amount: 30, crit: true });
  });
  it('亂數範圍 0.9~1.1', () => {
    expect(calcDamage(100, 1, 0, seq(0, 0.9)).amount).toBe(90);
    expect(calcDamage(100, 1, 0, seq(1, 0.9)).amount).toBe(110);
  });
});

describe('scaleEnemy', () => {
  const base = { hp: 30, atk: 8, exp: 7 };
  it('困難：HP ×1.4、攻擊 ×1.3', () => expect(scaleEnemy(base, 'hard')).toEqual({ hp: 42, atk: 10, exp: 7 }));
  it('簡單：經驗 ×1.2', () => expect(scaleEnemy(base, 'easy')).toEqual({ hp: 21, atk: 5, exp: 8 }));
  it('攻擊 0 的稻草人維持 0', () => expect(scaleEnemy({ hp: 1, atk: 0, exp: 0 }, 'hard').atk).toBe(0));
});

describe('狀態異常', () => {
  it('燒傷每秒 3 傷害、攻擊 −20%，時間到解除', () => {
    const s: Statuses = {}; applyStatus(s, 'burn');
    expect(atkModifier(s)).toBe(0.8);
    expect(tickStatuses(s, 1, 100)).toBeCloseTo(3);
    expect(tickStatuses(s, 10, 100)).toBeCloseTo(12); // 只剩 4 秒
    expect(s.burn).toBeUndefined();
    expect(atkModifier(s)).toBe(1);
  });
  it('中毒每秒扣最大 HP 的 2%', () => {
    const s: Statuses = {}; applyStatus(s, 'poison');
    expect(tickStatuses(s, 2, 200)).toBeCloseTo(8);
  });
  it('重複中同一狀態只會刷新時間，不會疊加', () => {
    const s: Statuses = {}; applyStatus(s, 'burn'); tickStatuses(s, 3, 100); applyStatus(s, 'burn');
    expect(s.burn).toBe(5);
  });
});

describe('快捷道具', () => {
  const v = (hp: number, mp: number, statuses: Statuses = {}): Vitals => ({ hp, maxHp: 100, mp, maxMp: 50, statuses });
  it('有異常先解', () => expect(chooseQuickItem({ 回復丸: 1, 解毒草: 1 }, v(30, 50, { burn: 2 }))).toBe('解毒草'));
  it('HP 低先補血', () => expect(chooseQuickItem({ 回復丸: 1, 靈水: 1 }, v(30, 10))).toBe('回復丸'));
  it('HP 夠、MP 低補 MP', () => expect(chooseQuickItem({ 回復丸: 1, 靈水: 1 }, v(90, 10))).toBe('靈水'));
  it('全滿不用', () => expect(chooseQuickItem({ 回復丸: 1 }, v(100, 50))).toBeNull());
  it('沒有道具回傳 null', () => expect(chooseQuickItem({}, v(10, 0))).toBeNull());
  it('套用效果不超過上限', () => {
    const x = v(80, 40, { poison: 3 });
    expect(applyItem('回復丸', x)).toBe('回復丸：HP +20');
    expect(x.hp).toBe(100);
    applyItem('解毒草', x); expect(x.statuses.poison).toBeUndefined();
  });
});

describe('nextComboStep', () => {
  it('連續按：0 → 1 → 2 → 0', () => {
    expect(nextComboStep(-1, 0)).toBe(0);
    expect(nextComboStep(0, 0.3)).toBe(1);
    expect(nextComboStep(1, 0.3)).toBe(2);
    expect(nextComboStep(2, 0.3)).toBe(0);
  });
  it('間隔太久重來', () => expect(nextComboStep(1, 0.8)).toBe(0));
});
