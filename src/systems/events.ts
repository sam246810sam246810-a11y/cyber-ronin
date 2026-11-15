import type { Line } from './dialogue';

/** World ↔ UI 之間透過 game.events 溝通的事件名稱與資料。 */
export const EV = {
  /** UI → World：按下調查鈕 */
  interact: 'interact',
  /** World → UI：顯示對話 */
  dialogue: 'dialogue',
  /** World → UI：更新金錢、目標、調查鈕狀態 */
  hud: 'hud',
  /** World → UI：短訊息 */
  toast: 'toast',
  /** World → UI：顯示區域名稱 */
  area: 'area',
  /** World → UI：大標題（例如序章完） */
  banner: 'banner',
} as const;

export interface DialogueRequest { lines: Line[]; onDone: () => void }
export interface HudInfo { canInteract: boolean; label: string }
