import { supabase } from './supabase'

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!VAPID

const b64ToBytes = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function subscribe() {
  if (!pushSupported()) throw new Error('Este navegador no permite avisos. En iPhone, primero agrega la app a la pantalla de inicio.')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('No diste permiso para los avisos. Puedes activarlo en los ajustes del navegador.')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID!) }))
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  return j
}

/** Avisos para el personal: recordatorio de sus citas */
export async function enableStaffPush() {
  const s = await subscribe()
  const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: s.endpoint, p_p256dh: s.keys.p256dh, p_auth: s.keys.auth })
  if (error) throw error
}

/** Aviso para el cliente: recordatorio de su reserva */
export async function enableBookingPush(appointmentId: string) {
  const s = await subscribe()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: s.endpoint, p_p256dh: s.keys.p256dh, p_auth: s.keys.auth, p_appointment: appointmentId,
  })
  if (error) throw error
}
