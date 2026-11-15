import { ASSET_MAP } from '../data/assets';

// 建置時只會打包 src/assets 內實際存在的 PNG，缺的就用佔位圖
const files = import.meta.glob('../assets/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const urlByFile: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) urlByFile[path.split('/').pop()!] = url;

const images: Record<string, HTMLImageElement> = {};

export async function loadAssets(): Promise<void> {
  const jobs = Object.values(ASSET_MAP)
    .filter((a) => urlByFile[a.file])
    .map((a) => new Promise<void>((res) => {
      const img = new Image();
      img.onload = () => { images[a.key] = img; res(); };
      img.onerror = () => res();
      img.src = urlByFile[a.file];
    }));
  await Promise.all(jobs);
}

export const hasImage = (key: string) => !!images[key];
export const imageUrl = (key: string) => (images[key] ? images[key].src : null);

/** HTML 用圖示：有圖用圖，沒圖用 emoji */
export function iconHtml(key: string, fallback: string, cls = ''): string {
  const url = imageUrl(key);
  return url ? `<img class="ico ${cls}" src="${url}" alt="">` : `<span class="ico emo ${cls}">${fallback}</span>`;
}

// ---- Canvas 精靈快取 ----
const spriteCache = new Map<string, HTMLCanvasElement>();

/** 取得一個邊長為 size（邏輯像素）的精靈。缺圖時畫圓形底 + emoji 佔位 */
export function sprite(key: string, size: number, fallback: string, color: string, ring = '#2b2118'): CanvasImageSource {
  const id = `${key}|${size}|${color}`;
  let c = spriteCache.get(id);
  if (c) return c;
  const s = Math.ceil(size * 2);
  c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const img = images[key];
  if (img) {
    g.drawImage(img, 0, 0, s, s);
  } else {
    const r = s / 2;
    g.fillStyle = color;
    g.beginPath(); g.arc(r, r, r - 3, 0, Math.PI * 2); g.fill();
    g.lineWidth = 4; g.strokeStyle = ring; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.ellipse(r * 0.7, r * 0.6, r * 0.35, r * 0.22, -0.5, 0, Math.PI * 2); g.fill();
    g.font = `${Math.floor(s * 0.62)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(fallback, r, r * 1.08);
  }
  spriteCache.set(id, c);
  return c;
}

export function getImage(key: string): HTMLImageElement | undefined {
  return images[key];
}

const whiteCache = new Map<string, HTMLCanvasElement>();
/** 受擊閃白用的白色剪影 */
export function whiteSprite(key: string, size: number, fallback: string, color: string): CanvasImageSource {
  const id = `${key}|${size}|${color}`;
  let c = whiteCache.get(id);
  if (c) return c;
  const src = sprite(key, size, fallback, color) as HTMLCanvasElement;
  c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d')!;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  whiteCache.set(id, c);
  return c;
}
