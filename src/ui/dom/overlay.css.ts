// 選單與商店（HTML 疊在遊戲畫面上）的樣式。
export const OVERLAY_CSS = `
.kf-overlay { position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center;
  background: rgba(10, 8, 16, .62); padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left));
  font: 13px/1.45 "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif; color: #f2e6c9; -webkit-user-select: none; user-select: none; touch-action: manipulation; }
.kf-overlay[hidden] { display: none; }
.kf-panel { width: min(96vw, 760px); height: min(94vh, 440px); background: #1e1b2c; border: 1px solid #4a4660; border-radius: 10px;
  display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,.5); }
.kf-head { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid #34304a; flex-wrap: wrap; }
.kf-title { font-weight: 700; color: #e8823a; margin-right: 6px; }
.kf-tab { background: #2a2640; color: #f2e6c9; border: 1px solid #4a4660; border-radius: 6px; padding: 6px 14px; font: inherit; min-height: 32px; cursor: pointer; }
.kf-tab[aria-selected="true"] { background: #c23b2f; border-color: #e8823a; }
.kf-spacer { flex: 1; }
.kf-money { color: #f2c94c; font-variant-numeric: tabular-nums; }
.kf-close { background: transparent; border: 1px solid #6b6780; color: #f2e6c9; border-radius: 6px; width: 36px; height: 32px; font: inherit; font-size: 16px; cursor: pointer; }
.kf-body { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); min-height: 0; }
.kf-col { overflow-y: auto; padding: 8px 10px; min-width: 0; -webkit-overflow-scrolling: touch; }
.kf-col + .kf-col { border-left: 1px solid #34304a; }
.kf-row { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 6px; border: 1px solid transparent; cursor: pointer; min-height: 34px; }
.kf-row:hover { background: #26223a; }
.kf-row[aria-selected="true"] { background: #2e2948; border-color: #6b5fa0; }
.kf-row .k { color: #a39fb8; width: 3.2em; flex: none; font-size: 12px; }
.kf-row .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kf-row .q { color: #a39fb8; font-variant-numeric: tabular-nums; }
.kf-sec { color: #a39fb8; font-size: 11px; letter-spacing: .08em; margin: 10px 0 4px; }
.kf-sec:first-child { margin-top: 0; }
.kf-card { background: #26223a; border: 1px solid #3a3552; border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
.kf-card h3 { margin: 0; font-size: 15px; }
.kf-tag { font-size: 11px; color: #a39fb8; }
.kf-stats { margin: 0; padding: 0; list-style: none; display: grid; gap: 2px; }
.kf-up { color: #6fd06f; } .kf-down { color: #ff7a7a; } .kf-mute { color: #6b6780; }
.kf-btns { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
.kf-btn { background: #e8823a; color: #14121c; border: 0; border-radius: 6px; padding: 7px 14px; font: inherit; font-weight: 700; min-height: 34px; cursor: pointer; }
.kf-btn.secondary { background: #2a2640; color: #f2e6c9; border: 1px solid #4a4660; font-weight: 500; }
.kf-btn.danger { background: #7a2a2a; color: #f2e6c9; }
.kf-btn:disabled { opacity: .4; cursor: default; }
.kf-btn:focus-visible, .kf-tab:focus-visible, .kf-row:focus-visible, .kf-close:focus-visible { outline: 2px solid #f2c94c; outline-offset: 1px; }
.kf-grid { display: grid; grid-template-columns: auto 1fr; gap: 3px 14px; font-variant-numeric: tabular-nums; }
.kf-grid dt { color: #a39fb8; } .kf-grid dd { margin: 0; }
.kf-bar { height: 6px; background: #000; border-radius: 3px; overflow: hidden; } .kf-bar > i { display: block; height: 100%; background: #9fd8ff; }
.kf-msg { min-height: 1.4em; color: #f2c94c; font-size: 12px; }
.kf-empty { color: #6b6780; padding: 10px 8px; }
@media (max-height: 360px) { .kf-row { min-height: 30px; padding: 5px 8px; } .kf-head { padding: 6px 8px; } }
`;
