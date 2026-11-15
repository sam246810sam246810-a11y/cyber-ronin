# Cyber Ronin（賽博浪人）

直式手機肉鴿除草遊戲。規劃文件：[`docs/PRD.md`](docs/PRD.md)。

目前進度：**M1 MVP**（用色塊代替美術，可在手機瀏覽器完整玩一局 10 分鐘）。

## 開發

```bash
npm install
npm run dev            # 本機開發伺服器（加了 --host，同一個 Wi-Fi 的手機也能連）
npm run build          # 型別檢查＋打包成單一檔案 dist/index.html
npm run build:artifact # 另外產生可發布成 Claude Artifact 的 artifact/cyber-ronin.html
```

網址後面加上 `#debug` 會出現除錯按鈕：無敵、時間 +60 秒、直接升級、生成寶箱、刀直接滿級。

## 程式結構

| 路徑 | 內容 |
|---|---|
| `src/config/balance.ts` | 所有數值：玩家、武器、被動道具、進化、敵人、波次、Boss、殺意 |
| `src/i18n/zh-TW.ts` | 介面文字 |
| `src/scenes/GameScene.ts` | 遊戲邏輯：移動、敵人、武器、掉落物、升級、殺意與居合・一閃、復活、結算 |
| `src/scenes/UIScene.ts` | HUD、浮動搖桿、升級卡片、暫停、復活、結算畫面 |
| `src/scenes/MenuScene.ts` | 主選單 |
| `src/game/textures.ts` | 用程式畫出來的佔位圖（之後換成 Higgsfield 生成的素材） |
| `src/game/SpatialGrid.ts` | 空間格網，加速大量敵人的碰撞查詢 |
