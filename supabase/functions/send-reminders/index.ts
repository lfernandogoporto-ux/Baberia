// Envía los recordatorios push de las citas que empiezan pronto.
// Lo llama pg_cron cada 5 minutos con el encabezado x-cron-secret (guardado en app_secrets).
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'
import webpush from 'npm:web-push@3.6.7'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

const fmt = (iso: string) =>
  new Intl.DateTimeFormat('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/La_Paz' }).format(new Date(iso))

Deno.serve(async (req) => {
  const { data: secrets } = await db.from('app_secrets').select('key,value')
  const s = Object.fromEntries((secrets ?? []).map((r) => [r.key, r.value]))
  if (!s.cron_secret || req.headers.get('x-cron-secret') !== s.cron_secret) {
    return new Response('No autorizado', { status: 401 })
  }
  webpush.setVapidDetails(s.vapid_subject, s.vapid_public, s.vapid_private)

  const { data: settings } = await db.from('shop_settings').select('name,reminder_minutes').eq('id', 1).single()
  const ahead = settings?.reminder_minutes ?? 30
  const now = new Date()
  const until = new Date(now.getTime() + ahead * 60000)

  const { data: due, error } = await db.from('appointments')
    .select('id,barber_id,starts_at,clients(full_name),profiles:barber_id(full_name)')
    .in('status', ['pending', 'confirmed']).is('reminder_sent_at', null)
    .gte('starts_at', now.toISOString()).lte('starts_at', until.toISOString())
  if (error) return new Response(error.message, { status: 500 })

  let sent = 0
  let removed = 0
  for (const a of due ?? []) {
    const { data: subs } = await db.from('push_subscriptions').select('id,endpoint,p256dh,auth,user_id,appointment_id')
      .or(`appointment_id.eq.${a.id},user_id.eq.${a.barber_id}`)
    const client = (a.clients as { full_name: string } | null)?.full_name?.split(' ')[0] ?? 'un cliente'
    const barber = (a.profiles as { full_name: string } | null)?.full_name?.split(' ')[0] ?? 'tu barbero'
    for (const sub of subs ?? []) {
      const forClient = sub.appointment_id === a.id
      const payload = JSON.stringify(forClient
        ? { title: `${settings?.name ?? 'Barbería'}: tu corte es a las ${fmt(a.starts_at)}`, body: `Te esperamos con ${barber}. Si no puedes venir, cancela desde tu reserva.`, url: `/reserva/${a.id}`, tag: `cita-${a.id}` }
        : { title: `Cita a las ${fmt(a.starts_at)}`, body: `${client} viene en unos minutos.`, url: '/app', tag: `cita-${a.id}` })
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 1800 })
        sent++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) { await db.from('push_subscriptions').delete().eq('id', sub.id); removed++ }
      }
    }
    await db.from('appointments').update({ reminder_sent_at: new Date().toISOString() }).eq('id', a.id)
  }

  return new Response(JSON.stringify({ appointments: due?.length ?? 0, sent, removed }), { headers: { 'Content-Type': 'application/json' } })
})
