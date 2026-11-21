// Bolivia (La Paz / Cochabamba) usa UTC-4 todo el año, sin horario de verano.
export const TZ = 'America/La_Paz'
const OFFSET_MS = -4 * 3600 * 1000

const pad = (n: number) => String(n).padStart(2, '0')

/** Fecha de hoy en Bolivia como YYYY-MM-DD */
export const todayStr = () => new Date(Date.now() + OFFSET_MS).toISOString().slice(0, 10)

export const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T12:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

/** Inicio y fin de un día boliviano como instantes ISO */
export const dayRange = (d: string) => ({ from: `${d}T00:00:00-04:00`, to: `${addDays(d, 1)}T00:00:00-04:00` })

export const time = (iso: string) =>
  new Intl.DateTimeFormat('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).format(new Date(iso))

export const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Intl.DateTimeFormat('es-BO', { ...opts, timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))

export const dateTimeLabel = (iso: string) =>
  new Intl.DateTimeFormat('es-BO', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).format(new Date(iso))

export const money = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0)
  return `Bs ${v.toLocaleString('es-BO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export const mins = (m: number) => {
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} h ${r} min` : `${h} h`
}

/** Teléfono solo con dígitos; si son 8 dígitos (celular boliviano) se antepone 591 */
export const normPhone = (p: string) => {
  const d = p.replace(/\D/g, '')
  return d.length === 8 ? `591${d}` : d
}

/** Para <input type="time"> */
export const hhmm = (t: string) => t.slice(0, 5)
export const isoDate = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
// Orden para mostrar: lunes a domingo
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
