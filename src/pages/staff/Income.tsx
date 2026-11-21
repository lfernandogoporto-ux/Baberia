import { useEffect, useMemo, useState } from 'react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import type { DayRow, IncomeRow } from '../../lib/types'
import { addDays, dayLabel, money, todayStr } from '../../lib/format'
import { Empty, Spinner, initials, useToast } from '../../components/ui'
import { IconChart } from '../../components/icons'

type Preset = 'today' | '7d' | 'month' | 'year' | 'custom'

const range = (p: Preset, custom: [string, string]): [string, string] => {
  const t = todayStr()
  if (p === 'today') return [t, t]
  if (p === '7d') return [addDays(t, -6), t]
  if (p === 'month') return [`${t.slice(0, 7)}-01`, t]
  if (p === 'year') return [`${t.slice(0, 4)}-01-01`, t]
  return custom
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const PRESETS: [Preset, string][] = [['today', 'Hoy'], ['7d', '7 días'], ['month', 'Este mes'], ['year', 'Este año'], ['custom', 'Elegir fechas']]

export default function Income() {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [preset, setPreset] = useState<Preset>('month')
  const [custom, setCustom] = useState<[string, string]>([addDays(todayStr(), -30), todayStr()])
  const [rows, setRows] = useState<IncomeRow[] | null>(null)
  const [days, setDays] = useState<DayRow[]>([])
  const [from, to] = range(preset, custom)

  useEffect(() => {
    setRows(null)
    void (async () => {
      const [a, b] = await Promise.all([
        supabase.rpc('income_summary', { p_from: from, p_to: to }),
        supabase.rpc('income_by_day', { p_from: from, p_to: to }),
      ])
      if (a.error || b.error) toast(errMsg(a.error ?? b.error), true)
      setRows((a.data as IncomeRow[]) ?? [])
      setDays((b.data as DayRow[]) ?? [])
    })()
  }, [from, to, toast])

  const totals = useMemo(() => {
    const r = rows ?? []
    const total = r.reduce((s, x) => s + Number(x.total), 0)
    const cuts = r.reduce((s, x) => s + Number(x.cuts), 0)
    const res = r.reduce((s, x) => s + Number(x.reservation_total), 0)
    const wi = r.reduce((s, x) => s + Number(x.walk_in_total), 0)
    return { total, cuts, res, wi, avg: cuts ? total / cuts : 0 }
  }, [rows])

  // Periodos largos se agrupan por mes para que el gráfico se lea
  const byMonth = preset === 'year' || (preset === 'custom' && days.length > 45)
  const bars = useMemo(() => {
    if (!byMonth) return days.map((d) => ({ label: dayLabel(d.day, { day: 'numeric', month: 'short' }), total: Number(d.total) }))
    const m = new Map<string, number>()
    days.forEach((d) => m.set(d.day.slice(0, 7), (m.get(d.day.slice(0, 7)) ?? 0) + Number(d.total)))
    return [...m.entries()].map(([k, v]) => ({ label: `${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`, total: v }))
  }, [days, byMonth])
  const maxBar = Math.max(1, ...bars.map((b) => b.total))
  const maxRow = Math.max(1, ...(rows ?? []).map((r) => Number(r.total)))

  return (
    <div className="page wide stack">
      <h1>{isAdmin ? 'Ingresos del local' : 'Mis ingresos'}</h1>
      <div className="seg" role="tablist" aria-label="Periodo">
        {PRESETS.map(([k, l]) => <button key={k} role="tab" aria-selected={preset === k} className="chip" onClick={() => setPreset(k)}>{l}</button>)}
      </div>
      {preset === 'custom' && (
        <div className="row">
          <label className="field"><span>Desde</span><input type="date" value={custom[0]} max={custom[1]} onChange={(e) => setCustom([e.target.value, custom[1]])} /></label>
          <label className="field"><span>Hasta</span><input type="date" value={custom[1]} min={custom[0]} max={todayStr()} onChange={(e) => setCustom([custom[0], e.target.value])} /></label>
        </div>
      )}

      {rows === null ? <Spinner rows={3} /> : totals.cuts === 0 ? (
        <div className="panel">
          <Empty icon={<IconChart size={28} />} title="Todavía no hay cortes cobrados en este periodo">
            Cuando se termine y cobre un corte en la agenda, aparece aquí.
          </Empty>
        </div>
      ) : (
        <>
          <dl className="figures" style={{ margin: 0 }}>
            <div className="lead"><dt>Total cobrado</dt><dd>{money(totals.total)}</dd></div>
            <div><dt>Cortes</dt><dd>{totals.cuts}</dd></div>
            <div><dt>Promedio por corte</dt><dd>{money(totals.avg)}</dd></div>
            <div><dt>Con reserva</dt><dd>{money(totals.res)}</dd></div>
            <div><dt>Sin reserva</dt><dd>{money(totals.wi)}</dd></div>
          </dl>

          <section className="panel stack">
            <h2>{byMonth ? 'Mes a mes' : 'Día a día'}</h2>
            <div className="bars" role="img" aria-label={`Ingresos ${byMonth ? 'por mes' : 'por día'}, máximo ${money(maxBar)}`}>
              {bars.map((b, i) => <div key={i} className="bar" tabIndex={0} style={{ height: `${(b.total / maxBar) * 100}%` }} data-tip={`${b.label}: ${money(b.total)}`} />)}
            </div>
            <div className="row between muted small"><span>{bars[0]?.label}</span><span>{bars[bars.length - 1]?.label}</span></div>
          </section>

          <section className="stack tight">
            <h2>{isAdmin ? 'Quién gana más' : 'Detalle'}</h2>
            <div className="list">
              {rows.map((r) => (
                <div key={r.barber_id} className="item" style={{ alignItems: 'flex-start' }}>
                  <span className="monogram" aria-hidden>{initials(r.barber_name)}</span>
                  <div className="grow stack tight">
                    <div className="row between"><span className="title">{r.barber_name}</span><b className="price">{money(r.total)}</b></div>
                    <div className="hbar"><i style={{ transform: `scaleX(${Number(r.total) / maxRow})` }} /></div>
                    <div className="muted small">
                      {r.cuts} {Number(r.cuts) === 1 ? 'corte' : 'cortes'}: {r.reservation_cuts} con reserva ({money(r.reservation_total)}) y {r.walk_in_cuts} sin reserva ({money(r.walk_in_total)})
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
