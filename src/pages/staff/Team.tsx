import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import type { BarberService, PayMode, Profile, Role, Service, WorkingHour } from '../../lib/types'
import { WEEKDAYS, WEEK_ORDER, hhmm, money } from '../../lib/format'
import { Field, GroupError, Modal, Spinner, initials, useToast } from '../../components/ui'
import { clean, email as vEmail, focusFirstError, isValid, number, personName, type Errors } from '../../lib/validate'
import { IconCheck, IconChevronRight, IconPlus, IconX } from '../../components/icons'

interface Invite { email: string; role: Role; is_barber: boolean; full_name: string | null }
const ROLE_LABEL: Record<Role, string> = { admin: 'Administrador', barber: 'Barbero', receptionist: 'Recepcionista', client: 'Cliente' }

export default function Team() {
  const toast = useToast()
  const [staff, setStaff] = useState<Profile[] | null>(null)
  const [invites, setInvites] = useState<Invite[]>([])
  const [edit, setEdit] = useState<Profile | null>(null)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<Role>('barber')
  const [alsoCuts, setAlsoCuts] = useState(false)

  const load = useCallback(async () => {
    const [p, i] = await Promise.all([
      supabase.from('profiles').select('*').neq('role', 'client').order('full_name'),
      supabase.from('staff_invites').select('*').order('created_at'),
    ])
    setStaff((p.data as Profile[]) ?? [])
    setInvites((i.data as Invite[]) ?? [])
  }, [])
  useEffect(() => { void load() }, [load])

  const [errors, setErrors] = useState<Errors<'email' | 'name'>>({})
  const invite = async (e: FormEvent) => {
    e.preventDefault()
    const mail = email.trim().toLowerCase()
    const errs = clean({
      email: vEmail(mail) || ((staff ?? []).some((p) => p.email?.toLowerCase() === mail) ? 'Esa persona ya es parte del equipo' : ''),
      name: fullName.trim() && fullName.trim().length < 2 ? 'El nombre es muy corto' : '',
    })
    setErrors(errs)
    if (!isValid(errs)) return focusFirstError()
    const { data, error } = await supabase.rpc('invite_staff', {
      p_email: mail, p_role: role, p_is_barber: role === 'barber' || alsoCuts, p_name: fullName.trim() || null,
    })
    if (error) return toast(errMsg(error), true)
    toast(data === 'promoted' ? 'Esa persona ya tenía cuenta: ya tiene acceso al equipo.' : 'Invitación guardada. Que cree su cuenta con ese correo.')
    setEmail(''); setFullName(''); setAlsoCuts(false)
    void load()
  }

  return (
    <div className="page wide stack">
      <h1>Equipo</h1>

      {staff === null ? <Spinner /> : (
        <div className="list">
          {staff.map((p) => (
            <button key={p.id} className="item" onClick={() => setEdit(p)} style={p.active ? undefined : { opacity: 0.6 }}>
              <span className="monogram" aria-hidden>{initials(p.full_name || p.email || '?')}</span>
              <span className="grow">
                <span className="title">{p.full_name || p.email}</span>
                <span className="sub" style={{ display: 'block' }}>
                  {ROLE_LABEL[p.role]}{p.is_barber && p.role !== 'barber' ? ' que también corta' : ''}{!p.active ? ', inactivo' : ''}
                </span>
              </span>
              <IconChevronRight className="muted" />
            </button>
          ))}
        </div>
      )}

      <form className="panel stack" onSubmit={invite} noValidate>
        <h2>Invitar a alguien</h2>
        <p className="ink2 small">Cuando esa persona cree su cuenta con este mismo correo, entra directo con el rol que elijas. Si ya tiene cuenta, recibe el acceso al instante.</p>
        <Field label="Correo" error={errors.email}><input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErrors({ ...errors, email: '' }) }} /></Field>
        <Field label="Nombre (opcional)" error={errors.name}><input value={fullName} onChange={(e) => { setFullName(e.target.value); setErrors({ ...errors, name: '' }) }} /></Field>
        <Field label="Rol">
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="barber">Barbero</option>
            <option value="receptionist">Recepcionista</option>
            <option value="admin">Administrador</option>
          </select>
        </Field>
        {role !== 'barber' && (
          <label className="check-row"><input type="checkbox" checked={alsoCuts} onChange={(e) => setAlsoCuts(e.target.checked)} />También corta pelo</label>
        )}
        <button className="btn primary">Guardar invitación</button>
      </form>

      {invites.length > 0 && (
        <section className="stack tight">
          <h2>Esperando que se registren</h2>
          <div className="list">
            {invites.map((i) => (
              <div key={i.email} className="item">
                <span className="grow"><span className="title">{i.email}</span><span className="sub" style={{ display: 'block' }}>{ROLE_LABEL[i.role]}</span></span>
                <button className="btn small ghost danger" onClick={async () => { await supabase.from('staff_invites').delete().eq('email', i.email); void load() }}>Quitar</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {edit && <EditModal p={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void load() }} />}
    </div>
  )
}

function EditModal({ p, onClose, onSaved }: { p: Profile; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [tab, setTab] = useState<'perfil' | 'horario' | 'servicios' | 'pago'>('perfil')
  const [name, setName] = useState(p.full_name)
  const { profile: me } = useAuth()
  const isMe = me?.id === p.id // nadie se quita a sí mismo el acceso de administrador
  const [role, setRole] = useState<Role>(p.role)
  const [cuts, setCuts] = useState(p.is_barber)
  const [active, setActive] = useState(p.active)
  const [speed, setSpeed] = useState(String(p.speed_factor))
  const [errors, setErrors] = useState<Errors<'name' | 'speed'>>({})

  const save = async () => {
    const errs = clean({ name: personName(name), speed: number(speed, { min: 0.3, max: 3, label: 'La velocidad' }) })
    setErrors(errs)
    if (!isValid(errs)) return focusFirstError()
    const { error } = await supabase.from('profiles').update({
      full_name: name.trim(), role, is_barber: cuts || role === 'barber', active, speed_factor: Number(speed) || 1,
    }).eq('id', p.id)
    if (error) return toast(errMsg(error), true)
    toast('Guardado')
    onSaved()
  }

  return (
    <Modal title={p.full_name || 'Persona'} onClose={onClose}>
      <div className="seg" role="tablist" aria-label="Sección">
        {(['perfil', ...(cuts || role === 'barber' ? ['horario', 'servicios', 'pago'] : [])] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className="chip" onClick={() => setTab(t as typeof tab)}>
            {{ perfil: 'Perfil', horario: 'Horario', servicios: 'Servicios y precios', pago: 'Forma de pago' }[t as typeof tab]}
          </button>
        ))}
      </div>

      {tab === 'perfil' && (
        <div className="stack">
          <Field label="Nombre" error={errors.name}><input value={name} onChange={(e) => { setName(e.target.value); setErrors({ ...errors, name: '' }) }} /></Field>
          <Field label="Rol" hint={isMe ? 'No puedes cambiar tu propio rol. Otro administrador puede hacerlo.' : undefined}>
            <select value={role} disabled={isMe} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="admin">Administrador</option>
              <option value="barber">Barbero</option>
              <option value="receptionist">Recepcionista</option>
            </select>
          </Field>
          <label className="check-row"><input type="checkbox" checked={cuts || role === 'barber'} disabled={role === 'barber'} onChange={(e) => setCuts(e.target.checked)} />Corta pelo: tiene agenda y aparece al reservar</label>
          <label className="check-row"><input type="checkbox" checked={active} disabled={isMe} onChange={(e) => setActive(e.target.checked)} />Activo</label>
          <Field label="Velocidad" error={errors.speed} hint="1 es normal. 0.8 corta más rápido (servicios 20% más cortos), 1.2 más lento. Para ajustar un solo servicio, usa “Servicios y precios”.">
            <input type="number" step="0.05" min="0.3" max="3" inputMode="decimal" value={speed} onChange={(e) => { setSpeed(e.target.value); setErrors({ ...errors, speed: '' }) }} />
          </Field>
          <button className="btn primary block" onClick={() => void save()}>Guardar cambios</button>
        </div>
      )}
      {tab === 'horario' && <Hours barberId={p.id} />}
      {tab === 'servicios' && <Overrides barberId={p.id} />}
      {tab === 'pago' && <PayForm p={p} onSaved={onSaved} />}
    </Modal>
  )
}

const PAY_MODES: [PayMode, string, string][] = [
  ['none', 'Sin definir', 'Solo se registra lo que corta. Elige cuando lo acuerden.'],
  ['percent', 'Porcentaje', 'Se queda con un % de lo que corta.'],
  ['salary', 'Sueldo fijo', 'Gana lo mismo cada mes; lo que corta es del local.'],
  ['mixed', 'Fijo + porcentaje', 'Un sueldo base más un % de lo que corta.'],
  ['chair_rent', 'Alquila la silla', 'Paga un monto al mes al local y lo que corta es suyo.'],
]

function PayForm({ p, onSaved }: { p: Profile; onSaved: () => void }) {
  const toast = useToast()
  const [mode, setMode] = useState<PayMode>(p.pay_mode ?? 'none')
  const [pct, setPct] = useState(String(p.pay_percent ?? 0))
  const [salary, setSalary] = useState(String(p.pay_salary ?? 0))
  const [rent, setRent] = useState(String(p.pay_chair_rent ?? 0))
  const example = 1000
  const [errors, setErrors] = useState<Errors<'pct' | 'salary' | 'rent'>>({})

  const save = async () => {
    const errs = clean({
      pct: mode === 'percent' || mode === 'mixed' ? number(pct, { min: mode === 'percent' ? 1 : 0, max: 100, label: 'El porcentaje' }) : '',
      salary: mode === 'salary' || mode === 'mixed' ? number(salary, { min: 1, max: 100000, label: 'El sueldo' }) : '',
      rent: mode === 'chair_rent' ? number(rent, { min: 1, max: 100000, label: 'El alquiler' }) : '',
    })
    setErrors(errs)
    if (!isValid(errs)) return focusFirstError()
    const { error } = await supabase.from('profiles').update({
      pay_mode: mode, pay_percent: Number(pct) || 0, pay_salary: Number(salary) || 0, pay_chair_rent: Number(rent) || 0,
    }).eq('id', p.id)
    if (error) return toast(errMsg(error), true)
    toast('Forma de pago guardada')
    onSaved()
  }

  const share = mode === 'percent' ? example * Number(pct) / 100
    : mode === 'salary' ? Number(salary)
    : mode === 'mixed' ? Number(salary) + example * Number(pct) / 100
    : mode === 'chair_rent' ? example - Number(rent) : null

  return (
    <div className="stack">
      <div className="list">
        {PAY_MODES.map(([k, l, d]) => (
          <button key={k} type="button" className="item" aria-pressed={mode === k} onClick={() => setMode(k)}>
            <span className="tick"><IconCheck size={16} strokeWidth={2.5} /></span>
            <span className="grow"><span className="title">{l}</span><span className="sub" style={{ display: 'block' }}>{d}</span></span>
          </button>
        ))}
      </div>
      {(mode === 'percent' || mode === 'mixed') && <Field label="Porcentaje para el barbero (%)" error={errors.pct}><input type="number" min="0" max="100" step="1" inputMode="numeric" value={pct} onChange={(e) => { setPct(e.target.value); setErrors({ ...errors, pct: '' }) }} /></Field>}
      {(mode === 'salary' || mode === 'mixed') && <Field label="Sueldo fijo al mes (Bs)" error={errors.salary}><input type="number" min="0" step="10" inputMode="decimal" value={salary} onChange={(e) => { setSalary(e.target.value); setErrors({ ...errors, salary: '' }) }} /></Field>}
      {mode === 'chair_rent' && <Field label="Alquiler de la silla al mes (Bs)" error={errors.rent}><input type="number" min="0" step="10" inputMode="decimal" value={rent} onChange={(e) => { setRent(e.target.value); setErrors({ ...errors, rent: '' }) }} /></Field>}
      {share !== null && (
        <p className="ink2 small">Ejemplo: si en un mes corta {money(example)}, el barbero recibe <b className="num">{money(share)}</b> y el local <b className="num">{money(example - share)}</b>.</p>
      )}
      <p className="muted small">El cálculo de cada mes está en Caja, Finanzas.</p>
      <button className="btn primary block" onClick={() => void save()}>Guardar forma de pago</button>
    </div>
  )
}

function Hours({ barberId }: { barberId: string }) {
  const toast = useToast()
  const [rows, setRows] = useState<{ weekday: number; start: string; end: string }[] | null>(null)

  useEffect(() => {
    void supabase.from('working_hours').select('*').eq('barber_id', barberId).order('start_time').then(({ data }) =>
      setRows(((data as WorkingHour[]) ?? []).map((r) => ({ weekday: r.weekday, start: hhmm(r.start_time), end: hhmm(r.end_time) }))))
  }, [barberId])

  const [rowErrors, setRowErrors] = useState<Record<number, string>>({})

  const save = async () => {
    if (!rows) return
    const errs: Record<number, string> = {}
    rows.forEach((r, i) => {
      if (!r.start || !r.end) errs[i] = 'Completa la hora de inicio y de fin'
      else if (r.end <= r.start) errs[i] = 'La hora de fin debe ser después del inicio'
      else {
        const clash = rows.findIndex((o, j) => j !== i && o.weekday === r.weekday && o.start && o.end && r.start < o.end && o.start < r.end)
        if (clash !== -1) errs[i] = 'Este tramo se cruza con otro del mismo día'
      }
    })
    setRowErrors(errs)
    if (Object.keys(errs).length) { toast('Hay horarios por corregir', true); return focusFirstError() }
    const del = await supabase.from('working_hours').delete().eq('barber_id', barberId)
    if (del.error) return toast(errMsg(del.error), true)
    if (rows.length) {
      const ins = await supabase.from('working_hours').insert(rows.map((r) => ({ barber_id: barberId, weekday: r.weekday, start_time: r.start, end_time: r.end })))
      if (ins.error) return toast(errMsg(ins.error), true)
    }
    toast('Horario guardado')
  }

  if (!rows) return <Spinner />
  return (
    <div className="stack">
      <p className="ink2 small">Para dejar un descanso, agrega dos tramos el mismo día (por ejemplo 09:00 a 13:00 y 15:00 a 19:00). Un día sin tramos es día libre.</p>
      <div className="list">
        {WEEK_ORDER.map((d) => {
          const mine = rows.map((r, i) => ({ r, i })).filter((x) => x.r.weekday === d)
          return (
            <div key={d} className="item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div className="row between">
                <span className="title">{WEEKDAYS[d]}{mine.length === 0 && <span className="muted small" style={{ fontWeight: 400 }}> (libre)</span>}</span>
                <button className="btn small ghost" onClick={() => setRows([...rows, { weekday: d, start: '09:00', end: '18:00' }])}><IconPlus size={18} />Tramo</button>
              </div>
              {mine.map(({ r, i }) => (
                <div key={i} className={`stack tight ${rowErrors[i] ? 'field invalid' : ''}`}>
                  <div className="row">
                    <input type="time" aria-label={`${WEEKDAYS[d]} desde`} aria-invalid={!!rowErrors[i]} value={r.start} onChange={(e) => { setRowErrors({}); setRows(rows.map((x, j) => j === i ? { ...x, start: e.target.value } : x)) }} />
                    <span className="muted">a</span>
                    <input type="time" aria-label={`${WEEKDAYS[d]} hasta`} aria-invalid={!!rowErrors[i]} value={r.end} onChange={(e) => { setRowErrors({}); setRows(rows.map((x, j) => j === i ? { ...x, end: e.target.value } : x)) }} />
                    <button className="btn icon ghost danger" aria-label="Quitar tramo" onClick={() => { setRowErrors({}); setRows(rows.filter((_, j) => j !== i)) }}><IconX size={20} /></button>
                  </div>
                  {rowErrors[i] && <GroupError>{rowErrors[i]}</GroupError>}
                </div>
              ))}
            </div>
          )
        })}
      </div>
      <button className="btn primary block" onClick={() => void save()}>Guardar horario</button>
    </div>
  )
}

function Overrides({ barberId }: { barberId: string }) {
  const toast = useToast()
  const [services, setServices] = useState<Service[] | null>(null)
  const [map, setMap] = useState<Record<string, { enabled: boolean; price: string; minutes: string }>>({})

  useEffect(() => {
    void (async () => {
      const [s, o] = await Promise.all([
        supabase.from('services').select('*').eq('active', true).order('sort_order'),
        supabase.from('barber_services').select('*').eq('barber_id', barberId),
      ])
      const m: typeof map = {}
      ;((o.data as BarberService[]) ?? []).forEach((r) => { m[r.service_id] = { enabled: r.enabled, price: r.price_override?.toString() ?? '', minutes: r.minutes_override?.toString() ?? '' } })
      setMap(m)
      setServices((s.data as Service[]) ?? [])
    })()
  }, [barberId])

  const get = (id: string) => map[id] ?? { enabled: true, price: '', minutes: '' }
  const set = (id: string, patch: Partial<{ enabled: boolean; price: string; minutes: string }>) => setMap({ ...map, [id]: { ...get(id), ...patch } })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = async () => {
    const errs: Record<string, string> = {}
    for (const s of services ?? []) {
      const v = get(s.id)
      if (!v.enabled) continue
      const pe = v.price ? number(v.price, { min: 0, max: 10000, label: 'El precio' }) : ''
      const me = v.minutes ? number(v.minutes, { min: 5, max: 480, integer: true, label: 'Los minutos' }) : ''
      if (pe) errs[`${s.id}:price`] = pe
      if (me) errs[`${s.id}:minutes`] = me
    }
    setErrors(errs)
    if (Object.keys(errs).length) return focusFirstError()
    for (const s of services ?? []) {
      const v = get(s.id)
      if (v.enabled && !v.price && !v.minutes) {
        await supabase.from('barber_services').delete().eq('barber_id', barberId).eq('service_id', s.id)
      } else {
        const { error } = await supabase.from('barber_services').upsert({
          barber_id: barberId, service_id: s.id, enabled: v.enabled,
          price_override: v.price ? Number(v.price) : null, minutes_override: v.minutes ? Number(v.minutes) : null,
        })
        if (error) return toast(errMsg(error), true)
      }
    }
    toast('Guardado')
  }

  if (!services) return <Spinner />
  return (
    <div className="stack">
      <p className="ink2 small">Deja un campo vacío para usar el precio o la duración normal del servicio.</p>
      <div className="list">
        {services.map((s) => {
          const v = get(s.id)
          return (
            <div key={s.id} className="item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
              <label className="row between">
                <span className="title">{s.name}</span>
                <span className="check-row" style={{ minHeight: 0 }}><input type="checkbox" checked={v.enabled} onChange={(e) => set(s.id, { enabled: e.target.checked })} />Lo hace</span>
              </label>
              {v.enabled && (
                <div className="row">
                  <Field label={`Precio (normal ${money(s.base_price)})`} error={errors[`${s.id}:price`]}><input type="number" min="0" step="0.5" inputMode="decimal" value={v.price} placeholder={String(s.base_price)} onChange={(e) => { setErrors({}); set(s.id, { price: e.target.value }) }} /></Field>
                  <Field label={`Minutos (normal ${s.base_minutes})`} error={errors[`${s.id}:minutes`]}><input type="number" min="5" step="5" inputMode="numeric" value={v.minutes} placeholder={String(s.base_minutes)} onChange={(e) => { setErrors({}); set(s.id, { minutes: e.target.value }) }} /></Field>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <button className="btn primary block" onClick={() => void save()}>Guardar precios y tiempos</button>
    </div>
  )
}
