// 存檔碼：把整份存檔變成一串文字，可以複製保存，之後貼回來還原。
import { SaveData, loadSave, writeSave } from './storage';

const PREFIX = 'CR1-';

function checksum(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).padStart(7, '0').slice(-6);
}

function toB64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromB64(b: string): string {
  const bin = atob(b);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function exportCode(): string {
  const body = toB64(JSON.stringify(loadSave()));
  return `${PREFIX}${checksum(body)}-${body}`;
}

/** 還原存檔碼；成功回傳 null，失敗回傳原因 */
export function importCode(code: string): string | null {
  const c = code.replace(/\s+/g, '');
  if (!c.startsWith(PREFIX)) return '這不是賽博浪人的存檔碼';
  const rest = c.slice(PREFIX.length);
  const dash = rest.indexOf('-');
  if (dash < 0) return '存檔碼不完整';
  const sum = rest.slice(0, dash);
  const body = rest.slice(dash + 1);
  if (checksum(body) !== sum) return '存檔碼不完整或被改過，請重新複製一次';
  try {
    const data = JSON.parse(fromB64(body)) as SaveData;
    if (!data || typeof data !== 'object' || !Array.isArray(data.chars)) return '存檔碼內容有誤';
    writeSave({ ...loadSave(), ...data });
    return null;
  } catch {
    return '存檔碼內容有誤';
  }
}

/** 用網頁原生的文字框顯示（手機上才能長按選取、貼上） */
export function openSaveCodeDialog(mode: 'export' | 'import', onDone: (restored: boolean) => void) {
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'position:fixed;inset:0;z-index:50;display:grid;place-items:center;background:rgba(5,4,10,.82);font:15px system-ui,sans-serif;color:#e9f6ff;padding:16px;';
  const box = document.createElement('div');
  box.style.cssText = 'width:min(420px,100%);background:#110d1f;border:2px solid #3df5ff;border-radius:12px;padding:16px;display:grid;gap:10px;';
  const title = document.createElement('div');
  title.style.cssText = 'font-weight:700;font-size:18px;color:#3df5ff;';
  title.textContent = mode === 'export' ? '我的存檔碼' : '貼上存檔碼還原';
  const tip = document.createElement('div');
  tip.style.cssText = 'color:#a8a4c8;font-size:13px;line-height:1.5;';
  tip.textContent =
    mode === 'export'
      ? '把這串文字存到備忘錄或傳給自己。換裝置或存檔不見時，到「設定 → 貼上存檔碼」貼回來就能還原。'
      : '貼上之前複製的存檔碼。還原後會取代目前的進度，請確認是正確的存檔碼。';
  const ta = document.createElement('textarea');
  ta.style.cssText =
    'width:100%;height:140px;box-sizing:border-box;background:#07060d;color:#e9f6ff;border:1px solid #3a3560;border-radius:8px;padding:8px;font:12px ui-monospace,monospace;resize:none;word-break:break-all;-webkit-user-select:text;user-select:text;';
  ta.spellcheck = false;
  if (mode === 'export') {
    ta.value = exportCode();
    ta.readOnly = true;
  } else ta.placeholder = 'CR1-……';
  const msg = document.createElement('div');
  msg.style.cssText = 'min-height:18px;font-size:13px;';
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:10px;';
  const btn = (label: string, color: string) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `flex:1;padding:12px;border-radius:10px;border:2px solid ${color};background:#1a1430;color:#fff;font:600 16px system-ui,sans-serif;`;
    return b;
  };
  const main = btn(mode === 'export' ? '複製' : '還原', '#3df5ff');
  const close = btn('關閉', '#ff3d81');
  const finish = (restored: boolean) => {
    wrap.remove();
    onDone(restored);
  };
  main.onclick = async () => {
    if (mode === 'export') {
      ta.select();
      try {
        await navigator.clipboard.writeText(ta.value);
        msg.style.color = '#5dff7a';
        msg.textContent = '已複製！';
      } catch {
        try {
          document.execCommand('copy');
          msg.style.color = '#5dff7a';
          msg.textContent = '已複製！';
        } catch {
          msg.style.color = '#ffd84d';
          msg.textContent = '無法自動複製，請長按文字框全選後複製';
        }
      }
    } else {
      const err = importCode(ta.value);
      if (err) {
        msg.style.color = '#ff8a5d';
        msg.textContent = err;
      } else finish(true);
    }
  };
  close.onclick = () => finish(false);
  row.append(main, close);
  box.append(title, tip, ta, msg, row);
  wrap.append(box);
  // 擋住點擊穿透到遊戲
  for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup']) wrap.addEventListener(ev, (e) => e.stopPropagation());
  document.body.append(wrap);
  if (mode === 'import') ta.focus();
}
