import type { PotionEffect } from '../types';

/** 瘟疫毒雲：持續傷害的毒霧 */
export const plagueCloud: PotionEffect = (ctx, x, y, p, _r, color) => {
  ctx.burst(x, y, p.radius * 0.6, color);
  ctx.addZone({
    x, y, radius: p.radius, duration: p.duration, color,
    tickInterval: p.extra.tick ?? 0.5,
    onTick: (inside) => inside.forEach((e) => e.takeDamage(p.damage, { flash: false })),
  });
};
