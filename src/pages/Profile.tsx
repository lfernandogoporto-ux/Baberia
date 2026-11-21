import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { ProfileForm } from '../components/ProfileForm'
import { Spinner } from '../components/ui'
import { IconChevronLeft } from '../components/icons'

/** /perfil y /app/perfil: mis datos, correo y contraseña. También es donde llega el enlace de "olvidé mi contraseña". */
export default function Profile({ inApp = false }: { inApp?: boolean }) {
  const { session, loading, isStaff } = useAuth()
  if (loading) return <div className="page"><Spinner rows={3} /></div>
  if (!session) return <Navigate to="/cuenta" replace />
  return (
    <div className="page stack">
      {!inApp && <Link to={isStaff ? '/app' : '/cuenta'} className="btn icon ghost" aria-label="Volver"><IconChevronLeft /></Link>}
      <h1>Mi perfil</h1>
      <ProfileForm />
    </div>
  )
}
