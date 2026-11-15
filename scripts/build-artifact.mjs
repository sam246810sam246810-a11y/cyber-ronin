// 把 dist/index.html（單一檔案）轉成可發佈成 Claude Artifact 的頁面內容：
// Artifact 會自己包 <!doctype>/<html>/<head>/<body>，所以只保留 title、style、內容與 script。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const pick = (re) => [...html.matchAll(re)].map((m) => m[0]);
const title = pick(/<title>[\s\S]*?<\/title>/g);
const styles = pick(/<style[\s\S]*?<\/style>/g);
const scripts = pick(/<script[\s\S]*?<\/script>/g);
const body = (html.match(/<body>([\s\S]*?)<\/body>/) || [, ''])[1].replace(/<script[\s\S]*?<\/script>/g, '').trim();

const out = [...title, ...styles, body, ...scripts].join('\n');
mkdirSync('dist-artifact', { recursive: true });
writeFileSync('dist-artifact/kitsunebi.html', out);
console.log(`dist-artifact/kitsunebi.html (${(out.length / 1024).toFixed(0)} KB)`);
