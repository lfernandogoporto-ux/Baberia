import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, publicUrl } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Barber } from '../lib/types'
import { WEEKDAYS, WEEK_ORDER, dateTimeLabel, hhmm, mins, money } from '../lib/format'
import { initials } from '../components/ui'
import { IconChat, IconChevronRight, IconClock, IconImage, IconPin, IconStar, IconUser } from '../components/icons'

interface ShopPublic {
  name: string; address: string | null; phone: string | null; whatsapp: string | null; instagram: string | null
  maps_url: string | null; about: string | null; hide_prices: boolean; queue_enabled: boolean
  loyalty: { stamps: number; reward: string } | null
  today_open: string | null; today_close: string | null; open_now: boolean
  week: { weekday: number; open: string; close: string }[]
  services: { name: string; price: number; minutes: number }[]
  reviews: { stars: number; comment: string; client: string; barber: string }[]
  rating: number | null; ratings_count: number
  photos: string[]
}
interface Next { id: string; starts_at: string; barber: string; services: string }

const digits = (p: string | null) => (p ?? '').replace(/\D/g, '')
const waNumber = (p: string | null) => { const d = digits(p); return d.length === 8 ? `591${d}` : d }

export default function Home() {
  const { settings, isStaff, profile, loading, session } = useAuth()
  const [shop, setShop] = useState<ShopPublic | null>(null)
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [next, setNext] = useState<Next | null>(null)
  const [stamps, setStamps] = useState<{ stamps: number; required: number } | null>(null)
  const isClient = profile?.role === 'client'

  useEffect(() => {
    void supabase.rpc('shop_public').then(({ data }) => data && setShop(data as ShopPublic))
    void supabase.rpc('list_barbers').then(({ data }) => setBarbers((data as Barber[]) ?? []))
  }, [])
  useEffect(() => {
    if (!session || !isClient) return
    void supabase.rpc('my_account').then(({ data }) => {
      const d = data as { upcoming: Next[]; card: { stamps: number; required: number } | null } | null
      setNext(d?.upcoming?.[0] ?? null)
      setStamps(d?.card ?? null)
    })
  }, [session, isClient])

  const name = shop?.name ?? settings?.name ?? 'Bunny Barber Studio'
  const hours = shop?.today_open ? `${hhmm(shop.today_open)} a ${hhmm(shop.today_close!)}` : null

  return (
    <div className="home">
      <header className="hero">
        <img className="hero-logo" src="/logo.webp" width={168} height={168} alt={`Logo de ${name}`} />
        <h1 className="shop">{name}</h1>
        {shop && (
          <p className={`open-chip ${shop.open_now ? 'on' : ''}`}>
            <IconClock size={16} />
            {shop.open_now ? `Abierto ahora, hoy de ${hours}` : hours ? `Hoy atendemos de ${hours}` : 'Hoy no hay atención'}
          </p>
        )}
        <div className="hero-actions">
          <Link className="btn primary block" to="/reservar">Reservar mi corte</Link>
          {shop?.queue_enabled && shop.open_now && <Link className="btn ghost block on-dark" to="/fila">Ya estoy en el local: anotarme en la fila</Link>}
        </div>
      </header>
      <div className="pole thick" aria-hidden />

      <main className="home-body">
        {isClient && (
          <section className="stack tight">
            <h2>Hola, {profile!.full_name.split(' ')[0]}</h2>
            {next ? (
              <Link to={`/reserva/${next.id}`} className="panel row" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span className="grow">
                  <span className="muted small" style={{ display: 'block' }}>Tu próxima cita</span>
                  <b>{dateTimeLabel(next.starts_at)}</b>
                  <span className="muted small" style={{ display: 'block' }}>{next.services} con {next.barber}</span>
                </span>
                <IconChevronRight className="muted" />
              </Link>
            ) : <p className="ink2">No tienes citas próximas.</p>}
            {stamps && (
              <Link to="/cuenta" className="panel stack tight" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span className="row between"><b>Tu tarjeta de sellos</b><span className="badge teal">{stamps.stamps}/{stamps.required}</span></span>
                <span className="hbar"><i style={{ transform: `scaleX(${stamps.stamps / stamps.required})` }} /></span>
              </Link>
            )}
          </section>
        )}

        {shop?.about && <p className="lede">{shop.about}</p>}

        {shop && shop.services.length > 0 && (
          <section className="stack tight">
            <h2>Servicios</h2>
            <div className="list">
              {shop.services.map((s) => (
                <div key={s.name} className="item" style={{ minHeight: 56 }}>
                  <span className="grow"><span className="title">{s.name}</span><span className="sub" style={{ display: 'block' }}>Unos {mins(s.minutes)}</span></span>
                  {!shop.hide_prices && <span className="price">{money(s.price)}</span>}
                </div>
              ))}
            </div>
          </section>
        )}

        {barbers.length > 0 && (
          <section className="stack tight">
            <h2>Nuestros barberos</h2>
            <div className="list">
              {barbers.map((b) => (
                <Link key={b.id} to={`/reservar?barbero=${b.id}`} className="item" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <span className="monogram" aria-hidden>{initials(b.full_name)}</span>
                  <span className="grow">
                    <span className="title">{b.full_name}</span>
                    <span className="sub row" style={{ gap: 4 }}>
                      {b.rating != null && Number(b.ratings_count) > 0
                        ? <><IconStar size={14} filled style={{ color: 'var(--copper)' }} />{Number(b.rating).toFixed(1)} de {b.ratings_count} {Number(b.ratings_count) === 1 ? 'opinión' : 'opiniones'}</>
                        : 'Ver sus horarios'}
                    </span>
                  </span>
                  <IconChevronRight className="muted" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {shop && shop.photos.length > 0 && (
          <section className="stack tight">
            <h2 className="row"><IconImage size={22} />Trabajos recientes</h2>
            <div className="gallery">{shop.photos.map((p) => <img key={p} src={publicUrl(p) ?? ''} alt="Corte hecho en la barbería" loading="lazy" />)}</div>
          </section>
        )}

        {shop && shop.reviews.length > 0 && (
          <section className="stack tight">
            <h2>Lo que dicen{shop.rating ? `: ${Number(shop.rating).toFixed(1)} de 5` : ''}</h2>
            <div className="list">
              {shop.reviews.map((r, i) => (
                <figure key={i} className="item" style={{ margin: 0, flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                  <span className="row" style={{ gap: 2, color: 'var(--copper)' }} aria-label={`${r.stars} estrellas`}>{Array.from({ length: r.stars }, (_, j) => <IconStar key={j} size={15} filled />)}</span>
                  <blockquote style={{ margin: 0 }}>“{r.comment}”</blockquote>
                  <figcaption className="muted small">{r.client}, cortado por {r.barber}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {shop?.loyalty && (
          <section className="panel stack tight loyalty-promo">
            <h2>Tarjeta de sellos</h2>
            <p className="ink2">Junta {shop.loyalty.stamps} sellos y llévate: <b>{shop.loyalty.reward}</b>. Un sello por visita.</p>
            <Link to="/cuenta" className="small">{isClient ? 'Ver mi tarjeta' : 'Crea tu cuenta para verla en tu celular'}</Link>
          </section>
        )}

        {shop && (shop.address || shop.week.length > 0 || shop.whatsapp || shop.phone || shop.instagram) && (
          <section className="stack tight">
            <h2>Dónde y cuándo</h2>
            <div className="list">
              {shop.address && (
                <div className="item"><IconPin className="muted" /><span className="grow">{shop.address}</span>
                  {shop.maps_url && <a className="btn small" href={shop.maps_url} target="_blank" rel="noreferrer">Cómo llegar</a>}
                </div>
              )}
              {shop.week.length > 0 && (
                <div className="item" style={{ alignItems: 'flex-start' }}>
                  <IconClock className="muted" />
                  <table className="hours"><tbody>
                    {WEEK_ORDER.map((d) => {
                      const w = shop.week.find((x) => x.weekday === d)
                      return <tr key={d}><th scope="row">{WEEKDAYS[d]}</th><td className="num">{w ? `${hhmm(w.open)} a ${hhmm(w.close)}` : 'Cerrado'}</td></tr>
                    })}
                  </tbody></table>
                </div>
              )}
              {(shop.whatsapp || shop.phone || shop.instagram) && (
                <div className="item row wrap">
                  {shop.whatsapp && <a className="btn small" href={`https://wa.me/${waNumber(shop.whatsapp)}`} target="_blank" rel="noreferrer"><IconChat size={18} />WhatsApp</a>}
                  {shop.phone && <a className="btn small" href={`tel:+${waNumber(shop.phone)}`}>Llamar</a>}
                  {shop.instagram && <a className="btn small" href={`https://instagram.com/${shop.instagram.replace(/^@/, '')}`} target="_blank" rel="noreferrer">Instagram</a>}
                </div>
              )}
            </div>
          </section>
        )}

        <div className="stack tight" style={{ marginTop: 8 }}>
          {!loading && !isStaff && (
            <Link className="btn block" to="/cuenta"><IconUser size={20} />{isClient ? 'Mis reservas y mi tarjeta' : 'Entrar a mi cuenta'}</Link>
          )}
          {!loading && (isStaff
            ? <Link className="btn block" to="/app">Abrir mi agenda</Link>
            : <Link className="btn ghost block" to="/login">Soy parte del equipo</Link>)}
        </div>
      </main>
    </div>
  )
}
