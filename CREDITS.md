# 素材來源 CREDITS

《狐火行》第一章試玩版的所有素材都是這個專案原創，由程式產生，沒有使用任何外部素材包。

| 素材 | 來源 |
|---|---|
| 地圖圖塊、角色、NPC、怪物、Boss、特效 | `scripts/gen-placeholder-assets.mjs` 以程式逐點繪製的像素圖 |
| 地圖 | 同一支程式產生的 Tiled JSON（`assets/maps/`），可用 Tiled 開啟編輯 |
| 音樂 | `src/audio/music.ts` 原創曲譜（都節音階），`src/audio/sound.ts` 以 Web Audio 即時合成 |
| 音效 | `src/audio/sound.ts` 以 Web Audio 即時合成 |
| 字型 | 使用裝置內建字型（Noto Sans TC／蘋方／微軟正黑體） |
| 遊戲引擎 | [Phaser 3](https://phaser.io)（MIT 授權） |

日後換成正式美術或音樂時，請把每個素材的作者、網址與授權補在這裡。
