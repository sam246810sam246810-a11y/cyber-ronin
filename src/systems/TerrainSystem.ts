import Phaser from 'phaser';
import { DEPTH } from '../config';
import type { Enemy } from '../entities/Enemy';
import type { GameScene } from '../scenes/GameScene';
import type { ElementId, TerrainPatch, TerrainType } from '../types';
import { Sound } from './SoundSystem';

type State = 'idle' | 'burning' | 'toxic' | 'frozen' | 'electric' | 'spent';

interface Patch extends TerrainPatch {
  state: State;
  timer: number;
  tick: number;
  cooldown: number;
  heals: number;
  gfx: Phaser.GameObjects.Graphics;
  /** 美術地形貼圖（有載入時取代 gfx 畫的橢圓） */
  img?: Phaser.GameObjects.Image;
}

/** 地形狀態 → 貼圖 key */
function terrainKey(p: { type: TerrainType; state: State }): string {
  if (p.type === 'sun') return 'ter_sun';
  if (p.state === 'idle' || p.state === 'spent') return `ter_${p.type}`;
  return `ter_${p.state}`;
}

const BASE: Record<TerrainType, number> = { water: 0x3a7bd5, grass: 0x4f9a3a, oil: 0x2a1f3a, sun: 0xffe9a0 };
const STATE_COLOR: Partial<Record<State, number>> = {
  burning: 0xff6a2a, toxic: 0x7eff8a, frozen: 0xbfefff, electric: 0xffe14d, spent: 0x3a3a3a,
};

/**
 * 元素地形：水窪 / 草叢 / 油漬 / 陽光光斑。
 * 玩家的攻擊打在地形上時，依玩家喝過的元素產生反應（只傷敵人）：
 *   火＋草＝起火、毒＋草＝毒菇、冰＋水＝結冰、雷＋水＝導電、火＋油＝爆炸
 * 陽光光斑：站著不動慢慢回血（每間房最多 2 次）。
 */
export class TerrainSystem {
  private patches: Patch[] = [];
  private stillTime = 0;

  constructor(private game: GameScene) {}

  load(list: TerrainPatch[]): void {
    this.clear();
    for (const t of list) {
      const gfx = this.game.add.graphics().setDepth(DEPTH.floor + 2);
      const key = terrainKey({ type: t.type, state: 'idle' });
      const img = this.game.textures.exists(key)
        ? this.game.add.image(t.x, t.y, key).setDisplaySize(t.r * 2.5, t.r * 2.0).setDepth(DEPTH.floor + 2)
        : undefined;
      this.patches.push({ ...t, state: 'idle', timer: 0, tick: 0, cooldown: 0, heals: 0, gfx, img });
    }
    this.patches.forEach((p) => this.draw(p));
  }

  clear(): void {
    this.patches.forEach((p) => {
      p.gfx.destroy();
      p.img?.destroy();
    });
    this.patches = [];
  }

  private draw(p: Patch): void {
    const g = p.gfx;
    g.clear();
    const t = this.game.time.now / 1000;
    const c = STATE_COLOR[p.state] ?? BASE[p.type];
    if (p.img) {
      // 美術地形：依狀態換貼圖，燃燒／導電／中毒時閃爍，用完變暗
      const key = terrainKey(p);
      if (p.img.texture.key !== key && this.game.textures.exists(key)) {
        p.img.setTexture(key).setDisplaySize(p.r * 2.5, p.r * 2.0);
      }
      const active = p.state === 'burning' || p.state === 'electric' || p.state === 'toxic';
      p.img.setAlpha(p.type === 'sun' ? 0.75 + 0.15 * Math.sin(t * 2) : active ? 0.85 + 0.15 * Math.sin(t * 12) : 1);
      p.img.setTint(p.state === 'spent' ? 0x606060 : 0xffffff);
      return;
    }
    if (p.type === 'sun') {
      g.fillStyle(0xfff2b0, 0.16 + 0.04 * Math.sin(t * 2)).fillEllipse(p.x, p.y, p.r * 2.2, p.r * 1.5);
      g.fillStyle(0xffffff, 0.1).fillEllipse(p.x - p.r * 0.2, p.y - p.r * 0.1, p.r, p.r * 0.6);
      return;
    }
    const alpha = p.state === 'spent' ? 0.25 : p.state === 'idle' ? 0.45 : 0.6 + 0.15 * Math.sin(t * 10);
    g.fillStyle(c, alpha).fillEllipse(p.x, p.y, p.r * 2.2, p.r * 1.6);
    if (p.type === 'grass' && p.state === 'idle') {
      g.fillStyle(0x7ac65a, 0.6);
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4;
        const x = p.x + Math.cos(a) * p.r * 0.7 * ((i % 3) / 3 + 0.3);
        const y = p.y + Math.sin(a) * p.r * 0.45 * ((i % 3) / 3 + 0.3);
        g.fillTriangle(x - 4, y, x, y - 12, x + 4, y);
      }
    }
    if (p.type === 'water' && p.state === 'idle') g.lineStyle(2, 0x9fd4ff, 0.5).strokeEllipse(p.x, p.y, p.r * 1.4, p.r * 0.9);
    if (p.type === 'oil' && p.state === 'idle') g.fillStyle(0xb36bff, 0.25).fillEllipse(p.x + p.r * 0.2, p.y - p.r * 0.15, p.r * 0.9, p.r * 0.4);
    if (p.state === 'frozen') g.lineStyle(3, 0xffffff, 0.7).strokeEllipse(p.x, p.y, p.r * 2.2, p.r * 1.6);
  }

  private inside(p: Patch, x: number, y: number, pad = 0): boolean {
    const dx = (x - p.x) / (p.r * 1.1 + pad);
    const dy = (y - p.y) / (p.r * 0.8 + pad);
    return dx * dx + dy * dy <= 1;
  }

  /** 依玩家喝過的元素抽一個反應元素（份數越多越容易） */
  private pickElement(): ElementId | undefined {
    const e = this.game.buffs.elements;
    const total = e.F + e.I + e.S + e.T + e.J;
    if (total <= 0) return undefined;
    let r = Math.random() * total;
    for (const id of ['F', 'I', 'S', 'T', 'J'] as ElementId[]) {
      r -= e[id];
      if (r < 0) return id;
    }
    return undefined;
  }

  /** 玩家攻擊命中某個位置 */
  onHit(x: number, y: number): void {
    for (const p of this.patches) {
      if (p.type === 'sun' || p.state !== 'idle' || p.cooldown > 0 || !this.inside(p, x, y, 12)) continue;
      const el = this.pickElement();
      if (!el) return;
      p.cooldown = 0.5;
      this.react(p, el);
    }
  }

  private react(p: Patch, el: ElementId): void {
    const fx = this.game.fx;
    const text = (t: string, c: string) => fx.floatText(p.x, p.y - p.r, t, c, 22);
    if (p.type === 'grass' && el === 'F') {
      p.state = 'burning';
      p.timer = 4;
      text('起火！', '#ff8a3d');
      Sound.play('explode');
    } else if (p.type === 'grass' && el === 'S') {
      p.state = 'toxic';
      p.timer = 6;
      text('毒菇叢生！', '#7eff8a');
    } else if (p.type === 'water' && el === 'I') {
      p.state = 'frozen';
      p.timer = 6;
      text('結冰！', '#bfefff');
    } else if (p.type === 'water' && el === 'T') {
      p.state = 'electric';
      p.timer = 3.5;
      text('導電！', '#ffe14d');
      Sound.play('zap');
    } else if (p.type === 'oil' && el === 'F') {
      const dmg = this.game.buffs.stats.damage * 6;
      this.game.effects.explode(p.x, p.y, p.r * 1.6, dmg, 0xff6a2a, { knockback: 90 });
      this.game.cameras.main.shake(180, 0.008);
      p.state = 'burning';
      p.timer = 3;
      text('油漬爆炸！', '#ff6a2a');
    }
    this.draw(p);
  }

  private enemiesIn(p: Patch): Enemy[] {
    return this.game.enemies.filter((e) => e.alive && !e.airborne && this.inside(p, e.x, e.y));
  }

  update(dt: number, moving: boolean): void {
    const dmg = this.game.buffs.stats.damage;
    const pl = this.game.player;
    this.stillTime = moving ? 0 : this.stillTime + dt;
    for (const p of this.patches) {
      p.cooldown = Math.max(0, p.cooldown - dt);
      if (p.type === 'sun') {
        if (this.inside(p, pl.x, pl.y) && this.stillTime > 2 && p.heals < 2 && pl.hp < pl.maxHp) {
          this.stillTime = -2; // 下一次至少再等 4 秒
          p.heals++;
          this.game.heal(1);
          this.game.fx.floatText(pl.x, pl.y - 70, '曬太陽好舒服～', '#ffe9a0', 18);
        }
        this.draw(p);
        continue;
      }
      if (p.state === 'idle') {
        if (p.type === 'oil') this.enemiesIn(p).forEach((e) => e.applySlow(0.3, 0.2));
        continue;
      }
      if (p.state === 'spent') continue;
      p.timer -= dt;
      p.tick -= dt;
      const tick = p.tick <= 0;
      if (tick) p.tick = 0.4;
      const inside = this.enemiesIn(p);
      if (p.state === 'burning' && tick) inside.forEach((e) => e.takeDamage(dmg * 0.8, { flash: false }));
      if (p.state === 'toxic') inside.forEach((e) => e.applyPoison(Math.max(1, dmg * 0.6), 1));
      if (p.state === 'frozen') inside.forEach((e) => e.applySlow(0.7, 0.3));
      if (p.state === 'electric' && tick && inside.length) {
        inside.forEach((e) => {
          e.takeDamage(dmg * 1.2);
          this.game.fx.line(p.x, p.y, e.x, e.y, 0xffe14d, 3);
        });
      }
      if (p.timer <= 0) p.state = p.type === 'water' ? 'idle' : 'spent';
      this.draw(p);
    }
  }
}
