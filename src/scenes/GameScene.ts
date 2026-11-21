import Phaser from 'phaser';
import {
  ARENA, ARENA_BOTTOM, ARENA_RIGHT, COLORS, CONTROLS_Y, DEPTH, DROP_RARITY, GAME_H, GAME_W, MYTHIC, PLAYER, RARITY,
} from '../config';
import { ELEMENT_IDS, ELEMENT_MAP, MYTHICS, hexToInt } from '../data';
import type { Enemy } from '../entities/Enemy';
import { Pickup } from '../entities/Pickup';
import { Player } from '../entities/Player';
import { moduleLabel } from '../potions/passives';
import { BuffSystem } from '../systems/BuffSystem';
import { CrucibleSystem } from '../systems/CrucibleSystem';
import { EffectSystem } from '../systems/EffectSystem';
import { FxSystem } from '../systems/FxSystem';
import { InputSystem } from '../systems/InputSystem';
import { MutationSystem, rollRarity } from '../systems/MutationSystem';
import { ProgressStore } from '../systems/ProgressStore';
import { ProjectileSystem } from '../systems/ProjectileSystem';
import { TelegraphSystem } from '../systems/TelegraphSystem';
import { WaveSystem } from '../systems/WaveSystem';
import { HazardSystem } from '../systems/HazardSystem';
import { EventSystem } from '../systems/EventSystem';
import { TutorialSystem } from '../systems/TutorialSystem';
import { Sound } from '../systems/SoundSystem';
import type { Brew, CharacterDef, ElementId, Material, RarityIndex, RegionDef, RegionTheme } from '../types';
import { createRoundButton, type RoundButton } from '../ui/ActionButtons';
import { CrucibleBar } from '../ui/CrucibleBar';
import { HUD } from '../ui/HUD';
import { pick } from '../utils';
import type { ResultData } from './ResultScene';

export interface RunSummary {
  character: string;
  region: string;
  drinks: number;
  elements: Record<ElementId, number>;
  passives: { name: string; stacks: number; color: string; mythic: boolean }[];
  mutations: { name: string; icon: string; value: string }[];
  stats: [string, string][];
}

export class GameScene extends Phaser.Scene {
  player!: Player;
  enemies: Enemy[] = [];
  pickups: Pickup[] = [];
  character!: CharacterDef;

  telegraphs!: TelegraphSystem;
  projectiles!: ProjectileSystem;
  effects!: EffectSystem;
  buffs!: BuffSystem;
  crucible!: CrucibleSystem;
  mutations!: MutationSystem;
  waves!: WaveSystem;
  fx!: FxSystem;
  input2!: InputSystem;
  hazards!: HazardSystem;
  /** 關卡內事件（寶箱 / 祈願泉 / 商人）；Phaser 已佔用 events 這個名字 */
  encounters!: EventSystem;
  tutorial!: TutorialSystem;
  private arenaGfx?: Phaser.GameObjects.Graphics;
  /** 打擊停頓剩餘秒數 */
  private stopTimer = 0;
  private pendingEventWave = 0;

  private hud!: HUD;
  private dashBtn!: RoundButton;
  private brewBtn!: RoundButton;
  private fireTimer = 0;
  runTime = 0;
  kills = 0;
  private ended = false;
  /** 本局新解鎖的角色 */
  private unlocks: CharacterDef[] = [];

  constructor() {
    super('Game');
  }

  create(): void {
    this.enemies = [];
    this.pickups = [];
    this.runTime = 0;
    this.kills = 0;
    this.ended = false;
    this.fireTimer = 0;
    this.unlocks = [];
    this.character = ProgressStore.selected;

    this.stopTimer = 0;
    this.pendingEventWave = 0;
    this.arenaGfx = undefined;

    this.fx = new FxSystem(this);
    this.telegraphs = new TelegraphSystem(this);
    this.projectiles = new ProjectileSystem(this);
    this.mutations = new MutationSystem();
    this.crucible = new CrucibleSystem(this.mutations);
    this.crucible.bonusChance = this.character.fissionBonus ?? 0;
    this.effects = new EffectSystem(this);
    this.waves = new WaveSystem(this);
    this.hazards = new HazardSystem(this);
    this.encounters = new EventSystem(this);
    this.crucible.qualityBonusProvider = () => this.encounters.takeQualityBonus();
    this.player = new Player(this, GAME_W / 2, ARENA.y + ARENA.h * 0.7, hexToInt(this.character.color));
    this.buffs = new BuffSystem(this, this.character);
    this.player.hp = this.player.maxHp = this.character.stats.hp;
    this.buffs.recompute();
    this.character.startModules?.forEach((m) => this.buffs.addModule(m.id, m.n));

    // UI
    this.add.rectangle(GAME_W / 2, (CONTROLS_Y + GAME_H) / 2, GAME_W, GAME_H - CONTROLS_Y, 0x0b0910).setDepth(DEPTH.ui - 2);
    this.hud = new HUD(this, this.player.maxHp, () => this.openPause());
    new CrucibleBar(this, this.crucible, this.buffs, () => (this.input2.brewPressed = true));
    this.input2 = new InputSystem(this);
    this.dashBtn = createRoundButton(this, 622, 1098, 68, '衝刺', 0x3a7bd5, () => (this.input2.dashPressed = true));
    this.brewBtn = createRoundButton(this, 474, 1186, 62, '煉成', 0x9a4fd0, () => (this.input2.brewPressed = true));
    this.add.text(150, GAME_H - 34, '移動', { fontFamily: 'sans-serif', fontSize: '18px', color: COLORS.textDim })
      .setOrigin(0.5).setDepth(DEPTH.ui);

    this.buffs.on('changed', (twice: boolean) => {
      if (twice) this.fx.floatText(this.player.x, this.player.y - 70, '雙倍釀造！', '#ffd166');
    });

    this.events.on('resume', () => this.input2.consume());
    this.tutorial = new TutorialSystem(this);
    this.events.on('telegraph-warning', () => this.tutorial.notify('telegraph'));
    this.waves.start();

    (window as unknown as { __game?: GameScene }).__game = this;
  }

  private drawArena(theme: RegionTheme): void {
    const col = (h: string) => hexToInt(h);
    this.cameras.main.setBackgroundColor(theme.bg);
    this.arenaGfx?.destroy();
    const g = this.arenaGfx = this.add.graphics().setDepth(DEPTH.floor);
    g.fillStyle(col(theme.floor), 1).fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
    const tile = 56;
    for (let y = ARENA.y; y < ARENA_BOTTOM; y += tile) {
      for (let x = ARENA.x; x < ARENA_RIGHT; x += tile) {
        if (((x - ARENA.x) / tile + (y - ARENA.y) / tile) % 2 === 0) {
          g.fillStyle(col(theme.tile), 1).fillRect(x, y, Math.min(tile, ARENA_RIGHT - x), Math.min(tile, ARENA_BOTTOM - y));
        }
      }
    }
    g.lineStyle(8, col(theme.wall), 1).strokeRect(ARENA.x - 4, ARENA.y - 4, ARENA.w + 8, ARENA.h + 8);
    const corners = [[ARENA.x + 20, ARENA.y + 20], [ARENA_RIGHT - 20, ARENA.y + 20], [ARENA.x + 20, ARENA_BOTTOM - 20], [ARENA_RIGHT - 20, ARENA_BOTTOM - 20]];
    corners.forEach(([x, y]) => {
      g.fillStyle(col(theme.deco), 0.8).fillCircle(x, y, 26);
      g.fillStyle(col(theme.decoLight), 0.8).fillCircle(x - 6, y - 6, 12);
    });
    // 場地裝飾點
    for (let i = 0; i < 14; i++) {
      const x = ARENA.x + 40 + ((i * 197) % (ARENA.w - 80));
      const y = ARENA.y + 40 + ((i * 331) % (ARENA.h - 80));
      g.fillStyle(col(theme.decoLight), 0.08).fillCircle(x, y, 10 + (i % 3) * 6);
    }
  }

  update(_time: number, deltaMs: number): void {
    if (this.ended) return;
    const realDt = Math.min(deltaMs / 1000, 1 / 20);
    if (this.stopTimer > 0) {
      this.stopTimer -= realDt;
      return;
    }
    const dt = realDt;
    const phase = this.waves.phase;
    if (phase !== 'cards') this.runTime += dt;

    const actions = this.input2.consume();
    const move = this.input2.move;
    if (actions.dash && this.player.tryDash(move.x, move.y)) Sound.play('dash');
    if (actions.brew) this.brewAndDrink();

    this.player.update(dt, move.x, move.y);
    this.crucible.update(dt);
    this.autoFire(dt);

    this.enemies.forEach((e) => e.update(dt));
    this.separateEnemies();
    this.enemies = this.enemies.filter((e) => e.alive);
    this.checkContact();

    this.projectiles.update(dt, this.enemies);
    this.effects.update(dt);
    this.buffs.update(dt, phase === 'combat' || phase === 'boss');
    this.telegraphs.update(dt);
    this.updatePickups(dt);
    this.hazards.update(dt);
    this.encounters.update(dt);
    this.tutorial.update(dt);
    this.waves.update(dt);

    this.dashBtn.setCooldown(this.player.dashCooldownRatio);
    this.brewBtn.setEnabled(this.crucible.canBrew);
    const boss = this.waves.boss;
    this.hud.update(this.player, this.waves.label, this.runTime,
      boss ? { hp: boss.hp, maxHp: boss.maxHp, name: boss.def.name, alive: boss.alive } : undefined);
  }

  private autoFire(dt: number): void {
    this.fireTimer -= dt;
    if (this.fireTimer > 0 || this.player.state === 'dead') return;
    const p = this.player;
    const st = this.buffs.stats;
    const target = this.effects.nearestEnemy(p.x, p.y, PLAYER.autoAimRange);
    if (!target) return;
    this.fireTimer = st.fireInterval;
    const a = Math.atan2(target.y - p.y, target.x - p.x);
    const n = Math.max(1, Math.round(st.shots));
    for (let i = 0; i < n; i++) {
      this.projectiles.fireFriendly(p.x, p.y, a + (i - (n - 1) / 2) * 0.16, PLAYER.bulletSpeed, st.damage, {
        poison: st.poisonDps > 0 ? { dps: st.poisonDps, time: 2 } : undefined,
        slow: st.slow > 0 ? { factor: st.slow, time: 1 } : undefined,
        pierce: st.pierce,
        bounces: st.bounces,
        splash: st.splash,
        freezeChance: st.freezeChance,
        critChance: st.critChance,
        triggerPassives: true,
        color: st.splash ? 0xf0b0ff : st.critChance > 0.2 ? 0xffe14d : st.poisonDps > 0 ? 0xc8ffa8 : undefined,
      });
    }
    this.buffs.onShot();
    Sound.play('shoot');
  }

  /** 打擊停頓 */
  hitStop(sec: number): void {
    this.stopTimer = Math.max(this.stopTimer, sec);
  }

  heal(n: number): void {
    const p = this.player;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + n);
    if (p.hp > before) {
      this.fx.floatText(p.x, p.y - 50, `+${p.hp - before} ♥`, '#ff6b8a', 24);
      this.fx.burst(p.x, p.y, 60, 0xff6b8a);
    }
  }

  /** 煉成並立刻喝下 */
  private brewAndDrink(): void {
    if (this.player.state === 'dead') return;
    const brew = this.crucible.brew();
    if (!brew) {
      if (this.crucible.filled < 3) this.fx.floatText(this.player.x, this.player.y - 40, '要放滿 3 格', '#9a90a8', 18);
      return;
    }
    this.buffs.drink(brew);
    this.tutorial.notify('drink');
    if (brew.kind === 'mythic') {
      this.unlocks.push(...ProgressStore.record({ fission: true }));
      Sound.play('fission');
      this.hitStop(0.15);
    } else {
      Sound.play('brew');
    }
    this.announceBrew(brew);
  }

  private announceBrew(brew: Brew): void {
    const p = this.player;
    if (brew.kind === 'mythic') {
      const M = brew.mythic;
      const color = hexToInt(M.color);
      this.fx.burst(p.x, p.y, 160, color, 500);
      this.fx.burst(150, 920, 160, color, 500);
      this.cameras.main.flash(250, 255, 120, 140);
      this.cameras.main.shake(200, 0.006);
      this.hud.showToast(`裂變！【${MYTHIC.name}】${M.name}`, M.desc, MYTHIC.color);
    } else {
      const r = brew.recipe;
      const q = RARITY[brew.quality];
      this.fx.burst(p.x, p.y, 70 + brew.quality * 25, hexToInt(q.color), 350);
      this.fx.burst(150, 920, 120, hexToInt(r.color));
      if (brew.quality >= 2) this.cameras.main.flash(150, 180, 140, 255);
      this.hud.showToast(`【${q.name}】${r.name}`, r.desc.replace('\n', '　'), brew.quality > 0 ? q.color : undefined);
    }
  }

  /** 讓敵人不要完全疊在一起 */
  private separateEnemies(): void {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive || a.airborne) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive || b.airborne) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = (a.radius + b.radius) * 0.85;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = (min - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          a.nudge(-nx * push, -ny * push);
          b.nudge(nx * push, ny * push);
        }
      }
    }
  }

  private checkContact(): void {
    const p = this.player;
    if (p.invulnerable) return;
    for (const e of this.enemies) {
      if (!e.alive || e.airborne || e.frozen) continue;
      const rr = e.radius + p.radius * 0.7;
      if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= rr * rr) {
        this.hurtPlayer(e.def.contactDamage);
        return;
      }
    }
  }

  private updatePickups(dt: number): void {
    const p = this.player;
    const blocked = !this.crucible.canAccept;
    for (const pk of this.pickups) {
      pk.update(dt, blocked);
      if (!pk.alive) continue;
      if (!blocked && (pk.x - p.x) ** 2 + (pk.y - p.y) ** 2 <= (this.buffs.stats.pickupRadius + p.radius) ** 2) {
        if (this.crucible.add(pk.mat)) {
          Sound.play('pickup', pk.mat.r);
          this.fx.sparks(pk.x, pk.y, hexToInt(RARITY[pk.mat.r].color), 4 + pk.mat.r * 3);
          pk.destroy();
        }
      }
    }
    this.pickups = this.pickups.filter((pk) => pk.alive);
  }

  // ---- 給實體 / 系統呼叫的 API ----

  addEnemy(e: Enemy): void {
    this.enemies.push(e);
  }

  hurtPlayer(amount: number): void {
    if (this.ended) return;
    if (!this.player.hurt(amount)) return;
    Sound.play('hurt');
    this.hitStop(0.08);
    this.cameras.main.shake(140, 0.01);
    this.cameras.main.flash(120, 120, 0, 0);
    if (navigator.vibrate) {
      try { navigator.vibrate(60); } catch { /* ignore */ }
    }
    const blast = this.character.hurtBlast;
    if (blast) {
      this.effects.explode(this.player.x, this.player.y, blast.radius, blast.damage * (1 + this.buffs.elements.F * 0.05),
        0xff8a3d, { knockback: 80 });
    }
    if (this.player.hp <= 0) this.onDefeat();
  }

  onEnemyKilled(e: Enemy): void {
    this.kills++;
    const color = hexToInt(e.def.color);
    this.fx.burst(e.x, e.y, e.radius * 1.6, color, 200);
    this.fx.shatter(e.x, e.y, color, e.radius, e.elite || e.def.boss ? 16 : 7);
    Sound.play('kill');
    if (e.elite || e.def.boss) {
      this.hitStop(e.def.boss ? 0.3 : 0.07);
      this.cameras.main.shake(e.def.boss ? 400 : 120, e.def.boss ? 0.012 : 0.005);
    }
    this.buffs.onKill(e);
    if (e.def.boss) return;
    if (e.elite || Math.random() < this.buffs.stats.dropChance) this.dropMaterial(e.x, e.y, undefined, e.elite);
  }

  /** 掉落素材：元素隨機，稀有度依波數、精英、鑑寶卡決定 */
  dropMaterial(x: number, y: number, mat?: Material, elite = false): void {
    if (!mat) {
      const base = elite ? DROP_RARITY.elite : DROP_RARITY.normal;
      const w = base.map((b, i) => {
        let v = b + (elite ? 0 : DROP_RARITY.perWave[i] * Math.max(0, this.waves.wave - 1));
        if (i > 0) v *= this.buffs.stats.fortune;
        return Math.max(0.1, v);
      });
      mat = { el: pick(ELEMENT_IDS), r: rollRarity(w) };
    }
    this.pickups.push(new Pickup(this, mat, x, y));
  }

  showBanner(text: string): void {
    this.hud.showBanner(text);
  }

  onWaveCleared(globalWave: number, waveInRegion: number): void {
    this.projectiles.clearEnemyBullets();
    this.unlocks.push(...ProgressStore.record({ wave: globalWave + 1 }));
    this.pendingEventWave = waveInRegion;
    this.time.delayedCall(700, () => this.openCardSelect(waveInRegion));
  }

  onBossCleared(region: RegionDef): void {
    this.unlocks.push(...ProgressStore.record({ bossKill: true }));
    this.projectiles.clearEnemyBullets();
    this.hazards.clear();
    this.showBanner(`${region.name} 突破！`);
    for (let i = 0; i < 3; i++) this.dropMaterial(GAME_W / 2 - 80 + i * 80, ARENA.y + ARENA.h / 2, undefined, true);
    this.time.delayedCall(1800, () => this.openCardSelect(undefined, 1));
  }

  /** 進入新區域：換場景、回血 */
  onRegionEnter(region: RegionDef, index: number): void {
    this.drawArena(region.theme);
    if (index > 0) {
      this.hazards.clear();
      this.encounters.clear();
      this.heal(3);
    }
  }

  openCardSelect(wave?: number, minRarity: RarityIndex = 0): void {
    if (this.ended) return;
    const offers = this.mutations.roll(this.waves.globalWave, minRarity);
    this.scene.launch('CardSelect', {
      wave,
      region: this.waves.region.name,
      offers: offers.map((o) => ({ ...o, owned: this.mutations.value(o.def.id) })),
      onPick: (index: number) => {
        const o = offers[index];
        Sound.play('card');
        this.mutations.add(o.def.id, RARITY[o.rarity].mult);
        this.buffs.recompute();
        this.crucible.emit('changed');
        this.buffs.emit('changed', false);
        this.scene.resume();
        if (this.waves.phase === 'cards') {
          this.waves.next();
          if (this.pendingEventWave) this.encounters.maybeSpawn(this.pendingEventWave);
          this.pendingEventWave = 0;
        }
      },
    });
    this.scene.pause();
  }

  openPause(): void {
    if (this.ended) return;
    this.scene.launch('Pause', this.summary());
    this.scene.pause();
  }

  /** 暫停與結算畫面用的本局摘要 */
  summary(): RunSummary {
    const passives: RunSummary['passives'] = [];
    for (const [id, n] of this.buffs.stacks) {
      if (id === 'tri_damage' || n <= 0) continue;
      const l = moduleLabel(id, ELEMENT_MAP, MYTHICS);
      passives.push({ name: l.name, stacks: n, color: l.color, mythic: l.mythic });
    }
    passives.sort((a, b) => Number(b.mythic) - Number(a.mythic) || b.stacks - a.stacks);
    const st = this.buffs.stats;
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    return {
      character: this.character.name,
      region: this.waves.label,
      drinks: this.buffs.drinks,
      elements: { ...this.buffs.elements },
      passives,
      mutations: this.mutations.owned().map((m) => ({
        name: m.def.name, icon: m.def.icon, value: `${Math.round(m.value * 10) / 10}${m.def.unit}`,
      })),
      stats: [
        ['最大血量', String(st.maxHp)],
        ['攻擊間隔', `${st.fireInterval.toFixed(2)} 秒`],
        ['傷害', st.damage.toFixed(2)],
        ['暴擊率', pct(st.critChance)],
        ['衝刺冷卻', `${st.dashCooldown.toFixed(2)} 秒`],
        ['移速', String(Math.round(st.speed))],
        ['命中附毒', `${st.poisonDps.toFixed(2)}/秒`],
        ['命中減速', pct(st.slow)],
        ['冰凍率', pct(st.freezeChance)],
        ['爆炸率', pct(st.explodeChance)],
        ['連鎖率', pct(st.chainChance)],
        ['彈射/穿透', `${st.bounces} / ${st.pierce}`],
      ],
    };
  }

  private onDefeat(): void {
    this.waves.phase = 'defeat';
    this.unlocks.push(...ProgressStore.record({ wave: this.waves.wave }));
    this.endRun(false);
  }

  onVictory(): void {
    this.unlocks.push(...ProgressStore.record({ bossKill: true }));
    this.endRun(true);
  }

  private endRun(victory: boolean): void {
    if (this.ended) return;
    this.ended = true;
    this.telegraphs.clear();
    this.tutorial.finish();
    const data: ResultData = {
      victory,
      time: this.runTime,
      kills: this.kills,
      wave: this.waves.wave,
      discoveries: [...this.crucible.discoveredThisRun],
      fissions: this.crucible.fissions,
      unlocks: this.unlocks.map((c) => c.name),
      ...this.summary(),
    };
    this.hud.showBanner(victory ? '勝利！' : '倒下了…');
    this.time.delayedCall(1300, () => this.scene.start('Result', data));
  }
}
