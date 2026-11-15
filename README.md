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

## 目前進度：M1 骨架

- 場景流程：Boot（載入）→ Title（點擊開始）→ World（地圖）＋ UI（疊加層）
- 狐火村地圖：Tiled JSON 格式（`assets/maps/village.json`），可用 Tiled 開啟編輯；tile 屬性 `collides` 決定碰撞
- 主角四方向走路動畫、碰撞、鏡頭跟隨並限制在地圖範圍
- 浮動觸控搖桿（左半邊）；只做觸控，電腦上可用滑鼠拖曳
- 直向持握時提示轉成橫向
- 內部解析度 480×270，畫布以 3 倍渲染讓中文字清楚

## 結構

```
src/
  main.ts          Phaser 設定
  config.ts        解析度、速度、場景名稱
  scenes/          Boot、Title、World、UI
  entities/        Player
  systems/         純邏輯（movement、inputState），有單元測試
  ui/              VirtualJoystick、camera 工具
assets/            佔位素材（由 scripts/gen-placeholder-assets.mjs 產生）
scripts/           素材產生器、Artifact 打包
tests/             Vitest
```
