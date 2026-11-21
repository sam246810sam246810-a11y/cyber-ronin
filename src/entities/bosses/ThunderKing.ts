import { Enemy } from '../Enemy';
import { ARENA, ARENA_BOTTOM, ARENA_RIGHT } from '../../config';
import { TelegraphSystem } from '../../systems/TelegraphSystem';
import { Sound } from '../../systems/SoundSystem';
import { clamp, rand } from '../../utils';
import type { EnemyDef } from '../../types';
import type { GameScene } from '../../scenes/GameScene';

type Attack = 'storm' | 'cross' | 'summon' | 'storm2';

/** 雷鳴菇王：落雷 / 十字雷射 / 召喚史萊姆與雷靈 */
export class ThunderKing extends Enemy {
  private attackTimer = 2;
  private busy = false;
  private cycle: Attack[] = ['storm', 'cross', 'summon', 'storm2', 'cross'];
  private idx = 0;
  private crossDiagonal = false;

  constructor(game: GameScene, def: EnemyDef, x: number, y: number) {
    super(game, def, x, y, false, 'doctor_rat');
    this.freezeResist = 0.4;
    this.knockbackResist = 0;
  }

  get enraged(): boolean {
    return this.hp < this.maxHp * 0.5;
  }

  protected act(dt: number): void {
    if (!this.busy) {
      const tx = (ARENA.x + ARENA_RIGHT) / 2 + Math.cos(this.game.time.now / 1800) * 200;
      const ty = ARENA.y + 280 + Math.sin(this.game.time.now / 1300) * 120;
      this.moveToward(tx, ty, dt);
    }
    this.sprite.setRotation(Math.sin(this.game.time.now / 300) * 0.1);
    if (this.busy) return;
    this.attackTimer -= dt;
    if (this.attackTimer <= 0) this.attack();
  }

  private strike(x: number, y: number, r: number, tele: number, onFinish?: () => void): void {
    this.game.telegraphs.add({
      owner: this, duration: tele, color: 0xffe14d, shape: { kind: 'circle', x, y, r },
      onDone: (shape) => {
        onFinish?.();
        if (!this.alive) return;
        this.game.fx.line(x, ARENA.y, x, y, 0xffffff, 6);
        this.game.fx.burst(x, y, r, 0xffe14d);
        Sound.play('zap');
        const pl = this.game.player;
        if (TelegraphSystem.hits(shape, pl.x, pl.y, pl.radius)) this.game.hurtPlayer(1);
      },
    });
  }

  private attack(): void {
    this.playAttack();
    const a = this.cycle[this.idx++ % this.cycle.length];
    const tele = Number(this.def.telegraph ?? 0.9) * (this.enraged ? 0.85 : 1);
    this.attackTimer = (Number(this.def.attackInterval ?? 2.4) * this.game.dungeon.attackMul) * (this.enraged ? 0.7 : 1);
    const p = this.game.player;
    this.busy = true;
    if (a === 'storm' || a === 'storm2') {
      const n = (this.enraged ? 7 : 5) + (a === 'storm2' ? 2 : 0);
      let left = n;
      for (let i = 0; i < n; i++) {
        const x = clamp(i === 0 ? p.x : p.x + rand(-200, 200), ARENA.x + 40, ARENA_RIGHT - 40);
        const y = clamp(i === 0 ? p.y : p.y + rand(-200, 200), ARENA.y + 40, ARENA_BOTTOM - 40);
        this.strike(x, y, 66, tele + i * 0.12, () => {
          left--;
          if (left === 0) this.busy = false;
        });
      }
    } else if (a === 'cross') {
      const base = this.crossDiagonal ? Math.PI / 4 : 0;
      this.crossDiagonal = !this.crossDiagonal;
      let left = 4;
      for (let i = 0; i < 4; i++) {
        const ang = base + (Math.PI / 2) * i;
        const x2 = this.x + Math.cos(ang) * 900;
        const y2 = this.y + Math.sin(ang) * 900;
        this.game.telegraphs.add({
          owner: this, duration: tele + 0.2, color: 0xc9a3ff,
          shape: { kind: 'line', x1: this.x, y1: this.y, x2, y2, width: 46 },
          onDone: (shape) => {
            left--;
            if (left === 0) this.busy = false;
            if (!this.alive || this.frozen) return;
            this.game.fx.line(this.x, this.y, x2, y2, 0xffe14d, 14);
            this.game.fx.line(this.x, this.y, x2, y2, 0xffffff, 5);
            Sound.play('zap');
            const pl = this.game.player;
            if (TelegraphSystem.hits(shape, pl.x, pl.y, pl.radius)) this.game.hurtPlayer(1);
          },
        });
      }
      this.game.cameras.main.shake(100, 0.004);
    } else {
      this.game.dungeon.spawnEnemy('splitter', this.x - 120, this.y + 60, false, 0.6);
      this.game.dungeon.spawnEnemy('splitter', this.x + 120, this.y + 60, false, 0.6);
      if (this.enraged) this.game.dungeon.spawnEnemy('wisp', this.x, this.y + 160, false, 0.6);
      this.busy = false;
    }
  }
}
