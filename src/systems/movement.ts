// 移動相關的純函式，不依賴 Phaser，方便單元測試。

export interface Vec2 { x: number; y: number }
export type Facing = 'down' | 'left' | 'right' | 'up';

/**
 * 把搖桿的拖曳距離轉成 -1..1 的移動向量。
 * - 超過 radius 的部分會被夾住（長度最大為 1）。
 * - 小於 deadzone（0..1，佔 radius 的比例）視為不動。
 * - 從 deadzone 到 1 會重新映射成 0..1，讓輕推時也能慢慢走。
 */
export function joystickVector(dx: number, dy: number, radius: number, deadzone = 0.15): Vec2 {
  const dist = Math.hypot(dx, dy);
  if (radius <= 0 || dist === 0) return { x: 0, y: 0 };
  const mag = Math.min(dist / radius, 1);
  if (mag < deadzone) return { x: 0, y: 0 };
  const scaled = (mag - deadzone) / (1 - deadzone);
  return { x: (dx / dist) * scaled, y: (dy / dist) * scaled };
}

/** 依移動向量決定面向；沒有移動就維持原本面向。水平和垂直一樣大時優先用水平。 */
export function facingFromVector(v: Vec2, current: Facing): Facing {
  if (v.x === 0 && v.y === 0) return current;
  if (Math.abs(v.x) >= Math.abs(v.y)) return v.x < 0 ? 'left' : 'right';
  return v.y < 0 ? 'up' : 'down';
}

/** 移動向量 × 速度 = 每秒速度（px/s）。 */
export function velocityFrom(v: Vec2, speed: number): Vec2 {
  return { x: v.x * speed, y: v.y * speed };
}
