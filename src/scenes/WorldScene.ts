import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE, SCENES, TILE_SIZE as T } from '../config';
import { Player } from '../entities/Player';
import { Enemy, type EnemyKind } from '../entities/Enemy';
import { Boss } from '../entities/Boss';
import { KappaKing } from '../entities/KappaKing';
import { Daitengu } from '../entities/Daitengu';
import { OmniBoss } from '../entities/OmniBoss';
import jobs from '../data/jobs.json';
import { CombatSystem, type Breakable } from '../combat/CombatSystem';
import { floatText, ring } from '../combat/fx';
import npcs from '../data/npcs.json';
import dialogues from '../data/dialogues.json';
import { inputState, resetInput } from '../systems/inputState';
import { pickVariant, type DialogueVariant, type Line } from '../systems/dialogue';
import { enemyPower, endingRoute, canChangeJob, changeJob, gameState, gearLabel, giveRandomGear, openChest, statsOf, type Reward } from '../systems/gameState';
import { serialize, writeSave } from '../systems/save';
import { accept, offersFrom, onPickup, pickupVisible, questDef, readyFor, turnIn } from '../systems/quests';
import { FONT_FAMILY } from '../config';
import { sound } from '../audio/sound';
import { trackForMap } from '../audio/music';
import { grantAchievement, newlyUnlocked } from '../systems/achievements';
import { floorPlan, floorRewardRarity, TOWER_FLOORS } from '../systems/tower';
import { collectionReport } from '../systems/collection';
import { MAPS } from '../data/maps';
import { findInFront } from '../systems/interaction';
import { secretFlag } from '../systems/collection';
import { hudState, type MapMarker } from '../systems/hudState';
import { EV, type DialogueRequest, type HudInfo, type SaveRequest } from '../systems/events';
import type { Facing } from '../systems/movement';

type Chapter = 'ch1' | 'ch2' | 'ch3' | 'ch5' | 'endA' | 'endB' | 'endTrue';
interface WorldData { map?: string; spawn?: string; face?: Facing; intro?: boolean; respawn?: boolean; outro?: Chapter | boolean; floor?: number }
type BossLike = Boss | KappaKing | Daitengu | OmniBoss;
/** 每個 Boss 的對話與旗標 */
const BOSSES: Record<string, { name: string; intro: string; retry: string; seen: string; defeated: string; flags: string[]; outro: Chapter; tip: string; reward: { money: number; item: string; tier: number } }> = {
  tsuchigumo: { name: '土蜘蛛', intro: 'boss_intro', retry: 'boss_retry', seen: 'boss_seen', defeated: 'boss_defeated', flags: ['boss_defeated', 'chapter1_done'], outro: 'ch1',
    tip: '點亮四個角落的石燈籠，可以讓土蜘蛛動彈不得！', reward: { money: 500, item: '銀鑰匙', tier: 2 } },
  kappaking: { name: '河童王', intro: 'kappa_intro', retry: 'kappa_retry', seen: 'kappa_seen', defeated: 'kappa_defeated', flags: ['kappa_defeated', 'chapter2_done'], outro: 'ch2',
    tip: '打開四個角落的水閘，讓河童王頭上的皿乾掉！', reward: { money: 1200, item: '河童王的冠', tier: 3 } },
  daitengu: { name: '大天狗', intro: 'tengu_intro', retry: 'tengu_retry', seen: 'tengu_seen', defeated: 'tengu_defeated', flags: ['tengu_defeated', 'chapter3_done'], outro: 'ch3',
    tip: '敲響四個角落的神木之鈴，大天狗會從空中掉下來！', reward: { money: 2500, item: '大天狗的團扇', tier: 4 } },
  shuten: { name: '酒吞童子', intro: 'shuten_intro', retry: 'shuten_retry', seen: 'shuten_seen', defeated: 'shuten_defeated', flags: ['shuten_defeated'], outro: 'endB',
    tip: '打破四個角落的神便鬼毒酒酒樽，酒吞童子會醉倒！', reward: { money: 5000, item: '酒吞的葫蘆', tier: 4 } },
  hyakki: { name: '百鬼之主', intro: 'hyakki_intro', retry: 'hyakki_retry', seen: 'hyakki_seen', defeated: 'hyakki_defeated', flags: ['hyakki_defeated', 'game_cleared', 'ending_true'], outro: 'endTrue',
    tip: '打碎四個角落的結界石，百鬼之主會動不了！', reward: { money: 9999, item: '真・神器', tier: 4 } },
};
const BOSSES_CH5 = {
  umibozu: { name: '海坊主', intro: 'umibozu_intro', retry: 'umibozu_retry', seen: 'umibozu_seen', defeated: 'umibozu_defeated', flags: ['umibozu_defeated', 'chapter5_done'], outro: 'ch5' as Chapter,
    tip: '敲響四個角落的龍宮寶珠，海坊主會平靜下來！', reward: { money: 8000, item: '龍宮的寶珠', tier: 5 } },
};
Object.assign(BOSSES, BOSSES_CH5);
/** 神器碎片放在這些寶箱裡（舊存檔開過的話，最終章開始時補發） */
const SHARD_CHESTS = ['forest_chest_secret', 'swamp_chest_secret', 'mt_chest_secret', 'oni_chest_secret'];

type Kind = 'npc' | 'chest' | 'sign' | 'well' | 'blocker' | 'lantern' | 'bossdoor' | 'jizo' | 'board' | 'pickup' | 'lever' | 'sluice' | 'trial' | 'relay' | 'sealgate' | 'portal' | 'fishspot' | 'cook';
interface Thing { id: string; kind: Kind; x: number; y: number; sprite: Phaser.GameObjects.Sprite; props: Record<string, unknown> }
interface Block { sprite: Phaser.GameObjects.Sprite; tx: number; ty: number; group: string; dir: string; moving: boolean; pushMs: number }
interface Plate { sprite: Phaser.GameObjects.Sprite; tx: number; ty: number; group: string }
interface Gate { sprite: Phaser.GameObjects.Sprite; tx: number; ty: number; group: string; open: boolean; water?: boolean }
interface Crack extends Breakable { sprite: Phaser.GameObjects.Sprite; tx: number; ty: number; id: string }
interface Pool { x: number; y: number; until: number; next: number; gfx: Phaser.GameObjects.Arc; fire?: boolean }

const FRAME = {
  chest: [25, 26], ironChest: [45, 46], goldChest: [47, 48], shimenawa: 27, well: 28, sign: 29,
  plate: [38, 39], block: 40, gate: 41, cracked: 42, lantern: [43, 44], bossDoor: 49, jizo: 51, cocoon: 52, web: 53, board: 54, plank: 59, lever: [63, 64], waterGate: 65, bell: 69, trial: [70, 71], barrel: 78, sealStone: 79, sealDoor: 80, cookpot: 81, pearl: 87,
};
const LABEL: Record<Kind, string> = { npc: '對話', chest: '打開', sign: '查看', well: '調查', blocker: '調查', lantern: '點燈', bossdoor: '調查', jizo: '參拜', board: '告示', pickup: '撿起', lever: '拉下', sluice: '開水閘', trial: '挑戰', relay: '點燈', sealgate: '調查', portal: '進入', fishspot: '釣魚', cook: '料理' };
const DIRS: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const gateFlag = (group: string) => `gate:${group}`;

function propsOf(o: Phaser.Types.Tilemaps.TiledObject): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of (o.properties ?? []) as { name: string; value: unknown }[]) out[p.name] = p.value;
  return out;
}
const tileOf = (x: number, y: number) => [Math.floor(x / T), Math.floor(y / T)] as const;

export class WorldScene extends Phaser.Scene {
  private player!: Player;
  private combat!: CombatSystem;
  private enemies: Enemy[] = [];
  private things: Thing[] = [];
  private blocks: Block[] = [];
  private plates: Plate[] = [];
  private gates: Gate[] = [];
  private cracks: Crack[] = [];
  private webs: Crack[] = [];
  private breakables: Breakable[] = [];
  private pools: Pool[] = [];
  private boss?: BossLike;
  private cameo?: Phaser.GameObjects.Sprite;
  private winds: { x: number; y: number; w: number; h: number; dx: number; dy: number; power: number }[] = [];
  private tornadoes: { gfx: Phaser.GameObjects.Graphics; x: number; y: number; until: number; next: number }[] = [];
  private trialEnemies: Enemy[] = [];
  private trialWave = 0;
  private speedUntil = 0;
  private speedNextToast = 0;
  private mapKey = '';
  private areaName = '';
  private hintTimer = 0;
  private floor = 0;
  private pet?: Phaser.GameObjects.Sprite;
  private petShotAt = 0;
  private petFindAt = 0;
  private floorCleared = false;
  private achTimer = 0;
  private pickupObjs: Phaser.Types.Tilemaps.TiledObject[] = [];
  private questTimer = 0;
  private icons = new Map<Thing, Phaser.GameObjects.Text>();
  private lanternNext: Record<string, number> = {};
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private obstacles!: Phaser.Tilemaps.TilemapLayer;
  private map!: Phaser.Tilemaps.Tilemap;
  private transitioning = false;
  private lastHud = '';
  private markerTimer = 0;
  private playerGlow?: Phaser.GameObjects.Container;

  constructor() { super(SCENES.world); }

  create(data: WorldData): void {
    resetInput();
    this.things = []; this.enemies = []; this.blocks = []; this.plates = []; this.gates = []; this.cracks = [];
    this.webs = []; this.breakables = []; this.pools = []; this.boss = undefined;
    this.pickupObjs = []; this.icons = new Map(); this.cameo = undefined;
    this.winds = []; this.tornadoes = []; this.trialEnemies = []; this.trialWave = 0; this.speedUntil = 0;
    hudState.boss = { visible: false, name: '', hp: 0, max: 1 };
    this.lanternNext = {};
    this.transitioning = false;
    this.lastHud = '';
    this.playerGlow = undefined;
    const mapKey = this.mapKey = data.map ?? 'village';
    const spawnName = data.spawn ?? 'start';
    this.floor = mapKey === 'tower' ? (data.floor ?? 1) : 0;
    this.floorCleared = false;
    // 百鬼塔裡死掉會回到進塔前的地方
    if (!this.floor) gameState.checkpoint = { map: mapKey, spawn: spawnName };
    gameState.flags.add(`visited:${mapKey}`);
    if (data.respawn) {
      const st = statsOf(gameState);
      gameState.hp = st.maxHp; gameState.mp = st.maxMp; gameState.statuses = {};
    }

    const map = this.map = this.make.tilemap({ key: mapKey });
    const tiles = map.addTilesetImage('village_tiles', 'tiles');
    if (!tiles) throw new Error('找不到 tileset village_tiles');
    map.createLayer('ground', tiles, 0, 0);
    this.obstacles = map.createLayer('obstacles', tiles, 0, 0)!;
    this.obstacles.setCollisionByProperty({ collides: true });

    const objects = map.getObjectLayer('objects')?.objects ?? [];
    const spawn = objects.find((o) => o.type === 'spawn' && o.name === spawnName) ?? objects.find((o) => o.type === 'spawn');
    this.player = new Player(this, spawn?.x ?? 64, spawn?.y ?? 64);
    if (data.face) { this.player.setFacing(data.face); this.player.anims.play(`idle-${data.face}`); }

    this.pet = undefined;
    if (gameState.flags.has('pet_kon') && mapKey !== 'shrine') {
      this.pet = this.add.sprite(this.player.x - 14, this.player.y + 4, 'npcs', (npcs as Record<string, { frame: number }>).kon.frame).setScale(0.85);
      this.petFindAt = this.time.now + 90000;
    }
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.physics.add.collider(this.player, this.obstacles);
    this.solids = this.physics.add.staticGroup();
    this.physics.add.collider(this.player, this.solids);

    Enemy.power = enemyPower(gameState) * (this.floor ? floorPlan(this.floor).power : 1);
    for (const o of objects) this.buildObject(o);
    if (this.floor) this.buildTowerFloor();
    this.restoreSolvedPuzzles();
    this.syncQuests();

    this.combat = new CombatSystem(this, this.player, this.enemies, this.obstacles, {
      onDeath: () => this.onDeath(),
      onHudChange: () => this.game.events.emit(EV.hud, null),
      toast: (m) => this.game.events.emit(EV.toast, m),
    });
    this.combat.breakables = this.breakables;
    this.combat.dropTier = Number((Array.isArray(map.properties) ? map.properties as { name: string; value: unknown }[] : []).find((p) => p.name === 'tier')?.value ?? 1);

    const cam = this.cameras.main;
    cam.setZoom(RENDER_SCALE);
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    if (map.widthInPixels < GAME_WIDTH || map.heightInPixels < GAME_HEIGHT) {
      cam.removeBounds();
      cam.centerOn(map.widthInPixels / 2, map.heightInPixels / 2);
    } else {
      cam.startFollow(this.player, true, 0.15, 0.15);
    }
    cam.setRoundPixels(true);
    cam.fadeIn(300, 20, 18, 28);

    const props = (Array.isArray(map.properties) ? map.properties : []) as { name: string; value: unknown }[];
    const prop = (k: string) => props.find((p) => p.name === k)?.value;
    const areaName = this.areaName = this.floor ? `百鬼塔　第 ${this.floor} 層` : String(prop('displayName') ?? '');
    if (prop('fog')) this.addFog();
    if (prop('dark')) this.addDarkness(objects);
    this.buildMinimap();

    if (!this.scene.isActive(SCENES.ui)) this.scene.launch(SCENES.ui, { areaName });
    else this.game.events.emit(EV.area, areaName);

    sound.music(trackForMap(mapKey));
    // 自動存檔（PRD 10）：每次進入地圖
    if (!this.floor) writeSave('auto', serialize(gameState, mapKey, spawnName, areaName));

    const onWarp = (w: { map: string; spawn: string }) => this.goTo(w.map, w.spawn, 'down');
    this.game.events.on(EV.warp, onWarp);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(EV.warp, onWarp));

    if (this.boss && this.floor) this.time.delayedCall(800, () => this.boss?.start(this.time.now));
    else if (this.boss) this.time.delayedCall(600, () => this.bossIntro());
    if (data.outro) this.time.delayedCall(600, () => this.chapterOutro(typeof data.outro === 'string' ? data.outro : 'ch1'));
    if (data.intro) this.time.delayedCall(700, () => this.say([
      ['燈', '……嗯，睡過頭了！'],
      ['燈', '爺爺好像留了字條在房間裡。先看看再出門吧。'],
    ]));
  }

  // ---------- 物件 ----------
  private buildObject(o: Phaser.Types.Tilemaps.TiledObject): void {
    const props = propsOf(o);
    const x = o.x ?? 0, y = o.y ?? 0;
    const [tx, ty] = tileOf(x, y);
    const solid = (sprite: Phaser.GameObjects.Sprite, w = 12, h = 8, ox = 2, oy = 8) => {
      this.solids.add(sprite);
      (sprite.body as Phaser.Physics.Arcade.StaticBody).setSize(w, h).setOffset(ox, oy);
    };
    const add = (kind: Kind, sprite: Phaser.GameObjects.Sprite, isSolid = true) => {
      sprite.setDepth(y);
      if (isSolid) solid(sprite);
      this.things.push({ id: o.name, kind, x, y, sprite, props });
      return sprite;
    };

    switch (o.type) {
      case 'exit': {
        const zone = this.add.zone(x, y, o.width ?? 16, o.height ?? 16).setOrigin(0);
        this.physics.add.existing(zone, true);
        this.physics.add.overlap(this.player, zone, () => this.goTo(String(props.map), String(props.spawn), props.face as Facing));
        break;
      }
      case 'secret': {
        if (gameState.flags.has(secretFlag(o.name))) break;
        const zone = this.add.zone(x, y, o.width ?? 16, o.height ?? 16).setOrigin(0);
        this.physics.add.existing(zone, true);
        this.physics.add.overlap(this.player, zone, () => {
          if (gameState.flags.has(secretFlag(o.name))) return;
          gameState.flags.add(secretFlag(o.name));
          this.game.events.emit(EV.toast, '發現了隱藏的地方！');
          this.checkCollectionShard();
        });
        break;
      }
      case 'npc': {
        if (props.showFlag && !gameState.flags.has(String(props.showFlag))) break;
        const frame = (npcs as Record<string, { frame: number }>)[String(props.npc)]?.frame ?? 0;
        const s = this.add.sprite(x, y, 'npcs', frame);
        this.tweens.add({ targets: s, duration: 600, repeat: -1, yoyo: true, onYoyo: () => s.setFrame(frame + 1), onRepeat: () => s.setFrame(frame) });
        add('npc', s);
        break;
      }
      case 'chest': {
        const frames = props.key ? FRAME.ironChest : props.guard ? FRAME.goldChest : FRAME.chest;
        add('chest', this.add.sprite(x, y, 'tilesheet', frames[gameState.openedChests.has(o.name) ? 1 : 0]));
        break;
      }
      case 'sign': add('sign', this.add.sprite(x, y, 'tilesheet', FRAME.sign)); break;
      case 'well': add('well', this.add.sprite(x, y, 'tilesheet', FRAME.well)); break;
      case 'jizo': add('jizo', this.add.sprite(x, y, 'tilesheet', FRAME.jizo)); break;
      case 'fishspot': {
        const fs = add('fishspot', this.add.sprite(x, y, 'fx', 14).setAlpha(0.8), false);
        this.tweens.add({ targets: fs, scale: 1.25, alpha: 0.4, duration: 900, yoyo: true, repeat: -1 });
        break;
      }
      case 'cook': add('cook', this.add.sprite(x, y, 'tilesheet', FRAME.cookpot)); break;
      case 'portal': {
        if (props.showFlag && !gameState.flags.has(String(props.showFlag))) break;
        const pt = add('portal', this.add.sprite(x, y, 'tilesheet', 9).setTint(0xff6a8a));
        const glow = this.add.circle(x, y, 10, 0xb08aff, 0.25).setDepth(y - 1).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: glow, scale: 1.6, alpha: 0.05, duration: 900, yoyo: true, repeat: -1 });
        void pt;
        break;
      }
      case 'lever': add('lever', this.add.sprite(x, y, 'tilesheet', FRAME.lever[gameState.flags.has(`lever:${o.name}`) ? 1 : 0])); break;
      case 'sluice': add('sluice', this.add.sprite(x, y, 'tilesheet', FRAME.lever[0])); break;
      case 'trial': add('trial', this.add.sprite(x, y, 'tilesheet', FRAME.trial[gameState.flags.has(`trial:${props.trial}`) ? 1 : 0])); break;
      case 'relay': add('relay', this.add.sprite(x, y, 'tilesheet', FRAME.lantern[0])); break;
      case 'wind': {
        const zone = { x, y, w: o.width ?? 16, h: o.height ?? 16, dx: Number(props.dx), dy: Number(props.dy), power: Number(props.power) };
        this.winds.push(zone);
        // 風的線條
        for (let i = 0; i < Math.ceil((zone.w * zone.h) / 900); i++) {
          const sx = x + Math.random() * zone.w, sy = y + Math.random() * zone.h;
          const line = this.add.rectangle(sx, sy, zone.dx ? 8 : 1, zone.dy ? 8 : 1, 0xffffff, 0.35).setDepth(150000);
          this.tweens.add({ targets: line, x: sx + zone.dx * 40, y: sy + zone.dy * 40, alpha: 0, duration: 900 + Math.random() * 500, repeat: -1, delay: Math.random() * 800 });
        }
        break;
      }
      case 'sealgate': {
        if (gameState.flags.has(`seal:${o.name}`)) break;
        const sg = add('sealgate', this.add.sprite(x, y, 'tilesheet', FRAME.sealDoor));
        (sg.body as Phaser.Physics.Arcade.StaticBody).setSize(16, 16).setOffset(0, 0);
        break;
      }
      case 'barrel': case 'sealstone': case 'pearlstone': {
        const s3 = this.add.sprite(x, y, 'tilesheet', o.type === 'barrel' ? FRAME.barrel : o.type === 'pearlstone' ? FRAME.pearl : FRAME.sealStone).setDepth(y);
        solid(s3);
        const br: Breakable = { x, y, alive: true, onBreak: () => this.breakStunObject(br, s3, o.type === 'barrel', o.type === 'pearlstone') };
        this.breakables.push(br);
        break;
      }
      case 'bell': {
        const s2 = this.add.sprite(x, y, 'tilesheet', FRAME.bell).setDepth(y);
        solid(s2);
        const br: Breakable = { x, y, alive: true, onBreak: () => this.ringBell(br, s2) };
        this.breakables.push(br);
        break;
      }
      case 'watergate': {
        const s = this.add.sprite(x, y, 'tilesheet', FRAME.waterGate).setDepth(1);
        solid(s, 16, 16, 0, 0);
        this.gates.push({ sprite: s, tx, ty, group: String(props.group), open: false, water: true });
        break;
      }
      case 'cameo': {
        if (gameState.flags.has(String(props.hideFlag ?? 'kappa_defeated'))) break;
        const frame = (npcs as Record<string, { frame: number }>)[String(props.npc)]?.frame ?? 0;
        this.cameo = this.add.sprite(x, y, 'npcs', frame).setDepth(y);
        break;
      }
      case 'board': add('board', this.add.sprite(x, y, 'tilesheet', FRAME.board)); break;
      case 'pickup': this.pickupObjs.push(o); break;
      case 'cocoon': {
        if (gameState.flags.has('boss_defeated')) break;
        const c = this.add.sprite(x, y, 'tilesheet', FRAME.cocoon).setDepth(y);
        solid(c);
        this.tweens.add({ targets: c, angle: { from: -4, to: 4 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        break;
      }
      case 'boss': {
        const kind = String(props.kind ?? 'tsuchigumo');
        if (!this.floor && gameState.flags.has(BOSSES[kind].defeated)) break;
        const b = this.boss = this.makeBoss(kind, x, y);
        if (b instanceof OmniBoss) b.arena = { x: 2 * T, y: 2 * T, w: (this.map.width - 4) * T, h: (this.map.height - 4) * T };
        b.on('breath', (_: Enemy, br: { x: number; y: number; dir: { x: number; y: number } }) => { for (let i = 1; i <= 3; i++) this.addPool(br.x + br.dir.x * 30 * i, br.y + br.dir.y * 30 * i, true); });
        b.on('gale', (en: Enemy, g: { x: number; y: number; r: number }) => this.combat.enemyGale(en, g));
        b.on('tornado', (_: Enemy, at: { x: number; y: number }) => this.addTornado(at.x, at.y));
        if (b instanceof KappaKing) b.arena = { x: 2 * T, y: 2 * T, w: 20 * T, h: 12 * T };
        b.on('band', (en: Enemy, band: { y: number; h: number; mult: number }) => this.combat.enemyBand(en, band));
        this.physics.add.collider(b, this.obstacles);
        b.minionCount = () => this.enemies.filter((e) => e.alive && e !== b).length;
        b.on('shoot', (en: Enemy, dir: { x: number; y: number }, speed?: number) => this.combat.enemyShoot(en, dir, speed));
        b.on('aoe', (en: Enemy, a: { x: number; y: number; r: number; mult?: number }) => this.combat.enemyAoe(en, a));
        b.on('summon', () => { sound.sfx('roar'); this.summonSpiders(); });
        b.on('pool', (_: Enemy, at: { x: number; y: number }) => this.addPool(at.x, at.y));
        b.on('webs', (_: Enemy, at: { x: number; y: number }) => this.spawnWebs(at.x, at.y));
        b.on('phase', (_: Enemy, p: number) => {
          sound.sfx('roar');
          const nm = BOSSES[kind].name;
          this.game.events.emit(EV.toast, p === 2 ? `${nm}召喚了手下！` : `${nm}發狂了！動作變快了`);
        });
        b.on('killed', () => this.onBossDefeated());
        this.enemies.push(b);
        break;
      }
      case 'bosslantern': {
        const s2 = this.add.sprite(x, y, 'tilesheet', FRAME.lantern[0]).setDepth(y);
        solid(s2);
        const br: Breakable = { x, y, alive: true, onBreak: () => this.lightBossLantern(br, s2) };
        this.breakables.push(br);
        break;
      }
      case 'bossdoor': {
        const s = add('bossdoor', this.add.sprite(x, y, 'tilesheet', FRAME.bossDoor));
        (s.body as Phaser.Physics.Arcade.StaticBody).setSize(16, 16).setOffset(0, 0);
        break;
      }
      case 'lantern': {
        const group = String(props.group);
        this.lanternNext[group] ??= 1;
        add('lantern', this.add.sprite(x, y, 'tilesheet', FRAME.lantern[0]));
        break;
      }
      case 'blocker': {
        if (gameState.flags.has(String(props.flag))) break;
        const s = add('blocker', this.add.sprite(x, y, 'tilesheet', FRAME.shimenawa));
        (s.body as Phaser.Physics.Arcade.StaticBody).setSize(16, 16).setOffset(0, 0);
        break;
      }
      case 'block': {
        const s = this.add.sprite(x, y, 'tilesheet', FRAME.block).setDepth(y);
        solid(s, 16, 16, 0, 0);
        this.blocks.push({ sprite: s, tx, ty, group: String(props.group), dir: String(props.dir), moving: false, pushMs: 0 });
        break;
      }
      case 'plate': {
        const s = this.add.sprite(x, y, 'tilesheet', FRAME.plate[0]).setDepth(1);
        this.plates.push({ sprite: s, tx, ty, group: String(props.group) });
        break;
      }
      case 'gate': {
        const s = this.add.sprite(x, y, 'tilesheet', FRAME.gate).setDepth(y);
        solid(s, 16, 16, 0, 0);
        this.gates.push({ sprite: s, tx, ty, group: String(props.group), open: false });
        break;
      }
      case 'cracked': {
        if (gameState.flags.has(secretFlag(o.name))) break;
        const s = this.add.sprite(x, y, 'tilesheet', FRAME.cracked).setDepth(y);
        solid(s, 16, 16, 0, 0);
        const c: Crack = { sprite: s, tx, ty, id: o.name, x, y, alive: true, onBreak: () => this.breakWall(c) };
        this.cracks.push(c);
        this.breakables.push(c);
        break;
      }
      case 'enemy': {
        const e = new Enemy(this, x, y, props.kind as EnemyKind, gameState.difficulty, props.guard as string | undefined);
        this.physics.add.collider(e, this.obstacles);
        this.physics.add.collider(e, this.solids);
        if (e.kind === 'dummy') this.physics.add.collider(this.player, e);
        e.on('shoot', (en: Enemy, dir: { x: number; y: number }) => this.combat.enemyShoot(en, dir));
        e.on('aoe', (en: Enemy, a: { x: number; y: number; r: number }) => this.combat.enemyAoe(en, a));
        e.on('killed', (en: Enemy) => this.onEnemyKilled(en));
        this.enemies.push(e);
        break;
      }
      case 'foxfire': {
        const glow = this.add.circle(x, y, 3, 0x7fd8ff, 0.85).setDepth(100000).setBlendMode(Phaser.BlendModes.ADD);
        const halo = this.add.circle(x, y, 7, 0x7fd8ff, 0.25).setDepth(100000).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: [glow, halo], y: y - 5, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        this.tweens.add({ targets: halo, scale: 1.5, alpha: 0.08, duration: 900, yoyo: true, repeat: -1 });
        break;
      }
    }
  }

  /** 守衛寶箱：守護它的敵人還活著就封住 */
  private isSealed(t: Thing): boolean {
    const g = t.props.guard;
    return !!g && this.enemies.some((e) => e.alive && e.guard === g);
  }

  /** 拉桿：同一組全部拉下就打開水門 */
  private pullLever(t: Thing): void {
    const key = `lever:${t.id}`, group = String(t.props.group);
    if (gameState.flags.has(key)) { this.game.events.emit(EV.toast, '拉桿已經拉下了'); return; }
    gameState.flags.add(key);
    t.sprite.setFrame(FRAME.lever[1]);
    sound.sfx('select');
    const all = this.things.filter((x) => x.kind === 'lever' && x.props.group === group);
    const total = Math.max(all.length, this.leverTotal(group));
    const on = [...gameState.flags].filter((f) => f.startsWith('lever:') && this.leverGroupOf(f.slice(6)) === group).length;
    if (on >= total) this.solveGroup(group);
    else this.game.events.emit(EV.toast, `拉下了拉桿（${on}/${total}）……遠處傳來水聲`);
  }

  /** 同一組的拉桿可能分散在地圖各處：從地圖物件算總數 */
  private leverTotal(group: string): number {
    return (this.map.getObjectLayer('objects')?.objects ?? []).filter((o) => o.type === 'lever' && propsOf(o).group === group).length;
  }
  private leverGroupOf(id: string): string | undefined {
    const o = (this.map.getObjectLayer('objects')?.objects ?? []).find((x) => x.type === 'lever' && x.name === id);
    return o ? String(propsOf(o).group) : undefined;
  }

  private openSluice(t: Thing): void {
    if (t.sprite.frame.name.toString() === String(FRAME.lever[1])) { this.game.events.emit(EV.toast, '水閘還在關回去的途中……'); return; }
    t.sprite.setFrame(FRAME.lever[1]);
    sound.sfx('gate');
    ring(this, t.x, t.y, 30, 0x5ab0e8, 500);
    if (this.boss?.alive && this.boss.started) { this.boss.stun(4000); this.game.events.emit(EV.toast, '水退了！河童王頭上的皿乾掉了！'); }
    this.time.delayedCall(15000, () => { if (t.sprite.active) t.sprite.setFrame(FRAME.lever[0]); });
  }

  // ---------- 寵物小紺 ----------
  private updatePet(locked: boolean): void {
    const pet = this.pet!, now = this.time.now, a = this.player.aim;
    const tx = this.player.x - a.x * 16 - a.y * 6, ty = this.player.y - a.y * 12 + 3;
    pet.setPosition(pet.x + (tx - pet.x) * 0.12, pet.y + (ty - pet.y) * 0.12).setDepth(pet.y);
    pet.setFrame((npcs as Record<string, { frame: number }>).kon.frame + (Math.floor(now / 300) % 2)).setFlipX(tx < pet.x - 1);
    if (locked) return;
    // 攻擊：附近有妖怪就丟狐火
    if (now >= this.petShotAt) {
      const e = this.enemies.find((x) => x.alive && x.kind !== 'dummy' && Math.hypot(x.center.x - pet.x, x.center.y - pet.y) < 95);
      if (e) { this.petShotAt = now + 2500; this.combat.petShot({ x: pet.x, y: pet.y - 4 }, e); }
    }
    // 幫忙撿任務物品
    const pk = this.things.find((t) => t.kind === 'pickup' && Math.hypot(t.x - pet.x, t.y - pet.y) < 30);
    if (pk) { this.game.events.emit(EV.toast, '小紺幫你撿起來了！'); this.interact(pk); }
    // 偶爾挖到東西
    if (now >= this.petFindAt) {
      this.petFindAt = now + 150000;
      const finds: [string, number][] = [['回復丸', 1], ['靈水', 1], ['玉鋼', 1], ['狐火的殘焰', 2], ['萬能符', 1]];
      if (Math.random() < 0.4) { const m = Phaser.Math.Between(30, 120); gameState.money += m; this.game.events.emit(EV.toast, `小紺挖到了 ${m} 文！`); }
      else { const [n, c] = finds[Math.floor(Math.random() * finds.length)]; gameState.items[n] = (gameState.items[n] ?? 0) + c; this.game.events.emit(EV.toast, `小紺挖到了 ${n} ×${c}！`); }
      ring(this, pet.x, pet.y, 10, 0xf2c94c, 400);
    }
  }

  // ---------- 百鬼塔 ----------
  private makeBoss(kind: string, x: number, y: number): BossLike {
    return kind === 'kappaking' ? new KappaKing(this, x, y, gameState.difficulty) : kind === 'daitengu' ? new Daitengu(this, x, y, gameState.difficulty)
      : kind === 'shuten' || kind === 'hyakki' || kind === 'umibozu' ? new OmniBoss(this, x, y, kind, gameState.difficulty) : new Boss(this, x, y, gameState.difficulty);
  }

  private buildTowerFloor(): void {
    const plan = floorPlan(this.floor);
    const W = this.map.width, H = this.map.height;
    plan.enemies.forEach((k, i) => {
      const a = (i / Math.max(1, plan.enemies.length)) * Math.PI * 2;
      const x = Phaser.Math.Clamp(W * T / 2 + Math.cos(a) * 110, 3 * T, (W - 3) * T), y = Phaser.Math.Clamp(5 * T + Math.sin(a) * 50, 3 * T, (H - 5) * T);
      this.buildObject({ id: 900 + i, name: `tower_e_${i}`, type: 'enemy', x, y, properties: [{ name: 'kind', type: 'string', value: k }] } as unknown as Phaser.Types.Tilemaps.TiledObject);
    });
    if (plan.boss) this.buildObject({ id: 999, name: 'tower_boss', type: 'boss', x: W * T / 2, y: 4 * T, properties: [{ name: 'kind', type: 'string', value: plan.boss }] } as unknown as Phaser.Types.Tilemaps.TiledObject);
  }

  /** 這層的妖怪全倒：給獎勵、出現往上的樓梯 */
  private clearTowerFloor(): void {
    this.floorCleared = true;
    sound.sfx('gate');
    const first = this.floor > gameState.towerBest;
    gameState.towerBest = Math.max(gameState.towerBest, this.floor);
    const cx = this.map.width * T / 2, cy = 6 * T;
    const money = 200 * this.floor;
    gameState.money += money;
    if (first) {
      const g = giveRandomGear(gameState, Math.random, 4, floorRewardRarity(this.floor));
      this.game.events.emit(EV.toast, `第一次通過第 ${this.floor} 層！獲得 ${money} 文${g ? `、${gearLabel(g)}` : '（背包滿了，裝備拿不到）'}`);
    } else this.game.events.emit(EV.toast, `通過第 ${this.floor} 層！獲得 ${money} 文`);
    const last = this.floor >= TOWER_FLOORS;
    const stair = this.add.sprite(cx, 2 * T + 8, 'tilesheet', 36).setDepth(1);
    ring(this, stair.x, stair.y, 16, 0xb08aff, 600);
    const zone = this.add.zone(cx - 8, 2 * T, 16, 16).setOrigin(0);
    this.physics.add.existing(zone, true);
    this.physics.add.overlap(this.player, zone, () => {
      if (last) { gameState.flags.add('tower_cleared'); this.goTo('village', 'jizo', 'down'); this.time.delayedCall(900, () => this.game.events.emit(EV.banner, { title: '百鬼塔制霸', sub: '最高樓層的妖氣散去了', duration: 3000 })); }
      else this.goTo('tower', 'entry', 'up', { floor: this.floor + 1 });
    });
    this.game.events.emit(EV.banner, { title: last ? '百鬼塔　制霸！' : `第 ${this.floor} 層　通過`, sub: last ? '走進樓梯回到村子' : '往上的樓梯出現了', duration: 1600 });
    void cy;
  }

  // ---------- 天狗山的試煉 ----------
  private startTrial(t: Thing): void {
    const kind = String(t.props.trial);
    if (gameState.flags.has(`trial:${kind}`)) { this.game.events.emit(EV.toast, '這個試煉已經通過了'); return; }
    if (kind === 'wisdom') { this.runDialogue(String(t.props.dialogue), () => this.checkTrials()); return; }
    if (kind === 'power') {
      if (this.trialWave) { this.game.events.emit(EV.toast, '試煉進行中！打倒所有妖怪'); return; }
      this.say([['天狗的聲音', '「力之試煉。打倒吾之眷屬，證明汝之力量！」']], () => this.spawnTrialWave(t, 1));
      return;
    }
    if (kind === 'speed') {
      if (this.time.now < this.speedUntil) return;
      this.say([['天狗的聲音', '「速之試煉。25 息之內，點亮這片原野上的 4 座石燈籠！」']], () => {
        for (const r of this.things.filter((x) => x.kind === 'relay')) r.sprite.setFrame(FRAME.lantern[0]);
        this.speedUntil = this.time.now + 25000; this.speedNextToast = 20;
        this.game.events.emit(EV.toast, '開始！剩 25 秒');
      });
    }
  }

  private spawnTrialWave(t: Thing, wave: number): void {
    this.trialWave = wave;
    const kinds: EnemyKind[] = wave === 1 ? ['karasu', 'kamaitachi', 'yamawaro'] : ['karasu', 'karasu', 'kamaitachi', 'yamawaro'];
    sound.sfx('roar');
    this.game.events.emit(EV.toast, `第 ${wave} 波！`);
    kinds.forEach((k, i) => {
      const a = (i / kinds.length) * Math.PI * 2, x = t.x + Math.cos(a) * 52, y = t.y + 40 + Math.sin(a) * 26;
      ring(this, x, y, 12, 0xff5a3a, 400);
      const e = new Enemy(this, x, y, k, gameState.difficulty);
      this.physics.add.collider(e, this.obstacles);
      this.physics.add.collider(e, this.solids);
      e.on('shoot', (en: Enemy, dir: { x: number; y: number }) => this.combat.enemyShoot(en, dir));
      e.on('killed', (en: Enemy) => this.onEnemyKilled(en));
      this.enemies.push(e); this.trialEnemies.push(e);
    });
  }

  private completeTrial(kind: string): void {
    gameState.flags.add(`trial:${kind}`);
    sound.sfx('levelup');
    const stone = this.things.find((x) => x.kind === 'trial' && x.props.trial === kind);
    if (stone) { stone.sprite.setFrame(FRAME.trial[1]); ring(this, stone.x, stone.y, 20, 0xffd84a, 600); }
    this.game.events.emit(EV.toast, `${({ power: '力', wisdom: '智', speed: '速' } as Record<string, string>)[kind]}之試煉，通過！`);
    this.checkTrials();
  }

  private checkTrials(): void {
    if (gameState.flags.has('trial:wisdom')) this.things.filter((x) => x.kind === 'trial' && x.props.trial === 'wisdom').forEach((x) => x.sprite.setFrame(FRAME.trial[1]));
    if (['power', 'wisdom', 'speed'].every((k) => gameState.flags.has(`trial:${k}`))) this.solveGroup('trials');
    this.refreshHud(true);
  }

  private lightRelay(t: Thing): void {
    if (this.time.now >= this.speedUntil) { this.game.events.emit(EV.toast, '先到速之試煉的石碑開始挑戰'); return; }
    if (t.sprite.frame.name.toString() === String(FRAME.lantern[1])) return;
    t.sprite.setFrame(FRAME.lantern[1]); sound.sfx('lantern'); ring(this, t.x, t.y - 4, 10, 0x7fd8ff, 300);
    const relays = this.things.filter((x) => x.kind === 'relay'), lit = relays.filter((x) => x.sprite.frame.name.toString() === String(FRAME.lantern[1])).length;
    if (lit >= relays.length) { this.speedUntil = 0; this.completeTrial('speed'); }
    else this.game.events.emit(EV.toast, `${lit}/${relays.length}`);
  }

  private updateTrials(now: number): void {
    if (this.speedUntil && now < this.speedUntil) {
      const left = Math.ceil((this.speedUntil - now) / 1000);
      if (left <= this.speedNextToast) { this.game.events.emit(EV.toast, `剩 ${left} 秒`); this.speedNextToast -= 5; }
    } else if (this.speedUntil && now >= this.speedUntil) {
      this.speedUntil = 0;
      for (const r of this.things.filter((x) => x.kind === 'relay')) r.sprite.setFrame(FRAME.lantern[0]);
      sound.sfx('wrong');
      this.game.events.emit(EV.toast, '時間到了……燈籠全熄了。再挑戰一次吧');
    }
  }

  private onEnemyKilled(e: Enemy): void {
    if (this.trialEnemies.includes(e) && this.trialEnemies.every((x) => !x.alive)) {
      this.trialEnemies = [];
      const stone = this.things.find((x) => x.kind === 'trial' && x.props.trial === 'power');
      if (this.trialWave === 1 && stone) this.time.delayedCall(800, () => this.spawnTrialWave(stone, 2));
      else { this.trialWave = 0; this.completeTrial('power'); }
    }
    if (!e.guard) return;
    if (this.enemies.some((x) => x.alive && x.guard === e.guard)) return;
    const chest = this.things.find((t) => t.kind === 'chest' && t.props.guard === e.guard);
    if (chest && !gameState.openedChests.has(chest.id)) {
      chest.sprite.clearTint();
      ring(this, chest.x, chest.y, 16, 0xffd84a, 500);
      this.game.events.emit(EV.toast, '守衛倒下了，寶箱的封印解開了！');
    }
  }

  // ---------- 謎題 ----------
  private restoreSolvedPuzzles(): void {
    for (const t of this.things) if (t.kind === 'chest' && this.isSealed(t) && !gameState.openedChests.has(t.id)) t.sprite.setTint(0xb08aff);
    for (const t of this.things) if (t.kind === 'lever' && gameState.flags.has(gateFlag(String(t.props.group)))) t.sprite.setFrame(FRAME.lever[1]);
    for (const t of this.things) if (t.kind === 'relay' && gameState.flags.has('trial:speed')) t.sprite.setFrame(FRAME.lantern[1]);
    const groups = new Set([...this.gates.map((g) => g.group)]);
    for (const group of groups) {
      if (!gameState.flags.has(gateFlag(group))) continue;
      // 已經解開：石塊放在踏板上、燈籠全亮、門打開
      for (const b of this.blocks.filter((b) => b.group === group)) {
        const [dx, dy] = DIRS[b.dir];
        for (let i = 0; i < 12 && !this.plates.some((p) => p.group === group && p.tx === b.tx && p.ty === b.ty); i++) { b.tx += dx; b.ty += dy; }
        this.placeBlock(b);
      }
      for (const p of this.plates.filter((p) => p.group === group)) p.sprite.setFrame(FRAME.plate[1]);
      for (const t of this.things.filter((t) => t.kind === 'lantern' && t.props.group === group)) t.sprite.setFrame(FRAME.lantern[1]);
      this.lanternNext[group] = 99;
      for (const g of this.gates.filter((g) => g.group === group)) this.openGate(g, false);
    }
  }

  private placeBlock(b: Block): void {
    b.sprite.setPosition(b.tx * T + T / 2, b.ty * T + T / 2).setDepth(b.ty * T + T / 2);
    (b.sprite.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
  }

  private isFree(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) return false;
    if (this.obstacles.getTileAt(tx, ty)?.collides) return false;
    if (this.blocks.some((b) => b.tx === tx && b.ty === ty)) return false;
    if (this.gates.some((g) => !g.open && g.tx === tx && g.ty === ty)) return false;
    if (this.cracks.some((c) => c.alive && c.tx === tx && c.ty === ty)) return false;
    if (this.webs.some((c) => c.alive && c.tx === tx && c.ty === ty)) return false;
    if (this.things.some((t) => tileOf(t.x, t.y)[0] === tx && tileOf(t.x, t.y)[1] === ty)) return false;
    if (this.enemies.some((e) => e.alive && tileOf(e.x, e.y)[0] === tx && tileOf(e.x, e.y)[1] === ty)) return false;
    return true;
  }

  /** 推石塊：朝石塊方向推 0.15 秒，石塊往前移動一格 */
  private updatePushing(dt: number): void {
    const m = inputState.move;
    const mag = Math.hypot(m.x, m.y);
    const dir = mag < 0.5 ? null : Math.abs(m.x) > Math.abs(m.y) ? (m.x > 0 ? 'right' : 'left') : (m.y > 0 ? 'down' : 'up');
    const pc = this.player.center;
    for (const b of this.blocks) {
      // 推到踏板上就卡住，不會被推過頭
      if (b.moving || this.plates.some((p) => p.group === b.group && p.tx === b.tx && p.ty === b.ty)) continue;
      const bx = b.tx * T + T / 2, by = b.ty * T + T / 2, dx = bx - pc.x, dy = by - pc.y;
      const touching = dir && (
        (dir === 'right' && dx > 5 && dx < 17 && Math.abs(dy) < 7) || (dir === 'left' && dx < -5 && dx > -17 && Math.abs(dy) < 7) ||
        (dir === 'down' && dy > 5 && dy < 17 && Math.abs(dx) < 7) || (dir === 'up' && dy < -5 && dy > -17 && Math.abs(dx) < 7));
      if (!touching) { b.pushMs = 0; continue; }
      b.pushMs += dt;
      if (b.pushMs < 150) continue;
      b.pushMs = 0;
      const [ddx, ddy] = DIRS[dir!];
      if (!this.isFree(b.tx + ddx, b.ty + ddy)) continue;
      b.tx += ddx; b.ty += ddy; b.moving = true;
      this.tweens.add({
        targets: b.sprite, x: b.tx * T + T / 2, y: b.ty * T + T / 2, duration: 170,
        onUpdate: () => (b.sprite.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject(),
        onComplete: () => { b.moving = false; this.placeBlock(b); this.checkPlates(b.group); },
      });
    }
  }

  private checkPlates(group: string): void {
    const plates = this.plates.filter((p) => p.group === group);
    let all = plates.length > 0;
    for (const p of plates) {
      const on = this.blocks.some((b) => b.tx === p.tx && b.ty === p.ty);
      p.sprite.setFrame(FRAME.plate[on ? 1 : 0]);
      if (on && p.sprite.getData('on') !== true) ring(this, p.sprite.x, p.sprite.y, 10, 0x4fb8ff, 400);
      p.sprite.setData('on', on);
      all &&= on;
    }
    if (all) this.solveGroup(group);
  }

  private solveGroup(group: string): void {
    if (gameState.flags.has(gateFlag(group))) return;
    gameState.flags.add(gateFlag(group));
    sound.sfx('gate');
    this.cameras.main.shake(250, 0.005);
    for (const g of this.gates.filter((g) => g.group === group)) this.openGate(g, true);
    this.game.events.emit(EV.toast, '喀啦喀啦……某處的門打開了！');
  }

  private openGate(g: Gate, animate: boolean): void {
    if (g.open) return;
    g.open = true;
    this.solids.remove(g.sprite);
    (g.sprite.body as Phaser.Physics.Arcade.StaticBody).enable = false;
    if (g.water) {
      // 水門：水退掉，變成木板路
      if (animate) { this.tweens.add({ targets: g.sprite, alpha: 0.3, duration: 400, yoyo: true, onYoyo: () => g.sprite.setFrame(FRAME.plank) }); }
      else g.sprite.setFrame(FRAME.plank);
      return;
    }
    if (animate) this.tweens.add({ targets: g.sprite, y: g.sprite.y - 12, alpha: 0, duration: 500, onComplete: () => g.sprite.destroy() });
    else g.sprite.destroy();
  }

  private lightLantern(t: Thing): void {
    const group = String(t.props.group), order = Number(t.props.order);
    if (gameState.flags.has(gateFlag(group)) || t.sprite.frame.name.toString() === String(FRAME.lantern[1])) { this.game.events.emit(EV.toast, `「${t.props.label}」的燈籠已經亮了`); return; }
    if (order === this.lanternNext[group]) {
      t.sprite.setFrame(FRAME.lantern[1]);
      sound.sfx('lantern');
      ring(this, t.x, t.y - 4, 8, 0x7fd8ff, 400);
      this.game.events.emit(EV.toast, `點亮了刻著「${t.props.label}」的燈籠`);
      this.lanternNext[group]++;
      const total = this.things.filter((x) => x.kind === 'lantern' && x.props.group === group).length;
      if (this.lanternNext[group] > total) this.solveGroup(group);
    } else {
      for (const x of this.things.filter((x) => x.kind === 'lantern' && x.props.group === group)) x.sprite.setFrame(FRAME.lantern[0]);
      this.lanternNext[group] = 1;
      sound.sfx('wrong');
      this.cameras.main.shake(120, 0.003);
      this.game.events.emit(EV.toast, '燈籠全都熄滅了……順序好像不對');
    }
  }

  private breakWall(c: Crack): void {
    gameState.flags.add(secretFlag(c.id));
    this.tweens.add({ targets: c.sprite, alpha: 0, scale: 1.3, duration: 250, onComplete: () => c.sprite.destroy() });
    this.solids.remove(c.sprite);
    (c.sprite.body as Phaser.Physics.Arcade.StaticBody).enable = false;
    for (let i = 0; i < 6; i++) floatText(this, c.x + Phaser.Math.Between(-6, 6), c.y + Phaser.Math.Between(-4, 6), '·', '#a39fb8', 12);
    this.game.events.emit(EV.toast, '牆壁崩塌了！發現了隱藏的通道');
    this.checkCollectionShard();
    this.buildMinimap();
  }

  // ---------- 任務 ----------
  /** 任務物品要不要出現、NPC 頭上的「！」「？」 */
  private syncQuests(): void {
    for (const o of this.pickupObjs) {
      const props = propsOf(o), group = String(props.group);
      const existing = this.things.find((t) => t.id === o.name);
      const visible = pickupVisible(gameState, group, o.name);
      if (visible && !existing) {
        const s = this.add.sprite(o.x!, o.y!, 'fx', Number(props.frame)).setDepth(o.y!);
        this.tweens.add({ targets: s, y: o.y! - 3, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        const glow = this.add.circle(o.x!, o.y! + 4, 6, 0xfff2b0, 0.25).setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
        s.setData('glow', glow);
        this.things.push({ id: o.name, kind: 'pickup', x: o.x!, y: o.y!, sprite: s, props });
      } else if (!visible && existing) {
        (existing.sprite.getData('glow') as Phaser.GameObjects.Arc | undefined)?.destroy();
        existing.sprite.destroy();
        this.things = this.things.filter((t) => t !== existing);
      }
    }
    for (const t of this.things.filter((t) => t.kind === 'npc' || t.kind === 'board')) {
      const giver = t.kind === 'board' ? 'board' : String(t.props.npc);
      const mark = readyFor(gameState, giver).length ? '？' : offersFrom(gameState, giver).length ? '！' : '';
      let icon = this.icons.get(t);
      if (!icon) {
        icon = this.add.text(t.x, t.y - 14, '', { fontFamily: FONT_FAMILY, fontSize: '10px', color: '#ffd84a', fontStyle: 'bold', stroke: '#14121c', strokeThickness: 3 })
          .setOrigin(0.5, 1).setResolution(RENDER_SCALE).setDepth(150000);
        this.tweens.add({ targets: icon, y: t.y - 16, duration: 500, yoyo: true, repeat: -1 });
        this.icons.set(t, icon);
      }
      icon.setText(mark).setColor(mark === '？' ? '#7fe08a' : '#ffd84a');
    }
  }

  private npcQuest(t: Thing): boolean {
    const npc = String(t.props.npc);
    const ready = readyFor(gameState, npc)[0];
    if (ready) {
      const q = questDef(ready, gameState.flags)!;
      this.say(q.done ?? [], () => { const msg = turnIn(gameState, ready); if (msg) this.game.events.emit(EV.toast, msg); this.syncQuests(); this.refreshHud(true); });
      return true;
    }
    const offer = offersFrom(gameState, npc)[0];
    if (offer) {
      const q = questDef(offer, gameState.flags)!;
      this.say(q.offer ?? [], (c) => {
        if (c === 0 && accept(gameState, offer)) this.game.events.emit(EV.toast, `接受任務：${q.name}`);
        this.syncQuests(); this.refreshHud(true);
      }, ['好，交給我！', '之後再說']);
      return true;
    }
    const active = Object.keys(gameState.quests).find((id) => gameState.quests[id].status === 'active' && questDef(id, gameState.flags)?.giver === npc);
    if (active && questDef(active, gameState.flags)?.remind) { this.say(questDef(active, gameState.flags)!.remind!); return true; }
    return false;
  }

  // ---------- Boss 戰 ----------
  private get bossKind(): string { return this.boss instanceof OmniBoss ? this.boss.kind : this.boss instanceof KappaKing ? 'kappaking' : this.boss instanceof Daitengu ? 'daitengu' : 'tsuchigumo'; }
  private get bossInfo() { return BOSSES[this.bossKind]; }

  private bossIntro(): void {
    const info = this.bossInfo;
    const first = !gameState.flags.has(info.seen);
    this.runDialogue(first ? info.intro : info.retry, () => {
      if (this.cameo) { const c = this.cameo; this.tweens.add({ targets: c, alpha: 0, y: c.y - 10, duration: 600, onComplete: () => c.destroy() }); this.cameo = undefined; }
      this.boss?.start(this.time.now);
      this.game.events.emit(EV.toast, info.tip);
    });
  }

  private summonSpiders(): void {
    if (!this.boss) return;
    const kinds: EnemyKind[] = this.boss instanceof OmniBoss ? this.boss.cfg.minions : [this.boss instanceof KappaKing ? 'kappa' : this.boss instanceof Daitengu ? 'karasu' : 'bonespider'];
    for (const [i, dx] of [-48, 48].entries()) {
      const kind = kinds[i % kinds.length];
      const x = Phaser.Math.Clamp(this.boss.x + dx, 3 * T, (this.map.width - 3) * T), y = Phaser.Math.Clamp(this.boss.y + 16, 3 * T, (this.map.height - 4) * T);
      ring(this, x, y, 14, 0xb04aff, 400);
      const e = new Enemy(this, x, y, kind, gameState.difficulty);
      this.physics.add.collider(e, this.obstacles);
      this.physics.add.collider(e, this.solids);
      e.on('shoot', (en: Enemy, dir: { x: number; y: number }) => this.combat.enemyShoot(en, dir));
      this.enemies.push(e);
    }
  }

  private addTornado(x: number, y: number): void {
    const gfx = this.add.graphics().setDepth(140000);
    this.tornadoes.push({ gfx, x, y, until: this.time.now + 5000, next: 0 });
  }

  /** 神木之鈴：敲響後大天狗掉下來 */
  private ringBell(br: Breakable, sprite: Phaser.GameObjects.Sprite): void {
    sound.sfx('lantern');
    ring(this, br.x, br.y - 4, 30, 0xffd84a, 500);
    this.tweens.add({ targets: sprite, angle: { from: -15, to: 15 }, duration: 120, yoyo: true, repeat: 3, onComplete: () => sprite.setAngle(0) });
    if (this.boss?.alive && this.boss.started) { this.boss.stun(3500); this.game.events.emit(EV.toast, '鈴聲響徹山頂，大天狗掉下來了！'); }
    sprite.setTint(0x8a8a9a);
    this.time.delayedCall(12000, () => { if (sprite.active) { sprite.clearTint(); br.alive = true; } });
  }

  private addPool(x: number, y: number, fire = false): void {
    const gfx = this.add.circle(x, y, fire ? 16 : 22, fire ? 0xff6a2a : 0x9a3aff, 0.32).setStrokeStyle(1.5, fire ? 0xffb06a : 0xc78dff, 0.8).setDepth(3);
    this.tweens.add({ targets: gfx, alpha: 0.6, duration: 400, yoyo: true, repeat: -1 });
    this.pools.push({ x, y, until: this.time.now + (fire ? 3500 : 4500), next: 0, gfx, fire });
  }

  /** 酒樽、結界石：打破後 Boss 動彈不得 */
  private breakStunObject(br: Breakable, sprite: Phaser.GameObjects.Sprite, barrel: boolean, pearl = false): void {
    sound.sfx('break');
    ring(this, br.x, br.y - 4, 30, barrel ? 0xe8e4d8 : 0xb08aff, 500);
    sprite.setAlpha(0.35);
    if (this.boss?.alive && this.boss.started) {
      this.boss.stun(barrel ? 4000 : 3500);
      this.game.events.emit(EV.toast, pearl ? '寶珠的光照亮了海底，海坊主平靜了下來！' : barrel ? '神便鬼毒酒灑了出來，酒吞童子醉倒了！' : '結界石的光包住了百鬼之主！');
    }
    this.time.delayedCall(12000, () => { if (sprite.active) { sprite.setAlpha(1); br.alive = true; } });
  }

  /** 蛛網封路：在主角四周長出蛛網，打得破，8 秒後消失，被燈籠的火燒掉 */
  private spawnWebs(px: number, py: number): void {
    const [cx, cy] = tileOf(px, py);
    const spots = Phaser.Utils.Array.Shuffle([[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1]]).slice(0, 4);
    for (const [dx, dy] of spots) {
      const tx = cx + dx, ty = cy + dy;
      if (!this.isFree(tx, ty)) continue;
      const x = tx * T + T / 2, y = ty * T + T / 2;
      const sprite = this.add.sprite(x, y, 'tilesheet', FRAME.web).setDepth(y).setAlpha(0);
      this.tweens.add({ targets: sprite, alpha: 1, duration: 200 });
      this.solids.add(sprite);
      (sprite.body as Phaser.Physics.Arcade.StaticBody).setSize(16, 16).setOffset(0, 0);
      const w: Crack = { sprite, tx, ty, id: '', x, y, alive: true, onBreak: () => this.removeWeb(w) };
      this.webs.push(w); this.breakables.push(w);
      this.time.delayedCall(8000, () => this.removeWeb(w));
    }
  }

  private removeWeb(w: Crack): void {
    if (!w.sprite.active) return;
    w.alive = false;
    this.solids.remove(w.sprite);
    (w.sprite.body as Phaser.Physics.Arcade.StaticBody).enable = false;
    this.tweens.add({ targets: w.sprite, alpha: 0, duration: 200, onComplete: () => w.sprite.destroy() });
    this.webs = this.webs.filter((x) => x !== w);
    this.breakables.splice(this.breakables.indexOf(w), 1);
  }

  private lightBossLantern(br: Breakable, sprite: Phaser.GameObjects.Sprite): void {
    sprite.setFrame(FRAME.lantern[1]);
    sound.sfx('lantern');
    ring(this, br.x, br.y - 4, 30, 0xff9a4a, 500);
    for (const w of [...this.webs]) this.removeWeb(w);
    if (this.boss?.alive) {
      this.boss.stun(3000);
      this.game.events.emit(EV.toast, '石燈籠的火燒斷了蛛網，土蜘蛛動彈不得！');
    }
    this.time.delayedCall(12000, () => { if (sprite.active) { sprite.setFrame(FRAME.lantern[0]); br.alive = true; } });
  }

  private onBossDefeated(): void {
    if (this.floor) { hudState.boss.visible = false; for (const e of this.enemies) if (e.alive) e.hit(999999, false, e.center); return; }
    inputState.locked = true;
    for (const e of this.enemies) if (e.alive) e.hit(9999, false, e.center);
    for (const p of this.pools) p.gfx.destroy();
    this.pools = [];
    for (const w of [...this.webs]) this.removeWeb(w);
    hudState.boss.visible = false;
    this.cameras.main.shake(800, 0.012);
    this.cameras.main.flash(600, 255, 240, 220);
    sound.sfx('roar');
    sound.music('village');
    const info = this.bossInfo;
    gameState.money += info.reward.money;
    gameState.items[info.reward.item] = (gameState.items[info.reward.item] ?? 0) + 1;
    const g = giveRandomGear(gameState, Math.random, info.reward.tier, 2);
    this.game.events.emit(EV.toast, `獲得 ${info.reward.money} 文、${info.reward.item}${g ? `、${gearLabel(g)}` : ''}`);
    this.time.delayedCall(1800, () => this.runDialogue(info.defeated, () => {
      info.flags.forEach((f) => gameState.flags.add(f));
      if (this.bossKind === 'shuten') {
        // 最終章的結局分歧（PRD 2.6）
        const route = endingRoute(gameState);
        if (route === 'true') { this.runDialogue('true_route', () => { gameState.flags.add('yomi_open'); this.goTo('yomi', 'entry', 'up'); }); return; }
        gameState.flags.add('game_cleared'); gameState.flags.add(route === 'a' ? 'ending_a' : 'ending_b');
        this.goTo('shrine', 'door', 'up', { outro: route === 'a' ? 'endA' : 'endB' });
        return;
      }
      this.goTo('shrine', 'door', 'up', { outro: info.outro });
    }));
  }

  private chapterOutro(ch: Chapter): void {
    if (ch === 'endA' || ch === 'endB' || ch === 'endTrue') {
      const id = { endA: 'ending_a', endB: 'ending_b', endTrue: 'ending_true' }[ch];
      sound.music(ch === 'endTrue' ? 'village' : 'forest');
      this.runDialogue(id, () => {
        const col = collectionReport(MAPS, gameState.openedChests, gameState.flags).percent;
        const m = Math.floor(gameState.playTime / 60);
        writeSave('auto', serialize(gameState, 'shrine', 'door', '狐火神社'));
        this.game.events.emit(EV.credits, {
          title: { endA: '結局 A「封印」', endB: '結局 B「共存」', endTrue: '真結局「黃泉之門」' }[ch],
          sub: `遊玩時間 ${Math.floor(m / 60)} 小時 ${m % 60} 分・收集度 ${col}%・羈絆值 ${gameState.bond}・怒火值 ${gameState.anger}`,
          hint: ch === 'endTrue' ? '你找到了結界真正的意義。感謝遊玩！' : `還有其他結局。羈絆值 10 以上、集齊 5 枚神器碎片，就能看見結界真正的意義……（目前碎片 ${gameState.items['神器碎片'] ?? 0}/5）`,
        });
      });
      return;
    }
    this.runDialogue(`chapter${ch.slice(2)}_outro`, () => {
      const col = collectionReport(MAPS, gameState.openedChests, gameState.flags).percent;
      const m = Math.floor(gameState.playTime / 60);
      const path = gameState.bond >= gameState.anger ? '羈絆' : '怒火';
      this.game.events.emit(EV.banner, { title: ({ ch1: '第一章　完', ch2: '第二章　完', ch3: '第三章　完', ch5: '第五章　完' } as Record<string, string>)[ch], sub: `遊玩時間 ${m} 分・收集度 ${col}%・你走在「${path}」的路上`, duration: 6000 });
      this.refreshHud(true);
    });
  }

  // ---------- 氣氛 ----------
  private addFog(): void {
    // 蓋住整張地圖（不用 scrollFactor 0，畫面放大時位置才不會跑掉）
    const fog = this.add.rectangle(-GAME_WIDTH, -GAME_HEIGHT, this.map.widthInPixels + GAME_WIDTH * 2, this.map.heightInPixels + GAME_HEIGHT * 2, 0xdde8ee, 0.14).setOrigin(0).setDepth(200000);
    this.tweens.add({ targets: fog, alpha: 0.6, duration: 3000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  private addDarkness(objects: Phaser.Types.Tilemaps.TiledObject[]): void {
    this.add.rectangle(-GAME_WIDTH, -GAME_HEIGHT, this.map.widthInPixels + GAME_WIDTH * 2, this.map.heightInPixels + GAME_HEIGHT * 2, 0x0a0814, 0.42).setOrigin(0).setDepth(190000);
    // 用幾層半透明圓疊出由亮到暗的光暈
    const glow = (x: number, y: number, r: number, color: number) => {
      const c = this.add.container(x, y).setDepth(190001);
      for (const [k, a] of [[1, 0.05], [0.7, 0.06], [0.45, 0.07], [0.22, 0.08]]) c.add(this.add.circle(0, 0, r * k, color, a).setBlendMode(Phaser.BlendModes.ADD));
      return c;
    };
    for (const o of objects.filter((o) => o.type === 'light')) {
      const g = glow(o.x!, o.y!, 30, 0xff9a4a);
      this.tweens.add({ targets: g, scale: 1.1, duration: Phaser.Math.Between(250, 500), yoyo: true, repeat: -1 });
    }
    this.playerGlow = glow(0, 0, 44, 0xffe0b0);
  }

  // ---------- 小地圖 ----------
  private buildMinimap(): void {
    const w = this.map.width, h = this.map.height, walls = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (this.obstacles.getTileAt(x, y)?.collides) walls[y * w + x] = 1;
    for (const c of this.cracks) if (c.alive) walls[c.ty * w + c.tx] = 1;
    hudState.minimap = { ...hudState.minimap, version: hudState.minimap.version + 1, w, h, walls };
  }

  private updateMinimapMarkers(): void {
    const mk: MapMarker[] = [];
    const tp = (x: number, y: number) => ({ x: x / T, y: y / T });
    for (const t of this.things) {
      if (t.kind === 'chest' && !gameState.openedChests.has(t.id)) mk.push({ ...tp(t.x, t.y), color: 0xf2c94c });
      if (t.kind === 'npc' || t.kind === 'board') mk.push({ ...tp(t.x, t.y), color: this.icons.get(t)?.text ? 0xffd84a : 0xffffff });
      if (t.kind === 'pickup') mk.push({ ...tp(t.x, t.y), color: 0xc7f0a0 });
      if (t.kind === 'lever' && !gameState.flags.has(`lever:${t.id}`)) mk.push({ ...tp(t.x, t.y), color: 0xff9a4a });
      if (t.kind === 'trial' && !gameState.flags.has(`trial:${t.props.trial}`)) mk.push({ ...tp(t.x, t.y), color: 0xff9a4a });
      if (t.kind === 'well' || t.kind === 'bossdoor') mk.push({ ...tp(t.x, t.y), color: 0xff5ae0 });
    }
    for (const g of this.gates) if (!g.open) mk.push({ ...tp(g.sprite.x, g.sprite.y), color: 0x8a8aa0 });
    for (const e of this.enemies) if (e.alive && e.kind !== 'dummy') mk.push({ ...tp(e.x, e.y), color: 0xff4a4a });
    for (const ex of (this.map.getObjectLayer('objects')?.objects ?? []).filter((o) => o.type === 'exit')) {
      mk.push({ x: (ex.x! + (ex.width ?? 16) / 2) / T, y: (ex.y! + (ex.height ?? 16) / 2) / T, color: 0x7fe08a });
    }
    hudState.minimap.markers = mk;
  }

  // ---------- 換場與死亡 ----------
  private goTo(map: string, spawn: string, face?: Facing, extra: Partial<WorldData> = {}): void {
    if (this.transitioning) return;
    this.transitioning = true;
    inputState.locked = true;
    this.cameras.main.fadeOut(220, 20, 18, 28);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.restart({ map, spawn, face, ...extra }));
  }

  private onDeath(): void {
    inputState.locked = true;
    this.game.events.emit(EV.banner, { title: '力盡了……', sub: '回到最後進入的地點，道具都還在', duration: 1600 });
    this.time.delayedCall(1700, () => {
      const c = gameState.checkpoint;
      this.goTo(c.map, c.spawn, undefined, { respawn: true });
    });
  }

  // ---------- 互動 ----------
  private target(): Thing | undefined {
    const candidates = this.things.map((t) => ({ id: t.id, x: t.x, y: t.y + 4, thing: t }));
    // 先找正前方；找不到再往前多看一格，讓人能隔著櫃台和店員說話
    return findInFront(this.player.center, this.player.facing, candidates)?.thing
      ?? findInFront(this.player.center, this.player.facing, candidates.filter((c) => c.thing.kind === 'npc'), 30, 12)?.thing;
  }

  private interact(t: Thing): void {
    if (t.kind === 'chest') {
      if (!gameState.openedChests.has(t.id) && this.isSealed(t)) { this.game.events.emit(EV.toast, '寶箱被妖氣封住了。打倒守護它的妖怪吧！'); return; }
      const base = t.props as Reward;
      const boosted: Reward = gameState.ngPlus && base.gearTier ? { ...base, minRarity: Math.min(3, (base.minRarity ?? 0) + gameState.ngPlus) } : base;
      const r = openChest(gameState, t.id, boosted);
      if (r.opened && (t.props as Reward).item === '神器碎片') gameState.flags.add(`shard:${t.id}`);
      if (r.opened) this.time.delayedCall(600, () => this.checkCollectionShard());
      if (r.opened) {
        const frames = t.props.key ? FRAME.ironChest : t.props.guard ? FRAME.goldChest : FRAME.chest;
        t.sprite.setFrame(frames[1]);
        sound.sfx('chest');
        ring(this, t.x, t.y, 10, 0xf2c94c, 350);
        this.refreshHud(true);
      }
      this.game.events.emit(EV.toast, r.message);
      return;
    }
    if (t.kind === 'lantern') { this.lightLantern(t); return; }
    if (t.kind === 'board') { this.game.events.emit(EV.board); return; }
    if (t.kind === 'lever') { this.pullLever(t); return; }
    if (t.kind === 'sluice') { this.openSluice(t); return; }
    if (t.kind === 'trial') { this.startTrial(t); return; }
    if (t.kind === 'portal') { this.runDialogue('tower_portal'); return; }
    if (t.kind === 'fishspot') {
      if (!gameState.flags.has('has_rod')) { this.game.events.emit(EV.toast, '水裡有魚在游……需要釣竿。（河童沼澤的漁夫好像有）'); return; }
      this.game.events.emit(EV.fish, String(t.props.spot ?? 'pond'));
      return;
    }
    if (t.kind === 'cook') { this.game.events.emit(EV.cook); return; }
    if (t.kind === 'sealgate') {
      const item = String(t.props.item), label = String(t.props.label);
      if ((gameState.items[item] ?? 0) <= 0) { this.game.events.emit(EV.toast, `「${label}」被封住了。好像需要「${item}」……`); return; }
      gameState.flags.add(`seal:${t.id}`);
      sound.sfx('gate'); ring(this, t.x, t.y, 20, 0xf2c94c, 500);
      this.solids.remove(t.sprite); (t.sprite.body as Phaser.Physics.Arcade.StaticBody).enable = false;
      this.tweens.add({ targets: t.sprite, alpha: 0, duration: 500, onComplete: () => t.sprite.destroy() });
      this.things = this.things.filter((x) => x !== t);
      this.game.events.emit(EV.toast, `${item}發出光芒，「${label}」打開了！`);
      this.buildMinimap();
      return;
    }
    if (t.kind === 'relay') { this.lightRelay(t); return; }
    if (t.kind === 'npc' && t.props.npc === 'priest' && canChangeJob(gameState) && gameState.flags.has('ch2_started')) {
      // 有推進劇情的對話（會設定旗標）就先講劇情，沒有才提轉職
      const story = pickVariant((dialogues as unknown as Record<string, DialogueVariant[]>).priest, gameState.flags);
      if (!story?.set?.length) { this.runDialogue(`job_${gameState.classId}`); return; }
    }
    if (t.kind === 'pickup') {
      gameState.flags.add(`pickup:${t.id}`);
      sound.sfx('pickup');
      ring(this, t.x, t.y, 10, 0xfff2b0, 350);
      this.game.events.emit(EV.toast, `撿到了${t.props.label}`);
      for (const m of onPickup(gameState, String(t.props.group))) this.game.events.emit(EV.toast, m);
      this.syncQuests(); this.refreshHud(true);
      return;
    }
    if (t.kind === 'npc') {
      // 會推進劇情的對話（會設定旗標）優先；沒有才輪到任務
      const npcId = String(t.props.npc);
      const story = pickVariant((dialogues as unknown as Record<string, DialogueVariant[]>)[String(t.props.dialogue ?? npcId)], gameState.flags);
      const storyFirst = !!story?.set?.length && !readyFor(gameState, npcId).length;
      if (!storyFirst && this.npcQuest(t)) return;
    }
    if (t.kind === 'jizo') {
      const st = statsOf(gameState);
      gameState.hp = st.maxHp; gameState.mp = st.maxMp; gameState.statuses = {};
      ring(this, t.x, t.y, 16, 0xffe0b0, 500);
      sound.sfx('save');
      gameState.flags.add(`jizo:${this.mapKey}:${String(t.props.spawn ?? 'jizo')}`);
      this.game.events.emit(EV.toast, '地藏保佑，HP 和 MP 全滿了');
      const req: SaveRequest = { map: this.mapKey, spawn: String(t.props.spawn ?? 'jizo'), areaName: this.areaName };
      this.game.events.emit(EV.save, req);
      return;
    }
    this.runDialogue(String(t.props.dialogue ?? t.props.npc ?? t.id), undefined, String(t.props.npc ?? ''));
  }

  /** 播放一段對話（依旗標選版本），處理選項、旗標、開商店、傳送。 */
  private runDialogue(id: string, after?: () => void, npc = ''): void {
    const v = pickVariant((dialogues as unknown as Record<string, DialogueVariant[]>)[id], gameState.flags);
    if (!v) { after?.(); return; }
    const finish = (open?: string) => {
      for (const f of v.set ?? []) gameState.flags.add(f);
      if (v.set?.length) this.onFlagsChanged(v.set);
      if (open === 'shop') this.game.events.emit(EV.shop, npc || 'rin');
      if (open === 'forge') this.game.events.emit(EV.forge);
      if (open?.startsWith('warp:')) { const [, map, spawn] = open.split(':'); this.goTo(map, spawn, 'up'); }
      if (open === 'gift:tamatebako' || open === 'gift:kanzashi') {
        const g = open === 'gift:tamatebako' ? giveRandomGear(gameState, Math.random, 5, 4) : (() => { const e = { uid: gameState.nextUid++, base: 'otohime_kanzashi' as const, rarity: 3, affixes: [] }; gameState.gear.push(e); return e; })();
        if (g) this.game.events.emit(EV.toast, `獲得 ${gearLabel(g)}`);
      }
      if (open?.startsWith('job:')) {
        const id = open.slice(4), j = (jobs as Record<string, { name: string; skills: string[] }>)[id];
        if (changeJob(gameState, id)) {
          sound.sfx('levelup');
          ring(this, this.player.x, this.player.y, 24, 0xffd84a, 600);
          this.game.events.emit(EV.banner, { title: `轉職：${j.name}`, sub: '屬性 +10%，學會了兩個新技能（已裝到技能鈕上）', duration: 3000 });
        }
      }
      after?.();
    };
    this.say(v.lines, (choice) => {
      const opt = choice != null ? v.choice?.[choice] : undefined;
      if (!opt) { finish(v.open); return; }
      gameState.bond += opt.bond ?? 0;
      gameState.anger += opt.anger ?? 0;
      for (const f of opt.set ?? []) gameState.flags.add(f);
      if (opt.lines?.length) this.say(opt.lines, () => finish(opt.open ?? v.open));
      else finish(opt.open ?? v.open);
    }, v.choice?.map((c) => c.label));
  }

  private say(lines: Line[], onDone?: (choice?: number) => void, choices?: string[]): void {
    inputState.locked = true;
    this.player.setVelocity(0, 0);
    const req: DialogueRequest = { lines, choices, onDone: (c) => { inputState.locked = false; onDone?.(c); } };
    this.game.events.emit(EV.dialogue, req);
  }

  private onFlagsChanged(added: string[]): void {
    this.things = this.things.filter((t) => {
      if (t.kind === 'blocker' && gameState.flags.has(String(t.props.flag))) { t.sprite.destroy(); return false; }
      return true;
    });
    if (added.includes('talked_priest')) this.game.events.emit(EV.toast, '竹林入口的注連繩解開了');
    if (added.includes('ch4_started')) {
      // 舊存檔：在加入神器碎片之前就開過的寶箱，現在補發
      const missed = SHARD_CHESTS.filter((id) => gameState.openedChests.has(id) && !gameState.flags.has(`shard:${id}`));
      for (const id of missed) { gameState.flags.add(`shard:${id}`); gameState.items['神器碎片'] = (gameState.items['神器碎片'] ?? 0) + 1; }
      if (missed.length) this.game.events.emit(EV.toast, `之前打開的寶箱裡有發光的碎片……得到神器碎片 ×${missed.length}`);
      this.checkCollectionShard();
    }
    if (added.includes('prologue_done')) this.game.events.emit(EV.banner, { title: '序章　完', sub: '第一章「古井的土蜘蛛」開始' });
    this.refreshHud(true);
  }

  /** 第一次遇到某個機制時的提示（每個只出現一次） */
  private hint(id: string, text: string): void {
    if (gameState.flags.has(`hint:${id}`)) return;
    gameState.flags.add(`hint:${id}`);
    this.game.events.emit(EV.hint, text);
  }

  private checkHints(): void {
    const pc = this.player.center, near = (x: number, y: number, r: number) => Math.hypot(x - pc.x, y - pc.y) < r;
    if (this.enemies.some((e) => e.alive && e.kind !== 'dummy' && near(e.x, e.y, 110))) {
      if (!gameState.flags.has('hint:combat')) this.hint('combat', '妖怪來了！「攻擊」會自動瞄準最近的敵人；看到紅圈或閃光的預兆，就按「閃避」躲開（翻滾時不會受傷）。');
      else if (!gameState.flags.has('hint:skill')) this.time.delayedCall(6000, () => this.hint('skill', '右下角的技能鈕會消耗 MP（藍條）。用完會冷卻，按鈕上的暗色扇形就是剩下的時間。'));
    }
    const max = statsOf(gameState).maxHp;
    if (gameState.hp < max * 0.4 && gameState.hp > 0) this.hint('lowhp', 'HP 不多了！按「藥」會自動選最適合的道具使用。');
    if (Object.keys(gameState.statuses).length) this.hint('status', '中了異常狀態（左上角的字）。按「藥」會優先解除；解毒草、萬能符都有用。');
    if (this.blocks.some((b) => near(b.tx * T + 8, b.ty * T + 8, 40))) this.hint('block', '推石頭：朝石頭的方向一直走就會推動。推上踏板會卡住；推到動不了的話，離開這層再回來就會恢復。');
    if (this.cracks.some((c) => c.alive && near(c.x, c.y, 50))) this.hint('crack', '牆上有裂縫！用攻擊打破它，後面可能有密室。');
    if (this.things.some((t) => t.kind === 'chest' && near(t.x, t.y, 40))) this.hint('chest', '靠近寶箱時，攻擊鈕會變成「打開」。');
    if (this.things.some((t) => t.kind === 'jizo' && near(t.x, t.y, 50))) this.hint('jizo', '地藏：參拜可以存檔、補滿 HP 和 MP，也能傳送到去過的其他地藏。');
    if (this.things.some((t) => t.kind === 'lever' && near(t.x, t.y, 50))) this.hint('lever', '拉桿：同一組的拉桿全部拉下，水門或柵門就會打開。');
    if (this.winds.some((w) => pc.x >= w.x && pc.x <= w.x + w.w && pc.y >= w.y && pc.y <= w.y + w.h)) this.hint('wind', '山風會把人往一個方向推。閃避或突刺時不受影響。');
    if (gameState.level >= 2) this.hint('levelup', '升級了！右上角「選單」可以看能力、換裝備、選技能。');
    if (gameState.gear.length > 2) this.hint('gear', '拿到新裝備了！到「選單 → 裝備」，會顯示換上後能力怎麼變。');
  }

  private checkAchievements(): void {
    const collection = collectionReport(MAPS, gameState.openedChests, gameState.flags).percent;
    for (const a of newlyUnlocked(gameState, { collection })) {
      sound.sfx('levelup');
      this.game.events.emit(EV.toast, grantAchievement(gameState, a));
    }
  }

  /** 收集度 100% 時得到第 5 枚神器碎片（PRD 2.6） */
  private checkCollectionShard(): void {
    if (gameState.flags.has('shard:collection')) return;
    if (collectionReport(MAPS, gameState.openedChests, gameState.flags).percent < 100) return;
    gameState.flags.add('shard:collection');
    gameState.items['神器碎片'] = (gameState.items['神器碎片'] ?? 0) + 1;
    sound.sfx('levelup');
    this.game.events.emit(EV.banner, { title: '收集度 100%', sub: '得到了第 5 枚神器碎片', duration: 2500 });
  }

  private refreshHud(force = false): void {
    const t = inputState.locked ? undefined : this.target();
    const info: HudInfo = { canInteract: !!t, label: t ? LABEL[t.kind] : '攻擊' };
    const key = `${info.canInteract}|${info.label}`;
    if (!force && key === this.lastHud) return;
    this.lastHud = key;
    this.game.events.emit(EV.hud, info);
  }

  update(_time: number, dt: number): void {
    gameState.playTime += dt / 1000;
    const actions = inputState.actions.splice(0);
    if (!inputState.locked && !this.transitioning) {
      for (const a of actions) {
        if (a === 'attackDown') {
          const t = this.target();
          if (t) { this.combat.cancelAttackPress(); this.interact(t); break; }
        }
        this.combat.handle(a);
      }
    } else if (actions.includes('attackUp')) this.combat.cancelAttackPress();

    const locked = inputState.locked || this.transitioning;
    this.combat.update(dt, locked ? { x: 0, y: 0 } : inputState.move);
    if (!locked) {
      const pc = this.player.center;
      for (const w of this.winds) if (pc.x >= w.x && pc.x <= w.x + w.w && pc.y >= w.y && pc.y <= w.y + w.h) this.combat.windPush(w.dx * w.power, w.dy * w.power);
      this.updateTrials(this.time.now);
    }
    if (!locked) this.updatePushing(dt);

    const target = this.player.center;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (locked) { e.setVelocity(0, 0); continue; }
      e.update(this.time.now, dt / 1000, target);
      const ec = e.center, reach = e instanceof Boss || e instanceof KappaKing || e instanceof Daitengu || e instanceof OmniBoss ? 18 : e.elite ? 14 : 11;
      if (Math.abs(ec.x - target.x) < reach && Math.abs(ec.y - target.y) < reach - 1) this.combat.touchedBy(e);
    }
    this.playerGlow?.setPosition(this.player.x, this.player.y);
    if (this.pet) this.updatePet(locked);

    // 旋風：追著主角跑
    const now = this.time.now;
    for (const tw of [...this.tornadoes]) {
      if (now > tw.until || !this.boss?.alive) { tw.gfx.destroy(); this.tornadoes = this.tornadoes.filter((x) => x !== tw); continue; }
      if (!locked) {
        const dx = target.x - tw.x, dy = target.y - tw.y, d = Math.hypot(dx, dy) || 1;
        tw.x += (dx / d) * 46 * (dt / 1000); tw.y += (dy / d) * 46 * (dt / 1000);
        if (d < 14 && now >= tw.next) { tw.next = now + 700; this.combat.hazardHit(this.boss.info.atk, tw, 0.8); }
      }
      tw.gfx.clear().lineStyle(2, 0xd8e8ff, 0.8);
      for (let i = 0; i < 4; i++) { const a = now / 120 + i * Math.PI / 2; tw.gfx.strokeEllipse(tw.x, tw.y - i * 3, 18 - i * 3, 6); tw.gfx.lineBetween(tw.x + Math.cos(a) * 8, tw.y - 6 + Math.sin(a) * 3, tw.x, tw.y - 12); }
    }
    // 毒池
    for (const p of [...this.pools]) {
      if (now > p.until) { p.gfx.destroy(); this.pools = this.pools.filter((x) => x !== p); continue; }
      if (!locked && now >= p.next && Math.hypot(target.x - p.x, target.y - p.y) < (p.fire ? 15 : 20)) { p.next = now + 600; this.combat.poolHit(this.boss?.info.atk ?? 10, p, p.fire ? 'burn' : 'poison'); }
    }
    if (this.boss) hudState.boss = { visible: this.boss.alive && this.boss.started, name: this.bossInfo.name, hp: Math.max(0, this.boss.hp), max: this.boss.maxHp };

    hudState.minimap.player = { x: target.x / T, y: target.y / T };
    this.markerTimer -= dt;
    if (this.markerTimer <= 0) { this.markerTimer = 200; this.updateMinimapMarkers(); }
    this.questTimer -= dt;
    if (this.questTimer <= 0 && !locked) { this.questTimer = 400; this.syncQuests(); }
    this.hintTimer -= dt;
    if (this.hintTimer <= 0 && !locked) { this.hintTimer = 500; this.checkHints(); }
    this.achTimer -= dt;
    if (this.achTimer <= 0 && !locked) { this.achTimer = 2000; this.checkAchievements(); }
    if (this.floor && !this.floorCleared && !locked && this.enemies.length && this.enemies.every((e) => !e.alive)) this.clearTowerFloor();
    this.refreshHud();
  }
}
