import type { PotionEffect } from '../types';

/** 黏毒沼澤：毒傷 + 把敵人拉向中心 */
export const stickySwamp: PotionEffect = (ctx, x, y, p, _r, color) => {
  ctx.burst(x, y, p.radius * 0.6, color);
  const pull = p.extra.pull ?? 70;
  ctx.addZone({
    x, y, radius: p.radius, duration: p.duration, color,
    tickInterval: p.extra.tick ?? 0.5,
    onFrame: (inside, dt, z) => inside.forEach((e) => {
      const dx = z.x - e.x;
      const dy = z.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d > 8) e.nudge((dx / d) * pull * dt, (dy / d) * pull * dt);
      e.applySlow(0.3, 0.2);
    }),
    onTick: (inside) => inside.forEach((e) => e.takeDamage(p.damage, { flash: false })),
  });
};
