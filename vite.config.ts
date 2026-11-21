import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { CSP, HEADERS } from './security-headers.mjs'

export default defineConfig({
  // Las mismas cabeceras de seguridad que tendrá el hosting, para probarlas con `npm run preview`
  preview: { headers: HEADERS },
  plugins: [
    react(),
    {
      // En la versión final, la CSP también va dentro de la página por si el hosting no permite cabeceras
      name: 'csp-meta',
      apply: 'build',
      transformIndexHtml: (html) => html.replace('<head>', `<head>
    <meta http-equiv="Content-Security-Policy" content="${CSP.replace("; frame-ancestors 'none'", '')}" />`),
    },
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
