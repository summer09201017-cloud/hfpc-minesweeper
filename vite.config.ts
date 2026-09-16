import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // ⚠ 不可以只寫 *.svg:PNG 圖示不進 precache 的話,離線時安裝畫面會抓不到圖
      includeAssets: ['icons/*'],
      manifest: {
        name: '踩地雷 Minesweeper',
        short_name: '踩地雷',
        description: 'WinXP 原味踩地雷:和弦展開、無猜盤面、每日挑戰,可離線遊玩',
        theme_color: '#c0c0c0',
        background_color: '#3a6ea5',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'zh-Hant',
        // 🖼 圖示三件套(scripts/gen-icons.mjs 從 SVG 產的):
        //   · PNG 192/512 = 到處都吃的基本盤
        //   · maskable 512 = Android 會把圖示裁成圓形,內容要縮在安全區內(不然邊框被切掉)
        //   · SVG 留著當加分項(支援的瀏覽器會用它,任何尺寸都清晰)
        // ⚠ 不可以只有 SVG:iOS 的 apple-touch-icon 只吃 PNG,
        //   只給 SVG 的話 iPhone「加入主畫面」會拿網頁縮圖當圖示(而且不會報錯)。
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html'
      }
    })
  ],
  server: { host: true, port: 5173 }
});
