import Phaser from 'phaser';
import { DROP, ELEMENT, PLAYER, RARITY } from '../config';
import { ELEMENT_IDS } from '../data';
import type { Enemy } from '../entities/Enemy';
import { PASSIVES, type PassiveCtx } from '../potions/passives';
import type { GameScene } from '../scenes/GameScene';
import type { Brew, CharacterDef, ElementId } from '../types';
import type { Zone } from './EffectSystem';
import { MetaStore } from './MetaStore';

/** 角色在本局的即時數值 */
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
  critChance: number;
  explodeChance: number;
  chainChance: number;
  splash: number;
  pickupRadius: number;
  dropChance: number;
  /** 高稀有度素材掉落加成（倍率） */
  fortune: number;
}

export function baseStats(c?: CharacterDef): Stats {
  return {
    maxHp: c?.stats.hp ?? PLAYER.hp,
    speed: c?.stats.speed ?? PLAYER.speed,
    dashCooldown: c?.stats.dashCooldown ?? PLAYER.dashCooldown,
    fireInterval: c?.stats.fireInterval ?? PLAYER.fireInterval,
    damage: c?.stats.damage ?? PLAYER.bulletDamage,
    shots: 1,
    pierce: 0,
    bounces: 0,
    poisonDps: 0,
    slow: 0,
    freezeChance: 0,
    critChance: 0,
    explodeChance: 0,
    chainChance: 0,
    splash: 0,
    pickupRadius: PLAYER.pickupRadius * (1 + (c?.pickupBonus ?? 0)),
    dropChance: DROP.chance,
    fortune: 1,
  };
}

/**
 * 喝下藥水的「本局永久」強化：
 * 1. 屬性：每個素材依稀有度給「份數」（普通 1、稀有 1.5、史詩 2、傳說 3）
 * 2. 被動模組：藥水依品質給層數，可疊加
 */
export class BuffSystem extends Phaser.Events.EventEmitter {
  elements: Record<ElementId, number> = { J: 0, I: 0, S: 0, F: 0, T: 0 };
  stacks = new Map<string, number>();
  drinks = 0;
  bestQuality = 0;
  stats: Stats;
  private periodT = new Map<string, number>();
  private shotIndex = 0;
  private aura?: Zone;

  constructor(private game: GameScene, readonly character: CharacterDef) {
    super();
    this.stats = baseStats(character);
  }

  stacksOf(id: string): number {
    return this.stacks.get(id) ?? 0;
  }

  private ctx(id: string): PassiveCtx {
    const m = this.game.mutations;
    return {
      game: this.game,
      n: this.stacksOf(id) * (this.character.moduleMul ?? 1),
      area: 1 + m.value('spread') / 100,
      freq: Math.pow(1 - 0.15, m.stacks('linger')) * Math.pow(0.75, this.stacksOf('time_sand')),
    };
  }

  addModule(id: string, n: number): void {
    this.stacks.set(id, this.stacksOf(id) + n);
    this.recompute();
    PASSIVES[id]?.onAcquire?.(this.ctx(id));
  }

  drink(brew: Brew): boolean {
    const m = this.game.mutations;
    const recipe = brew.kind === 'recipe' ? brew.recipe : brew.from;
    const q = RARITY[brew.quality].mult;
    const twice = Math.random() < m.value('double_brew') / 100;
    for (let t = 0; t < (twice ? 2 : 1); t++) {
      const relicMul = this.game.relics?.elementMul ?? 1;
      for (const mat of brew.mats) {
        this.elements[mat.el] += RARITY[mat.r].mult * (this.character.elementBonus?.[mat.el] ?? 1) * relicMul;
      }
      if (brew.kind === 'recipe') {
        for (const mod of recipe.modules) {
          const extra = recipe.kind === 'pure' ? m.stacks('resonance') * 0.5 : 0;
          this.stacks.set(mod.id, this.stacksOf(mod.id) + mod.n * q + extra);
        }
        if (recipe.damageBonus) this.stacks.set('tri_damage', this.stacksOf('tri_damage') + recipe.damageBonus * q);
      } else {
        this.stacks.set(brew.mythic.id, this.stacksOf(brew.mythic.id) + 1);
      }
      this.drinks++;
      this.recompute();
      const ids = brew.kind === 'recipe' ? recipe.modules.map((x) => x.id) : [brew.mythic.id];
      ids.forEach((id) => PASSIVES[id]?.onAcquire?.(this.ctx(id)));
    }
    this.bestQuality = Math.max(this.bestQuality, brew.quality);
    this.game.relics?.onDrink();
    if (Math.random() < m.value('rejuvenate') / 100) {
      const p = this.game.player;
      p.hp = Math.min(p.maxHp, p.hp + 1);
      this.game.fx.floatText(p.x, p.y - 50, '+1 ♥', '#ff6b8a');
    }
    this.emit('changed', twice);
    return twice;
  }

  recompute(): void {
    const m = this.game.mutations;
    const s = baseStats(this.character);
    const mul = 1 + m.value('concentrate') / 100;
    const e = Object.fromEntries(ELEMENT_IDS.map((id) => [id, this.elements[id] * mul])) as Record<ElementId, number>;

    s.dashCooldown *= Math.pow(ELEMENT.jellyDashMul, e.J);
    s.speed *= Math.min(ELEMENT.maxSpeedMul, 1 + ELEMENT.jellySpeed * e.J);
    s.maxHp += Math.floor(e.J / ELEMENT.jellyPerHeart);
    s.fireInterval *= Math.pow(ELEMENT.iceFireMul, e.I);
    s.slow = Math.min(ELEMENT.maxSlow, ELEMENT.iceSlow * e.I);
    s.poisonDps = ELEMENT.sporePoison * e.S;
    s.damage *= 1 + ELEMENT.fireDamage * e.F + this.stacksOf('tri_damage');
    s.critChance = Math.min(ELEMENT.maxCrit, ELEMENT.thunderCrit * e.T);

    s.dropChance += m.value('harvest') / 100;
    s.fortune += m.value('fortune') / 100;
    s.pickupRadius *= 1 + m.value('magnet') / 100;

    for (const [id, n] of this.stacks) if (n > 0) PASSIVES[id]?.stats?.(s, this.ctx(id));

    // 大坩堝永久升級
    s.maxHp += MetaStore.level('vitality');
    s.damage *= 1 + 0.06 * MetaStore.level('claws');
    s.dashCooldown *= 1 - 0.06 * MetaStore.level('paws');
    s.pickupRadius *= 1 + 0.15 * MetaStore.level('whiskers');
    s.fortune += 0.1 * MetaStore.level('lucky_paw');
    // 聖物
    this.game.relics?.applyStats(s);

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

  /** 實測每秒傷害（指數移動平均，每清一間戰鬥房更新） */
  private observedDps = 0;
  private roomDamage = 0;
  private roomTime = 0;

  /** 敵人實際被扣的血量（不含溢出） */
  recordDamage(amount: number): void {
    this.roomDamage += amount;
  }

  /** 戰鬥中每幀累積時間 */
  tickCombat(dt: number, enemiesAlive: boolean): void {
    if (enemiesAlive) this.roomTime += dt;
  }

  /** 房間清空時結算本房 DPS */
  commitRoom(): void {
    if (this.roomTime > 3) {
      const dps = this.roomDamage / this.roomTime;
      this.observedDps = this.observedDps ? this.observedDps * 0.4 + dps * 0.6 : dps;
    }
    this.roomDamage = 0;
    this.roomTime = 0;
  }

  /** 角色初始火力（拿初始武器時的理論 DPS） */
  private get baseDps(): number {
    const b = baseStats(this.character);
    return b.damage / b.fireInterval;
  }

  /**
   * 玩家火力相對於初始狀態的倍數（給難度追趕用）：用實測 DPS，
   * 不管火力來自哪種藥水、武器或技能都量得到。
   */
  powerRatio(): number {
    return this.observedDps ? this.observedDps / this.baseDps : 1;
  }

  ensureAura(): void {
    if (this.aura && !this.aura.dead) return;
    this.aura = this.game.effects.addZone({
      x: this.game.player.x, y: this.game.player.y, radius: 80, duration: Infinity, color: 0x7eff8a,
      followPlayer: true, tickInterval: 0.5,
      onFrame: (_inside, _dt, z) => {
        const c = this.ctx('core_S');
        z.radius = (70 + 12 * c.n) * c.area;
      },
      onTick: (inside) => {
        const n = this.ctx('core_S').n;
        inside.forEach((en) => en.takeDamage(0.4 * n, { flash: false }));
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

  /** 主武器命中：灼熱爆炸、帶電連鎖 */
  onHit(e: Enemy, damage: number): void {
    const s = this.stats;
    const area = 1 + this.game.mutations.value('spread') / 100;
    if (s.explodeChance > 0 && Math.random() < s.explodeChance) {
      this.game.effects.explode(e.x, e.y, 50 * area, damage * 0.8, 0xff8a3d);
    }
    if (s.chainChance > 0 && Math.random() < s.chainChance) {
      this.game.effects.chain(e.x, e.y, 3, 1.2 + damage * 0.3, 220 * area, 0xffe14d);
    }
  }

  onKill(e: Enemy): void {
    this.each((id, c) => PASSIVES[id]?.onKill?.(c, e));
  }
}
