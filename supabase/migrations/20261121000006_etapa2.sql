-- Etapa 2: finanzas y caja, comisiones, asistencia por ubicación, fila digital, push

-- ===== Ajustes nuevos =====
alter table public.shop_settings
  add column loyalty_enabled boolean not null default false,
  add column loyalty_stamps int not null default 10 check (loyalty_stamps between 2 and 50),
  add column loyalty_reward text not null default 'Corte gratis',
  add column loyalty_mid_at int,
  add column loyalty_mid_reward text,
  add column reactivation_enabled boolean not null default false,
  add column reactivation_days int not null default 30 check (reactivation_days between 7 and 365),
  add column reactivation_message text not null default 'Hola {nombre}, hace tiempo no te vemos en {local}. ¿Reservas tu corte esta semana? {enlace}',
  add column queue_enabled boolean not null default true,
  add column attendance_enabled boolean not null default false;

-- ===== Forma de pago de cada barbero =====
alter table public.profiles
  add column pay_mode text not null default 'none' check (pay_mode in ('none','percent','salary','chair_rent','mixed')),
  add column pay_percent numeric(5,2) not null default 0 check (pay_percent between 0 and 100),
  add column pay_salary numeric(10,2) not null default 0 check (pay_salary >= 0),
  add column pay_chair_rent numeric(10,2) not null default 0 check (pay_chair_rent >= 0);

create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
    new.is_barber := old.is_barber;
    new.active := old.active;
    new.speed_factor := old.speed_factor;
    new.permissions := old.permissions;
    new.email := old.email;
    new.pay_mode := old.pay_mode;
    new.pay_percent := old.pay_percent;
    new.pay_salary := old.pay_salary;
    new.pay_chair_rent := old.pay_chair_rent;
  end if;
  return new;
end $$;

-- ===== Gastos =====
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null default ((now() at time zone 'America/La_Paz')::date),
  category text not null default 'otro',
  description text not null,
  amount numeric(10,2) not null check (amount > 0),
  method public.payment_method not null default 'cash',
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.expenses (spent_on);

-- ===== Cierre de caja (uno por día) =====
create table public.cash_closings (
  day date primary key,
  expected_cash numeric(10,2) not null,
  counted_cash numeric(10,2) not null,
  expected_qr numeric(10,2) not null default 0,
  expected_transfer numeric(10,2) not null default 0,
  expenses_cash numeric(10,2) not null default 0,
  notes text,
  closed_by uuid references public.profiles(id) default auth.uid(),
  closed_at timestamptz not null default now()
);

-- ===== Asistencia =====
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz,
  in_distance_m int,
  out_distance_m int
);
create index on public.attendance (staff_id, check_in_at);

create or replace function public.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = public as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- Marca llegada o salida si el celular está dentro del radio del local
create or replace function public.check_in_out(p_lat double precision, p_lng double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.shop_settings;
  d int;
  v_open uuid;
  v_today date;
begin
  if not public.is_staff() then raise exception 'No autorizado'; end if;
  select * into s from shop_settings where id = 1;
  if not s.attendance_enabled then raise exception 'El control de asistencia está desactivado'; end if;
  if s.latitude is null or s.longitude is null then
    raise exception 'El administrador todavía no marcó la ubicación del local';
  end if;
  d := round(public.distance_m(s.latitude, s.longitude, p_lat, p_lng));
  if d > s.checkin_radius_m then
    raise exception 'Estás a % m del local. Acércate a menos de % m para marcar.', d, s.checkin_radius_m;
  end if;
  v_today := (now() at time zone s.timezone)::date;
  select id into v_open from attendance
   where staff_id = auth.uid() and check_out_at is null
     and (check_in_at at time zone s.timezone)::date = v_today
   order by check_in_at desc limit 1;
  if v_open is not null then
    update attendance set check_out_at = now(), out_distance_m = d where id = v_open;
    return jsonb_build_object('action', 'out', 'at', now(), 'distance', d);
  end if;
  insert into attendance (staff_id, in_distance_m) values (auth.uid(), d);
  return jsonb_build_object('action', 'in', 'at', now(), 'distance', d);
end $$;

-- ===== Fila digital =====
create type public.queue_status as enum ('waiting','serving','done','left');

create table public.queue_entries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 60),
  phone text,
  barber_id uuid references public.profiles(id),
  service_ids uuid[] not null default '{}',
  status public.queue_status not null default 'waiting',
  appointment_id uuid references public.appointments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.queue_entries (status, created_at);

create or replace function public.join_queue(p_name text, p_phone text default null, p_barber uuid default null, p_service_ids uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; ph text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if not (select queue_enabled from shop_settings where id = 1) then raise exception 'La fila no está activa ahora'; end if;
  if (select count(*) from queue_entries where status = 'waiting') >= 40 then raise exception 'La fila está llena. Intenta en un rato.'; end if;
  if p_barber is not null and not exists (select 1 from profiles where id = p_barber and active and is_barber) then
    raise exception 'Barbero inválido';
  end if;
  insert into queue_entries (name, phone, barber_id, service_ids)
  values (trim(p_name), nullif(ph, ''), p_barber, coalesce(p_service_ids, '{}'))
  returning id into v_id;
  return v_id;
end $$;

-- Lugar en la fila: cuenta a quienes esperan antes y pueden ocupar el mismo barbero
create or replace function public.queue_position(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select * from queue_entries where id = p_id),
  ahead as (
    select count(*) as n from queue_entries q, me
    where q.status = 'waiting' and q.created_at < me.created_at
      and (me.barber_id is null or q.barber_id is null or q.barber_id = me.barber_id)
  ),
  barbers as (select greatest(1, count(*)) as n from profiles where active and is_barber)
  select jsonb_build_object(
    'id', me.id, 'name', me.name, 'status', me.status,
    'barber', (select full_name from profiles where id = me.barber_id),
    'ahead', ahead.n,
    'wait_minutes', case when me.barber_id is null then ceil(ahead.n * 30.0 / barbers.n) else ahead.n * 30 end,
    'created_at', me.created_at)
  from me, ahead, barbers
$$;

create or replace function public.leave_queue(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update queue_entries set status = 'left', updated_at = now() where id = p_id and status = 'waiting'
$$;

-- El personal atiende a alguien de la fila: crea el corte sin reserva y lo enlaza
create or replace function public.serve_from_queue(p_id uuid, p_barber uuid, p_service_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.queue_entries; r jsonb;
begin
  if not public.is_staff() then raise exception 'No autorizado'; end if;
  select * into q from queue_entries where id = p_id for update;
  if not found or q.status <> 'waiting' then raise exception 'Esa persona ya no está esperando'; end if;
  r := public.start_walk_in(p_barber, p_service_ids, q.name, q.phone);
  update queue_entries set status = 'serving', appointment_id = (r->>'appointment_id')::uuid, barber_id = p_barber, updated_at = now()
   where id = p_id;
  return r;
end $$;

create or replace function public.queue_done_on_complete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('completed','cancelled','no_show') and old.status <> new.status then
    update queue_entries set status = 'done', updated_at = now() where appointment_id = new.id and status = 'serving';
  end if;
  return new;
end $$;
create trigger queue_done_on_complete after update of status on public.appointments
  for each row execute function public.queue_done_on_complete();

-- ===== Push: suscripciones de personal (user_id) o de una reserva (appointment_id) =====
alter table public.push_subscriptions alter column user_id drop not null;
alter table public.push_subscriptions add column appointment_id uuid references public.appointments(id) on delete cascade;
alter table public.push_subscriptions add constraint push_owner check (user_id is not null or appointment_id is not null);

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_appointment uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_appointment is null and auth.uid() is null then raise exception 'Falta la reserva o la sesión'; end if;
  if p_appointment is not null and not exists (select 1 from appointments where id = p_appointment and status in ('pending','confirmed')) then
    raise exception 'Reserva no encontrada';
  end if;
  insert into push_subscriptions (endpoint, p256dh, auth, user_id, appointment_id)
  values (p_endpoint, p_p256dh, p_auth, case when p_appointment is null then auth.uid() end, p_appointment)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth,
    user_id = coalesce(excluded.user_id, push_subscriptions.user_id),
    appointment_id = coalesce(excluded.appointment_id, push_subscriptions.appointment_id);
end $$;

-- Secretos del servidor (solo los lee la función del servidor con la clave de servicio)
create table public.app_secrets (key text primary key, value text not null);

-- ===== Resumen del día para el cierre de caja =====
create or replace function public.day_cash_summary(p_day date) returns jsonb
language sql stable security definer set search_path = public as $$
  with s as (select timezone as tz from shop_settings where id = 1),
  rng as (select (p_day::timestamp at time zone s.tz) as f, ((p_day + 1)::timestamp at time zone s.tz) as t from s),
  pays as (
    select p.method, p.amount, p.received_by from payments p, rng
    where p.status = 'confirmed' and coalesce(p.verified_at, p.created_at) >= rng.f and coalesce(p.verified_at, p.created_at) < rng.t
  )
  select case when not public.is_front_desk() then null else jsonb_build_object(
    'cash', coalesce((select sum(amount) from pays where method = 'cash'), 0),
    'qr', coalesce((select sum(amount) from pays where method = 'qr'), 0),
    'transfer', coalesce((select sum(amount) from pays where method = 'transfer'), 0),
    'by_person', coalesce((select jsonb_agg(x) from (
        select pr.full_name as name, pays.method, sum(pays.amount) as total
        from pays left join profiles pr on pr.id = pays.received_by
        group by pr.full_name, pays.method order by pr.full_name) x), '[]'::jsonb),
    'expenses_cash', coalesce((select sum(amount) from expenses where spent_on = p_day and method = 'cash'), 0),
    'closing', (select to_jsonb(c) from cash_closings c where c.day = p_day)
  ) end
$$;

-- ===== RLS =====
alter table public.expenses enable row level security;
alter table public.cash_closings enable row level security;
alter table public.attendance enable row level security;
alter table public.queue_entries enable row level security;
alter table public.app_secrets enable row level security;

create policy "expenses_admin" on public.expenses for all using (public.is_admin()) with check (public.is_admin());
create policy "closings_front" on public.cash_closings for all using (public.is_front_desk()) with check (public.is_front_desk());
create policy "attendance_read" on public.attendance for select using (staff_id = (select auth.uid()) or public.is_admin());
create policy "attendance_admin_fix" on public.attendance for update using (public.is_admin()) with check (public.is_admin());
create policy "attendance_admin_delete" on public.attendance for delete using (public.is_admin());
create policy "queue_staff" on public.queue_entries for all using (public.is_staff()) with check (public.is_staff());

revoke execute on function public.check_in_out(double precision, double precision) from public, anon;
revoke execute on function public.serve_from_queue(uuid, uuid, uuid[]) from public, anon;
revoke execute on function public.day_cash_summary(date) from public, anon;
revoke execute on function public.queue_done_on_complete() from public, anon, authenticated;

alter publication supabase_realtime add table public.queue_entries;
