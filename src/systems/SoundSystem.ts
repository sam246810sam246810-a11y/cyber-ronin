/**
 * 用 WebAudio 即時合成的佔位音效（不需要音檔）。
 * 瀏覽器規定要在使用者點擊後才能發聲，所以第一次點擊時才建立 AudioContext。
 */
type Sfx = 'shoot' | 'hit' | 'crit' | 'kill' | 'pickup' | 'brew' | 'fission' | 'hurt' | 'dash' | 'explode' | 'zap' | 'card' | 'boss';

class SoundSystemImpl {
  private ctx?: AudioContext;
  private master?: GainNode;
  private last = new Map<Sfx, number>();
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem('crucible-garden.muted') === '1';
    } catch {
      /* ignore */
    }
    const unlock = () => {
      this.ensure();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private ensure(): AudioContext | undefined {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.35;
      this.master.connect(this.ctx.destination);
    } catch {
      return undefined;
    }
    return this.ctx;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    try {
      localStorage.setItem('crucible-garden.muted', this.muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    return this.muted;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol: number, lowpass = 1200): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  /** rarity：拾取音高依稀有度上升 */
  play(sfx: Sfx, rarity = 0): void {
    if (this.muted || !this.ctx) return;
    const now = performance.now();
    const gap: Partial<Record<Sfx, number>> = { shoot: 70, hit: 40, kill: 30, zap: 60, explode: 50 };
    if (gap[sfx] && now - (this.last.get(sfx) ?? 0) < gap[sfx]!) return;
    this.last.set(sfx, now);
    switch (sfx) {
      case 'shoot': this.tone(880, 0.05, 'square', 0.04, 600); break;
      case 'hit': this.tone(320, 0.06, 'triangle', 0.08, 180); break;
      case 'crit': this.tone(1200, 0.08, 'square', 0.08, 700); this.noise(0.05, 0.1, 4000); break;
      case 'kill': this.tone(520, 0.1, 'triangle', 0.1, 1040); break;
      case 'pickup': {
        const base = 660 * Math.pow(1.26, rarity);
        this.tone(base, 0.08, 'sine', 0.12);
        this.tone(base * 1.5, 0.12, 'sine', 0.1, undefined, 0.06);
        if (rarity >= 2) this.tone(base * 2, 0.18, 'sine', 0.08, undefined, 0.12);
        break;
      }
      case 'brew': this.tone(300, 0.25, 'sine', 0.15, 600); this.tone(450, 0.2, 'sine', 0.08, 900, 0.08); break;
      case 'fission':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.14, undefined, i * 0.08));
        this.noise(0.4, 0.12, 3000);
        break;
      case 'hurt': this.tone(200, 0.2, 'sawtooth', 0.15, 80); break;
      case 'dash': this.noise(0.12, 0.12, 2500); break;
      case 'explode': this.noise(0.25, 0.2, 700); this.tone(120, 0.2, 'sine', 0.15, 50); break;
      case 'zap': this.tone(1600, 0.08, 'sawtooth', 0.06, 400); break;
      case 'card': this.tone(700, 0.08, 'sine', 0.1); this.tone(1050, 0.12, 'sine', 0.1, undefined, 0.07); break;
      case 'boss': this.tone(90, 0.8, 'sawtooth', 0.15, 60); this.noise(0.6, 0.1, 400); break;
    }
  }
}

export const Sound = new SoundSystemImpl();
