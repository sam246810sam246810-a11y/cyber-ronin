import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE, SCENES } from '../config';
import { Player } from '../entities/Player';
import npcs from '../data/npcs.json';
import dialogues from '../data/dialogues.json';
import { inputState, resetInput } from '../systems/inputState';
import { pickVariant, type DialogueVariant, type Line } from '../systems/dialogue';
import { gameState, openChest, type Reward } from '../systems/gameState';
import { findInFront } from '../systems/interaction';
import { EV, type DialogueRequest, type HudInfo } from '../systems/events';
import type { Facing } from '../systems/movement';

interface WorldData { map?: string; spawn?: string; face?: Facing; intro?: boolean }

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
  private things: Thing[] = [];
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private transitioning = false;
  private lastHud = '';

  constructor() { super(SCENES.world); }

  create(data: WorldData): void {
    resetInput();
    this.things = [];
    this.transitioning = false;
    this.lastHud = '';
    const mapKey = data.map ?? 'village';

    const map = this.make.tilemap({ key: mapKey });
    const tiles = map.addTilesetImage('village_tiles', 'tiles');
    if (!tiles) throw new Error('找不到 tileset village_tiles');
    map.createLayer('ground', tiles, 0, 0);
    const obstacles = map.createLayer('obstacles', tiles, 0, 0)!;
    obstacles.setCollisionByProperty({ collides: true });

    const objects = map.getObjectLayer('objects')?.objects ?? [];
    const spawn = objects.find((o) => o.type === 'spawn' && o.name === (data.spawn ?? 'start'))
      ?? objects.find((o) => o.type === 'spawn');
    this.player = new Player(this, spawn?.x ?? 64, spawn?.y ?? 64);
    if (data.face) { this.player.facing = data.face; this.player.anims.play(`idle-${data.face}`); }

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.physics.add.collider(this.player, obstacles);
    this.solids = this.physics.add.staticGroup();
    this.physics.add.collider(this.player, this.solids);

    for (const o of objects) this.buildObject(o);

    const cam = this.cameras.main;
    cam.setZoom(RENDER_SCALE);
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    // 地圖比畫面小（室內）時置中顯示
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

    this.game.events.on(EV.interact, this.interact, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(EV.interact, this.interact, this));

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
        const body = sprite.body as Phaser.Physics.Arcade.StaticBody;
        body.setSize(12, 8).setOffset(2, 8);
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
      case 'chest': {
        const opened = gameState.openedChests.has(o.name);
        add('chest', this.add.sprite(x, y, 'tilesheet', opened ? FRAME.chestOpen : FRAME.chestClosed));
        break;
      }
      case 'sign': add('sign', this.add.sprite(x, y, 'tilesheet', FRAME.sign)); break;
      case 'well': add('well', this.add.sprite(x, y, 'tilesheet', FRAME.well)); break;
      case 'blocker': {
        if (gameState.flags.has(String(props.flag))) break;
        add('blocker', this.add.sprite(x, y, 'tilesheet', FRAME.shimenawa));
        const body = this.things[this.things.length - 1].sprite.body as Phaser.Physics.Arcade.StaticBody;
        body.setSize(16, 16).setOffset(0, 0);
        break;
      }
      case 'foxfire': {
        // 狐火：提示附近藏著東西（PRD 2.2）
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

  private goTo(map: string, spawn: string, face?: Facing): void {
    if (this.transitioning) return;
    this.transitioning = true;
    inputState.locked = true;
    this.cameras.main.fadeOut(220, 20, 18, 28);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.restart({ map, spawn, face }));
  }

  private target(): Thing | undefined {
    const b = this.player.body as Phaser.Physics.Arcade.Body;
    // 物件的「中心」往下 4px，比較接近腳底位置
    const candidates = this.things.map((t) => ({ id: t.id, x: t.x, y: t.y + 4, thing: t }));
    return findInFront({ x: b.center.x, y: b.center.y }, this.player.facing, candidates)?.thing;
  }

  private interact(): void {
    if (inputState.locked || this.transitioning) return;
    const t = this.target();
    if (!t) return;
    if (t.kind === 'chest') {
      const msg = openChest(gameState, t.id, t.props as Reward);
      if (msg) { t.sprite.setFrame(FRAME.chestOpen); this.game.events.emit(EV.toast, msg); this.refreshHud(true); }
      else this.game.events.emit(EV.toast, '寶箱已經打開了');
      return;
    }
    const id = String(t.props.dialogue ?? t.props.npc ?? t.id);
    const v = pickVariant((dialogues as unknown as Record<string, DialogueVariant[]>)[id], gameState.flags);
    if (!v) return;
    this.say(v.lines, () => {
      for (const f of v.set ?? []) gameState.flags.add(f);
      if (v.set?.length) this.onFlagsChanged(v.set);
    });
  }

  private say(lines: Line[], onDone?: () => void): void {
    inputState.locked = true;
    const req: DialogueRequest = { lines, onDone: () => { inputState.locked = false; onDone?.(); } };
    this.game.events.emit(EV.dialogue, req);
  }

  private onFlagsChanged(added: string[]): void {
    // 移除已解除的封鎖（例如竹林入口的注連繩）
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
    const info: HudInfo = { canInteract: !!t, label: t ? LABEL[t.kind] : '調查' };
    const key = `${info.canInteract}|${info.label}`;
    if (!force && key === this.lastHud) return;
    this.lastHud = key;
    this.game.events.emit(EV.hud, info);
  }

  update(): void {
    this.player.move(inputState.locked ? { x: 0, y: 0 } : inputState.move);
    this.refreshHud();
  }
}
