// 美術素材清單：每張圖的檔名、尺寸與 Higgsfield 提示詞。
// 把生成好的 PNG（透明背景）放到 src/assets/<file>，遊戲會自動改用該圖；缺圖時使用幾何佔位。
// docs/ASSETS.md 由 `npm run assets:doc` 依此檔產生。

export interface AssetSpec {
  key: string;
  file: string;
  size: string;
  group: string;
  fallback: string; // 佔位 emoji
  prompt: string;
}

export const STYLE = 'cute chibi mobile game art, soft cel shading, thick clean dark-brown outline, bright pastel colors, top-down 3/4 view, centered, single character, transparent background, no text';

const ch = (key: string, fallback: string, desc: string, size = '256x256'): AssetSpec =>
  ({ key, file: `${key}.png`, size, group: '角色與怪物', fallback, prompt: `${desc}, ${STYLE}` });
const icon = (key: string, fallback: string, desc: string, group: string): AssetSpec =>
  ({ key, file: `${key}.png`, size: '256x256', group, fallback, prompt: `${desc}, game item icon, cute casual mobile game style, glossy, thick outline, centered, transparent background, no text` });

export const ASSETS: AssetSpec[] = [
  ch('hero', '🐶', 'a brave little shiba inu puppy hero wearing a tiny red scarf and holding a star-shaped slingshot, determined happy face'),
  ch('enemy_mushroom', '🍄', 'a grumpy red mushroom creature with tiny legs, angry eyebrows'),
  ch('enemy_bee', '🐝', 'a mischievous chubby bee with a small stinger, flying, cheeky grin'),
  ch('enemy_hedgehog', '🦔', 'an angry round hedgehog curled ready to roll, spiky'),
  ch('enemy_snail', '🐌', 'a big sleepy snail with a purple swirl shell, slow and tanky'),
  ch('enemy_crab', '🦀', 'a small orange crab raising its claws, sideways stance, angry'),
  ch('enemy_frog', '🐸', 'a green frog crouching to jump, puffed cheeks'),
  ch('enemy_penguin', '🐧', 'a chubby penguin sliding on its belly, mischievous'),
  ch('enemy_owl', '🦉', 'a little owl wizard with a tiny wizard hat, casting magic'),
  ch('enemy_kingshroom', '🍄', 'a large mushroom king with a golden crown and a royal cape, elite mini-boss', '384x384'),
  ch('enemy_beequeen', '🐝', 'a bee queen with a tiara and royal wings, elite mini-boss', '384x384'),
  ch('enemy_raccoon', '🦝', 'a raccoon bandit boss with an eye mask, big loot sack and bandana, menacing but cute', '512x512'),
  ch('enemy_boar', '🐗', 'a wild boar general boss with armor plates and big tusks, menacing but cute', '512x512'),

  { key: 'tile_ch1', file: 'tile_ch1.png', size: '512x512', group: '場景', fallback: '🟩', prompt: 'seamless tileable top-down grass meadow ground texture with tiny flowers, cute casual mobile game style, soft pastel, no objects, no text' },
  { key: 'tile_ch2', file: 'tile_ch2.png', size: '512x512', group: '場景', fallback: '🟨', prompt: 'seamless tileable top-down sandy beach ground texture with small shells, cute casual mobile game style, soft pastel, no text' },
  { key: 'tile_ch3', file: 'tile_ch3.png', size: '512x512', group: '場景', fallback: '⬜', prompt: 'seamless tileable top-down soft snow ground texture with sparkles, cute casual mobile game style, pastel blue, no text' },
  { key: 'obstacle_ch1', file: 'obstacle_ch1.png', size: '256x256', group: '場景', fallback: '🪨', prompt: 'a round green bush block obstacle, top-down 3/4 view, cute mobile game style, thick outline, transparent background' },
  { key: 'obstacle_ch2', file: 'obstacle_ch2.png', size: '256x256', group: '場景', fallback: '🪨', prompt: 'a sandstone rock with a starfish, top-down 3/4 view, cute mobile game style, thick outline, transparent background' },
  { key: 'obstacle_ch3', file: 'obstacle_ch3.png', size: '256x256', group: '場景', fallback: '🪨', prompt: 'an ice block with snow on top, top-down 3/4 view, cute mobile game style, thick outline, transparent background' },

  icon('fx_bullet', '⭐', 'a small glowing yellow star projectile', '特效'),
  icon('fx_coin', '🪙', 'a shiny gold coin with a paw print', '特效'),
  icon('chest_wood', '📦', 'a wooden treasure chest with a paw-print lock', '商店'),
  icon('chest_gold', '🎁', 'a golden treasure chest glowing with sparkles and gems', '商店'),
  icon('gem', '💎', 'a pink-blue gem diamond currency icon', '商店'),
  icon('gold', '🪙', 'a pile of gold coins currency icon', '商店'),
  { key: 'logo', file: 'logo.png', size: '1024x512', group: 'UI', fallback: '🐾', prompt: 'game logo for a cute animal shooter game, a shiba inu with a slingshot and a big paw print, bold bubbly letters reading "PAW STRIKE", mobile game title art, transparent background' },

  ...[
    ['slingshot', '🌰', 'an acorn slingshot weapon'],
    ['wand', '🪄', 'a magic wand topped with a little golden bell'],
    ['leafvest', '🍃', 'a small vest armor made of green leaves'],
    ['shell', '🐚', 'a seashell armor chestplate'],
    ['clover', '🍀', 'a ring with a four-leaf clover gem'],
    ['moon', '🌙', 'a silver ring with a crescent moon gem'],
    ['bell', '🔔', 'a pet collar with a golden bell'],
    ['star', '⭐', 'a pet collar with a glowing star charm'],
  ].map(([k, f, d]) => icon(`equip_${k}`, f, d, '裝備')),
];

export const ASSET_MAP: Record<string, AssetSpec> = Object.fromEntries(ASSETS.map((a) => [a.key, a]));
