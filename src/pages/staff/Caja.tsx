import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import type { PayMethod, PayMode } from '../../lib/types'
import { addDays, dayLabel, money, todayStr } from '../../lib/format'
import { Alert, Empty, Field, Spinner, initials, useToast } from '../../components/ui'
import { clean, focusFirstError, isValid, number, type Errors } from '../../lib/validate'
import { IconCash, IconX } from '../../components/icons'
import PaymentsList from './Payments'

type Tab = 'comprobantes' | 'cierre' | 'gastos' | 'finanzas'
const METHOD: Record<PayMethod, string> = { cash: 'Efectivo', qr: 'QR', transfer: 'Transferencia' }

export default function Caja() {
  const { isAdmin, isFrontDesk } = useAuth()
  const tabs: [Tab, string][] = [
    ['comprobantes', 'Comprobantes'],
    ...(isFrontDesk ? [['cierre', 'Cierre del día'] as [Tab, string]] : []),
    ...(isAdmin ? [['gastos', 'Gastos'] as [Tab, string], ['finanzas', 'Finanzas'] as [Tab, string]] : []),
  ]
  const [tab, setTab] = useState<Tab>(isFrontDesk ? 'cierre' : 'comprobantes')
  return (
    <div className="page wide stack">
      <h1>Caja</h1>
      {tabs.length > 1 && (
        <div className="seg" role="tablist" aria-label="Sección">
          {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className="chip" onClick={() => setTab(k)}>{l}</button>)}
        </div>
      )}
      {tab === 'comprobantes' && <PaymentsList />}
      {tab === 'cierre' && <Closing />}
      {tab === 'gastos' && <Expenses />}
      {tab === 'finanzas' && <Finance />}
    </div>
  )
}

interface DaySummary {
  cash: number; qr: number; transfer: number
  products_cash: number; products_qr: number; products_transfer: number
  expenses_cash: number
  by_person: { name: string | null; method: PayMethod; total: number }[]
  closing: { counted_cash: number; expected_cash: number; notes: string | null; closed_at: string } | null
}

function Closing() {
  const toast = useToast()
  const [day, setDay] = useState(todayStr())
  const [s, setS] = useState<DaySummary | null>(null)
  const [counted, setCounted] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Errors<'counted' | 'notes'>>({})

  const load = useCallback(async () => {
    setS(null)
    const { data, error } = await supabase.rpc('day_cash_summary', { p_day: day })
    if (error) toast(errMsg(error), true)
    const d = data as DaySummary | null
    setS(d)
    setCounted(d?.closing ? String(d.closing.counted_cash) : '')
    setNotes(d?.closing?.notes ?? '')
  }, [day, toast])
  useEffect(() => { void load() }, [load])

  if (!s) return <Spinner rows={3} />
  const expected = Number(s.cash) + Number(s.products_cash) - Number(s.expenses_cash)
  const diff = counted === '' ? null : Number(counted) - expected

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const errs = clean({
      counted: number(counted, { min: 0, max: 1000000, label: 'El efectivo contado' }),
      notes: notes.length > 300 ? 'La nota es muy larga (máximo 300)' : diff !== null && diff !== 0 && !notes.trim() ? 'Explica por qué no cuadra (ej. quién debe entregar)' : '',
    })
    setErrors(errs)
    if (!isValid(errs)) return focusFirstError()
    const { error } = await supabase.from('cash_closings').upsert({
      day, expected_cash: expected, counted_cash: Number(counted),
      expected_qr: Number(s.qr) + Number(s.products_qr), expected_transfer: Number(s.transfer) + Number(s.products_transfer),
      expenses_cash: s.expenses_cash, notes: notes.trim() || null, closed_at: new Date().toISOString(),
    })
    if (error) return toast(errMsg(error), true)
    toast('Caja cerrada')
    void load()
  }

  return (
    <div className="stack">
      <div className="datebar">
        <button className="btn icon" onClick={() => setDay(addDays(day, -1))} aria-label="Día anterior">‹</button>
        <span className="label">{day === todayStr() ? 'Hoy' : dayLabel(day, { weekday: 'long' })}<small>{dayLabel(day, { day: 'numeric', month: 'long' })}</small></span>
        <button className="btn icon" onClick={() => setDay(addDays(day, 1))} disabled={day >= todayStr()} aria-label="Día siguiente">›</button>
      </div>

      <dl className="figures" style={{ margin: 0 }}>
        <div className="lead"><dt>Efectivo que debería haber en caja</dt><dd>{money(expected)}</dd></div>
        <div><dt>Cortes en efectivo</dt><dd>{money(s.cash)}</dd></div>
        <div><dt>Productos en efectivo</dt><dd>{money(s.products_cash)}</dd></div>
        <div><dt>Gastos pagados en efectivo</dt><dd>{money(s.expenses_cash)}</dd></div>
        <div><dt>QR y transferencias</dt><dd>{money(Number(s.qr) + Number(s.transfer) + Number(s.products_qr) + Number(s.products_transfer))}</dd></div>
      </dl>

      {s.by_person.length > 0 && (
        <section className="stack tight">
          <h2>Quién cobró</h2>
          <div className="list">
            {s.by_person.map((p, i) => (
              <div key={i} className="item" style={{ minHeight: 52 }}>
                <span className="grow">{p.name ?? 'Sin registrar'} <span className="muted small">en {METHOD[p.method].toLowerCase()}</span></span>
                <span className="price">{money(p.total)}</span>
              </div>
            ))}
          </div>
          <p className="muted small">Si alguien cobró en efectivo, ese dinero lo tiene esa persona hasta que lo entregue a caja.</p>
        </section>
      )}

      <form className="panel stack" onSubmit={save} noValidate>
        <h2>{s.closing ? 'Caja cerrada' : 'Cerrar caja'}</h2>
        <Field label="Efectivo que contaste (Bs)" error={errors.counted}>
          <input type="number" inputMode="decimal" min="0" step="0.5" value={counted} onChange={(e) => { setCounted(e.target.value); setErrors({ ...errors, counted: '' }) }} />
        </Field>
        {diff !== null && (
          diff === 0 ? <Alert tone="ok">Cuadra exacto.</Alert>
            : <Alert tone={diff < 0 ? 'bad' : 'warn'}>{diff < 0 ? `Faltan ${money(-diff)}` : `Sobran ${money(diff)}`} respecto a lo esperado.</Alert>
        )}
        <Field label={diff ? 'Nota (obligatoria si no cuadra)' : 'Nota (opcional)'} error={errors.notes}><input value={notes} maxLength={300} onChange={(e) => { setNotes(e.target.value); setErrors({ ...errors, notes: '' }) }} placeholder="Ej. Juan entrega Bs 50 mañana" /></Field>
        <button className="btn primary block">{s.closing ? 'Actualizar cierre' : 'Guardar cierre del día'}</button>
      </form>
    </div>
  )
}

const CATEGORIES: [string, string][] = [
  ['alquiler', 'Alquiler'], ['servicios', 'Luz, agua, internet'], ['insumos', 'Insumos'],
  ['sueldos', 'Sueldos y comisiones'], ['mantenimiento', 'Mantenimiento'], ['publicidad', 'Publicidad'], ['otro', 'Otro'],
]
const catLabel = (c: string) => CATEGORIES.find(([k]) => k === c)?.[1] ?? c

interface Expense { id: string; spent_on: string; category: string; description: string; amount: number; method: PayMethod }

function Expenses() {
  const toast = useToast()
  const [rows, setRows] = useState<Expense[] | null>(null)
  const [f, setF] = useState({ spent_on: todayStr(), category: 'insumos', description: '', amount: '', method: 'cash' as PayMethod })
  const monthStart = `${todayStr().slice(0, 7)}-01`

  const load = useCallback(async () => {
    const { data } = await supabase.from('expenses').select('*').gte('spent_on', addDays(monthStart, -62)).order('spent_on', { ascending: false }).order('created_at', { ascending: false })
    setRows((data as Expense[]) ?? [])
  }, [monthStart])
  useEffect(() => { void load() }, [load])

  const [errors, setErrors] = useState<Errors<'description' | 'amount' | 'spent_on'>>({})
  const upd = (p: Partial<typeof f>, k: 'description' | 'amount' | 'spent_on' | null = null) => { setF({ ...f, ...p }); if (k) setErrors({ ...errors, [k]: '' }) }

  const add = async (e: FormEvent) => {
    e.preventDefault()
    const errs = clean({
      description: !f.description.trim() ? 'Escribe en qué se gastó' : f.description.trim().length > 120 ? 'Muy largo (máximo 120)' : '',
      amount: number(f.amount, { min: 0.5, max: 1000000, label: 'El monto' }),
      spent_on: !f.spent_on ? 'Elige la fecha' : f.spent_on > todayStr() ? 'La fecha no puede ser futura' : '',
    })
    setErrors(errs)
    if (!isValid(errs)) return focusFirstError()
    const { error } = await supabase.from('expenses').insert({ ...f, description: f.description.trim(), amount: Number(f.amount) })
    if (error) return toast(errMsg(error), true)
    toast('Gasto guardado')
    setF({ ...f, description: '', amount: '' })
    void load()
  }
  const remove = async (id: string) => {
    if (!confirm('¿Borrar este gasto?')) return
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) toast(errMsg(error), true)
    else void load()
  }
  const monthTotal = (rows ?? []).filter((r) => r.spent_on >= monthStart).reduce((s, r) => s + Number(r.amount), 0)

  return (
    <div className="stack">
      <form className="panel stack" onSubmit={add} noValidate>
        <h2>Anotar un gasto</h2>
        <Field label="¿En qué se gastó?" error={errors.description}><input value={f.description} maxLength={120} onChange={(e) => upd({ description: e.target.value }, 'description')} placeholder="Ej. Navajas y talco" /></Field>
        <div className="row wrap" style={{ alignItems: 'flex-start' }}>
          <Field label="Monto (Bs)" error={errors.amount}><input type="number" inputMode="decimal" min="0.5" step="0.5" value={f.amount} onChange={(e) => upd({ amount: e.target.value }, 'amount')} /></Field>
          <Field label="Fecha" error={errors.spent_on}><input type="date" value={f.spent_on} max={todayStr()} onChange={(e) => upd({ spent_on: e.target.value }, 'spent_on')} /></Field>
        </div>
        <div className="row wrap" style={{ alignItems: 'flex-start' }}>
          <Field label="Tipo">
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Pagado con">
            <select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as PayMethod })}>
              {Object.entries(METHOD).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
        </div>
        <button className="btn primary block">Guardar gasto</button>
      </form>

      <section className="stack tight">
        <div className="row between"><h2>Últimos gastos</h2><span className="ink2 small">Este mes: <b className="num">{money(monthTotal)}</b></span></div>
        {rows === null ? <Spinner /> : rows.length === 0 ? (
          <div className="panel"><Empty icon={<IconCash size={28} />} title="Todavía no anotaste gastos">Anota alquiler, luz, insumos y lo que pagues para ver la ganancia real.</Empty></div>
        ) : (
          <div className="list">
            {rows.map((r) => (
              <div key={r.id} className="item">
                <span className="grow">
                  <span className="title">{r.description}</span>
                  <span className="sub" style={{ display: 'block' }}>{catLabel(r.category)}, {dayLabel(r.spent_on, { day: 'numeric', month: 'short' })}, {METHOD[r.method].toLowerCase()}</span>
                </span>
                <span className="price">{money(r.amount)}</span>
                <button className="btn icon ghost danger" aria-label={`Borrar gasto ${r.description}`} onClick={() => void remove(r.id)}><IconX size={18} /></button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

interface FinanceData {
  services_income: number; products_income: number; purchases: number; expenses: number; profit: number
  by_method: Record<PayMethod, number>
  expenses_by_category: { category: string; total: number }[]
}
interface Commission {
  barber_id: string; name: string; pay_mode: PayMode; pay_percent: number; pay_salary: number; pay_chair_rent: number
  cuts: number; revenue: number; barber_share: number | null; shop_share: number | null
}
const MODE_TEXT = (c: Commission) => ({
  none: 'Forma de pago sin definir (configúrala en Equipo)',
  percent: `${Number(c.pay_percent)}% de lo que corta`,
  salary: `Sueldo fijo de ${money(c.pay_salary)} al mes`,
  mixed: `${money(c.pay_salary)} fijo + ${Number(c.pay_percent)}% de lo que corta`,
  chair_rent: `Alquila la silla por ${money(c.pay_chair_rent)} al mes`,
}[c.pay_mode])

function Finance() {
  const toast = useToast()
  const [month, setMonth] = useState(todayStr().slice(0, 7))
  const [fin, setFin] = useState<FinanceData | null>(null)
  const [com, setCom] = useState<Commission[]>([])
  const [simPct, setSimPct] = useState(50)

  useEffect(() => {
    setFin(null)
    const from = `${month}-01`
    const next = new Date(`${from}T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1); next.setUTCDate(0)
    const to = next.toISOString().slice(0, 10)
    void (async () => {
      const [a, b] = await Promise.all([
        supabase.rpc('finance_summary', { p_from: from, p_to: to }),
        supabase.rpc('commission_report', { p_month: from }),
      ])
      if (a.error || b.error) toast(errMsg(a.error ?? b.error), true)
      setFin(a.data as FinanceData)
      setCom((b.data as Commission[]) ?? [])
    })()
  }, [month, toast])

  const teamPay = useMemo(() => com.reduce((s, c) => s + Number(c.barber_share ?? 0), 0), [com])
  const totalRevenue = useMemo(() => com.reduce((s, c) => s + Number(c.revenue), 0), [com])

  if (!fin) return <Spinner rows={3} />
  const net = Number(fin.profit) - teamPay

  return (
    <div className="stack">
      <Field label="Mes"><input type="month" value={month} max={todayStr().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} /></Field>

      <dl className="figures" style={{ margin: 0 }}>
        <div className="lead"><dt>Ganancia del mes, después de pagar al equipo</dt><dd style={{ color: net < 0 ? 'var(--bad)' : undefined }}>{money(net)}</dd></div>
        <div><dt>Cobrado por cortes</dt><dd>{money(fin.services_income)}</dd></div>
        <div><dt>Venta de productos</dt><dd>{money(fin.products_income)}</dd></div>
        <div><dt>Gastos</dt><dd>{money(fin.expenses)}</dd></div>
        <div><dt>Compra de productos</dt><dd>{money(fin.purchases)}</dd></div>
        <div><dt>Pago al equipo</dt><dd>{money(teamPay)}</dd></div>
        <div><dt>Antes de pagar al equipo</dt><dd>{money(fin.profit)}</dd></div>
      </dl>

      <section className="stack tight">
        <h2>Cuánto le toca a cada uno</h2>
        {com.length === 0 ? <p className="ink2">No hay barberos activos.</p> : (
          <div className="list">
            {com.map((c) => (
              <div key={c.barber_id} className="item" style={{ alignItems: 'flex-start' }}>
                <span className="monogram" aria-hidden>{initials(c.name)}</span>
                <div className="grow stack tight">
                  <div className="row between"><span className="title">{c.name}</span><b className="price">{c.barber_share === null ? 'Sin definir' : money(c.barber_share)}</b></div>
                  <div className="muted small">{MODE_TEXT(c)}. Cortó {money(c.revenue)} en {c.cuts} {Number(c.cuts) === 1 ? 'corte' : 'cortes'}.</div>
                  {c.shop_share !== null && <div className="small ink2">Para el local: <b className="num">{money(c.shop_share)}</b></div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel stack">
        <h2>Simulador de comisión</h2>
        <p className="ink2 small">¿Y si pagaras un porcentaje? Con lo que se cortó este mes ({money(totalRevenue)}):</p>
        <Field label={`Porcentaje para el barbero: ${simPct}%`}>
          <input type="range" min={0} max={100} step={5} value={simPct} onChange={(e) => setSimPct(Number(e.target.value))} style={{ padding: 0, minHeight: 32 }} />
        </Field>
        <div className="list">
          {com.map((c) => (
            <div key={c.barber_id} className="item" style={{ minHeight: 52 }}>
              <span className="grow">{c.name}</span>
              <span className="small ink2">barbero <b className="num">{money(Number(c.revenue) * simPct / 100)}</b>, local <b className="num">{money(Number(c.revenue) * (100 - simPct) / 100)}</b></span>
            </div>
          ))}
        </div>
      </section>

      {fin.expenses_by_category.length > 0 && (
        <section className="stack tight">
          <h2>Gastos por tipo</h2>
          <div className="list">
            {fin.expenses_by_category.map((e) => (
              <div key={e.category} className="item" style={{ minHeight: 52 }}><span className="grow">{catLabel(e.category)}</span><span className="price">{money(e.total)}</span></div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
