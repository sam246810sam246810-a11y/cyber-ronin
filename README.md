# 狐火行 Kitsunebi

2D 和風妖怪探險尋寶 RPG（網頁、手機觸控）。規格見 [docs/PRD.md](docs/PRD.md)。

## 開發

```bash
npm install
npm run dev            # 本機開發伺服器（--host，同網路的手機可連）
npm test               # 單元測試（Vitest）
npm run build          # 型別檢查＋打包成單一 dist/index.html
npm run build:artifact # 另外產生可發佈成 Claude Artifact 的 dist-artifact/kitsunebi.html
npm run assets         # 重新產生佔位素材（tileset、主角、狐火村地圖）
```

## 目前進度：序章試玩版（M1 骨架＋提前加入的探索與劇情）

可以從頭玩到「序章 完」，約 5–10 分鐘：
燈的家 → 狐火村 → 神社找宮司爺爺 → 注連繩解開 → 迷霧竹林 → 古井 → 回神社報告。

- 7 張地圖：狐火村、迷霧竹林，以及 5 間可以進去的室內（燈的家、阿梅的家、道具屋、鍛冶屋、神社）
- 6 位 NPC，對話會依主線進度改變（`src/data/dialogues.json`）
- 6 個寶箱（只能開一次），竹林裡有狐火提示的隱藏密道
- 劇情旗標控制區域解鎖（竹林入口的注連繩）
- 介面：觸控搖桿、調查／對話鈕、對話框（逐字顯示）、金錢與目標、獲得道具提示
- 尚未做：戰鬥（M2）、等級與裝備（M3）、存檔（M6）——重新整理頁面會從頭開始

## 結構

```
src/
  main.ts          Phaser 設定
  config.ts        解析度、速度、場景名稱
  scenes/          Boot、Title、World、UI
  entities/        Player
  systems/         純邏輯（movement、dialogue、gameState、interaction），有單元測試
  data/            對話、NPC、地圖清單
  ui/              VirtualJoystick、ActionButton、DialogueBox、camera 工具
assets/            佔位素材（由 scripts/gen-placeholder-assets.mjs 產生）
scripts/           素材產生器、Artifact 打包
tests/             Vitest
```
