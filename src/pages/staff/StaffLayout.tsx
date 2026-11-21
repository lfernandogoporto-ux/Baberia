import { useEffect, useState, type ComponentType } from 'react'
import { Link, NavLink, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { Spinner } from '../../components/ui'
import { IconCalendar, IconCash, IconChart, IconLogout, IconMenu, IconUser } from '../../components/icons'

type Tab = [string, ComponentType<{ size?: number }>, string]

export default function StaffLayout() {
  const { loading, session, isStaff, isAdmin, profile, settings, signOut } = useAuth()
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  if (loading) return <div className="page"><Spinner /></div>
  if (!session || !isStaff) return <Navigate to="/login" replace />

  const showIncome = isAdmin || profile?.role === 'barber'
  const tabs: Tab[] = [
    ['/app', IconCalendar, 'Agenda'],
    ['/app/clientes', IconUser, 'Clientes'],
    ['/app/caja', IconCash, 'Caja'],
    ...(showIncome ? [['/app/ingresos', IconChart, 'Ingresos'] as Tab] : []),
    ['/app/mas', IconMenu, 'Más'],
  ]

  return (
    <>
      <header className="rail">
        <div className="rail-inner">
          <Link to="/app/perfil" style={{ color: 'inherit', textDecoration: 'none' }} aria-label="Mi perfil">
            <div className="brand">{settings?.name ?? 'Barbería Casa'}</div>
            <div className="who">{profile?.full_name}</div>
          </Link>
          <button className="btn small ghost" onClick={() => void signOut()}><IconLogout size={20} />Salir</button>
        </div>
        <div className="pole" aria-hidden />
        {!online && (
          <div className="offline-bar" role="status">Sin conexión. Ves lo último que se cargó; los cambios se podrán hacer al volver internet.</div>
        )}
      </header>
      <Outlet />
      <nav className="bottom-nav" aria-label="Principal">
        <ul>
          {tabs.map(([to, Icon, label]) => (
            <li key={to}>
              <NavLink to={to} end={to === '/app'}>
                <Icon size={24} />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}
