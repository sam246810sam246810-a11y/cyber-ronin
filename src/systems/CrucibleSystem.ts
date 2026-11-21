import Phaser from 'phaser';
import { FISSION } from '../config';
import { LEGENDARIES, RECIPES, legendaryKey, recipeKey } from '../data';
import type { Brew, IngredientId } from '../types';
import { pick } from '../utils';
import { CodexStore } from './CodexStore';
import type { MutationSystem } from './MutationSystem';

export type CrucibleState = 'empty' | 'filling' | 'full' | 'brewing';

/**
 * 3 格坩堝。放滿後按「煉成」→ 產生藥水（直接喝下）。
 * 煉成時有機率「裂變」成傳說藥水。
 * Empty → Filling → Full →（煉成）→ Brewing → Empty
 */
export class CrucibleSystem extends Phaser.Events.EventEmitter {
  static readonly SLOTS = 3;
  static readonly BREW_TIME = 0.3;

  slots: (IngredientId | null)[] = [null, null, null];
  private brewTimer = 0;
  /** 本局新發現的圖鑑 key（配方或 L:傳說） */
  readonly discoveredThisRun: string[] = [];
  /** debug：下次煉成必定裂變 */
  forceFission = false;

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

  get fissionChance(): number {
    return Math.min(FISSION.maxChance, FISSION.baseChance + FISSION.perCatalyst * this.mutations.stacks('catalyst'));
  }

  get canAccept(): boolean {
    return this.state !== 'brewing' && this.filled < CrucibleSystem.SLOTS;
  }

  get canBrew(): boolean {
    return this.state === 'full';
  }

  add(id: IngredientId): boolean {
    if (!this.canAccept) return false;
    this.slots[this.slots.indexOf(null)] = id;
    this.emit('changed');
    return true;
  }

  discard(index: number): void {
    if (this.state === 'brewing' || !this.slots[index]) return;
    this.slots[index] = null;
    this.emit('changed');
  }

  /** 煉成，回傳煉出的藥水（由呼叫端喝下） */
  brew(): Brew | undefined {
    if (!this.canBrew) return undefined;
    const key = recipeKey(this.slots as IngredientId[]);
    const recipe = RECIPES[key];
    this.slots = [null, null, null];
    this.brewTimer = CrucibleSystem.BREW_TIME;

    let result: Brew = { kind: 'recipe', recipe };
    if (this.forceFission || Math.random() < this.fissionChance) {
      this.forceFission = false;
      result = { kind: 'legendary', legendary: pick(LEGENDARIES), from: recipe };
    }
    const newKeys: string[] = [];
    if (CodexStore.discover(key)) newKeys.push(key);
    if (result.kind === 'legendary' && CodexStore.discover(legendaryKey(result.legendary.id))) {
      newKeys.push(legendaryKey(result.legendary.id));
    }
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
