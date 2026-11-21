# 坩堝花園（MVP 試作）

9:16 直向 2D 俯視角煉金肉鴿手遊原型：撿藥材、三格坩堝煉藥並喝下，本局永久變強，煉成時有機率裂變成傳說藥水。規格見 [`docs/PRD.md`](docs/PRD.md)。

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
| 煉成並喝下 | 右下「煉成」或坩堝列「煉成」 | J / K |
| 丟棄藥材 | 點坩堝槽位 | — |
| 選突變卡 | 點卡片 | 1 / 2 / 3 |

## Debug 面板

`npm run dev` 時左下角會出現 🐞 按鈕（正式版網址加 `?debug` 也能打開）：
給藥材、下次必裂變、跳過本波、直接到 Boss、開突變卡、無敵、補血、解鎖 / 重置圖鑑。

## 專案結構

```
src/
  main.ts / config.ts      進入點、全域數值（移速、冷卻、掉落率…）
  scenes/                  Boot, Preload, MainMenu, Game, CardSelect, Pause, Result, Codex
  entities/                Player, Enemy（基底：減速/冰凍/中毒/擊退）, enemies/*, Pickup
  systems/                 Input, Crucible（含裂變）, Buff（喝藥強化與數值）, Effect, Projectile, Wave,
                           Mutation, Telegraph, Fx, CodexStore
  potions/passives.ts      每種藥水 / 傳說藥水的被動效果
  data/*.json              藥材、配方、傳說藥水、敵人、波次、突變卡
  ui/                      搖桿、按鈕、坩堝列、HUD
  debug/DebugPanel.ts      開發用面板
```

## 怎麼擴充

- **調整數值**：屬性成長與裂變率在 `src/config.ts`（`ELEMENT`、`FISSION`）。
- **新增或修改藥水**：改 `src/data/recipes.json` 或 `legendaries.json`，並在 `src/potions/passives.ts` 用同一個 `id` 註冊被動。
  被動可以用 `stats`（改數值）、`period/onPeriod`（週期觸發）、`onShot`、`onHit`、`onKill`、`onDash`、`onAcquire` 這些鉤子。
- **新增突變卡**：在 `src/data/mutations.json` 加一筆，再到 `BuffSystem` 或 `CrucibleSystem` 讀取它的層數。
- **新增敵人**：繼承 `Enemy` 實作 `act(dt)`，在 `data/enemies.json` 加數值，並在 `WaveSystem.create()` 對應。
- **換美術**：`PreloadScene` 目前用 Graphics 產生佔位圖，之後用 `this.load.image()` 載入同名 key 即可替換。

## 存檔

只有圖鑑解鎖紀錄會存進 `localStorage`（`crucible-garden.codex.v1`），讀寫失敗時會直接忽略。
