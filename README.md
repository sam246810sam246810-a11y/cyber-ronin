# 坩堝花園（MVP 試作）

9:16 直向 2D 俯視角煉金肉鴿手遊原型。規格見 [`docs/PRD.md`](docs/PRD.md)。

## 本地啟動

```bash
npm install
npm run dev
```

- 電腦瀏覽器打開 `http://localhost:5173/`
- **手機測試**：手機和電腦連同一個 Wi-Fi，打開終端機上顯示的 `Network: http://192.168.x.x:5173/`
  （`npm run dev` 已經帶 `--host`）
- iPhone Safari 可以「分享 → 加入主畫面」，以全螢幕方式開啟

其他指令：

| 指令 | 用途 |
|---|---|
| `npm run build` | 型別檢查 + 打包到 `dist/` |
| `npm run preview` | 預覽打包結果（同樣可用手機連線） |
| `npm run typecheck` | 只跑 TypeScript 檢查 |

## 操作

| 動作 | 手機 | 鍵盤 |
|---|---|---|
| 移動 | 左下區域按住拖曳（浮動搖桿） | WASD / 方向鍵 |
| 衝刺（有無敵幀） | 右下「衝刺」 | 空白鍵 |
| 投擲藥水 | 右下「投擲」 | J |
| 煉成 | 坩堝列「煉成」 | K |
| 丟棄藥材 | 點坩堝槽位 | — |
| 選突變卡 | 點卡片 | 1 / 2 / 3 |

## Debug 面板

`npm run dev` 時左下角會出現 🐞 按鈕（正式版網址加 `?debug` 也能打開）：
給藥材、跳過本波、直接到 Boss、開突變卡、無敵、補血、解鎖 / 重置圖鑑。

## 專案結構

```
src/
  main.ts / config.ts      進入點、全域數值（移速、冷卻、掉落率…）
  scenes/                  Boot, Preload, MainMenu, Game, CardSelect, Pause, Result, Codex
  entities/                Player, Enemy（基底：減速/冰凍/中毒/擊退）, enemies/*, Pickup
  systems/                 Input, Crucible, Potion, Projectile, Wave, Mutation, Telegraph, Fx, CodexStore
  potions/effects/*        每種藥水一個效果函式；potions/registry.ts 註冊
  mutations/registry.ts    突變卡修飾器
  data/*.json              藥材、配方、敵人、波次、突變卡
  ui/                      搖桿、按鈕、坩堝列、HUD
  debug/DebugPanel.ts      開發用面板
```

## 怎麼擴充

- **新增配方 / 調整數值**：改 `src/data/recipes.json`（key 是排序後的三個藥材代號，例如 `"IJS"`）。
- **新增藥水效果**：在 `src/potions/effects/` 加一個檔案，並在 `src/potions/registry.ts` 用配方的 `id` 註冊。
  彈跳、分裂、連投、穿透由 `PotionSystem` 統一處理，效果函式只需要管「落地時發生什麼」。
- **新增突變卡**：在 `src/data/mutations.json` 加一筆，並在 `src/mutations/registry.ts` 註冊同 id 的 `apply()`。
- **新增敵人**：繼承 `Enemy` 實作 `act(dt)`，在 `data/enemies.json` 加數值，並在 `WaveSystem.create()` 對應。
- **換美術**：`PreloadScene` 目前用 Graphics 產生佔位圖，之後用 `this.load.image()` 載入同名 key 即可替換。

## 存檔

只有圖鑑解鎖紀錄會存進 `localStorage`（`crucible-garden.codex.v1`），讀寫失敗時會直接忽略。
