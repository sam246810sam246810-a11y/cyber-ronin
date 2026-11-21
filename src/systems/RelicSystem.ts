import Phaser from 'phaser';
import { RELICS, RELIC_MAP } from '../data';
import type { Enemy } from '../entities/Enemy';
import type { GameScene } from '../scenes/GameScene';
import type { RarityIndex, RelicDef } from '../types';
import type { Stats } from './BuffSystem';
import { MetaStore } from './MetaStore';
import { rollRarity } from './MutationSystem';

/**
 * 聖物：被動道具，最多 4 格（大坩堝升級最多 6 格）。
 * 數值類在 applyStats() 套用；觸發類用各種 on* 鉤子。
 */
export class RelicSystem extends Phaser.Events.EventEmitter {
  owned: RelicDef[] = [];
  private killCount = 0;

  constructor(private game: GameScene) {
    super();
  }

  get maxSlots(): number {
    return 4 + MetaStore.level('relic_slot');
  }

  get full(): boolean {
    return this.owned.length >= this.maxSlots;
  }

  has(id: string): boolean {
    return this.owned.some((r) => r.id === id);
  }

  add(r: RelicDef): void {
    this.owned.push(r);
    this.game.buffs.recompute();
    this.emit('changed');
  }

  replace(oldId: string, r: RelicDef): void {
    this.owned = this.owned.filter((x) => x.id !== oldId);
    this.add(r);
  }

  /** 依稀有度權重，從已解鎖且還沒擁有的聖物抽一個 */
  roll(weights: readonly number[], minRarity: RarityIndex = 0): RelicDef | undefined {
    const pool = RELICS.filter((r) => MetaStore.relicUnlocked(r.id) && !this.has(r.id));
    if (!pool.length) return undefined;
    for (let tries = 0; tries < 8; tries++) {
      const rar = Math.max(minRarity, rollRarity(weights)) as RarityIndex;
      const sub = pool.filter((r) => r.rarity === rar);
      if (sub.length) return sub[Math.floor(Math.random() * sub.length)];
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  applyStats(s: Stats): void {
    const h = (id: string) => this.has(id);
    if (h('catnip')) s.speed *= 1.12;
    if (h('old_watch')) s.dashCooldown *= 0.85;
    if (h('chew_stick')) s.damage *= 1.12;
    if (h('yarn_ball')) s.pickupRadius *= 1.4;
    if (h('bell_collar')) s.critChance += 0.08;
    if (h('frost_bell')) s.freezeChance = Math.min(0.6, s.freezeChance + 0.08);
    if (h('storm_bell')) s.chainChance = Math.min(0.7, s.chainChance + 0.1);
    if (h('twin_tail')) {
      s.shots += 1;
      s.damage *= 0.85;
    }
    if (h('glass_cannon')) {
      s.damage *= 1.8;
      s.maxHp = Math.max(1, Math.floor(s.maxHp / 2));
    }
    if (h('overclock')) s.fireInterval /= 1.45;
  }

  get coinMul(): number {
    return (this.has('lucky_cat') ? 1.5 : 1) * (this.has('greed_crown') ? 2 : 1);
  }

  get enemyHpMul(): number {
    return this.has('greed_crown') ? 1.15 : 1;
  }

  get enemyDamageAdd(): number {
    return this.has('overclock') ? 1 : 0;
  }

  get skillCdMul(): number {
    return (this.has('sand_shard') ? 0.75 : 1) * (this.has('star_grimoire') ? 0.8 : 1);
  }

  get skillDmgMul(): number {
    return this.has('star_grimoire') ? 2 : 1;
  }

  get riftAdd(): number {
    return this.has('time_compass') ? 0.12 : 0;
  }

  get fissionAdd(): number {
    return this.has('cat_eye') ? 0.08 : 0;
  }

  get elementMul(): number {
    return this.has('sage_ladle') ? 1.3 : 1;
  }

  /** 煉金手套：25% 品質 +1 */
  qualityBonus(): number {
    return this.has('alchemy_glove') && Math.random() < 0.25 ? 1 : 0;
  }

  /** 靈巧鬍鬚：回傳 true 代表閃避 */
  dodge(): boolean {
    return this.has('nimble_whisker') && Math.random() < 0.15;
  }

  onKill(e: Enemy): void {
    const g = this.game;
    if (this.has('oven_mitt') && Math.random() < 0.2) {
      const x = e.x;
      const y = e.y;
      g.effects.delay(0.05, () => g.effects.explode(x, y, 70, g.buffs.stats.damage * 1.5, 0xff8a3d));
    }
    if (this.has('vampire_fang')) {
      this.killCount++;
      if (this.killCount % 30 === 0) g.heal(1);
    }
  }

  onRoomClear(): void {
    if (this.has('dried_fish') && Math.random() < 0.35) this.game.heal(1);
  }

  onDash(x: number, y: number): void {
    if (!this.has('frozen_watch')) return;
    this.game.effects.addZone({
      x, y, radius: 150, duration: 1.5, color: 0x9fe3ff,
      onFrame: (inside) => inside.forEach((e) => e.applySlow(0.7, 0.2)),
    });
  }

  /** 喝藥後：煉金之心 */
  onDrink(): void {
    if (!this.has('alchemist_heart')) return;
    const ids = ['core_J', 'core_I', 'core_S', 'core_F', 'core_T'];
    this.game.buffs.addModule(ids[Math.floor(Math.random() * ids.length)], 1);
  }
}

export const relicById = (id: string) => RELIC_MAP[id];
