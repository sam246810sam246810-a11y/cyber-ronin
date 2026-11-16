// 角色換色皮膚：用程式染色，不另外生圖。好感度 Lv2 解鎖。
import type { CharId } from '../config/balance';
import type { SaveData } from './storage';
import { affinityLevel } from './affinity';

export interface SkinDef {
  name: string;
  /** 0 = 原色 */
  tint: number;
}

export const SKINS: SkinDef[] = [
  { name: '原色', tint: 0 },
  { name: '暗夜', tint: 0x9a8cff },
  { name: '霓虹', tint: 0xff9ad8 },
  { name: '翡翠', tint: 0x9dffc8 },
  { name: '黃金', tint: 0xffe08a },
];

/** 第 i 套皮膚的解鎖條件：好感度到 i+1 級 */
export function skinUnlocked(s: SaveData, c: CharId, i: number): boolean {
  return i === 0 || affinityLevel(s, c) >= i + 1;
}

export function skinTint(s: SaveData, c: CharId): number {
  const i = s.skins?.[c] ?? 0;
  return skinUnlocked(s, c, i) ? SKINS[i]?.tint ?? 0 : 0;
}

/** 套用皮膚染色到圖片上 */
export function applySkin(img: { setTint: (t: number) => unknown; clearTint: () => unknown }, s: SaveData, c: CharId) {
  const t = skinTint(s, c);
  if (t) img.setTint(t);
  else img.clearTint();
}
