import type { Vec2 } from './movement';

export type Action = 'attackDown' | 'attackUp' | 'skill0' | 'skill1' | 'dodge' | 'item';

/** UI 場景寫入、World 場景讀取的共享輸入狀態。 */
export const inputState: { move: Vec2; locked: boolean; actions: Action[]; holdAfterWarp: boolean } = {
  move: { x: 0, y: 0 },
  /** 對話或換場時鎖住移動與動作 */
  locked: false,
  /** 這一幀按下的按鈕（World 讀完就清空） */
  actions: [],
  /** 換地圖後，要等手指離開搖桿才能再移動（避免一直走回出口） */
  holdAfterWarp: false,
};

export function resetInput(): void {
  inputState.move = { x: 0, y: 0 };
  inputState.locked = false;
  inputState.actions = [];
  inputState.holdAfterWarp = true;
}
