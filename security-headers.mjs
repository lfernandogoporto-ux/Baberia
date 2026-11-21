// Cabeceras de seguridad de la app (objetivo: A+ en securityheaders.com y Mozilla Observatory).
// Se usan en `vite preview`, en vercel.json y en public/_headers; generar con: node security-headers.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const SUPABASE = 'https://kntfwnfxhhtyaviqtsqa.supabase.co'
const WSS = SUPABASE.replace('https://', 'wss://')

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  `img-src 'self' data: blob: ${SUPABASE} https://tile.openstreetmap.org`,
  "font-src 'self'",
  `connect-src 'self' ${SUPABASE} ${WSS}`,
  "media-src 'self' blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ')

export const HEADERS = {
  'Content-Security-Policy': CSP,
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), bluetooth=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Permitted-Cross-Domain-Policies': 'none',
}

// Al ejecutarse directo, escribe la configuración para los hostings
if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('security-headers.mjs')) {
  const vercel = {
    headers: [
      { source: '/(.*)', headers: Object.entries(HEADERS).map(([key, value]) => ({ key, value })) },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ],
    rewrites: [{ source: '/((?!.*\\.).*)', destination: '/index.html' }],
  }
  writeFileSync(new URL('./vercel.json', import.meta.url), JSON.stringify(vercel, null, 2) + '\n')
  const netlify = ['/*', ...Object.entries(HEADERS).map(([k, v]) => `  ${k}: ${v}`), '', '/sw.js', '  Cache-Control: no-cache', ''].join('\n')
  writeFileSync(new URL('./public/_headers', import.meta.url), netlify)
  void readFileSync
  console.log('vercel.json y public/_headers actualizados')
}
