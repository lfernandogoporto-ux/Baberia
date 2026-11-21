import { useState, type ComponentType, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { enableStaffPush, pushSupported } from '../../lib/push'
import { Modal, useToast } from '../../components/ui'
import { QR } from '../../components/qr'
import { IconBell, IconBox, IconChevronRight, IconImage, IconPeople, IconPin, IconQr, IconShop, IconTv, IconUser } from '../../components/icons'
import { errMsg } from '../../lib/supabase'

function Row({ to, href, onClick, Icon, title, sub }: { to?: string; href?: string; onClick?: () => void; Icon: ComponentType<{ size?: number }>; title: string; sub: string }) {
  const body: ReactNode = (
    <>
      <span className="monogram" aria-hidden><Icon size={22} /></span>
      <span className="grow"><span className="title">{title}</span><span className="sub" style={{ display: 'block' }}>{sub}</span></span>
      <IconChevronRight className="muted" />
    </>
  )
  if (to) return <Link className="item" to={to} style={{ textDecoration: 'none', color: 'inherit' }}>{body}</Link>
  if (href) return <a className="item" href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>{body}</a>
  return <button className="item" onClick={onClick}>{body}</button>
}

export default function More() {
  const { isAdmin, profile, settings } = useAuth()
  const toast = useToast()
  const [qrs, setQrs] = useState(false)
  const origin = window.location.origin
  const cuts = !!profile?.is_barber

  const enablePush = async () => {
    try {
      await enableStaffPush()
      toast('Listo: te avisaremos antes de cada cita')
    } catch (e) {
      toast(errMsg(e), true)
    }
  }

  return (
    <div className="page stack">
      <h1>Más</h1>
      <div className="list">
        <Row to="/app/perfil" Icon={IconUser} title="Mi perfil" sub={isAdmin ? 'Tu nombre, correo, contraseña y el nombre de la barbería' : 'Tu nombre, correo y contraseña'} />
        {isAdmin && <Row to="/app/equipo" Icon={IconPeople} title="Equipo" sub="Invitar, horarios, precios por barbero y forma de pago" />}
        {isAdmin && <Row to="/app/negocio" Icon={IconShop} title="Mi negocio" sub="Servicios, QR de pago, fidelidad, fila y ubicación" />}
        <Row to="/app/inventario" Icon={IconBox} title="Inventario" sub="Productos, ventas, compras y lo que se está acabando" />
        {(settings?.attendance_enabled || isAdmin) && <Row to="/app/asistencia" Icon={IconPin} title="Asistencia" sub="Marcar llegada y salida en el local" />}
        {(cuts || isAdmin) && <Row to="/app/galeria" Icon={IconImage} title="Galería de trabajos" sub="Fotos de cortes que ven los clientes al reservar" />}
        <Row href={`${origin}/pantalla`} Icon={IconTv} title="Pantalla del local" sub="Ábrela en una TV: muestra la fila y quién sigue" />
        <Row onClick={() => setQrs(true)} Icon={IconQr} title="Códigos QR para imprimir" sub="Para reservar y para anotarse en la fila" />
        {pushSupported() && <Row onClick={() => void enablePush()} Icon={IconBell} title="Recordatorios en este celular" sub={`Te avisa ${settings?.reminder_minutes ?? 30} min antes de cada cita`} />}
      </div>

      {qrs && (
        <Modal title="Códigos QR" onClose={() => setQrs(false)}>
          <div className="row wrap" style={{ justifyContent: 'space-around', gap: 24 }}>
            <figure className="stack tight" style={{ margin: 0, alignItems: 'center' }}>
              <QR value={`${origin}/reservar`} label="QR para reservar" size={180} />
              <figcaption className="center"><b>Reserva tu corte</b><br /><span className="muted small">{origin}/reservar</span></figcaption>
            </figure>
            {settings?.queue_enabled && (
              <figure className="stack tight" style={{ margin: 0, alignItems: 'center' }}>
                <QR value={`${origin}/fila`} label="QR para anotarse en la fila" size={180} />
                <figcaption className="center"><b>Anótate en la fila</b><br /><span className="muted small">{origin}/fila</span></figcaption>
              </figure>
            )}
          </div>
          <p className="muted small">Usa el botón de imprimir del navegador o toma una captura. Pega el de la fila en la puerta.</p>
          <button className="btn block" onClick={() => window.print()}>Imprimir</button>
        </Modal>
      )}
    </div>
  )
}
