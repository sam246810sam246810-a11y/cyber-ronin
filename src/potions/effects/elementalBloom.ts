import type { PotionEffect } from '../types';

/** 元素綻放：巨大爆炸，冰凍 + 擊退 + 中毒 */
export const elementalBloom: PotionEffect = (ctx, x, y, p, _r, color) => {
  ctx.burst(x, y, p.radius * 0.5, 0xff7eb6);
  ctx.delay(0.06, () => ctx.burst(x, y, p.radius * 0.8, 0x7ed4ff));
  ctx.explode(x, y, p.radius, p.damage, color, {
    freeze: p.duration,
    knockback: p.extra.knockback ?? 90,
    poison: { dps: p.extra.poisonDps ?? 1, time: p.extra.poisonTime ?? 3 },
  });
};
