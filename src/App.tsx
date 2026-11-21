import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Home from './pages/Home'
import Login from './pages/Login'
import Booking from './pages/Booking'
import BookingDone from './pages/BookingDone'
import { QueueJoin, QueueStatus } from './pages/Queue'
import Display from './pages/Display'
import Card from './pages/Card'
import Account from './pages/Account'
import Profile from './pages/Profile'
import StaffLayout from './pages/staff/StaffLayout'
import Agenda from './pages/staff/Agenda'
import Caja from './pages/staff/Caja'
import Clients from './pages/staff/Clients'
import Income from './pages/staff/Income'
import More from './pages/staff/More'
import Team from './pages/staff/Team'
import Business from './pages/staff/Business'
import Inventory from './pages/staff/Inventory'
import Attendance from './pages/staff/Attendance'
import Gallery from './pages/staff/Gallery'

function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth()
  if (loading) return null
  return isAdmin ? <>{children}</> : <Navigate to="/app" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/reservar" element={<Booking />} />
      <Route path="/reserva/:id" element={<BookingDone />} />
      <Route path="/fila" element={<QueueJoin />} />
      <Route path="/fila/:id" element={<QueueStatus />} />
      <Route path="/pantalla" element={<Display />} />
      <Route path="/tarjeta/:token" element={<Card />} />
      <Route path="/cuenta" element={<Account />} />
      <Route path="/perfil" element={<Profile />} />
      <Route path="/app" element={<StaffLayout />}>
        <Route index element={<Agenda />} />
        <Route path="clientes" element={<Clients />} />
        <Route path="caja" element={<Caja />} />
        <Route path="pagos" element={<Navigate to="/app/caja" replace />} />
        <Route path="ingresos" element={<Income />} />
        <Route path="mas" element={<More />} />
        <Route path="inventario" element={<Inventory />} />
        <Route path="asistencia" element={<Attendance />} />
        <Route path="galeria" element={<Gallery />} />
        <Route path="perfil" element={<Profile inApp />} />
        <Route path="equipo" element={<AdminOnly><Team /></AdminOnly>} />
        <Route path="negocio" element={<AdminOnly><Business /></AdminOnly>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
