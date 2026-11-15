// 以 WebAudio 即時合成音效，不需要音檔
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
const last: Record<string, number> = {};

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

export function setMuted(m: boolean) { muted = m; }

function throttle(name: string, ms: number) {
  const now = performance.now();
  if (last[name] && now - last[name] < ms) return false;
  last[name] = now;
  return true;
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, freq = 1200) {
  if (!ctx || !master || muted) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = freq;
  const g = ctx.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(master);
  src.start();
}

let coinStep = 0;
let coinT = 0;

export const sfx = {
  shoot() { if (throttle('shoot', 70)) tone(880, 0.06, 'triangle', 0.08, 1300); },
  hit() { if (throttle('hit', 35)) tone(320, 0.07, 'square', 0.06, 160); },
  crit() { if (throttle('crit', 50)) { tone(1200, 0.08, 'square', 0.08, 600); noise(0.06, 0.12, 4000); } },
  kill() { if (throttle('kill', 40)) { tone(520, 0.12, 'sine', 0.14, 1040); noise(0.08, 0.1, 2000); } },
  coin() {
    if (!throttle('coin', 30)) return;
    const now = performance.now();
    if (now - coinT > 600) coinStep = 0;
    coinT = now;
    const f = 988 * Math.pow(2, Math.min(coinStep++, 14) / 12);
    tone(f, 0.08, 'square', 0.05); tone(f * 1.5, 0.1, 'sine', 0.05, undefined, 0.04);
  },
  levelup() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.14, undefined, i * 0.07)); },
  evo() { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.07, undefined, i * 0.06)); },
  pick() { tone(660, 0.08, 'sine', 0.14, 990); },
  hurt() { tone(220, 0.18, 'sawtooth', 0.12, 90); noise(0.12, 0.15, 900); },
  boss() { tone(110, 0.7, 'sawtooth', 0.16, 70); tone(165, 0.7, 'square', 0.06, 90); },
  explode() { if (throttle('ex', 60)) { noise(0.25, 0.25, 800); tone(140, 0.25, 'sine', 0.15, 50); } },
  zap() { if (throttle('zap', 60)) { tone(1800, 0.06, 'sawtooth', 0.05, 400); } },
  door() { [440, 554, 659].forEach((f, i) => tone(f, 0.14, 'sine', 0.12, undefined, i * 0.06)); },
  click() { tone(700, 0.04, 'sine', 0.1); },
  buy() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.12, 'triangle', 0.12, undefined, i * 0.05)); },
  win() { [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.14, undefined, i * 0.11)); },
  lose() { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.28, 'triangle', 0.12, undefined, i * 0.16)); },
  enemyShot() { if (throttle('es', 90)) tone(420, 0.06, 'sine', 0.04, 300); },
};

let vibOn = true;
export function setVibrate(v: boolean) { vibOn = v; }
export function vibrate(ms: number | number[]) {
  if (!vibOn) return;
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* 不支援 */ }
}
