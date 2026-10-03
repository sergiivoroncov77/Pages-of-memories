import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.svg', 'demo/*.svg'],
      manifest: {
        name: 'Истории близких',
        short_name: 'Истории',
        description: 'Голосовые воспоминания семьи, собранные в одну книгу',
        lang: 'ru',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f7f1e7',
        theme_color: '#8f4e36',
        categories: ['lifestyle', 'education'],
        icons: [
          {
            src: '/icons/pwa-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: '/icons/pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff2}']
      }
    })
  ]
});
