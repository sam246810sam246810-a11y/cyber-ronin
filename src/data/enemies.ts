export type AiType =
  | 'chaser' | 'shooter' | 'dasher' | 'crab' | 'tank' | 'frog'
  | 'kingshroom' | 'beequeen' | 'raccoon' | 'boar';

export interface EnemyDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  r: number;
  hp: number;
  speed: number;
  contact: number;   // 碰撞傷害
  bullet: number;    // 子彈傷害
  ai: AiType;
  flying?: boolean;
  xp: number;
  gold: number;
  rank: 'normal' | 'elite' | 'boss';
}

export const ENEMIES: Record<string, EnemyDef> = {
  mushroom: { id: 'mushroom', name: '蘑菇寶寶', icon: '🍄', color: '#e2574c', r: 20, hp: 260, speed: 70, contact: 55, bullet: 0, ai: 'chaser', xp: 12, gold: 6, rank: 'normal' },
  bee: { id: 'bee', name: '調皮蜜蜂', icon: '🐝', color: '#f5c542', r: 17, hp: 180, speed: 60, contact: 40, bullet: 60, ai: 'shooter', flying: true, xp: 14, gold: 7, rank: 'normal' },
  hedgehog: { id: 'hedgehog', name: '衝衝刺蝟', icon: '🦔', color: '#9a7656', r: 20, hp: 300, speed: 0, contact: 80, bullet: 0, ai: 'dasher', xp: 15, gold: 8, rank: 'normal' },
  snail: { id: 'snail', name: '慢吞蝸牛', icon: '🐌', color: '#b38bd6', r: 24, hp: 650, speed: 38, contact: 70, bullet: 50, ai: 'tank', xp: 20, gold: 10, rank: 'normal' },
  crab: { id: 'crab', name: '橫行螃蟹', icon: '🦀', color: '#ef6f45', r: 21, hp: 340, speed: 90, contact: 60, bullet: 60, ai: 'crab', xp: 16, gold: 8, rank: 'normal' },
  frog: { id: 'frog', name: '跳跳青蛙', icon: '🐸', color: '#5cc46b', r: 20, hp: 320, speed: 0, contact: 60, bullet: 55, ai: 'frog', xp: 16, gold: 8, rank: 'normal' },
  penguin: { id: 'penguin', name: '滑行企鵝', icon: '🐧', color: '#5b7c99', r: 21, hp: 380, speed: 0, contact: 85, bullet: 0, ai: 'dasher', xp: 18, gold: 9, rank: 'normal' },
  owl: { id: 'owl', name: '貓頭鷹法師', icon: '🦉', color: '#a9835b', r: 19, hp: 300, speed: 55, contact: 45, bullet: 70, ai: 'shooter', flying: true, xp: 18, gold: 9, rank: 'normal' },

  kingshroom: { id: 'kingshroom', name: '蘑菇國王', icon: '🍄', color: '#c0392b', r: 40, hp: 2800, speed: 45, contact: 90, bullet: 55, ai: 'kingshroom', xp: 120, gold: 60, rank: 'elite' },
  beequeen: { id: 'beequeen', name: '蜂后女王', icon: '🐝', color: '#f39c12', r: 38, hp: 3200, speed: 70, contact: 80, bullet: 55, ai: 'beequeen', flying: true, xp: 130, gold: 70, rank: 'elite' },
  raccoon: { id: 'raccoon', name: '浣熊大盜', icon: '🦝', color: '#7f8c8d', r: 48, hp: 16000, speed: 0, contact: 110, bullet: 85, ai: 'raccoon', xp: 300, gold: 200, rank: 'boss' },
  boar: { id: 'boar', name: '野豬將軍', icon: '🐗', color: '#8e5a3c', r: 52, hp: 19000, speed: 0, contact: 130, bullet: 90, ai: 'boar', xp: 300, gold: 240, rank: 'boss' },
};
