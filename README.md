# 萌爪突擊 PAW STRIKE

直式單指操作的可愛動物「走停射擊」肉鴿手遊（Web 版 M1）。

- 📄 產品需求文件：[docs/PRD.md](docs/PRD.md)
- 🎨 Higgsfield 素材清單：[docs/ASSETS.md](docs/ASSETS.md)

## 快速開始

```bash
npm install
npm run dev        # http://localhost:5173 ，手機在同網段用 Network 網址開
npm run build      # 輸出到 dist/，可放任何靜態主機
```

## 玩法

- 手指拖曳移動，**放開停下就會自動射擊**最近的敵人。
- 每升一級從三個技能中選一個；湊齊條件會出現金色「超武」卡。
- 15 個房間，第 5、10 間是菁英，第 15 間是 Boss。

## 替換美術

把 Higgsfield 生成的透明背景 PNG 依 [docs/ASSETS.md](docs/ASSETS.md) 的檔名放進 `src/assets/`，重新整理即可，缺的圖會自動用佔位圖。
新增素材時改 `src/data/assets.ts`，再執行 `npm run assets:doc` 更新清單。

## 調整數值

| 想調整 | 檔案 |
|---|---|
| 技能效果與權重 | `src/data/skills.ts` |
| 敵人血量、傷害 | `src/data/enemies.ts` |
| 章節難度、房間組成 | `src/data/chapters.ts` |
| 裝備屬性、品質倍率、強化費用 | `src/data/equipment.ts` |
| 商店、禮包、寶箱機率 | `src/data/shop.ts` |
| 7 日任務與獎勵 | `src/data/quests.ts` |

用 `?bot=1&speed=8` 讓機器人自動玩，快速檢查難度。

## 專案結構

```
src/
  core/   素材載入、音效合成、搖桿輸入、埋點
  data/   所有數值設定
  game/   戰鬥引擎（battle.ts）與物件池
  meta/   存檔、裝備、商店、嘉年華、結算邏輯
  ui/     大廳、裝備、商店、嘉年華與所有彈窗
```

> ⚠️ M1 的所有購買都是模擬，不會實際扣款。
