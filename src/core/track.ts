// 本地埋點：存最近 500 筆，之後可替換成真正的分析 SDK
export interface TrackEvent { t: number; e: string; p?: Record<string, unknown> }
const KEY = 'pawstrike_events';
let buf: TrackEvent[] = [];
try { buf = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { buf = []; }

export function track(e: string, p?: Record<string, unknown>) {
  buf.push({ t: Date.now(), e, p });
  if (buf.length > 500) buf.splice(0, buf.length - 500);
  try { localStorage.setItem(KEY, JSON.stringify(buf)); } catch { /* 無法存 */ }
  if (import.meta.env.DEV) console.debug('[track]', e, p ?? '');
}

export const getEvents = () => buf.slice();
export function clearEvents() { buf = []; try { localStorage.removeItem(KEY); } catch { /* */ } }
