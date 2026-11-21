import Phaser from 'phaser';
import { Enemy } from '../Enemy';
import { ARENA, ARENA_BOTTOM, ARENA_RIGHT, ELITE } from '../../config';
import { ELEMENT_MAP, hexToInt } from '../../data';
import type { Pickup } from '../Pickup';
import { TelegraphSystem } from '../../systems/TelegraphSystem';
import { Sound } from '../../systems/SoundSystem';
import type { ElementId, Material, RarityIndex } from '../../types';
import { clamp, dist, rand } from '../../utils';

/**
 * 煉金鼠：會去搶地上的素材，搶滿 3 個就喝下去，變成帶主要元素的「突變精英」。
 * 打倒時吐出所有素材（其中一個稀有度 +1）再多給一個。
 */
export class Thief extends Enemy {
  bag: Material[] = [];
  mutated?: ElementId;
  private target?: Pickup;
  private attackTimer = 2;
  private busy = false;
  private wander = { x: 0, y: 0, t: 0 };
  private bagIcons: Phaser.GameObjects.Image[] = [];

  protected act(dt: number): void {
    const g = this.game;
    if (this.mutated) {
      this.actMutated(dt);
      return;
    }
    // 找最近的素材
    if (!this.target || !this.target.alive) {
      let best: Pickup | undefined;
      let bd = Infinity;
      for (const pk of g.pickups) {
        if (!pk.alive) continue;
        const d = dist(this.x, this.y, pk.x, pk.y);
        if (d < bd) {
          bd = d;
          best = pk;
        }
      }
      this.target = best;
    }
    if (this.target) {
      this.moveToward(this.target.x, this.target.y, dt);
      if (dist(this.x, this.y, this.target.x, this.target.y) < this.radius + 14) this.steal(this.target);
    } else {
      // 沒素材可搶：在玩家附近遊蕩騷擾
      this.wander.t -= dt;
      if (this.wander.t <= 0) {
        const t = this.targetPoint();
        this.wander = { x: t.x + rand(-220, 220), y: t.y + rand(-160, 160), t: 1.5 };
      }
      this.moveToward(this.wander.x, this.wander.y, dt, this.speed * 0.6);
    }
    this.sprite.setFlipX((this.target?.x ?? this.wander.x) < this.x);
  }

  private steal(pk: Pickup): void {
    this.bag.push(pk.mat);
    pk.destroy();
    this.target = undefined;
    this.game.fx.floatText(this.x, this.y - 30, '搶走了！', '#d8b8ff', 18);
    this.refreshBag();
    if (this.bag.length >= 3) this.mutate();
  }

  private mutate(): void {
    const count: Partial<Record<ElementId, number>> = {};
    for (const m of this.bag) count[m.el] = (count[m.el] ?? 0) + 1 + m.r;
    const el = (Object.entries(count).sort((a, b) => b[1] - a[1])[0][0]) as ElementId;
    this.mutated = el;
    this.maxHp *= ELITE.hpMul * 1.2;
    this.hp = this.maxHp;
    this.radius *= 1.35;
    this.speed *= 0.75;
    (this as unknown as { baseTint: number }).baseTint = hexToInt(ELEMENT_MAP[el].color);
    this.sprite.setDisplaySize(this.radius * 2.5, this.radius * 2.5);
    this.game.fx.burst(this.x, this.y, 120, hexToInt(ELEMENT_MAP[el].color), 500);
    this.game.showBanner(`煉金鼠突變了！（${ELEMENT_MAP[el].name}）`);
    Sound.play('fission');
  }

  private actMutated(dt: number): void {
    const g = this.game;
    const t = this.targetPoint();
    if (!this.busy) this.moveToward(t.x, t.y, dt);
    this.attackTimer -= dt;
    if (this.attackTimer > 0 || this.busy) return;
    this.attackTimer = 2.6 * g.dungeon.attackMul;
    const a = Math.atan2(t.y - this.y, t.x - this.x);
    switch (this.mutated) {
      case 'F': // 火環
        for (let i = 0; i < 12; i++) g.projectiles.fireEnemy(this.x, this.y, (Math.PI * 2 * i) / 12, 260);
        g.fx.burst(this.x, this.y, 60, 0xff8a3d);
        break;
      case 'I': // 三連冰刃
        for (let k = 0; k < 3; k++) g.effects.delay(k * 0.15, () => this.alive && g.projectiles.fireEnemy(this.x, this.y, a + (k - 1) * 0.12, 460));
        break;
      case 'S': // 毒沼
        g.hazards.add(this.x, this.y, 46, 5, 0x7eff8a);
        break;
      case 'T': { // 直線雷射
        this.busy = true;
        const x2 = this.x + Math.cos(a) * 700;
        const y2 = this.y + Math.sin(a) * 700;
        g.telegraphs.add({
          owner: this, duration: 0.8, color: 0xffe14d,
          shape: { kind: 'line', x1: this.x, y1: this.y, x2, y2, width: 36 },
          onDone: (shape) => {
            this.busy = false;
            if (!this.alive || this.frozen) return;
            g.fx.line(this.x, this.y, x2, y2, 0xffe14d, 10);
            Sound.play('zap');
            const p = g.player;
            if (!g.playerHidden && TelegraphSystem.hits(shape, p.x, p.y, p.radius)) g.hurtPlayer(1);
          },
        });
        break;
      }
      case 'J': { // 衝撞
        this.busy = true;
        const tx = clamp(this.x + Math.cos(a) * 320, ARENA.x + this.radius, ARENA_RIGHT - this.radius);
        const ty = clamp(this.y + Math.sin(a) * 320, ARENA.y + this.radius, ARENA_BOTTOM - this.radius);
        g.telegraphs.add({
          owner: this, duration: 0.7,
          shape: { kind: 'line', x1: this.x, y1: this.y, x2: tx, y2: ty, width: this.radius * 2 },
          onDone: () => {
            this.busy = false;
            if (!this.alive || this.frozen) return;
            this.knockback(this.x - Math.cos(a), this.y - Math.sin(a), 200);
          },
        });
        break;
      }
    }
  }

  private refreshBag(): void {
    this.bagIcons.forEach((i) => i.destroy());
    this.bagIcons = this.bag.map((m) => this.game.add.image(this.x, this.y, `ing_${m.el}`).setDisplaySize(14, 14).setDepth(25));
  }

  protected sync(dt: number): void {
    super.sync(dt);
    this.bagIcons.forEach((img, i) => img.setPosition(this.x - 14 + i * 14, this.y - this.radius - 14));
  }

  protected die(): void {
    // 吐出素材：其中一個稀有度 +1，再多給一個
    const loot = [...this.bag];
    if (loot.length) loot[0] = { el: loot[0].el, r: Math.min(3, loot[0].r + 1) as RarityIndex };
    loot.push({ el: loot[0]?.el ?? 'J', r: (this.mutated ? 2 : 1) as RarityIndex });
    const x = this.x;
    const y = this.y;
    this.game.effects.delay(0.05, () => loot.forEach((m, i) => {
      const ang = (Math.PI * 2 * i) / loot.length;
      this.game.dropMaterial(x + Math.cos(ang) * 40, y + Math.sin(ang) * 40, m);
    }));
    super.die();
  }

  destroy(): void {
    super.destroy();
    this.bagIcons.forEach((i) => i.destroy());
  }
}
