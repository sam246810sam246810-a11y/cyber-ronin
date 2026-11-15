# Cyber Ronin（賽博浪人）

直式手機肉鴿除草遊戲。規劃文件：[`docs/PRD.md`](docs/PRD.md)。

目前進度：**M2 Alpha**（3 名角色、8 把武器、4 種進化、3 隻 Boss、局外強化與圖鑑；美術與音效由 Higgsfield 生成）。

## 開發

```bash
npm install
npm run dev            # 本機開發伺服器（加了 --host，同一個 Wi-Fi 的手機也能連）
npm run build          # 型別檢查＋打包成單一檔案 dist/index.html
npm run build:artifact # 另外產生可發布成 Claude Artifact 的 artifact/cyber-ronin.html
```

網址後面加上 `#debug` 會出現除錯按鈕：無敵、時間 +60 秒、直接升級、生成寶箱、目前武器全部滿級。

## 程式結構

| 路徑 | 內容 |
|---|---|
| `src/config/balance.ts` | 所有數值：玩家、武器、被動道具、進化、敵人、波次、Boss、殺意 |
| `src/i18n/zh-TW.ts` | 介面文字 |
| `src/scenes/GameScene.ts` | 遊戲邏輯：移動、敵人、武器、掉落物、升級、殺意與居合・一閃、復活、結算 |
| `src/scenes/UIScene.ts` | HUD、浮動搖桿、升級卡片、暫停、復活、結算畫面 |
| `src/scenes/MenuScene.ts` | 主選單 |
| `src/game/textures.ts` | 程式畫的備用圖（經驗晶片、特效；正式素材缺漏時也用它） |
| `src/assets/` | 遊戲用的精靈圖與音效（由 `art/tools/` 從 Higgsfield 原始檔轉出） |
| `src/scenes/CharSelectScene.ts`、`ShopScene.ts`、`CodexScene.ts` | 角色選擇、義體強化中心、圖鑑 |
| `src/game/SpatialGrid.ts` | 空間格網，加速大量敵人的碰撞查詢 |

## 美術與音效流程

1. 在 Higgsfield 以 `art/style-refs/style-A-selected.png` 為參考圖生成（透明背景）
2. `art/tools/fetch.sh <名稱> <網址>` 下載到 `art/raw/`（不進版控）
3. `python3 -I art/tools/process.py art/raw/<檔> <名稱> <最大邊長>`：裁切、縮小成 `src/assets/sprites/`；圖示表用 `--grid 4x4 --names ...` 切開
4. `art/tools/audio.sh`：音樂與音效壓縮、統一音量，輸出到 `src/assets/audio/`

### 動畫與圖示工具（需要裝了 numpy、scipy、pillow、fonttools 的 Python 環境）

- `art/tools/sheet.py`：切角色精靈表（例如 4×3 的待機／跑步／攻擊），每格對齊腳底、統一縮放
- `art/tools/gif.py`：把模型輸出的 GIF 動畫拆成影格（之後交給 sheet.py）
- `art/tools/frames.py`：切特效影格表（不個別裁切，保持位置一致）
- `art/tools/icons.py`：切圖示表，只保留每格中間那個圖示
- `art/tools/quantize.py`：把影格壓成 256 色 PNG，減少檔案大小
- `art/tools/font.py`：把 Cubic 11 字型裁成遊戲用到的字（新增文字後要重跑）

動畫命名規則：`<名稱>-<idle|run|atk|move>-<影格>.png`，遊戲啟動時會自動建立動畫。
