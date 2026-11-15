# 萌爪突擊 PAW STRIKE

直式單指操作的可愛動物「車隊」肉鴿手遊（Web 版 M1.5）：柴犬隊長帶著救來的夥伴排成一列出征，走分岔地圖，回村莊蓋房子。

- 📄 產品需求文件：[docs/PRD.md](docs/PRD.md)
- 🎨 Higgsfield 素材清單：[docs/ASSETS.md](docs/ASSETS.md)

## 快速開始

```bash
npm install
npm run dev        # http://localhost:5173 ，手機在同網段用 Network 網址開
npm run build      # 輸出到 dist/，可放任何靜態主機
```

## 玩法

- 隊伍一直前進，手指拖曳決定方向；每隻夥伴自動攻擊。
- 升級三選一：招募新夥伴、幫夥伴升星、全隊強化；湊齊條件出現金色「合體技」。
- 每章是一張 9 層分岔地圖：戰鬥、菁英、救援、營火、寶箱、行商，最後是 Boss。
- 回到村莊用金幣蓋房子，解鎖新夥伴與永久加成。

## 替換美術

把 Higgsfield 生成的透明背景 PNG 依 [docs/ASSETS.md](docs/ASSETS.md) 的檔名放進 `src/assets/`，重新整理即可，缺的圖會自動用佔位圖。
新增素材時改 `src/data/assets.ts`，再執行 `npm run assets:doc` 更新清單。

## 調整數值

| 想調整 | 檔案 |
|---|---|
| 夥伴武器與數值 | `src/data/partners.ts` |
| 三選一卡片、合體技 | `src/data/skills.ts` |
| 村莊建築 | `src/data/village.ts` |
| 敵人血量、傷害 | `src/data/enemies.ts` |
| 章節難度、地圖節點 | `src/data/chapters.ts` |
| 裝備屬性、品質倍率、強化費用 | `src/data/equipment.ts` |
| 商店、禮包、寶箱機率 | `src/data/shop.ts` |
| 7 日任務與獎勵 | `src/data/quests.ts` |

用 `?bot=1&speed=8` 讓機器人自動玩，快速檢查難度。

## 專案結構

```
src/
  core/   素材載入、音效合成、搖桿輸入、埋點
  data/   所有數值設定
  game/   戰鬥引擎（battle.ts）、本局狀態（run.ts）與物件池
  meta/   存檔、裝備、村莊、商店、嘉年華、結算邏輯
  ui/     大廳、地圖、裝備、村莊、商店、嘉年華與所有彈窗
```

> ⚠️ M1 的所有購買都是模擬，不會實際扣款。
