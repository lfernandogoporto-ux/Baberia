import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { time } from '../lib/format'

interface Board {
  shop: string
  serving: { barber: string; client: string; since: string; ends_at: string }[]
  queue: { name: string; barber: string | null }[]
  next: { starts_at: string; barber: string }[]
  queue_enabled: boolean
}

/** /pantalla: para una TV en el local. Solo muestra nombres de pila. */
export default function Display() {
  const [b, setB] = useState<Board | null>(null)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.rpc('display_board')
      if (data) setB(data as Board)
    }
    void load()
    const a = setInterval(() => void load(), 10000)
    const c = setInterval(() => setNow(new Date()), 1000)
    return () => { clearInterval(a); clearInterval(c) }
  }, [])

  return (
    <div className="board" data-theme="dark">
      <header className="board-head">
        <div className="shop"><img src="/logo-256.webp" alt="" />{b?.shop ?? 'Bunny Barber Studio'}</div>
        <div className="clock">{time(now.toISOString())}</div>
      </header>
      <div className="pole thick" aria-hidden />
      <div className="board-body">
        <section className="board-col" aria-label="Fila">
          <h2>{b?.queue_enabled ? 'En la fila' : 'Próximas reservas'}</h2>
          {b?.queue_enabled ? (
            b.queue.length === 0 ? <p style={{ fontSize: '1.6rem', opacity: 0.7 }}>Nadie esperando. Escanea el QR de la puerta para anotarte.</p>
              : b.queue.slice(0, 8).map((q, i) => (
                <div key={i} className="board-row"><span className="pos">{i + 1}</span><b className="grow">{q.name}</b><span style={{ opacity: 0.7 }}>{q.barber ?? 'Cualquiera'}</span></div>
              ))
          ) : (
            (b?.next ?? []).length === 0 ? <p style={{ fontSize: '1.6rem', opacity: 0.7 }}>Sin más reservas hoy.</p>
              : b!.next.map((n, i) => <div key={i} className="board-row"><b>{time(n.starts_at)}</b><span>{n.barber}</span></div>)
          )}
        </section>
        <section className="board-col" aria-label="Atendiendo ahora">
          <h2>Atendiendo ahora</h2>
          {(b?.serving ?? []).length === 0 ? <p style={{ fontSize: '1.6rem', opacity: 0.7 }}>Sillas libres.</p>
            : b!.serving.map((s, i) => (
              <div key={i} className="board-row"><b>{s.barber}</b><span>{s.client}, hasta las {time(s.ends_at)}</span></div>
            ))}
          {b?.queue_enabled && (b?.next ?? []).length > 0 && (
            <>
              <h2 style={{ marginTop: 28 }}>Reservas de hoy</h2>
              {b!.next.slice(0, 4).map((n, i) => <div key={i} className="board-row"><b>{time(n.starts_at)}</b><span>{n.barber}</span></div>)}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
