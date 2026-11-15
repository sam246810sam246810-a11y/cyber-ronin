import { defineConfig } from 'vite';

// 多檔案輸出：小圖（16 KB 以下）直接內嵌在程式裡，其他圖片與音樂放在 assets/。
// 檔名不加雜湊，重新發布時會覆蓋同一路徑，舊檔不會累積。
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 16 * 1024,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/game.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
