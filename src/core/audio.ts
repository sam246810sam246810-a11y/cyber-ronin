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

// ================= 背景音樂（程式合成，無音檔）=================
type Mode = 'menu' | 'battle';
let musicGain: GainNode | null = null;
let musicOn = true;
let mode: Mode | null = null;
let timer = 0;
let nextT = 0;
let step = 0;

// C 大調 I–V–vi–IV；midi 音高
const CHORDS = [[48, 52, 55], [43, 47, 50], [45, 48, 52], [41, 45, 48]];
const SONG: Record<Mode, { bpm: number; arp: number[]; hat: boolean; lead: (number | null)[] }> = {
  menu: { bpm: 92, arp: [0, 1, 2, 1], hat: false, lead: [72, null, 76, null, 79, null, 76, null, 74, null, 71, null, 72, null, null, null] },
  battle: { bpm: 138, arp: [0, 2, 1, 2], hat: true, lead: [79, 79, null, 76, 77, null, 79, null, 81, null, 79, 77, 76, null, 74, null] },
};
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function mnote(t: number, freq: number, dur: number, type: OscillatorType, vol: number) {
  if (!ctx || !musicGain) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(musicGain);
  o.start(t); o.stop(t + dur + 0.02);
}

function mhat(t: number) {
  if (!ctx || !musicGain) return;
  const len = Math.floor(ctx.sampleRate * 0.04);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
  const g = ctx.createGain(); g.gain.value = 0.05;
  src.connect(f); f.connect(g); g.connect(musicGain);
  src.start(t);
}

function schedule() {
  if (!ctx || !mode || document.hidden) return;
  const song = SONG[mode];
  const sixteenth = 60 / song.bpm / 4;
  while (nextT < ctx.currentTime + 0.15) {
    const bar = Math.floor(step / 16) % 4;
    const s16 = step % 16;
    const chord = CHORDS[bar];
    if (s16 % 4 === 0) mnote(nextT, hz(chord[0] - 12), sixteenth * 3.5, 'triangle', 0.22);
    if (s16 % 2 === 0) mnote(nextT, hz(chord[song.arp[(s16 / 2) % 4]] + 12), sixteenth * 1.6, 'square', 0.035);
    const ln = song.lead[s16];
    if (ln && bar % 2 === 1) mnote(nextT, hz(ln), sixteenth * 1.8, 'triangle', 0.06);
    if (song.hat && s16 % 4 === 2) mhat(nextT);
    nextT += sixteenth;
    step++;
  }
}

export function playMusic(m: Mode) {
  if (!ctx) return;
  if (!musicGain) { musicGain = ctx.createGain(); musicGain.gain.value = musicOn ? 0.5 : 0; musicGain.connect(ctx.destination); }
  if (mode === m) return;
  mode = m;
  step = 0;
  nextT = ctx.currentTime + 0.05;
  if (!timer) timer = window.setInterval(schedule, 40);
}

export function setMusic(on: boolean) {
  musicOn = on;
  if (musicGain && ctx) musicGain.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.1);
}
