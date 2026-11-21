import { useCallback, useEffect, useState } from 'react'
import { supabase, errMsg, publicUrl } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import type { Service, Settings } from '../../lib/types'
import { mins, money } from '../../lib/format'
import { Field, GroupError, Modal, Spinner, useToast } from '../../components/ui'
import { clean, fileImage, focusFirstError, isValid, number, type Errors } from '../../lib/validate'
import { IconChevronRight, IconPlus } from '../../components/icons'

export default function Business() {
  const [tab, setTab] = useState<'servicios' | 'ajustes'>('servicios')
  return (
    <div className="page stack">
      <h1>Mi negocio</h1>
      <div className="seg" role="tablist" aria-label="Sección">
        <button role="tab" aria-selected={tab === 'servicios'} className="chip" onClick={() => setTab('servicios')}>Servicios y precios</button>
        <button role="tab" aria-selected={tab === 'ajustes'} className="chip" onClick={() => setTab('ajustes')}>Ajustes y QR</button>
      </div>
      {tab === 'servicios' ? <Services /> : <SettingsForm />}
    </div>
  )
}

function Services() {
  const toast = useToast()
  const [list, setList] = useState<Service[] | null>(null)
  const [edit, setEdit] = useState<Partial<Service> | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('services').select('*').order('sort_order').order('name')
    setList((data as Service[]) ?? [])
  }, [])
  useEffect(() => { void load() }, [load])

  const [errors, setErrors] = useState<Errors<'name' | 'price' | 'minutes' | 'order'>>({})
  const patch = (p: Partial<Service>, k: 'name' | 'price' | 'minutes' | 'order') => { setEdit({ ...edit, ...p }); setErrors({ ...errors, [k]: '' }) }

  const save = async () => {
    if (!edit) return
    const name = edit.name?.trim() ?? ''
    const errs = clean({
      name: !name ? 'Escribe el nombre del servicio' : name.length > 40 ? 'El nombre es muy largo (máximo 40)'
        : (list ?? []).some((s) => s.id !== edit.id && s.name.toLowerCase() === name.toLowerCase()) ? 'Ya existe un servicio con ese nombre' : '',
      price: number(edit.base_price ?? '', { min: 0, max: 10000, label: 'El precio' }),
      minutes: number(edit.base_minutes ?? '', { min: 5, max: 480, integer: true, label: 'La duración' }),
      order: number(edit.sort_order ?? 0, { min: 0, max: 999, integer: true, label: 'El orden' }),
    })
    setErrors(errs)
    if (!isValid(errs)) return focusFirstError()
    const row = {
      name, category: edit.category?.trim() || 'otro', base_price: Number(edit.base_price ?? 0),
      base_minutes: Number(edit.base_minutes ?? 30), active: edit.active ?? true, sort_order: Number(edit.sort_order ?? 0),
    }
    const { error } = edit.id ? await supabase.from('services').update(row).eq('id', edit.id) : await supabase.from('services').insert(row)
    if (error) return toast(errMsg(error), true)
    setEdit(null)
    void load()
  }

  return (
    <div className="stack">
      <p className="ink2 small">Estos son el precio y el tiempo normales. Si un barbero cobra distinto o es más rápido, ajústalo en Equipo.</p>
      {list === null ? <Spinner rows={4} /> : (
        <div className="list">
          {list.map((s) => (
            <button key={s.id} className="item" onClick={() => setEdit(s)} style={s.active ? undefined : { opacity: 0.55 }}>
              <span className="grow">
                <span className="title">{s.name}</span>
                <span className="sub" style={{ display: 'block' }}>Unos {mins(s.base_minutes)}{!s.active && ', oculto para reservar'}</span>
              </span>
              <span className="price">{money(s.base_price)}</span>
              <IconChevronRight className="muted" />
            </button>
          ))}
        </div>
      )}
      <button className="btn block" onClick={() => setEdit({ active: true, base_minutes: 30, base_price: 0, sort_order: (list?.length ?? 0) + 1 })}><IconPlus size={20} />Agregar servicio</button>
      {edit && (
        <Modal title={edit.id ? 'Editar servicio' : 'Nuevo servicio'} onClose={() => { setEdit(null); setErrors({}) }}>
          <Field label="Nombre" error={errors.name}><input value={edit.name ?? ''} onChange={(e) => patch({ name: e.target.value }, 'name')} placeholder="Ej. Corte + barba" /></Field>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <Field label="Precio (Bs)" error={errors.price}><input type="number" min="0" step="0.5" inputMode="decimal" value={edit.base_price ?? ''} onChange={(e) => patch({ base_price: e.target.value as unknown as number }, 'price')} /></Field>
            <Field label="Duración (min)" error={errors.minutes}><input type="number" min="5" step="5" inputMode="numeric" value={edit.base_minutes ?? ''} onChange={(e) => patch({ base_minutes: e.target.value as unknown as number }, 'minutes')} /></Field>
          </div>
          <Field label="Orden en la lista" error={errors.order} hint="Los números más bajos aparecen primero."><input type="number" min="0" step="1" value={edit.sort_order ?? 0} onChange={(e) => patch({ sort_order: e.target.value as unknown as number }, 'order')} /></Field>
          <label className="check-row"><input type="checkbox" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />Los clientes lo pueden reservar</label>
          <button className="btn primary block" onClick={() => void save()}>Guardar servicio</button>
        </Modal>
      )}
    </div>
  )
}

function SettingsForm() {
  const { settings, refreshSettings } = useAuth()
  const toast = useToast()
  const [s, setS] = useState<Settings | null>(settings)
  const [uploading, setUploading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  useEffect(() => setS(settings), [settings])
  if (!s) return <Spinner />

  const num = (k: keyof Settings, label: string, help?: string) => (
    <Field label={label} hint={help} error={errors[k]}>
      <input type="number" min="0" step={1} inputMode="numeric" value={(s[k] as number | null) ?? ''}
        onChange={(e) => { setS({ ...s, [k]: e.target.value === '' ? ('' as unknown as number) : Number(e.target.value) }); setErrors({ ...errors, [k]: '' }) }} />
    </Field>
  )

  const RULES: [keyof Settings, number, number, string][] = [
    ['slot_step_minutes', 5, 60, 'Cada cuántos minutos'], ['buffer_minutes', 0, 60, 'La pausa'], ['hold_minutes', 1, 30, 'El tiempo para confirmar'],
    ['min_notice_minutes', 0, 1440, 'La anticipación'], ['cancel_limit_minutes', 0, 2880, 'El límite para cancelar'],
    ['max_days_ahead', 1, 180, 'Los días para reservar'], ['reminder_minutes', 5, 1440, 'El recordatorio'], ['no_show_warning_threshold', 1, 20, 'Las faltas'],
  ]

  const save = async () => {
    const errs: Record<string, string> = {}
    const nm = s.name.trim()
    if (!nm) errs.name = 'Escribe el nombre de la barbería'
    else if (nm.length > 60) errs.name = 'El nombre es muy largo (máximo 60)'
    if ((s.address ?? '').length > 120) errs.address = 'La dirección es muy larga (máximo 120)'
    for (const [k, min, max, label] of RULES) {
      const e = number(s[k] as number, { min, max, integer: true, label })
      if (e) errs[k] = e
    }
    if (s.slot_step_minutes && ![5, 10, 15, 20, 30, 60].includes(Number(s.slot_step_minutes))) errs.slot_step_minutes ||= 'Usa 5, 10, 15, 20, 30 o 60'
    if (s.loyalty_enabled) {
      const e1 = number(s.loyalty_stamps, { min: 2, max: 50, integer: true, label: 'Los sellos' })
      if (e1) errs.loyalty_stamps = e1
      if (!s.loyalty_reward.trim()) errs.loyalty_reward = 'Escribe qué se gana al llenar la tarjeta'
      if (s.loyalty_mid_at) {
        const e2 = number(s.loyalty_mid_at, { min: 1, max: Number(s.loyalty_stamps) - 1, integer: true, label: 'El sello del premio intermedio' })
        if (e2) errs.loyalty_mid_at = e2
        if (!s.loyalty_mid_reward?.trim()) errs.loyalty_mid_reward = 'Escribe cuál es el premio intermedio'
      }
    }
    if (s.reactivation_enabled) {
      const e3 = number(s.reactivation_days, { min: 7, max: 365, integer: true, label: 'Los días' })
      if (e3) errs.reactivation_days = e3
      if (!s.reactivation_message.trim()) errs.reactivation_message = 'Escribe el mensaje'
      else if (s.reactivation_message.length > 500) errs.reactivation_message = 'El mensaje es muy largo (máximo 500)'
    }
    if (s.attendance_enabled) {
      if (s.latitude == null) errs.location = 'Marca la ubicación del local para poder usar la asistencia'
      const e4 = number(s.checkin_radius_m, { min: 20, max: 1000, integer: true, label: 'El radio' })
      if (e4) errs.checkin_radius_m = e4
    }
    setErrors(errs)
    if (Object.keys(errs).length) { toast('Revisa los campos marcados en rojo', true); return focusFirstError() }
    const { error } = await supabase.from('shop_settings').update({
      name: s.name, address: s.address, slot_step_minutes: s.slot_step_minutes, buffer_minutes: s.buffer_minutes,
      hold_minutes: s.hold_minutes, min_notice_minutes: s.min_notice_minutes, cancel_limit_minutes: s.cancel_limit_minutes,
      reminder_minutes: s.reminder_minutes, max_days_ahead: s.max_days_ahead, no_show_warning_threshold: s.no_show_warning_threshold,
      allow_barber_qr: s.allow_barber_qr, updated_at: new Date().toISOString(),
      latitude: s.latitude, longitude: s.longitude, checkin_radius_m: s.checkin_radius_m,
      attendance_enabled: s.attendance_enabled, queue_enabled: s.queue_enabled,
      loyalty_enabled: s.loyalty_enabled, loyalty_stamps: s.loyalty_stamps, loyalty_reward: s.loyalty_reward.trim() || 'Corte gratis',
      loyalty_mid_at: s.loyalty_mid_at || null, loyalty_mid_reward: s.loyalty_mid_reward?.trim() || null,
      reactivation_enabled: s.reactivation_enabled, reactivation_days: s.reactivation_days, reactivation_message: s.reactivation_message,
    }).eq('id', 1)
    if (error) return toast(errMsg(error), true)
    await refreshSettings()
    toast('Ajustes guardados')
  }

  const useHere = () => {
    if (!('geolocation' in navigator)) return toast('Este dispositivo no permite usar la ubicación', true)
    setLocating(true)
    navigator.geolocation.getCurrentPosition((pos) => {
      setLocating(false)
      setS((cur) => cur && { ...cur, latitude: pos.coords.latitude, longitude: pos.coords.longitude })
      toast(`Ubicación tomada (precisión ${Math.round(pos.coords.accuracy)} m). Guarda los ajustes.`)
    }, () => { setLocating(false); toast('No pudimos obtener la ubicación. Revisa el permiso.', true) }, { enableHighAccuracy: true, timeout: 15000 })
  }

  const uploadQr = async (f: File | undefined) => {
    if (!f) return
    setUploading(true)
    try {
      const ext = (f.name.split('.').pop() ?? 'png').toLowerCase().replace(/[^a-z0-9]/g, '')
      const path = `qr/local-${Date.now()}.${ext}`
      const up = await supabase.storage.from('shop').upload(path, f, { contentType: f.type })
      if (up.error) throw up.error
      const { error } = await supabase.from('shop_settings').update({ qr_image_path: path }).eq('id', 1)
      if (error) throw error
      await refreshSettings()
      toast('QR actualizado')
    } catch (e) {
      toast(errMsg(e), true)
    } finally {
      setUploading(false)
    }
  }

  const qr = publicUrl(s.qr_image_path)
  return (
    <div className="stack">
      <Field label="Nombre de la barbería" error={errors.name}><input value={s.name} onChange={(e) => { setS({ ...s, name: e.target.value }); setErrors({ ...errors, name: '' }) }} /></Field>
      <Field label="Dirección" error={errors.address}><input value={s.address ?? ''} onChange={(e) => { setS({ ...s, address: e.target.value }); setErrors({ ...errors, address: '' }) }} placeholder="Ej. Av. Heroínas 123, Cochabamba" /></Field>

      <section className="panel stack">
        <h2>QR de pago del local</h2>
        {qr
          ? <img src={qr} alt="QR de pago del local" style={{ width: '100%', maxWidth: 240, margin: '0 auto', borderRadius: 12, background: '#fff', padding: 8 }} />
          : <p className="ink2 small">Todavía no subiste tu QR. Los clientes lo ven al pagar por adelantado.</p>}
        <Field label={qr ? 'Cambiar imagen del QR' : 'Subir imagen del QR'} error={errors.qr} hint="Foto o captura del QR de tu banco, hasta 5 MB.">
          <input type="file" accept="image/*" disabled={uploading} onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            const err = fileImage(f)
            setErrors({ ...errors, qr: err })
            if (!err && f) void uploadQr(f)
          }} />
        </Field>
        <label className="check-row"><input type="checkbox" checked={s.allow_barber_qr} onChange={(e) => setS({ ...s, allow_barber_qr: e.target.checked })} />Cada barbero puede usar su propio QR</label>
      </section>

      <section className="panel stack">
        <h2>Reservas</h2>
        <div className="row wrap" style={{ alignItems: 'flex-start' }}>
          {num('slot_step_minutes', 'Horarios cada (min)', 'Cada cuánto se ofrece una hora: 15 da 9:00, 9:15, 9:30…')}
          {num('buffer_minutes', 'Pausa entre clientes (min)')}
        </div>
        <div className="row wrap" style={{ alignItems: 'flex-start' }}>
          {num('hold_minutes', 'Tiempo para confirmar (min)', 'Lo que se guarda un horario mientras el cliente pone sus datos.')}
          {num('min_notice_minutes', 'Anticipación mínima (min)')}
        </div>
        <div className="row wrap" style={{ alignItems: 'flex-start' }}>
          {num('cancel_limit_minutes', 'Cancelar hasta (min antes)')}
          {num('max_days_ahead', 'Reservar hasta (días)')}
        </div>
        <div className="row wrap" style={{ alignItems: 'flex-start' }}>
          {num('reminder_minutes', 'Recordatorio (min antes)')}
          {num('no_show_warning_threshold', 'Avisar tras (faltas)')}
        </div>
      </section>

      <section className="panel stack">
        <h2>Fila digital</h2>
        <label className="check-row"><input type="checkbox" checked={s.queue_enabled} onChange={(e) => setS({ ...s, queue_enabled: e.target.checked })} />Los que llegan sin reserva se anotan con el QR de la puerta</label>
        <p className="muted small">El QR para imprimir está en Más, Códigos QR. La fila aparece arriba en la Agenda.</p>
      </section>

      <section className="panel stack">
        <h2>Tarjeta de fidelidad</h2>
        <label className="check-row"><input type="checkbox" checked={s.loyalty_enabled} onChange={(e) => setS({ ...s, loyalty_enabled: e.target.checked })} />Activar tarjeta de sellos</label>
        {s.loyalty_enabled && (
          <>
            <div className="row wrap" style={{ alignItems: 'flex-start' }}>
              {num('loyalty_stamps', 'Sellos para llenar la tarjeta')}
              <Field label="Premio al llenarla" error={errors.loyalty_reward}><input value={s.loyalty_reward} onChange={(e) => { setS({ ...s, loyalty_reward: e.target.value }); setErrors({ ...errors, loyalty_reward: '' }) }} placeholder="Corte gratis" /></Field>
            </div>
            <div className="row wrap" style={{ alignItems: 'flex-start' }}>
              <Field label="Premio intermedio en el sello" error={errors.loyalty_mid_at} hint="Déjalo vacío si solo hay premio al final.">
                <input type="number" min="1" max={s.loyalty_stamps - 1} inputMode="numeric" value={s.loyalty_mid_at ?? ''} onChange={(e) => { setS({ ...s, loyalty_mid_at: e.target.value ? Number(e.target.value) : null }); setErrors({ ...errors, loyalty_mid_at: '' }) }} />
              </Field>
              <Field label="Premio intermedio" error={errors.loyalty_mid_reward}><input value={s.loyalty_mid_reward ?? ''} onChange={(e) => { setS({ ...s, loyalty_mid_reward: e.target.value }); setErrors({ ...errors, loyalty_mid_reward: '' }) }} placeholder="Ceja gratis" /></Field>
            </div>
            <p className="muted small">Un sello por visita. Se pone al terminar el corte o escaneando la tarjeta del cliente en Clientes. Al llenarse, empieza una nueva y la anterior queda en su historial.</p>
          </>
        )}
      </section>

      <section className="panel stack">
        <h2>Clientes que no vuelven</h2>
        <label className="check-row"><input type="checkbox" checked={s.reactivation_enabled} onChange={(e) => setS({ ...s, reactivation_enabled: e.target.checked })} />Mostrar botón “Invitar a volver” en Clientes</label>
        {s.reactivation_enabled && (
          <>
            {num('reactivation_days', 'Considerar inactivo después de (días)')}
            <Field label="Mensaje" error={errors.reactivation_message} hint="Usa {nombre}, {local} y {enlace}; se reemplazan solos. Se envía por WhatsApp desde tu celular.">
              <textarea rows={3} maxLength={500} value={s.reactivation_message} onChange={(e) => { setS({ ...s, reactivation_message: e.target.value }); setErrors({ ...errors, reactivation_message: '' }) }} />
            </Field>
          </>
        )}
      </section>

      <section className="panel stack">
        <h2>Asistencia del equipo</h2>
        <label className="check-row"><input type="checkbox" checked={s.attendance_enabled} onChange={(e) => setS({ ...s, attendance_enabled: e.target.checked })} />Marcar llegada y salida con la ubicación del celular</label>
        {s.attendance_enabled && (
          <>
            <p className="ink2 small">
              {s.latitude != null ? `Ubicación guardada (${s.latitude.toFixed(5)}, ${s.longitude?.toFixed(5)}).` : 'Todavía no marcaste dónde está el local.'} Hazlo parado dentro del local.
            </p>
            <div className={errors.location ? 'field invalid' : 'stack tight'}>
              <button type="button" className="btn" disabled={locating} onClick={() => { setErrors({ ...errors, location: '' }); useHere() }}>{locating ? 'Buscando…' : 'Usar mi ubicación actual como el local'}</button>
              {errors.location && <GroupError>{errors.location}</GroupError>}
            </div>
            {num('checkin_radius_m', 'Radio permitido (metros)', 'Entre 50 y 150 m funciona bien. El GPS del celular puede fallar unos 20 m.')}
            <p className="muted small">Avisa al equipo que la app guarda la distancia al local cuando marcan; no sigue su ubicación en otro momento.</p>
          </>
        )}
      </section>
      <button className="btn primary block" onClick={() => void save()}>Guardar ajustes</button>
    </div>
  )
}
