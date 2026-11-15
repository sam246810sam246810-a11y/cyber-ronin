import type { Vec2 } from './movement';

/**
 * UI 場景（虛擬搖桿）寫入、World 場景讀取的共享輸入狀態。
 * 之後的按鈕（攻擊、技能、閃避、調查）也會放在這裡。
 */
export const inputState: { move: Vec2 } = {
  move: { x: 0, y: 0 },
};

export function resetInput(): void {
  inputState.move = { x: 0, y: 0 };
}
