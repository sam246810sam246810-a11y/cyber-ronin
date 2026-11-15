import type { Facing, Vec2 } from './movement';

export interface Interactable { id: string; x: number; y: number }

const DIR: Record<Facing, Vec2> = { down: { x: 0, y: 1 }, up: { x: 0, y: -1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

/**
 * 找出主角面前可以互動的對象：在面向方向前方 reach px 處取一個探測點，
 * 回傳中心距離探測點最近、且在 radius 以內的對象。
 */
export function findInFront<T extends Interactable>(pos: Vec2, facing: Facing, targets: T[], reach = 12, radius = 14): T | undefined {
  const d = DIR[facing];
  const px = pos.x + d.x * reach, py = pos.y + d.y * reach;
  let best: T | undefined; let bestDist = radius;
  for (const t of targets) {
    const dist = Math.hypot(t.x - px, t.y - py);
    if (dist <= bestDist) { best = t; bestDist = dist; }
  }
  return best;
}
