import Phaser from 'phaser';
import { FONT_FAMILY, GAME_WIDTH, RENDER_SCALE, SCENES } from '../config';
import classes from '../data/classes.json';
import skills from '../data/skills.json';
import { DIFFICULTY, type Difficulty } from '../systems/combat';
import { resetGameState, type ClassId } from '../systems/gameState';
import { useLogicalCamera } from '../ui/camera';

const TXT = (size: number, color = '#f2e6c9'): Phaser.Types.GameObjects.Text.TextStyle => ({ fontFamily: FONT_FAMILY, fontSize: `${size}px`, color });
const STAT_MAX = { hp: 120, atk: 12, def: 8, spd: 115 };

/** 開新遊戲：選職業（PRD 4.1）與難度（PRD 4.6）。 */
export class ClassSelectScene extends Phaser.Scene {
  private classId: ClassId = 'swordsman';
  private difficulty: Difficulty = 'normal';

  constructor() { super(SCENES.classSelect); }

  create(): void {
    useLogicalCamera(this).setBackgroundColor('#14121c');
    this.add.text(GAME_WIDTH / 2, 18, '選擇燈的戰鬥風格', { ...TXT(16), fontStyle: 'bold' }).setOrigin(0.5).setResolution(RENDER_SCALE);

    const ids = Object.keys(classes) as ClassId[];
    const cards = ids.map((id, i) => this.card(id, 14 + i * 152, 36));
    const refreshCards = () => cards.forEach((c, i) => c.setStrokeStyle(ids[i] === this.classId ? 2 : 1, ids[i] === this.classId ? 0xe8823a : 0x4a4660));
    refreshCards();
    cards.forEach((c, i) => c.on('pointerdown', () => { this.classId = ids[i]; refreshCards(); }));

    this.add.text(20, 218, '難度', TXT(10, '#a39fb8')).setOrigin(0, 0.5).setResolution(RENDER_SCALE);
    const diffs = Object.keys(DIFFICULTY) as Difficulty[];
    const pills = diffs.map((d, i) => {
      const r = this.add.rectangle(56 + i * 62, 218, 56, 20, 0x2a2640).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
      this.add.text(r.x + 28, 218, DIFFICULTY[d].name, TXT(10)).setOrigin(0.5).setResolution(RENDER_SCALE);
      r.on('pointerdown', () => { this.difficulty = d; refreshPills(); });
      return r;
    });
    const refreshPills = () => pills.forEach((p, i) => p.setFillStyle(diffs[i] === this.difficulty ? 0xc23b2f : 0x2a2640).setStrokeStyle(1, 0xf2e6c9, 0.4));
    refreshPills();

    const go = this.add.rectangle(GAME_WIDTH - 20, 218, 120, 30, 0xe8823a).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
    this.add.text(go.x - 60, 218, '出發！', { ...TXT(14, '#14121c'), fontStyle: 'bold' }).setOrigin(0.5).setResolution(RENDER_SCALE);
    this.add.text(GAME_WIDTH / 2, 252, '職業之後可以轉職（第 2 章）。難度可以在設定裡調降（之後的版本）。', TXT(8, '#6b6780')).setOrigin(0.5).setResolution(RENDER_SCALE);
    go.on('pointerdown', () => {
      resetGameState(this.classId, this.difficulty);
      this.cameras.main.fadeOut(300, 20, 18, 28);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
        this.scene.start(SCENES.world, { map: 'home', spawn: 'door', face: 'up', intro: true }));
    });
  }

  private card(id: ClassId, x: number, y: number): Phaser.GameObjects.Rectangle {
    const c = classes[id];
    const w = 144, h = 166;
    const bg = this.add.rectangle(x, y, w, h, 0x1e1b2c).setOrigin(0).setInteractive({ useHandCursor: true });
    this.add.text(x + 10, y + 8, c.name, { ...TXT(14), fontStyle: 'bold' }).setResolution(RENDER_SCALE);
    this.add.sprite(x + w - 20, y + 16, 'player', 0).setScale(1.5);
    const stats: [string, number, number][] = [['HP', c.hp, STAT_MAX.hp], ['攻擊', c.atk, STAT_MAX.atk], ['防禦', c.def, STAT_MAX.def], ['速度', c.spd, STAT_MAX.spd]];
    const g = this.add.graphics();
    stats.forEach(([label, v, max], i) => {
      const yy = y + 34 + i * 12;
      this.add.text(x + 10, yy, label, TXT(8, '#a39fb8')).setOrigin(0, 0.5).setResolution(RENDER_SCALE);
      g.fillStyle(0x000000, 0.5).fillRect(x + 36, yy - 2, 70, 4);
      g.fillStyle(0xe8823a, 1).fillRect(x + 36, yy - 2, 70 * (v / max), 4);
      this.add.text(x + 112, yy, String(v), TXT(8)).setOrigin(0, 0.5).setResolution(RENDER_SCALE);
    });
    this.add.text(x + 10, y + 84, c.desc, { ...TXT(8), wordWrap: { width: w - 20, useAdvancedWrap: true }, lineSpacing: 2 }).setResolution(RENDER_SCALE);
    const sk = c.skills.map((s) => skills[s as keyof typeof skills]);
    this.add.text(x + 10, y + 122, sk.map((s) => `${s.name}：${s.desc}`).join('\n'), { ...TXT(7, '#9fd8ff'), wordWrap: { width: w - 20, useAdvancedWrap: true }, lineSpacing: 2 }).setResolution(RENDER_SCALE);
    return bg;
  }
}
