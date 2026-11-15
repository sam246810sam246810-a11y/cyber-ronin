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

/** 載入所有圖片；onProgress 回報 0～1 */
export async function loadSprites(scene: Phaser.Scene, onProgress: (p: number) => void): Promise<void> {
  const entries = Object.entries(sprites);
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
  await Promise.all(
    Object.entries(audio).map(async ([path, url]) => {
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
