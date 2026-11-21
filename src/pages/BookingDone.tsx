import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, errMsg, publicUrl } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { dateTimeLabel, mins, money, normPhone } from '../lib/format'
import { clean, fileImage, focusFirstError, isValid, number, phoneBO, type Errors } from '../lib/validate'
import { Alert, Field, GroupError, Spinner, StatusBadge } from '../components/ui'
import { IconBell, IconStar, IconUpload } from '../components/icons'
import { enableBookingPush, pushSupported } from '../lib/push'
import type { Status } from '../lib/types'

interface Booking {
  id: string
  status: Status
  starts_at: string
  ends_at: string
  total_price: number
  barber: string
  services: { name: string; price: number; minutes: number }[]
  stars: number | null
  card_token: string | null
  mine: boolean
  linked: boolean
}

type K = 'phone' | 'amount' | 'file' | 'stars'

export default function BookingDone() {
  const { id } = useParams()
  const { settings, profile } = useAuth()
  const [b, setB] = useState<Booking | null | undefined>(undefined)
  const [phone, setPhone] = useState(() => localStorage.getItem('bc_phone') ?? '')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [amount, setAmount] = useState('')
  const [payOpen, setPayOpen] = useState(false)
  const [stars, setStars] = useState(0)
  const [comment, setComment] = useState('')
  const [reminded, setReminded] = useState(false)
  const [errors, setErrors] = useState<Errors<K>>({})

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('get_booking', { p_appointment: id })
    setB((data as Booking | null) ?? null)
  }, [id])
  useEffect(() => { void load() }, [load])

  if (b === undefined) return <div className="page"><Spinner /></div>
  if (b === null) return (
    <div className="page stack">
      <Alert tone="bad">No encontramos esta reserva. Revisa que el enlace esté completo.</Alert>
      <Link className="btn block" to="/">Ir al inicio</Link>
    </div>
  )

  // Si la reserva es de la cuenta abierta, no hace falta escribir el celular
  const needPhone = !b.mine
  const phoneErr = () => (needPhone ? phoneBO(phone) : '')
  const clear = (k: K) => errors[k] && setErrors({ ...errors, [k]: '' })

  const remind = async () => {
    try {
      await enableBookingPush(b.id)
      setReminded(true)
      setMsg({ ok: true, text: `Listo: te avisamos ${settings?.reminder_minutes ?? 30} minutos antes en este celular.` })
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) })
    }
  }

  const claim = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('claim_booking', { p_appointment: b.id })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: errMsg(error) })
    setMsg({ ok: true, text: 'Listo: esta reserva y tu historial quedaron en tu cuenta.' })
    void load()
  }

  const rate = async (e: FormEvent) => {
    e.preventDefault()
    const errs = clean<K>({ stars: stars ? '' : 'Elige de 1 a 5 estrellas', phone: phoneErr() })
    setErrors(errs)
    if (!isValid(errs)) return focusFirstError()
    setBusy(true)
    const { error } = await supabase.rpc('rate_appointment', { p_appointment: b.id, p_phone: normPhone(phone), p_stars: stars, p_comment: comment })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: errMsg(error) })
    setMsg({ ok: true, text: '¡Gracias por tu calificación!' })
    void load()
  }

  const qr = publicUrl(settings?.qr_image_path)
  const active = b.status === 'confirmed' || b.status === 'pending'

  const cancel = async () => {
    const errs = clean<K>({ phone: phoneErr() })
    setErrors(errs)
    if (!isValid(errs)) return focusFirstError()
    if (!confirm('¿Seguro que quieres cancelar tu reserva?')) return
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.rpc('cancel_booking', { p_appointment: id, p_phone: normPhone(phone) })
    setBusy(false)
    if (error) setMsg({ ok: false, text: errMsg(error) })
    else { setMsg({ ok: true, text: 'Reserva cancelada. El horario quedó libre.' }); void load() }
  }

  const sendProof = async (e: FormEvent) => {
    e.preventDefault()
    const errs = clean<K>({
      phone: phoneErr(),
      amount: number(amount === '' ? b.total_price : amount, { min: 1, max: 5000, label: 'El monto' }),
      file: fileImage(file, { pdf: true }),
    })
    setErrors(errs)
    if (!isValid(errs) || !file) return focusFirstError()
    setBusy(true)
    setMsg(null)
    try {
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
      const path = `${id}/${crypto.randomUUID()}.${ext}`
      const up = await supabase.storage.from('proofs').upload(path, file, { contentType: file.type })
      if (up.error) throw up.error
      const { error } = await supabase.rpc('submit_payment_proof', {
        p_appointment: id, p_phone: normPhone(phone), p_proof_path: path, p_amount: Number(amount || b.total_price), p_method: 'qr',
      })
      if (error) throw error
      setMsg({ ok: true, text: 'Comprobante enviado. La barbería lo revisará antes de tu cita.' })
      setFile(null)
      setPayOpen(false)
    } catch (err) {
      setMsg({ ok: false, text: errMsg(err) })
    } finally {
      setBusy(false)
    }
  }

  const phoneField = needPhone && (
    <Field label="Tu celular" error={errors.phone} hint="El mismo con el que reservaste.">
      <input value={phone} onChange={(e) => { setPhone(e.target.value); clear('phone') }} inputMode="tel" autoComplete="tel" placeholder="70012345" />
    </Field>
  )

  return (
    <div className="page stack">
      <div className="stack tight">
        <StatusBadge status={b.status} />
        <h1>{active ? 'Tu lugar está reservado' : b.status === 'cancelled' ? 'Reserva cancelada' : 'Tu reserva'}</h1>
      </div>

      <div className="list">
        <div className="item" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <div className="title" style={{ fontSize: '1.15rem' }}>{dateTimeLabel(b.starts_at)}</div>
            <div className="sub">Con {b.barber}</div>
          </div>
        </div>
        {b.services.map((s, i) => (
          <div key={i} className="item" style={{ minHeight: 52 }}>
            <span className="grow">{s.name} <span className="muted small">unos {mins(s.minutes)}</span></span>
            <span className="price">{money(s.price)}</span>
          </div>
        ))}
        <div className="item" style={{ minHeight: 52 }}>
          <b className="grow">Total a pagar</b>
          <b className="price">{money(b.total_price)}</b>
        </div>
      </div>

      {active && !b.mine && <p className="muted small">Guarda este enlace: con él puedes ver o cancelar tu reserva. Llega unos minutos antes.</p>}
      {msg && <Alert tone={msg.ok ? 'ok' : 'bad'}>{msg.text}</Alert>}

      {profile?.role === 'client' && !b.mine && !b.linked && (
        <button className="btn block" disabled={busy} onClick={() => void claim()}>Guardar esta reserva en mi cuenta</button>
      )}
      {!profile && (
        <p className="ink2 small"><Link to="/cuenta">Crea tu cuenta</Link> para ver todas tus reservas y tu tarjeta de sellos en un solo lugar.</p>
      )}

      {active && pushSupported() && !reminded && (
        <button className="btn block" onClick={() => void remind()}><IconBell size={20} />Avisarme {settings?.reminder_minutes ?? 30} min antes</button>
      )}

      {b.status === 'completed' && (
        b.stars ? (
          <p className="ink2 row" style={{ gap: 4 }}>Tu calificación:{Array.from({ length: b.stars }, (_, i) => <IconStar key={i} size={18} filled style={{ color: 'var(--warn)' }} />)}</p>
        ) : (
          <form className="panel stack" onSubmit={rate} noValidate>
            <h2>¿Cómo te fue con {b.barber.split(' ')[0]}?</h2>
            <div className={`stack tight ${errors.stars ? 'field invalid' : ''}`}>
              <div className="row" role="radiogroup" aria-label="Calificación">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`}
                    className="btn icon ghost" style={{ color: n <= stars ? 'var(--warn)' : 'var(--muted)' }} onClick={() => { setStars(n); clear('stars') }}>
                    <IconStar size={30} filled={n <= stars} />
                  </button>
                ))}
              </div>
              {errors.stars && <GroupError>{errors.stars}</GroupError>}
            </div>
            <Field label="Comentario (opcional)" hint="Máximo 500 caracteres."><textarea rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
            {phoneField}
            <button className="btn primary block" disabled={busy}>Enviar calificación</button>
          </form>
        )
      )}

      {b.card_token && <Link className="btn block" to={`/tarjeta/${b.card_token}`}>Ver mi tarjeta de sellos</Link>}

      {active && (
        <>
          {!payOpen && phoneField}
          {!payOpen ? (
            <button className="btn block" onClick={() => setPayOpen(true)}>Pagar por adelantado con QR</button>
          ) : (
            <form className="panel stack" onSubmit={sendProof} noValidate>
              <h3>Pago por adelantado</h3>
              <p className="ink2 small">Es opcional: también puedes pagar en el local. Escanea el QR, paga y sube la foto del comprobante.</p>
              {qr
                ? <img src={qr} alt="QR de pago de la barbería" style={{ width: '100%', maxWidth: 240, margin: '0 auto', borderRadius: 12, background: '#fff', padding: 8 }} />
                : <Alert tone="info">La barbería todavía no subió su QR. Paga en el local.</Alert>}
              <Field label="Monto que pagaste (Bs)" error={errors.amount} hint={`Si lo dejas vacío, se toma el total: ${money(b.total_price)}.`}>
                <input type="number" inputMode="decimal" min="1" step="0.5" value={amount} placeholder={String(b.total_price)} onChange={(e) => { setAmount(e.target.value); clear('amount') }} />
              </Field>
              <Field label="Foto del comprobante" error={errors.file} hint="Foto o PDF de hasta 5 MB.">
                <input type="file" accept="image/*,application/pdf" onChange={(e) => { setFile(e.target.files?.[0] ?? null); clear('file') }} />
              </Field>
              {phoneField}
              <button className="btn primary block" disabled={busy}><IconUpload size={20} />Enviar comprobante</button>
            </form>
          )}
          <button className="btn danger ghost block" disabled={busy} onClick={() => void cancel()}>Cancelar mi reserva</button>
        </>
      )}
      <Link className="btn ghost block" to={profile?.role === 'client' ? '/cuenta' : '/'}>{profile?.role === 'client' ? 'Ir a mi cuenta' : 'Ir al inicio'}</Link>
    </div>
  )
}
