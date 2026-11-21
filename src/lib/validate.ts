// Validaciones de formularios: cada regla devuelve el mensaje de error o '' si está bien.
export type Errors<K extends string = string> = Partial<Record<K, string>>

export const required = (v: unknown, msg = 'Este dato es obligatorio') =>
  v === null || v === undefined || String(v).trim() === '' ? msg : ''

export const minLen = (v: string, n: number, what = 'Este dato') =>
  v.trim().length < n ? `${what} necesita al menos ${n} caracteres` : ''

export const personName = (v: string) =>
  !v.trim() ? 'Escribe tu nombre' : v.trim().length < 2 ? 'El nombre es muy corto' : v.trim().length > 60 ? 'El nombre es muy largo (máximo 60)' : ''

/** Celular boliviano: 8 dígitos que empiezan en 6 o 7 (acepta +591 delante) */
export const phoneBO = (v: string, optional = false) => {
  const d = v.replace(/\D/g, '').replace(/^591/, '')
  if (!d) return optional ? '' : 'Escribe tu número de celular'
  if (d.length !== 8) return 'El celular debe tener 8 dígitos (ej. 70012345)'
  if (!/^[67]/.test(d)) return 'El celular debe empezar con 6 o 7'
  return ''
}

export const email = (v: string) =>
  !v.trim() ? 'Escribe el correo' : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Ese correo no parece válido (ej. nombre@gmail.com)'

export const password = (v: string) =>
  !v ? 'Escribe una contraseña' : v.length < 6 ? 'La contraseña necesita al menos 6 caracteres' : ''

export const number = (v: string | number, { min, max, label = 'El valor', integer = false, optional = false }: { min?: number; max?: number; label?: string; integer?: boolean; optional?: boolean } = {}) => {
  // El nombre del campo ya está en la etiqueta: los mensajes van sin sujeto para que siempre suenen bien
  void label
  if (v === '' || v === null || v === undefined) return optional ? '' : 'Completa este dato'
  const n = Number(v)
  if (Number.isNaN(n)) return 'Escribe solo números'
  if (integer && !Number.isInteger(n)) return 'Usa un número entero, sin decimales'
  if (min !== undefined && n < min) return `El mínimo es ${min}`
  if (max !== undefined && n > max) return `El máximo es ${max}`
  return ''
}

export const fileImage = (f: File | null, { maxMB = 5, required: req = true, pdf = false } = {}) => {
  if (!f) return req ? 'Elige un archivo' : ''
  const ok = f.type.startsWith('image/') || (pdf && f.type === 'application/pdf')
  if (!ok) return pdf ? 'Sube una foto o un PDF' : 'Sube una foto (JPG, PNG o WEBP)'
  if (f.size > maxMB * 1024 * 1024) return `El archivo pesa más de ${maxMB} MB`
  return ''
}

/** Quita los campos sin error; true si no queda ninguno */
export const clean = <K extends string>(e: Errors<K>): Errors<K> =>
  Object.fromEntries(Object.entries(e).filter(([, v]) => !!v)) as Errors<K>
export const isValid = (e: Errors) => Object.values(e).every((v) => !v)

/** Lleva el foco al primer campo con error para que se vea qué falta */
export const focusFirstError = () =>
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>('.field.invalid input, .field.invalid select, .field.invalid textarea, .field.invalid button')
    el?.focus()
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
