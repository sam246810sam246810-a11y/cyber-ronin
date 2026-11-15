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

## 目前進度：M3 成長與裝備（含 M2 戰鬥、序章劇情）

開新遊戲先選職業與難度，接著可以從頭玩到「序章 完」：
燈的家 → 狐火村 → 神社找宮司爺爺 → 注連繩解開 → 迷霧竹林（有怪物）→ 古井 → 回神社報告。

**成長與裝備（M3）**
- 等級與經驗：升級所需 `floor(20 × L^1.6)`，第一版上限 Lv10，升級時 HP／MP 全滿，依職業成長
- 6 個裝備欄位（武器、頭、身、手、腳、飾品），23 種裝備，武器分職業
- 5 種稀有度（普通／優良／稀有／史詩／傳說），隨機詞條；打怪 10% 掉裝備，部分寶箱開出裝備
- 背包 30 格（消耗品每 99 個一格），可買「擴充布袋」到 60 格
- 選單（右上角）：狀態、裝備（換上前會顯示能力增減）、背包（使用道具、丟掉裝備）
- 道具屋「鈴屋」：和阿鈴對話後可以買道具與普通裝備、賣東西（原價 40%）

**戰鬥（M2）**
- 三個職業：劍士（近戰三段斬）、弓術師（射箭，長按蓄力射出貫穿箭）、陰陽師（丟符咒）
- 攻擊與技能會自動瞄準最近的敵人，目標腳下有紅圈
- 每個職業 2 個技能（耗 MP、有冷卻）：迴旋斬／突刺、三連矢／定身箭、火符／結界
- 閃避翻滾（前 0.25 秒無敵）、受傷無敵 0.9 秒與擊退
- 狀態異常：燒傷、中毒、麻痺；快捷「藥」鈕會自動選最適合的道具
- 竹林怪物：狐火、唐傘小僧、野狐；三種難度；力盡後回到最後進入的地圖入口，道具保留
- 村子西邊有打不壞的練習用稻草人

**探索與劇情**
- 7 張地圖、6 位 NPC（對話依劇情進度改變）、6 個寶箱、狐火提示的隱藏密道
- 尚未做：古井地城與謎題（M4）、存檔（M6）、打造（M7）——重新整理頁面會從頭開始

## 結構

```
src/
  main.ts          Phaser 設定
  config.ts        解析度、速度、場景名稱
  scenes/          Boot、Title、World、UI
  entities/        Player、Enemy（AI）
  combat/          CombatSystem（攻擊、技能、閃避、受傷）、特效
  systems/         純邏輯（combat、progression、equipment、inventory、movement、dialogue、gameState、interaction），有單元測試
  data/            職業、技能、怪物、裝備、商店、對話、NPC、地圖清單
  ui/              VirtualJoystick、TouchButton、DialogueBox、camera 工具
  ui/dom/          選單與商店（HTML 疊加層）
assets/            佔位素材（由 scripts/gen-placeholder-assets.mjs 產生）
scripts/           素材產生器、Artifact 打包
tests/             Vitest
```
