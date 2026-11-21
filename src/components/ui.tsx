import { cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react'
import type { Status } from '../lib/types'
import { IconAlert, IconCheck, IconInfo, IconX } from './icons'

/** Hoja inferior en el celular, diálogo centrado en pantallas grandes */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      window.removeEventListener('keydown', h)
      document.body.style.overflow = prev
    }
  }, [onClose])
  return (
    <div className="sheet-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} className="sheet stack" role="dialog" aria-modal="true" aria-label={title} style={{ outline: 'none' }}>
        <div className="grab" aria-hidden />
        <div className="row between">
          <h2>{title}</h2>
          <button className="btn icon ghost" onClick={onClose} aria-label="Cerrar"><IconX /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Carga: filas esqueleto en lugar de un spinner */
export function Spinner({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton" role="status" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => <i key={i} />)}
    </div>
  )
}

/** Campo con etiqueta, ayuda y mensaje de error debajo cuando algo falta o está mal */
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  const id = useId()
  const errId = `${id}-err`
  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, error ? { 'aria-invalid': true, 'aria-describedby': errId } : {})
    : children
  return (
    <label className={`field ${error ? 'invalid' : ''}`}>
      <span>{label}</span>
      {child}
      {error ? <small className="field-error" id={errId} role="alert"><IconAlert size={15} />{error}</small> : hint && <small>{hint}</small>}
    </label>
  )
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; children: ReactNode }) {
  const Icon = tone === 'ok' ? IconCheck : tone === 'info' ? IconInfo : IconAlert
  return (
    <div className={`alert ${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      <Icon size={20} />
      <div>{children}</div>
    </div>
  )
}

/** Error de un grupo (por ejemplo, una lista de opciones) que no es un solo campo */
export function GroupError({ children }: { children: ReactNode }) {
  return <p className="group-error" role="alert"><IconAlert size={15} />{children}</p>
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <p><b>{title}</b></p>
      {children && <p className="small">{children}</p>}
    </div>
  )
}

const STATUS: Record<Status, [string, string]> = {
  held: ['Retenida', 'info'],
  pending: ['Pendiente', 'warn'],
  confirmed: ['Confirmada', 'ink'],
  in_progress: ['En curso', 'teal'],
  completed: ['Terminada', 'ok'],
  cancelled: ['Cancelada', 'bad'],
  no_show: ['No llegó', 'bad'],
}
export function StatusBadge({ status }: { status: Status }) {
  const [label, cls] = STATUS[status]
  return <span className={`badge ${cls}`}>{label}</span>
}

export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'

// --- avisos breves ---
type Toast = { msg: string; bad?: boolean; id: number } | null
const ToastCtx = createContext<(msg: string, bad?: boolean) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<Toast>(null)
  const show = useCallback((msg: string, bad?: boolean) => setT({ msg, bad, id: Date.now() }), [])
  useEffect(() => {
    if (!t) return
    const id = setTimeout(() => setT(null), 3500)
    return () => clearTimeout(id)
  }, [t])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && (
        <div key={t.id} className={`toast ${t.bad ? 'bad' : ''}`} role="status">
          {t.bad ? <IconAlert size={20} /> : <IconCheck size={20} />}
          <span>{t.msg}</span>
        </div>
      )}
    </ToastCtx.Provider>
  )
}
