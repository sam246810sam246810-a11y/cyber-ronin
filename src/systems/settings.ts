// 玩家設定（音量、按鈕透明度）：存在這台裝置的瀏覽器裡，和存檔分開。
export interface Settings { music: number; sfx: number; buttonAlpha: number }
const KEY = 'kitsunebi.settings';
const DEFAULTS: Settings = { music: 0.5, sfx: 0.7, buttonAlpha: 1 };

let cached: Settings | null = null;

export function getSettings(): Settings {
  if (cached) return cached;
  try { cached = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { cached = { ...DEFAULTS }; }
  return cached!;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  cached = { ...getSettings(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(cached)); } catch { /* 無痕模式：只在這次有效 */ }
  return cached;
}
