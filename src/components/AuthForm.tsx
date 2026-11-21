import { useState, type FormEvent } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import { normPhone } from '../lib/format'
import { clean, email as vEmail, focusFirstError, isValid, password as vPassword, strongPassword, personName, phoneBO, type Errors } from '../lib/validate'
import { Alert, Field } from './ui'

/** Traduce los mensajes de Supabase Auth a algo que se entienda */
export const authError = (m: string) => {
  const t = m.toLowerCase()
  if (t.includes('invalid login')) return 'El correo o la contraseña no coinciden. Revísalos e intenta otra vez.'
  if (t.includes('email logins are disabled') || t.includes('signups not allowed'))
    return 'El ingreso con correo está desactivado. El administrador debe activarlo en Supabase (Authentication, Sign In / Providers, Email).'
  if (t.includes('email not confirmed')) return 'Falta confirmar tu correo. Abre el enlace que te llegó por email y vuelve a intentar.'
  if (t.includes('already registered')) return 'Ese correo ya tiene cuenta. Toca “Ya tengo cuenta”.'
  if (t.includes('rate limit')) return 'Demasiados intentos seguidos. Espera unos minutos e intenta otra vez.'
  if (t.includes('password should be')) return 'La contraseña es muy débil: usa al menos 8 caracteres con letras y números.'
  if (t.includes('same password')) return 'La nueva contraseña debe ser distinta a la anterior.'
  return m
}

type K = 'name' | 'phone' | 'email' | 'password'

/** Formulario de entrar / crear cuenta, compartido por el equipo y los clientes */
export function AuthForm({ audience, onDone }: { audience: 'staff' | 'client'; onDone: () => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [f, setF] = useState({ name: '', phone: '', email: '', password: '' })
  const [errors, setErrors] = useState<Errors<K>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const set = (k: K, v: string) => {
    setF({ ...f, [k]: v })
    if (errors[k]) setErrors({ ...errors, [k]: '' })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    const errs = clean<K>({
      email: vEmail(f.email),
      password: mode === 'up' ? strongPassword(f.password) : vPassword(f.password),
      ...(mode === 'up' ? { name: personName(f.name), phone: phoneBO(f.phone, audience === 'staff') } : {}),
    })
    setErrors(errs)
    if (!isValid(errs)) return focusFirstError()
    setBusy(true)
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password })
        if (error) throw error
        onDone()
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: f.email.trim(), password: f.password,
          options: { data: { full_name: f.name.trim(), phone: f.phone ? normPhone(f.phone) : null } },
        })
        if (error) throw error
        if (!data.session) setInfo('Te enviamos un correo. Ábrelo para confirmar tu cuenta y luego entra aquí.')
        else onDone()
      }
    } catch (err) {
      setError(authError(errMsg(err)))
    } finally {
      setBusy(false)
    }
  }

  const forgot = async () => {
    const err = vEmail(f.email)
    if (err) { setErrors({ email: 'Escribe tu correo arriba para enviarte el enlace' }); return focusFirstError() }
    const { error } = await supabase.auth.resetPasswordForEmail(f.email.trim(), { redirectTo: `${window.location.origin}/perfil` })
    if (error) setError(authError(errMsg(error)))
    else setInfo('Si ese correo tiene cuenta, te llegará un enlace para crear una contraseña nueva.')
  }

  return (
    <>
      <form className="stack" onSubmit={submit} noValidate>
        {mode === 'up' && (
          <>
            <Field label="Nombre completo" error={errors.name}><input value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" /></Field>
            <Field label={audience === 'client' ? 'Celular' : 'Celular (opcional)'} error={errors.phone} hint={audience === 'client' ? 'Con este número te reconoce la barbería.' : undefined}>
              <input value={f.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" autoComplete="tel" placeholder="70012345" />
            </Field>
          </>
        )}
        <Field label="Correo" error={errors.email}><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" /></Field>
        <Field label="Contraseña" error={errors.password} hint={mode === 'up' ? 'Mínimo 8 caracteres, con letras y números.' : undefined}>
          <input type="password" value={f.password} onChange={(e) => set('password', e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
        </Field>
        {error && <Alert tone="bad">{error}</Alert>}
        {info && <Alert tone="ok">{info}</Alert>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Un momento…' : mode === 'in' ? 'Entrar' : 'Crear cuenta'}</button>
      </form>
      {mode === 'in' && <button className="btn ghost block" onClick={() => void forgot()}>Olvidé mi contraseña</button>}
      <button className="btn ghost block" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(''); setErrors({}) }}>
        {mode === 'in' ? 'Es mi primera vez: crear cuenta' : 'Ya tengo cuenta: entrar'}
      </button>
    </>
  )
}
