import Phaser from 'phaser';
import { ARENA, ARENA_BOTTOM, ARENA_RIGHT, DEPTH, PLAYER } from '../config';
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

  readonly sprite: Phaser.GameObjects.Image;
  private readonly pointer: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Image;

  constructor(private scene: Phaser.Scene, x: number, y: number, texture = 'cat_apprentice', private color: number = 0xffffff) {
    this.x = x;
    this.y = y;
    this.shadow = scene.add.image(x, y + 16, 'shadow').setDepth(DEPTH.shadow).setAlpha(0.4).setScale(0.7, 0.35);
    this.sprite = scene.add.image(x, y, texture).setDepth(DEPTH.player).setTint(color)
      .setDisplaySize(this.radius * 3.7, this.radius * 3.7);
    this.pointer = scene.add.image(x, y, 'triangle').setDepth(DEPTH.player + 1).setTint(0xffd166).setDisplaySize(12, 12);
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
    this.sync();
  }

  private sync(): void {
    this.sprite.setPosition(this.x, this.y);
    this.shadow.setPosition(this.x, this.y + 16);
    this.pointer.setPosition(this.x + Math.cos(this.facing) * 42, this.y + Math.sin(this.facing) * 42);
    this.sprite.setFlipX(Math.cos(this.facing) < -0.1);
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
