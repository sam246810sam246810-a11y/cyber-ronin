import type { Enemy } from '../../entities/Enemy';
import type { PotionEffect } from '../types';

/** 冰晶彈珠：在敵人之間彈射並減速 */
export const crystalMarble: PotionEffect = (ctx, x, y, p, _r, color) => {
  ctx.burst(x, y, p.radius, color);
  const chains = Math.round(p.extra.chains ?? 5);
  const range = p.extra.chainRange ?? 240;
  const slow = { factor: p.extra.slow ?? 0.5, time: p.extra.slowTime ?? 1.5 };
  const hit = new Set<Enemy>();
  let cx = x;
  let cy = y;
  const hop = (left: number) => {
    if (left <= 0) return;
    const target = ctx.nearestEnemy(cx, cy, hit.size === 0 ? range + p.radius : range, hit);
    if (!target) return;
    hit.add(target);
    ctx.line(cx, cy, target.x, target.y, color);
    target.applySlow(slow.factor, slow.time);
    target.takeDamage(p.damage);
    ctx.burst(target.x, target.y, 26, color);
    cx = target.x;
    cy = target.y;
    ctx.delay(0.08, () => hop(left - 1));
  };
  hop(chains);
};
