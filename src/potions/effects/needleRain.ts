import type { PotionEffect } from '../types';

/** 冰毒針雨：向外射出冰毒針 */
export const needleRain: PotionEffect = (ctx, x, y, p, _r, color) => {
  ctx.burst(x, y, p.radius, color);
  const n = Math.round(p.extra.needles ?? 12);
  const offset = Math.random() * Math.PI;
  for (let i = 0; i < n; i++) {
    const a = offset + (Math.PI * 2 * i) / n;
    ctx.fireBullet(x, y, a, 520, p.damage, {
      radius: 6,
      color,
      texture: 'thorn',
      poison: { dps: p.extra.poisonDps ?? 1, time: p.extra.poisonTime ?? 2 },
      slow: { factor: 0.3, time: 1 },
    });
  }
};
