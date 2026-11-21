import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function Home() {
  const { settings, isStaff, profile, loading } = useAuth()
  const name = settings?.name ?? 'Barbería Casa'
  const isClient = profile?.role === 'client'
  return (
    <div className="home">
      <header className="home-sign">
        <h1 className="shop">{name}</h1>
        {settings?.address && <p className="addr">{settings.address}</p>}
      </header>
      <div className="pole thick" aria-hidden />
      <main className="home-body">
        <p className="lede">
          {isClient ? `Hola, ${profile!.full_name.split(' ')[0]}. ` : ''}Elige con quién te cortas, qué te haces y a qué hora. Te guardamos el lugar.
        </p>
        <Link className="btn primary block" to="/reservar">Reservar mi corte</Link>
        {!loading && !isStaff && (
          <Link className="btn block" to="/cuenta">{isClient ? 'Mis reservas y mi tarjeta' : 'Entrar a mi cuenta'}</Link>
        )}
        {settings?.queue_enabled && <Link className="btn ghost block" to="/fila">Estoy en el local: anotarme en la fila</Link>}
        <div className="spacer" />
        {!loading &&
          (isStaff ? (
            <Link className="btn block" to="/app">Abrir mi agenda</Link>
          ) : (
            <Link className="btn ghost block" to="/login">Soy parte del equipo</Link>
          ))}
      </main>
    </div>
  )
}
