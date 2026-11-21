-- Etapa 1: helpers, triggers y funciones de reserva

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid() and active), false)
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','barber','receptionist') from profiles where id = auth.uid() and active), false)
$$;

create or replace function public.is_front_desk() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','receptionist') from profiles where id = auth.uid() and active), false)
$$;

-- Alta automática de perfil. El primer usuario registrado es el admin (y también corta).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv public.staff_invites;
  v_role public.user_role := 'client';
  v_barber boolean := false;
  v_name text;
begin
  v_name := coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1));
  select * into inv from public.staff_invites where lower(email) = lower(new.email);
  if found then
    v_role := inv.role;
    v_barber := inv.is_barber or inv.role = 'barber';
    v_name := coalesce(nullif(inv.full_name,''), v_name);
    delete from public.staff_invites where email = inv.email;
  elsif not exists (select 1 from public.profiles where role = 'admin') then
    v_role := 'admin';
    v_barber := true;
  end if;
  insert into public.profiles (id, full_name, email, phone, role, is_barber)
  values (new.id, v_name, new.email, new.raw_user_meta_data->>'phone', v_role, v_barber);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Nadie salvo el admin puede cambiar su rol, estado, velocidad o permisos
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
  end if;
  return new;
end $$;

create trigger guard_profile_update before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Tiempos y estados de la cita
create or replace function public.appointment_status_changes() returns trigger
language plpgsql as $$
begin
  if new.status = 'in_progress' and old.status <> 'in_progress' and new.actual_started_at is null then
    new.actual_started_at := now();
  end if;
  if new.status = 'completed' and old.status <> 'completed' and new.actual_ended_at is null then
    new.actual_ended_at := now();
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    new.cancelled_at := now();
  end if;
  return new;
end $$;

create trigger appointment_status_changes before update on public.appointments
  for each row execute function public.appointment_status_changes();

-- Conteo de faltas del cliente
create or replace function public.count_no_shows() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.client_id is not null then
    if new.status = 'no_show' and old.status <> 'no_show' then
      update clients set no_shows = no_shows + 1 where id = new.client_id;
    elsif old.status = 'no_show' and new.status <> 'no_show' then
      update clients set no_shows = greatest(no_shows - 1, 0) where id = new.client_id;
    end if;
  end if;
  return new;
end $$;

create trigger count_no_shows after update of status on public.appointments
  for each row execute function public.count_no_shows();

-- El total de la cita siempre es la suma de sus servicios
create or replace function public.recalc_total() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(new.appointment_id, old.appointment_id);
begin
  update appointments
     set total_price = (select coalesce(sum(price), 0) from appointment_items where appointment_id = v_id)
   where id = v_id;
  return null;
end $$;

create trigger recalc_total after insert or update or delete on public.appointment_items
  for each row execute function public.recalc_total();

-- Precio y duración efectivos de un servicio para un barbero
create or replace function public.effective_minutes(p_barber uuid, p_service uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(bs.minutes_override, (ceil(s.base_minutes * p.speed_factor / 5.0) * 5)::int)
  from services s
  join profiles p on p.id = p_barber
  left join barber_services bs on bs.barber_id = p_barber and bs.service_id = s.id
  where s.id = p_service
$$;

create or replace function public.effective_price(p_barber uuid, p_service uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(bs.price_override, s.base_price)
  from services s
  left join barber_services bs on bs.barber_id = p_barber and bs.service_id = s.id
  where s.id = p_service
$$;

-- ¿Está libre ese tramo para el barbero? (con colchón entre clientes)
create or replace function public.slot_is_free(p_barber uuid, p_start timestamptz, p_end timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  with b as (select make_interval(mins => buffer_minutes) as buf from shop_settings where id = 1)
  select not exists (
    select 1 from appointments a, b
    where a.barber_id = p_barber
      and (a.status in ('pending','confirmed','in_progress')
           or (a.status = 'held' and a.hold_expires_at > now()))
      and a.starts_at < p_end + b.buf
      and (case when a.status = 'in_progress' then greatest(a.ends_at, now()) else a.ends_at end) + b.buf > p_start
  ) and not exists (
    select 1 from time_off t where t.barber_id = p_barber and t.starts_at < p_end and t.ends_at > p_start
  )
$$;

-- Horarios libres de un barbero para un día y una duración total
create or replace function public.get_available_slots(p_barber uuid, p_date date, p_minutes int)
returns table(slot_start timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  s public.shop_settings;
  wh record;
  t timestamptz;
  w_end timestamptz;
  today date;
begin
  select * into s from shop_settings where id = 1;
  if p_minutes is null or p_minutes <= 0 then return; end if;
  if not exists (select 1 from profiles where id = p_barber and active and is_barber) then return; end if;
  today := (now() at time zone s.timezone)::date;
  if p_date < today or p_date > today + s.max_days_ahead then return; end if;

  for wh in select start_time, end_time from working_hours
            where barber_id = p_barber and weekday = extract(dow from p_date)::int
            order by start_time loop
    t := (p_date + wh.start_time) at time zone s.timezone;
    w_end := (p_date + wh.end_time) at time zone s.timezone;
    while t + make_interval(mins => p_minutes) <= w_end loop
      if t >= now() + make_interval(mins => s.min_notice_minutes)
         and public.slot_is_free(p_barber, t, t + make_interval(mins => p_minutes)) then
        slot_start := t;
        return next;
      end if;
      t := t + make_interval(mins => s.slot_step_minutes);
    end loop;
  end loop;
end $$;

-- Barberos visibles para reservar
create or replace function public.list_barbers()
returns table(id uuid, full_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select id, full_name, avatar_url from profiles
  where active and is_barber and role in ('admin','barber')
  order by full_name
$$;

-- Servicios de un barbero con su precio y duración reales
create or replace function public.barber_service_catalog(p_barber uuid)
returns table(service_id uuid, name text, category text, description text, price numeric, minutes int)
language sql stable security definer set search_path = public as $$
  select sv.id, sv.name, sv.category, sv.description,
         public.effective_price(p_barber, sv.id), public.effective_minutes(p_barber, sv.id)
  from services sv
  left join barber_services bs on bs.barber_id = p_barber and bs.service_id = sv.id
  where sv.active and coalesce(bs.enabled, true)
  order by sv.sort_order, sv.name
$$;

-- Retiene el horario unos minutos mientras el cliente confirma (como en el cine)
create or replace function public.hold_slot(p_barber uuid, p_start timestamptz, p_service_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  s public.shop_settings;
  v_minutes int; v_n int; v_id uuid; v_price numeric;
begin
  select * into s from shop_settings where id = 1;
  perform pg_advisory_xact_lock(hashtext(p_barber::text));
  delete from appointments where status = 'held' and hold_expires_at < now();

  select count(*), coalesce(sum(public.effective_minutes(p_barber, sv.id)), 0)
    into v_n, v_minutes
  from services sv
  left join barber_services bs on bs.barber_id = p_barber and bs.service_id = sv.id
  where sv.id = any(p_service_ids) and sv.active and coalesce(bs.enabled, true);

  if v_n = 0 or v_n <> (select count(distinct x) from unnest(p_service_ids) x) then
    raise exception 'Servicios inválidos';
  end if;
  if not exists (
    select 1 from public.get_available_slots(p_barber, (p_start at time zone s.timezone)::date, v_minutes) g
    where g.slot_start = p_start
  ) then
    raise exception 'Ese horario ya no está disponible';
  end if;

  insert into appointments (barber_id, starts_at, ends_at, status, source, hold_expires_at)
  values (p_barber, p_start, p_start + make_interval(mins => v_minutes), 'held', 'reservation',
          now() + make_interval(mins => s.hold_minutes))
  returning id into v_id;

  insert into appointment_items (appointment_id, service_id, name, price, minutes)
  select v_id, sv.id, sv.name, public.effective_price(p_barber, sv.id), public.effective_minutes(p_barber, sv.id)
  from services sv where sv.id = any(p_service_ids);

  return v_id;
end $$;

-- Confirma la reserva retenida con nombre y teléfono del cliente
create or replace function public.confirm_booking(p_appointment uuid, p_name text, p_phone text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_a public.appointments;
  v_client uuid;
  ph text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if length(ph) < 7 then raise exception 'Teléfono inválido'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Escribe tu nombre'; end if;

  select * into v_a from appointments where id = p_appointment for update;
  if not found or v_a.status <> 'held' or v_a.hold_expires_at < now() then
    raise exception 'El horario ya no está retenido. Elige otro.';
  end if;

  insert into clients (full_name, phone) values (trim(p_name), ph)
  on conflict (phone) do update set phone = excluded.phone
  returning id into v_client;

  update appointments
     set client_id = v_client, status = 'confirmed', hold_expires_at = null
   where id = p_appointment;
  return p_appointment;
end $$;

-- Datos de una reserva para mostrar la confirmación (quien tiene el id)
create or replace function public.get_booking(p_appointment uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', a.id, 'status', a.status, 'starts_at', a.starts_at, 'ends_at', a.ends_at,
    'total_price', a.total_price, 'hold_expires_at', a.hold_expires_at,
    'barber', p.full_name,
    'services', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'price', i.price, 'minutes', i.minutes))
                          from appointment_items i where i.appointment_id = a.id), '[]'::jsonb))
  from appointments a join profiles p on p.id = a.barber_id
  where a.id = p_appointment
$$;

-- El cliente cancela su reserva con su teléfono
create or replace function public.cancel_booking(p_appointment uuid, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.shop_settings;
  v_a public.appointments;
  ph text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  select * into s from shop_settings where id = 1;
  select a.* into v_a from appointments a join clients c on c.id = a.client_id
   where a.id = p_appointment and c.phone = ph for update of a;
  if not found then raise exception 'No encontramos esa reserva'; end if;
  if v_a.status not in ('pending','confirmed') then raise exception 'Esta reserva ya no se puede cancelar'; end if;
  if v_a.starts_at - make_interval(mins => s.cancel_limit_minutes) < now() then
    raise exception 'Ya no se puede cancelar desde la app. Llama a la barbería.';
  end if;
  update appointments set status = 'cancelled' where id = v_a.id;
end $$;

-- El cliente sube su comprobante de pago (queda "por verificar")
create or replace function public.submit_payment_proof(p_appointment uuid, p_phone text, p_proof_path text, p_amount numeric, p_method public.payment_method default 'qr')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  ph text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_id uuid;
begin
  if not exists (select 1 from appointments a join clients c on c.id = a.client_id
                 where a.id = p_appointment and c.phone = ph) then
    raise exception 'No encontramos esa reserva';
  end if;
  insert into payments (appointment_id, amount, method, status, proof_path)
  values (p_appointment, p_amount, p_method, 'to_verify', p_proof_path)
  returning id into v_id;
  return v_id;
end $$;

-- Cliente sin reserva: "Atender ahora" (admin, recepcionista o el propio barbero)
create or replace function public.start_walk_in(p_barber uuid, p_service_ids uuid[], p_name text default null, p_phone text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role public.user_role;
  v_minutes int; v_n int; v_id uuid; v_client uuid; v_next timestamptz; v_end timestamptz;
  ph text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  select role into v_role from profiles where id = auth.uid() and active;
  if v_role is null or v_role = 'client' then raise exception 'No autorizado'; end if;
  if v_role = 'barber' and p_barber <> auth.uid() then raise exception 'Solo puedes atender en tu propia agenda'; end if;
  if not exists (select 1 from profiles where id = p_barber and active and is_barber) then
    raise exception 'Barbero inválido';
  end if;

  select count(*), coalesce(sum(public.effective_minutes(p_barber, sv.id)), 0) into v_n, v_minutes
  from services sv where sv.id = any(p_service_ids) and sv.active;
  if v_n = 0 or v_n <> (select count(distinct x) from unnest(p_service_ids) x) then
    raise exception 'Servicios inválidos';
  end if;

  if length(ph) >= 7 then
    insert into clients (full_name, phone) values (coalesce(nullif(trim(p_name), ''), 'Cliente'), ph)
    on conflict (phone) do update set phone = excluded.phone returning id into v_client;
  end if;

  v_end := now() + make_interval(mins => v_minutes);
  insert into appointments (client_id, barber_id, starts_at, ends_at, status, source, actual_started_at, created_by)
  values (v_client, p_barber, now(), v_end, 'in_progress', 'walk_in', now(), auth.uid())
  returning id into v_id;

  insert into appointment_items (appointment_id, service_id, name, price, minutes)
  select v_id, sv.id, sv.name, public.effective_price(p_barber, sv.id), public.effective_minutes(p_barber, sv.id)
  from services sv where sv.id = any(p_service_ids);

  select min(starts_at) into v_next from appointments
   where barber_id = p_barber and status in ('pending','confirmed') and starts_at > now();

  return jsonb_build_object('appointment_id', v_id, 'ends_at', v_end, 'next_appointment_at', v_next,
                            'overlaps_next', v_next is not null and v_next < v_end);
end $$;

-- Ingresos por barbero (admin ve todos; el barbero solo los suyos)
create or replace function public.income_summary(p_from date, p_to date)
returns table(barber_id uuid, barber_name text, cuts bigint, reservation_cuts bigint, walk_in_cuts bigint,
              reservation_total numeric, walk_in_total numeric, total numeric)
language sql stable security definer set search_path = public as $$
  select a.barber_id, p.full_name, count(*),
         count(*) filter (where a.source = 'reservation'),
         count(*) filter (where a.source = 'walk_in'),
         coalesce(sum(a.total_price) filter (where a.source = 'reservation'), 0),
         coalesce(sum(a.total_price) filter (where a.source = 'walk_in'), 0),
         coalesce(sum(a.total_price), 0)
  from appointments a
  join profiles p on p.id = a.barber_id
  cross join (select timezone as tz from shop_settings where id = 1) s
  where a.status = 'completed'
    and a.starts_at >= (p_from::timestamp at time zone s.tz)
    and a.starts_at < ((p_to + 1)::timestamp at time zone s.tz)
    and (public.is_admin() or a.barber_id = auth.uid())
  group by a.barber_id, p.full_name
  order by 8 desc
$$;

-- Ingresos por día para gráficos
create or replace function public.income_by_day(p_from date, p_to date, p_barber uuid default null)
returns table(day date, cuts bigint, total numeric)
language sql stable security definer set search_path = public as $$
  select (a.starts_at at time zone s.tz)::date, count(*), coalesce(sum(a.total_price), 0)
  from appointments a
  cross join (select timezone as tz from shop_settings where id = 1) s
  where a.status = 'completed'
    and a.starts_at >= (p_from::timestamp at time zone s.tz)
    and a.starts_at < ((p_to + 1)::timestamp at time zone s.tz)
    and (p_barber is null or a.barber_id = p_barber)
    and (public.is_admin() or a.barber_id = auth.uid())
  group by 1
  order by 1
$$;

-- Permisos de ejecución
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.guard_profile_update() from public, anon, authenticated;
revoke execute on function public.appointment_status_changes() from public, anon, authenticated;
revoke execute on function public.count_no_shows() from public, anon, authenticated;
revoke execute on function public.recalc_total() from public, anon, authenticated;
revoke execute on function public.effective_minutes(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.effective_price(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.slot_is_free(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.start_walk_in(uuid, uuid[], text, text) from public, anon;
revoke execute on function public.income_summary(date, date) from public, anon;
revoke execute on function public.income_by_day(date, date, uuid) from public, anon;
