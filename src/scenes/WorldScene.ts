import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE, SCENES, TILE_SIZE as T } from '../config';
import { Player } from '../entities/Player';
import { Enemy, type EnemyKind } from '../entities/Enemy';
import { Boss } from '../entities/Boss';
import { CombatSystem, type Breakable } from '../combat/CombatSystem';
import { floatText, ring } from '../combat/fx';
import npcs from '../data/npcs.json';
import dialogues from '../data/dialogues.json';
import { inputState, resetInput } from '../systems/inputState';
import { pickVariant, type DialogueVariant, type Line } from '../systems/dialogue';
import { gameState, gearLabel, giveRandomGear, openChest, statsOf, type Reward } from '../systems/gameState';
import { serialize, writeSave } from '../systems/save';
import { accept, offersFrom, onPickup, pickupVisible, questDef, readyFor, turnIn } from '../systems/quests';
import { FONT_FAMILY } from '../config';
import { sound } from '../audio/sound';
import { trackForMap } from '../audio/music';
import { collectionReport } from '../systems/collection';
import { MAPS } from '../data/maps';
import { findInFront } from '../systems/interaction';
import { secretFlag } from '../systems/collection';
import { hudState, type MapMarker } from '../systems/hudState';
import { EV, type DialogueRequest, type HudInfo, type SaveRequest } from '../systems/events';
import type { Facing } from '../systems/movement';

interface WorldData { map?: string; spawn?: string; face?: Facing; intro?: boolean; respawn?: boolean; outro?: boolean }

type Kind = 'npc' | 'chest' | 'sign' | 'well' | 'blocker' | 'lantern' | 'bossdoor' | 'jizo' | 'board' | 'pickup';
interface Thing { id: string; kind: Kind; x: number; y: number; sprite: Phaser.GameObjects.Sprite; props: Record<string, unknown> }
interface Block { sprite: Phaser.GameObjects.Sprite; tx: number; ty: number; group: string; dir: string; moving: boolean; pushMs: number }
interface Plate { sprite: Phaser.GameObjects.Sprite; tx: number; ty: number; group: string }
interface Gate { sprite: Phaser.GameObjects.Sprite; tx: number; ty: number; group: string; open: boolean }
interface Crack extends Breakable { sprite: Phaser.GameObjects.Sprite; tx: number; ty: number; id: string }
interface Pool { x: number; y: number; until: number; next: number; gfx: Phaser.GameObjects.Arc }

const FRAME = {
  chest: [25, 26], ironChest: [45, 46], goldChest: [47, 48], shimenawa: 27, well: 28, sign: 29,
  plate: [38, 39], block: 40, gate: 41, cracked: 42, lantern: [43, 44], bossDoor: 49, jizo: 51, cocoon: 52, web: 53, board: 54,
};
const LABEL: Record<Kind, string> = { npc: '對話', chest: '打開', sign: '查看', well: '調查', blocker: '調查', lantern: '點燈', bossdoor: '調查', jizo: '參拜', board: '告示', pickup: '撿起' };
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
  private boss?: Boss;
  private mapKey = '';
  private areaName = '';
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
    this.pickupObjs = []; this.icons = new Map();
    hudState.boss = { visible: false, name: '', hp: 0, max: 1 };
    this.lanternNext = {};
    this.transitioning = false;
    this.lastHud = '';
    this.playerGlow = undefined;
    const mapKey = this.mapKey = data.map ?? 'village';
    const spawnName = data.spawn ?? 'start';
    gameState.checkpoint = { map: mapKey, spawn: spawnName };
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

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.physics.add.collider(this.player, this.obstacles);
    this.solids = this.physics.add.staticGroup();
    this.physics.add.collider(this.player, this.solids);

    for (const o of objects) this.buildObject(o);
    this.restoreSolvedPuzzles();
    this.syncQuests();

    this.combat = new CombatSystem(this, this.player, this.enemies, this.obstacles, {
      onDeath: () => this.onDeath(),
      onHudChange: () => this.game.events.emit(EV.hud, null),
      toast: (m) => this.game.events.emit(EV.toast, m),
    });
    this.combat.breakables = this.breakables;

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
    const areaName = this.areaName = String(prop('displayName') ?? '');
    if (prop('fog')) this.addFog();
    if (prop('dark')) this.addDarkness(objects);
    this.buildMinimap();

    if (!this.scene.isActive(SCENES.ui)) this.scene.launch(SCENES.ui, { areaName });
    else this.game.events.emit(EV.area, areaName);

    sound.music(trackForMap(mapKey));
    // 自動存檔（PRD 10）：每次進入地圖
    writeSave('auto', serialize(gameState, mapKey, spawnName, areaName));

    if (this.boss) this.time.delayedCall(600, () => this.bossIntro());
    if (data.outro) this.time.delayedCall(600, () => this.chapterOutro());
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
        });
        break;
      }
      case 'npc': {
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
        if (gameState.flags.has('boss_defeated')) break;
        const b = this.boss = new Boss(this, x, y, gameState.difficulty);
        this.physics.add.collider(b, this.obstacles);
        b.minionCount = () => this.enemies.filter((e) => e.alive && e !== b).length;
        b.on('shoot', (en: Enemy, dir: { x: number; y: number }, speed?: number) => this.combat.enemyShoot(en, dir, speed));
        b.on('aoe', (en: Enemy, a: { x: number; y: number; r: number; mult?: number }) => this.combat.enemyAoe(en, a));
        b.on('summon', () => { sound.sfx('roar'); this.summonSpiders(); });
        b.on('pool', (_: Enemy, at: { x: number; y: number }) => this.addPool(at.x, at.y));
        b.on('webs', (_: Enemy, at: { x: number; y: number }) => this.spawnWebs(at.x, at.y));
        b.on('phase', (_: Enemy, p: number) => {
          sound.sfx('roar');
          this.game.events.emit(EV.toast, p === 2 ? '土蜘蛛召喚了手下！小心地上的毒' : '土蜘蛛發狂了！動作變快了');
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

  private onEnemyKilled(e: Enemy): void {
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
    if (animate) this.tweens.add({ targets: g.sprite, y: g.sprite.y - 12, alpha: 0, duration: 500, onComplete: () => g.sprite.destroy() });
    else g.sprite.destroy();
  }

  private lightLantern(t: Thing): void {
    const group = String(t.props.group), order = Number(t.props.order);
    if (gameState.flags.has(gateFlag(group)) || t.sprite.frame.name === String(FRAME.lantern[1])) { this.game.events.emit(EV.toast, `「${t.props.label}」的燈籠已經亮了`); return; }
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
  private bossIntro(): void {
    const first = !gameState.flags.has('boss_seen');
    this.runDialogue(first ? 'boss_intro' : 'boss_retry', () => {
      this.boss?.start(this.time.now);
      this.game.events.emit(EV.toast, '點亮四個角落的石燈籠，可以讓土蜘蛛動彈不得！');
    });
  }

  private summonSpiders(): void {
    if (!this.boss) return;
    for (const dx of [-48, 48]) {
      const x = Phaser.Math.Clamp(this.boss.x + dx, 3 * T, 21 * T), y = Phaser.Math.Clamp(this.boss.y + 16, 3 * T, 12 * T);
      ring(this, x, y, 14, 0xb04aff, 400);
      const e = new Enemy(this, x, y, 'bonespider', gameState.difficulty);
      this.physics.add.collider(e, this.obstacles);
      this.physics.add.collider(e, this.solids);
      e.on('shoot', (en: Enemy, dir: { x: number; y: number }) => this.combat.enemyShoot(en, dir));
      this.enemies.push(e);
    }
  }

  private addPool(x: number, y: number): void {
    const gfx = this.add.circle(x, y, 22, 0x9a3aff, 0.32).setStrokeStyle(1.5, 0xc78dff, 0.8).setDepth(3);
    this.tweens.add({ targets: gfx, alpha: 0.6, duration: 400, yoyo: true, repeat: -1 });
    this.pools.push({ x, y, until: this.time.now + 4500, next: 0, gfx });
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
    gameState.money += 500;
    gameState.items['銀鑰匙'] = (gameState.items['銀鑰匙'] ?? 0) + 1;
    const g = giveRandomGear(gameState, Math.random, 2, 2);
    this.game.events.emit(EV.toast, `獲得 500 文、銀鑰匙${g ? `、${gearLabel(g)}` : ''}`);
    this.time.delayedCall(1800, () => this.runDialogue('boss_defeated', () => {
      gameState.flags.add('boss_defeated');
      gameState.flags.add('chapter1_done');
      this.goTo('shrine', 'door', 'up', { outro: true });
    }));
  }

  private chapterOutro(): void {
    this.runDialogue('chapter1_outro', () => {
      const col = collectionReport(MAPS, gameState.openedChests, gameState.flags).percent;
      const m = Math.floor(gameState.playTime / 60);
      const path = gameState.bond >= gameState.anger ? '羈絆' : '怒火';
      this.game.events.emit(EV.banner, { title: '第一章　完', sub: `遊玩時間 ${m} 分・收集度 ${col}%・你走在「${path}」的路上`, duration: 6000 });
      this.refreshHud(true);
    });
  }

  // ---------- 氣氛 ----------
  private addFog(): void {
    const fog = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xdde8ee, 0.14).setOrigin(0).setScrollFactor(0).setDepth(200000);
    this.tweens.add({ targets: fog, alpha: 0.6, duration: 3000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  private addDarkness(objects: Phaser.Types.Tilemaps.TiledObject[]): void {
    this.add.rectangle(0, 0, GAME_WIDTH * 2, GAME_HEIGHT * 2, 0x0a0814, 0.42).setOrigin(0.25).setScrollFactor(0).setDepth(190000);
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
      const r = openChest(gameState, t.id, t.props as Reward);
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
    if (t.kind === 'pickup') {
      gameState.flags.add(`pickup:${t.id}`);
      sound.sfx('pickup');
      ring(this, t.x, t.y, 10, 0xfff2b0, 350);
      this.game.events.emit(EV.toast, `撿到了${t.props.label}`);
      for (const m of onPickup(gameState, String(t.props.group))) this.game.events.emit(EV.toast, m);
      this.syncQuests(); this.refreshHud(true);
      return;
    }
    if (t.kind === 'npc' && this.npcQuest(t)) return;
    if (t.kind === 'jizo') {
      const st = statsOf(gameState);
      gameState.hp = st.maxHp; gameState.mp = st.maxMp; gameState.statuses = {};
      ring(this, t.x, t.y, 16, 0xffe0b0, 500);
      sound.sfx('save');
      this.game.events.emit(EV.toast, '地藏保佑，HP 和 MP 全滿了');
      const req: SaveRequest = { map: this.mapKey, spawn: 'jizo', areaName: this.areaName };
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
    if (added.includes('prologue_done')) this.game.events.emit(EV.banner, { title: '序章　完', sub: '第一章「古井的土蜘蛛」開始' });
    this.refreshHud(true);
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
    if (!locked) this.updatePushing(dt);

    const target = this.player.center;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (locked) { e.setVelocity(0, 0); continue; }
      e.update(this.time.now, dt / 1000, target);
      const ec = e.center, reach = e instanceof Boss ? 18 : e.elite ? 14 : 11;
      if (Math.abs(ec.x - target.x) < reach && Math.abs(ec.y - target.y) < reach - 1) this.combat.touchedBy(e);
    }
    this.playerGlow?.setPosition(this.player.x, this.player.y);

    // 毒池
    const now = this.time.now;
    for (const p of [...this.pools]) {
      if (now > p.until) { p.gfx.destroy(); this.pools = this.pools.filter((x) => x !== p); continue; }
      if (!locked && now >= p.next && Math.hypot(target.x - p.x, target.y - p.y) < 20) { p.next = now + 600; this.combat.poolHit(this.boss?.info.atk ?? 10, p); }
    }
    if (this.boss) hudState.boss = { visible: this.boss.alive && this.boss.started, name: '土蜘蛛', hp: Math.max(0, this.boss.hp), max: this.boss.maxHp };

    hudState.minimap.player = { x: target.x / T, y: target.y / T };
    this.markerTimer -= dt;
    if (this.markerTimer <= 0) { this.markerTimer = 200; this.updateMinimapMarkers(); }
    this.questTimer -= dt;
    if (this.questTimer <= 0 && !locked) { this.questTimer = 400; this.syncQuests(); }
    this.refreshHud();
  }
}
