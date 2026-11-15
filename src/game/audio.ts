import Phaser from 'phaser';
import { loadSave, writeSave } from './storage';

/** 音效與音樂：統一控制開關、音量與同一音效的播放頻率 */
class AudioManager {
  private game: Phaser.Game | null = null;
  private last = new Map<string, number>();
  private music: Phaser.Sound.BaseSound | null = null;
  private musicKey = '';
  musicOn = true;
  sfxOn = true;

  init(game: Phaser.Game) {
    this.game = game;
    const s = loadSave();
    this.musicOn = s.music;
    this.sfxOn = s.sfx;
  }

  private has(key: string) {
    return !!this.game && this.game.cache.audio.exists(key);
  }

  play(key: string, volume = 0.5, minGapMs = 50, detune = 0) {
    if (!this.sfxOn || !this.game || !this.has(key)) return;
    const now = performance.now();
    if (now - (this.last.get(key) ?? 0) < minGapMs) return;
    this.last.set(key, now);
    try {
      this.game.sound.play(key, { volume, detune: detune ? (Math.random() - 0.5) * detune : 0 });
    } catch {
      /* 忽略 */
    }
  }

  playMusic(key: string, volume = 0.35) {
    if (!this.game) return;
    if (this.musicKey === key && this.music?.isPlaying) return;
    this.stopMusic();
    this.musicKey = key;
    if (!this.musicOn || !this.has(key)) return;
    this.music = this.game.sound.add(key, { loop: true, volume });
    this.music.play();
  }

  stopMusic() {
    this.music?.stop();
    this.music?.destroy();
    this.music = null;
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    const s = loadSave();
    s.music = on;
    writeSave(s);
    if (!on) this.stopMusic();
    else if (this.musicKey) {
      const k = this.musicKey;
      this.musicKey = '';
      this.playMusic(k);
    }
  }

  setSfx(on: boolean) {
    this.sfxOn = on;
    const s = loadSave();
    s.sfx = on;
    writeSave(s);
  }
}

export const Audio = new AudioManager();
