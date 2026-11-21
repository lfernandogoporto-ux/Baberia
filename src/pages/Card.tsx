import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { CardInfo } from '../lib/types'
import { Alert, Spinner } from '../components/ui'
import { QR } from '../components/qr'

/** /tarjeta/:token: la tarjeta de fidelidad del cliente, con su QR para sellar */
export default function Card() {
  const { token } = useParams()
  const [c, setC] = useState<CardInfo | null | undefined>(undefined)

  useEffect(() => {
    void supabase.rpc('get_card', { p_token: token }).then(({ data }) => setC((data as CardInfo | null) ?? null))
  }, [token])

  if (c === undefined) return <div className="page"><Spinner rows={2} /></div>
  if (c === null) return <div className="page stack"><Alert tone="bad">No encontramos esta tarjeta.</Alert><Link className="btn block" to="/">Ir al inicio</Link></div>
  if (!c.enabled) return <div className="page stack"><Alert tone="info">La barbería tiene la tarjeta de fidelidad pausada por ahora.</Alert></div>

  const left = c.required - c.stamps
  return (
    <div className="page stack">
      <div className="stack tight">
        <span className="muted">{c.shop}</span>
        <h1>Tarjeta de {c.first_name}</h1>
      </div>
      <div className="pole thick" aria-hidden style={{ borderRadius: 6 }} />
      <section className="panel stack">
        <div className="stamps" aria-label={`${c.stamps} de ${c.required} sellos`}>
          {Array.from({ length: c.required }, (_, i) => (
            <span key={i} className={`stamp ${i < c.stamps ? 'on' : ''} ${c.mid_at === i + 1 ? 'mid' : ''}`}>{i + 1}</span>
          ))}
        </div>
        {c.ready
          ? <Alert tone="ok">¡Llenaste tu tarjeta! Muéstrala en el local y recibe: <b>{c.reward}</b></Alert>
          : <p className="ink2">Te {left === 1 ? 'falta 1 sello' : `faltan ${left} sellos`} para: <b>{c.reward}</b>.</p>}
        {c.mid_at && c.mid_reward && !c.ready && (
          c.stamps >= c.mid_at
            ? (!c.mid_redeemed && <Alert tone="info">Ya ganaste: <b>{c.mid_reward}</b>. Pídelo en tu próxima visita.</Alert>)
            : <p className="muted small">Al sello {c.mid_at} también te llevas: {c.mid_reward}.</p>
        )}
      </section>
      <section className="panel stack" style={{ alignItems: 'center' }}>
        <QR value={window.location.href} label="Código de tu tarjeta" size={200} />
        <p className="muted small center">Muestra este código al terminar tu corte para que te pongan el sello.</p>
      </section>
      {c.completed_cards > 0 && <p className="muted small center">Ya llenaste {c.completed_cards} {c.completed_cards === 1 ? 'tarjeta' : 'tarjetas'}. ¡Gracias por volver!</p>}
      <Link className="btn primary block" to="/reservar">Reservar mi próximo corte</Link>
    </div>
  )
}
