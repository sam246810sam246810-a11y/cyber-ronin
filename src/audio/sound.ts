// 聲音：全部用 Web Audio 即時合成，沒有外部音檔。手機瀏覽器要等玩家第一次觸控後才能出聲（PRD 12）。
import { getSettings } from '../systems/settings';
import { TRACKS, degreeToMidi, midiToHz, type Wave } from './music';

export type Sfx = 'swing' | 'arrow' | 'talisman' | 'hit' | 'crit' | 'kill' | 'hurt' | 'dodge' | 'heal' | 'levelup' | 'chest' | 'blip'
  | 'select' | 'gate' | 'break' | 'lantern' | 'roar' | 'pickup' | 'save' | 'death' | 'web' | 'slam' | 'wrong';

class SoundEngine {
  private ctx?: AudioContext;
  private musicBus?: GainNode;
  private sfxBus?: GainNode;
  private noise?: AudioBuffer;
  private track = '';
  private step = 0;
  private nextTime = 0;
  private timer?: number;
  private lastBlip = 0;

  /** 在使用者點擊時呼叫一次 */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.musicBus = this.ctx.createGain(); this.musicBus.connect(this.ctx.destination);
        this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.applyVolume();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      if (this.track && this.timer === undefined) this.startScheduler();
    } catch { /* 沒有聲音也能玩 */ }
  }

  applyVolume(): void {
    const s = getSettings();
    if (this.musicBus) this.musicBus.gain.value = s.music * 0.6;
    if (this.sfxBus) this.sfxBus.gain.value = s.sfx * 0.7;
  }

  // ---------- 音樂 ----------
  music(name: string): void {
    if (name === this.track) return;
    this.track = name;
    this.step = 0;
    if (this.ctx) { this.nextTime = this.ctx.currentTime + 0.1; this.startScheduler(); }
  }

  private startScheduler(): void {
    if (!this.ctx) return;
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.nextTime = Math.max(this.nextTime, this.ctx.currentTime + 0.05);
    this.timer = window.setInterval(() => this.schedule(), 30);
  }

  private schedule(): void {
    const ctx = this.ctx, t = TRACKS[this.track];
    if (!ctx || !t || ctx.state !== 'running') return;
    const stepDur = 60 / t.bpm / 2;
    while (this.nextTime < ctx.currentTime + 0.15) {
      for (const v of t.voices) {
        const n = v.notes[this.step % v.notes.length];
        if (n != null) this.tone(this.musicBus!, midiToHz(degreeToMidi(n, v.octave)), this.nextTime, v.wave, v.gain, v.decay, v.attack ?? 0.005);
      }
      const dr = t.drums?.[this.step % t.drums.length];
      if (dr) this.drum(this.nextTime, dr);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  private tone(bus: AudioNode, hz: number, at: number, wave: Wave, gain: number, decay: number, attack = 0.005, endHz?: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = wave; o.frequency.setValueAtTime(hz, at);
    if (endHz) o.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), at + decay);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    o.connect(g).connect(bus);
    o.start(at); o.stop(at + attack + decay + 0.05);
  }

  private burst(bus: AudioNode, at: number, dur: number, gain: number, filter: BiquadFilterType, freq: number, endFreq?: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noise!;
    f.type = filter; f.frequency.setValueAtTime(freq, at);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, at + dur);
    g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(at, Math.random() * 0.5); src.stop(at + dur + 0.05);
  }

  /** 太鼓：1 = 小、2 = 大 */
  private drum(at: number, kind: 1 | 2): void {
    this.tone(this.musicBus!, kind === 2 ? 90 : 160, at, 'sine', kind === 2 ? 0.5 : 0.25, 0.22, 0.002, kind === 2 ? 45 : 90);
    this.burst(this.musicBus!, at, 0.06, kind === 2 ? 0.12 : 0.08, 'lowpass', 900);
  }

  // ---------- 音效 ----------
  sfx(name: Sfx): void {
    const ctx = this.ctx, bus = this.sfxBus;
    if (!ctx || !bus || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const tone = (hz: number, at: number, wave: Wave, gain: number, decay: number, endHz?: number) => this.tone(bus, hz, t + at, wave, gain, decay, 0.003, endHz);
    const arp = (notes: number[], gap: number, wave: Wave, gain: number, decay: number) => notes.forEach((m, i) => tone(midiToHz(m), i * gap, wave, gain, decay));
    switch (name) {
      case 'swing': this.burst(bus, t, 0.09, 0.25, 'highpass', 1800, 5000); break;
      case 'arrow': this.burst(bus, t, 0.06, 0.18, 'bandpass', 3000); tone(1400, 0, 'triangle', 0.06, 0.05, 900); break;
      case 'talisman': tone(500, 0, 'triangle', 0.12, 0.15, 1100); break;
      case 'hit': tone(220, 0, 'square', 0.12, 0.08, 110); this.burst(bus, t, 0.05, 0.15, 'lowpass', 2000); break;
      case 'crit': tone(330, 0, 'square', 0.14, 0.12, 120); this.burst(bus, t, 0.08, 0.22, 'lowpass', 3000); tone(1320, 0.02, 'triangle', 0.08, 0.1); break;
      case 'kill': arp([74, 69, 62], 0.05, 'square', 0.08, 0.08); this.burst(bus, t, 0.2, 0.1, 'lowpass', 1200, 300); break;
      case 'hurt': tone(320, 0, 'sawtooth', 0.14, 0.2, 80); break;
      case 'dodge': this.burst(bus, t, 0.18, 0.14, 'bandpass', 600, 2400); break;
      case 'heal': arp([74, 79, 81, 86], 0.06, 'sine', 0.12, 0.25); break;
      case 'levelup': arp([62, 67, 69, 74, 79, 81, 86], 0.07, 'triangle', 0.14, 0.3); break;
      case 'chest': arp([67, 70, 74, 79], 0.07, 'triangle', 0.13, 0.25); break;
      case 'pickup': arp([79, 86], 0.06, 'square', 0.07, 0.12); break;
      case 'blip': if (t - this.lastBlip > 0.05) { this.lastBlip = t; tone(880, 0, 'square', 0.025, 0.025); } break;
      case 'select': tone(990, 0, 'triangle', 0.08, 0.06); break;
      case 'wrong': tone(180, 0, 'square', 0.08, 0.2, 150); break;
      case 'gate': this.burst(bus, t, 0.6, 0.2, 'lowpass', 400, 120); tone(70, 0, 'sine', 0.25, 0.5, 50); break;
      case 'break': this.burst(bus, t, 0.35, 0.3, 'lowpass', 1500, 200); tone(90, 0, 'sine', 0.3, 0.3, 40); break;
      case 'slam': this.burst(bus, t, 0.3, 0.3, 'lowpass', 800, 100); tone(60, 0, 'sine', 0.4, 0.35, 30); break;
      case 'lantern': tone(1320, 0, 'sine', 0.12, 0.8); tone(1980, 0.01, 'sine', 0.05, 0.6); break;
      case 'roar': tone(110, 0, 'sawtooth', 0.2, 0.8, 55); this.burst(bus, t, 0.8, 0.18, 'lowpass', 600, 150); break;
      case 'web': this.burst(bus, t, 0.12, 0.12, 'highpass', 2500); tone(300, 0, 'triangle', 0.06, 0.1, 500); break;
      case 'save': arp([69, 74, 78, 81], 0.1, 'sine', 0.12, 0.6); break;
      case 'death': arp([74, 70, 67, 62, 58], 0.14, 'triangle', 0.14, 0.4); break;
    }
  }
}

export const sound = new SoundEngine();
