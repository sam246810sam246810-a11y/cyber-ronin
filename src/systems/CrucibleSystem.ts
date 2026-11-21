import Phaser from 'phaser';
import { FISSION } from '../config';
import { MYTHICS, RECIPES, mythicKey, potionQuality, recipeKey } from '../data';
import type { Brew, Material, RarityIndex } from '../types';
import { pick } from '../utils';
import { CodexStore } from './CodexStore';
import type { MutationSystem } from './MutationSystem';

export type CrucibleState = 'empty' | 'filling' | 'full' | 'brewing';

/**
 * 3 格坩堝。放滿後按「煉成」→ 產生藥水（直接喝下）。
 * 藥水品質由素材稀有度決定；煉成時有機率「裂變」成神話藥水，素材越稀有機率越高。
 */
export class CrucibleSystem extends Phaser.Events.EventEmitter {
  static readonly SLOTS = 3;
  static readonly BREW_TIME = 0.3;

  slots: (Material | null)[] = [null, null, null];
  private brewTimer = 0;
  readonly discoveredThisRun: string[] = [];
  fissions = 0;
  /** 角色帶來的裂變加成 */
  bonusChance = 0;
  forceFission = false;
  /** 祈願泉祝福等額外品質（由 GameScene 提供，取用後歸零） */
  qualityBonusProvider: () => number = () => 0;
  /** 聖物等動態裂變加成 */
  extraChance: () => number = () => 0;

  constructor(private mutations: MutationSystem) {
    super();
  }

  get state(): CrucibleState {
    if (this.brewTimer > 0) return 'brewing';
    const n = this.filled;
    if (n === 0) return 'empty';
    return n === CrucibleSystem.SLOTS ? 'full' : 'filling';
  }

  get filled(): number {
    return this.slots.filter(Boolean).length;
  }

  /** 目前坩堝內容的裂變率 */
  get fissionChance(): number {
    const mats = this.slots.filter(Boolean) as Material[];
    const fromMats = mats.reduce((s, m) => s + FISSION.perMaterial[m.r], 0);
    return Math.max(0, Math.min(FISSION.maxChance,
      FISSION.baseChance + fromMats + this.mutations.value('catalyst') / 100 + this.bonusChance + this.extraChance()));
  }

  get canAccept(): boolean {
    return this.state !== 'brewing' && this.filled < CrucibleSystem.SLOTS;
  }

  get canBrew(): boolean {
    return this.state === 'full';
  }

  add(m: Material): boolean {
    if (!this.canAccept) return false;
    this.slots[this.slots.indexOf(null)] = m;
    this.emit('changed');
    return true;
  }

  discard(index: number): void {
    if (this.state === 'brewing' || !this.slots[index]) return;
    this.slots[index] = null;
    this.emit('changed');
  }

  brew(): Brew | undefined {
    if (!this.canBrew) return undefined;
    const mats = [...this.slots] as Material[];
    const key = recipeKey(mats.map((m) => m.el));
    const recipe = RECIPES[key];
    const quality = Math.min(3, potionQuality(mats) + this.qualityBonusProvider()) as RarityIndex;
    const chance = this.fissionChance;
    this.slots = [null, null, null];
    this.brewTimer = CrucibleSystem.BREW_TIME;

    let result: Brew = { kind: 'recipe', recipe, quality, mats };
    if (this.forceFission || Math.random() < chance) {
      this.forceFission = false;
      this.fissions++;
      result = { kind: 'mythic', mythic: pick(MYTHICS), from: recipe, quality, mats };
    }
    const newKeys: string[] = [];
    if (CodexStore.discover(key)) newKeys.push(key);
    if (result.kind === 'mythic' && CodexStore.discover(mythicKey(result.mythic.id))) newKeys.push(mythicKey(result.mythic.id));
    this.discoveredThisRun.push(...newKeys);
    this.emit('brewed', result, newKeys);
    this.emit('changed');
    return result;
  }

  update(dt: number): void {
    if (this.brewTimer > 0) {
      this.brewTimer -= dt;
      if (this.brewTimer <= 0) {
        this.brewTimer = 0;
        this.emit('changed');
      }
    }
  }
}
