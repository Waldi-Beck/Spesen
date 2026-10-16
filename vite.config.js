import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH wird beim GitHub-Pages-Build gesetzt (z. B. "/QPS-Spesen/")
const base = process.env.BASE_PATH || './';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'vorlage/*'],
      manifest: {
        name: 'QPS Spesen',
        short_name: 'Spesen',
        description: 'Belege fotografieren und Spesenabrechnung für QPS erstellen',
        lang: 'de-CH',
        theme_color: '#2b4c9b',
        background_color: '#f3f5f9',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,xlsx}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 2000 },
  test: { environment: 'node' },
});
