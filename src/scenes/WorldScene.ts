import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE, SCENES } from '../config';
import { Player } from '../entities/Player';
import { Enemy, type EnemyKind } from '../entities/Enemy';
import { CombatSystem } from '../combat/CombatSystem';
import npcs from '../data/npcs.json';
import dialogues from '../data/dialogues.json';
import { inputState, resetInput } from '../systems/inputState';
import { pickVariant, type DialogueVariant, type Line } from '../systems/dialogue';
import { gameState, openChest, statsOf, type Reward } from '../systems/gameState';
import { findInFront } from '../systems/interaction';
import { EV, type DialogueRequest, type HudInfo } from '../systems/events';
import type { Facing } from '../systems/movement';

interface WorldData { map?: string; spawn?: string; face?: Facing; intro?: boolean; respawn?: boolean }

type Kind = 'npc' | 'chest' | 'sign' | 'well' | 'blocker';
interface Thing { id: string; kind: Kind; x: number; y: number; sprite: Phaser.GameObjects.Sprite; props: Record<string, unknown> }

const FRAME = { chestClosed: 25, chestOpen: 26, shimenawa: 27, well: 28, sign: 29 };
const LABEL: Record<Kind, string> = { npc: '對話', chest: '打開', sign: '查看', well: '調查', blocker: '調查' };

function propsOf(o: Phaser.Types.Tilemaps.TiledObject): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of (o.properties ?? []) as { name: string; value: unknown }[]) out[p.name] = p.value;
  return out;
}

export class WorldScene extends Phaser.Scene {
  private player!: Player;
  private combat!: CombatSystem;
  private enemies: Enemy[] = [];
  private things: Thing[] = [];
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private obstacles!: Phaser.Tilemaps.TilemapLayer;
  private transitioning = false;
  private lastHud = '';

  constructor() { super(SCENES.world); }

  create(data: WorldData): void {
    resetInput();
    this.things = [];
    this.enemies = [];
    this.transitioning = false;
    this.lastHud = '';
    const mapKey = data.map ?? 'village';
    const spawnName = data.spawn ?? 'start';
    gameState.checkpoint = { map: mapKey, spawn: spawnName };
    if (data.respawn) {
      const st = statsOf(gameState);
      gameState.hp = st.maxHp; gameState.mp = st.maxMp; gameState.statuses = {};
    }

    const map = this.make.tilemap({ key: mapKey });
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

    this.combat = new CombatSystem(this, this.player, this.enemies, this.obstacles, {
      onDeath: () => this.onDeath(),
      onHudChange: () => this.game.events.emit(EV.hud, null),
      toast: (m) => this.game.events.emit(EV.toast, m),
    });

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
    const areaName = String(props.find((p) => p.name === 'displayName')?.value ?? '');
    if (props.find((p) => p.name === 'fog')?.value) this.addFog();

    if (!this.scene.isActive(SCENES.ui)) this.scene.launch(SCENES.ui, { areaName });
    else this.game.events.emit(EV.area, areaName);

    if (data.intro) this.time.delayedCall(700, () => this.say([
      ['燈', '……嗯，睡過頭了！'],
      ['燈', '爺爺好像留了字條在房間裡。先看看再出門吧。'],
    ]));
  }

  private buildObject(o: Phaser.Types.Tilemaps.TiledObject): void {
    const props = propsOf(o);
    const x = o.x ?? 0, y = o.y ?? 0;
    const add = (kind: Kind, sprite: Phaser.GameObjects.Sprite, solid = true) => {
      sprite.setDepth(y);
      if (solid) {
        this.solids.add(sprite);
        (sprite.body as Phaser.Physics.Arcade.StaticBody).setSize(12, 8).setOffset(2, 8);
      }
      this.things.push({ id: o.name, kind, x, y, sprite, props });
    };

    switch (o.type) {
      case 'exit': {
        const zone = this.add.zone(x, y, o.width ?? 16, o.height ?? 16).setOrigin(0);
        this.physics.add.existing(zone, true);
        this.physics.add.overlap(this.player, zone, () => this.goTo(String(props.map), String(props.spawn), props.face as Facing));
        break;
      }
      case 'npc': {
        const frame = (npcs as Record<string, { frame: number }>)[String(props.npc)]?.frame ?? 0;
        const s = this.add.sprite(x, y, 'npcs', frame);
        this.tweens.add({ targets: s, duration: 600, repeat: -1, yoyo: true, onYoyo: () => s.setFrame(frame + 1), onRepeat: () => s.setFrame(frame) });
        add('npc', s);
        break;
      }
      case 'chest':
        add('chest', this.add.sprite(x, y, 'tilesheet', gameState.openedChests.has(o.name) ? FRAME.chestOpen : FRAME.chestClosed));
        break;
      case 'sign': add('sign', this.add.sprite(x, y, 'tilesheet', FRAME.sign)); break;
      case 'well': add('well', this.add.sprite(x, y, 'tilesheet', FRAME.well)); break;
      case 'blocker': {
        if (gameState.flags.has(String(props.flag))) break;
        add('blocker', this.add.sprite(x, y, 'tilesheet', FRAME.shimenawa));
        (this.things[this.things.length - 1].sprite.body as Phaser.Physics.Arcade.StaticBody).setSize(16, 16).setOffset(0, 0);
        break;
      }
      case 'enemy': {
        const e = new Enemy(this, x, y, props.kind as EnemyKind, gameState.difficulty);
        this.physics.add.collider(e, this.obstacles);
        this.physics.add.collider(e, this.solids);
        if (e.kind === 'dummy') this.physics.add.collider(this.player, e);
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

  private addFog(): void {
    const fog = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xdde8ee, 0.14).setOrigin(0).setScrollFactor(0).setDepth(200000);
    this.tweens.add({ targets: fog, alpha: 0.6, duration: 3000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

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

  private target(): Thing | undefined {
    const candidates = this.things.map((t) => ({ id: t.id, x: t.x, y: t.y + 4, thing: t }));
    // 先找正前方；找不到再往前多看一格，讓人能隔著櫃台和店員說話
    return findInFront(this.player.center, this.player.facing, candidates)?.thing
      ?? findInFront(this.player.center, this.player.facing, candidates.filter((c) => c.thing.kind === 'npc'), 30, 12)?.thing;
  }

  private interact(t: Thing): void {
    if (t.kind === 'chest') {
      const r = openChest(gameState, t.id, t.props as Reward);
      if (r.opened) { t.sprite.setFrame(FRAME.chestOpen); this.refreshHud(true); }
      this.game.events.emit(EV.toast, r.message);
      return;
    }
    const id = String(t.props.dialogue ?? t.props.npc ?? t.id);
    const v = pickVariant((dialogues as unknown as Record<string, DialogueVariant[]>)[id], gameState.flags);
    if (!v) return;
    this.say(v.lines, () => {
      for (const f of v.set ?? []) gameState.flags.add(f);
      if (v.set?.length) this.onFlagsChanged(v.set);
      if (v.open === 'shop') this.game.events.emit(EV.shop, String(t.props.npc ?? 'rin'));
    });
  }

  private say(lines: Line[], onDone?: () => void): void {
    inputState.locked = true;
    this.player.setVelocity(0, 0);
    const req: DialogueRequest = { lines, onDone: () => { inputState.locked = false; onDone?.(); } };
    this.game.events.emit(EV.dialogue, req);
  }

  private onFlagsChanged(added: string[]): void {
    this.things = this.things.filter((t) => {
      if (t.kind === 'blocker' && gameState.flags.has(String(t.props.flag))) { t.sprite.destroy(); return false; }
      return true;
    });
    if (added.includes('talked_priest')) this.game.events.emit(EV.toast, '竹林入口的注連繩解開了');
    if (added.includes('prologue_done')) this.game.events.emit(EV.banner, { title: '序章　完', sub: '古井地城將在下一個版本開放' });
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

    const target = this.player.center;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (locked) { e.setVelocity(0, 0); continue; }
      e.update(this.time.now, dt / 1000, target);
      const ec = e.center;
      if (Math.abs(ec.x - target.x) < 11 && Math.abs(ec.y - target.y) < 10) this.combat.touchedBy(e);
    }
    this.refreshHud();
  }
}
