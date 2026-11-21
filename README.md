# 坩堝花園（MVP 試作）

16:9 橫向 2D 俯視角煉金肉鴿手遊原型：撿 5 種元素、4 種稀有度的素材，三格坩堝煉藥並喝下，本局永久變強；煉成時有機率裂變成神話藥水。4 名角色各有能力值、被動與主動技能，達成條件解鎖；9 把分稀有度的武器，可同時帶 2 把切換。地下城爬塔：3 區（溫室 → 熔岩花園 → 雷雲山頂）× 3 層，每層隨機生成房間地圖，有戰鬥、精英挑戰、寶箱、商店、事件、樓梯與 Boss 房；穿門有機率掉進時空裂縫（過去 / 未來），戰鬥房可能帶祝福或詛咒詞條，還會遇到會說話的 NPC。規格見 [`docs/PRD.md`](docs/PRD.md)。

## 本地啟動

```bash
npm install
npm run dev
```

- 電腦瀏覽器打開 `http://localhost:5173/`
- **手機測試**：手機和電腦連同一個 Wi-Fi，打開終端機上顯示的 `Network: http://192.168.x.x:5173/`
  （`npm run dev` 已經帶 `--host`）
- iPhone Safari 可以「分享 → 加入主畫面」，以全螢幕方式開啟；遊戲是橫向的，直拿會提示橫放

其他指令：

| 指令 | 用途 |
|---|---|
| `npm run build` | 型別檢查 + 打包到 `dist/` |
| `npm run preview` | 預覽打包結果（同樣可用手機連線） |
| `npm run typecheck` | 只跑 TypeScript 檢查 |

## 操作

| 動作 | 手機 | 鍵盤 |
|---|---|---|
| 移動 | 畫面左半邊按住拖曳（浮動搖桿） | WASD / 方向鍵 |
| 衝刺（有無敵幀） | 右下「衝刺」 | 空白鍵 |
| 煉成並喝下 | 右下「煉成」或坩堝列「煉成」 | J / K |
| 角色技能 | 右下「技能」 | E |
| 切換武器 | 右下「換武器」 | Q |
| 丟棄藥材 | 點坩堝槽位 | — |
| 選突變卡 | 點卡片 | 1 / 2 / 3 |

## Debug 面板

`npm run dev` 時左下角會出現 🐞 按鈕（正式版網址加 `?debug` 也能打開）：
切換素材稀有度並給素材、下次必裂變、清空房間、下一層、Boss 房、+50 金幣、生成寶箱或商店、直接到 Boss、開突變卡、無敵、補血、解鎖全圖鑑、解鎖全角色、重置圖鑑與進度。

## 專案結構

```
src/
  main.ts / config.ts      進入點、全域數值（移速、冷卻、掉落率…）
  scenes/                  Boot, Preload, MainMenu, CharacterSelect, Game, CardSelect, Event, Pause, Result, Codex
  entities/                Player, Enemy（基底：減速/冰凍/中毒/擊退/護盾鉤子）, enemies/*, bosses/*, Pickup
  systems/                 Input, Crucible（品質/裂變）, Buff（喝藥強化與數值）, Effect, Projectile, Dungeon（樓層生成/房間/戰鬥/Boss）,
                           Mutation（卡片稀有度）, Weapon（武器）, Skill（角色技能）, Telegraph, Hazard（熔岩地面）, Event（房間物件：寶箱/泉水/商店/祭壇/樓梯）, Tutorial, Sound,
                           Fx, CodexStore, ProgressStore（角色解鎖）
  potions/passives.ts      元素核心 / 附加 / 神話藥水的被動
  data/*.json              元素與素材、三色藥水名稱、神話藥水、角色、敵人、區域與波次、突變卡
  ui/                      搖桿、按鈕、坩堝列、HUD、小地圖
  debug/DebugPanel.ts      開發用面板
```

## 怎麼擴充

- **調整數值**：稀有度倍率、掉落與卡片稀有度權重、裂變率、屬性成長都在 `src/config.ts`（`RARITY`、`DROP_RARITY`、`CARD_RARITY`、`FISSION`、`ELEMENT`）。
- **藥水**：35 種配方由 `src/data/index.ts` 的 `buildRecipes()` 依純色 / 雙色 / 三色規則產生；被動在 `src/potions/passives.ts`。
- **新增元素**：在 `data/elements.json` 加一筆（含 4 種素材名），在 `passives.ts` 加 `core_X`、`rider_X`，在 `PreloadScene` 畫 `ing_X` 圖示。
- **新增神話藥水**：`data/mythics.json` 加一筆，`passives.ts` 註冊同 id。
- **新增角色**：`data/characters.json` 加一筆（能力值、被動欄位、初始武器、技能、解鎖條件），技能邏輯在 `src/systems/SkillSystem.ts`。
- **新增武器**：`data/weapons.json` 加一筆；新的攻擊方式（`kind`）在 `src/systems/WeaponSystem.ts` 的 `fire()` 實作，並在 `PreloadScene` 畫 `wpn_<kind>` 圖示。
- **新增突變卡**：`data/mutations.json` 加一筆，再到 `BuffSystem` 或 `CrucibleSystem` 用 `mutations.value(id)` 讀取。
- **新增敵人**：繼承 `Enemy` 實作 `act(dt)`，在 `data/enemies.json` 加數值，並在 `DungeonSystem.create()` 對應。
- **新增區域**：在 `data/regions.json` 加一筆（配色、血量倍率、敵人池與花費、每層戰鬥預算、Boss 類型）。
- **時空裂縫 / 詞條 / NPC**：機率、詞條與 NPC 台詞在 `src/data/fun.json`；裂縫流程在 `DungeonSystem`，NPC 對話在 `EventSystem.openNpc()`。
- **調整地圖**：房間數量、特殊房比例與商店商品在 `src/systems/DungeonSystem.ts` 的 `generateFloor()`、`rollShop()`。
- **換美術**：`PreloadScene` 目前用 Graphics 產生佔位圖，之後用 `this.load.image()` 載入同名 key 即可替換。

## 存檔

只有圖鑑解鎖紀錄會存進 `localStorage`（`crucible-garden.codex.v1`），讀寫失敗時會直接忽略。
