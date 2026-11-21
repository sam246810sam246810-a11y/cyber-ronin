/**
 * 手工房間場景（黑帝斯式：一張畫好的完整房間＝一間房，門畫在圖上）。
 * 所有座標都是「圖片比例」(0..1)，左上為原點；圖片在遊戲裡縮放到 SCENE_SIZE。
 * 四個出口固定在：上中、左中、右中、下中，所以任何一張圖都能接上任何方向的門；
 * 沒用到的出口會被木箱堵住。可左右翻轉當成另一間。
 */
export type NRect = [x0: number, y0: number, x1: number, y1: number];

export interface SceneDef {
  key: string;
  /** 可走的地板範圍 */
  floor: NRect;
  /** 出口：走廊範圍（含門外延伸） */
  exits: { n: NRect; s: NRect; w: NRect; e: NRect };
  /** 擋路物：shots=false 代表不擋子彈（水池、溪流） */
  blocks: { r: NRect; shots: boolean }[];
  /** 草叢：可以躲 */
  grass: NRect[];
  /** 適合放哪些房型（boss 房需要中央空曠） */
  tags: ('start' | 'combat' | 'boss' | 'calm')[];
}

/** 場景在遊戲裡的大小（比螢幕大一點，鏡頭會跟著走） */
export const SCENE_SIZE = { w: 2100, h: 900 };

const EXITS = {
  n: [0.45, 0.02, 0.55, 0.33] as NRect,
  s: [0.44, 0.8, 0.56, 1.0] as NRect,
  w: [0.0, 0.37, 0.09, 0.52] as NRect,
  e: [0.91, 0.37, 1.0, 0.52] as NRect,
};

export const SCENES: SceneDef[] = [
  {
    // 煉金庭院：左上工作桌、右上木箱、左下荷花池、右下草叢
    key: 'scene_gh_1',
    floor: [0.07, 0.31, 0.93, 0.83],
    exits: EXITS,
    blocks: [
      { r: [0.1, 0.27, 0.25, 0.37], shots: true },
      { r: [0.28, 0.27, 0.37, 0.33], shots: true },
      { r: [0.76, 0.27, 0.89, 0.36], shots: true },
      { r: [0.03, 0.62, 0.29, 0.86], shots: false },
      { r: [0.9, 0.72, 0.97, 0.84], shots: true },
    ],
    grass: [[0.72, 0.62, 0.92, 0.83]],
    tags: ['start', 'combat', 'calm'],
  },
  {
    // 石柱大廳：四根石柱、四角花圃、下方兩個小池
    key: 'scene_gh_2',
    floor: [0.07, 0.29, 0.93, 0.83],
    exits: EXITS,
    blocks: [
      { r: [0.19, 0.24, 0.29, 0.3], shots: true },
      { r: [0.295, 0.39, 0.375, 0.48], shots: true },
      { r: [0.625, 0.39, 0.705, 0.48], shots: true },
      { r: [0.295, 0.66, 0.375, 0.76], shots: true },
      { r: [0.625, 0.66, 0.705, 0.76], shots: true },
      { r: [0.08, 0.22, 0.17, 0.37], shots: true },
      { r: [0.84, 0.22, 0.93, 0.37], shots: true },
      { r: [0.03, 0.58, 0.15, 0.84], shots: true },
      { r: [0.86, 0.58, 0.97, 0.84], shots: true },
      { r: [0.21, 0.81, 0.39, 0.9], shots: false },
      { r: [0.6, 0.81, 0.79, 0.9], shots: false },
    ],
    grass: [],
    tags: ['combat', 'boss'],
  },
  {
    // 荒廢花園：兩道花圃樹籬、右上溪流小橋、左下高草叢
    key: 'scene_gh_3',
    floor: [0.07, 0.26, 0.93, 0.83],
    exits: EXITS,
    blocks: [
      { r: [0.09, 0.2, 0.19, 0.28], shots: true },
      { r: [0.16, 0.33, 0.3, 0.47], shots: true },
      { r: [0.27, 0.26, 0.41, 0.4], shots: true },
      { r: [0.58, 0.36, 0.76, 0.5], shots: false },
      { r: [0.79, 0.12, 0.9, 0.31], shots: true },
      { r: [0.61, 0.61, 0.76, 0.79], shots: true },
      { r: [0.73, 0.52, 0.89, 0.7], shots: true },
    ],
    grass: [[0.08, 0.53, 0.37, 0.82]],
    tags: ['combat', 'calm'],
  },
  {
    // 藥水儲藏室：左上蒸餾器、右上酒桶、左下長工作台、右下草藥袋
    key: 'scene_gh_4',
    floor: [0.07, 0.3, 0.93, 0.83],
    exits: EXITS,
    blocks: [
      { r: [0.09, 0.27, 0.26, 0.38], shots: true },
      { r: [0.76, 0.27, 0.92, 0.38], shots: true },
      { r: [0.06, 0.66, 0.33, 0.81], shots: true },
      { r: [0.73, 0.66, 0.94, 0.8], shots: true },
    ],
    grass: [],
    tags: ['combat', 'calm'],
  },
  {
    // 噴泉廣場：中央大噴泉（水池不擋子彈、貓雕像擋）、四角圓花圃
    key: 'scene_gh_5',
    floor: [0.07, 0.3, 0.93, 0.83],
    exits: EXITS,
    blocks: [
      { r: [0.33, 0.44, 0.66, 0.72], shots: false },
      { r: [0.4, 0.37, 0.6, 0.47], shots: true },
      { r: [0.11, 0.27, 0.21, 0.36], shots: true },
      { r: [0.78, 0.27, 0.88, 0.36], shots: true },
      { r: [0.06, 0.62, 0.18, 0.83], shots: true },
      { r: [0.82, 0.62, 0.94, 0.83], shots: true },
    ],
    grass: [],
    tags: ['start', 'combat', 'calm'],
  },
  {
    // 巨菇林：三朵巨型發光菇、右下倒木
    key: 'scene_gh_6',
    floor: [0.07, 0.27, 0.93, 0.84],
    exits: EXITS,
    blocks: [
      { r: [0.16, 0.27, 0.3, 0.39], shots: true },
      { r: [0.67, 0.3, 0.84, 0.43], shots: true },
      { r: [0.11, 0.63, 0.35, 0.82], shots: true },
      { r: [0.66, 0.58, 0.88, 0.77], shots: true },
      { r: [0.9, 0.63, 0.96, 0.75], shots: true },
    ],
    grass: [],
    tags: ['combat'],
  },
  {
    // 倒塌溫室：四根石柱、左上碎玻璃堆、右上倒下的花架、右下倒塌的窗框
    key: 'scene_gh_7',
    floor: [0.07, 0.29, 0.93, 0.83],
    exits: EXITS,
    blocks: [
      { r: [0.1, 0.27, 0.26, 0.4], shots: true },
      { r: [0.73, 0.25, 0.87, 0.34], shots: true },
      { r: [0.295, 0.39, 0.375, 0.48], shots: true },
      { r: [0.625, 0.39, 0.705, 0.48], shots: true },
      { r: [0.295, 0.66, 0.375, 0.76], shots: true },
      { r: [0.625, 0.66, 0.705, 0.76], shots: true },
      { r: [0.74, 0.53, 0.9, 0.75], shots: true },
      { r: [0.03, 0.58, 0.15, 0.84], shots: true },
      { r: [0.86, 0.6, 0.97, 0.84], shots: true },
      { r: [0.21, 0.81, 0.39, 0.9], shots: false },
      { r: [0.6, 0.81, 0.79, 0.9], shots: false },
    ],
    grass: [],
    tags: ['combat'],
  },
  {
    // 時鐘天文台：左上書桌與行星儀、右上望遠鏡平台、中央時鐘地磚（可走）、下方兩組齒輪機械
    key: 'scene_gh_8',
    floor: [0.07, 0.3, 0.93, 0.83],
    exits: EXITS,
    blocks: [
      { r: [0.1, 0.3, 0.22, 0.4], shots: true },
      { r: [0.23, 0.28, 0.34, 0.37], shots: true },
      { r: [0.67, 0.28, 0.9, 0.44], shots: true },
      { r: [0.04, 0.62, 0.29, 0.84], shots: true },
      { r: [0.72, 0.62, 0.96, 0.84], shots: true },
    ],
    grass: [],
    tags: ['combat', 'boss', 'calm'],
  },
  {
    // 睡蓮水道：左半邊縱向水道（兩座小橋可過）、右上菜園、右下稻草人圍欄
    key: 'scene_gh_9',
    floor: [0.07, 0.26, 0.93, 0.83],
    exits: EXITS,
    blocks: [
      { r: [0.17, 0.2, 0.38, 0.3], shots: false },
      { r: [0.17, 0.36, 0.37, 0.58], shots: false },
      { r: [0.17, 0.68, 0.33, 0.84], shots: false },
      { r: [0.64, 0.25, 0.89, 0.43], shots: true },
      { r: [0.63, 0.55, 0.9, 0.79], shots: true },
    ],
    grass: [],
    tags: ['combat', 'calm'],
  },
  {
    // 貓神神社：左上神社、兩排石燈籠走道、四角櫻花、下方兩個小池
    key: 'scene_gh_10',
    floor: [0.07, 0.29, 0.93, 0.83],
    exits: EXITS,
    blocks: [
      { r: [0.24, 0.25, 0.38, 0.3], shots: true },
      { r: [0.07, 0.27, 0.17, 0.36], shots: true },
      { r: [0.83, 0.27, 0.93, 0.37], shots: true },
      { r: [0.04, 0.6, 0.15, 0.84], shots: true },
      { r: [0.85, 0.6, 0.96, 0.84], shots: true },
      { r: [0.315, 0.32, 0.365, 0.38], shots: true },
      { r: [0.295, 0.44, 0.345, 0.5], shots: true },
      { r: [0.28, 0.56, 0.33, 0.62], shots: true },
      { r: [0.28, 0.69, 0.33, 0.76], shots: true },
      { r: [0.64, 0.32, 0.685, 0.38], shots: true },
      { r: [0.655, 0.44, 0.705, 0.5], shots: true },
      { r: [0.67, 0.56, 0.72, 0.62], shots: true },
      { r: [0.675, 0.69, 0.725, 0.76], shots: true },
      { r: [0.21, 0.81, 0.39, 0.9], shots: false },
      { r: [0.6, 0.81, 0.79, 0.9], shots: false },
    ],
    grass: [],
    tags: ['start', 'combat', 'calm'],
  },
];
