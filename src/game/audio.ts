import Phaser from 'phaser';
import { loadSave, writeSave } from './storage';
import { decodeMusic, hasMusic } from './assets';

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
    if (!this.musicOn || !hasMusic(key)) return;
    const game = this.game;
    void decodeMusic(game, key, [key]).then((ok) => {
      // 解壓完成時可能已經換了別首或關掉音樂
      if (!ok || this.musicKey !== key || !this.musicOn || this.music) return;
      this.music = game.sound.add(key, { loop: true, volume });
      this.music.play();
    });
  }

  /** 大廳音樂跟著目前選的關卡（沒有該關的就用預設大廳音樂） */
  lobbyStage = '';
  playLobby(stageId?: string) {
    if (stageId !== undefined) this.lobbyStage = stageId;
    if (!this.lobbyStage) this.lobbyStage = loadSave().lastStage ?? 'slums';
    const k = `bgm-lobby-${this.lobbyStage}`;
    this.playMusic(hasMusic(k) ? k : 'bgm-menu');
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
