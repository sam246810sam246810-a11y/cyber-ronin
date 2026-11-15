// 把 dist/index.html（單一檔案）轉成可發布成 Claude Artifact 的頁面：
// Artifact 會自動加上 doctype/head/body，所以這裡只留內容本身。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]);
if (scripts.length === 0) throw new Error('dist/index.html 裡找不到 script');

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
${scripts.join('\n')}
`;

mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/cyber-ronin.html', page);
console.log(`artifact/cyber-ronin.html ${(page.length / 1024).toFixed(0)} KB`);
