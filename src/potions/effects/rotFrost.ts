import type { PotionEffect } from '../types';

/** 腐霜：冰凍，解凍瞬間引爆毒傷（由 Enemy.onThaw 處理） */
export const rotFrost: PotionEffect = (ctx, x, y, p, _r, color) => {
  ctx.explode(x, y, p.radius, 0, color, {
    freeze: p.duration,
    onHit: (e) => { e.thawDamage = Math.max(e.thawDamage, p.damage); },
  });
};
