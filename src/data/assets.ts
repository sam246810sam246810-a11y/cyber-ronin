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
  ch('hero', '🐶', 'a brave little shiba inu puppy caravan leader wearing a tiny red scarf and a small golden crown, holding a star wand, determined happy face'),
  ch('partner_cat', '🐱', 'a cute orange tabby kitten holding a small fireball, playful'),
  ch('partner_rabbit', '🐰', 'a cute white bunny holding a carrot crossbow, energetic'),
  ch('partner_bear', '🐻', 'a big fluffy brown bear cub with a wooden shield, gentle and sturdy'),
  ch('partner_fox', '🦊', 'a cute red fox with a lightning-shaped tail tip, sparks around it, clever'),
  ch('partner_penguin', '🐧', 'a cute penguin chick wearing a knitted scarf holding a snowball'),
  ch('partner_hamster', '🐹', 'a cute hamster nurse with a tiny red-cross cap holding a heart-shaped sunflower seed'),
  ch('partner_turtle', '🐢', 'a cute green sea turtle holding its shell like a boomerang, sturdy'),
  ch('partner_octopus', '🐙', 'a cute purple baby octopus squirting ink, mischievous'),
  ch('partner_parrot', '🦜', 'a cute colorful parrot shooting glowing feathers, epic rarity look'),
  ch('partner_panda', '🐼', 'a cute kung fu panda cub in a martial arts pose with a headband, epic rarity look'),
  ch('partner_dolphin', '🐬', 'a cute legendary dolphin riding a big sparkling wave, golden glow accents'),
  ch('partner_unicorn', '🦄', 'a cute legendary unicorn foal shooting a rainbow beam from its horn, golden glow accents'),
  ch('partner_dragon', '🐉', 'a cute mythic baby red dragon breathing a small flame, red and gold aura'),
  ch('enemy_mushroom', '🍄', 'a grumpy red mushroom creature with tiny legs, angry eyebrows'),
  ch('enemy_bee', '🐝', 'a mischievous chubby bee with a small stinger, flying, cheeky grin'),
  ch('enemy_hedgehog', '🦔', 'an angry round hedgehog curled ready to roll, spiky'),
  ch('enemy_snail', '🐌', 'a big sleepy snail with a purple swirl shell, slow and tanky'),
  ch('enemy_crab', '🦀', 'a small orange crab raising its claws, sideways stance, angry'),
  ch('enemy_frog', '🐸', 'a green frog crouching to jump, puffed cheeks'),
  ch('enemy_seal', '🦭', 'a chubby grey seal sliding on its belly, mischievous'),
  ch('enemy_owl', '🦉', 'a little owl wizard with a tiny wizard hat, casting magic'),
  ch('enemy_kingshroom', '🍄', 'a large mushroom king with a golden crown and a royal cape, elite mini-boss', '384x384'),
  ch('enemy_beequeen', '🐝', 'a bee queen with a tiara and royal wings, elite mini-boss', '384x384'),
  ch('enemy_raccoon', '🦝', 'a raccoon bandit boss with an eye mask, big loot sack and bandana, menacing but cute', '512x512'),
  ch('enemy_boar', '🐗', 'a wild boar general boss with armor plates and big tusks, menacing but cute', '512x512'),

  ...(['hero', 'partner_cat', 'partner_rabbit', 'partner_bear', 'partner_fox', 'partner_penguin', 'partner_hamster', 'partner_turtle', 'partner_octopus', 'partner_parrot', 'partner_panda', 'partner_dolphin', 'partner_unicorn', 'partner_dragon'] as const).map((k): AssetSpec => ({
    key: `${k}_awaken`, file: `${k}_awaken.png`, size: '256x256', group: '夥伴覺醒外觀', fallback: '✨',
    prompt: `AWAKENED version of the same character as ${k}.png (use it as reference image): same character, now wearing a glowing ornate accessory (crown, cape or armor matching its element), sparkling aura, more heroic pose, ${STYLE}`,
  })),
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
  icon('egg', '🥚', 'a cute speckled partner egg with a paw-print pattern, glowing slightly', '商店'),
  icon('gem', '💎', 'a pink-blue gem diamond currency icon', '商店'),
  icon('gold', '🪙', 'a pile of gold coins currency icon', '商店'),
  { key: 'logo', file: 'logo.png', size: '1024x512', group: 'UI', fallback: '🐾', prompt: 'game logo for a cute animal shooter game, a shiba inu with a slingshot and a big paw print, bold bubbly letters reading "PAW STRIKE", mobile game title art, transparent background' },

  ...[
    ['training', '🏟️', 'a cute training ground building with wooden dummies and a flag'],
    ['clinic', '🏥', 'a cute small animal clinic cottage with a heart sign'],
    ['hall', '🏡', 'a cute recruitment hall house with a big paw-print sign'],
    ['granary', '🌾', 'a cute barn granary with sacks of gold coins'],
    ['tower', '🗼', 'a cute wooden watchtower with a telescope on top'],
  ].map(([k, f, d]) => icon(`bld_${k}`, f, `${d}, isometric village building`, '村莊建築')),
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
