import Phaser from 'phaser';
import { DROP, ELEMENT, PLAYER } from '../config';
import type { Enemy } from '../entities/Enemy';
import { PASSIVES, type PassiveCtx } from '../potions/passives';
import type { GameScene } from '../scenes/GameScene';
import type { Brew, IngredientId } from '../types';
import type { Zone } from './EffectSystem';

/** 角色在本局的即時數值（由喝下的藥水、突變卡計算而來） */
export interface Stats {
  maxHp: number;
  speed: number;
  dashCooldown: number;
  fireInterval: number;
  damage: number;
  shots: number;
  pierce: number;
  bounces: number;
  poisonDps: number;
  slow: number;
  freezeChance: number;
  splash: number;
  pickupRadius: number;
  dropChance: number;
}

export function baseStats(): Stats {
  return {
    maxHp: PLAYER.hp,
    speed: PLAYER.speed,
    dashCooldown: PLAYER.dashCooldown,
    fireInterval: PLAYER.fireInterval,
    damage: PLAYER.bulletDamage,
    shots: 1,
    pierce: 0,
    bounces: 0,
    poisonDps: 0,
    slow: 0,
    freezeChance: 0,
    splash: 0,
    pickupRadius: PLAYER.pickupRadius,
    dropChance: DROP.chance,
  };
}

/**
 * 喝下的藥水帶來的「本局永久」強化：
 * 1. 屬性：每個藥材各給一份數值（果凍＝血量/衝刺/移速、冰晶＝攻速/減速、孢子＝附毒）
 * 2. 被動：每種配方 / 傳說藥水的獨特效果，可疊層
 */
export class BuffSystem extends Phaser.Events.EventEmitter {
  elements: Record<IngredientId, number> = { J: 0, I: 0, S: 0 };
  /** 被動 id → 層數（配方與傳說共用） */
  stacks = new Map<string, number>();
  revives = 0;
  drinks = 0;
  stats: Stats = baseStats();
  private periodT = new Map<string, number>();
  private shotIndex = 0;
  private aura?: Zone;

  constructor(private game: GameScene) {
    super();
  }

  stacksOf(id: string): number {
    return this.stacks.get(id) ?? 0;
  }

  private ctx(id: string): PassiveCtx {
    const m = this.game.mutations;
    return {
      game: this.game,
      n: this.stacksOf(id),
      area: 1 + 0.2 * m.stacks('spread'),
      freq: Math.pow(0.85, m.stacks('linger')) * Math.pow(0.75, this.stacksOf('time_sand')),
      linger: m.stacks('linger'),
    };
  }

  /** 喝下藥水 */
  drink(brew: Brew): void {
    const m = this.game.mutations;
    const recipe = brew.kind === 'recipe' ? brew.recipe : brew.from;
    const twice = Math.random() < Math.min(1, 0.2 * m.stacks('double_brew'));
    const times = twice ? 2 : 1;
    for (let t = 0; t < times; t++) {
      for (const ch of recipe.key) this.elements[ch as IngredientId]++;
      const id = brew.kind === 'recipe' ? brew.recipe.id : brew.legendary.id;
      let add = 1;
      if (brew.kind === 'recipe' && recipe.key[0] === recipe.key[1] && recipe.key[1] === recipe.key[2]) {
        add += m.stacks('resonance');
      }
      this.stacks.set(id, this.stacksOf(id) + add);
      this.drinks++;
      this.recompute();
      PASSIVES[id]?.onAcquire?.(this.ctx(id));
    }
    if (Math.random() < 0.25 * m.stacks('rejuvenate')) {
      this.game.player.hp = Math.min(this.game.player.maxHp, this.game.player.hp + 1);
      this.game.fx.floatText(this.game.player.x, this.game.player.y - 50, '+1 ♥', '#ff6b8a');
    }
    this.emit('changed', twice);
  }

  /** 重新計算數值（喝藥、拿突變卡後呼叫） */
  recompute(): void {
    const m = this.game.mutations;
    const s = baseStats();
    const mul = 1 + 0.25 * m.stacks('concentrate');
    const j = this.elements.J * mul;
    const i = this.elements.I * mul;
    const sp = this.elements.S * mul;

    s.dashCooldown *= Math.pow(ELEMENT.jellyDashMul, j);
    s.speed *= Math.min(ELEMENT.maxSpeedMul, 1 + ELEMENT.jellySpeed * j);
    s.maxHp += Math.floor(j / ELEMENT.jellyPerHeart);
    s.fireInterval *= Math.pow(ELEMENT.iceFireMul, i);
    s.slow = Math.min(ELEMENT.maxSlow, ELEMENT.iceSlow * i);
    s.poisonDps = ELEMENT.sporePoison * sp;

    s.dropChance += 0.1 * m.stacks('harvest');
    s.pickupRadius *= 1 + 0.4 * m.stacks('magnet');

    for (const [id, n] of this.stacks) if (n > 0) PASSIVES[id]?.stats?.(s, this.ctx(id));

    s.maxHp = Math.min(ELEMENT.maxHp, s.maxHp);
    s.dashCooldown = Math.max(ELEMENT.minDashCooldown, s.dashCooldown);
    s.fireInterval = Math.max(ELEMENT.minFireInterval, s.fireInterval);

    const p = this.game.player;
    const gained = s.maxHp - p.maxHp;
    p.maxHp = s.maxHp;
    if (gained > 0) p.hp = Math.min(p.maxHp, p.hp + gained);
    p.hp = Math.min(p.hp, p.maxHp);
    this.stats = s;
    p.stats = s;
  }

  /** 毒霧光環（瘟疫毒雲） */
  ensureAura(): void {
    if (this.aura && !this.aura.dead) return;
    this.aura = this.game.effects.addZone({
      x: this.game.player.x, y: this.game.player.y, radius: 80, duration: Infinity, color: 0x7eff8a,
      followPlayer: true, tickInterval: 0.5,
      onFrame: (_inside, _dt, z) => {
        const c = this.ctx('plague_cloud');
        z.radius = (70 + 12 * c.n) * c.area;
      },
      onTick: (inside) => {
        const n = this.stacksOf('plague_cloud');
        inside.forEach((e) => e.takeDamage(0.4 * n, { flash: false }));
      },
    });
  }

  update(dt: number, combatActive: boolean): void {
    if (!combatActive) return;
    for (const [id, n] of this.stacks) {
      const passive = PASSIVES[id];
      if (n <= 0 || !passive?.period || !passive.onPeriod) continue;
      const c = this.ctx(id);
      const period = passive.period(c) * c.freq;
      const t = (this.periodT.get(id) ?? 0) + dt;
      if (t >= period && this.game.enemies.length > 0) {
        this.periodT.set(id, 0);
        passive.onPeriod(c);
      } else {
        this.periodT.set(id, Math.min(t, period));
      }
    }
  }

  private each(fn: (id: string, c: PassiveCtx) => void): void {
    for (const [id, n] of this.stacks) if (n > 0) fn(id, this.ctx(id));
  }

  onShot(): void {
    this.shotIndex++;
    this.each((id, c) => PASSIVES[id]?.onShot?.(c, this.shotIndex));
  }

  onHit(e: Enemy): void {
    this.each((id, c) => PASSIVES[id]?.onHit?.(c, e));
  }

  onKill(e: Enemy): void {
    this.each((id, c) => PASSIVES[id]?.onKill?.(c, e));
  }

  onDash(sx: number, sy: number, ex: number, ey: number): void {
    this.each((id, c) => PASSIVES[id]?.onDash?.(c, sx, sy, ex, ey));
  }
}
