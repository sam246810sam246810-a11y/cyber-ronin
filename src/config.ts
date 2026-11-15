/** 內部解析度（PRD 12）：480×270，整數倍放大。 */
export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 270;
export const TILE_SIZE = 16;

/**
 * 畫布實際以 3 倍大小渲染，所有攝影機放大 3 倍。
 * 遊戲邏輯仍用 480×270 座標，但文字（setResolution(RENDER_SCALE)）能有足夠像素，中文小字才清楚。
 */
export const RENDER_SCALE = 3;

/** 速度屬性 100 = 每秒 100px（PRD 5.2）。M1 先用固定值。 */
export const BASE_SPEED = 100;

export const FONT_FAMILY = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif';

export const SCENES = {
  boot: 'Boot',
  title: 'Title',
  world: 'World',
  ui: 'UI',
} as const;
