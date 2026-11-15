// 背景音樂的譜（全部原創）。音階用日本的「都節音階」（D、E♭、G、A、B♭），聽起來有和風感。
// 每一格是一個八分音符；null 是休止。數字是音階的第幾個音（0 起算，超過 4 就往上一個八度）。

export type Wave = 'sine' | 'triangle' | 'square' | 'sawtooth';
export interface Voice { wave: Wave; octave: number; gain: number; decay: number; attack?: number; notes: (number | null)[]; detune?: number }
export interface Track { bpm: number; voices: Voice[]; drums?: (0 | 1 | 2)[] }

const _ = null;
export const TRACKS: Record<string, Track> = {
  // 狐火村：琴的分解和弦，悠閒
  village: {
    bpm: 92,
    voices: [
      { wave: 'triangle', octave: 0, gain: 0.22, decay: 0.55, notes: [7, _, 6, 5, 4, _, 5, _, 6, _, 4, 3, 2, _, _, _, 4, _, 5, 6, 7, _, 8, 7, 6, _, 5, 4, 5, _, _, _] },
      { wave: 'sine', octave: -2, gain: 0.18, decay: 1.6, notes: [0, _, _, _, _, _, _, _, 2, _, _, _, _, _, _, _, 0, _, _, _, _, _, _, _, 3, _, _, _, 2, _, _, _] },
      { wave: 'triangle', octave: -1, gain: 0.08, decay: 0.3, notes: [_, _, 2, _, _, _, 2, _, _, _, 4, _, _, _, 4, _, _, _, 2, _, _, _, 2, _, _, _, 3, _, _, _, 3, _] },
    ],
  },
  // 迷霧竹林：尺八般的長音，很多留白
  forest: {
    bpm: 72,
    voices: [
      { wave: 'sine', octave: 0, gain: 0.2, decay: 1.4, attack: 0.12, notes: [4, _, _, _, 5, _, 3, _, 2, _, _, _, _, _, _, _, 3, _, 4, _, 2, _, 1, _, 0, _, _, _, _, _, _, _] },
      { wave: 'sine', octave: -2, gain: 0.14, decay: 3.5, attack: 0.4, notes: [0, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, 1, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _] },
      { wave: 'triangle', octave: 1, gain: 0.05, decay: 0.2, notes: [_, _, _, _, _, _, _, 4, _, _, _, _, _, _, 3, _, _, _, _, _, _, _, _, 2, _, _, _, _, _, 4, _, _] },
    ],
  },
  // 古井地城：低沉、半音（E♭）帶來不安，偶爾滴水聲
  dungeon: {
    bpm: 64,
    voices: [
      { wave: 'triangle', octave: -1, gain: 0.2, decay: 0.9, notes: [0, _, _, 1, _, _, 0, _, _, _, _, _, 3, _, 2, 1, 0, _, _, 1, _, _, 4, _, _, _, 3, _, 1, _, _, _] },
      { wave: 'sine', octave: -2, gain: 0.16, decay: 4, attack: 0.5, notes: [0, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, 1, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _] },
      { wave: 'sine', octave: 2, gain: 0.05, decay: 0.15, notes: [_, _, _, _, _, 6, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, 5, _, _, _, _, _, _] },
    ],
  },
  // 土蜘蛛：太鼓＋三味線般的快速頑固音型
  boss: {
    bpm: 148,
    voices: [
      { wave: 'square', octave: -1, gain: 0.08, decay: 0.16, notes: [0, 0, 1, 0, 0, 0, 2, 1, 0, 0, 1, 0, 3, 2, 1, 0, 0, 0, 1, 0, 0, 0, 2, 1, 4, 3, 2, 1, 2, 1, 0, 1] },
      { wave: 'sawtooth', octave: 0, gain: 0.06, decay: 0.35, notes: [5, _, _, _, 6, _, 5, _, 4, _, _, _, 3, _, 4, _, 5, _, _, _, 7, _, 6, _, 5, _, 4, _, 3, _, 1, _] },
    ],
    drums: [2, 0, 0, 1, 0, 0, 2, 0, 2, 0, 1, 0, 0, 1, 2, 0, 2, 0, 0, 1, 0, 0, 2, 0, 2, 0, 1, 0, 1, 1, 2, 1],
  },
};

/** 地圖 → 音樂 */
export function trackForMap(map: string): string {
  if (map === 'forest') return 'forest';
  if (/^b\d$/.test(map)) return 'dungeon';
  if (map === 'lair') return 'boss';
  return 'village';
}

const SCALE = [62, 63, 67, 69, 70]; // D4 E♭4 G4 A4 B♭4
export function degreeToMidi(deg: number, octave: number): number {
  const o = Math.floor(deg / SCALE.length), i = ((deg % SCALE.length) + SCALE.length) % SCALE.length;
  return SCALE[i] + 12 * (o + octave);
}
export const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
