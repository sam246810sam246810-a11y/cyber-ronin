import type { Enemy } from '../entities/Enemy';
import type { BulletOptions } from '../systems/ProjectileSystem';
import type { PotionParams, RecipeDef } from '../types';

export interface ZoneOptions {
  x: number;
  y: number;
  radius: number;
  duration: number;
  color: number;
  /** 每 tickInterval 秒呼叫一次 */
  tickInterval?: number;
  onTick?: (inside: Enemy[], zone: { x: number; y: number; radius: number }) => void;
  /** 每幀呼叫 */
  onFrame?: (inside: Enemy[], dt: number, zone: { x: number; y: number; radius: number }) => void;
}

export interface ExplodeOptions {
  freeze?: number;
  slow?: { factor: number; time: number };
  poison?: { dps: number; time: number };
  knockback?: number;
  onHit?: (e: Enemy) => void;
}

/** 藥水效果函式可使用的 API */
export interface PotionContext {
  enemiesInRadius(x: number, y: number, r: number): Enemy[];
  nearestEnemy(x: number, y: number, maxRange: number, exclude?: Set<Enemy>): Enemy | undefined;
  explode(x: number, y: number, r: number, damage: number, color: number, opts?: ExplodeOptions): Enemy[];
  addZone(opts: ZoneOptions): void;
  fireBullet(x: number, y: number, angle: number, speed: number, damage: number, opts?: BulletOptions): void;
  delay(seconds: number, fn: () => void): void;
  line(x1: number, y1: number, x2: number, y2: number, color: number): void;
  burst(x: number, y: number, r: number, color: number): void;
}

export type PotionEffect = (ctx: PotionContext, x: number, y: number, p: PotionParams, recipe: RecipeDef, color: number) => void;
