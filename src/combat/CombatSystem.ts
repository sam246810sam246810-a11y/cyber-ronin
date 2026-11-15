import Phaser from 'phaser';
import skills from '../data/skills.json';
import { Player } from '../entities/Player';
import { Enemy, type HitOptions } from '../entities/Enemy';
import { applyItem, applyStatus, atkModifier, calcDamage, chooseQuickItem, COMBO_MULT, hasStatus, nextComboStep, pickAimTarget, tickStatuses } from '../systems/combat';
import { facingFromVector } from '../systems/movement';
import { canChangeJob, classStats, gainExp, gameState, gearLabel, giveRandomGear, statsOf } from '../systems/gameState';
import { canAddItem } from '../systems/inventory';
import { onKill as questKill } from '../systems/quests';
import { hudState } from '../systems/hudState';
import type { Action } from '../systems/inputState';
import type { Vec2 } from '../systems/movement';
import { floatText, ring, slashArc } from './fx';
import { sound } from '../audio/sound';

type SkillId = keyof typeof skills;

const DODGE = { duration: 400, iframes: 250, cooldown: 800, speed: 230 };
const HURT_IFRAMES = 900;
/** 自動瞄準範圍（px）：近戰、遠程 */
const AIM_RANGE = { melee: 56, ranged: 170 };
/** 打倒怪物掉落裝備的機率 */
const GEAR_DROP = 0.1;

/** 可以被攻擊打破的東西（裂開的牆） */
export interface Breakable { x: number; y: number; alive: boolean; onBreak: () => void }

interface EnemyShot { sprite: Phaser.GameObjects.Sprite; dir: Vec2; speed: number; atk: number; poison: number; slow: number; dieAt: number }

interface Projectile {
  sprite: Phaser.Physics.Arcade.Sprite;
  mult: number; dieAt: number; pierce: boolean; hit: Set<Enemy>; opts: HitOptions & { antiElite?: boolean };
}

/**
 * 主角的戰鬥：普通攻擊、技能、閃避、道具、受傷與死亡（PRD 4）。
 * 每個職業的攻擊方式不同：劍士近戰三段斬、弓術師射箭（長按蓄力）、陰陽師丟符咒。
 */
export class CombatSystem {
  private readonly cls = classStats(gameState.classId);
  /** 技能鈕上裝的技能（選單可以換） */
  private get skillIds(): SkillId[] { return gameState.skillSlots as SkillId[]; }
  private readonly skillReady = [0, 0];
  private attackReady = 0;
  private dodgeReady = 0;
  private comboStep = -1;
  private lastSwing = -9999;
  private attackHeld = false;
  private attackDownAt = 0;
  private lockUntil = 0;       // 不能行動（出招硬直）
  private slowUntil = 0;       // 出招中移動變慢
  private dodgeUntil = 0;
  private dashDir: Vec2 = { x: 0, y: 0 };
  private dashSpeed = 0;
  private invulnUntil = 0;
  private knockUntil = 0;
  private knock: Vec2 = { x: 0, y: 0 };
  private thrustUntil = 0;
  private thrustHit = new Set<Enemy>();
  private barrierUntil = 0;
  private barrier?: Phaser.GameObjects.Arc;
  private chargeRing: Phaser.GameObjects.Arc;
  private readonly marker: Phaser.GameObjects.Graphics;
  private dotAccum = 0;
  private projectiles: Projectile[] = [];
  // 第二章技能用
  private dmgReduceUntil = 0;
  private kishinUntil = 0;
  private shieldHits = 0;
  private shieldUntil = 0;
  private nextCharged = false;
  private thrustMult = 1.4;
  private familiars: { sprite: Phaser.GameObjects.Sprite; until: number; next: number; offset: number }[] = [];
  private traps: { sprite: Phaser.GameObjects.Graphics; x: number; y: number; until: number }[] = [];
  private aura?: Phaser.GameObjects.Arc;
  private shots: EnemyShot[] = [];
  breakables: Breakable[] = [];
  /** 這張地圖掉落裝備的階級（地圖屬性 tier） */
  dropTier = 1;
  private dead = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Player,
    private readonly enemies: Enemy[],
    private readonly obstacles: Phaser.Tilemaps.TilemapLayer,
    private readonly cb: { onDeath: () => void; onHudChange: () => void; toast: (m: string) => void },
  ) {
    this.chargeRing = scene.add.circle(0, 0, 10).setStrokeStyle(1.5, 0x9fd8ff, 1).setVisible(false).setDepth(130000);
    this.marker = scene.add.graphics().setDepth(125000);
    this.syncStats();
  }

  private get now(): number { return this.scene.time.now; }
  /** 目前能力值（等級＋裝備），換裝或升級後立即生效 */
  private get st() { return statsOf(gameState); }
  private syncStats(): void {
    const st = this.st;
    this.player.speed = st.spd;
    hudState.maxHp = st.maxHp;
    hudState.maxMp = st.maxMp;
  }
  private get busy(): boolean { return this.dead || this.now < this.lockUntil || this.now < this.dodgeUntil || this.now < this.thrustUntil || hasStatus(gameState.statuses, 'paralyze'); }
  get isInvulnerable(): boolean { return this.now < this.invulnUntil || this.now < this.barrierUntil || this.now < this.thrustUntil; }

  handle(action: Action): void {
    if (this.dead) return;
    switch (action) {
      case 'attackDown': this.attackHeld = true; this.attackDownAt = this.now; if (this.cls.name !== '弓術師') this.attack(); break;
      case 'attackUp':
        if (this.attackHeld && this.cls.name === '弓術師') this.shootArrow(this.now - this.attackDownAt);
        this.attackHeld = false; this.chargeRing.setVisible(false); break;
      case 'skill0': this.skill(0); break;
      case 'skill1': this.skill(1); break;
      case 'dodge': this.dodge(); break;
      case 'item': this.useItem(); break;
    }
  }

  /** 互動優先時（按攻擊鈕其實是對話）取消這次按壓。 */
  cancelAttackPress(): void { this.attackHeld = false; this.chargeRing.setVisible(false); }

  private get isMelee(): boolean { return this.cls.name === '劍士'; }

  /** 找出 range 內要自動瞄準的敵人。 */
  private aimTarget(range: number): Enemy | undefined {
    const alive = this.enemies.filter((e) => e.alive);
    const i = pickAimTarget(this.player.center, this.player.aim, alive.map((e) => e.center), range);
    return i >= 0 ? alive[i] : undefined;
  }

  /** 攻擊前自動轉向最近的敵人（手機上用搖桿很難精準瞄準）。 */
  private autoAim(range: number): void {
    const t = this.aimTarget(range);
    const p = this.player.center;
    // 身邊有可以打的機關（鈴、燈籠、裂牆）而且比敵人近：先瞄準機關
    const near = this.breakables.filter((b) => b.alive && Math.hypot(b.x - p.x, b.y - p.y) < 30)
      .sort((x, y) => Math.hypot(x.x - p.x, x.y - p.y) - Math.hypot(y.x - p.x, y.y - p.y))[0];
    const c = near && (!t || Math.hypot(near.x - p.x, near.y - p.y) < Math.hypot(t.center.x - p.x, t.center.y - p.y)) ? near : t?.center;
    if (!c) return;
    const dx = c.x - p.x, dy = c.y - p.y, d = Math.hypot(dx, dy) || 1;
    this.player.aim = { x: dx / d, y: dy / d };
    this.player.facing = facingFromVector(this.player.aim, this.player.facing);
  }

  // ---------- 普通攻擊 ----------
  private attack(): void {
    if (this.busy || this.now < this.attackReady) return;
    if (this.cls.name === '劍士') this.swordSwing();
    else this.throwTalisman(false);
  }

  private swordSwing(): void {
    this.autoAim(AIM_RANGE.melee);
    const step = nextComboStep(this.comboStep, (this.now - this.lastSwing) / 1000);
    this.comboStep = step; this.lastSwing = this.now;
    this.attackReady = this.now + (step === 2 ? 420 : 260);
    this.slowUntil = this.now + 200;
    sound.sfx('swing');
    const p = this.player.center, a = this.player.aim, ang = Math.atan2(a.y, a.x);
    const reach = step === 2 ? 20 : 17;
    slashArc(this.scene, p.x, p.y - 2, ang, reach, step === 1 ? 2.4 : 2.0, step === 2 ? 0xffd84a : 0xf8f0e0, step === 2 ? 4 : 3);
    this.hitCircle({ x: p.x + a.x * 13, y: p.y + a.y * 13 }, step === 2 ? 20 : 17, COMBO_MULT[step], { knock: step === 2 ? 200 : 120 });
  }

  private shootArrow(heldMs: number): void {
    if (this.busy || this.now < this.attackReady) return;
    const charged = heldMs >= 600 || this.nextCharged;
    this.nextCharged = false;
    sound.sfx('arrow');
    this.autoAim(AIM_RANGE.ranged);
    this.attackReady = this.now + 320;
    this.slowUntil = this.now + 120;
    this.fire(0, this.player.aim, charged ? 300 : 230, charged ? 2.0 : 1.0, charged ? 230 : 170, { pierce: charged, tint: charged ? 0x9fd8ff : undefined });
  }

  private throwTalisman(fireTalisman: boolean): void {
    this.autoAim(AIM_RANGE.ranged);
    this.attackReady = this.now + 380;
    sound.sfx('talisman');
    this.slowUntil = this.now + 150;
    this.fire(fireTalisman ? 2 : 1, this.player.aim, 170, fireTalisman ? skills.fire.mult : 1.1, 130, { opts: fireTalisman ? { burn: true } : {}, spin: true });
  }

  // ---------- 技能 ----------
  private skill(i: 0 | 1): void {
    const id = this.skillIds[i];
    const s = skills[id];
    if (this.busy || this.now < this.skillReady[i]) return;
    if (gameState.mp < s.mp) { this.cb.toast('MP 不足'); return; }
    gameState.mp -= s.mp;
    sound.sfx((['barrier', 'iron_wall', 'kishin', 'guardian', 'shiki', 'twin'] as string[]).includes(id) ? 'lantern'
      : (['spin', 'thrust', 'iai', 'tsubame', 'issen', 'rasetsu'] as string[]).includes(id) ? 'swing'
      : (['fire', 'thunder', 'gobosei', 'karyu'] as string[]).includes(id) ? 'talisman' : 'arrow');
    this.skillReady[i] = this.now + s.cd * 1000;
    const melee = (['thrust', 'iai', 'tsubame', 'issen'] as string[]).includes(id);
    if (!(['spin', 'barrier', 'iron_wall', 'kishin', 'rasetsu', 'guardian', 'trap', 'shiki', 'twin'] as string[]).includes(id)) this.autoAim(melee ? AIM_RANGE.melee + 40 : AIM_RANGE.ranged);
    const p = this.player.center, a = this.player.aim;
    switch (id) {
      case 'spin':
        this.lockUntil = this.now + 250;
        ring(this.scene, p.x, p.y, 24, 0xffd84a, 260);
        slashArc(this.scene, p.x, p.y, 0, 22, Math.PI * 2, 0xffd84a, 3);
        this.hitCircle(p, 28, s.mult, { knock: 220 });
        break;
      case 'thrust':
        this.thrustUntil = this.now + 180;
        this.dashDir = { ...a }; this.dashSpeed = 400; this.thrustMult = s.mult;
        this.thrustHit.clear();
        slashArc(this.scene, p.x + a.x * 10, p.y + a.y * 10, Math.atan2(a.y, a.x), 10, 0.9, 0x9fd8ff, 4);
        break;
      case 'triple': {
        const base = Math.atan2(a.y, a.x);
        for (const d of [-0.26, 0, 0.26]) this.fire(0, { x: Math.cos(base + d), y: Math.sin(base + d) }, 230, s.mult, 160, {});
        this.attackReady = this.now + 250;
        break;
      }
      case 'bind':
        this.fire(0, a, 260, s.mult, 190, { opts: { paralyze: true }, tint: 0xfff27a });
        break;
      case 'fire':
        this.throwTalisman(true);
        break;
      case 'barrier':
        this.barrierUntil = this.now + 3000;
        this.barrier?.destroy();
        this.barrier = this.scene.add.circle(p.x, p.y, 16, 0x9fd8ff, 0.15).setStrokeStyle(1.5, 0x9fd8ff, 0.9).setDepth(130000);
        this.scene.tweens.add({ targets: this.barrier, scale: 1.1, duration: 300, yoyo: true, repeat: -1 });
        break;
      // ---------- 第二章：Lv6／Lv9 技能 ----------
      case 'iron_wall':
        this.dmgReduceUntil = this.now + 3000;
        this.setAura(0xb8b8c8, 3000);
        break;
      case 'iai': {
        this.lockUntil = this.now + 320;
        const dir = { ...a };
        ring(this.scene, p.x, p.y, 8, 0xffffff, 300);
        this.scene.time.delayedCall(260, () => {
          if (this.dead) return;
          const c = this.player.center;
          slashArc(this.scene, c.x + dir.x * 8, c.y + dir.y * 8, Math.atan2(dir.y, dir.x), 22, 1.2, 0xffffff, 5);
          this.scene.cameras.main.shake(80, 0.004);
          this.hitCircle({ x: c.x + dir.x * 18, y: c.y + dir.y * 18 }, 20, s.mult, { knock: 260 });
        });
        break;
      }
      case 'backstep':
        this.dodgeUntil = this.now + 180;
        this.invulnUntil = Math.max(this.invulnUntil, this.now + 180);
        this.dashDir = { x: -a.x, y: -a.y }; this.dashSpeed = 280;
        this.fire(0, a, 260, s.mult, 190, {});
        break;
      case 'arrow_rain': {
        const t = this.aimTarget(AIM_RANGE.ranged)?.center ?? { x: p.x + a.x * 60, y: p.y + a.y * 60 };
        const warn = this.scene.add.circle(t.x, t.y, 28, 0x9fd8ff, 0.12).setStrokeStyle(1, 0x9fd8ff, 0.8).setDepth(4);
        for (let k = 0; k < 5; k++) this.scene.time.delayedCall(350 + k * 200, () => {
          for (let j = 0; j < 4; j++) floatText(this.scene, t.x + Phaser.Math.Between(-24, 24), t.y + Phaser.Math.Between(-20, 20), '｜', '#cfe8ff', 9);
          this.hitCircle(t, 28, s.mult, { knock: 40 });
          if (k === 4) warn.destroy();
        });
        break;
      }
      case 'shiki': this.summonFamiliar(8000, 0); break;
      case 'thunder': this.chainLightning(s.mult); break;
      // ---------- 第二章：轉職技能 ----------
      case 'tsubame': {
        const dir = { ...a };
        this.lockUntil = this.now + 300;
        const cut = (sign: number) => {
          const c = this.player.center, d = { x: dir.x * sign, y: dir.y * sign };
          slashArc(this.scene, c.x, c.y, Math.atan2(d.y, d.x), 18, 2.4, 0xbfe8ff, 4);
          this.hitCircle({ x: c.x + d.x * 13, y: c.y + d.y * 13 }, 18, s.mult, { knock: 150 });
        };
        cut(1); this.scene.time.delayedCall(140, () => { if (!this.dead) { sound.sfx('swing'); cut(-1); } });
        break;
      }
      case 'issen':
        this.thrustUntil = this.now + 220;
        this.dashDir = { ...a }; this.dashSpeed = 480; this.thrustMult = s.mult;
        this.thrustHit.clear();
        slashArc(this.scene, p.x, p.y, Math.atan2(a.y, a.x), 14, 0.6, 0xffffff, 5);
        break;
      case 'kishin':
        this.kishinUntil = this.now + 8000;
        this.setAura(0xff3a3a, 8000);
        break;
      case 'rasetsu':
        this.lockUntil = this.now + 300;
        ring(this.scene, p.x, p.y, 34, 0xff3a3a, 320);
        slashArc(this.scene, p.x, p.y, 0, 30, Math.PI * 2, 0xff5a5a, 4);
        this.lifestealNext = 0.3;
        this.hitCircle(p, 36, s.mult, { knock: 240 });
        this.lifestealNext = 0;
        break;
      case 'hama':
        this.fire(0, a, 320, s.mult, 230, { pierce: true, tint: 0xffe08a, antiElite: true });
        break;
      case 'trap': {
        if (this.traps.length >= 2) this.traps.shift()!.sprite.destroy();
        const g = this.scene.add.graphics().setDepth(3);
        g.lineStyle(1.5, 0xc8c8d0, 1).strokeCircle(p.x, p.y + 4, 6).lineBetween(p.x - 6, p.y + 4, p.x + 6, p.y + 4);
        this.traps.push({ sprite: g, x: p.x, y: p.y + 4, until: this.now + 10000 });
        break;
      }
      case 'shippu':
        this.dodgeUntil = this.now + 250;
        this.invulnUntil = Math.max(this.invulnUntil, this.now + 250);
        this.dashDir = { ...a }; this.dashSpeed = 320;
        this.nextCharged = true;
        this.setAura(0x9fffd8, 600);
        break;
      case 'rapid': {
        const dir = { ...a };
        for (let k = 0; k < 5; k++) this.scene.time.delayedCall(k * 100, () => {
          if (this.dead) return;
          const t = this.aimTarget(AIM_RANGE.ranged), c = this.player.center;
          const d = t ? (() => { const dx = t.center.x - c.x, dy = t.center.y - c.y, l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l }; })() : dir;
          sound.sfx('arrow');
          this.fire(0, d, 260, s.mult, 180, {});
        });
        this.attackReady = this.now + 500;
        break;
      }
      case 'gobosei': {
        const t = this.aimTarget(AIM_RANGE.ranged)?.center ?? { x: p.x + a.x * 50, y: p.y + a.y * 50 };
        const g = this.scene.add.graphics().setDepth(4);
        const pts = Array.from({ length: 5 }, (_, k) => ({ x: t.x + Math.cos(-Math.PI / 2 + k * 4 * Math.PI / 5) * 30, y: t.y + Math.sin(-Math.PI / 2 + k * 4 * Math.PI / 5) * 30 }));
        g.lineStyle(1.5, 0xffe08a, 0.9).strokePoints([...pts, pts[0]]).strokeCircle(t.x, t.y, 32);
        this.scene.time.delayedCall(500, () => {
          g.destroy();
          ring(this.scene, t.x, t.y, 34, 0xffe08a, 400);
          this.scene.cameras.main.shake(100, 0.005);
          sound.sfx('break');
          this.hitCircle(t, 34, s.mult, { knock: 200 });
        });
        break;
      }
      case 'karyu':
        this.fire(2, a, 220, s.mult, 200, { pierce: true, opts: { burn: true }, tint: 0xff6a3a, spin: true });
        break;
      case 'twin': this.summonFamiliar(10000, -1); this.summonFamiliar(10000, 1); break;
      case 'guardian': {
        const st = this.st;
        this.shieldHits = 3; this.shieldUntil = this.now + 10000;
        gameState.hp = Math.min(st.maxHp, gameState.hp + Math.round(st.maxHp * 0.2));
        floatText(this.scene, this.player.x, this.player.y - 12, `+${Math.round(st.maxHp * 0.2)}`, '#7fe08a', 10);
        this.setAura(0x9fd8ff, 10000);
        break;
      }
    }
    this.cb.onHudChange();
  }

  private lifestealNext = 0;

  private setAura(color: number, ms: number): void {
    this.aura?.destroy();
    this.aura = this.scene.add.circle(this.player.x, this.player.y, 13, color, 0.12).setStrokeStyle(1.5, color, 0.8).setDepth(129000);
    this.scene.tweens.add({ targets: this.aura, scale: 1.15, duration: 350, yoyo: true, repeat: -1 });
    const a = this.aura;
    this.scene.time.delayedCall(ms, () => { if (this.aura === a) { a.destroy(); this.aura = undefined; } });
  }

  private summonFamiliar(ms: number, offset: number): void {
    const sprite = this.scene.add.sprite(this.player.x, this.player.y - 14, 'fx', 1).setDepth(131000).setTint(0xf8f8ff).setScale(0.8);
    this.familiars.push({ sprite, until: this.now + ms, next: this.now + 300, offset });
  }

  /** 雷符：打最近的敵人，再跳到附近最多 2 隻 */
  private chainLightning(mult: number): void {
    const hit = new Set<Enemy>();
    let from = this.player.center;
    const g = this.scene.add.graphics().setDepth(132000);
    for (let k = 0; k < 3; k++) {
      const range = k === 0 ? AIM_RANGE.ranged : 70;
      const cand = this.enemies.filter((e) => e.alive && !hit.has(e) && Math.hypot(e.center.x - from.x, e.center.y - from.y) <= range)
        .sort((x, y) => Math.hypot(x.center.x - from.x, x.center.y - from.y) - Math.hypot(y.center.x - from.x, y.center.y - from.y))[0];
      if (!cand) break;
      const to = cand.center;
      g.lineStyle(2, 0xfff27a, 1).beginPath().moveTo(from.x, from.y);
      for (let j = 1; j < 4; j++) g.lineTo(from.x + (to.x - from.x) * j / 4 + Phaser.Math.Between(-4, 4), from.y + (to.y - from.y) * j / 4 + Phaser.Math.Between(-4, 4));
      g.lineTo(to.x, to.y).strokePath();
      hit.add(cand);
      this.hitEnemy(cand, mult, from, { paralyze: k === 0 && Math.random() < 0.3 });
      from = to;
    }
    if (!hit.size) floatText(this.scene, this.player.x, this.player.y - 12, '沒有目標', '#a39fb8', 8);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 250, onComplete: () => g.destroy() });
  }

  private dodge(): void {
    if (this.dead || this.now < this.dodgeReady || this.now < this.dodgeUntil || this.now < this.thrustUntil || hasStatus(gameState.statuses, 'paralyze')) return;
    this.dodgeUntil = this.now + DODGE.duration;
    this.invulnUntil = Math.max(this.invulnUntil, this.now + DODGE.iframes);
    this.dodgeReady = this.now + DODGE.cooldown;
    sound.sfx('dodge');
    this.dashDir = { ...this.player.aim }; this.dashSpeed = DODGE.speed;
    this.player.setAlpha(0.55);
    this.scene.tweens.add({ targets: this.player, angle: 360 * Math.sign(this.dashDir.x || 1), duration: DODGE.duration, onComplete: () => this.player.setAngle(0).setAlpha(1) });
  }

  private useItem(): void {
    if (this.dead) return;
    const v = this.vitals();
    const name = chooseQuickItem(gameState.items, v);
    if (!name) { this.cb.toast(Object.values(gameState.items).some((n) => n > 0) ? '現在不需要用道具' : '沒有可以用的道具'); return; }
    gameState.items[name]--;
    const msg = applyItem(name, v);
    gameState.hp = v.hp; gameState.mp = v.mp;
    this.lockUntil = this.now + 500; // 使用道具 0.5 秒（PRD 7.6）
    sound.sfx('heal');
    ring(this.scene, this.player.x, this.player.y, 12, 0x7fe08a, 400);
    this.cb.toast(msg);
    this.cb.onHudChange();
  }

  private vitals() { const st = this.st; return { hp: gameState.hp, maxHp: st.maxHp, mp: gameState.mp, maxMp: st.maxMp, statuses: gameState.statuses }; }

  // ---------- 命中判定 ----------
  private playerAtk(): number { return this.st.atk * atkModifier(gameState.statuses) * (this.now < this.kishinUntil ? 1.4 : 1); }

  private hitEnemy(e: Enemy, mult: number, from: Vec2, opts: HitOptions & { antiElite?: boolean }): void {
    const m = opts.antiElite && e.elite ? mult * 2 : mult;
    const d = calcDamage(this.playerAtk(), m, e.info.def, Math.random, this.st.crit / 100);
    sound.sfx(d.crit ? 'crit' : 'hit');
    const steal = Math.max(this.lifestealNext, this.now < this.kishinUntil ? 0.15 : 0);
    if (steal > 0 && e.kind !== 'dummy') {
      const heal = Math.max(1, Math.round(d.amount * steal));
      gameState.hp = Math.min(this.st.maxHp, gameState.hp + heal);
    }
    if (e.hit(d.amount, d.crit, from, opts)) this.onKill(e);
  }

  private hitCircle(c: Vec2, r: number, mult: number, opts: HitOptions): number {
    let n = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const ec = e.center;
      if (Math.hypot(ec.x - c.x, ec.y - c.y) <= r + 5) { this.hitEnemy(e, mult, this.player.center, opts); n++; }
    }
    for (const b of this.breakables) if (b.alive && Math.hypot(b.x - c.x, b.y - c.y) <= r + 8) this.breakIt(b);
    return n;
  }

  private breakIt(b: Breakable): void {
    b.alive = false;
    sound.sfx('break');
    ring(this.scene, b.x, b.y, 14, 0xd8d0c0, 350);
    this.scene.cameras.main.shake(120, 0.006);
    b.onBreak();
  }

  private onKill(e: Enemy): void {
    sound.sfx('kill');
    const [lo, hi] = e.info.money;
    const money = Phaser.Math.Between(lo, hi);
    gameState.money += money;
    const levels = gainExp(gameState, e.info.exp);
    if (e.info.exp) floatText(this.scene, e.x, e.y - 22, `+${e.info.exp} EXP`, '#9fd8ff', 7);
    if (levels > 0) this.onLevelUp();
    // 素材掉落
    for (const dr of (e.info as { drops?: { item: string; chance: number }[] }).drops ?? []) {
      if (Math.random() >= dr.chance) continue;
      if (!canAddItem(gameState, dr.item)) { this.cb.toast('背包滿了，素材撿不起來'); continue; }
      gameState.items[dr.item] = (gameState.items[dr.item] ?? 0) + 1;
      floatText(this.scene, e.x + 8, e.y - 6, dr.item, '#c7f0a0', 7);
    }
    for (const m of questKill(gameState, e.kind)) this.cb.toast(m);
    if (e.kind !== 'dummy' && Math.random() < GEAR_DROP) {
      const g = giveRandomGear(gameState, Math.random, this.dropTier);
      this.cb.toast(g ? `獲得 ${gearLabel(g)}` : '背包滿了，裝備撿不起來');
    }
    if (money) {
      const coin = this.scene.add.sprite(e.x, e.y, 'fx', 3).setDepth(e.y);
      this.scene.tweens.add({ targets: coin, y: e.y - 10, duration: 250, yoyo: true, onComplete: () => this.scene.tweens.add({ targets: coin, alpha: 0, x: this.player.x, y: this.player.y, duration: 250, onComplete: () => coin.destroy() }) });
      floatText(this.scene, e.x, e.y - 14, `+${money} 文`, '#f2c94c', 8);
    }
    this.cb.onHudChange();
  }

  private onLevelUp(): void {
    sound.sfx('levelup');
    if (canChangeJob(gameState)) this.scene.time.delayedCall(1500, () => this.cb.toast('可以轉職了！回神社找宮司爺爺'));
    this.syncStats();
    const p = this.player;
    ring(this.scene, p.x, p.y, 20, 0xffd84a, 500);
    ring(this.scene, p.x, p.y, 12, 0xffffff, 350);
    floatText(this.scene, p.x, p.y - 14, `升級！Lv.${gameState.level}`, '#ffd84a', 11);
    this.cb.toast(`升到 Lv.${gameState.level}！HP 和 MP 全滿`);
  }

  /** 換裝備後呼叫 */
  refreshStats(): void { this.syncStats(); }

  private fire(frame: number, dir: Vec2, speed: number, mult: number, range: number,
    o: { pierce?: boolean; opts?: HitOptions; tint?: number; spin?: boolean; antiElite?: boolean }): void {
    const p = this.player.center;
    const s = this.scene.physics.add.sprite(p.x + dir.x * 6, p.y - 3 + dir.y * 6, 'fx', frame).setDepth(130000);
    (s.body as Phaser.Physics.Arcade.Body).setSize(6, 6);
    s.setVelocity(dir.x * speed, dir.y * speed).setRotation(Math.atan2(dir.y, dir.x));
    if (o.tint) s.setTint(o.tint);
    if (o.spin) this.scene.tweens.add({ targets: s, angle: 360, duration: 400, repeat: -1 });
    this.scene.physics.add.collider(s, this.obstacles, () => this.removeProjectile(s));
    this.projectiles.push({ sprite: s, mult, dieAt: this.now + (range / speed) * 1000, pierce: !!o.pierce, hit: new Set(), opts: { ...(o.opts ?? {}), ...(o.antiElite ? { antiElite: true } : {}) } });
  }

  private removeProjectile(s: Phaser.Physics.Arcade.Sprite): void {
    this.projectiles = this.projectiles.filter((p) => p.sprite !== s);
    if (s.active) { ring(this.scene, s.x, s.y, 4, 0xffffff, 150); s.destroy(); }
  }

  // ---------- 受傷 ----------
  /** 敵人碰到主角。 */
  touchedBy(e: Enemy): void {
    if (this.dead || e.info.atk <= 0) return;
    if (this.now < this.barrierUntil) { e.hit(1, false, this.player.center, { knock: 200 }); if (!e.alive) this.onKill(e); return; }
    if (this.isInvulnerable) return;
    const info = e.info as { burnChance?: number; poisonChance?: number };
    if (this.damagePlayer(e.info.atk, e.center, { burn: info.burnChance })) e.recoil(this.player.center);
  }

  /** 主角受傷（碰撞、毒絲、重擊共用）。回傳是否真的受傷。 */
  private damagePlayer(atk: number, from: Vec2, chance: { burn?: number; poison?: number } = {}, mult = 1): boolean {
    if (this.dead || this.isInvulnerable) return false;
    if (this.shieldHits > 0 && this.now < this.shieldUntil) {
      this.shieldHits--;
      this.invulnUntil = this.now + 400;
      floatText(this.scene, this.player.x, this.player.y - 10, `擋下（剩 ${this.shieldHits}）`, '#9fd8ff', 8);
      if (!this.shieldHits && this.aura) { this.aura.destroy(); this.aura = undefined; }
      return false;
    }
    const d = calcDamage(atk, mult * (this.now < this.dmgReduceUntil ? 0.5 : 1), this.st.def);
    sound.sfx('hurt');
    gameState.hp = Math.max(0, gameState.hp - d.amount);
    floatText(this.scene, this.player.x, this.player.y - 10, String(d.amount), '#ff6a6a', 10);
    this.invulnUntil = this.now + HURT_IFRAMES;
    const pc = this.player.center, dx = pc.x - from.x, dy = pc.y - from.y, dist = Math.hypot(dx, dy) || 1;
    this.knock = { x: (dx / dist) * 160, y: (dy / dist) * 160 };
    this.knockUntil = this.now + 90;
    this.scene.cameras.main.shake(90, 0.004);
    if (chance.burn && Math.random() < chance.burn) { applyStatus(gameState.statuses, 'burn'); this.cb.toast('燒傷了！'); }
    if (chance.poison && Math.random() < chance.poison) { applyStatus(gameState.statuses, 'poison'); this.cb.toast('中毒了！'); }
    this.cb.onHudChange();
    if (gameState.hp <= 0) this.die();
    return true;
  }

  /** 骨蜘蛛吐毒絲。 */
  enemyShoot(e: Enemy, dir: Vec2, speed = 105): void {
    const c = e.center;
    sound.sfx('web');
    const info = e.info as { poisonChance?: number; shot?: { frame: number; slow?: number } };
    const sprite = this.scene.add.sprite(c.x, c.y, 'fx', info.shot?.frame ?? 4).setDepth(130000);
    if (e.kind === 'kappaking') sprite.setTint(0x6ac8ff);
    this.scene.tweens.add({ targets: sprite, angle: 360, duration: 500, repeat: -1 });
    this.shots.push({ sprite, dir, speed, atk: e.info.atk, poison: info.poisonChance ?? 0, slow: info.shot?.slow ?? 0, dieAt: this.now + 2200 });
  }

  /** 提燈鬼的範圍重擊。 */
  enemyAoe(e: Enemy, a: { x: number; y: number; r: number; mult?: number }): void {
    sound.sfx('slam');
    ring(this.scene, a.x, a.y, a.r, 0xff6a3a, 300);
    this.scene.cameras.main.shake(150, 0.008);
    const pc = this.player.center;
    if (Math.hypot(pc.x - a.x, pc.y - a.y) > a.r + 4) return;
    if (this.now < this.barrierUntil) { floatText(this.scene, this.player.x, this.player.y - 10, '擋下', '#9fd8ff', 9); return; }
    const info = e.info as { burnChance?: number };
    this.damagePlayer(e.info.atk, a, { burn: info.burnChance }, a.mult ?? 1.6);
  }

  /** 河童王的大浪：一整排的範圍攻擊 */
  enemyBand(e: Enemy, b: { y: number; h: number; mult: number }): void {
    sound.sfx('slam');
    const pc = this.player.center;
    if (Math.abs(pc.y - b.y) > b.h / 2) return;
    if (this.now < this.barrierUntil) { floatText(this.scene, this.player.x, this.player.y - 10, '擋下', '#9fd8ff', 9); return; }
    this.damagePlayer(e.info.atk, { x: pc.x, y: b.y - 40 }, {}, b.mult);
  }

  /** 大天狗的狂風：把主角吹離，太近會受傷 */
  enemyGale(e: Enemy, g: { x: number; y: number; r: number }): void {
    sound.sfx('dodge');
    const pc = this.player.center, dx = pc.x - g.x, dy = pc.y - g.y, d = Math.hypot(dx, dy) || 1;
    if (this.now < this.barrierUntil) { floatText(this.scene, this.player.x, this.player.y - 10, '擋下', '#9fd8ff', 9); return; }
    if (d > 140) return;
    this.knock = { x: (dx / d) * 260, y: (dy / d) * 260 };
    this.knockUntil = this.now + 350;
    if (d <= g.r) this.damagePlayer(e.info.atk, g, {}, 1.2);
  }

  /** 旋風等移動中的危險物碰到主角 */
  hazardHit(atk: number, at: Vec2, mult: number): void {
    if (this.now < this.barrierUntil) return;
    this.damagePlayer(atk, at, {}, mult);
  }

  /** 山風：在風區裡被推著走（閃避、突刺中不受影響） */
  windPush(dx: number, dy: number): void {
    const now = this.now;
    if (this.dead || now < this.dodgeUntil || now < this.thrustUntil || now < this.knockUntil) return;
    const b = this.player.body as Phaser.Physics.Arcade.Body;
    b.velocity.x += dx; b.velocity.y += dy;
  }

  /** 站在毒池裡：小傷害＋中毒 */
  poolHit(atk: number, at: Vec2, kind: 'poison' | 'burn' = 'poison'): void {
    if (this.now < this.barrierUntil) return;
    this.damagePlayer(atk, at, kind === 'burn' ? { burn: 1 } : { poison: 1 }, 0.5);
  }

  private die(): void {
    this.dead = true;
    sound.sfx('death');
    this.player.setVelocity(0, 0).setTint(0x6a6a8a);
    this.scene.tweens.add({ targets: this.player, angle: 90, duration: 300 });
    this.cb.onDeath();
  }

  // ---------- 每幀 ----------
  update(dt: number, move: Vec2): void {
    const now = this.now, sec = dt / 1000;
    this.syncStats();
    if (!this.dead) {
      const st = this.st;
      gameState.mp = Math.min(st.maxMp, gameState.mp + st.mpRegen * sec);
      const dot = tickStatuses(gameState.statuses, sec, st.maxHp);
      if (dot > 0) {
        this.dotAccum += dot;
        if (this.dotAccum >= 1) {
          const n = Math.floor(this.dotAccum); this.dotAccum -= n;
          gameState.hp = Math.max(0, gameState.hp - n);
          floatText(this.scene, this.player.x, this.player.y - 10, String(n), '#ff9a4a', 8);
          if (gameState.hp <= 0) this.die();
        }
      }
    }

    // 移動
    if (this.dead) this.player.setVelocity(0, 0);
    else if (now < this.thrustUntil || now < this.dodgeUntil) this.player.drive(this.dashDir.x * this.dashSpeed, this.dashDir.y * this.dashSpeed);
    else if (now < this.knockUntil) this.player.drive(this.knock.x, this.knock.y);
    else if (hasStatus(gameState.statuses, 'paralyze') || now < this.lockUntil) this.player.move({ x: 0, y: 0 });
    else this.player.move(move, (now < this.slowUntil ? 0.35 : 1) * (hasStatus(gameState.statuses, 'slow') ? 0.6 : 1));

    // 突刺途中命中
    if (now < this.thrustUntil) {
      for (const e of this.enemies) {
        if (!e.alive || this.thrustHit.has(e)) continue;
        const ec = e.center, pc = this.player.center;
        if (Math.hypot(ec.x - pc.x, ec.y - pc.y) < 16) { this.thrustHit.add(e); this.hitEnemy(e, this.thrustMult, pc, { knock: 220 }); }
      }
    }

    // 投射物
    for (const pr of [...this.projectiles]) {
      if (!pr.sprite.active || now > pr.dieAt) { this.removeProjectile(pr.sprite); continue; }
      const wall = this.breakables.find((b) => b.alive && Math.hypot(b.x - pr.sprite.x, b.y - pr.sprite.y) < 11);
      if (wall) { this.breakIt(wall); this.removeProjectile(pr.sprite); continue; }
      for (const e of this.enemies) {
        if (!e.alive || pr.hit.has(e)) continue;
        const ec = e.center;
        if (Math.hypot(ec.x - pr.sprite.x, ec.y - pr.sprite.y) < 12) {
          pr.hit.add(e);
          this.hitEnemy(e, pr.mult, { x: pr.sprite.x - (pr.sprite.body?.velocity.x ?? 0), y: pr.sprite.y - (pr.sprite.body?.velocity.y ?? 0) }, { knock: 110, ...pr.opts });
          if (!pr.pierce) { this.removeProjectile(pr.sprite); break; }
        }
      }
    }

    // 敵人的毒絲
    for (const sh of [...this.shots]) {
      const sp = sh.sprite;
      sp.x += sh.dir.x * sh.speed * sec; sp.y += sh.dir.y * sh.speed * sec;
      const tile = this.obstacles.getTileAtWorldXY(sp.x, sp.y);
      const pc = this.player.center;
      let gone = now > sh.dieAt || !!tile?.collides;
      if (!gone && Math.hypot(pc.x - sp.x, pc.y - sp.y) < 9) {
        if (now < this.barrierUntil) { floatText(this.scene, this.player.x, this.player.y - 10, '擋下', '#9fd8ff', 9); gone = true; }
        else if (!this.isInvulnerable) { if (this.damagePlayer(sh.atk, { x: sp.x - sh.dir.x, y: sp.y - sh.dir.y }, { poison: sh.poison }, 0.9) && sh.slow && Math.random() < sh.slow) { applyStatus(gameState.statuses, 'slow'); this.cb.toast('被泥巴黏住，腳步變慢了'); } gone = true; }
      }
      if (gone) { ring(this.scene, sp.x, sp.y, 4, 0xb04aff, 150); sp.destroy(); this.shots = this.shots.filter((x) => x !== sh); }
    }

    // 按住攻擊：劍士、陰陽師自動連打；弓術師顯示蓄力
    if (this.attackHeld && !this.dead) {
      if (this.cls.name === '弓術師') {
        const held = now - this.attackDownAt;
        hudState.charge = Math.min(1, held / 600);
        this.chargeRing.setVisible(held > 120).setPosition(this.player.x, this.player.y)
          .setStrokeStyle(held >= 600 ? 2.5 : 1.5, held >= 600 ? 0xffd84a : 0x9fd8ff, 1).setScale(1.6 - 0.6 * hudState.charge);
      } else this.attack();
    } else hudState.charge = 0;

    // 式神：跟在身邊，每 0.6 秒對附近的敵人丟符
    for (const f of [...this.familiars]) {
      if (now > f.until || this.dead) { ring(this.scene, f.sprite.x, f.sprite.y, 6, 0xffffff, 200); f.sprite.destroy(); this.familiars = this.familiars.filter((x) => x !== f); continue; }
      const tx = this.player.x + f.offset * 14 + Math.sin(now / 300 + f.offset) * 4, ty = this.player.y - 14 + Math.cos(now / 250) * 3;
      f.sprite.setPosition(f.sprite.x + (tx - f.sprite.x) * 0.2, f.sprite.y + (ty - f.sprite.y) * 0.2);
      if (now >= f.next) {
        f.next = now + 600;
        const t = this.enemies.filter((e) => e.alive && e.kind !== 'dummy' && Math.hypot(e.center.x - f.sprite.x, e.center.y - f.sprite.y) < 120)
          .sort((x, y) => Math.hypot(x.center.x - f.sprite.x, x.center.y - f.sprite.y) - Math.hypot(y.center.x - f.sprite.x, y.center.y - f.sprite.y))[0];
        if (t) {
          const dx = t.center.x - f.sprite.x, dy = t.center.y - f.sprite.y, l = Math.hypot(dx, dy) || 1;
          const s = this.scene.physics.add.sprite(f.sprite.x, f.sprite.y, 'fx', 1).setDepth(130000).setScale(0.7);
          s.setVelocity((dx / l) * 180, (dy / l) * 180);
          this.projectiles.push({ sprite: s, mult: skills.shiki.mult, dieAt: now + 800, pierce: false, hit: new Set(), opts: {} });
        }
      }
    }
    // 捕獸夾
    for (const t of [...this.traps]) {
      const e = this.enemies.find((x) => x.alive && x.kind !== 'dummy' && Math.hypot(x.center.x - t.x, x.center.y - t.y) < 14);
      if (e || now > t.until) {
        if (e) { ring(this.scene, t.x, t.y, 10, 0xc8c8d0, 300); this.hitEnemy(e, skills.trap.mult, { x: t.x, y: t.y }, { paralyze: true, knock: 0 }); }
        t.sprite.destroy(); this.traps = this.traps.filter((x) => x !== t);
      }
    }
    this.aura?.setPosition(this.player.x, this.player.y);

    // 結界
    if (this.barrier) {
      if (now > this.barrierUntil) { this.barrier.destroy(); this.barrier = undefined; }
      else this.barrier.setPosition(this.player.x, this.player.y);
    }

    // 無敵閃爍
    if (!this.dead && now < this.invulnUntil && now >= this.dodgeUntil) this.player.setAlpha(Math.floor(now / 70) % 2 ? 0.3 : 1);
    else if (!this.dead && now >= this.dodgeUntil) this.player.setAlpha(1);
    if (!this.dead && hasStatus(gameState.statuses, 'burn')) this.player.setTint(0xffb08a);
    else if (!this.dead && hasStatus(gameState.statuses, 'poison')) this.player.setTint(0xb08aff);
    else if (!this.dead) this.player.clearTint();

    // 目前會被自動瞄準的敵人：腳下畫紅色準星
    this.marker.clear();
    const t = this.dead ? undefined : this.aimTarget(this.isMelee ? AIM_RANGE.melee : AIM_RANGE.ranged);
    if (t) {
      const c = t.center, pulse = 1 + 0.15 * Math.sin(now / 120);
      this.marker.lineStyle(1.5, 0xff5a5a, 0.9).strokeEllipse(c.x, c.y + 4, 16 * pulse, 7 * pulse);
      this.marker.fillStyle(0xff5a5a, 0.9).fillTriangle(c.x - 3, c.y - 14, c.x + 3, c.y - 14, c.x, c.y - 10);
    }

    // 介面資訊
    hudState.skills = this.skillIds.map((id, i) => ({
      name: skills[id].short, mp: skills[id].mp,
      cooldown: Math.max(0, (this.skillReady[i] - now) / (skills[id].cd * 1000)),
      usable: gameState.mp >= skills[id].mp,
    }));
    hudState.dodgeCooldown = Math.max(0, (this.dodgeReady - now) / DODGE.cooldown);
  }
}
