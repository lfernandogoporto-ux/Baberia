import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Bunny Barber Studio',
        short_name: 'Bunny',
        description: 'Reserva tu corte en Bunny Barber Studio y administra la barbería',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0e0b08',
        theme_color: '#0e0b08',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Incluye la tipografía y el logo para que la app se vea igual sin conexión
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        globIgnores: ['push-sw.js', 'icon-512.png', 'icon-maskable-512.png'],
        // Recordatorios push: el manejador vive en public/push-sw.js
        importScripts: ['/push-sw.js'],
        navigateFallback: '/index.html',
        // Las llamadas a Supabase nunca se guardan en caché
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//],
      },
    }),
  ],
})
