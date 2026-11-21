import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { CardInfo, Status } from '../lib/types'
import { dateTimeLabel, money } from '../lib/format'
import { Alert, Empty, Spinner, StatusBadge } from '../components/ui'
import { AuthForm } from '../components/AuthForm'
import { ProfileForm } from '../components/ProfileForm'
import { QR } from '../components/qr'
import { IconCalendar, IconChevronLeft, IconChevronRight, IconStar } from '../components/icons'

interface Row { id: string; starts_at: string; status: Status; total_price: number; barber: string; barber_id: string; services: string; service_ids?: string[] | null; stars?: number | null }
interface AccountData {
  shop: string
  profile: { full_name: string; phone: string | null; email: string; role: string }
  client: { id: string; full_name: string; phone: string | null; card_token: string } | null
  upcoming: Row[]
  past: Row[]
  card: CardInfo | null
}
type Tab = 'reservas' | 'historial' | 'tarjeta' | 'datos'

function Rows({ rows, repeat = false }: { rows: Row[]; repeat?: boolean }) {
  return (
    <div className="list">
      {rows.map((r) => (
        <div key={r.id} className="item" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 8 }}>
          <Link to={`/reserva/${r.id}`} className="row" style={{ textDecoration: 'none', color: 'inherit', width: '100%', alignItems: 'flex-start' }}>
            <span className="grow stack tight">
              <span className="row between"><span className="title">{dateTimeLabel(r.starts_at)}</span><StatusBadge status={r.status} /></span>
              <span className="sub">{r.services} con {r.barber}, {money(r.total_price)}</span>
              {r.stars ? <span className="row" style={{ gap: 2, color: 'var(--copper)' }} aria-label={`${r.stars} estrellas`}>{Array.from({ length: r.stars }, (_, i) => <IconStar key={i} size={14} filled />)}</span> : null}
            </span>
            <IconChevronRight className="muted" />
          </Link>
          {repeat && r.status === 'completed' && !!r.service_ids?.length && (
            <Link className="btn small" to={`/reservar?barbero=${r.barber_id}&servicios=${r.service_ids.join(',')}`}>Repetir este corte</Link>
          )}
        </div>
      ))}
    </div>
  )
}

/** /cuenta: cuenta del cliente (reservas, historial, tarjeta y datos) */
export default function Account() {
  const { session, profile, loading, isStaff } = useAuth()
  const nav = useNavigate()
  const [data, setData] = useState<AccountData | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('reservas')

  const load = useCallback(async () => {
    if (!session) return setData(null)
    const { data, error } = await supabase.rpc('my_account')
    if (error) setError(errMsg(error))
    setData(data as AccountData)
  }, [session])
  useEffect(() => { void load() }, [load])

  if (loading) return <div className="page"><Spinner rows={3} /></div>

  if (!session) {
    return (
      <div className="page stack">
        <Link to="/" className="btn icon ghost" aria-label="Volver al inicio"><IconChevronLeft /></Link>
        <div className="stack tight">
          <h1>Mi cuenta</h1>
          <p className="ink2">Mira tus reservas, tu historial y tu tarjeta de sellos en un solo lugar.</p>
        </div>
        <AuthForm audience="client" onDone={() => void load()} />
        <p className="muted small center">No necesitas cuenta para reservar. <Link to="/reservar">Reservar sin cuenta</Link></p>
      </div>
    )
  }

  if (isStaff) {
    return (
      <div className="page stack">
        <Link to="/" className="btn icon ghost" aria-label="Volver al inicio"><IconChevronLeft /></Link>
        <h1>Hola, {profile?.full_name.split(' ')[0]}</h1>
        <Alert tone="info">Tu cuenta es del equipo de la barbería.</Alert>
        <button className="btn primary block" onClick={() => nav('/app')}>Ir a mi agenda</button>
      </div>
    )
  }

  if (!data) return <div className="page"><Spinner rows={3} /></div>
  const first = (data.client?.full_name ?? data.profile.full_name).split(' ')[0]
  const tabs: [Tab, string][] = [['reservas', 'Mis reservas'], ['historial', 'Historial'], ...(data.card ? [['tarjeta', 'Mi tarjeta'] as [Tab, string]] : []), ['datos', 'Mis datos']]

  return (
    <div className="page stack">
      <div className="row between">
        <Link to="/" className="btn icon ghost" aria-label="Ir al inicio"><IconChevronLeft /></Link>
        <span className="muted small">{data.shop}</span>
      </div>
      <h1>Hola, {first}</h1>
      {error && <Alert tone="bad">{error}</Alert>}
      <div className="seg" role="tablist" aria-label="Sección">
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className="chip" onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'reservas' && (
        <>
          {data.upcoming.length === 0 ? (
            <div className="panel"><Empty icon={<IconCalendar size={28} />} title="No tienes reservas próximas">Elige barbero y horario en un minuto.</Empty></div>
          ) : <Rows rows={data.upcoming} />}
          <Link className="btn primary block" to="/reservar">Reservar un corte</Link>
          <p className="muted small">¿Reservaste antes sin cuenta? Abre el enlace de esa reserva estando dentro de tu cuenta y toca “Guardar esta reserva en mi cuenta”.</p>
        </>
      )}

      {tab === 'historial' && (
        data.past.length === 0
          ? <div className="panel"><Empty icon={<IconCalendar size={28} />} title="Todavía no hay visitas anteriores" /></div>
          : <Rows rows={data.past} repeat />
      )}

      {tab === 'tarjeta' && data.card && (
        <section className="panel stack" style={{ alignItems: 'stretch' }}>
          <div className="row between"><h2>Tarjeta de sellos</h2><span className="badge teal">{data.card.stamps}/{data.card.required}</span></div>
          <div className="stamps" aria-label={`${data.card.stamps} de ${data.card.required} sellos`}>
            {Array.from({ length: data.card.required }, (_, i) => (
              <span key={i} className={`stamp ${i < data.card!.stamps ? 'on' : ''} ${data.card!.mid_at === i + 1 ? 'mid' : ''}`}>{i + 1}</span>
            ))}
          </div>
          {data.card.ready
            ? <Alert tone="ok">¡Tarjeta llena! Muéstrala en el local y recibe: <b>{data.card.reward}</b></Alert>
            : <p className="ink2">Premio al llenarla: <b>{data.card.reward}</b>{data.card.mid_at && data.card.mid_reward ? `. Al sello ${data.card.mid_at}: ${data.card.mid_reward}` : ''}.</p>}
          <div style={{ alignSelf: 'center' }}><QR value={`${window.location.origin}/tarjeta/${data.card.token}`} label="Código de tu tarjeta" size={190} /></div>
          <p className="muted small center">Muestra este código al terminar tu corte para que te pongan el sello.</p>
        </section>
      )}

      {tab === 'datos' && <ProfileForm onSaved={() => void load()} />}
    </div>
  )
}
