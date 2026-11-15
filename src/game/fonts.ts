// 載入裁切過的 Cubic 11（俐方體 11 號，SIL OFL 1.1）。
// 每個檔案只含部分字，用 unicode-range 讓瀏覽器自動挑對的檔案。
import ranges from '../assets/fonts/ranges.json';

const files = import.meta.glob('../assets/fonts/*.woff2', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const PIXEL_FONT = 'Cubic 11';

function toBuffer(url: string): Promise<ArrayBuffer> {
  if (url.startsWith('data:')) {
    const bin = atob(url.slice(url.indexOf(',') + 1));
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return Promise.resolve(buf.buffer);
  }
  return fetch(url).then((r) => r.arrayBuffer());
}

export async function loadFonts(): Promise<void> {
  const byName = new Map(Object.entries(files).map(([p, u]) => [p.split('/').pop()!.replace('.woff2', ''), u]));
  await Promise.all(
    (ranges as { file: string; range: string }[]).map(async (r) => {
      const url = byName.get(r.file);
      if (!url) return;
      const face = new FontFace(PIXEL_FONT, await toBuffer(url), { unicodeRange: r.range });
      await face.load();
      (document.fonts as unknown as { add(f: FontFace): void }).add(face);
    }),
  );
}
