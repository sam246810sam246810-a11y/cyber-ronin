// 直式 9:16 起跳；邏輯寬度固定 540，高度依螢幕比例延伸（避免手機上下黑邊）。
const vw = Math.max(1, window.innerWidth);
const vh = Math.max(1, window.innerHeight);
const aspect = Math.min(2.25, Math.max(16 / 9, vh / vw));

export const W = 540;
export const H = Math.round(W * aspect);
/** 畫布實際解析度倍率（高解析度螢幕用 2 倍） */
export const Z = (window.devicePixelRatio || 1) >= 1.5 ? 2 : 1;

export const FONT = '"Cubic 11","PingFang TC","Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif';

/** 像素字型以 11px 為一格；尺寸對齊到半格（畫布 2 倍時剛好是整數像素），字才會銳利 */
export function snapFont(size: number): number {
  const unit = 11 / Z;
  return Math.max(11, Math.round(size / unit) * unit);
}

export const COLORS = {
  bg: 0x07060d,
  grid: 0x1a1430,
  cyan: 0x3df5ff,
  magenta: 0xff3d81,
  violet: 0x8a5cff,
  gold: 0xffc83d,
  panel: 0x110d1f,
  text: '#e9f6ff',
  dim: '#8a86a8',
};

export function textStyle(size: number, color = COLORS.text, _bold = true): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontSize: `${snapFont(size)}px`,
    color,
    resolution: Z,
  };
}
