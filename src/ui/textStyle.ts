import Phaser from 'phaser';

/**
 * 文字風格 A：金色漸層＋深棕描邊＋陰影（標題、房間名、名牌、傷害數字共用）。
 * 漸層是依文字目前高度建立的，之後 setText 換字高度不變就不用重設。
 */
const PALETTES = {
  gold: ['#fff8d6', '#ffd56b', '#e09a2a', '#a8611a'],
  silver: ['#ffffff', '#e8eef8', '#b9c6dc', '#8090b0'],
  crit: ['#fff3c0', '#ffb347', '#ff6a2a', '#c0301a'],
  purple: ['#fbe8ff', '#e0b0ff', '#b46bf0', '#7a3ab8'],
  red: ['#ffe0e0', '#ff8a8a', '#e0404a', '#9a1a2a'],
  fire: ['#fffbe0', '#ffe066', '#ffa030', '#e0501a'],
  ice: ['#ffffff', '#d8f6ff', '#7fd8ff', '#2a8ae0'],
  poison: ['#f4ffe0', '#c8ff8a', '#6ae04a', '#2a8a2a'],
  jelly: ['#fff0f8', '#ffb0dc', '#ff6ab4', '#c02a7a'],
  shock: ['#ffffff', '#fff6a0', '#ffe14d', '#c0a020'],
} as const;
export type TextPalette = keyof typeof PALETTES;

export function goldify(t: Phaser.GameObjects.Text, palette: TextPalette = 'gold', outline?: number): Phaser.GameObjects.Text {
  const size = parseInt(String(t.style.fontSize), 10) || 24;
  const stops = PALETTES[palette];
  const h = Math.max(t.height, size);
  const g = t.context.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, stops[0]);
  g.addColorStop(0.35, stops[1]);
  g.addColorStop(0.7, stops[2]);
  g.addColorStop(1, stops[3]);
  t.setFill(g);
  t.setStroke('#2a1608', outline ?? Math.max(4, Math.round(size * 0.16)));
  t.setShadow(0, Math.max(2, Math.round(size * 0.07)), 'rgba(0,0,0,0.65)', Math.max(2, Math.round(size * 0.1)), true, true);
  t.setFontStyle('bold');
  return t;
}

/** 依 #rrggbb 顏色挑最接近的漸層（稀有度、事件色） */
export function paletteFor(color: string): TextPalette {
  const n = parseInt(color.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (r > 200 && g < 140 && b < 140) return 'red';
  if (b > 180 && r > 150 && g < 170) return 'purple';
  if (r > 200 && g > 160) return 'gold';
  return 'silver';
}
