-- Etapa 1: esquema base de la barbería
create extension if not exists btree_gist with schema extensions;

create type public.user_role as enum ('admin','barber','receptionist','client');
create type public.appointment_status as enum ('held','pending','confirmed','in_progress','completed','cancelled','no_show');
create type public.appointment_source as enum ('reservation','walk_in');
create type public.payment_method as enum ('cash','qr','transfer');
create type public.payment_status as enum ('pending','to_verify','confirmed','rejected');

-- Configuración del local (una sola fila)
create table public.shop_settings (
  id int primary key default 1 check (id = 1),
  name text not null default 'Barbería Casa',
  address text,
  timezone text not null default 'America/La_Paz',
  currency text not null default 'Bs',
  latitude double precision,
  longitude double precision,
  checkin_radius_m int not null default 100,
  qr_image_path text,
  slot_step_minutes int not null default 15 check (slot_step_minutes between 5 and 60),
  buffer_minutes int not null default 5 check (buffer_minutes >= 0),
  hold_minutes int not null default 5 check (hold_minutes between 1 and 30),
  min_notice_minutes int not null default 15 check (min_notice_minutes >= 0),
  cancel_limit_minutes int not null default 60 check (cancel_limit_minutes >= 0),
  reminder_minutes int not null default 30,
  max_days_ahead int not null default 30,
  no_show_warning_threshold int not null default 3,
  allow_barber_qr boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.shop_settings default values;

-- Perfiles (admin, barberos, recepcionista, clientes con cuenta)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  email text,
  role public.user_role not null default 'client',
  is_barber boolean not null default false,        -- el admin también puede cortar
  active boolean not null default true,
  avatar_url text,
  speed_factor numeric(4,2) not null default 1.00 check (speed_factor between 0.3 and 3),
  permissions jsonb not null default '{}'::jsonb,   -- interruptores por rol (recepcionista, etc.)
  qr_image_path text,
  created_at timestamptz not null default now()
);

-- Invitaciones: el admin registra un correo y al registrarse la persona recibe ese rol
create table public.staff_invites (
  email text primary key,
  role public.user_role not null check (role in ('admin','barber','receptionist')),
  is_barber boolean not null default false,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'otro',
  description text,
  base_price numeric(10,2) not null check (base_price >= 0),
  base_minutes int not null check (base_minutes > 0),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Ajustes por barbero: precio/duración propios o servicio desactivado
create table public.barber_services (
  barber_id uuid not null references public.profiles(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  enabled boolean not null default true,
  price_override numeric(10,2) check (price_override >= 0),
  minutes_override int check (minutes_override > 0),
  primary key (barber_id, service_id)
);

-- weekday: 0 = domingo ... 6 = sábado. Varias filas por día permiten descansos.
create table public.working_hours (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.profiles(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
create index on public.working_hours (barber_id, weekday);

create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  check (ends_at > starts_at)
);
create index on public.time_off (barber_id, starts_at);

-- Clientes (con o sin cuenta; se identifican por teléfono)
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  phone text not null unique,
  notes text,
  no_shows int not null default 0,
  no_shows_forgiven int not null default 0,
  created_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id),
  barber_id uuid not null references public.profiles(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'pending',
  source public.appointment_source not null default 'reservation',
  hold_expires_at timestamptz,
  actual_started_at timestamptz,
  actual_ended_at timestamptz,
  total_price numeric(10,2) not null default 0,
  notes text,
  created_by uuid references public.profiles(id),
  reminder_sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on public.appointments (barber_id, starts_at);
create index on public.appointments (client_id);
create index on public.appointments (status, starts_at);

-- Evita doble reserva a nivel de base de datos (los sin-reserva pueden solaparse)
alter table public.appointments add constraint appointments_no_overlap
  exclude using gist (barber_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
  where (source = 'reservation' and status in ('held','pending','confirmed','in_progress'));

-- Servicios de cada cita, con el precio de ese día
create table public.appointment_items (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  service_id uuid references public.services(id),
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  minutes int not null check (minutes > 0)
);
create index on public.appointment_items (appointment_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  amount numeric(10,2) not null check (amount >= 0),
  method public.payment_method not null,
  status public.payment_status not null default 'pending',
  received_by uuid references public.profiles(id),
  proof_path text,
  notes text,
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.payments (appointment_id);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Servicios de ejemplo (el admin los edita)
insert into public.services (name, category, base_price, base_minutes, sort_order) values
  ('Corte', 'corte', 30, 30, 1),
  ('Barba', 'barba', 15, 15, 2),
  ('Ceja', 'ceja', 10, 10, 3),
  ('Ondulación', 'ondulacion', 120, 90, 4);
