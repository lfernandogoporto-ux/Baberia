import type { PayMode } from './types'

/** Lo que le toca al barbero en el mes según su forma de pago (misma regla que commission_report en la base) */
export function barberShare(mode: PayMode, revenue: number, pct = 0, salary = 0, rent = 0): number | null {
  const r = (n: number) => Math.round(n * 100) / 100
  switch (mode) {
    case 'percent': return r(revenue * pct / 100)
    case 'salary': return r(salary)
    case 'mixed': return r(salary + revenue * pct / 100)
    case 'chair_rent': return r(revenue - rent)
    default: return null
  }
}

/** Lo que queda para el local */
export function shopShare(mode: PayMode, revenue: number, pct = 0, salary = 0, rent = 0): number | null {
  if (mode === 'chair_rent') return Math.round(rent * 100) / 100
  const b = barberShare(mode, revenue, pct, salary, rent)
  return b === null ? null : Math.round((revenue - b) * 100) / 100
}
