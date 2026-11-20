import type { PotionEffect } from '../types';

/** 霜凍新星：大範圍冰凍 */
export const frostNova: PotionEffect = (ctx, x, y, p, _r, color) => {
  ctx.explode(x, y, p.radius, p.damage, color, { freeze: p.duration });
};
