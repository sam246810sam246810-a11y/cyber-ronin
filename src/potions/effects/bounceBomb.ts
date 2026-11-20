import type { PotionEffect } from '../types';

/** 彈力炸彈：每次落地小範圍爆炸（彈跳次數由 params.bounces 控制） */
export const bounceBomb: PotionEffect = (ctx, x, y, p, _r, color) => {
  ctx.explode(x, y, p.radius, p.damage, color, { knockback: 20 });
};
