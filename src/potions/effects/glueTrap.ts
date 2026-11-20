import type { PotionEffect } from '../types';

/** 冰膠陷阱：黏液區大幅減速 */
export const glueTrap: PotionEffect = (ctx, x, y, p, _r, color) => {
  ctx.burst(x, y, p.radius * 0.6, color);
  const slow = p.extra.slow ?? 0.6;
  ctx.addZone({
    x, y, radius: p.radius, duration: p.duration, color,
    tickInterval: p.extra.tick ?? 0.5,
    onFrame: (inside) => inside.forEach((e) => e.applySlow(slow, 0.3)),
    onTick: (inside) => {
      if (p.damage > 0) inside.forEach((e) => e.takeDamage(p.damage, { flash: false }));
    },
  });
};
