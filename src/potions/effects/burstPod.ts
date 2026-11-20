import type { PotionEffect } from '../types';

/** 爆裂菌囊：爆炸後向外彈出小毒囊 */
export const burstPod: PotionEffect = (ctx, x, y, p, _r, color) => {
  ctx.explode(x, y, p.radius, p.damage, color);
  const pods = Math.round(p.extra.pods ?? 4);
  const podR = (p.extra.podRadius ?? 45) * (p.radius / 70);
  const podDmg = p.extra.podDamage ?? 1.5;
  const offset = Math.random() * Math.PI;
  for (let i = 0; i < pods; i++) {
    const a = offset + (Math.PI * 2 * i) / pods;
    const d = p.radius + 30;
    const px = x + Math.cos(a) * d;
    const py = y + Math.sin(a) * d;
    ctx.line(x, y, px, py, color);
    ctx.delay(0.18, () => ctx.explode(px, py, podR, podDmg, 0x7eff8a, { poison: { dps: 1, time: 2 } }));
  }
};
