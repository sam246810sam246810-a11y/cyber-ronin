import Phaser from 'phaser';

// Vite 會把這些檔案打包進單一 HTML（data URI）；開發時則是一般網址。
const sprites = import.meta.glob('../assets/sprites/*.{png,jpg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const audio = import.meta.glob('../assets/audio/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const keyOf = (path: string) => path.split('/').pop()!.replace(/\.(png|jpg|webp|mp3)$/, '');

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`無法載入圖片 ${url.slice(0, 60)}`));
    img.src = url;
  });
}

function dataUriToBuffer(uri: string): ArrayBuffer {
  const b64 = uri.slice(uri.indexOf(',') + 1);
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function fetchAudio(url: string): Promise<ArrayBuffer> {
  if (url.startsWith('data:')) return dataUriToBuffer(url);
  const res = await fetch(url);
  return res.arrayBuffer();
}

/**
 * 很大的動畫（Boss 動作影格、大招特效）解壓後一套 15～28 MB，全部一起載入手機會因為記憶體不足而閃退。
 * 這些「延後載入」的圖只在用到時才載入，換成別的就釋放。家族名稱：boss-<名稱>、fx-ult<名稱>。
 */
export function lazyFamily(key: string): string | null {
  let m = /^(boss-[a-z]+)-(?:move|atk)-\d+$/.exec(key);
  if (m) return m[1];
  m = /^fx-(ult[a-z0-9]+)-\d+$/.exec(key);
  return m ? `fx-${m[1]}` : null;
}

const spriteUrls = new Map(Object.entries(sprites).map(([path, url]) => [keyOf(path), url]));

async function addTexture(scene: Phaser.Scene, key: string, url: string) {
  const img = await loadImage(url);
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addImage(key, img);
}

/** 釋放不在 keep 裡的延後載入圖片（連同用到它們的動畫） */
export function releaseLazy(scene: Phaser.Scene, keep: string[]) {
  const gone = new Set<string>();
  for (const k of scene.textures.getTextureKeys()) {
    const f = lazyFamily(k);
    if (f && !keep.includes(f)) {
      scene.textures.remove(k);
      gone.add(k);
    }
  }
  if (!gone.size) return;
  const anims = scene.anims as unknown as { anims: Phaser.Structs.Map<string, Phaser.Animations.Animation> };
  for (const a of anims.anims.values()) if (a.frames.some((f) => gone.has(f.textureKey))) scene.anims.remove(a.key);
}

/** 確保這些家族的圖已載入並建好動畫；exclusive 時順便釋放其他延後載入的圖 */
export async function useLazy(scene: Phaser.Scene, families: string[], exclusive = false): Promise<void> {
  if (exclusive) releaseLazy(scene, families);
  const want = [...spriteUrls].filter(([k]) => {
    const f = lazyFamily(k);
    return f && families.includes(f) && !scene.textures.exists(k);
  });
  await Promise.all(want.map(([k, url]) => addTexture(scene, k, url).catch(() => undefined)));
  buildAnims(scene);
}

/** 在場景的 preload 裡排入要用的延後載入圖片（Phaser 會等它們載完才進 create），並釋放其他的 */
export function queueLazy(scene: Phaser.Scene, families: string[]) {
  releaseLazy(scene, families);
  for (const [k, url] of spriteUrls) {
    const f = lazyFamily(k);
    if (f && families.includes(f) && !scene.textures.exists(k)) scene.load.image(k, url);
  }
}

/** 每個角色大招用到的特效（兩段式的 SSR 有兩段） */
export const ULT_FX: Record<string, string[]> = {
  jin: ['ultjin'],
  zero: ['ultzero'],
  tetsu: ['ulttetsu'],
  oboro: ['ultoboro'],
  hayabusa: ['ulthayabusa'],
  koma: ['ultkoma'],
  kagura: ['ultkagura1', 'ultkagura2'],
  misora: ['ultmisora1', 'ultmisora2'],
};

/** 由貼圖名稱自動建立動畫（只建還沒有的） */
export function buildAnims(scene: Phaser.Scene) {
  const keys = scene.textures.getTextureKeys();
  const collect = (re: RegExp, name: (m: RegExpExecArray) => string) => {
    const groups = new Map<string, string[]>();
    for (const k of keys) {
      const m = re.exec(k);
      if (!m) continue;
      const n = name(m);
      if (!groups.has(n)) groups.set(n, []);
      groups.get(n)!.push(k);
    }
    for (const list of groups.values()) list.sort((a, b) => +a.split('-').pop()! - +b.split('-').pop()!);
    return groups;
  };
  // 特效：fx-名稱-影格
  for (const [name, frames] of collect(/^fx-(.+)-(\d+)$/, (m) => m[1])) {
    if (!scene.anims.exists(`fx-${name}`)) scene.anims.create({ key: `fx-${name}`, frames: frames.map((key) => ({ key })), frameRate: 24 });
  }
  // SSR 動態立繪：live-<角色>-<影格>，來回播放成循環
  for (const [name, frames] of collect(/^live-(.+)-(\d+)$/, (m) => m[1])) {
    if (!scene.anims.exists(`live-${name}`)) scene.anims.create({ key: `live-${name}`, frames: frames.map((key) => ({ key })), frameRate: 8, yoyo: true, repeat: -1 });
  }
  // 角色／敵人動畫：<名稱>-<idle|run|atk|move>-<影格>
  const rates: Record<string, number> = { idle: 6, run: 12, move: 10, atk: 16 };
  for (const [key, frames] of collect(/^(.+)-(idle|run|atk|move)-(\d+)$/, (m) => `${m[1]}-${m[2]}`)) {
    const kind = key.split('-').pop()!;
    if (!scene.anims.exists(key)) scene.anims.create({ key, frames: frames.map((k) => ({ key: k })), frameRate: rates[kind], repeat: kind === 'atk' ? 0 : -1 });
  }
}

/** 載入開場需要的圖片（延後載入的除外）；onProgress 回報 0～1 */
export async function loadSprites(scene: Phaser.Scene, onProgress: (p: number) => void): Promise<void> {
  const entries = Object.entries(sprites).filter(([path]) => !lazyFamily(keyOf(path)));
  let done = 0;
  await Promise.all(
    entries.map(async ([path, url]) => {
      const img = await loadImage(url);
      const key = keyOf(path);
      if (scene.textures.exists(key)) scene.textures.remove(key);
      scene.textures.addImage(key, img);
      onProgress(++done / entries.length);
    }),
  );
}

/** 解碼所有音效；失敗不影響遊戲 */
export async function loadAudio(scene: Phaser.Scene): Promise<void> {
  const sm = scene.sound as Phaser.Sound.WebAudioSoundManager;
  if (!('decodeAudio' in sm)) return;
  // 背景音樂很長，解壓後每首 30 MB 以上；開場只解壓短音效，音樂要播時才解壓（見 decodeMusic）
  await Promise.all(
    Object.entries(audio).filter(([path]) => !keyOf(path).startsWith('bgm-')).map(async ([path, url]) => {
      try {
        const key = keyOf(path);
        const buf = await fetchAudio(url);
        await new Promise<void>((resolve) => {
          const done = (k: string) => {
            if (k !== key) return;
            sm.off(Phaser.Sound.Events.DECODED, done);
            resolve();
          };
          sm.on(Phaser.Sound.Events.DECODED, done);
          sm.decodeAudio(key, buf);
          setTimeout(resolve, 8000);
        });
      } catch {
        /* 忽略 */
      }
    }),
  );
}

const musicUrls = new Map(Object.entries(audio).map(([path, url]) => [keyOf(path), url]));
const pending = new Map<string, Promise<boolean>>();

export function hasMusic(key: string) {
  return musicUrls.has(key);
}

/** 解壓一首背景音樂（同時只保留 keep 裡的，其他已解壓的音樂會被釋放） */
export function decodeMusic(game: Phaser.Game, key: string, keep: string[]): Promise<boolean> {
  const cache = game.cache.audio;
  for (const k of cache.getKeys()) if (k.startsWith('bgm-') && !keep.includes(k)) cache.remove(k);
  if (cache.exists(key)) return Promise.resolve(true);
  const url = musicUrls.get(key);
  const sm = game.sound as Phaser.Sound.WebAudioSoundManager;
  if (!url || !('decodeAudio' in sm)) return Promise.resolve(false);
  let p = pending.get(key);
  if (!p) {
    p = fetchAudio(url)
      .then(
        (buf) =>
          new Promise<boolean>((resolve) => {
            const done = (k: string) => {
              if (k !== key) return;
              sm.off(Phaser.Sound.Events.DECODED, done);
              resolve(true);
            };
            sm.on(Phaser.Sound.Events.DECODED, done);
            sm.decodeAudio(key, buf);
            setTimeout(() => resolve(cache.exists(key)), 15000);
          }),
      )
      .catch(() => false)
      .finally(() => pending.delete(key));
    pending.set(key, p);
  }
  return p;
}
