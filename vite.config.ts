import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Barbería Casa',
        short_name: 'Casa',
        description: 'Reserva tu corte y administra la barbería',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f1f3ef',
        theme_color: '#172036',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Incluye la tipografía para que la app se vea igual sin conexión
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['push-sw.js'],
        // Recordatorios push: el manejador vive en public/push-sw.js
        importScripts: ['/push-sw.js'],
        navigateFallback: '/index.html',
        // Las llamadas a Supabase nunca se guardan en caché
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//],
      },
    }),
  ],
})
