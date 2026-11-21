export type Role = 'admin' | 'barber' | 'receptionist' | 'client'
export type Status = 'held' | 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'
export type PayMethod = 'cash' | 'qr' | 'transfer'
export type PayStatus = 'pending' | 'to_verify' | 'confirmed' | 'rejected'

export interface Profile {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  role: Role
  is_barber: boolean
  active: boolean
  avatar_url: string | null
  speed_factor: number
  permissions: Record<string, boolean>
  qr_image_path: string | null
  pay_mode: PayMode
  pay_percent: number
  pay_salary: number
  pay_chair_rent: number
}

export type PayMode = 'none' | 'percent' | 'salary' | 'chair_rent' | 'mixed'

export interface Service {
  id: string
  name: string
  category: string
  description: string | null
  base_price: number
  base_minutes: number
  active: boolean
  sort_order: number
}

export interface CatalogItem {
  service_id: string
  name: string
  category: string
  description: string | null
  price: number
  minutes: number
}

export interface Barber {
  id: string
  full_name: string
  avatar_url: string | null
  rating?: number | null
  ratings_count?: number
  photos?: string[]
}

export interface Settings {
  name: string
  address: string | null
  timezone: string
  currency: string
  qr_image_path: string | null
  slot_step_minutes: number
  buffer_minutes: number
  hold_minutes: number
  min_notice_minutes: number
  cancel_limit_minutes: number
  reminder_minutes: number
  max_days_ahead: number
  no_show_warning_threshold: number
  allow_barber_qr: boolean
  latitude: number | null
  longitude: number | null
  checkin_radius_m: number
  loyalty_enabled: boolean
  loyalty_stamps: number
  loyalty_reward: string
  loyalty_mid_at: number | null
  loyalty_mid_reward: string | null
  reactivation_enabled: boolean
  reactivation_days: number
  reactivation_message: string
  queue_enabled: boolean
  attendance_enabled: boolean
  phone: string | null
  whatsapp: string | null
  instagram: string | null
  maps_url: string | null
  about: string | null
  hide_prices: boolean
}

export interface CardInfo {
  enabled: boolean
  shop: string
  first_name: string
  full_name?: string
  client_id: string
  token: string
  card_id: string | null
  stamps: number
  required: number
  ready: boolean
  mid_at: number | null
  mid_reward: string | null
  mid_redeemed: boolean
  reward: string
  completed_cards: number
}

export interface QueueEntry {
  id: string
  name: string
  phone: string | null
  barber_id: string | null
  service_ids: string[]
  status: 'waiting' | 'serving' | 'done' | 'left'
  created_at: string
}

export interface ClientRow {
  id: string
  full_name: string
  phone: string | null
  visits: number
  last_visit: string | null
  total_spent: number
  no_shows: number
  no_shows_forgiven: number
  stamps: number | null
  required: number | null
  card_token: string
}

export interface Product {
  id: string
  name: string
  unit: string
  cost: number
  price: number
  stock: number
  min_stock: number
  active: boolean
}

export interface Payment {
  id: string
  appointment_id: string
  amount: number
  method: PayMethod
  status: PayStatus
  proof_path: string | null
  created_at: string
}

export interface Appointment {
  id: string
  barber_id: string
  starts_at: string
  ends_at: string
  status: Status
  source: 'reservation' | 'walk_in'
  total_price: number
  actual_started_at: string | null
  client_id: string | null
  photo_path: string | null
  clients: { full_name: string; phone: string | null; no_shows: number; no_shows_forgiven: number } | null
  appointment_items: { name: string; price: number; minutes: number }[]
  payments: Payment[]
}

export interface WorkingHour {
  id: string
  barber_id: string
  weekday: number
  start_time: string
  end_time: string
}

export interface BarberService {
  barber_id: string
  service_id: string
  enabled: boolean
  price_override: number | null
  minutes_override: number | null
}

export interface IncomeRow {
  barber_id: string
  barber_name: string
  cuts: number
  reservation_cuts: number
  walk_in_cuts: number
  reservation_total: number
  walk_in_total: number
  total: number
}

export interface DayRow {
  day: string
  cuts: number
  total: number
}
