import Phaser from 'phaser';
import { POTION } from '../config';
import { RECIPES, recipeKey } from '../data';
import type { IngredientId, RecipeDef } from '../types';
import { CodexStore } from './CodexStore';
import type { MutationSystem } from './MutationSystem';

export type CrucibleState = 'empty' | 'filling' | 'full' | 'brewing';

/**
 * 3 格坩堝 + 藥水架。
 * Empty → Filling → Full →（按煉成）→ Brewing → Empty
 * 手上有藥水時不能煉成。
 */
export class CrucibleSystem extends Phaser.Events.EventEmitter {
  static readonly SLOTS = 3;
  static readonly BREW_TIME = 0.3;

  slots: (IngredientId | null)[] = [null, null, null];
  rack: RecipeDef[] = [];
  private brewTimer = 0;
  /** 本局新發現的配方 */
  readonly discoveredThisRun: string[] = [];

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

  get rackCapacity(): number {
    return POTION.rackBase + (this.mutations.stacks('double_brew') > 0 ? 1 : 0);
  }

  get canAccept(): boolean {
    return this.state !== 'brewing' && this.filled < CrucibleSystem.SLOTS;
  }

  get canBrew(): boolean {
    return this.state === 'full' && this.rack.length === 0;
  }

  add(id: IngredientId): boolean {
    if (!this.canAccept) return false;
    const i = this.slots.indexOf(null);
    this.slots[i] = id;
    this.emit('changed');
    return true;
  }

  discard(index: number): void {
    if (this.state === 'brewing' || !this.slots[index]) return;
    this.slots[index] = null;
    this.emit('changed');
  }

  brew(): boolean {
    if (!this.canBrew) return false;
    const key = recipeKey(this.slots as IngredientId[]);
    const recipe = RECIPES[key];
    this.brewTimer = CrucibleSystem.BREW_TIME;
    this.emit('brewing', recipe);
    // 立即結算，動畫只是表演
    this.slots = [null, null, null];
    this.rack.push(recipe);
    const chance = Math.min(1, 0.2 * this.mutations.stacks('double_brew'));
    const doubled = chance > 0 && Math.random() < chance && this.rack.length < this.rackCapacity;
    if (doubled) this.rack.push(recipe);
    if (CodexStore.discover(key)) {
      this.discoveredThisRun.push(key);
      this.emit('discovered', recipe);
    }
    this.emit('brewed', recipe, doubled);
    this.emit('changed');
    return true;
  }

  takePotion(): RecipeDef | undefined {
    const r = this.rack.shift();
    if (r) this.emit('changed');
    return r;
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
