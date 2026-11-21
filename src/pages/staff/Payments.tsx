import { useCallback, useEffect, useState } from 'react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { dateTimeLabel, money } from '../../lib/format'
import { Empty, Spinner, useToast } from '../../components/ui'
import { IconWallet } from '../../components/icons'

interface Row {
  id: string
  amount: number
  method: string
  proof_path: string | null
  created_at: string
  appointments: { starts_at: string; total_price: number; clients: { full_name: string; phone: string } | null; profiles: { full_name: string } | null } | null
}

export default function Payments() {
  const { profile } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('payments')
      .select('id,amount,method,proof_path,created_at,appointments(starts_at,total_price,clients(full_name,phone),profiles:barber_id(full_name))')
      .eq('status', 'to_verify').order('created_at')
    if (error) toast(errMsg(error), true)
    const list = (data as unknown as Row[]) ?? []
    setRows(list)
    const map: Record<string, string> = {}
    await Promise.all(list.filter((r) => r.proof_path).map(async (r) => {
      const { data: s } = await supabase.storage.from('proofs').createSignedUrl(r.proof_path!, 600)
      if (s?.signedUrl) map[r.id] = s.signedUrl
    }))
    setUrls(map)
  }, [toast])

  useEffect(() => { void load() }, [load])

  const decide = async (r: Row, status: 'confirmed' | 'rejected') => {
    const { error } = await supabase.from('payments').update({
      status, verified_by: profile?.id, verified_at: new Date().toISOString(), received_by: profile?.id,
    }).eq('id', r.id)
    if (error) toast(errMsg(error), true)
    else { toast(status === 'confirmed' ? 'Pago confirmado' : 'Pago rechazado'); void load() }
  }

  return (
    <div className="stack">
      <p className="ink2">Comprobantes que subieron los clientes. Revisa en tu banca que el dinero llegó antes de confirmar.</p>
      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <div className="panel">
          <Empty icon={<IconWallet size={28} />} title="No hay comprobantes por revisar">
            Cuando un cliente pague por adelantado con QR y suba su comprobante, aparece aquí.
          </Empty>
        </div>
      ) : rows.map((r) => (
        <div key={r.id} className="panel stack">
          <div className="row between">
            <span className="title" style={{ fontWeight: 650 }}>{r.appointments?.clients?.full_name ?? 'Cliente'}</span>
            <b className="num" style={{ fontSize: '1.2rem' }}>{money(r.amount)}</b>
          </div>
          <div className="muted small">
            Cita del {r.appointments && dateTimeLabel(r.appointments.starts_at)} con {r.appointments?.profiles?.full_name}. Total del corte: {money(r.appointments?.total_price)}.
          </div>
          {urls[r.id] && (
            <a href={urls[r.id]} target="_blank" rel="noreferrer">
              <img src={urls[r.id]} alt="Comprobante" style={{ width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 10, background: 'var(--surface-2)' }} />
            </a>
          )}
          <div className="row">
            <button className="btn primary grow" onClick={() => void decide(r, 'confirmed')}>Sí, llegó el pago</button>
            <button className="btn danger grow" onClick={() => void decide(r, 'rejected')}>Rechazar</button>
          </div>
        </div>
      ))}
    </div>
  )
}
