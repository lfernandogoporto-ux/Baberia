import { useCallback, useEffect, useState } from 'react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import type { CardInfo, ClientRow, Status } from '../../lib/types'
import { dateTimeLabel, money } from '../../lib/format'
import { Alert, Empty, Modal, Spinner, StatusBadge, initials, useToast } from '../../components/ui'
import { Scanner, canScan } from '../../components/qr'
import { IconCamera, IconChat, IconChevronRight, IconStar, IconUser } from '../../components/icons'

type Filter = 'all' | 'inactive' | 'noshow'
const daysAgo = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null)
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

export default function Clients() {
  const { settings } = useAuth()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [rows, setRows] = useState<ClientRow[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [scan, setScan] = useState(false)
  const inactiveDays = settings?.reactivation_days ?? 30

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('clients_overview', {
      p_search: q.trim() || null, p_inactive_days: filter === 'inactive' ? inactiveDays : null,
    })
    if (error) toast(errMsg(error), true)
    let list = (data as ClientRow[]) ?? []
    if (filter === 'noshow') list = list.filter((c) => c.no_shows - c.no_shows_forgiven > 0)
    setRows(list)
  }, [q, filter, inactiveDays, toast])

  useEffect(() => {
    const id = setTimeout(() => void load(), 250)
    return () => clearTimeout(id)
  }, [load])

  const onScan = useCallback(async (text: string) => {
    setScan(false)
    const token = text.match(UUID)?.[0]
    if (!token) return toast('Ese QR no es una tarjeta de la barbería', true)
    const { data, error } = await supabase.rpc('staff_card', { p_key: token })
    if (error) return toast(errMsg(error), true)
    setOpen((data as CardInfo).client_id)
  }, [toast])

  return (
    <div className="page stack">
      <div className="row between">
        <h1>Clientes</h1>
        {settings?.loyalty_enabled && canScan() && (
          <button className="btn" onClick={() => setScan(true)}><IconCamera size={20} />Escanear tarjeta</button>
        )}
      </div>
      <input type="search" placeholder="Buscar por nombre o celular" aria-label="Buscar cliente" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="seg" role="tablist" aria-label="Filtro">
        <button role="tab" aria-selected={filter === 'all'} className="chip" onClick={() => setFilter('all')}>Todos</button>
        <button role="tab" aria-selected={filter === 'inactive'} className="chip" onClick={() => setFilter('inactive')}>No vienen hace {inactiveDays} días</button>
        <button role="tab" aria-selected={filter === 'noshow'} className="chip" onClick={() => setFilter('noshow')}>Con faltas</button>
      </div>

      {rows === null ? <Spinner rows={5} /> : rows.length === 0 ? (
        <div className="panel">
          <Empty icon={<IconUser size={28} />} title={q ? 'Nadie coincide con esa búsqueda' : filter === 'inactive' ? 'Todos tus clientes vinieron hace poco' : 'Todavía no hay clientes'}>
            {q ? 'Prueba con otra parte del nombre o del celular.' : 'Los clientes aparecen aquí cuando reservan o se registra su celular al atenderlos.'}
          </Empty>
        </div>
      ) : (
        <div className="list">
          {rows.map((c) => {
            const d = daysAgo(c.last_visit)
            const faltas = c.no_shows - c.no_shows_forgiven
            return (
              <button key={c.id} className="item" onClick={() => setOpen(c.id)}>
                <span className="monogram" aria-hidden>{initials(c.full_name)}</span>
                <span className="grow">
                  <span className="title">{c.full_name}</span>
                  <span className="sub" style={{ display: 'block' }}>
                    {c.visits ? `${c.visits} ${Number(c.visits) === 1 ? 'visita' : 'visitas'}, la última hace ${d === 0 ? 'menos de un día' : `${d} ${d === 1 ? 'día' : 'días'}`}` : 'Aún sin visitas terminadas'}
                  </span>
                </span>
                {faltas > 0 && <span className="badge bad">{faltas} {faltas === 1 ? 'falta' : 'faltas'}</span>}
                {settings?.loyalty_enabled && c.stamps !== null && <span className="badge teal">{c.stamps}/{c.required}</span>}
                <IconChevronRight className="muted" />
              </button>
            )
          })}
        </div>
      )}

      {open && <ClientSheet id={open} onClose={() => setOpen(null)} onChanged={() => void load()} />}
      {scan && <Scanner onResult={(t) => void onScan(t)} onClose={() => setScan(false)} />}
    </div>
  )
}

interface HistoryRow { id: string; starts_at: string; status: Status; source: string; total_price: number; photo_path: string | null; barber: string; services: string; stars: number | null }

function ClientSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { settings, isFrontDesk } = useAuth()
  const toast = useToast()
  const [client, setClient] = useState<{ full_name: string; phone: string | null; no_shows: number; no_shows_forgiven: number; card_token: string } | null>(null)
  const [card, setCard] = useState<CardInfo | null>(null)
  const [history, setHistory] = useState<HistoryRow[] | null>(null)
  const [photos, setPhotos] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [c, h, k] = await Promise.all([
      supabase.from('clients').select('full_name,phone,no_shows,no_shows_forgiven,card_token').eq('id', id).single(),
      supabase.rpc('client_history', { p_client: id }),
      settings?.loyalty_enabled ? supabase.rpc('staff_card', { p_key: id }) : Promise.resolve({ data: null }),
    ])
    setClient(c.data)
    const list = (h.data as HistoryRow[]) ?? []
    setHistory(list)
    setCard((k.data as CardInfo) ?? null)
    const map: Record<string, string> = {}
    await Promise.all(list.filter((r) => r.photo_path).map(async (r) => {
      const { data } = await supabase.storage.from('cuts').createSignedUrl(r.photo_path!, 900)
      if (data?.signedUrl) map[r.id] = data.signedUrl
    }))
    setPhotos(map)
  }, [id, settings?.loyalty_enabled])
  useEffect(() => { void load() }, [load])

  if (!client) return <Modal title="Cliente" onClose={onClose}><Spinner rows={3} /></Modal>

  const faltas = client.no_shows - client.no_shows_forgiven
  const origin = window.location.origin
  const first = client.full_name.split(' ')[0]
  const reactivation = (settings?.reactivation_message ?? '')
    .replaceAll('{nombre}', first).replaceAll('{local}', settings?.name ?? '').replaceAll('{enlace}', `${origin}/reservar`)
  const wa = (text?: string) => `https://wa.me/${client.phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`

  const run = async (fn: () => PromiseLike<{ error: unknown }>, ok: string) => {
    setBusy(true)
    const { error } = await fn()
    setBusy(false)
    if (error) return toast(errMsg(error), true)
    toast(ok)
    void load()
    onChanged()
  }

  return (
    <Modal title={client.full_name} onClose={onClose}>
      {client.phone ? (
        <>
          <div className="row wrap">
            <a className="btn small" href={wa()} target="_blank" rel="noreferrer"><IconChat size={18} />WhatsApp</a>
            {settings?.reactivation_enabled && (
              <a className="btn small" href={wa(reactivation)} target="_blank" rel="noreferrer">Invitar a volver</a>
            )}
          </div>
          <p className="muted small">Celular {client.phone.replace(/^591/, '')}</p>
        </>
      ) : <p className="muted small">Sin celular registrado.</p>}

      {faltas > 0 && (
        <Alert tone="warn">
          Faltó {faltas} {faltas === 1 ? 'vez' : 'veces'} sin avisar.{' '}
          {isFrontDesk && <button className="btn small ghost" disabled={busy}
            onClick={() => void run(() => supabase.from('clients').update({ no_shows_forgiven: client.no_shows_forgiven + 1 }).eq('id', id), 'Falta perdonada')}>Perdonar una</button>}
        </Alert>
      )}

      {card?.enabled && (
        <section className="panel stack">
          <div className="row between"><h3>Tarjeta de fidelidad</h3><span className="badge teal">{card.stamps}/{card.required}</span></div>
          <div className="stamps" aria-label={`${card.stamps} de ${card.required} sellos`}>
            {Array.from({ length: card.required }, (_, i) => (
              <span key={i} className={`stamp ${i < card.stamps ? 'on' : ''} ${card.mid_at === i + 1 ? 'mid' : ''}`}>{i + 1}</span>
            ))}
          </div>
          {card.ready && <Alert tone="ok">¡Tarjeta llena! Le toca: <b>{card.reward}</b></Alert>}
          {card.mid_at && card.stamps >= card.mid_at && !card.mid_redeemed && !card.ready && card.mid_reward && (
            <Alert tone="info">Ya ganó el premio intermedio: <b>{card.mid_reward}</b></Alert>
          )}
          <div className="row wrap">
            {!card.ready && <button className="btn small primary" disabled={busy} onClick={() => void run(() => supabase.rpc('add_stamp', { p_client: id }), 'Sello puesto')}>Poner sello de hoy</button>}
            {card.ready && card.card_id && <button className="btn small primary" disabled={busy} onClick={() => void run(() => supabase.rpc('redeem_reward', { p_card: card.card_id, p_kind: 'final' }), 'Premio entregado, empieza una tarjeta nueva')}>Entregar premio</button>}
            {card.mid_at && card.stamps >= card.mid_at && !card.mid_redeemed && card.card_id && card.mid_reward &&
              <button className="btn small" disabled={busy} onClick={() => void run(() => supabase.rpc('redeem_reward', { p_card: card.card_id, p_kind: 'mid' }), 'Premio intermedio entregado')}>Entregar {card.mid_reward.toLowerCase()}</button>}
            <a className="btn small ghost" href={wa(`Tu tarjeta de ${settings?.name}: ${origin}/tarjeta/${client.card_token}`)} target="_blank" rel="noreferrer">Enviarle su tarjeta</a>
          </div>
          {card.completed_cards > 0 && <p className="muted small">Ya llenó {card.completed_cards} {card.completed_cards === 1 ? 'tarjeta' : 'tarjetas'}.</p>}
        </section>
      )}

      <section className="stack tight">
        <h3>Historial</h3>
        {history === null ? <Spinner rows={2} /> : history.length === 0 ? <p className="ink2 small">Aún no tiene visitas.</p> : (
          <div className="list">
            {history.map((h) => (
              <div key={h.id} className="item" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 8 }}>
                <div className="row between" style={{ width: '100%' }}>
                  <span className="title">{dateTimeLabel(h.starts_at)}</span>
                  <StatusBadge status={h.status} />
                </div>
                <div className="muted small">{h.services} con {h.barber}, {money(h.total_price)}{h.source === 'walk_in' ? ', sin reserva' : ''}</div>
                {h.stars && <div className="row small" style={{ gap: 2, color: 'var(--warn)' }} aria-label={`${h.stars} estrellas`}>{Array.from({ length: h.stars }, (_, i) => <IconStar key={i} size={16} filled />)}</div>}
                {photos[h.id] && <img src={photos[h.id]} alt={`Foto del corte del ${dateTimeLabel(h.starts_at)}`} style={{ width: 140, borderRadius: 10 }} />}
              </div>
            ))}
          </div>
        )}
      </section>
    </Modal>
  )
}
