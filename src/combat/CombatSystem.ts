import Phaser from 'phaser';
import skills from '../data/skills.json';
import { Player } from '../entities/Player';
import { Enemy, type HitOptions } from '../entities/Enemy';
import { applyItem, applyStatus, atkModifier, calcDamage, chooseQuickItem, COMBO_MULT, hasStatus, nextComboStep, pickAimTarget, tickStatuses } from '../systems/combat';
import { facingFromVector } from '../systems/movement';
import { classStats, gainExp, gameState, gearLabel, giveRandomGear, statsOf } from '../systems/gameState';
import { hudState } from '../systems/hudState';
import type { Action } from '../systems/inputState';
import type { Vec2 } from '../systems/movement';
import { floatText, ring, slashArc } from './fx';

type SkillId = keyof typeof skills;

const DODGE = { duration: 400, iframes: 250, cooldown: 800, speed: 230 };
const HURT_IFRAMES = 900;
/** 自動瞄準範圍（px）：近戰、遠程 */
const AIM_RANGE = { melee: 56, ranged: 170 };
/** 打倒怪物掉落裝備的機率 */
const GEAR_DROP = 0.1;

interface Projectile {
  sprite: Phaser.Physics.Arcade.Sprite;
  mult: number; dieAt: number; pierce: boolean; hit: Set<Enemy>; opts: HitOptions;
}

/**
 * 主角的戰鬥：普通攻擊、技能、閃避、道具、受傷與死亡（PRD 4）。
 * 每個職業的攻擊方式不同：劍士近戰三段斬、弓術師射箭（長按蓄力）、陰陽師丟符咒。
 */
export class CombatSystem {
  private readonly cls = classStats(gameState.classId);
  private readonly skillIds = this.cls.skills as SkillId[];
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
    if (!t) return;
    const p = this.player.center, c = t.center, dx = c.x - p.x, dy = c.y - p.y, d = Math.hypot(dx, dy) || 1;
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
    const p = this.player.center, a = this.player.aim, ang = Math.atan2(a.y, a.x);
    const reach = step === 2 ? 20 : 17;
    slashArc(this.scene, p.x, p.y - 2, ang, reach, step === 1 ? 2.4 : 2.0, step === 2 ? 0xffd84a : 0xf8f0e0, step === 2 ? 4 : 3);
    this.hitCircle({ x: p.x + a.x * 13, y: p.y + a.y * 13 }, step === 2 ? 20 : 17, COMBO_MULT[step], { knock: step === 2 ? 200 : 120 });
  }

  private shootArrow(heldMs: number): void {
    if (this.busy || this.now < this.attackReady) return;
    const charged = heldMs >= 600;
    this.autoAim(AIM_RANGE.ranged);
    this.attackReady = this.now + 320;
    this.slowUntil = this.now + 120;
    this.fire(0, this.player.aim, charged ? 300 : 230, charged ? 2.0 : 1.0, charged ? 230 : 170, { pierce: charged, tint: charged ? 0x9fd8ff : undefined });
  }

  private throwTalisman(fireTalisman: boolean): void {
    this.autoAim(AIM_RANGE.ranged);
    this.attackReady = this.now + 380;
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
    this.skillReady[i] = this.now + s.cd * 1000;
    if (id !== 'spin' && id !== 'barrier') this.autoAim(id === 'thrust' ? AIM_RANGE.melee + 40 : AIM_RANGE.ranged);
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
        this.dashDir = { ...a }; this.dashSpeed = 400;
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
    }
    this.cb.onHudChange();
  }

  private dodge(): void {
    if (this.dead || this.now < this.dodgeReady || this.now < this.dodgeUntil || this.now < this.thrustUntil || hasStatus(gameState.statuses, 'paralyze')) return;
    this.dodgeUntil = this.now + DODGE.duration;
    this.invulnUntil = Math.max(this.invulnUntil, this.now + DODGE.iframes);
    this.dodgeReady = this.now + DODGE.cooldown;
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
    ring(this.scene, this.player.x, this.player.y, 12, 0x7fe08a, 400);
    this.cb.toast(msg);
    this.cb.onHudChange();
  }

  private vitals() { const st = this.st; return { hp: gameState.hp, maxHp: st.maxHp, mp: gameState.mp, maxMp: st.maxMp, statuses: gameState.statuses }; }

  // ---------- 命中判定 ----------
  private playerAtk(): number { return this.st.atk * atkModifier(gameState.statuses); }

  private hitEnemy(e: Enemy, mult: number, from: Vec2, opts: HitOptions): void {
    const d = calcDamage(this.playerAtk(), mult, e.info.def, Math.random, this.st.crit / 100);
    if (e.hit(d.amount, d.crit, from, opts)) this.onKill(e);
  }

  private hitCircle(c: Vec2, r: number, mult: number, opts: HitOptions): number {
    let n = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const ec = e.center;
      if (Math.hypot(ec.x - c.x, ec.y - c.y) <= r + 5) { this.hitEnemy(e, mult, this.player.center, opts); n++; }
    }
    return n;
  }

  private onKill(e: Enemy): void {
    const [lo, hi] = e.info.money;
    const money = Phaser.Math.Between(lo, hi);
    gameState.money += money;
    const levels = gainExp(gameState, e.info.exp);
    if (e.info.exp) floatText(this.scene, e.x, e.y - 22, `+${e.info.exp} EXP`, '#9fd8ff', 7);
    if (levels > 0) this.onLevelUp();
    if (e.kind !== 'dummy' && Math.random() < GEAR_DROP) {
      const g = giveRandomGear(gameState, Math.random, 1);
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
    o: { pierce?: boolean; opts?: HitOptions; tint?: number; spin?: boolean }): void {
    const p = this.player.center;
    const s = this.scene.physics.add.sprite(p.x + dir.x * 6, p.y - 3 + dir.y * 6, 'fx', frame).setDepth(130000);
    (s.body as Phaser.Physics.Arcade.Body).setSize(6, 6);
    s.setVelocity(dir.x * speed, dir.y * speed).setRotation(Math.atan2(dir.y, dir.x));
    if (o.tint) s.setTint(o.tint);
    if (o.spin) this.scene.tweens.add({ targets: s, angle: 360, duration: 400, repeat: -1 });
    this.scene.physics.add.collider(s, this.obstacles, () => this.removeProjectile(s));
    this.projectiles.push({ sprite: s, mult, dieAt: this.now + (range / speed) * 1000, pierce: !!o.pierce, hit: new Set(), opts: o.opts ?? {} });
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
    const d = calcDamage(e.info.atk, 1, this.st.def);
    gameState.hp = Math.max(0, gameState.hp - d.amount);
    floatText(this.scene, this.player.x, this.player.y - 10, String(d.amount), '#ff6a6a', 10);
    this.invulnUntil = this.now + HURT_IFRAMES;
    const pc = this.player.center, ec = e.center, dx = pc.x - ec.x, dy = pc.y - ec.y, dist = Math.hypot(dx, dy) || 1;
    this.knock = { x: (dx / dist) * 160, y: (dy / dist) * 160 };
    this.knockUntil = this.now + 90;
    e.recoil(pc);
    this.scene.cameras.main.shake(90, 0.004);
    const burn = (e.info as { burnChance?: number }).burnChance ?? 0;
    if (burn && Math.random() < burn) { applyStatus(gameState.statuses, 'burn'); this.cb.toast('燒傷了！'); }
    this.cb.onHudChange();
    if (gameState.hp <= 0) this.die();
  }

  private die(): void {
    this.dead = true;
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
    else this.player.move(move, now < this.slowUntil ? 0.35 : 1);

    // 突刺途中命中
    if (now < this.thrustUntil) {
      for (const e of this.enemies) {
        if (!e.alive || this.thrustHit.has(e)) continue;
        const ec = e.center, pc = this.player.center;
        if (Math.hypot(ec.x - pc.x, ec.y - pc.y) < 16) { this.thrustHit.add(e); this.hitEnemy(e, skills.thrust.mult, pc, { knock: 220 }); }
      }
    }

    // 投射物
    for (const pr of [...this.projectiles]) {
      if (!pr.sprite.active || now > pr.dieAt) { this.removeProjectile(pr.sprite); continue; }
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

    // 按住攻擊：劍士、陰陽師自動連打；弓術師顯示蓄力
    if (this.attackHeld && !this.dead) {
      if (this.cls.name === '弓術師') {
        const held = now - this.attackDownAt;
        hudState.charge = Math.min(1, held / 600);
        this.chargeRing.setVisible(held > 120).setPosition(this.player.x, this.player.y)
          .setStrokeStyle(held >= 600 ? 2.5 : 1.5, held >= 600 ? 0xffd84a : 0x9fd8ff, 1).setScale(1.6 - 0.6 * hudState.charge);
      } else this.attack();
    } else hudState.charge = 0;

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
