import type { PotionParams } from '../types';

/**
 * 突變卡修飾器。
 * apply() 會在「投擲當下」套用到藥水參數的複本上，所以撿到卡之前煉好的藥水也會吃到效果。
 * 新增卡片：在 data/mutations.json 加一筆，並在這裡註冊同 id 的修飾器。
 */
export interface Modifier {
  apply?(p: PotionParams, stacks: number, recipeKey: string): void;
}

export const MODIFIERS: Record<string, Modifier> = {
  bounce: { apply: (p, s) => { p.bounces += s; } },
  split: { apply: (p, s) => { p.splits += 2 * s; } },
  spread: { apply: (p, s) => { p.radius *= 1 + 0.25 * s; } },
  linger: { apply: (p, s) => { if (p.duration > 0) p.duration += s; } },
  multi: {
    apply: (p, s) => {
      p.count += s;
      p.damage *= Math.pow(0.75, s);
    },
  },
  pierce: { apply: (p, s) => { p.pierce += s; } },
  concentrate: { apply: (p, s) => { p.damage *= 1 + 0.2 * s; } },
  // 雙倍釀造在 CrucibleSystem 煉成時處理
  double_brew: {},
  resonance: {
    apply: (p, s, key) => {
      if (key[0] === key[1] && key[1] === key[2]) p.damage *= 1 + 0.35 * s;
    },
  },
};
