// 由 src/data/assets.ts 產生 docs/ASSETS.md（Higgsfield 素材清單）
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';

const out = await build({ entryPoints: ['src/data/assets.ts'], bundle: true, format: 'esm', write: false, platform: 'neutral' });
const mod = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const { ASSETS, STYLE } = mod;

const groups = {};
for (const a of ASSETS) (groups[a.group] ??= []).push(a);

let md = `# 美術素材清單（Higgsfield）

> 本檔由 \`npm run assets:doc\` 依 \`src/data/assets.ts\` 自動產生，請改程式內的清單後重新產生。

## 使用方式

1. 依下表提示詞用 Higgsfield 生成圖片，**透明背景 PNG**。
2. 依「檔名」存到 \`src/assets/\`（例如 \`src/assets/hero.png\`）。
3. 重新整理 / 重新 build，遊戲會自動改用新圖；缺的圖繼續用幾何佔位。
4. 角色圖請讓角色**置中並填滿約 85% 畫面**，遊戲會以圓形碰撞框對齊圖片中心；角色預設**面向右**（向左時遊戲會自動翻轉）。

## 共用風格

所有角色提示詞已附上同一段風格描述，以維持畫風一致：

\`\`\`
${STYLE}
\`\`\`

建議先生成 \`hero\`，滿意後把它當作 Higgsfield 的風格參考圖，再生成其餘角色。

`;
for (const [g, list] of Object.entries(groups)) {
  md += `## ${g}\n\n| 佔位 | 檔名 | 尺寸 | 提示詞 |\n|---|---|---|---|\n`;
  for (const a of list) md += `| ${a.fallback} | \`${a.file}\` | ${a.size} | ${a.prompt.replace(/\|/g, '\\|')} |\n`;
  md += '\n';
}
md += `共 ${ASSETS.length} 張。\n`;
writeFileSync('docs/ASSETS.md', md);
console.log(`docs/ASSETS.md 已產生（${ASSETS.length} 張）`);
