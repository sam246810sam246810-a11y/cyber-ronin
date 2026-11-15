import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 全部打包成單一 HTML（圖片轉 data URI），方便直接部署或發佈成 Artifact 在手機上測試。
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { chunkSizeWarningLimit: 4000 },
  test: { include: ['tests/**/*.test.ts'] },
} as any);
