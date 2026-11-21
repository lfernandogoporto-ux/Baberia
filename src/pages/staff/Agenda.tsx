import { useCallback, useEffect, useState } from 'react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import type { Appointment, CatalogItem, PayMethod, Profile, QueueEntry, Status } from '../../lib/types'
import { addDays, dayLabel, dayRange, mins, money, normPhone, time, todayStr } from '../../lib/format'
import { Alert, Empty, Field, GroupError, Modal, Spinner, StatusBadge, useToast } from '../../components/ui'
import { clean, fileImage, focusFirstError, isValid, number, phoneBO, type Errors } from '../../lib/validate'
import { IconCalendar, IconChat, IconCheck, IconChevronLeft, IconChevronRight, IconPlus, IconQueue, IconX } from '../../components/icons'

const SELECT =
  'id,barber_id,client_id,photo_path,starts_at,ends_at,status,source,total_price,actual_started_at,clients(full_name,phone,no_shows,no_shows_forgiven),appointment_items(name,price,minutes),payments(id,appointment_id,amount,method,status,proof_path,created_at)'

const METHODS: [PayMethod, string][] = [['cash', 'Efectivo'], ['qr', 'QR'], ['transfer', 'Transferencia']]

export default function Agenda() {
  const { profile, isFrontDesk, settings } = useAuth()
  const toast = useToast()
  const [barbers, setBarbers] = useState<Profile[]>([])
  const [barberId, setBarberId] = useState<string>('')
  const [date, setDate] = useState(todayStr())
  const [items, setItems] = useState<Appointment[] | null>(null)
  const [now, setNow] = useState(Date.now())
  const [walkIn, setWalkIn] = useState(false)
  const [finishing, setFinishing] = useState<Appointment | null>(null)

  useEffect(() => {
    void supabase.from('profiles').select('*').eq('is_barber', true).eq('active', true).order('full_name').then(({ data }) => {
      const list = (data as Profile[]) ?? []
      setBarbers(list)
      setBarberId((cur) => cur || (list.find((b) => b.id === profile?.id)?.id ?? list[0]?.id ?? ''))
    })
  }, [profile?.id])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  const [queue, setQueue] = useState<QueueEntry[]>([])
  const [serving, setServing] = useState<QueueEntry | null>(null)
  const cacheKey = `bc_agenda_${barberId}_${date}`

  const load = useCallback(async () => {
    if (!barberId) return setItems([])
    const { from, to } = dayRange(date)
    const { data, error } = await supabase.from('appointments').select(SELECT).eq('barber_id', barberId)
      .gte('starts_at', from).lt('starts_at', to).not('status', 'in', '(held,cancelled)').order('starts_at')
    if (error) {
      // Sin internet: se muestra lo último que se cargó en este celular
      const cached = localStorage.getItem(cacheKey)
      if (cached) return setItems(JSON.parse(cached) as Appointment[])
      toast(errMsg(error), true)
    }
    const list = (data as unknown as Appointment[]) ?? []
    try { localStorage.setItem(cacheKey, JSON.stringify(list)) } catch { /* sin espacio: no pasa nada */ }
    setItems(list)
  }, [barberId, date, toast, cacheKey])

  const loadQueue = useCallback(async () => {
    if (!settings?.queue_enabled) return setQueue([])
    const { data } = await supabase.from('queue_entries').select('*').eq('status', 'waiting').order('created_at')
    setQueue((data as QueueEntry[]) ?? [])
  }, [settings?.queue_enabled])

  useEffect(() => { setItems(null); void load() }, [load])
  useEffect(() => { void loadQueue() }, [loadQueue])

  // Se actualiza sola cuando alguien reserva, cobra, cambia una cita o se anota en la fila
  useEffect(() => {
    const ch = supabase.channel(`agenda-${barberId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_entries' }, () => void loadQueue())
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [barberId, load, loadQueue])

  const dropFromQueue = async (q: QueueEntry) => {
    if (!confirm(`¿Quitar a ${q.name} de la fila?`)) return
    const { error } = await supabase.from('queue_entries').update({ status: 'left', updated_at: new Date().toISOString() }).eq('id', q.id)
    if (error) toast(errMsg(error), true)
    else void loadQueue()
  }

  const setStatus = async (a: Appointment, status: Status, done?: string) => {
    const { error } = await supabase.from('appointments').update({ status }).eq('id', a.id)
    if (error) toast(errMsg(error), true)
    else {
      if (done) toast(done)
      void load()
    }
  }

  const isToday = date === todayStr()
  const threshold = settings?.no_show_warning_threshold ?? 3
  const active = (items ?? []).filter((a) => a.status !== 'no_show')
  const dayTotal = (items ?? []).filter((a) => a.status === 'completed').reduce((s, a) => s + Number(a.total_price), 0)
  const barberName = barbers.find((b) => b.id === barberId)?.full_name

  return (
    <div className="page stack">
      <div className="row between">
        <h1>Agenda</h1>
        {isToday && barberId && (
          <button className="btn primary" onClick={() => setWalkIn(true)}><IconPlus size={20} />Atender ahora</button>
        )}
      </div>

      {isFrontDesk && barbers.length > 1 && (
        <div className="seg" role="tablist" aria-label="Barbero">
          {barbers.map((b) => (
            <button key={b.id} role="tab" aria-selected={b.id === barberId} className="chip" onClick={() => setBarberId(b.id)}>{b.full_name}</button>
          ))}
        </div>
      )}

      <div className="datebar">
        <button className="btn icon" onClick={() => setDate(addDays(date, -1))} aria-label="Día anterior"><IconChevronLeft /></button>
        <button className="btn ghost label" onClick={() => setDate(todayStr())} aria-label="Volver a hoy">
          <span>
            {isToday ? 'Hoy' : dayLabel(date, { weekday: 'long' })}
            <small>{dayLabel(date, { day: 'numeric', month: 'long' })}</small>
          </span>
        </button>
        <button className="btn icon" onClick={() => setDate(addDays(date, 1))} aria-label="Día siguiente"><IconChevronRight /></button>
      </div>

      {isToday && queue.length > 0 && (
        <section className="stack tight" aria-label="Fila de espera">
          <h2 className="row"><IconQueue size={22} />En la fila ({queue.length})</h2>
          <div className="list">
            {queue.map((q, i) => {
              const waited = Math.max(0, Math.round((now - new Date(q.created_at).getTime()) / 60000))
              const pref = barbers.find((b) => b.id === q.barber_id)?.full_name
              return (
                <div key={q.id} className="item">
                  <span className="monogram num" aria-hidden>{i + 1}</span>
                  <span className="grow">
                    <span className="title">{q.name}</span>
                    <span className="sub" style={{ display: 'block' }}>Espera hace {waited} min{pref ? `, quiere con ${pref}` : ''}</span>
                  </span>
                  <button className="btn small primary" onClick={() => setServing(q)}>Atender</button>
                  <button className="btn icon ghost" aria-label={`Quitar a ${q.name} de la fila`} onClick={() => void dropFromQueue(q)}><IconX size={18} /></button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {items && items.length > 0 && (
        <p className="ink2 small">
          {active.length} {active.length === 1 ? 'cita' : 'citas'}{barberName && isFrontDesk ? ` de ${barberName}` : ''}
          {dayTotal > 0 && <>, cobrado {money(dayTotal)}</>}
        </p>
      )}

      {items === null ? <Spinner rows={4} /> : items.length === 0 ? (
        <div className="panel">
          <Empty icon={<IconCalendar size={28} />} title={isToday ? 'Nadie reservó para hoy todavía' : 'No hay citas este día'}>
            {isToday ? 'Si llega alguien sin reserva, toca “Atender ahora”.' : 'Las reservas nuevas aparecen aquí al instante.'}
          </Empty>
        </div>
      ) : (
        <div className="timeline">
          {items.map((a) => {
            const faltas = (a.clients?.no_shows ?? 0) - (a.clients?.no_shows_forgiven ?? 0)
            const running = a.status === 'in_progress'
            const elapsed = running && a.actual_started_at ? Math.max(0, Math.round((now - new Date(a.actual_started_at).getTime()) / 60000)) : 0
            const estimated = Math.round((new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000)
            const paid = a.payments.filter((p) => p.status === 'confirmed').reduce((s, p) => s + Number(p.amount), 0)
            const closed = a.status === 'completed' || a.status === 'no_show'
            return (
              <article key={a.id} className={`slotrow ${running ? 'running' : ''} ${closed ? 'done' : ''}`}>
                <div className="t">{time(a.starts_at)}<small>hasta {time(a.ends_at)}</small></div>
                <div className="body">
                  <div className="row between" style={{ alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="name">{a.clients?.full_name ?? 'Cliente sin nombre'}</div>
                      <div className="muted small">{a.appointment_items.map((i) => i.name).join(' + ')}, {money(a.total_price)}</div>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                  <div className="row wrap" style={{ gap: 6 }}>
                    {a.source === 'walk_in' && <span className="badge">Sin reserva</span>}
                    {a.clients?.phone && (
                      <a className="badge teal" href={`https://wa.me/${a.clients.phone}`} target="_blank" rel="noreferrer"><IconChat size={14} />WhatsApp</a>
                    )}
                  </div>
                  {faltas >= threshold && <Alert tone="warn">Faltó {faltas} {faltas === 1 ? 'vez' : 'veces'} sin avisar.</Alert>}
                  {a.payments.some((p) => p.status === 'to_verify') && <Alert tone="info">Mandó un comprobante de pago. Revísalo en Pagos.</Alert>}
                  {running && (
                    <div className="row between small">
                      <span>Lleva <b className="num">{elapsed} min</b> de unos {estimated}</span>
                      {elapsed > estimated && <span className="badge warn">{elapsed - estimated} min de más</span>}
                    </div>
                  )}
                  {a.status === 'completed' && <div className="muted small">Cobrado {money(paid)}</div>}
                  <div className="actions">
                    {(a.status === 'pending' || a.status === 'confirmed') && (
                      <>
                        <button className="btn small primary" onClick={() => void setStatus(a, 'in_progress')}>Empezar corte</button>
                        <button className="btn small" onClick={() => void setStatus(a, 'no_show', 'Marcado como no llegó')}>No llegó</button>
                        <button className="btn small ghost danger" onClick={() => confirm('¿Cancelar esta cita? El horario quedará libre.') && void setStatus(a, 'cancelled', 'Cita cancelada')}>Cancelar</button>
                      </>
                    )}
                    {running && <button className="btn small primary" onClick={() => setFinishing(a)}><IconCheck size={18} />Terminar y cobrar</button>}
                    {a.status === 'no_show' && <button className="btn small" onClick={() => void setStatus(a, 'confirmed', 'Falta corregida')}>Sí llegó</button>}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {walkIn && <WalkInModal barbers={barbers} barberId={barberId} lockBarber={!isFrontDesk} onClose={() => setWalkIn(false)} onDone={() => { setWalkIn(false); void load() }} />}
      {serving && (
        <WalkInModal barbers={barbers} barberId={serving.barber_id && isFrontDesk ? serving.barber_id : barberId} lockBarber={!isFrontDesk} queue={serving}
          onClose={() => setServing(null)} onDone={() => { setServing(null); void load(); void loadQueue() }} />
      )}
      {finishing && <FinishModal a={finishing} onClose={() => setFinishing(null)} onDone={() => { setFinishing(null); toast('Corte terminado y cobrado'); void load() }} />}
    </div>
  )
}

function WalkInModal({ barbers, barberId, lockBarber, queue, onClose, onDone }: { barbers: Profile[]; barberId: string; lockBarber: boolean; queue?: QueueEntry; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [bid, setBid] = useState(barberId)
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null)
  const [picked, setPicked] = useState<string[]>(queue?.service_ids ?? [])
  const [name, setName] = useState(queue?.name ?? '')
  const [phone, setPhone] = useState(queue?.phone ?? '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setCatalog(null)
    void supabase.rpc('barber_service_catalog', { p_barber: bid }).then(({ data }) => {
      const list = (data as CatalogItem[]) ?? []
      setCatalog(list)
      setPicked((p) => p.filter((id) => list.some((c) => c.service_id === id)))
    })
  }, [bid])

  const chosen = (catalog ?? []).filter((c) => picked.includes(c.service_id))
  const total = chosen.reduce((s, c) => s + Number(c.price), 0)
  const minutes = chosen.reduce((s, c) => s + c.minutes, 0)

  const [errors, setErrors] = useState<Errors<'services' | 'name' | 'phone'>>({})
  const start = async () => {
    const errs = clean({
      services: picked.length ? '' : 'Elige al menos un servicio',
      name: !queue && name.trim() && name.trim().length < 2 ? 'El nombre es muy corto' : '',
      phone: !queue ? phoneBO(phone, true) : '',
    })
    setErrors(errs)
    if (!isValid(errs)) return focusFirstError()
    setBusy(true)
    const { data, error } = queue
      ? await supabase.rpc('serve_from_queue', { p_id: queue.id, p_barber: bid, p_service_ids: picked })
      : await supabase.rpc('start_walk_in', {
        p_barber: bid, p_service_ids: picked, p_name: name.trim() || null, p_phone: phone ? normPhone(phone) : null,
      })
    setBusy(false)
    if (error) return toast(errMsg(error), true)
    const r = data as { overlaps_next: boolean; next_appointment_at: string | null }
    if (r.overlaps_next && r.next_appointment_at) toast(`Ojo: tienes una cita a las ${time(r.next_appointment_at)} y este corte se cruza.`, true)
    else toast('Corte iniciado')
    onDone()
  }

  return (
    <Modal title={queue ? `Atender a ${queue.name}` : 'Cliente sin reserva'} onClose={onClose}>
      {!lockBarber && barbers.length > 1 && (
        <Field label="Lo atiende">
          <select value={bid} onChange={(e) => setBid(e.target.value)}>
            {barbers.map((b) => <option key={b.id} value={b.id}>{b.full_name}</option>)}
          </select>
        </Field>
      )}
      {!catalog ? <Spinner rows={4} /> : (
        <div className="list">
          {catalog.map((c) => {
            const on = picked.includes(c.service_id)
            return (
              <button key={c.service_id} className="item" aria-pressed={on}
                onClick={() => { setErrors({ ...errors, services: '' }); setPicked(on ? picked.filter((x) => x !== c.service_id) : [...picked, c.service_id]) }}>
                <span className="tick"><IconCheck size={16} strokeWidth={2.5} /></span>
                <span className="grow"><span className="title">{c.name}</span><span className="sub" style={{ display: 'block' }}>Unos {mins(c.minutes)}</span></span>
                <span className="price">{money(c.price)}</span>
              </button>
            )
          })}
        </div>
      )}
      {errors.services && <GroupError>{errors.services}</GroupError>}
      {!queue && (
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <Field label="Nombre (opcional)" error={errors.name}><input value={name} onChange={(e) => { setName(e.target.value); setErrors({ ...errors, name: '' }) }} autoComplete="off" /></Field>
          <Field label="Celular (opcional)" error={errors.phone}><input value={phone} onChange={(e) => { setPhone(e.target.value); setErrors({ ...errors, phone: '' }) }} inputMode="tel" autoComplete="off" placeholder="70012345" /></Field>
        </div>
      )}
      <div className="row between">
        <div>
          <div className="total num" style={{ fontWeight: 750, fontStretch: '78%', fontSize: '1.35rem' }}>{money(total)}</div>
          <div className="muted small">{minutes ? `Unos ${mins(minutes)}` : 'Elige qué se hace'}</div>
        </div>
        <button className="btn primary" disabled={busy} onClick={() => void start()}>Empezar corte</button>
      </div>
    </Modal>
  )
}

function FinishModal({ a, onClose, onDone }: { a: Appointment; onClose: () => void; onDone: () => void }) {
  const { profile, settings } = useAuth()
  const toast = useToast()
  const paid = a.payments.filter((p) => p.status === 'confirmed').reduce((s, p) => s + Number(p.amount), 0)
  const pending = Math.max(0, Number(a.total_price) - paid)
  const [method, setMethod] = useState<PayMethod>('cash')
  const [amount, setAmount] = useState(String(pending))
  const [stamp, setStamp] = useState(true)
  const [photo, setPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const canStamp = !!settings?.loyalty_enabled && !!a.client_id
  const [errors, setErrors] = useState<Errors<'amount' | 'photo'>>({})

  const finish = async () => {
    const errs = clean({
      amount: number(amount, { min: 0, max: Math.max(10000, Number(a.total_price) * 3), label: 'El monto' }),
      photo: fileImage(photo, { required: false }),
    })
    setErrors(errs)
    if (!isValid(errs)) return focusFirstError()
    setBusy(true)
    try {
      const amt = Number(amount)
      if (amt > 0) {
        const { error } = await supabase.from('payments').insert({
          appointment_id: a.id, amount: amt, method, status: 'confirmed',
          received_by: profile?.id, verified_by: profile?.id, verified_at: new Date().toISOString(),
        })
        if (error) throw error
      }
      let photo_path: string | undefined
      if (photo) {
        const ext = (photo.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
        const path = `${a.id}/${crypto.randomUUID()}.${ext}`
        const up = await supabase.storage.from('cuts').upload(path, photo, { contentType: photo.type })
        if (!up.error) photo_path = path
        else toast('La foto no se pudo subir, pero el corte se guarda igual', true)
      }
      const { error } = await supabase.from('appointments').update({ status: 'completed', ...(photo_path ? { photo_path } : {}) }).eq('id', a.id)
      if (error) throw error
      if (canStamp && stamp) {
        const { data, error: e2 } = await supabase.rpc('add_stamp', { p_client: a.client_id, p_appointment: a.id })
        if (e2) toast(errMsg(e2), true)
        else {
          const r = data as { stamps: number; required: number; completed: boolean; mid_reached: boolean; reward: string; mid_reward: string | null }
          toast(r.completed ? `¡Tarjeta llena! Le toca: ${r.reward}` : r.mid_reached && r.mid_reward ? `Sello ${r.stamps}/${r.required}: ganó ${r.mid_reward}` : `Sello ${r.stamps} de ${r.required}`)
        }
      }
      onDone()
    } catch (e) {
      toast(errMsg(e), true)
      setBusy(false)
    }
  }

  return (
    <Modal title="Terminar y cobrar" onClose={onClose}>
      <div className="list">
        <div className="item" style={{ minHeight: 52 }}><span className="grow">Total del corte</span><b className="price">{money(a.total_price)}</b></div>
        {paid > 0 && <div className="item" style={{ minHeight: 52 }}><span className="grow ink2">Ya pagó por adelantado</span><span className="price">{money(paid)}</span></div>}
      </div>
      <div className="stack tight">
        <span className="small ink2" style={{ fontWeight: 550 }}>¿Cómo pagó?</span>
        <div className="seg" role="radiogroup" aria-label="Forma de pago">
          {METHODS.map(([k, l]) => (
            <button key={k} role="radio" aria-checked={method === k} className={`chip ${method === k ? 'on' : ''}`} onClick={() => setMethod(k)}>{l}</button>
          ))}
        </div>
      </div>
      <Field label="Monto que cobras ahora (Bs)" error={errors.amount} hint={pending !== Number(amount) && amount !== '' ? `Falta cobrar ${money(pending)}.` : undefined}>
        <input type="number" inputMode="decimal" min="0" step="0.5" value={amount} onChange={(e) => { setAmount(e.target.value); setErrors({ ...errors, amount: '' }) }} />
      </Field>
      {canStamp && (
        <label className="check-row"><input type="checkbox" checked={stamp} onChange={(e) => setStamp(e.target.checked)} />Poner sello en su tarjeta de fidelidad</label>
      )}
      {a.client_id && (
        <Field label="Foto del corte (opcional)" error={errors.photo} hint="Queda en su historial para repetir el corte la próxima vez.">
          <input type="file" accept="image/*" capture="environment" onChange={(e) => { setPhoto(e.target.files?.[0] ?? null); setErrors({ ...errors, photo: '' }) }} />
        </Field>
      )}
      <button className="btn primary block" disabled={busy} onClick={() => void finish()}>{busy ? 'Guardando…' : `Cobrar ${money(Number(amount) || 0)}`}</button>
    </Modal>
  )
}
