import type { Vec2 } from './movement';

/** UI 場景寫入、World 場景讀取的共享輸入狀態。 */
export const inputState: { move: Vec2; locked: boolean } = {
  move: { x: 0, y: 0 },
  /** 對話或換場時鎖住移動 */
  locked: false,
};

export function resetInput(): void {
  inputState.move = { x: 0, y: 0 };
  inputState.locked = false;
}
