import type { Line } from './dialogue';

/** World ↔ UI 之間透過 game.events 溝通的事件名稱與資料。 */
export const EV = {
  /** World → UI：顯示對話 */
  dialogue: 'dialogue',
  /** World → UI：更新攻擊鈕文字、金錢、目標（資料可為 null，只刷新數字） */
  hud: 'hud',
  /** World → UI：短訊息 */
  toast: 'toast',
  /** World → UI：顯示區域名稱 */
  area: 'area',
  /** World → UI：大標題（序章完、力盡了） */
  banner: 'banner',
  /** World → UI：打開商店（資料是商店 id） */
  shop: 'shop',
  /** World → UI：在地藏前存檔 */
  save: 'save',
  /** World → UI：打開告示板 */
  board: 'board',
  /** World → UI：打開鍛冶屋 */
  forge: 'forge',
  /** World → UI：結局的片尾名單 */
  credits: 'credits',
} as const;

export interface DialogueRequest { lines: Line[]; choices?: string[]; onDone: (choice?: number) => void }
export interface HudInfo { canInteract: boolean; label: string }
export interface BannerInfo { title: string; sub: string; duration?: number }
export interface SaveRequest { map: string; spawn: string; areaName: string }
export interface CreditsInfo { title: string; sub: string; hint: string }
