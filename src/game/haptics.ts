// 手機震動回饋；設定可關閉，不支援的裝置直接略過。
import { loadSave, writeSave } from './storage';

let enabled: boolean | null = null;

export function vibrateEnabled(): boolean {
  if (enabled === null) enabled = loadSave().vibrate !== false;
  return enabled;
}

export function setVibrate(on: boolean) {
  enabled = on;
  const s = loadSave();
  s.vibrate = on;
  writeSave(s);
}

export function vibrate(ms: number) {
  if (!vibrateEnabled()) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* 忽略 */
  }
}
