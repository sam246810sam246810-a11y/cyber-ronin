import Phaser from 'phaser';
import {
  ARENA, ARENA_BOTTOM, ARENA_RIGHT, DEPTH, DROP_RARITY, FONT, GAME_W, MYTHIC, RARITY, RIGHT, SAFE_X,
  resetArenaToScreen, setArena, ySortDepth,
} from '../config';
import { CHARACTERS, ELEMENT_IDS, ELEMENT_MAP, FUN, LOBBY_THEME, MYTHICS, RELIC_MAP, RIFT_THEMES, WEAPON_MAP, hexToInt } from '../data';
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
import { RelicPickup } from '../entities/RelicPickup';
import { RelicSystem } from '../systems/RelicSystem';
import { MetaStore } from '../systems/MetaStore';
import { Dummy } from '../entities/enemies/Dummy';
import { RoomRenderer } from '../systems/RoomRenderer';
import { WORLD, activateLayout, buildSceneLayout, corridorExit, entryPoint, generateLayout, pickScene, inGrass, nearestFree, type RoomLayout } from '../systems/WorldSystem';
import { TerrainSystem } from '../systems/TerrainSystem';
import { GuardianFlower } from '../entities/Ally';
import { HazardSystem } from '../systems/HazardSystem';
import { EventSystem } from '../systems/EventSystem';
import { TutorialSystem } from '../systems/TutorialSystem';
import { Sound } from '../systems/SoundSystem';
import type { Brew, CharacterDef, ElementId, HistoryId, Material, RarityIndex, RegionDef, RegionTheme, RelicDef, RoomModId, WeaponDef } from '../types';
import { createRoundButton, type RoundButton } from '../ui/ActionButtons';
import { CrucibleBar } from '../ui/CrucibleBar';
import { HUD } from '../ui/HUD';
import { formatTime, pick } from '../utils';
import type { ResultData } from './ResultScene';

export interface RunSummary {
  character: string;
  relics: { id: string; name: string; icon: string; color: string; desc: string }[];
  sand: number;
  weapons: { name: string; color: string }[];
  skill: string;
  region: string;
  drinks: number;
  elements: Record<ElementId, number>;
  passives: { name: string; stacks: number; color: string; mythic: boolean }[];
  mutations: { id: string; name: string; icon: string; value: string }[];
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
  relicPickups: RelicPickup[] = [];
  relics!: RelicSystem;
  /** 本局獲得的時之砂 */
  sand = 0;
  /** 剩餘突變卡重抽次數 */
  rerolls = 0;
  terrain!: TerrainSystem;
  /** 躲在紙箱裡：敵人找不到、也不會攻擊 */
  playerHidden = false;
  /** 時空因果：在過去改寫的歷史 */
  causality = { flowers: 0, notes: 0, kitten: false, bury: 0 };
  private allies: GuardianFlower[] = [];
  private box?: { x: number; y: number; time: number; sprite: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text };
  private teaser?: { sprite: Phaser.GameObjects.Image; t: number };
  private swapBtn!: RoundButton;
  private skillBtn!: RoundButton;
  private weaponText!: Phaser.GameObjects.Text;
  private crucibleBar!: CrucibleBar;
  /** 迷路的煉金師的委託 */
  quest?: { left: number };
  private modText!: Phaser.GameObjects.Text;
  private darkness?: Phaser.GameObjects.Image;
  private drawnTheme?: RegionTheme;
  private floorSprite?: Phaser.GameObjects.TileSprite;
  private roomBg?: Phaser.GameObjects.Image;
  private roomArt = false;
  private doorSprites: Phaser.GameObjects.Image[] = [];
  /** 大地圖 */
  private roomRenderer!: RoomRenderer;
  private camTarget!: Phaser.GameObjects.Zone;
  private screenArena = { x: 0, y: 0, w: 0, h: 0 };
  private uiPending: Phaser.GameObjects.GameObject[] = [];
  private layoutSeed = 0;
  private grassHidden = false;
  private dashBuffer = 0;
  private lastKillStop = 0;
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

  /** lobby：大廳（貓咪煉金工房）；run：冒險 */
  mode: 'lobby' | 'run' = 'run';

  create(data?: { mode?: 'lobby' | 'run' }): void {
    this.mode = data?.mode ?? 'run';
    // 大地圖狀態是模組層級的：每次進場景先回到「一個畫面」並關閉碰撞
    resetArenaToScreen();
    activateLayout(undefined);
    WORLD.locked = false;
    this.screenArena = { x: ARENA.x, y: ARENA.y, w: ARENA.w, h: ARENA.h };
    this.layoutSeed = Math.floor(Math.random() * 1e6);
    this.grassHidden = false;
    this.cameras.main.stopFollow();
    this.cameras.main.removeBounds();
    this.cameras.main.setScroll(0, 0);
    this.roomRenderer = new RoomRenderer(this);
    this.camTarget = this.add.zone(0, 0, 1, 1);
    // 介面（depth ≥ UI）固定在螢幕上，不跟著鏡頭捲動
    this.uiPending = [];
    const onAdded = (go: Phaser.GameObjects.GameObject) => this.uiPending.push(go);
    const flushUi = () => {
      if (!this.uiPending.length) return;
      for (const go of this.uiPending) {
        const o = go as unknown as { depth?: number; setScrollFactor?: (x: number, y?: number, c?: boolean) => void };
        if ((o.depth ?? 0) >= DEPTH.ui - 5 && o.setScrollFactor) o.setScrollFactor(0, 0, true);
      }
      this.uiPending = [];
    };
    this.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, onAdded);
    this.events.on(Phaser.Scenes.Events.PRE_RENDER, flushUi);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, onAdded);
      this.events.off(Phaser.Scenes.Events.PRE_RENDER, flushUi);
    });
    this.enemies = [];
    this.pickups = [];
    this.runTime = 0;
    this.kills = 0;
    this.ended = false;
    this.weaponPickups = [];
    this.relicPickups = [];
    this.sand = 0;
    this.playerHidden = false;
    this.causality = { flowers: 0, notes: 0, kitten: false, bury: 0 };
    this.allies = [];
    this.box = undefined;
    this.teaser = undefined;
    this.quest = undefined;
    this.darkness = undefined;
    this.drawnTheme = undefined;
    this.doorSprites = [];
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
    this.relics = new RelicSystem(this);
    this.terrain = new TerrainSystem(this);
    this.crucible.qualityBonusProvider = () => this.encounters.takeQualityBonus() + this.relics.qualityBonus();
    this.crucible.bonusChance += 0.03 * MetaStore.level('affinity');
    this.crucible.extraChance = () => this.relics.fissionAdd;
    this.rerolls = MetaStore.level('reroll');
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
    this.tutorial = new TutorialSystem(this, this.mode === 'run');
    this.events.on('telegraph-warning', () => this.tutorial.notify('telegraph'));
    this.events.on('resume', () => {
      this.buffs.recompute();
      this.hud.setRelics(this.relics.owned);
    });
    if (this.mode === 'lobby') {
      this.setupLobby();
    } else {
      this.dungeon.start();
      // 大坩堝永久升級：開局金幣與素材袋
      this.coins = 15 * MetaStore.level('fortune_cat');
      for (let i = 0; i < MetaStore.level('satchel'); i++) {
        this.dropMaterial(this.player.x - 60 + i * 60, this.player.y - 90, { el: pick(ELEMENT_IDS), r: 1 });
      }
    }

    (window as unknown as { __game?: GameScene }).__game = this;
  }

  private drawArena(theme: RegionTheme): void {
    if (this.drawnTheme === theme) return;
    this.drawnTheme = theme;
    const col = (h: string) => hexToInt(h);
    this.cameras.main.setBackgroundColor(theme.bg);
    this.arenaGfx?.destroy();
    const g = this.arenaGfx = this.add.graphics().setDepth(DEPTH.floor);
    this.roomBg?.destroy();
    this.roomBg = undefined;
    this.roomArt = !!theme.roomTex && this.textures.exists(theme.roomTex);
    if (this.roomArt) {
      // 2.5D 房間背景：整張圖等比放大蓋滿畫面（後牆、窗戶、角落道具都在圖裡）
      this.floorSprite?.destroy();
      this.floorSprite = undefined;
      const bg = this.roomBg = this.add.image(GAME_W / 2, 360, theme.roomTex!).setDepth(DEPTH.floor - 1);
      bg.setScale(Math.max(GAME_W / bg.width, 720 / bg.height));
      if (theme.floorTint) bg.setTint(theme.floorTint);
      this.vignette?.destroy();
      this.vignette = undefined;
      return;
    }
    // 整個畫面先鋪背景色（寬螢幕兩側也不會是黑邊）
    const hasArt = !!theme.floorTex && this.textures.exists(theme.floorTex);
    if (hasArt) {
      // 只鋪戰場外圍，戰場內交給地板貼圖
      g.fillStyle(col(theme.bg), 1)
        .fillRect(0, 0, GAME_W, ARENA.y).fillRect(0, ARENA_BOTTOM, GAME_W, 720 - ARENA_BOTTOM)
        .fillRect(0, ARENA.y, ARENA.x, ARENA.h).fillRect(ARENA_RIGHT, ARENA.y, GAME_W - ARENA_RIGHT, ARENA.h);
    } else {
      g.fillStyle(col(theme.bg), 1).fillRect(0, 0, GAME_W, 720);
      g.fillStyle(col(theme.floor), 1).fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
    }
    // 石板地磚：交錯排列＋隨機明暗
    const tile = 64;
    let seed = theme.floor.length * 97 + theme.tile.charCodeAt(2);
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    this.floorSprite?.destroy();
    this.floorSprite = undefined;
    if (hasArt) {
      // 美術地板：整片鋪貼圖（256px 一格），再壓暗一點讓角色更突出
      this.floorSprite = this.add.tileSprite(ARENA.x, ARENA.y, ARENA.w, ARENA.h, theme.floorTex!)
        .setOrigin(0, 0).setDepth(DEPTH.floor).setTileScale(0.5, 0.5)
        .setTint(theme.floorTint ?? 0xb8b8b8);
      this.arenaGfx.setDepth(DEPTH.floor + 0.5);
    }
    for (let row = 0, y = ARENA.y; !hasArt && y < ARENA_BOTTOM; y += tile, row++) {
      const off = row % 2 ? tile / 2 : 0;
      for (let x = ARENA.x - off; x < ARENA_RIGHT; x += tile) {
        const x0 = Math.max(ARENA.x, x);
        const w = Math.min(x + tile, ARENA_RIGHT) - x0;
        const h = Math.min(tile, ARENA_BOTTOM - y);
        g.fillStyle(col(theme.tile), 0.35 + rnd() * 0.65).fillRect(x0 + 2, y + 2, w - 4, h - 4);
      }
    }
    // 草叢 / 碎石點綴
    for (let i = 0; !hasArt && i < Math.round(ARENA.w / 30); i++) {
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
    // 輸入緩衝：衝刺鍵在還不能衝的時候按下，0.2 秒內一能衝就自動衝（不會覺得按了沒反應）
    if (actions.dash) this.dashBuffer = 0.2;
    if (this.dashBuffer > 0) {
      if (this.player.tryDash(move.x, move.y)) {
        this.dashBuffer = 0;
        Sound.play('dash');
        this.effects.delay(0.16, () => this.relics.onDash(this.player.x, this.player.y));
      } else this.dashBuffer -= dt;
    }
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
    this.updateRelicPickups(dt);
    this.terrain.update(dt, Math.hypot(move.x, move.y) > 0.1 || this.player.state === 'dash');
    this.allies.forEach((a) => a.update(dt));
    this.updateBox(dt);
    this.updateGrass();
    this.camTarget.setPosition(this.player.x, this.player.y - 40);
    this.updateTeaser(dt);
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
    if (this.mode === 'lobby') this.hud.setLobbySand(MetaStore.sand);
    else {
      this.hud.setCoins(this.coins);
      this.hud.setSand(this.sand);
    }
    this.hud.setDanger(this.dungeon.hpMul, this.dungeon.enemyDamage);
    this.hud.update(this.player, this.mode === 'lobby' ? '' : this.dungeon.label, this.runTime,
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
    this.fx.anim('vfx_aura', this.player.x, this.player.y - 20, 190);
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
      this.fx.burst(this.crucibleBar.cx + this.cameras.main.scrollX, this.crucibleBar.cy + this.cameras.main.scrollY, 120, color, 500);
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
    if (p.invulnerable || this.playerHidden) return;
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
    if (!this.player.invulnerable && this.relics.dodge()) {
      this.fx.floatText(this.player.x, this.player.y - 50, '閃避！', '#7ed4ff', 22);
      this.player.hurt(0);
      return;
    }
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
    // 擊殺停頓：一般怪極短（連殺時不重複），精英／Boss 較長
    if (!e.elite && !e.def.boss && this.time.now - this.lastKillStop > 250) {
      this.lastKillStop = this.time.now;
      this.hitStop(0.028);
    }
    if (e.elite || e.def.boss) {
      this.hitStop(e.def.boss ? 0.3 : 0.07);
      this.cameras.main.shake(e.def.boss ? 400 : 120, e.def.boss ? 0.012 : 0.005);
    }
    this.buffs.onKill(e);
    this.relics.onKill(e);
    if (e.elite) this.addSand(1, e.x, e.y);
    if (e.def.boss) {
      this.dropCoins(e.x, e.y, 25);
      this.addSand(12, e.x, e.y);
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
    if (WORLD.active) {
      // 大地圖的門就是牆上的拱門＋走廊，不另外畫
      this.doorSprites.forEach((s) => s.destroy());
      this.doorSprites = [];
      return;
    }
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
    this.doorSprites.forEach((s) => s.destroy());
    this.doorSprites = [];
    const portalArt = this.roomArt && this.textures.exists('door_open') && this.textures.exists('door_locked');
    for (const dir of Object.keys(DIRS) as Dir[]) {
      if (!room.doors[dir]) continue;
      if (portalArt) {
        // 時鐘齒輪傳送門：開著是藍色漩渦，鎖住是紅色沙漏封印。左右兩側壓扁一點做出透視感
        const key = this.doorsLocked ? 'door_locked' : 'door_open';
        const pos: Record<Dir, [number, number, number, number]> = {
          n: [cx, ARENA.y + 22, 156, 156],
          s: [cx, 736, 128, 128],
          w: [ARENA.x + 26, this.sideDoorY() + 64, 70, 128],
          e: [ARENA_RIGHT - 26, this.sideDoorY() + 64, 70, 128],
        };
        const [px, py, pw, ph] = pos[dir];
        const s = this.add.image(px, py, key).setOrigin(0.5, 1).setDisplaySize(pw, ph).setDepth(DEPTH.floor + 2);
        if (!this.doorsLocked) this.tweens.add({ targets: s, alpha: 0.82, duration: 700, yoyo: true, repeat: -1 });
        this.doorSprites.push(s);
        continue;
      }
      const [x, y, w, h] = rects[dir];
      if (this.roomArt) {
        // 背景圖上的門：後牆挖一個拱門，其餘三邊是發光的出入口
        g.fillStyle(0x07050c, 0.85);
        if (dir === 'n') {
          g.fillRoundedRect(x + 8, ARENA.y - 88, w - 16, 92, { tl: 56, tr: 56, bl: 0, br: 0 });
          g.lineStyle(5, 0xc9a35a, 1).strokeRoundedRect(x + 8, ARENA.y - 88, w - 16, 92, { tl: 56, tr: 56, bl: 0, br: 0 });
        } else g.fillRect(x, y, w, h);
      } else g.fillStyle(hexToInt(theme.floor), 1).fillRect(x, y, w, h);
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
    WORLD.locked = locked && WORLD.active;
    if (WORLD.active) this.refreshExits();
    this.drawDoors();
  }

  /** 玩家貼到開著的門就換房 */
  /** 左右門的高度：有傳送門美術時往上移（避開右下按鈕），判定、出現位置、圖都用同一個值 */
  private sideDoorY(): number {
    if (this.textures.exists('door_open')) return Math.round(ARENA.y + (ARENA_BOTTOM - ARENA.y) * 0.32);
    return (ARENA.y + ARENA_BOTTOM) / 2;
  }

  private sealedMsgT = 0;

  private checkDoors(): void {
    // 戰鬥中走到出口：提示一下（出口本身用碰撞擋住，不畫紅線）
    if (WORLD.active && this.doorsLocked && WORLD.layout && this.time.now - this.sealedMsgT > 1800) {
      const p = this.player;
      const i = WORLD.layout.interior;
      const near = WORLD.layout.corridors.some((c) => {
        if (c.dir === 'n') return p.y < i.y + 40 && p.x > c.x && p.x < c.x + c.w;
        if (c.dir === 's') return p.y > i.y + i.h - 40 && p.x > c.x && p.x < c.x + c.w;
        if (c.dir === 'w') return p.x < i.x + 40 && p.y > c.y && p.y < c.y + c.h;
        return p.x > i.x + i.w - 40 && p.y > c.y && p.y < c.y + c.h;
      });
      if (near) {
        this.sealedMsgT = this.time.now;
        this.fx.floatText(p.x, p.y - 110, '打倒所有敵人才能離開', '#ffd166', 20);
      }
    }
    if (this.transitioning || this.dungeon.phase !== 'explore' || this.doorsLocked) return;
    if (WORLD.active) {
      // 大地圖：走進走廊夠深就到下一間
      const dir = corridorExit(this.player.x, this.player.y);
      if (dir) this.dungeon.go(dir);
      return;
    }
    const p = this.player;
    const room = this.dungeon.current;
    const half = 60;
    const cx = (ARENA.x + ARENA_RIGHT) / 2;
    const edge = p.radius + 2;
    if (room.doors.n && p.y <= ARENA.y + edge && Math.abs(p.x - cx) < half) this.dungeon.go('n');
    else if (room.doors.s && p.y >= ARENA_BOTTOM - edge && Math.abs(p.x - cx) < half) this.dungeon.go('s');
    else if (room.doors.w && p.x <= ARENA.x + edge && Math.abs(p.y - this.sideDoorY()) < half + 10) this.dungeon.go('w');
    else if (room.doors.e && p.x >= ARENA_RIGHT - edge && Math.abs(p.y - this.sideDoorY()) < half + 10) this.dungeon.go('e');
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
      prev.relics = this.relicPickups.filter((r) => r.alive).map((r) => ({ id: r.relic.id, x: r.x, y: r.y }));
    }
    this.relicPickups.forEach((r) => r.destroy());
    this.relicPickups = (room.relics ?? []).map((r) => new RelicPickup(this, RELIC_MAP[r.id], r.x, r.y));
    room.relics = [];
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

    // 大地圖：冒險中的房間都是可探索的大房間；大廳維持一個畫面
    const worldRoom = this.mode === 'run' && room.type !== 'lobby';
    if (worldRoom) {
      this.enterWorldRoom(room, fromDir);
      this.terrain.load(room.terrain ?? []);
      this.clearRoomExtras();
      if (room.box) this.spawnBox(room.box.x, room.box.y);
      this.refreshModText();
      this.doorsLocked = false;
      this.drawDoors();
      this.refreshExits();
      this.encounters.setupRoom(room);
      this.minimap.draw();
      this.hud.setInfoY(this.minimap.bottom);
      if (room.type === 'exit') this.tutorial.notify('stairs');
      if (room.type === 'shop') this.tutorial.notify('shop');
      return;
    }
    this.leaveWorld();
    const cx = (ARENA.x + ARENA_RIGHT) / 2;
    const inset = 70;
    const p = this.player;
    if (fromDir === 'n') p.setPosition(cx, ARENA.y + inset);
    else if (fromDir === 's') p.setPosition(cx, ARENA_BOTTOM - inset);
    else if (fromDir === 'w') p.setPosition(ARENA.x + inset, this.sideDoorY());
    else if (fromDir === 'e') p.setPosition(ARENA_RIGHT - inset, this.sideDoorY());
    else p.setPosition(cx, ARENA.y + ARENA.h * 0.7);

    this.terrain.load(room.terrain ?? []);
    this.clearRoomExtras();
    if (room.box) this.spawnBox(room.box.x, room.box.y);
    if (room.type === 'lobby') this.drawArena(LOBBY_THEME);
    else if (room.type === 'rift_past') this.drawArena(RIFT_THEMES.past);
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

  /** 建立／套用大房間：碰撞、可走範圍、積木畫面、鏡頭跟隨，玩家出現在剛走出的門口 */
  private enterWorldRoom(room: Room, fromDir?: Dir): void {
    if (!room.layout) {
      const seed = this.layoutSeed + this.dungeon.floor * 31 + this.dungeon.regionIndex * 977;
      // 黑帝斯式：優先用手工場景（整張畫好的房間），沒載入才退回積木房間
      const pick = pickScene(room, seed);
      room.layout = this.textures.exists(pick.def.key)
        ? buildSceneLayout(room, pick.def, pick.flip)
        : generateLayout(room, seed, GAME_W);
      this.remapDecor(room, room.layout);
    }
    const l = room.layout;
    activateLayout(l);
    WORLD.locked = false;
    setArena(l.interior.x, l.interior.y, l.interior.w, l.interior.h);
    // 舊的單畫面背景收掉
    this.arenaGfx?.destroy();
    this.arenaGfx = undefined;
    this.roomBg?.destroy();
    this.roomBg = undefined;
    this.floorSprite?.destroy();
    this.floorSprite = undefined;
    this.vignette?.destroy();
    this.vignette = undefined;
    this.drawnTheme = undefined;
    const region = this.dungeon.region;
    const theme = room.type === 'rift_past' ? RIFT_THEMES.past : room.type === 'rift_future' ? RIFT_THEMES.future : region.theme;
    // 目前只有溫室有專屬積木；其他區域先把溫室積木染成該區色調
    const tint = room.type === 'rift_past' ? 0xd8b070 : room.type === 'rift_future' ? 0x9a80ff
      : region.id === 'lava' ? 0xffa080 : region.id === 'storm' ? 0x9aa0ff : undefined;
    this.roomRenderer.build(l, theme, 'gh', tint);
    const p = this.player;
    const i = l.interior;
    const start = fromDir ? entryPoint(fromDir) : { x: i.x + i.w / 2, y: i.y + i.h * 0.62 };
    p.setPosition(start.x, start.y);
    const cam = this.cameras.main;
    cam.setBounds(l.world.x, l.world.y, l.world.w, l.world.h);
    this.camTarget.setPosition(p.x, p.y - 40);
    cam.startFollow(this.camTarget, true, 0.14, 0.14);
    cam.centerOn(p.x, p.y - 40);
  }

  /** 出口圖示：下一間的房型（去過的變暗） */
  private refreshExits(): void {
    const room = this.dungeon.current;
    this.roomRenderer.setExits(WORLD.layout, this.doorsLocked, (dir) => {
      const d = DIRS[dir];
      const n = this.dungeon.roomAt(room.gx + d.dx, room.gy + d.dy);
      if (!n) return { visited: false };
      const t = n.type === 'rift_past' || n.type === 'rift_future' ? 'rift' : n.type;
      const frame = n.type === 'treasure' && n.used ? undefined : `room_${t}`;
      return { frame, visited: n.visited };
    });
  }

  /** 回到單畫面模式（大廳） */
  private leaveWorld(): void {
    if (!WORLD.active) return;
    activateLayout(undefined);
    WORLD.locked = false;
    resetArenaToScreen();
    this.roomRenderer.clear();
    this.cameras.main.stopFollow();
    this.cameras.main.removeBounds();
    this.cameras.main.setScroll(0, 0);
  }

  /** 樓層產生時的地形／紙箱／雜物架是用單畫面座標放的：第一次進大房間時等比放大並避開擋路物 */
  private remapDecor(room: Room, l: RoomLayout): void {
    const S = this.screenArena;
    const i = l.interior;
    const map = (x: number, y: number, r: number) => nearestFree(
      i.x + ((x - S.x) / S.w) * i.w, i.y + ((y - S.y) / S.h) * i.h, r,
    );
    room.terrain?.forEach((t) => Object.assign(t, map(t.x, t.y, t.r)));
    if (room.box) room.box = map(room.box.x, room.box.y, 60);
    if (room.shelf) Object.assign(room.shelf, map(room.shelf.x, room.shelf.y, 60));
  }

  onRoomCleared(room: Room): void {
    this.allies.forEach((a) => a.destroy());
    this.allies = [];
    this.teaser?.sprite.destroy();
    this.teaser = undefined;
    this.relics.onRoomClear();
    if (room.type === 'elite') this.addSand(3);
    if (room.type === 'rift_past') this.addSand(5);
    if (room.type === 'rift_future') this.addSand(8);
    if (room.type === 'elite' && Math.random() < 0.5) this.dropRelic(ARENA.x + ARENA.w / 2 + 140, ARENA.y + ARENA.h / 2);
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
    for (let i = 0; i < 3; i++) this.dropMaterial(ARENA.x + ARENA.w / 2 - 80 + i * 80, ARENA.y + ARENA.h / 2 + 80, undefined, true);
    this.dropWeapon(ARENA.x + ARENA.w / 2, ARENA.y + ARENA.h / 2 - 140, undefined, 2);
    this.dropRelic(GAME_W / 2 + 160, ARENA.y + ARENA.h / 2 - 140, undefined, 1);
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
    const c = this.causality;
    const hist = [c.flowers ? `守護花×${c.flowers}` : '', c.notes ? `Boss 血量 −${Math.round((1 - Math.pow(0.85, c.notes)) * 100)}%` : '',
      c.kitten ? '商店 75 折' : '', c.bury ? `埋砂×${c.bury}` : ''].filter(Boolean);
    if (hist.length) parts.push(`⌛ 改寫的歷史：${hist.join('、')}`);
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

  // ---- 時空因果 / 貓咪天性 ----

  /** 進入戰鬥：長出守護花 */
  onCombatStart(): void {
    for (let i = 0; i < this.causality.flowers; i++) {
      const a = (Math.PI * 2 * i) / Math.max(1, this.causality.flowers) + Math.random();
      const x = Math.max(ARENA.x + 40, Math.min(ARENA_RIGHT - 40, this.player.x + Math.cos(a) * 110));
      const y = Math.max(ARENA.y + 40, Math.min(ARENA_BOTTOM - 40, this.player.y + Math.sin(a) * 110));
      this.allies.push(new GuardianFlower(this, x, y));
    }
  }

  applyHistory(id: HistoryId): void {
    const c = this.causality;
    if (id === 'flower') c.flowers++;
    if (id === 'notes') c.notes++;
    if (id === 'kitten') c.kitten = true;
    if (id === 'bury') c.bury++;
    const h = FUN.history.find((x) => x.id === id)!;
    this.hud.showToast(`歷史被改寫了：${h.name}`, h.desc, '#e0c08a');
    Sound.play('fission');
    this.refreshModText();
  }

  private clearRoomExtras(): void {
    this.allies.forEach((a) => a.destroy());
    this.allies = [];
    this.box?.sprite.destroy();
    this.box?.label.destroy();
    this.box = undefined;
    this.teaser?.sprite.destroy();
    this.teaser = undefined;
    this.playerHidden = false;
  }

  private spawnBox(x: number, y: number): void {
    const art = this.textures.exists('obj_box');
    const sprite = this.add.image(x, y, art ? 'obj_box' : 'box').setDisplaySize(art ? 120 : 84, art ? 106 : 70)
      .setDepth(art ? ySortDepth(y + 30) : DEPTH.pickup);
    const label = this.add.text(x, y - 52, '紙箱（鑽進去躲 4 秒）', {
      fontFamily: FONT, fontSize: '15px', color: '#e8d0a8', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.pickup + 1);
    this.box = { x, y, time: 4, sprite, label };
  }

  /** 草叢：躲進去敵人就找不到（跟紙箱一樣，但沒有時間限制） */
  private updateGrass(): void {
    const p = this.player;
    const inside = WORLD.active && inGrass(p.x, p.y);
    if (inside && !this.grassHidden) this.fx.floatText(p.x, p.y - 90, '躲進草叢', '#9bff8a', 18);
    if (inside) {
      this.playerHidden = true;
      p.sprite.setAlpha(Math.min(p.sprite.alpha, 0.55));
    } else if (this.grassHidden && !(this.box && this.box.time > 0 && Math.abs(p.x - this.box.x) < 40 && Math.abs(p.y - this.box.y) < 34)) {
      this.playerHidden = false;
    }
    this.grassHidden = inside;
  }

  private updateBox(dt: number): void {
    const b = this.box;
    if (!b) return;
    const p = this.player;
    const inside = b.time > 0 && Math.abs(p.x - b.x) < 40 && Math.abs(p.y - b.y) < 34;
    if (inside && !this.playerHidden) {
      this.fx.floatText(b.x, b.y - 60, '躲進紙箱！', '#ffd166', 20);
      Sound.play('card');
    }
    this.playerHidden = inside;
    p.sprite.setAlpha(inside ? 0.25 : p.sprite.alpha);
    if (!inside && b.time > 0) b.label.setText(`紙箱（還能躲 ${b.time.toFixed(1)} 秒）`);
    if (inside) {
      b.time -= dt;
      b.label.setText(`躲藏中… ${b.time.toFixed(1)}s`);
      b.sprite.setRotation(Math.sin(this.time.now / 60) * 0.05);
      if (b.time <= 0) {
        this.playerHidden = false;
        b.label.setText('紙箱壞掉了');
        b.sprite.setAlpha(0.4).setRotation(0.3);
        this.fx.shatter(b.x, b.y, 0xc8a070, 30, 8);
      }
    }
  }

  private updateTeaser(dt: number): void {
    const active = this.roomMod === 'teaser' && !this.dungeon.current.cleared && this.dungeon.combatActive;
    if (!active) return;
    if (!this.teaser) {
      this.teaser = { sprite: this.add.image(this.player.x, this.player.y - 220, 'teaser').setDisplaySize(60, 80).setDepth(DEPTH.player + 2), t: 0 };
    }
    const t = this.teaser;
    t.t += dt;
    const cx = (ARENA.x + ARENA_RIGHT) / 2;
    const cy = (ARENA.y + ARENA_BOTTOM) / 2;
    const tx = cx + Math.cos(t.t * 0.6) * ARENA.w * 0.32;
    const ty = cy + Math.sin(t.t * 0.9) * ARENA.h * 0.28;
    t.sprite.setPosition(tx, ty).setRotation(Math.sin(t.t * 6) * 0.4);
    const p = this.player;
    const d = Math.hypot(tx - p.x, ty - p.y);
    if (d > 30 && p.state !== 'dash') {
      p.x += ((tx - p.x) / d) * 95 * dt;
      p.y += ((ty - p.y) / d) * 95 * dt;
    }
  }

  // ---- 大廳 ----

  private setupLobby(): void {
    this.dungeon.startLobby();
    this.player.godMode = true;
    this.minimap.setVisible(false);
    this.crucibleBar.setVisible(false);
    this.player.setPosition(GAME_W / 2, 440);
    const e = this.encounters;
    // 四隻貓：碰到就換角色
    CHARACTERS.forEach((c, i) => {
      const unlocked = ProgressStore.isUnlocked(c);
      const sel = c.id === this.character.id;
      e.spawn('statue', SAFE_X + 140 + i * 120, 210, undefined, c.id,
        unlocked ? `${sel ? '★ ' : ''}${c.name}` : `🔒 ${c.name}`);
    });
    e.spawn('cauldron', GAME_W / 2, 230);
    e.spawn('shelf', RIGHT - 340, 230);
    e.spawn('bookshelf', RIGHT - 180, 230);
    e.spawn('start', GAME_W / 2, 600);
    this.addEnemy(new Dummy(this, SAFE_X + 330, 500));
    this.hud.showBanner('貓咪煉金工房');
    this.hud.showToast(`${this.character.title}・${this.character.name}`,
      '碰其他貓咪換角色・大坩堝買永久升級・展示架解鎖聖物・木樁試打・走進傳送門出發', '#ffd166');
  }

  /** 大廳換角色 */
  lobbySelect(id: string): void {
    const c = CHARACTERS.find((x) => x.id === id);
    if (!c) return;
    if (!ProgressStore.isUnlocked(c)) {
      this.fx.floatText(this.player.x, this.player.y - 60, `🔒 ${c.unlock.text}（${ProgressStore.progressText(c)}）`, '#ff9aa8', 20);
      return;
    }
    if (c.id === this.character.id) return;
    ProgressStore.select(c.id);
    Sound.play('card');
    this.transition(() => this.scene.restart({ mode: 'lobby' }));
  }

  /** 在大廳打開大坩堝 / 展示架 / 圖鑑 */
  openOverlay(key: string, data?: object): void {
    this.scene.launch(key, data ?? {});
    this.scene.pause();
  }

  startRunFromLobby(): void {
    Sound.play('fission');
    this.riftTransition(true, () => this.scene.restart({ mode: 'run' }));
  }

  // ---- 聖物 / 時之砂 ----

  addSand(n: number, x?: number, y?: number): void {
    this.sand += n;
    const px = x ?? this.player.x;
    const py = y ?? this.player.y;
    this.fx.floatText(px, py - 70, `+${n} ⌛`, '#9fe3ff', 20);
  }

  /** 掉落聖物（不指定就從已解鎖的聖物依稀有度抽） */
  dropRelic(x: number, y: number, r?: RelicDef, minRarity: RarityIndex = 0): void {
    if (!r) {
      const w = DROP_RARITY.elite.map((v, i) => Math.max(0.1, v + DROP_RARITY.perWave[i] * this.dungeon.depthIndex));
      r = this.relics.roll(w, minRarity);
      if (!r) return;
    }
    x = Math.max(ARENA.x + 40, Math.min(ARENA_RIGHT - 40, x));
    y = Math.max(ARENA.y + 60, Math.min(ARENA_BOTTOM - 40, y));
    this.relicPickups.push(new RelicPickup(this, r, x, y));
  }

  private updateRelicPickups(dt: number): void {
    const p = this.player;
    for (const rp of this.relicPickups) {
      if (!rp.alive) continue;
      rp.update(dt);
      const inside = (p.x - rp.x) ** 2 + (p.y - rp.y) ** 2 < (p.radius + 30) ** 2;
      if (!inside) {
        rp.armed = true;
        continue;
      }
      if (!rp.armed) continue;
      rp.armed = false;
      if (!this.relics.full) {
        this.takeRelic(rp);
      } else {
        // 滿格：選一個丟掉
        this.scene.launch('Event', {
          title: `聖物欄已滿（${this.relics.maxSlots} 格）`,
          subtitle: `要用「${rp.relic.name}」換掉哪一個？\n${rp.relic.desc}`,
          color: RARITY[rp.relic.rarity].color,
          options: this.relics.owned.map((old) => ({
            label: `丟掉 ${old.name}`, desc: old.desc, enabled: true,
            onPick: () => {
              this.relics.replace(old.id, rp.relic);
              rp.destroy();
              this.announceRelic(rp.relic);
            },
          })),
          onClose: () => this.scene.resume(),
        });
        this.scene.pause();
      }
    }
    this.relicPickups = this.relicPickups.filter((r) => r.alive);
  }

  private takeRelic(rp: RelicPickup): void {
    this.relics.add(rp.relic);
    rp.destroy();
    this.announceRelic(rp.relic);
  }

  private announceRelic(r: RelicDef): void {
    Sound.play('pickup', r.rarity);
    this.hud.showToast(`聖物・${r.name}`, r.desc, RARITY[r.rarity].color);
    this.hud.setRelics(this.relics.owned);
  }

  // ---- 金幣 ----

  dropCoins(x: number, y: number, n: number): void {
    n = Math.round(n * (1 + this.mutations.value('greed') / 100) * (this.roomMod === 'golden' ? 3 : 1) * this.relics.coinMul);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 160;
      const sprite = this.add.image(x, y, 'coin').setDisplaySize(22, 22).setDepth(DEPTH.pickup + 2);
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
      // 金幣左右翻轉（依貼圖實際大小算比例，不會被拉長）
      const base = 22 / c.sprite.width;
      c.sprite.setPosition(c.x, c.y).setScale(base * (0.15 + 0.85 * Math.abs(Math.cos(c.t * 8))), base);
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
    const show = () => {
      const offers = this.mutations.roll(this.dungeon.depthIndex + 1, minRarity);
      this.scene.launch('CardSelect', {
        title,
        rerolls: this.rerolls,
        offers: offers.map((o) => ({ ...o, owned: this.mutations.value(o.def.id) })),
        onReroll: () => {
          if (this.rerolls <= 0) return;
          this.rerolls--;
          this.scene.stop('CardSelect');
          show();
        },
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
    };
    show();
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
      relics: this.relics.owned.map((r) => ({ id: r.id, name: r.name, icon: r.icon, color: RARITY[r.rarity].color, desc: r.desc })),
      sand: this.sand,
      weapons: this.weapons.slots.filter(Boolean).map((w) => ({ name: w!.name, color: RARITY[w!.rarity].color })),
      skill: `${this.character.skill.name}（冷卻 ${this.character.skill.cooldown} 秒）`,
      region: `${this.dungeon.label}　${formatTime(this.runTime)}`,
      drinks: this.buffs.drinks,
      elements: { ...this.buffs.elements },
      passives,
      mutations: this.mutations.owned().map((m) => ({
        id: m.def.id, name: m.def.name, icon: m.def.icon, value: `${Math.round(m.value * 10) / 10}${m.def.unit}`,
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
    // 時之砂：本局掉落 + 依樓層結算，倒下也保留
    const bonus = this.dungeon.globalFloor * 3 + (victory ? 30 : 0) + 20 * this.causality.bury;
    this.sand += bonus;
    MetaStore.addSand(this.sand);
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
