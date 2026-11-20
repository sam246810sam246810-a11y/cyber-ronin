import type { PotionEffect } from './types';
import { bounceBomb } from './effects/bounceBomb';
import { frostNova } from './effects/frostNova';
import { plagueCloud } from './effects/plagueCloud';
import { glueTrap } from './effects/glueTrap';
import { burstPod } from './effects/burstPod';
import { crystalMarble } from './effects/crystalMarble';
import { rotFrost } from './effects/rotFrost';
import { stickySwamp } from './effects/stickySwamp';
import { needleRain } from './effects/needleRain';
import { elementalBloom } from './effects/elementalBloom';

/** 藥水 id（recipes.json 的 id）→ 效果函式 */
export const POTION_EFFECTS: Record<string, PotionEffect> = {
  bounce_bomb: bounceBomb,
  frost_nova: frostNova,
  plague_cloud: plagueCloud,
  glue_trap: glueTrap,
  burst_pod: burstPod,
  crystal_marble: crystalMarble,
  rot_frost: rotFrost,
  sticky_swamp: stickySwamp,
  needle_rain: needleRain,
  elemental_bloom: elementalBloom,
};
