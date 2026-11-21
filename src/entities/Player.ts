import Phaser from 'phaser';
import { ARENA, ARENA_BOTTOM, ARENA_RIGHT, DEPTH, PLAYER, ySortDepth } from '../config';
import { clamp } from '../utils';
import { baseStats, type Stats } from '../systems/BuffSystem';

export type PlayerState = 'idle' | 'move' | 'dash' | 'hurt' | 'dead';

export class Player {
  x: number;
  y: number;
  hp: number = PLAYER.hp;
  maxHp: number = PLAYER.hp;
  radius = PLAYER.radius;
  state: PlayerState = 'idle';
  facing = -Math.PI / 2;

  dashCooldown = 0;
  private dashTimer = 0;
  private dashVX = 0;
  private dashVY = 0;
  private invulnTimer = 0;
  private hurtTimer = 0;
  godMode = false;
  /** 由 BuffSystem 更新 */
  stats: Stats = baseStats();

  readonly sprite: Phaser.GameObjects.Sprite;
  /** 跑步 / 攻擊動畫 key（沒有美術動畫就是 undefined） */
  private runKey?: string;
  private atkKey?: string;
  private attacking = false;
  private atkFaceLeft = false;
  /** 2.5D 生動化 */
  private readonly hd: boolean;
  private readonly displayH: number;
  private animT = 0;
  private lastDt = 0;
  private recoil = 0;
  private recoilLeft = false;
  private readonly pointer: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Image;

  constructor(private scene: Phaser.Scene, x: number, y: number, texture = 'cat_apprentice', private color: number = 0xffffff) {
    this.x = x;
    this.y = y;
    this.shadow = scene.add.image(x, y + 16, 'shadow').setDepth(DEPTH.shadow).setAlpha(0.4).setScale(0.7, 0.35);
    // 高細節手繪版（hd_*）：靜態圖＋程式呼吸／走路擺動／開火後座；否則用 GIF 動畫
    this.hd = scene.textures.exists(`hd_${texture}`);
    if (!this.hd && scene.anims.exists(`run_${texture}`)) this.runKey = `run_${texture}`;
    if (!this.hd && scene.anims.exists(`atk_${texture}`)) this.atkKey = `atk_${texture}`;
    // 顯示高度約為畫面高度 19%
    this.displayH = Math.round(720 * 0.19);
    this.sprite = scene.add.sprite(x, y, this.hd ? `hd_${texture}` : this.runKey ?? texture).setDepth(DEPTH.player).setTint(color)
      .setOrigin(0.5, 0.9).setDisplaySize(this.displayH, this.displayH);
    this.sprite.on('animationcomplete', (a: Phaser.Animations.Animation) => {
      if (a.key === this.atkKey) {
        this.attacking = false;
        if (this.runKey) this.sprite.setTexture(this.runKey, 0);
      }
    });
    this.pointer = scene.add.image(x, y, 'triangle').setDepth(DEPTH.player + 1).setTint(0xffd166).setDisplaySize(12, 12);
  }

  /** 開火時播攻擊動畫（播完才會再播，不會每發子彈都重來） */
  playAttack(targetX: number): void {
    if (this.hd) {
      // 手繪靜態圖：用後座力（往後仰＋放大一下）代替攻擊動畫
      this.recoil = 1;
      this.recoilLeft = targetX < this.x;
      return;
    }
    if (!this.atkKey || this.attacking || this.state === 'dash' || this.state === 'dead') return;
    this.attacking = true;
    this.atkFaceLeft = targetX < this.x;
    this.sprite.play({ key: this.atkKey, frameRate: 18 });
  }

  get invulnerable(): boolean {
    return this.godMode || this.invulnTimer > 0 || this.state === 'dash' || this.state === 'dead';
  }

  get dashCooldownRatio(): number {
    return this.dashCooldown / this.stats.dashCooldown;
  }

  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.dashTimer = 0;
    if (this.state === 'dash') this.state = 'idle';
    this.sync();
  }

  /** 技能用的強制衝刺（不吃冷卻） */
  forceDash(dirX: number, dirY: number, distance: number, duration: number, iframes: number): void {
    const len = Math.hypot(dirX, dirY) || 1;
    const speed = distance / duration;
    this.dashVX = (dirX / len) * speed;
    this.dashVY = (dirY / len) * speed;
    this.dashTimer = duration;
    this.invulnTimer = Math.max(this.invulnTimer, iframes);
    this.state = 'dash';
  }

  tryDash(dirX: number, dirY: number): boolean {
    if (this.dashCooldown > 0 || this.state === 'dead' || this.state === 'dash') return false;
    let len = Math.hypot(dirX, dirY);
    if (len < 0.1) {
      dirX = Math.cos(this.facing);
      dirY = Math.sin(this.facing);
      len = 1;
    }
    const speed = PLAYER.dashDistance / PLAYER.dashTime;
    this.dashVX = (dirX / len) * speed;
    this.dashVY = (dirY / len) * speed;
    this.dashTimer = PLAYER.dashTime;
    this.invulnTimer = Math.max(this.invulnTimer, PLAYER.dashIframes);
    this.dashCooldown = this.stats.dashCooldown;
    this.state = 'dash';
    // 衝刺殘影
    const ghost = this.scene.add.image(this.x, this.y, 'circle').setTint(0x7ed4ff).setAlpha(0.5)
      .setDisplaySize(this.radius * 2, this.radius * 2).setDepth(DEPTH.player - 1);
    this.scene.tweens.add({ targets: ghost, alpha: 0, duration: 250, onComplete: () => ghost.destroy() });
    return true;
  }

  /** 回傳 true 代表真的受到傷害 */
  hurt(amount: number): boolean {
    if (this.invulnerable) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnTimer = PLAYER.hurtIframes;
    this.hurtTimer = 0.2;
    if (this.hp <= 0) {
      this.state = 'dead';
    } else {
      this.state = 'hurt';
    }
    return true;
  }

  update(dt: number, moveX: number, moveY: number): void {
    if (this.state === 'dead') {
      this.sync();
      return;
    }
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);

    if (this.state === 'dash') {
      this.x += this.dashVX * dt;
      this.y += this.dashVY * dt;
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) this.state = 'idle';
    } else {
      const mag = Math.min(1, Math.hypot(moveX, moveY));
      if (mag > 0.05) {
        this.facing = Math.atan2(moveY, moveX);
        this.x += Math.cos(this.facing) * this.stats.speed * mag * dt;
        this.y += Math.sin(this.facing) * this.stats.speed * mag * dt;
        if (this.hurtTimer <= 0) this.state = 'move';
      } else if (this.hurtTimer <= 0) {
        this.state = 'idle';
      }
    }

    this.x = clamp(this.x, ARENA.x + this.radius, ARENA_RIGHT - this.radius);
    this.y = clamp(this.y, ARENA.y + this.radius, ARENA_BOTTOM - this.radius);
    this.lastDt = dt;
    this.sync();
  }

  private sync(): void {
    // 2.5D：呼吸（待機）、走路上下跳＋左右傾斜、衝刺前傾、開火後座；陰影跟著縮放
    const dt = this.lastDt;
    const moving = this.state === 'move' || this.state === 'dash';
    this.animT += dt * (this.state === 'dash' ? 20 : moving ? 12 : 3);
    this.recoil = Math.max(0, this.recoil - dt * 8);
    const H = this.displayH;
    const base = H / this.sprite.frame.height;
    const breath = moving ? 0 : Math.sin(this.animT) * 0.03;
    const bob = moving ? Math.abs(Math.sin(this.animT)) * H * (this.hd ? 0.06 : 0.025) : 0;
    const punch = this.recoil * 0.06;
    this.sprite.setScale(base * (1 - breath * 0.5 + punch), base * (1 + breath + punch * 0.5));
    const faceLeft = this.recoil > 0 ? this.recoilLeft : this.attacking ? this.atkFaceLeft : Math.cos(this.facing) < -0.1;
    const dir = faceLeft ? -1 : 1;
    const tilt = this.state === 'dash' ? 0.18 * dir : moving ? Math.sin(this.animT) * 0.07 * dir : 0;
    this.sprite.setRotation(tilt - this.recoil * 0.12 * dir);
    const feetY = this.y + 16;
    this.sprite.setPosition(this.x - this.recoil * 5 * dir, feetY - bob).setDepth(ySortDepth(this.y + 0.5));
    const shrink = Math.max(0.6, 1 - bob / (H * 0.5));
    this.shadow.setPosition(this.x, feetY).setDisplaySize(H * 0.46 * shrink, H * 0.14 * shrink).setAlpha(0.45 * shrink);
    this.pointer.setPosition(this.x + Math.cos(this.facing) * 46, this.y - H * 0.25 + Math.sin(this.facing) * 46);
    this.sprite.setFlipX(faceLeft);
    if (this.runKey && !this.attacking) {
      const moving = this.state === 'move' || this.state === 'dash';
      if (moving) {
        if (this.sprite.anims.currentAnim?.key !== this.runKey || !this.sprite.anims.isPlaying) this.sprite.play(this.runKey, true);
        this.sprite.anims.timeScale = this.state === 'dash' ? 1.8 : 1;
      } else if (this.sprite.anims.isPlaying) {
        this.sprite.anims.stop();
        this.sprite.setTexture(this.runKey, 0);
      }
    }
    this.pointer.setRotation(this.facing + Math.PI / 2);
    // 無敵時閃爍
    const blink = this.invulnTimer > 0 && this.state !== 'dash' && !this.godMode;
    this.sprite.setAlpha(blink ? (Math.floor(this.invulnTimer * 20) % 2 ? 0.3 : 1) : 1);
    this.sprite.setTint(this.state === 'dash' ? 0x7ed4ff : this.hurtTimer > 0 ? 0xff6b6b : this.color);
    if (this.state === 'dead') this.sprite.setAlpha(0.3);
  }

  destroy(): void {
    this.sprite.destroy();
    this.pointer.destroy();
    this.shadow.destroy();
  }
}
