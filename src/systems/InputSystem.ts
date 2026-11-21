import Phaser from 'phaser';
import { ARENA, GAME_H, GAME_W, SAFE_X } from '../config';
import { Joystick } from '../ui/Joystick';

/** 合併觸控搖桿與鍵盤（WASD/方向鍵、空白鍵衝刺、J 或 K 煉成、E 技能、Q 換武器） */
export class InputSystem {
  readonly joystick: Joystick;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  dashPressed = false;
  brewPressed = false;
  skillPressed = false;
  swapPressed = false;

  constructor(scene: Phaser.Scene) {
    scene.input.addPointer(3);
    // 左半邊戰場任意處按下就出現搖桿
    this.joystick = new Joystick(scene, new Phaser.Geom.Rectangle(0, ARENA.y, GAME_W / 2, GAME_H - ARENA.y), 160 + SAFE_X, 600);
    const kb = scene.input.keyboard;
    if (kb) {
      this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,J,K,E,Q') as Record<string, Phaser.Input.Keyboard.Key>;
      kb.on('keydown-SPACE', () => (this.dashPressed = true));
      kb.on('keydown-J', () => (this.brewPressed = true));
      kb.on('keydown-K', () => (this.brewPressed = true));
      kb.on('keydown-E', () => (this.skillPressed = true));
      kb.on('keydown-Q', () => (this.swapPressed = true));
    }
  }

  get move(): { x: number; y: number } {
    if (this.joystick.active) return { x: this.joystick.x, y: this.joystick.y };
    const k = this.keys;
    if (!k) return { x: 0, y: 0 };
    let x = 0;
    let y = 0;
    if (k.A.isDown || k.LEFT.isDown) x -= 1;
    if (k.D.isDown || k.RIGHT.isDown) x += 1;
    if (k.W.isDown || k.UP.isDown) y -= 1;
    if (k.S.isDown || k.DOWN.isDown) y += 1;
    const len = Math.hypot(x, y);
    return len ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }

  consume(): { dash: boolean; brew: boolean; skill: boolean; swap: boolean } {
    const r = { dash: this.dashPressed, brew: this.brewPressed, skill: this.skillPressed, swap: this.swapPressed };
    this.dashPressed = this.brewPressed = this.skillPressed = this.swapPressed = false;
    return r;
  }
}
