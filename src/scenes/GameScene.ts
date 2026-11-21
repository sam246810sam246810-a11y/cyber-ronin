import Phaser from 'phaser';
import {
  ARENA, ARENA_BOTTOM, ARENA_RIGHT, COLORS, CONTROLS_Y, DEPTH, GAME_H, GAME_W, PLAYER,
} from '../config';
import { INGREDIENTS } from '../data';
import type { Enemy } from '../entities/Enemy';
import { Pickup } from '../entities/Pickup';
import { Player } from '../entities/Player';
import { CrucibleSystem } from '../systems/CrucibleSystem';
import { FxSystem } from '../systems/FxSystem';
import { InputSystem } from '../systems/InputSystem';
import { MutationSystem } from '../systems/MutationSystem';
import { EffectSystem } from '../systems/EffectSystem';
import { BuffSystem } from '../systems/BuffSystem';
import { ProjectileSystem } from '../systems/ProjectileSystem';
import { TelegraphSystem } from '../systems/TelegraphSystem';
import { WaveSystem } from '../systems/WaveSystem';
import type { Brew, IngredientId } from '../types';
import { clamp } from '../utils';
import { createRoundButton, type RoundButton } from '../ui/ActionButtons';
import { CrucibleBar } from '../ui/CrucibleBar';
import { HUD } from '../ui/HUD';
import { LEGENDARIES, RECIPES, hexToInt } from '../data';
import type { ResultData } from './ResultScene';

export interface RunSummary {
  drinks: number;
  elements: Record<IngredientId, number>;
  passives: { name: string; stacks: number; color: string; legendary: boolean }[];
  mutations: { name: string; icon: string; stacks: number }[];
  stats: [string, string][];
}

export class GameScene extends Phaser.Scene {
  player!: Player;
  enemies: Enemy[] = [];
  pickups: Pickup[] = [];

  telegraphs!: TelegraphSystem;
  projectiles!: ProjectileSystem;
  effects!: EffectSystem;
  buffs!: BuffSystem;
  crucible!: CrucibleSystem;
  mutations!: MutationSystem;
  waves!: WaveSystem;
  fx!: FxSystem;
  input2!: InputSystem;

  private hud!: HUD;
  private dashBtn!: RoundButton;
  private brewBtn!: RoundButton;
  private fireTimer = 0;
  runTime = 0;
  kills = 0;
  private ended = false;

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

    this.drawArena();

    this.fx = new FxSystem(this);
    this.telegraphs = new TelegraphSystem(this);
    this.projectiles = new ProjectileSystem(this);
    this.mutations = new MutationSystem();
    this.crucible = new CrucibleSystem(this.mutations);
    this.effects = new EffectSystem(this);
    this.waves = new WaveSystem(this);
    this.player = new Player(this, GAME_W / 2, ARENA.y + ARENA.h * 0.7);
    this.buffs = new BuffSystem(this);
    this.buffs.recompute();

    // UI
    this.add.rectangle(GAME_W / 2, (CONTROLS_Y + GAME_H) / 2, GAME_W, GAME_H - CONTROLS_Y, 0x0b0910).setDepth(DEPTH.ui - 2);
    this.hud = new HUD(this, PLAYER.hp, () => this.openPause());
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
    this.waves.start();

    // 給測試與 debug 面板使用
    (window as unknown as { __game?: GameScene }).__game = this;
    this.game.events.emit('game-scene-ready', this);
  }

  private drawArena(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    const g = this.add.graphics().setDepth(DEPTH.floor);
    g.fillStyle(COLORS.floor, 1).fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
    const tile = 56;
    for (let y = ARENA.y; y < ARENA_BOTTOM; y += tile) {
      for (let x = ARENA.x; x < ARENA_RIGHT; x += tile) {
        if (((x - ARENA.x) / tile + (y - ARENA.y) / tile) % 2 === 0) {
          g.fillStyle(COLORS.floorTile, 1).fillRect(x, y, Math.min(tile, ARENA_RIGHT - x), Math.min(tile, ARENA_BOTTOM - y));
        }
      }
    }
    // 溫室邊框與花圃裝飾
    g.lineStyle(8, COLORS.wall, 1).strokeRect(ARENA.x - 4, ARENA.y - 4, ARENA.w + 8, ARENA.h + 8);
    g.lineStyle(2, 0x5a8a66, 0.4);
    for (let x = ARENA.x + ARENA.w / 4; x < ARENA_RIGHT; x += ARENA.w / 4) g.lineBetween(x, ARENA.y, x, ARENA.y + 10);
    const planters = [[ARENA.x + 20, ARENA.y + 20], [ARENA_RIGHT - 20, ARENA.y + 20], [ARENA.x + 20, ARENA_BOTTOM - 20], [ARENA_RIGHT - 20, ARENA_BOTTOM - 20]];
    planters.forEach(([x, y]) => {
      g.fillStyle(0x3a5a2a, 0.8).fillCircle(x, y, 26);
      g.fillStyle(0x6aa84f, 0.8).fillCircle(x - 6, y - 6, 12);
    });
  }

  update(_time: number, deltaMs: number): void {
    if (this.ended) return;
    const dt = Math.min(deltaMs / 1000, 1 / 20);
    const phase = this.waves.phase;
    if (phase !== 'cards') this.runTime += dt;

    const actions = this.input2.consume();
    const move = this.input2.move;
    if (actions.dash) this.dash(move.x, move.y);
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
    this.waves.update(dt);

    // UI
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
      const ang = a + (i - (n - 1) / 2) * 0.16;
      this.projectiles.fireFriendly(p.x, p.y, ang, PLAYER.bulletSpeed, st.damage, {
        poison: st.poisonDps > 0 ? { dps: st.poisonDps, time: 2 } : undefined,
        slow: st.slow > 0 ? { factor: st.slow, time: 1 } : undefined,
        pierce: st.pierce,
        bounces: st.bounces,
        splash: st.splash,
        freezeChance: st.freezeChance,
        triggerPassives: true,
        color: st.splash ? 0xf0b0ff : st.poisonDps > 0 ? 0xc8ffa8 : undefined,
      });
    }
    this.buffs.onShot();
  }

  private dash(mx: number, my: number): void {
    const p = this.player;
    const sx = p.x;
    const sy = p.y;
    if (!p.tryDash(mx, my)) return;
    const len = Math.hypot(mx, my) > 0.1 ? Math.hypot(mx, my) : 0;
    const a = len ? Math.atan2(my, mx) : p.facing;
    const ex = clamp(sx + Math.cos(a) * PLAYER.dashDistance, ARENA.x + p.radius, ARENA_RIGHT - p.radius);
    const ey = clamp(sy + Math.sin(a) * PLAYER.dashDistance, ARENA.y + p.radius, ARENA_BOTTOM - p.radius);
    this.buffs.onDash(sx, sy, ex, ey);
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
    this.announceBrew(brew);
  }

  private announceBrew(brew: Brew): void {
    const p = this.player;
    if (brew.kind === 'legendary') {
      const L = brew.legendary;
      const color = hexToInt(L.color);
      this.fx.burst(p.x, p.y, 160, color, 500);
      this.fx.burst(150, 920, 160, color, 500);
      this.cameras.main.flash(250, 255, 220, 120);
      this.cameras.main.shake(200, 0.006);
      this.hud.showToast(`裂變！${L.name}`, L.desc, true);
    } else {
      const r = brew.recipe;
      const color = hexToInt(r.color);
      this.fx.burst(p.x, p.y, 70, color, 350);
      this.fx.burst(150, 920, 120, color);
      const n = this.buffs.stacksOf(r.id);
      this.hud.showToast(`${r.name}${n > 1 ? ` Lv.${n}` : ''}`, r.desc, false);
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
        if (this.crucible.add(pk.id)) {
          this.fx.sparks(pk.x, pk.y, 0xffffff, 4);
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
    this.cameras.main.shake(140, 0.01);
    this.cameras.main.flash(120, 120, 0, 0);
    if (navigator.vibrate) {
      try { navigator.vibrate(60); } catch { /* ignore */ }
    }
    if (this.player.hp <= 0) {
      if (this.buffs.revives > 0) {
        this.buffs.revives--;
        this.player.revive(Math.ceil(this.player.maxHp / 2));
        this.fx.burst(this.player.x, this.player.y, 200, 0xff9f43, 600);
        this.effects.explode(this.player.x, this.player.y, 200, 5, 0xff9f43, { knockback: 120 });
        this.hud.showToast('不死鳥復活！', `剩餘復活次數 ${this.buffs.revives}`, true);
        this.projectiles.clearEnemyBullets();
        return;
      }
      this.onDefeat();
    }
  }

  onEnemyKilled(e: Enemy): void {
    this.kills++;
    this.fx.burst(e.x, e.y, e.radius * 1.6, hexToInt(e.def.color), 200);
    this.buffs.onKill(e);
    if (e.def.type === 'boss') return;
    if (e.elite || Math.random() < this.buffs.stats.dropChance) this.dropIngredient(e.x, e.y);
  }

  dropIngredient(x: number, y: number, id?: IngredientId): void {
    const total = INGREDIENTS.reduce((s, i) => s + i.weight, 0);
    if (!id) {
      let r = Math.random() * total;
      id = INGREDIENTS.find((i) => (r -= i.weight) < 0)?.id ?? 'J';
    }
    this.pickups.push(new Pickup(this, id, x, y));
  }

  showBanner(text: string): void {
    this.hud.showBanner(text);
  }

  onWaveCleared(wave: number): void {
    this.projectiles.clearEnemyBullets();
    this.time.delayedCall(700, () => this.openCardSelect(wave));
  }

  openCardSelect(wave?: number): void {
    if (this.ended) return;
    const choices = this.mutations.roll(3);
    this.scene.launch('CardSelect', {
      wave,
      choices: choices.map((c) => ({ ...c, stacks: this.mutations.stacks(c.id) })),
      onPick: (id: string) => {
        this.mutations.add(id);
        this.buffs.recompute();
        this.crucible.emit('changed');
        this.buffs.emit('changed', false);
        this.scene.resume();
        if (this.waves.phase === 'cards') this.waves.next();
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
      const r = Object.values(RECIPES).find((x) => x.id === id);
      const L = LEGENDARIES.find((x) => x.id === id);
      if (r) passives.push({ name: r.name, stacks: n, color: r.color, legendary: false });
      if (L) passives.push({ name: L.name, stacks: n, color: L.color, legendary: true });
    }
    passives.sort((a, b) => Number(b.legendary) - Number(a.legendary) || b.stacks - a.stacks);
    const st = this.buffs.stats;
    return {
      drinks: this.buffs.drinks,
      elements: { ...this.buffs.elements },
      passives,
      mutations: this.mutations.owned().map((m) => ({ name: m.def.name, icon: m.def.icon, stacks: m.stacks })),
      stats: [
        ['最大血量', String(st.maxHp)],
        ['攻擊間隔', `${st.fireInterval.toFixed(2)} 秒`],
        ['傷害', st.damage.toFixed(1)],
        ['每次射擊', `${st.shots} 發`],
        ['衝刺冷卻', `${st.dashCooldown.toFixed(2)} 秒`],
        ['移速', String(Math.round(st.speed))],
        ['命中附毒', `${st.poisonDps.toFixed(2)}/秒`],
        ['命中減速', `${Math.round(st.slow * 100)}%`],
        ['復活次數', String(this.buffs.revives)],
      ],
    };
  }

  private onDefeat(): void {
    this.waves.phase = 'defeat';
    this.endRun(false);
  }

  onVictory(): void {
    this.endRun(true);
  }

  private endRun(victory: boolean): void {
    if (this.ended) return;
    this.ended = true;
    this.telegraphs.clear();
    const data: ResultData = {
      victory,
      time: this.runTime,
      kills: this.kills,
      wave: this.waves.wave,
      discoveries: [...this.crucible.discoveredThisRun],
      ...this.summary(),
    };
    this.hud.showBanner(victory ? '勝利！' : '倒下了…');
    this.time.delayedCall(1300, () => this.scene.start('Result', data));
  }
}
