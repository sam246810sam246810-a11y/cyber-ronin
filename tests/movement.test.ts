import { describe, expect, it } from 'vitest';
import { facingFromVector, joystickVector, velocityFrom } from '../src/systems/movement';

describe('joystickVector', () => {
  it('在死區內回傳零向量', () => {
    expect(joystickVector(3, 0, 36)).toEqual({ x: 0, y: 0 });
    expect(joystickVector(0, 0, 36)).toEqual({ x: 0, y: 0 });
  });
  it('拉到底時長度為 1', () => {
    const v = joystickVector(36, 0, 36);
    expect(v.x).toBeCloseTo(1); expect(v.y).toBeCloseTo(0);
  });
  it('超過半徑會被夾住，長度不超過 1', () => {
    const v = joystickVector(100, 100, 36);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(Math.SQRT1_2);
  });
  it('死區外重新映射成 0..1', () => {
    const v = joystickVector(0, -36 * 0.575, 36, 0.15); // 0.575 → (0.575-0.15)/0.85 = 0.5
    expect(v.y).toBeCloseTo(-0.5);
  });
  it('radius 為 0 時不會除以零', () => {
    expect(joystickVector(5, 5, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('facingFromVector', () => {
  it('沒有移動時維持原本面向', () => {
    expect(facingFromVector({ x: 0, y: 0 }, 'up')).toBe('up');
  });
  it('依主要方向決定面向', () => {
    expect(facingFromVector({ x: -0.9, y: 0.2 }, 'down')).toBe('left');
    expect(facingFromVector({ x: 0.9, y: 0.2 }, 'down')).toBe('right');
    expect(facingFromVector({ x: 0.1, y: -0.8 }, 'down')).toBe('up');
    expect(facingFromVector({ x: 0.1, y: 0.8 }, 'up')).toBe('down');
  });
  it('斜向等量時優先水平', () => {
    expect(facingFromVector({ x: 0.5, y: 0.5 }, 'up')).toBe('right');
  });
});

describe('velocityFrom', () => {
  it('向量乘上速度', () => {
    expect(velocityFrom({ x: 0.5, y: -1 }, 100)).toEqual({ x: 50, y: -100 });
  });
});
