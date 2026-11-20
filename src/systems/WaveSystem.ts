import { ARENA, ARENA_BOTTOM, ARENA_RIGHT, WAVE } from '../config';
import { ENEMIES, WAVES } from '../data';
import type { Enemy } from '../entities/Enemy';
import { Boss } from '../entities/enemies/Boss';
import { Crawler } from '../entities/enemies/Crawler';
import { Hopper } from '../entities/enemies/Hopper';
import { Spitter } from '../entities/enemies/Spitter';
import type { GameScene } from '../scenes/GameScene';
import type { EnemyType } from '../types';
import { dist, rand, shuffle } from '../utils';

export type WavePhase = 'intermission' | 'combat' | 'cards' | 'boss' | 'victory' | 'defeat';

interface QueuedSpawn {
  at: number;
  type: Exclude<EnemyType, 'boss'>;
  elite: boolean;
}

/**
 * 波次流程：
 * intermission(2s) → combat → [清完] cards → intermission → … → 第 10 波清完 → cards → intermission → boss → victory
 */
export class WaveSystem {
  phase: WavePhase = 'intermission';
  /** 1-based；11 代表 Boss 戰 */
  wave = 1;
  phaseTime = 0;
  private queue: QueuedSpawn[] = [];
  private pendingSpawns = 0;
  boss?: Boss;

  constructor(private game: GameScene) {}

  get isBossWave(): boolean {
    return this.wave > WAVE.total;
  }

  get label(): string {
    return this.isBossWave ? 'BOSS' : `第 ${this.wave}/${WAVE.total} 波`;
  }

  start(): void {
    this.enterIntermission();
  }

  private enterIntermission(): void {
    this.phase = 'intermission';
    this.phaseTime = 0;
    this.game.showBanner(this.isBossWave ? '食人巨花 來襲！' : `第 ${this.wave} 波`);
  }

  private startCombat(): void {
    this.phaseTime = 0;
    if (this.isBossWave) {
      this.phase = 'boss';
      const def = ENEMIES.boss;
      const x = (ARENA.x + ARENA_RIGHT) / 2;
      const y = ARENA.y + 200;
      this.game.telegraphs.add({
        duration: 1.2,
        color: 0xb06bff,
        shape: { kind: 'circle', x, y, r: def.radius * 1.4 },
        onDone: () => {
          this.boss = new Boss(this.game, def, x, y);
          this.game.addEnemy(this.boss);
        },
      });
      return;
    }
    this.phase = 'combat';
    const def = WAVES[this.wave - 1];
    const list: QueuedSpawn[] = [];
    for (const g of def.groups) {
      for (let i = 0; i < g.count; i++) list.push({ at: 0, type: g.type, elite: !!g.elite });
    }
    shuffle(list);
    // 第一隻馬上出，其餘平均分佈在 spawnWindow 內
    list.forEach((s, i) => {
      s.at = (def.spawnWindow * i) / Math.max(1, list.length) + rand(-0.3, 0.3);
    });
    list.sort((a, b) => a.at - b.at);
    this.queue = list;
  }

  update(dt: number): void {
    this.phaseTime += dt;
    switch (this.phase) {
      case 'intermission':
        if (this.phaseTime >= WAVE.intermission) this.startCombat();
        break;
      case 'combat': {
        const flush = this.phaseTime >= WAVE.maxDuration;
        while (this.queue.length && (flush || this.queue[0].at <= this.phaseTime)) {
          const s = this.queue.shift()!;
          this.spawnEnemy(s.type, undefined, undefined, s.elite);
        }
        if (!this.queue.length && this.pendingSpawns === 0 && this.game.enemies.length === 0) {
          this.phase = 'cards';
          this.game.onWaveCleared(this.wave);
        }
        break;
      }
      case 'boss':
        if (this.boss && !this.boss.alive) {
          this.phase = 'victory';
          this.game.onVictory();
        }
        break;
      default:
        break;
    }
  }

  /** 突變卡選完後呼叫 */
  next(): void {
    this.wave++;
    this.enterIntermission();
  }

  /** 生成敵人（先出現紫色傳送預警） */
  spawnEnemy(type: Exclude<EnemyType, 'boss'>, x?: number, y?: number, elite = false, portal = 0.6): void {
    const def = ENEMIES[type];
    const r = def.radius * (elite ? 1.3 : 1);
    if (x === undefined || y === undefined) {
      const pos = type === 'spitter' ? this.randomInnerPoint(320) : this.randomEdgePoint(260);
      x = pos.x;
      y = pos.y;
    }
    x = Math.max(ARENA.x + r, Math.min(ARENA_RIGHT - r, x));
    y = Math.max(ARENA.y + r, Math.min(ARENA_BOTTOM - r, y));
    this.pendingSpawns++;
    const sx = x;
    const sy = y;
    this.game.telegraphs.add({
      duration: portal,
      color: 0xb06bff,
      shape: { kind: 'circle', x: sx, y: sy, r: r + 6 },
      onDone: () => {
        this.pendingSpawns--;
        if (this.phase === 'victory' || this.phase === 'defeat') return;
        this.game.addEnemy(this.create(type, sx, sy, elite));
      },
    });
  }

  private create(type: Exclude<EnemyType, 'boss'>, x: number, y: number, elite: boolean): Enemy {
    const def = ENEMIES[type];
    switch (type) {
      case 'crawler': return new Crawler(this.game, def, x, y, elite, 'triangle');
      case 'spitter': return new Spitter(this.game, def, x, y, elite, 'flower');
      case 'hopper': return new Hopper(this.game, def, x, y, elite, 'mushroom');
    }
  }

  private randomEdgePoint(minDist: number): { x: number; y: number } {
    const p = this.game.player;
    let best = { x: ARENA.x + 30, y: ARENA.y + 30 };
    for (let i = 0; i < 12; i++) {
      const side = Math.floor(Math.random() * 4);
      const m = 30;
      const pt = side === 0 ? { x: rand(ARENA.x + m, ARENA_RIGHT - m), y: ARENA.y + m }
        : side === 1 ? { x: ARENA_RIGHT - m, y: rand(ARENA.y + m, ARENA_BOTTOM - m) }
          : side === 2 ? { x: rand(ARENA.x + m, ARENA_RIGHT - m), y: ARENA_BOTTOM - m }
            : { x: ARENA.x + m, y: rand(ARENA.y + m, ARENA_BOTTOM - m) };
      best = pt;
      if (dist(pt.x, pt.y, p.x, p.y) >= minDist) break;
    }
    return best;
  }

  private randomInnerPoint(minDist: number): { x: number; y: number } {
    const p = this.game.player;
    let pt = { x: 0, y: 0 };
    for (let i = 0; i < 12; i++) {
      pt = { x: rand(ARENA.x + 60, ARENA_RIGHT - 60), y: rand(ARENA.y + 60, ARENA_BOTTOM - 60) };
      if (dist(pt.x, pt.y, p.x, p.y) >= minDist) break;
    }
    return pt;
  }

  /** debug：清除剩餘敵人並結束本波 */
  debugSkip(): void {
    this.queue = [];
    this.game.enemies.forEach((e) => e.takeDamage(99999));
  }

  /** debug：直接跳到 Boss 前 */
  debugToBoss(): void {
    this.queue = [];
    this.game.enemies.forEach((e) => e.takeDamage(99999));
    this.wave = WAVE.total + 1;
    this.enterIntermission();
  }
}
