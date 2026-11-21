import Phaser from 'phaser';
import {
  ARENA, ARENA_BOTTOM, ARENA_RIGHT, DEPTH, DROP_RARITY, FONT, GAME_W, MYTHIC, RARITY, RIGHT, SAFE_X,
} from '../config';
import { ELEMENT_IDS, ELEMENT_MAP, FUN, MYTHICS, RIFT_THEMES, WEAPON_MAP, hexToInt } from '../data';
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
import { DungeonSystem, DIRS, isRift, type Dir, type Room } from '../systems/DungeonSystem';
import { Minimap } from '../ui/Minimap';
import { WeaponSystem, rollWeapon } from '../systems/WeaponSystem';
import { SkillSystem } from '../systems/SkillSystem';
import { WeaponPickup } from '../entities/WeaponPickup';
import { HazardSystem } from '../systems/HazardSystem';
import { EventSystem } from '../systems/EventSystem';
import { TutorialSystem } from '../systems/TutorialSystem';
import { Sound } from '../systems/SoundSystem';
import type { Brew, CharacterDef, ElementId, Material, RarityIndex, RegionDef, RegionTheme, RoomModId, WeaponDef } from '../types';
import { createRoundButton, type RoundButton } from '../ui/ActionButtons';
import { CrucibleBar } from '../ui/CrucibleBar';
import { HUD } from '../ui/HUD';
import { formatTime, pick } from '../utils';
import type { ResultData } from './ResultScene';

export interface RunSummary {
  character: string;
  weapons: { name: string; color: string }[];
  skill: string;
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
  dungeon!: DungeonSystem;
  fx!: FxSystem;
  input2!: InputSystem;
  hazards!: HazardSystem;
  /** 關卡內事件（寶箱 / 祈願泉 / 商人）；Phaser 已佔用 events 這個名字 */
  encounters!: EventSystem;
  tutorial!: TutorialSystem;
  weapons!: WeaponSystem;
  skills!: SkillSystem;
  weaponPickups: WeaponPickup[] = [];
  private swapBtn!: RoundButton;
  private skillBtn!: RoundButton;
  private weaponText!: Phaser.GameObjects.Text;
  private crucibleBar!: CrucibleBar;
  /** 迷路的煉金師的委託 */
  quest?: { left: number };
  private modText!: Phaser.GameObjects.Text;
  private darkness?: Phaser.GameObjects.Image;
  private drawnTheme?: RegionTheme;
  private vignette?: Phaser.GameObjects.Image;
  private arenaGfx?: Phaser.GameObjects.Graphics;
  /** 打擊停頓剩餘秒數 */
  private stopTimer = 0;
  coins = 0;
  private coinItems: { x: number; y: number; vx: number; vy: number; t: number; sprite: Phaser.GameObjects.Image }[] = [];
  private doorGfx!: Phaser.GameObjects.Graphics;
  private doorsLocked = false;
  private minimap!: Minimap;
  private transitioning = false;

  private hud!: HUD;
  private dashBtn!: RoundButton;
  private brewBtn!: RoundButton;
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
    this.weaponPickups = [];
    this.quest = undefined;
    this.darkness = undefined;
    this.drawnTheme = undefined;
    this.vignette = undefined;
    this.unlocks = [];
    this.character = ProgressStore.selected;

    this.stopTimer = 0;
    this.arenaGfx = undefined;
    this.coins = 0;
    this.coinItems = [];
    this.doorsLocked = false;
    this.transitioning = false;

    this.fx = new FxSystem(this);
    this.telegraphs = new TelegraphSystem(this);
    this.projectiles = new ProjectileSystem(this);
    this.mutations = new MutationSystem();
    this.crucible = new CrucibleSystem(this.mutations);
    this.crucible.bonusChance = this.character.fissionBonus ?? 0;
    this.effects = new EffectSystem(this);
    this.dungeon = new DungeonSystem(this);
    this.doorGfx = this.add.graphics().setDepth(DEPTH.floor + 1);
    this.hazards = new HazardSystem(this);
    this.encounters = new EventSystem(this);
    this.crucible.qualityBonusProvider = () => this.encounters.takeQualityBonus();
    this.player = new Player(this, GAME_W / 2, ARENA.y + ARENA.h * 0.7, `cat_${this.character.id}`);
    this.buffs = new BuffSystem(this, this.character);
    this.player.hp = this.player.maxHp = this.character.stats.hp;
    this.buffs.recompute();
    this.character.startModules?.forEach((m) => this.buffs.addModule(m.id, m.n));
    this.weapons = new WeaponSystem(this, this.character.startWeapon);
    this.skills = new SkillSystem(this, this.character.skill);

    // UI
    this.hud = new HUD(this, this.player.maxHp, () => this.openPause());
    this.minimap = new Minimap(this, this.dungeon);
    this.crucibleBar = new CrucibleBar(this, this.crucible, this.buffs);
    this.input2 = new InputSystem(this);
    // 右下按鈕弧形排列（半透明疊在戰場上）
    this.dashBtn = createRoundButton(this, RIGHT - 100, 612, 60, '衝刺', 0x3a7bd5, () => (this.input2.dashPressed = true));
    this.skillBtn = createRoundButton(this, RIGHT - 230, 650, 46, '技能', 0xd08a2a, () => (this.input2.skillPressed = true));
    this.brewBtn = createRoundButton(this, RIGHT - 84, 474, 46, '煉成', 0x9a4fd0, () => (this.input2.brewPressed = true));
    this.swapBtn = createRoundButton(this, RIGHT - 202, 532, 38, '換武器', 0x3a6a4a, () => (this.input2.swapPressed = true));
    [this.dashBtn, this.skillBtn, this.brewBtn, this.swapBtn].forEach((b) => b.container.setAlpha(0.82));
    this.weaponText = this.add.text(RIGHT - 202, 480, '', {
      fontFamily: FONT, fontSize: '16px', color: '#ffffff', align: 'center', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.ui);
    this.modText = this.add.text(SAFE_X + 18, 136, '', {
      fontFamily: FONT, fontSize: '18px', color: '#ffffff', stroke: '#000', strokeThickness: 4,
    }).setDepth(DEPTH.ui);
    this.weapons.on('changed', () => this.refreshWeaponUI());
    this.refreshWeaponUI();

    this.buffs.on('changed', (twice: boolean) => {
      if (twice) this.fx.floatText(this.player.x, this.player.y - 70, '雙倍釀造！', '#ffd166');
    });

    this.events.on('resume', () => this.input2.consume());
    this.tutorial = new TutorialSystem(this);
    this.events.on('telegraph-warning', () => this.tutorial.notify('telegraph'));
    this.dungeon.start();

    (window as unknown as { __game?: GameScene }).__game = this;
  }

  private drawArena(theme: RegionTheme): void {
    if (this.drawnTheme === theme) return;
    this.drawnTheme = theme;
    const col = (h: string) => hexToInt(h);
    this.cameras.main.setBackgroundColor(theme.bg);
    this.arenaGfx?.destroy();
    const g = this.arenaGfx = this.add.graphics().setDepth(DEPTH.floor);
    // 整個畫面先鋪背景色（寬螢幕兩側也不會是黑邊）
    g.fillStyle(col(theme.bg), 1).fillRect(0, 0, GAME_W, 720);
    g.fillStyle(col(theme.floor), 1).fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
    // 石板地磚：交錯排列＋隨機明暗
    const tile = 64;
    let seed = theme.floor.length * 97 + theme.tile.charCodeAt(2);
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let row = 0, y = ARENA.y; y < ARENA_BOTTOM; y += tile, row++) {
      const off = row % 2 ? tile / 2 : 0;
      for (let x = ARENA.x - off; x < ARENA_RIGHT; x += tile) {
        const x0 = Math.max(ARENA.x, x);
        const w = Math.min(x + tile, ARENA_RIGHT) - x0;
        const h = Math.min(tile, ARENA_BOTTOM - y);
        g.fillStyle(col(theme.tile), 0.35 + rnd() * 0.65).fillRect(x0 + 2, y + 2, w - 4, h - 4);
      }
    }
    // 草叢 / 碎石點綴
    for (let i = 0; i < Math.round(ARENA.w / 30); i++) {
      const x = ARENA.x + 20 + rnd() * (ARENA.w - 40);
      const y = ARENA.y + 20 + rnd() * (ARENA.h - 40);
      g.fillStyle(col(theme.decoLight), 0.18);
      for (let k = 0; k < 3; k++) g.fillTriangle(x + k * 5 - 6, y, x + k * 5 - 3, y - 10 - rnd() * 6, x + k * 5, y);
      if (rnd() < 0.3) g.fillStyle(col(theme.deco), 0.35).fillCircle(x + 14, y + 6, 4 + rnd() * 4);
    }
    // 牆：雙線＋角落花盆
    g.lineStyle(10, col(theme.wall), 1).strokeRect(ARENA.x - 5, ARENA.y - 5, ARENA.w + 10, ARENA.h + 10);
    g.lineStyle(2, col(theme.decoLight), 0.35).strokeRect(ARENA.x + 4, ARENA.y + 4, ARENA.w - 8, ARENA.h - 8);
    const corners = [[ARENA.x + 24, ARENA.y + 24], [ARENA_RIGHT - 24, ARENA.y + 24], [ARENA.x + 24, ARENA_BOTTOM - 24], [ARENA_RIGHT - 24, ARENA_BOTTOM - 24]];
    corners.forEach(([x, y]) => {
      g.fillStyle(col(theme.deco), 0.9).fillCircle(x, y, 28);
      g.fillStyle(col(theme.decoLight), 0.7).fillCircle(x - 7, y - 7, 13);
      g.fillStyle(col(theme.decoLight), 0.35).fillCircle(x + 9, y + 4, 8);
    });
    this.vignette?.destroy();
    this.vignette = this.add.image(ARENA.x + ARENA.w / 2, ARENA.y + ARENA.h / 2, 'vignette')
      .setDisplaySize(ARENA.w, ARENA.h).setDepth(DEPTH.fx + 15);
  }

  update(_time: number, deltaMs: number): void {
    if (this.ended) return;
    const realDt = Math.min(deltaMs / 1000, 1 / 20);
    if (this.stopTimer > 0) {
      this.stopTimer -= realDt;
      return;
    }
    const dt = realDt;
    if (this.dungeon.phase !== 'cards') this.runTime += dt;

    const actions = this.input2.consume();
    const move = this.input2.move;
    if (actions.dash && this.player.tryDash(move.x, move.y)) Sound.play('dash');
    if (actions.brew) this.brewAndDrink();
    if (actions.skill && !this.skills.use() && this.skills.cooldown > 0) {
      this.fx.floatText(this.player.x, this.player.y - 40, `技能冷卻 ${Math.ceil(this.skills.cooldown)}s`, '#9a90a8', 18);
    }
    if (actions.swap) this.weapons.swap();

    this.player.update(dt, move.x, move.y);
    this.checkDoors();
    this.crucible.update(dt);
    this.weapons.update(dt);
    this.skills.update(dt);

    this.enemies.forEach((e) => e.update(dt));
    this.separateEnemies();
    this.enemies = this.enemies.filter((e) => e.alive);
    this.checkContact();

    this.projectiles.update(dt, this.enemies);
    this.effects.update(dt);
    this.buffs.update(dt, this.dungeon.combatActive);
    if (this.dungeon.combatActive) this.buffs.tickCombat(dt, this.enemies.length > 0);
    this.telegraphs.update(dt);
    this.updatePickups(dt);
    this.hazards.update(dt);
    this.encounters.update(dt);
    this.tutorial.update(dt);
    this.updateCoins(dt);
    this.updateWeaponPickups(dt);
    this.dungeon.update(dt);

    if (this.darkness) {
      const on = this.roomMod === 'darkness' && !this.dungeon.current.cleared;
      this.darkness.setVisible(on).setPosition(this.player.x, this.player.y);
    }
    this.dashBtn.setCooldown(this.player.dashCooldownRatio);
    this.brewBtn.setEnabled(this.crucible.canBrew);
    this.skillBtn.setCooldown(this.skills.ratio);
    this.skillBtn.setEnabled(this.skills.ready);
    const boss = this.dungeon.boss;
    this.hud.setCoins(this.coins);
    this.hud.setDanger(this.dungeon.hpMul, this.dungeon.enemyDamage);
    this.hud.update(this.player, this.dungeon.label, this.runTime,
      boss ? { hp: boss.hp, maxHp: boss.maxHp, name: boss.def.name, alive: boss.alive } : undefined);
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
  brewAndDrink(): void {
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
      this.fx.burst(this.crucibleBar.cx, this.crucibleBar.cy, 120, color, 500);
      this.cameras.main.flash(250, 255, 120, 140);
      this.cameras.main.shake(200, 0.006);
      this.hud.showToast(`裂變！【${MYTHIC.name}】${M.name}`, M.desc, MYTHIC.color);
    } else {
      const r = brew.recipe;
      const q = RARITY[brew.quality];
      this.fx.burst(p.x, p.y, 70 + brew.quality * 25, hexToInt(q.color), 350);
      this.fx.burst(this.crucibleBar.cx, this.crucibleBar.cy, 90, hexToInt(r.color));
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

  /** 敵人造成的傷害會依難度放大 */
  hurtPlayer(amount: number): void {
    if (this.ended) return;
    if (!this.player.hurt(amount * this.dungeon.enemyDamage)) return;
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
    if (e.def.boss) {
      this.dropCoins(e.x, e.y, 25);
      return;
    }
    if (e.elite) this.dropCoins(e.x, e.y, 5);
    else if (Math.random() < 0.35) this.dropCoins(e.x, e.y, 1);
    const dropChance = this.buffs.stats.dropChance + (this.roomMod === 'bounty' ? 0.4 : 0);
    if (e.elite || Math.random() < dropChance) this.dropMaterial(e.x, e.y, undefined, e.elite);
  }

  /** 掉落素材：元素隨機，稀有度依波數、精英、鑑寶卡決定 */
  dropMaterial(x: number, y: number, mat?: Material, elite = false): void {
    if (!mat) {
      const base = elite ? DROP_RARITY.elite : DROP_RARITY.normal;
      const w = base.map((b, i) => {
        let v = b + (elite ? 0 : DROP_RARITY.perWave[i] * this.dungeon.depthIndex);
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

  // ---- 地下城 ----

  private drawDoors(): void {
    const g = this.doorGfx;
    g.clear();
    const room = this.dungeon.current;
    if (!room) return;
    const theme = this.dungeon.region.theme;
    const W = 130;
    const cx = (ARENA.x + ARENA_RIGHT) / 2;
    const cy = (ARENA.y + ARENA_BOTTOM) / 2;
    const rects: Record<Dir, [number, number, number, number]> = {
      n: [cx - W / 2, ARENA.y - 12, W, 16],
      s: [cx - W / 2, ARENA_BOTTOM - 4, W, 16],
      w: [ARENA.x - 12, cy - W / 2, 16, W],
      e: [ARENA_RIGHT - 4, cy - W / 2, 16, W],
    };
    for (const dir of Object.keys(DIRS) as Dir[]) {
      if (!room.doors[dir]) continue;
      const [x, y, w, h] = rects[dir];
      g.fillStyle(hexToInt(theme.floor), 1).fillRect(x, y, w, h);
      if (this.doorsLocked) {
        g.fillStyle(0xff3b3b, 0.9);
        const horiz = w > h;
        for (let i = 0; i < 5; i++) {
          if (horiz) g.fillRect(x + 8 + i * ((w - 16) / 4) - 3, y - 4, 6, h + 8);
          else g.fillRect(x - 4, y + 8 + i * ((h - 16) / 4) - 3, w + 8, 6);
        }
      } else {
        g.fillStyle(0xffd166, 0.35).fillRect(x, y, w, h);
      }
    }
  }

  setDoorsLocked(locked: boolean): void {
    this.doorsLocked = locked;
    this.drawDoors();
  }

  /** 玩家貼到開著的門就換房 */
  private checkDoors(): void {
    if (this.transitioning || this.dungeon.phase !== 'explore' || this.doorsLocked) return;
    const p = this.player;
    const room = this.dungeon.current;
    const half = 60;
    const cx = (ARENA.x + ARENA_RIGHT) / 2;
    const cy = (ARENA.y + ARENA_BOTTOM) / 2;
    const edge = p.radius + 2;
    if (room.doors.n && p.y <= ARENA.y + edge && Math.abs(p.x - cx) < half) this.dungeon.go('n');
    else if (room.doors.s && p.y >= ARENA_BOTTOM - edge && Math.abs(p.x - cx) < half) this.dungeon.go('s');
    else if (room.doors.w && p.x <= ARENA.x + edge && Math.abs(p.y - cy) < half) this.dungeon.go('w');
    else if (room.doors.e && p.x >= ARENA_RIGHT - edge && Math.abs(p.y - cy) < half) this.dungeon.go('e');
  }

  /** 換房淡出淡入 */
  transition(fn: () => void): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cameras.main.fadeOut(120, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      fn();
      this.cameras.main.fadeIn(160, 0, 0, 0);
      this.transitioning = false;
    });
  }

  onRoomEnter(room: Room, prev: Room | undefined, fromDir?: Dir): void {
    // 把上一間的素材收起來，金幣直接入袋
    if (prev && prev !== room) {
      prev.stash = this.pickups.filter((pk) => pk.alive).map((pk) => ({ mat: pk.mat, x: pk.x, y: pk.y, life: pk.life }));
      prev.weapons = this.weaponPickups.filter((w) => w.alive).map((w) => ({ id: w.weapon.id, x: w.x, y: w.y }));
    }
    this.weaponPickups.forEach((w) => w.destroy());
    this.weaponPickups = room.weapons.map((w) => new WeaponPickup(this, WEAPON_MAP[w.id], w.x, w.y));
    room.weapons = [];
    this.pickups.forEach((pk) => pk.destroy());
    this.pickups = [];
    this.coinItems.forEach((c) => {
      this.coins++;
      c.sprite.destroy();
    });
    this.coinItems = [];
    this.projectiles.clearAll();
    this.telegraphs.clear();
    this.effects.clearRoomZones();
    this.hazards.clear();
    for (const st of room.stash) {
      const pk = new Pickup(this, st.mat, st.x, st.y);
      pk.life = st.life;
      this.pickups.push(pk);
    }
    room.stash = [];

    const cx = (ARENA.x + ARENA_RIGHT) / 2;
    const cy = (ARENA.y + ARENA_BOTTOM) / 2;
    const inset = 70;
    const p = this.player;
    if (fromDir === 'n') p.setPosition(cx, ARENA.y + inset);
    else if (fromDir === 's') p.setPosition(cx, ARENA_BOTTOM - inset);
    else if (fromDir === 'w') p.setPosition(ARENA.x + inset, cy);
    else if (fromDir === 'e') p.setPosition(ARENA_RIGHT - inset, cy);
    else p.setPosition(cx, ARENA.y + ARENA.h * 0.7);

    if (room.type === 'rift_past') this.drawArena(RIFT_THEMES.past);
    else if (room.type === 'rift_future') this.drawArena(RIFT_THEMES.future);
    else this.drawArena(this.dungeon.region.theme);
    this.refreshModText();
    this.doorsLocked = false;
    this.drawDoors();
    this.encounters.setupRoom(room);
    this.minimap.draw();
    this.hud.setInfoY(this.minimap.bottom);
    if (room.type === 'exit') this.tutorial.notify('stairs');
    if (room.type === 'shop') this.tutorial.notify('shop');
  }

  onRoomCleared(room: Room): void {
    this.buffs.commitRoom();
    this.projectiles.clearEnemyBullets();
    const cx = (ARENA.x + ARENA_RIGHT) / 2;
    const cy = (ARENA.y + ARENA_BOTTOM) / 2;
    this.dropCoins(cx, cy, 3 + this.dungeon.floor + this.dungeon.regionIndex * 2);
    if (Math.random() < 0.5) this.dropMaterial(cx, cy + 40);
    if (room.type === 'elite' ? Math.random() < 0.4 : Math.random() < 0.08) this.dropWeapon(cx, cy - 80);
    Sound.play('card');
    this.showBanner(room.type === 'elite' ? '挑戰成功！' : '房間清空');
    this.minimap.draw();
    this.hud.setInfoY(this.minimap.bottom);
    this.tutorial.notify('door');
    const mod = room.mod ? FUN.mods.find((m) => m.id === room.mod) : undefined;
    if (mod?.curse) {
      this.dropCoins(cx, cy, 6);
      this.fx.floatText(cx, cy - 60, `詛咒解除！額外金幣`, '#ffd166', 22);
    }
    this.refreshModText();
    if (this.quest && (room.type === 'combat' || room.type === 'elite' || isRift(room))) {
      this.quest.left--;
      if (this.quest.left <= 0) {
        this.quest = undefined;
        this.hud.showToast('委託完成！', '迷路的煉金師送來一把武器作為謝禮', '#c9a3ff');
        this.dropWeapon(this.player.x, this.player.y - 100, undefined, 1);
      } else {
        this.fx.floatText(this.player.x, this.player.y - 80, `委託：還剩 ${this.quest.left} 間`, '#c9a3ff', 20);
      }
    }
    if (room.type === 'rift_past') {
      for (let i = 0; i < 5; i++) this.dropMaterial(cx - 200 + i * 100, cy + 60);
      this.dropCoins(cx, cy, 10);
    }
    if (room.type === 'rift_future') {
      this.dropMaterial(cx - 80, cy + 60, { el: pick(ELEMENT_IDS), r: 3 });
      this.dropWeapon(cx + 80, cy + 60, undefined, 2);
      this.time.delayedCall(900, () => this.openCardSelect('來自未來的饋贈', 2));
    }
    this.encounters.setupRoom(room);
    if (room.type === 'elite') {
      this.dropMaterial(cx - 60, cy, undefined, true);
      this.dropMaterial(cx + 60, cy, undefined, true);
      this.time.delayedCall(900, () => this.openCardSelect('精英挑戰獎勵', 1));
    }
  }

  onBossCleared(region: RegionDef): void {
    this.unlocks.push(...ProgressStore.record({ bossKill: true }));
    this.projectiles.clearEnemyBullets();
    this.hazards.clear();
    this.showBanner(`${region.name} 突破！`);
    for (let i = 0; i < 3; i++) this.dropMaterial(GAME_W / 2 - 80 + i * 80, ARENA.y + ARENA.h / 2 + 80, undefined, true);
    this.dropWeapon(GAME_W / 2, ARENA.y + ARENA.h / 2 - 140, undefined, 2);
    this.minimap.draw();
    this.hud.setInfoY(this.minimap.bottom);
    this.time.delayedCall(1800, () => this.openCardSelect('Boss 獎勵', 1, () => {
      this.dungeon.afterCards();
      this.encounters.setupRoom(this.dungeon.current);
    }));
  }

  /** 走上樓梯：一般層先拿樓層獎勵卡 */
  onStairs(): void {
    if (this.dungeon.combatActive) return;
    const go = () => this.transition(() => this.dungeon.nextFloor());
    if (this.dungeon.isBossFloor) go();
    else this.openCardSelect(`${this.dungeon.label} 通過！`, 0, go);
  }

  onFloorEnter(globalFloor: number): void {
    this.unlocks.push(...ProgressStore.record({ floor: globalFloor }));
  }

  /** 進入新區域：換場景配色、回血 */
  onRegionEnter(region: RegionDef, index: number): void {
    this.drawArena(region.theme);
    if (index > 0) this.heal(3);
  }

  // ---- 時空裂縫 / 房間詞條 ----

  get roomMod(): RoomModId | undefined {
    return this.dungeon.current?.mod;
  }

  get enemySpeedMul(): number {
    return this.roomMod === 'gale' && !this.dungeon.current.cleared ? 1.35 : 1;
  }

  private refreshModText(): void {
    const room = this.dungeon.current;
    const mod = room?.mod ? FUN.mods.find((m) => m.id === room.mod) : undefined;
    const parts: string[] = [];
    if (mod) parts.push(`${mod.icon} ${mod.name}：${mod.desc}${room.cleared ? '（已結束）' : ''}`);
    if (this.quest) parts.push(`📜 委託：再清 ${this.quest.left} 間戰鬥房`);
    if (this.dungeon.forceRift) parts.push('⌛ 時空正在扭曲……');
    this.modText.setText(parts.join('\n')).setColor(mod?.curse && !room.cleared ? '#ff9aa8' : '#ffe9a8');
  }

  onRoomModStart(id: RoomModId): void {
    const mod = FUN.mods.find((m) => m.id === id)!;
    this.hud.showToast(`${mod.curse ? '詛咒' : '祝福'}・${mod.icon} ${mod.name}`, mod.desc, mod.curse ? '#ff6b8a' : '#ffd166');
    if (id === 'darkness' && !this.darkness) {
      this.darkness = this.add.image(this.player.x, this.player.y, 'darkness').setDisplaySize(2600, 2600).setDepth(DEPTH.fx + 20);
    }
    this.refreshModText();
  }

  /** 進出時空裂縫的特殊轉場 */
  riftTransition(future: boolean, fn: () => void): void {
    if (this.transitioning) return;
    this.transitioning = true;
    const entering = !this.dungeon.inRift;
    const [r, g, b] = entering ? (future ? [0, 220, 255] : [220, 170, 90]) : [255, 255, 255];
    Sound.play('fission');
    this.cameras.main.shake(400, 0.008);
    this.cameras.main.flash(300, r, g, b);
    this.time.delayedCall(250, () => {
      this.cameras.main.fadeOut(300, r, g, b);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        fn();
        this.cameras.main.fadeIn(400, r, g, b);
        this.transitioning = false;
        this.showBanner(entering ? (future ? '穿越到了未來！' : '回到了過去……') : '回到現在');
        if (entering) {
          this.hud.showToast(future ? '時空裂縫・未來' : '時空裂縫・過去',
            future ? '後面區域的強敵！打贏可得傳說素材、武器與史詩突變卡' : '懷舊的溫室，敵人較弱，會掉大量素材',
            future ? '#00e0ff' : '#e0c08a');
        }
      });
    });
  }

  onRiftExit(_region: RegionDef): void {
    this.refreshModText();
  }

  // ---- 武器 ----

  private refreshWeaponUI(): void {
    const [a, b] = this.weapons.slots;
    const cur = this.weapons.weapon;
    const other = this.weapons.slots[1 - this.weapons.active];
    this.weaponText.setText(other ? `${cur.name}\n⇄ ${other.name}` : cur.name);
    this.weaponText.setColor(RARITY[cur.rarity].color);
    this.swapBtn.setEnabled(!!(a && b));
  }

  /** 掉落武器（不指定就依稀有度權重抽） */
  dropWeapon(x: number, y: number, w?: WeaponDef, minRarity: RarityIndex = 0): void {
    if (!w) {
      const base = DROP_RARITY.elite.map((v, i) => Math.max(0.1, v + DROP_RARITY.perWave[i] * this.dungeon.depthIndex));
      w = rollWeapon(base, minRarity);
    }
    x = Math.max(ARENA.x + 40, Math.min(ARENA_RIGHT - 40, x));
    y = Math.max(ARENA.y + 60, Math.min(ARENA_BOTTOM - 40, y));
    this.weaponPickups.push(new WeaponPickup(this, w, x, y));
    this.tutorial.notify('weapon');
  }

  private updateWeaponPickups(dt: number): void {
    const p = this.player;
    for (const wp of this.weaponPickups) {
      if (!wp.alive) continue;
      wp.update(dt);
      const inside = (p.x - wp.x) ** 2 + (p.y - wp.y) ** 2 < (p.radius + 30) ** 2;
      if (!inside) {
        wp.armed = true;
        continue;
      }
      if (!wp.armed) continue;
      const dropped = this.weapons.equip(wp.weapon);
      wp.destroy();
      Sound.play('pickup', wp.weapon.rarity);
      this.fx.floatText(p.x, p.y - 60, `裝備 ${wp.weapon.name}`, RARITY[wp.weapon.rarity].color, 22);
      if (dropped) this.weaponPickups.push(new WeaponPickup(this, dropped, wp.x, wp.y, false));
    }
    this.weaponPickups = this.weaponPickups.filter((w) => w.alive);
  }

  // ---- 金幣 ----

  dropCoins(x: number, y: number, n: number): void {
    n = Math.round(n * (1 + this.mutations.value('greed') / 100) * (this.roomMod === 'golden' ? 3 : 1));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 160;
      const sprite = this.add.image(x, y, 'coin').setDisplaySize(16, 16).setDepth(DEPTH.pickup + 2);
      this.coinItems.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, sprite });
    }
  }

  private updateCoins(dt: number): void {
    if (!this.coinItems.length) return;
    const p = this.player;
    this.coinItems = this.coinItems.filter((c) => {
      c.t += dt;
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const d = Math.hypot(dx, dy);
      if (c.t > 0.35 && d < 170) {
        const sp = 650;
        c.vx = (dx / d) * sp;
        c.vy = (dy / d) * sp;
      } else {
        c.vx *= Math.pow(0.02, dt);
        c.vy *= Math.pow(0.02, dt);
      }
      c.x = Math.max(ARENA.x + 8, Math.min(ARENA_RIGHT - 8, c.x + c.vx * dt));
      c.y = Math.max(ARENA.y + 8, Math.min(ARENA_BOTTOM - 8, c.y + c.vy * dt));
      c.sprite.setPosition(c.x, c.y).setScale(c.sprite.scaleX, Math.abs(Math.cos(c.t * 8)) * (16 / 32) + 0.05);
      if (d < p.radius + 8 && c.t > 0.2) {
        this.coins++;
        Sound.play('pickup', 0);
        c.sprite.destroy();
        return false;
      }
      return true;
    });
  }

  openCardSelect(title?: string, minRarity: RarityIndex = 0, after?: () => void): void {
    if (this.ended) return;
    const offers = this.mutations.roll(this.dungeon.depthIndex + 1, minRarity);
    this.scene.launch('CardSelect', {
      title,
      offers: offers.map((o) => ({ ...o, owned: this.mutations.value(o.def.id) })),
      onPick: (index: number) => {
        const o = offers[index];
        Sound.play('card');
        this.mutations.add(o.def.id, RARITY[o.rarity].mult);
        this.buffs.recompute();
        this.crucible.emit('changed');
        this.buffs.emit('changed', false);
        this.scene.resume();
        after?.();
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
      weapons: this.weapons.slots.filter(Boolean).map((w) => ({ name: w!.name, color: RARITY[w!.rarity].color })),
      skill: `${this.character.skill.name}（冷卻 ${this.character.skill.cooldown} 秒）`,
      region: `${this.dungeon.label}　${formatTime(this.runTime)}`,
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
    this.dungeon.phase = 'defeat';
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
      wave: this.dungeon.globalFloor,
      discoveries: [...this.crucible.discoveredThisRun],
      fissions: this.crucible.fissions,
      unlocks: this.unlocks.map((c) => c.name),
      ...this.summary(),
    };
    this.hud.showBanner(victory ? '勝利！' : '倒下了…');
    this.time.delayedCall(1300, () => this.scene.start('Result', data));
  }
}
