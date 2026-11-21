import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { addDays, dayLabel, dayRange, time, todayStr } from '../../lib/format'
import { Alert, Empty, Spinner, initials, useToast } from '../../components/ui'
import { IconPin } from '../../components/icons'

interface Row { id: string; staff_id: string; check_in_at: string; check_out_at: string | null; in_distance_m: number | null; profiles: { full_name: string } | null }

const hours = (r: Row) => {
  const end = r.check_out_at ? new Date(r.check_out_at).getTime() : Date.now()
  const m = Math.round((end - new Date(r.check_in_at).getTime()) / 60000)
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

export default function Attendance() {
  const { profile, isAdmin, settings } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const from = dayRange(addDays(todayStr(), -6)).from
    let q = supabase.from('attendance').select('id,staff_id,check_in_at,check_out_at,in_distance_m,profiles:staff_id(full_name)').gte('check_in_at', from).order('check_in_at', { ascending: false })
    if (!isAdmin && profile) q = q.eq('staff_id', profile.id)
    const { data, error } = await q
    if (error) toast(errMsg(error), true)
    setRows((data as unknown as Row[]) ?? [])
  }, [isAdmin, profile, toast])
  useEffect(() => { void load() }, [load])

  const mineOpen = (rows ?? []).find((r) => r.staff_id === profile?.id && !r.check_out_at && dayRange(todayStr()).from <= r.check_in_at)

  const mark = () => {
    setMsg(null)
    if (!('geolocation' in navigator)) return setMsg({ ok: false, text: 'Este celular no permite usar la ubicación.' })
    setBusy(true)
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { data, error } = await supabase.rpc('check_in_out', { p_lat: pos.coords.latitude, p_lng: pos.coords.longitude })
      setBusy(false)
      if (error) return setMsg({ ok: false, text: errMsg(error) })
      const r = data as { action: 'in' | 'out'; distance: number }
      setMsg({ ok: true, text: r.action === 'in' ? `Llegada marcada a las ${time(new Date().toISOString())}.` : `Salida marcada a las ${time(new Date().toISOString())}.` })
      void load()
    }, (err) => {
      setBusy(false)
      setMsg({ ok: false, text: err.code === 1 ? 'Necesitamos permiso de ubicación para marcar. Actívalo en el navegador.' : 'No pudimos obtener tu ubicación. Intenta de nuevo cerca de una ventana.' })
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
  }

  return (
    <div className="page stack">
      <h1>Asistencia</h1>
      {!settings?.attendance_enabled ? (
        <Alert tone="info">
          El control de asistencia está apagado.{isAdmin && <> Actívalo y marca la ubicación del local en <Link to="/app/negocio">Mi negocio</Link>.</>}
        </Alert>
      ) : settings.latitude == null ? (
        <Alert tone="warn">Falta marcar dónde está el local.{isAdmin && <> Hazlo desde el local en <Link to="/app/negocio">Mi negocio</Link>.</>}</Alert>
      ) : (
        <section className="panel stack">
          <p className="ink2">Marca tu llegada y tu salida estando en el local (a menos de {settings.checkin_radius_m} m). Solo se guarda la distancia al local, no te seguimos.</p>
          <button className="btn primary block" disabled={busy} onClick={mark}>
            <IconPin size={20} />{busy ? 'Buscando tu ubicación…' : mineOpen ? 'Marcar salida' : 'Marcar llegada'}
          </button>
          {mineOpen && <p className="muted small center">Llegaste a las {time(mineOpen.check_in_at)}, llevas {hours(mineOpen)}.</p>}
          {msg && <Alert tone={msg.ok ? 'ok' : 'bad'}>{msg.text}</Alert>}
        </section>
      )}

      <section className="stack tight">
        <h2>{isAdmin ? 'Últimos 7 días del equipo' : 'Tus últimos 7 días'}</h2>
        {rows === null ? <Spinner rows={3} /> : rows.length === 0 ? (
          <div className="panel"><Empty icon={<IconPin size={28} />} title="Sin marcas todavía" /></div>
        ) : (
          <div className="list">
            {rows.map((r) => (
              <div key={r.id} className="item">
                {isAdmin && <span className="monogram" aria-hidden>{initials(r.profiles?.full_name ?? '?')}</span>}
                <span className="grow">
                  <span className="title">{isAdmin ? r.profiles?.full_name : dayLabel(new Date(new Date(r.check_in_at).getTime() - 4 * 3600e3).toISOString().slice(0, 10), { weekday: 'long', day: 'numeric' })}</span>
                  <span className="sub" style={{ display: 'block' }}>
                    {isAdmin && `${dayLabel(new Date(new Date(r.check_in_at).getTime() - 4 * 3600e3).toISOString().slice(0, 10), { weekday: 'short', day: 'numeric' })}, `}
                    de {time(r.check_in_at)} a {r.check_out_at ? time(r.check_out_at) : 'ahora'}
                  </span>
                </span>
                <span className={`badge ${r.check_out_at ? 'ink' : 'teal'}`}>{hours(r)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
