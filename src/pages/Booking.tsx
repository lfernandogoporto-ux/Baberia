import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, errMsg, publicUrl } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Barber, CatalogItem } from '../lib/types'
import { addDays, dateTimeLabel, dayLabel, mins, money, normPhone, time, todayStr } from '../lib/format'
import { Alert, Empty, Field, GroupError, Spinner, initials } from '../components/ui'
import { clean, focusFirstError, isValid, personName, phoneBO, type Errors } from '../lib/validate'
import { IconCalendar, IconCheck, IconChevronLeft, IconChevronRight, IconStar } from '../components/icons'

type Hold = { id: string; expires: number; total: number; startsAt: string }

/** Cuenta regresiva con la franja del poste girando y acortándose */
function HoldTimer({ hold, onEnd }: { hold: Hold; onEnd: () => void }) {
  const [left, setLeft] = useState(Math.max(0, hold.expires - Date.now()))
  useEffect(() => {
    const id = setInterval(() => {
      const l = Math.max(0, hold.expires - Date.now())
      setLeft(l)
      if (l === 0) onEnd()
    }, 500)
    return () => clearInterval(id)
  }, [hold.expires, onEnd])
  const s = Math.ceil(left / 1000)
  return (
    <div className="stack tight">
      <div className="row between small">
        <span className="ink2">Te guardamos este horario</span>
        <b className="num">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</b>
      </div>
      <div className="pole-timer" role="progressbar" aria-label="Tiempo para confirmar" aria-valuemin={0} aria-valuemax={hold.total} aria-valuenow={left}>
        <div className="pole thick" style={{ transform: `scaleX(${left / hold.total})` }} />
      </div>
    </div>
  )
}

const partOfDay = (iso: string) => {
  const h = Number(time(iso).slice(0, 2))
  return h < 12 ? 'Mañana' : h < 18 ? 'Tarde' : 'Noche'
}

export default function Booking() {
  const nav = useNavigate()
  const { settings } = useAuth()
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0)
  const [barbers, setBarbers] = useState<Barber[] | null>(null)
  const [barber, setBarber] = useState<Barber | null>(null)
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [date, setDate] = useState(todayStr())
  const [slots, setSlots] = useState<string[] | null>(null)
  const [hold, setHold] = useState<Hold | null>(null)
  const [expired, setExpired] = useState(false)
  const [name, setName] = useState(() => localStorage.getItem('bc_name') ?? '')
  const [phone, setPhone] = useState(() => localStorage.getItem('bc_phone') ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<Errors<'name' | 'phone'>>({})
  const [servicesError, setServicesError] = useState('')
  const holdRef = useRef<Hold | null>(null)
  holdRef.current = hold
  const [params] = useSearchParams()
  const [anyBarber, setAnyBarber] = useState(false)
  const [first, setFirst] = useState<{ barber_id: string; full_name: string; slot_start: string } | null | undefined>(undefined)

  const chosen = useMemo(() => (catalog ?? []).filter((c) => picked.includes(c.service_id)), [catalog, picked])
  const totalMin = chosen.reduce((a, c) => a + c.minutes, 0)
  const totalPrice = chosen.reduce((a, c) => a + Number(c.price), 0)
  const days = useMemo(() => Array.from({ length: Math.min(settings?.max_days_ahead ?? 14, 14) + 1 }, (_, i) => addDays(todayStr(), i)), [settings])
  const grouped = useMemo(() => {
    const g: Record<string, string[]> = {}
    ;(slots ?? []).forEach((s) => (g[partOfDay(s)] ??= []).push(s))
    return Object.entries(g)
  }, [slots])

  // Con cuenta de cliente, los datos se completan solos
  const { profile } = useAuth()
  useEffect(() => {
    if (profile?.role !== 'client') return
    setName((n) => n || profile.full_name)
    setPhone((p) => p || (profile.phone ?? '').replace(/\D/g, '').replace(/^591/, ''))
  }, [profile])

  useEffect(() => {
    void supabase.rpc('list_barbers').then(({ data, error }) => {
      if (error) setError(errMsg(error))
      const list = (data as Barber[]) ?? []
      setBarbers(list)
      // Viene del inicio ("reservar con este barbero") o de "repetir mi corte"
      const pre = list.find((b) => b.id === params.get('barbero'))
      if (pre) void chooseBarber(pre, params.get('servicios')?.split(',').filter(Boolean) ?? [])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Al salir de la pantalla se libera el horario retenido
  useEffect(() => () => {
    if (holdRef.current) void supabase.rpc('release_hold', { p_appointment: holdRef.current.id })
  }, [])

  const releaseHold = async () => {
    if (holdRef.current) await supabase.rpc('release_hold', { p_appointment: holdRef.current.id })
    setHold(null)
    setExpired(false)
  }

  const chooseBarber = async (b: Barber, preset: string[] = []) => {
    setAnyBarber(false)
    setBarber(b)
    setCatalog(null)
    setPicked([])
    setStep(1)
    const { data, error } = await supabase.rpc('barber_service_catalog', { p_barber: b.id })
    if (error) setError(errMsg(error))
    const list = (data as CatalogItem[]) ?? []
    setCatalog(list)
    if (preset.length) setPicked(preset.filter((id) => list.some((c) => c.service_id === id)))
  }

  // Cualquier barbero: se usan los servicios con su precio y tiempo normales
  const chooseAny = async () => {
    setAnyBarber(true)
    setBarber(null)
    setCatalog(null)
    setPicked([])
    setStep(1)
    const { data, error } = await supabase.from('services').select('id,name,category,description,base_price,base_minutes').eq('active', true).order('sort_order')
    if (error) setError(errMsg(error))
    setCatalog(((data ?? []) as { id: string; name: string; category: string; description: string | null; base_price: number; base_minutes: number }[])
      .map((s) => ({ service_id: s.id, name: s.name, category: s.category, description: s.description, price: s.base_price, minutes: s.base_minutes })))
  }

  const findFirst = async () => {
    setFirst(undefined)
    const { data, error } = await supabase.rpc('first_available', { p_minutes: totalMin, p_days: Math.min(settings?.max_days_ahead ?? 14, 14) })
    if (error) setError(errMsg(error))
    setFirst(((data as { barber_id: string; full_name: string; slot_start: string }[]) ?? [])[0] ?? null)
  }

  const loadSlots = async (d: string) => {
    if (!barber || !totalMin) return
    setSlots(null)
    setError('')
    const { data, error } = await supabase.rpc('get_available_slots', { p_barber: barber.id, p_date: d, p_minutes: totalMin })
    if (error) setError(errMsg(error))
    setSlots(((data as { slot_start: string }[]) ?? []).map((r) => r.slot_start))
  }

  useEffect(() => {
    if (step === 2) void (anyBarber ? findFirst() : loadSlots(date))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, date])

  const pickSlot = async (iso: string, who: Barber | null = barber) => {
    if (!who) return
    setBusy(true)
    setError('')
    try {
      await releaseHold()
      if (who !== barber) setBarber(who)
      const { data: id, error } = await supabase.rpc('hold_slot', { p_barber: who.id, p_start: iso, p_service_ids: picked })
      if (error) throw error
      const { data: b } = await supabase.rpc('get_booking', { p_appointment: id })
      const fallback = (settings?.hold_minutes ?? 5) * 60000
      const exp = b?.hold_expires_at ? new Date(b.hold_expires_at as string).getTime() : Date.now() + fallback
      setHold({ id: id as string, expires: exp, total: Math.max(1, exp - Date.now()), startsAt: iso })
      setStep(3)
    } catch (e) {
      setError(errMsg(e))
      void loadSlots(date)
    } finally {
      setBusy(false)
    }
  }

  const confirm = async (e: FormEvent) => {
    e.preventDefault()
    if (!hold) return
    const errs = clean({ name: personName(name), phone: phoneBO(phone) })
    setErrors(errs)
    if (!isValid(errs)) return focusFirstError()
    setBusy(true)
    setError('')
    try {
      const { error } = await supabase.rpc('confirm_booking', { p_appointment: hold.id, p_name: name.trim(), p_phone: normPhone(phone) })
      if (error) throw error
      localStorage.setItem('bc_name', name.trim())
      localStorage.setItem('bc_phone', phone.trim())
      const id = hold.id
      holdRef.current = null // ya es una reserva: no se libera al salir
      nav(`/reserva/${id}`, { replace: true })
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  const back = async () => {
    setError('')
    if (step === 3) {
      await releaseHold()
      setStep(2)
    } else if (step > 0) setStep((step - 1) as 0 | 1 | 2)
  }

  const titles = ['¿Con quién te cortas?', '¿Qué te hacemos?', '¿Cuándo vienes?', 'Confirma tu reserva']

  return (
    <div className="page stack">
      <div className="row between">
        {step === 0
          ? <Link to="/" className="btn icon ghost" aria-label="Volver al inicio"><IconChevronLeft /></Link>
          : <button className="btn icon ghost" onClick={() => void back()} aria-label="Paso anterior"><IconChevronLeft /></button>}
        <span className="muted small">Paso {step + 1} de 4</span>
      </div>
      <div className="steps" aria-hidden>{[0, 1, 2, 3].map((i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
      <h1>{titles[step]}</h1>

      {error && <Alert tone="bad">{error}</Alert>}

      {step === 0 && (
        !barbers ? <Spinner /> : barbers.length === 0 ? (
          <div className="panel"><Empty title="Aún no hay barberos con agenda">Vuelve a intentarlo más tarde o llama a la barbería.</Empty></div>
        ) : (
          <div className="list">
            {barbers.length > 1 && (
              <button className="item" onClick={() => void chooseAny()}>
                <span className="monogram" aria-hidden>?</span>
                <span className="grow"><span className="title">El primero que esté libre</span><span className="sub" style={{ display: 'block' }}>Te mostramos el horario más cercano con cualquier barbero</span></span>
                <IconChevronRight className="muted" />
              </button>
            )}
            {barbers.map((b) => (
              <button key={b.id} className="item" onClick={() => void chooseBarber(b)} style={{ alignItems: b.photos?.length ? 'flex-start' : 'center' }}>
                <span className="monogram" aria-hidden>{initials(b.full_name)}</span>
                <span className="grow stack tight" style={{ minWidth: 0 }}>
                  <span className="title">{b.full_name}</span>
                  {b.rating != null && Number(b.ratings_count) > 0 && (
                    <span className="sub row" style={{ gap: 4 }}>
                      <IconStar size={15} filled style={{ color: 'var(--copper)' }} />{Number(b.rating).toFixed(1)} de {b.ratings_count} {Number(b.ratings_count) === 1 ? 'opinión' : 'opiniones'}
                    </span>
                  )}
                  {!!b.photos?.length && (
                    <span className="thumbs">{b.photos.map((p) => <img key={p} src={publicUrl(p) ?? ''} alt="" loading="lazy" />)}</span>
                  )}
                </span>
                <IconChevronRight className="muted" />
              </button>
            ))}
          </div>
        )
      )}

      {step === 1 && (
        <>
          <p className="ink2">{anyBarber ? 'Con el primero que esté libre' : `Con ${barber?.full_name}`}. Puedes elegir varios servicios.</p>
          {!catalog ? <Spinner rows={4} /> : (
            <div className="list">
              {catalog.map((c) => {
                const on = picked.includes(c.service_id)
                return (
                  <button key={c.service_id} className="item" aria-pressed={on}
                    onClick={() => { setServicesError(''); setPicked(on ? picked.filter((x) => x !== c.service_id) : [...picked, c.service_id]) }}>
                    <span className="tick"><IconCheck size={16} strokeWidth={2.5} /></span>
                    <span className="grow">
                      <span className="title">{c.name}</span>
                      <span className="sub" style={{ display: 'block' }}>Unos {mins(c.minutes)}</span>
                    </span>
                    <span className="price">{money(c.price)}</span>
                  </button>
                )
              })}
            </div>
          )}
          {servicesError && <GroupError>{servicesError}</GroupError>}
          <div className="sumbar">
            <div className="grow">
              <div className="total">{money(totalPrice)}</div>
              <div className="muted small">{chosen.length ? `Unos ${mins(totalMin)}` : 'Elige al menos uno'}</div>
            </div>
            <button className="btn primary" onClick={() => {
              if (!picked.length) return setServicesError('Elige al menos un servicio para ver los horarios')
              setServicesError('')
              setStep(2)
            }}>Ver horarios</button>
          </div>
        </>
      )}

      {step === 2 && anyBarber && (
        <>
          <p className="ink2">{chosen.map((c) => c.name.toLowerCase()).join(' y ')}, unos {mins(totalMin)}.</p>
          {first === undefined ? <Spinner rows={2} /> : first === null ? (
            <div className="panel"><Empty icon={<IconCalendar size={28} />} title="No hay horarios libres en los próximos días">Prueba eligiendo un barbero o llama a la barbería.</Empty></div>
          ) : (
            <div className="panel stack">
              <span className="muted small">Lo más pronto posible</span>
              <b style={{ fontSize: '1.2rem' }}>{dateTimeLabel(first.slot_start)}</b>
              <span className="ink2">con {first.full_name}</span>
              <button className="btn primary block" disabled={busy} onClick={() => void pickSlot(first.slot_start, { id: first.barber_id, full_name: first.full_name, avatar_url: null })}>Reservar este horario</button>
            </div>
          )}
          <button className="btn ghost block" onClick={() => { setAnyBarber(false); setStep(0) }}>Prefiero elegir barbero y hora</button>
        </>
      )}

      {step === 2 && !anyBarber && (
        <>
          <p className="ink2">{barber?.full_name}, {chosen.map((c) => c.name.toLowerCase()).join(' y ')}, unos {mins(totalMin)}.</p>
          <div className="days" role="tablist" aria-label="Día">
            {days.map((d) => (
              <button key={d} role="tab" aria-selected={d === date} className="day" onClick={() => setDate(d)}>
                <span className="dw">{d === todayStr() ? 'Hoy' : dayLabel(d, { weekday: 'short' }).replace('.', '')}</span>
                <span className="dn">{Number(d.slice(8))}</span>
              </button>
            ))}
          </div>
          {slots === null ? <Spinner rows={2} /> : slots.length === 0 ? (
            <div className="panel">
              <Empty icon={<IconCalendar size={28} />} title={`Sin horarios libres el ${dayLabel(date, { weekday: 'long', day: 'numeric' })}`}>
                Prueba otro día o elige a otro barbero.
              </Empty>
            </div>
          ) : grouped.map(([part, list]) => (
            <section key={part} className="slot-group">
              <h3>{part}</h3>
              <div className="slots">
                {list.map((s) => <button key={s} className="slot" disabled={busy} onClick={() => void pickSlot(s)}>{time(s)}</button>)}
              </div>
            </section>
          ))}
        </>
      )}

      {step === 3 && hold && (
        <form className="stack" onSubmit={confirm} noValidate>
          <div className="panel stack tight">
            <div className="row">
              <span className="monogram" aria-hidden>{initials(barber?.full_name ?? '')}</span>
              <div className="grow">
                <div className="title" style={{ fontWeight: 650 }}>{dateTimeLabel(hold.startsAt)}</div>
                <div className="muted small">Con {barber?.full_name}</div>
              </div>
            </div>
            <div className="row between small" style={{ marginTop: 6 }}>
              <span className="ink2">{chosen.map((c) => c.name).join(' + ')}</span>
              <b className="num">{money(totalPrice)}</b>
            </div>
          </div>
          {expired
            ? <Alert tone="warn">Se acabó el tiempo y el horario quedó libre otra vez. Elige otro.</Alert>
            : <HoldTimer hold={hold} onEnd={() => setExpired(true)} />}
          {expired ? (
            <button type="button" className="btn primary block" onClick={() => void back()}>Elegir otro horario</button>
          ) : (
            <>
              <Field label="Tu nombre" error={errors.name}>
                <input value={name} onChange={(e) => { setName(e.target.value); setErrors({ ...errors, name: '' }) }} autoComplete="name" />
              </Field>
              <Field label="Tu celular" error={errors.phone} hint="Lo usamos para avisarte y para que puedas cancelar.">
                <input value={phone} onChange={(e) => { setPhone(e.target.value); setErrors({ ...errors, phone: '' }) }} inputMode="tel" autoComplete="tel" placeholder="70012345" />
              </Field>
              <button className="btn primary block" disabled={busy}>{busy ? 'Confirmando…' : 'Confirmar reserva'}</button>
            </>
          )}
        </form>
      )}
    </div>
  )
}
