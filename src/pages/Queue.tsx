import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Barber } from '../lib/types'
import { normPhone } from '../lib/format'
import { Alert, Field, Spinner, initials } from '../components/ui'
import { clean, focusFirstError, isValid, personName, phoneBO, type Errors } from '../lib/validate'
import { IconChevronLeft } from '../components/icons'

/** /fila: el cliente que llega sin reserva se anota desde el QR de la puerta */
export function QueueJoin() {
  const nav = useNavigate()
  const { settings } = useAuth()
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [barber, setBarber] = useState<string>('')
  const [name, setName] = useState(() => localStorage.getItem('bc_name') ?? '')
  const [phone, setPhone] = useState(() => localStorage.getItem('bc_phone') ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<Errors<'name' | 'phone'>>({})

  useEffect(() => {
    const prev = localStorage.getItem('bc_queue')
    if (prev) nav(`/fila/${prev}`, { replace: true })
    void supabase.rpc('list_barbers').then(({ data }) => setBarbers((data as Barber[]) ?? []))
  }, [nav])

  const join = async (e: FormEvent) => {
    e.preventDefault()
    const errs = clean({ name: personName(name), phone: phoneBO(phone, true) })
    setErrors(errs)
    if (!isValid(errs)) return focusFirstError()
    setBusy(true)
    setError('')
    const { data, error } = await supabase.rpc('join_queue', {
      p_name: name.trim(), p_phone: phone ? normPhone(phone) : null, p_barber: barber || null,
    })
    setBusy(false)
    if (error) return setError(errMsg(error))
    localStorage.setItem('bc_name', name.trim())
    if (phone) localStorage.setItem('bc_phone', phone.trim())
    localStorage.setItem('bc_queue', data as string)
    nav(`/fila/${data}`, { replace: true })
  }

  if (settings && !settings.queue_enabled) {
    return <div className="page stack"><h1>Fila</h1><Alert tone="info">La fila digital no está activa ahora. Pregunta en el mostrador.</Alert></div>
  }

  return (
    <div className="page stack">
      <Link to="/" className="btn icon ghost" aria-label="Ir al inicio"><IconChevronLeft /></Link>
      <h1>Anótate en la fila</h1>
      <p className="ink2">Te avisamos en esta pantalla cuántos hay antes que tú. Puedes esperar afuera o tomar algo.</p>
      <form className="stack" onSubmit={join} noValidate>
        <Field label="Tu nombre" error={errors.name}><input maxLength={60} value={name} onChange={(e) => { setName(e.target.value); setErrors({ ...errors, name: '' }) }} autoComplete="name" /></Field>
        <Field label="Tu celular (opcional)" error={errors.phone} hint="Para que el barbero pueda escribirte si sales un momento.">
          <input inputMode="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setErrors({ ...errors, phone: '' }) }} autoComplete="tel" placeholder="70012345" />
        </Field>
        <div className="stack tight">
          <span className="small ink2" style={{ fontWeight: 550 }}>¿Con quién?</span>
          <div className="list">
            <button type="button" className="item" aria-pressed={barber === ''} onClick={() => setBarber('')}>
              <span className="monogram" aria-hidden>?</span><span className="grow title">El primero que se libere</span>
            </button>
            {barbers.map((b) => (
              <button key={b.id} type="button" className="item" aria-pressed={barber === b.id} onClick={() => setBarber(b.id)}>
                <span className="monogram" aria-hidden>{initials(b.full_name)}</span><span className="grow title">{b.full_name}</span>
              </button>
            ))}
          </div>
        </div>
        {error && <Alert tone="bad">{error}</Alert>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Anotando…' : 'Anotarme'}</button>
      </form>
    </div>
  )
}

interface Pos { id: string; name: string; status: 'waiting' | 'serving' | 'done' | 'left'; barber: string | null; ahead: number; wait_minutes: number }

/** /fila/:id: el cliente ve su lugar; se actualiza cada 15 segundos */
export function QueueStatus() {
  const { id } = useParams()
  const nav = useNavigate()
  const [p, setP] = useState<Pos | null | undefined>(undefined)

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('queue_position', { p_id: id })
    setP((data as Pos | null) ?? null)
  }, [id])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 15000)
    return () => clearInterval(t)
  }, [load])

  const forget = () => { localStorage.removeItem('bc_queue'); nav('/fila', { replace: true }) }
  const leave = async () => {
    if (!confirm('¿Salir de la fila?')) return
    await supabase.rpc('leave_queue', { p_id: id })
    localStorage.removeItem('bc_queue')
    void load()
  }

  if (p === undefined) return <div className="page"><Spinner rows={2} /></div>
  if (p === null) return <div className="page stack"><Alert tone="bad">No encontramos tu lugar en la fila.</Alert><button className="btn block" onClick={forget}>Anotarme de nuevo</button></div>

  return (
    <div className="page stack">
      <h1>Hola, {p.name.split(' ')[0]}</h1>
      {p.status === 'waiting' && (
        <section className="panel stack center">
          {p.ahead === 0 ? (
            <>
              <div style={{ fontSize: '3.5rem', fontWeight: 800, fontStretch: '62%', lineHeight: 1 }}>Sigues tú</div>
              <p className="ink2">Quédate cerca: en cuanto se libere {p.barber ?? 'un barbero'}, te llaman.</p>
            </>
          ) : (
            <>
              <div className="num" style={{ fontSize: '5rem', fontWeight: 800, fontStretch: '62%', lineHeight: 1 }}>{p.ahead}</div>
              <p className="ink2">{p.ahead === 1 ? 'persona antes que tú' : 'personas antes que tú'}{p.barber ? ` para ${p.barber}` : ''}.</p>
              <p className="muted small">Espera aproximada: {p.wait_minutes} min. Se actualiza sola.</p>
            </>
          )}
        </section>
      )}
      {p.status === 'serving' && <Alert tone="ok">¡Te toca! Pasa con {p.barber ?? 'tu barbero'}.</Alert>}
      {p.status === 'done' && <Alert tone="ok">¡Gracias por venir! Te esperamos la próxima.</Alert>}
      {p.status === 'left' && <Alert tone="info">Saliste de la fila.</Alert>}
      <div className="pole" aria-hidden />
      {p.status === 'waiting'
        ? <button className="btn danger ghost block" onClick={() => void leave()}>Salir de la fila</button>
        : <button className="btn block" onClick={forget}>Volver a anotarme</button>}
      <Link className="btn ghost block" to="/reservar">Mejor reservo un horario</Link>
    </div>
  )
}
