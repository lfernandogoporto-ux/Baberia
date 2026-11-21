import { defineConfig } from 'vitest/config'

// Pruebas unitarias: solo lógica pura (sin navegador ni base de datos)
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    env: { TZ: 'UTC' },
  },
})
