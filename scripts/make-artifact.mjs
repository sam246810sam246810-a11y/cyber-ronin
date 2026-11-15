// 把 dist/ 轉成可發布成 Claude Artifact 的多檔案頁面：
// artifact/cyber-ronin.html（頁面本身；Artifact 會自動加上 doctype/head/body）
// artifact/assets/*（程式、圖片、音樂），以及發布用的檔案清單 artifact/files.json。
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, statSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
if (!/assets\/game\.js/.test(html)) throw new Error('dist/index.html 裡找不到 assets/game.js');

const page = `<title>Cyber Ronin</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
  :root { --bg: #07060d; --fg: #e9f6ff; --accent: #3df5ff; color-scheme: dark; }
  html, body { height: 100%; margin: 0; background: var(--bg); color: var(--fg); overflow: hidden; touch-action: none; overscroll-behavior: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  #game { position: fixed; left: 0; right: 0; top: env(safe-area-inset-top, 0px); bottom: env(safe-area-inset-bottom, 0px); }
  #game canvas { display: block; }
  #loading { position: fixed; inset: 0; display: grid; place-items: center; color: var(--accent); font: 600 18px system-ui, sans-serif; letter-spacing: 0.1em; pointer-events: none; }
</style>
<div id="game"></div>
<div id="loading">載入中…</div>
<script type="module" src="assets/game.js"></script>
`;

rmSync('artifact', { recursive: true, force: true });
mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/cyber-ronin.html', page);
cpSync('dist/assets', 'artifact/assets', { recursive: true });
const files = {};
let total = page.length;
for (const f of readdirSync('artifact/assets')) {
  files[`assets/${f}`] = `artifact/assets/${f}`;
  total += statSync(`artifact/assets/${f}`).size;
}
writeFileSync('artifact/files.json', JSON.stringify(files, null, 1));
console.log(`artifact: 頁面＋${Object.keys(files).length} 個檔案，共 ${(total / 1024 / 1024).toFixed(1)} MB`);
