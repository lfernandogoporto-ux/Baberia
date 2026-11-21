import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Alert, Spinner } from '../components/ui'
import { AuthForm } from '../components/AuthForm'
import { IconChevronLeft } from '../components/icons'

/** Entrada del equipo (barberos, recepción y administración) */
export default function Login() {
  const { session, isStaff, loading, settings, profile } = useAuth()
  const nav = useNavigate()

  if (loading) return <div className="page"><Spinner rows={2} /></div>
  if (session && isStaff) return <Navigate to="/app" replace />

  return (
    <div className="page stack">
      <Link to="/" className="btn icon ghost" aria-label="Volver al inicio"><IconChevronLeft /></Link>
      <div className="stack tight">
        <h1>Entrar al equipo</h1>
        <p className="ink2">{settings?.name ?? 'Bunny Barber Studio'}. Acceso para barberos, recepción y administración.</p>
      </div>
      {session && profile?.role === 'client' && (
        <Alert tone="warn">
          Tu cuenta es de cliente. Si trabajas aquí, pide al administrador que te invite con este mismo correo. <Link to="/cuenta">Ir a mi cuenta de cliente</Link>
        </Alert>
      )}
      <AuthForm audience="staff" onDone={() => nav('/app', { replace: true })} />
      <p className="muted small center">¿Eres cliente? <Link to="/cuenta">Entra aquí a tu cuenta</Link></p>
    </div>
  )
}
