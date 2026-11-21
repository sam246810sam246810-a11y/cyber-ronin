import { ARENA, ARENA_BOTTOM, ARENA_RIGHT, WAVE } from '../config';
import { ENEMIES, REGIONS } from '../data';
import type { Enemy } from '../entities/Enemy';
import { FlowerBoss } from '../entities/bosses/FlowerBoss';
import { MagmaSnail } from '../entities/bosses/MagmaSnail';
import { ThunderKing } from '../entities/bosses/ThunderKing';
import { Beetle } from '../entities/enemies/Beetle';
import { Bomber } from '../entities/enemies/Bomber';
import { Crawler } from '../entities/enemies/Crawler';
import { Hopper } from '../entities/enemies/Hopper';
import { Spitter } from '../entities/enemies/Spitter';
import { Splitter } from '../entities/enemies/Splitter';
import { Wisp } from '../entities/enemies/Wisp';
import type { GameScene } from '../scenes/GameScene';
import type { MinionType, RegionDef } from '../types';
import { dist, rand, shuffle } from '../utils';
import { Sound } from './SoundSystem';

export type WavePhase = 'intermission' | 'combat' | 'cards' | 'boss' | 'victory' | 'defeat';

interface QueuedSpawn {
  at: number;
  type: MinionType;
  elite: boolean;
}

/**
 * 區域 → 波次 → Boss 的流程：
 * [區域 1] intermission → combat → cards → … → boss → cards（保底稀有）→ [區域 2] …
 * 最後一區的 Boss 被打倒就勝利。
 */
export class WaveSystem {
  phase: WavePhase = 'intermission';
  regionIndex = 0;
  /** 區域內的波數，1-based；超過該區波數代表 Boss 戰 */
  wave = 1;
  phaseTime = 0;
  private queue: QueuedSpawn[] = [];
  private pendingSpawns = 0;
  boss?: Enemy;
  private bossDone = false;

  constructor(private game: GameScene) {}

  get region(): RegionDef {
    return REGIONS[this.regionIndex];
  }

  get hpMul(): number {
    return this.region.hpMul;
  }

  get isBossWave(): boolean {
    return this.wave > this.region.waves.length;
  }

  /** 全程第幾波（跨區域累計，Boss 算在該區最後一波之後） */
  get globalWave(): number {
    return REGIONS.slice(0, this.regionIndex).reduce((s, r) => s + r.waves.length, 0) + Math.min(this.wave, this.region.waves.length);
  }

  get label(): string {
    return this.isBossWave ? `${this.region.name}・BOSS` : `${this.region.name} ${this.wave}/${this.region.waves.length}`;
  }

  start(): void {
    this.game.onRegionEnter(this.region, this.regionIndex);
    this.enterIntermission();
  }

  private enterIntermission(): void {
    this.phase = 'intermission';
    this.phaseTime = 0;
    if (this.isBossWave) {
      this.game.showBanner(`${ENEMIES[this.region.boss].name} 來襲！`);
      Sound.play('boss');
    } else if (this.wave === 1) {
      this.game.showBanner(`第 ${this.regionIndex + 1} 區　${this.region.name}`);
    } else {
      this.game.showBanner(`第 ${this.wave} 波`);
    }
  }

  private startCombat(): void {
    this.phaseTime = 0;
    if (this.isBossWave) {
      this.phase = 'boss';
      this.bossDone = false;
      const def = ENEMIES[this.region.boss];
      const x = (ARENA.x + ARENA_RIGHT) / 2;
      const y = ARENA.y + 200;
      this.game.telegraphs.add({
        duration: 1.2,
        color: 0xb06bff,
        shape: { kind: 'circle', x, y, r: def.radius * 1.4 },
        onDone: () => {
          const B = this.region.boss === 'boss_snail' ? MagmaSnail : this.region.boss === 'boss_king' ? ThunderKing : FlowerBoss;
          this.boss = new B(this.game, def, x, y);
          this.game.addEnemy(this.boss);
        },
      });
      return;
    }
    this.phase = 'combat';
    const def = this.region.waves[this.wave - 1];
    const list: QueuedSpawn[] = [];
    for (const g of def.groups) for (let i = 0; i < g.count; i++) list.push({ at: 0, type: g.type, elite: !!g.elite });
    shuffle(list);
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
          this.game.onWaveCleared(this.globalWave, this.wave);
        }
        break;
      }
      case 'boss':
        if (this.boss && !this.boss.alive) {
          this.boss = undefined;
          this.bossDone = true;
          // 清掉 Boss 召喚的小怪
          this.killAll();
          if (this.regionIndex >= REGIONS.length - 1) {
            this.phase = 'victory';
            this.game.onVictory();
          } else {
            this.phase = 'cards';
            this.game.onBossCleared(this.region);
          }
        }
        break;
      default:
        break;
    }
  }

  /** 突變卡選完後呼叫 */
  next(): void {
    if (this.bossDone) {
      this.bossDone = false;
      this.regionIndex++;
      this.wave = 1;
      this.game.onRegionEnter(this.region, this.regionIndex);
    } else {
      this.wave++;
    }
    this.enterIntermission();
  }

  spawnEnemy(type: MinionType, x?: number, y?: number, elite = false, portal = 0.6): void {
    const def = ENEMIES[type];
    const r = def.radius * (elite ? 1.3 : 1);
    if (x === undefined || y === undefined) {
      const pos = type === 'spitter' || type === 'wisp' ? this.randomInnerPoint(320) : this.randomEdgePoint(260);
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
        if (this.phase === 'victory' || this.phase === 'defeat' || this.phase === 'cards') return;
        this.game.addEnemy(this.create(type, sx, sy, elite));
      },
    });
  }

  private create(type: MinionType, x: number, y: number, elite: boolean): Enemy {
    const def = ENEMIES[type];
    switch (type) {
      case 'crawler': return new Crawler(this.game, def, x, y, elite, 'triangle');
      case 'spitter': return new Spitter(this.game, def, x, y, elite, 'flower');
      case 'hopper': return new Hopper(this.game, def, x, y, elite, 'mushroom');
      case 'bomber': return new Bomber(this.game, def, x, y, elite, 'bomb');
      case 'beetle': return new Beetle(this.game, def, x, y, elite, 'beetle');
      case 'splitter': return new Splitter(this.game, def, x, y, elite, 'slime');
      case 'wisp': return new Wisp(this.game, def, x, y, elite, 'wisp');
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

  /** 清掉場上所有敵人（分裂史萊姆會再生出小隻，所以重複幾次） */
  killAll(): void {
    for (let i = 0; i < 5 && this.game.enemies.some((e) => e.alive); i++) {
      [...this.game.enemies].forEach((e) => e.takeDamage(99999, { flash: false }));
    }
  }

  debugSkip(): void {
    this.queue = [];
    this.killAll();
  }

  debugToBoss(): void {
    this.queue = [];
    this.killAll();
    this.wave = this.region.waves.length + 1;
    this.enterIntermission();
  }

  /** debug：跳到下一區 */
  debugNextRegion(): void {
    if (this.regionIndex >= REGIONS.length - 1) return;
    this.queue = [];
    this.killAll();
    this.bossDone = true;
    this.next();
  }
}
