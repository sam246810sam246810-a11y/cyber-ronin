import { Enemy } from '../Enemy';
import { ARENA, ARENA_BOTTOM, ARENA_RIGHT } from '../../config';
import { TelegraphSystem } from '../../systems/TelegraphSystem';
import { Sound } from '../../systems/SoundSystem';
import { clamp } from '../../utils';
import type { EnemyDef } from '../../types';
import type { GameScene } from '../../scenes/GameScene';

type Attack = 'ring' | 'slam' | 'summon';

/** 熔岩巨蝸：緩慢追擊並留下熔岩痕跡；火環彈幕 / 砸地 / 召喚自爆熔岩球 */
export class MagmaSnail extends Enemy {
  private attackTimer = 2.5;
  private trailTimer = 0;
  private busy = false;
  private cycle: Attack[] = ['ring', 'slam', 'summon', 'slam'];
  private idx = 0;

  constructor(game: GameScene, def: EnemyDef, x: number, y: number) {
    super(game, def, x, y, false, 'snail');
    this.freezeResist = 0.4;
    this.knockbackResist = 0;
  }

  get enraged(): boolean {
    return this.hp < this.maxHp * 0.5;
  }

  protected act(dt: number): void {
    const p = this.game.player;
    if (!this.busy) this.moveToward(p.x, p.y, dt, this.speed * (this.enraged ? 1.4 : 1));
    this.sprite.setRotation(Math.sin(this.game.time.now / 500) * 0.06);
    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = this.enraged ? 0.45 : 0.7;
      this.game.hazards.add(this.x, this.y + this.radius * 0.4, 38, 4.5);
    }
    if (this.busy) return;
    this.attackTimer -= dt;
    if (this.attackTimer <= 0) this.attack();
  }

  private attack(): void {
    const a = this.cycle[this.idx++ % this.cycle.length];
    const tele = Number(this.def.telegraph ?? 0.9) * (this.enraged ? 0.85 : 1);
    this.attackTimer = Number(this.def.attackInterval ?? 2.8) * (this.enraged ? 0.7 : 1);
    this.busy = true;
    const p = this.game.player;
    if (a === 'ring') {
      this.game.telegraphs.add({
        owner: this, duration: tele, shape: { kind: 'circle', x: this.x, y: this.y, r: this.radius + 40 },
        onDone: () => {
          this.busy = false;
          if (!this.alive || this.frozen) return;
          const n = this.enraged ? 20 : 14;
          for (let w = 0; w < 2; w++) {
            this.game.effects.delay(w * 0.35, () => {
              if (!this.alive) return;
              const off = w * (Math.PI / n);
              for (let i = 0; i < n; i++) this.game.projectiles.fireEnemy(this.x, this.y, off + (Math.PI * 2 * i) / n, 260);
            });
          }
          Sound.play('explode');
        },
      });
    } else if (a === 'slam') {
      const x = clamp(p.x, ARENA.x + 60, ARENA_RIGHT - 60);
      const y = clamp(p.y, ARENA.y + 60, ARENA_BOTTOM - 60);
      this.game.telegraphs.add({
        owner: this, duration: tele + 0.15, shape: { kind: 'circle', x, y, r: 110 },
        onDone: (shape) => {
          this.busy = false;
          if (!this.alive) return;
          this.game.fx.burst(x, y, 110, 0xff5a2a);
          this.game.hazards.add(x, y, 70, 3);
          this.game.cameras.main.shake(120, 0.006);
          Sound.play('explode');
          const pl = this.game.player;
          if (TelegraphSystem.hits(shape, pl.x, pl.y, pl.radius)) this.game.hurtPlayer(1);
        },
      });
    } else {
      const n = this.enraged ? 4 : 3;
      for (let i = 0; i < n; i++) {
        const ang = (Math.PI * 2 * i) / n;
        this.game.waves.spawnEnemy('bomber', this.x + Math.cos(ang) * 110, this.y + Math.sin(ang) * 110, false, 0.6);
      }
      this.busy = false;
    }
  }
}
