// Prueba de carga contra Supabase con la clave pública (lo mismo que usa un cliente desde su celular).
// Uso: node scripts/load-test.mjs <barbero_id> <fecha YYYY-MM-DD> <servicio_id>
// 1) Carrera: N personas intentan retener el MISMO horario a la vez → debe ganar exactamente 1.
// 2) Lecturas: muchas consultas públicas en paralelo → latencia y errores.
// 3) Limpieza: libera los horarios retenidos por la prueba.
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => l.split(/=(.*)/s).slice(0, 2)))
const URL_ = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_ANON_KEY
const [barber, date, service] = process.argv.slice(2)
if (!barber || !date || !service) { console.error('Faltan argumentos: barbero fecha servicio'); process.exit(1) }

const rpc = async (fn, body) => {
  const t = performance.now()
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const text = await r.text()
  return { ok: r.ok, status: r.status, ms: performance.now() - t, body: text }
}
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))]) }
const pool = async (n, conc, job) => {
  const out = []; let i = 0
  await Promise.all(Array.from({ length: conc }, async () => { while (i < n) { const k = i++; out[k] = await job(k) } }))
  return out
}

// 1) Carrera por el mismo horario
const slot = `${date}T09:00:00-04:00`
const RACERS = Number(process.env.RACERS ?? 300)
let t0 = performance.now()
const race = await Promise.all(Array.from({ length: RACERS }, () => rpc('hold_slot', { p_barber: barber, p_start: slot, p_service_ids: [service] })))
const winners = race.filter((r) => r.ok)
console.log(`\n1) ${RACERS} personas a la vez por el mismo horario (${slot})`)
console.log(`   ganaron: ${winners.length} (debe ser 1)  rechazadas: ${race.filter((r) => !r.ok).length}  en ${Math.round(performance.now() - t0)} ms`)
const errors = {}
race.filter((r) => !r.ok).forEach((r) => { const m = (JSON.parse(r.body).message ?? r.status).toString().slice(0, 60); errors[m] = (errors[m] ?? 0) + 1 })
console.log('   motivos de rechazo:', errors)

// 2) Lecturas públicas en paralelo
const READS = Number(process.env.READS ?? 1000)
const CONC = Number(process.env.CONC ?? 50)
const calls = [
  ['shop_public', {}], ['list_barbers', {}],
  ['get_available_slots', { p_barber: barber, p_date: date, p_minutes: 30 }],
  ['barber_service_catalog', { p_barber: barber }],
]
t0 = performance.now()
const reads = await pool(READS, CONC, (k) => rpc(...calls[k % calls.length]))
const secs = (performance.now() - t0) / 1000
const lat = reads.map((r) => r.ms)
const failed = reads.filter((r) => !r.ok)
console.log(`\n2) ${READS} consultas públicas, ${CONC} a la vez`)
console.log(`   ${Math.round(READS / secs)} consultas/seg  latencia p50 ${pct(lat, 0.5)} ms  p95 ${pct(lat, 0.95)} ms  p99 ${pct(lat, 0.99)} ms`)
console.log(`   errores: ${failed.length}${failed.length ? ' ' + JSON.stringify([...new Set(failed.map((f) => f.status))]) : ''}`)

// 3) Limpieza: se liberan los horarios retenidos por la prueba
for (const w of winners) await rpc('release_hold', { p_appointment: JSON.parse(w.body) })
console.log(`\n3) limpieza: ${winners.length} retención(es) liberada(s)\n`)
