import { useEffect, useState, type FormEvent } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { normPhone } from '../lib/format'
import { clean, email as vEmail, focusFirstError, isValid, strongPassword, personName, phoneBO, type Errors } from '../lib/validate'
import { authError } from './AuthForm'
import { Alert, Field, useToast } from './ui'

const localPhone = (p: string | null | undefined) => (p ?? '').replace(/\D/g, '').replace(/^591/, '')

/** Mis datos: nombre, celular, correo y contraseña (para el equipo y para los clientes) */
export function ProfileForm({ onSaved }: { onSaved?: () => void }) {
  const { profile, session, isAdmin, settings, refresh, refreshSettings, signOut } = useAuth()
  const toast = useToast()
  const isClient = profile?.role === 'client'

  const [name, setName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState(localPhone(profile?.phone))
  const [shop, setShop] = useState(settings?.name ?? '')
  const [mail, setMail] = useState(session?.user.email ?? '')
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [errors, setErrors] = useState<Errors<'name' | 'phone' | 'shop' | 'mail' | 'pass' | 'pass2'>>({})
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { setName(profile?.full_name ?? ''); setPhone(localPhone(profile?.phone)) }, [profile?.full_name, profile?.phone])
  useEffect(() => setShop(settings?.name ?? ''), [settings?.name])
  useEffect(() => setMail(session?.user.email ?? ''), [session?.user.email])

  const clear = (k: keyof typeof errors) => errors[k] && setErrors({ ...errors, [k]: '' })

  const saveData = async (e: FormEvent) => {
    e.preventDefault()
    setMsg(null)
    const errs = clean({
      name: personName(name),
      phone: phoneBO(phone, !isClient),
      shop: isAdmin ? (!shop.trim() ? 'Escribe el nombre de la barbería' : shop.trim().length > 60 ? 'Muy largo (máximo 60)' : '') : '',
    })
    setErrors(errs)
    if (!isValid(errs)) return focusFirstError()
    setBusy(true)
    try {
      if (isClient) {
        const { error } = await supabase.rpc('update_my_client', { p_name: name.trim(), p_phone: normPhone(phone) })
        if (error) throw error
      } else {
        const { error } = await supabase.from('profiles').update({ full_name: name.trim(), phone: phone ? normPhone(phone) : null }).eq('id', profile!.id)
        if (error) throw error
      }
      if (isAdmin && shop.trim() !== settings?.name) {
        const { error } = await supabase.from('shop_settings').update({ name: shop.trim() }).eq('id', 1)
        if (error) throw error
        await refreshSettings()
      }
      await refresh()
      toast('Datos guardados')
      onSaved?.()
    } catch (err) {
      const m = errMsg(err)
      if (m.includes('celular ya está registrado')) { setErrors({ phone: m }); focusFirstError() } else setMsg({ ok: false, text: m })
    } finally {
      setBusy(false)
    }
  }

  const saveEmail = async (e: FormEvent) => {
    e.preventDefault()
    setMsg(null)
    const err = vEmail(mail) || (mail.trim().toLowerCase() === session?.user.email?.toLowerCase() ? 'Es el mismo correo que ya tienes' : '')
    setErrors({ ...errors, mail: err })
    if (err) return focusFirstError()
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ email: mail.trim() })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: authError(errMsg(error)) })
    setMsg({ ok: true, text: 'Te enviamos un correo para confirmar el cambio. Revisa tu correo actual y el nuevo; el cambio se aplica al confirmar.' })
  }

  const savePass = async (e: FormEvent) => {
    e.preventDefault()
    setMsg(null)
    const errs = clean({ pass: strongPassword(pass), pass2: !pass2 ? 'Repite la contraseña' : pass2 !== pass ? 'Las contraseñas no coinciden' : '' })
    setErrors({ ...errors, ...errs, pass: errs.pass ?? '', pass2: errs.pass2 ?? '' })
    if (!isValid(errs)) return focusFirstError()
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pass })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: authError(errMsg(error)) })
    setPass(''); setPass2('')
    toast('Contraseña cambiada')
  }

  return (
    <div className="stack">
      {msg && <Alert tone={msg.ok ? 'ok' : 'bad'}>{msg.text}</Alert>}

      <form className="panel stack" onSubmit={saveData} noValidate>
        <h2>Mis datos</h2>
        <Field label="Nombre completo" error={errors.name}><input value={name} onChange={(e) => { setName(e.target.value); clear('name') }} autoComplete="name" /></Field>
        <Field label={isClient ? 'Celular' : 'Celular (opcional)'} error={errors.phone} hint={isClient ? 'Con este número te reconoce la barbería.' : undefined}>
          <input value={phone} onChange={(e) => { setPhone(e.target.value); clear('phone') }} inputMode="tel" autoComplete="tel" placeholder="70012345" />
        </Field>
        {isAdmin && (
          <Field label="Nombre de la barbería" error={errors.shop} hint="Aparece en el inicio, en las reservas y en la pantalla del local.">
            <input value={shop} onChange={(e) => { setShop(e.target.value); clear('shop') }} />
          </Field>
        )}
        <button className="btn primary block" disabled={busy}>Guardar datos</button>
      </form>

      <form className="panel stack" onSubmit={saveEmail} noValidate>
        <h2>Correo</h2>
        <Field label="Correo para entrar" error={errors.mail}><input type="email" value={mail} onChange={(e) => { setMail(e.target.value); clear('mail') }} autoComplete="email" /></Field>
        <button className="btn block" disabled={busy}>Cambiar correo</button>
      </form>

      <form className="panel stack" onSubmit={savePass} noValidate>
        <h2>Contraseña</h2>
        <Field label="Contraseña nueva" error={errors.pass} hint="Mínimo 8 caracteres, con letras y números."><input type="password" value={pass} onChange={(e) => { setPass(e.target.value); clear('pass') }} autoComplete="new-password" /></Field>
        <Field label="Repite la contraseña nueva" error={errors.pass2}><input type="password" value={pass2} onChange={(e) => { setPass2(e.target.value); clear('pass2') }} autoComplete="new-password" /></Field>
        <button className="btn block" disabled={busy}>Cambiar contraseña</button>
      </form>

      <button className="btn ghost danger block" onClick={() => void signOut()}>Cerrar sesión</button>
    </div>
  )
}
