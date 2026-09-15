import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.svg'],
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
        icons: [
          { src: 'icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: 'icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }
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
