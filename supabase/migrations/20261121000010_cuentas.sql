-- Cuentas de cliente, perfil propio e invitaciones a personas que ya tienen cuenta

-- Un cliente con cuenta puede no tener celular todavía (o ya estar usado por una ficha sin dueño)
alter table public.clients alter column phone drop not null;
create index if not exists clients_user_id_idx on public.clients (user_id);

-- El trigger de protección deja pasar la sincronización de correo hecha por el sistema
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.bypass_guard', true), '') = 'on' then return new; end if;
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

-- Alta de usuario: los clientes reciben su ficha de cliente enlazada a la cuenta
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv public.staff_invites;
  v_role public.user_role := 'client';
  v_barber boolean := false;
  v_name text;
  v_phone text := nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'phone', ''), '\D', '', 'g'), '');
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
  values (new.id, v_name, new.email, v_phone, v_role, v_barber);
  if v_role = 'client' then
    -- Si el celular ya está en otra ficha, no se enlaza solo: se reclama con el enlace de una reserva
    insert into public.clients (user_id, full_name, phone)
    values (new.id, v_name, case when v_phone is not null and not exists (select 1 from clients where phone = v_phone) then v_phone end);
  end if;
  return new;
end $$;

-- Si el usuario cambia su correo, el perfil se actualiza
create or replace function public.sync_profile_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    perform set_config('app.bypass_guard', 'on', true);
    update profiles set email = new.email where id = new.id;
    perform set_config('app.bypass_guard', 'off', true);
  end if;
  return new;
end $$;
create trigger on_auth_user_email after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- Ficha de cliente de la cuenta abierta
create or replace function public.my_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from clients where user_id = auth.uid() order by created_at limit 1
$$;

-- Confirmar reserva: con cuenta de cliente se usa su ficha; sin cuenta, la ficha del celular
create or replace function public.confirm_booking(p_appointment uuid, p_name text, p_phone text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_a public.appointments;
  v_client uuid := public.my_client_id();
  ph text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if length(ph) < 7 then raise exception 'Teléfono inválido'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Escribe tu nombre'; end if;

  select * into v_a from appointments where id = p_appointment for update;
  if not found or v_a.status <> 'held' or v_a.hold_expires_at < now() then
    raise exception 'El horario ya no está retenido. Elige otro.';
  end if;

  if v_client is not null then
    update clients set phone = ph where id = v_client and phone is null and not exists (select 1 from clients where phone = ph);
  else
    insert into clients (full_name, phone) values (trim(p_name), ph)
    on conflict (phone) do update set phone = excluded.phone
    returning id into v_client;
  end if;

  update appointments set client_id = v_client, status = 'confirmed', hold_expires_at = null where id = p_appointment;
  return p_appointment;
end $$;

-- Las acciones del cliente aceptan el celular o ser el dueño de la cuenta
create or replace function public.owns_booking(p_appointment uuid, p_phone text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from appointments a join clients c on c.id = a.client_id
    where a.id = p_appointment
      and ((auth.uid() is not null and c.user_id = auth.uid())
           or (length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 7 and c.phone = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'))))
$$;

create or replace function public.cancel_booking(p_appointment uuid, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.shop_settings; v_a public.appointments;
begin
  select * into s from shop_settings where id = 1;
  if not public.owns_booking(p_appointment, p_phone) then raise exception 'No encontramos esa reserva con ese celular'; end if;
  select * into v_a from appointments where id = p_appointment for update;
  if v_a.status not in ('pending','confirmed') then raise exception 'Esta reserva ya no se puede cancelar'; end if;
  if v_a.starts_at - make_interval(mins => s.cancel_limit_minutes) < now() then
    raise exception 'Ya no se puede cancelar desde la app. Llama a la barbería.';
  end if;
  update appointments set status = 'cancelled' where id = v_a.id;
end $$;

create or replace function public.submit_payment_proof(p_appointment uuid, p_phone text, p_proof_path text, p_amount numeric, p_method public.payment_method default 'qr')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.owns_booking(p_appointment, p_phone) then raise exception 'No encontramos esa reserva con ese celular'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then raise exception 'Monto inválido'; end if;
  insert into payments (appointment_id, amount, method, status, proof_path)
  values (p_appointment, p_amount, p_method, 'to_verify', p_proof_path)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.rate_appointment(p_appointment uuid, p_phone text, p_stars int, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_barber uuid;
begin
  if not public.owns_booking(p_appointment, p_phone) then raise exception 'No encontramos esa reserva con ese celular'; end if;
  select barber_id into v_barber from appointments where id = p_appointment and status = 'completed';
  if v_barber is null then raise exception 'Solo puedes calificar un corte terminado'; end if;
  if p_stars not between 1 and 5 then raise exception 'La calificación va de 1 a 5 estrellas'; end if;
  insert into ratings (appointment_id, barber_id, stars, comment)
  values (p_appointment, v_barber, p_stars, nullif(trim(coalesce(p_comment, '')), ''))
  on conflict (appointment_id) do update set stars = excluded.stars, comment = excluded.comment, created_at = now();
end $$;

create or replace function public.get_booking(p_appointment uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', a.id, 'status', a.status, 'starts_at', a.starts_at, 'ends_at', a.ends_at,
    'total_price', a.total_price, 'hold_expires_at', a.hold_expires_at,
    'barber', p.full_name,
    'services', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'price', i.price, 'minutes', i.minutes))
                          from appointment_items i where i.appointment_id = a.id), '[]'::jsonb),
    'stars', (select stars from ratings r where r.appointment_id = a.id),
    'card_token', case when (select loyalty_enabled from shop_settings where id = 1) then c.card_token end,
    'mine', auth.uid() is not null and c.user_id = auth.uid(),
    'linked', c.user_id is not null)
  from appointments a join profiles p on p.id = a.barber_id left join clients c on c.id = a.client_id
  where a.id = p_appointment
$$;

-- Guardar en mi cuenta una reserva hecha sin cuenta (tener el enlace de la reserva es la prueba)
create or replace function public.claim_booking(p_appointment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_guest public.clients; v_mine uuid;
begin
  if auth.uid() is null or (select role from profiles where id = auth.uid()) <> 'client' then
    raise exception 'Entra con tu cuenta de cliente para guardar la reserva';
  end if;
  select c.* into v_guest from appointments a join clients c on c.id = a.client_id where a.id = p_appointment for update of c;
  if not found then raise exception 'No encontramos esa reserva'; end if;
  if v_guest.user_id = auth.uid() then return; end if;
  if v_guest.user_id is not null then raise exception 'Esta reserva ya está guardada en otra cuenta'; end if;

  v_mine := public.my_client_id();
  if v_mine is not null then
    -- Se unen las dos fichas: queda la que tiene el historial y el celular
    update appointments set client_id = v_guest.id where client_id = v_mine;
    update loyalty_cards set client_id = v_guest.id where client_id = v_mine;
    update clients set no_shows = clients.no_shows + m.no_shows,
                       no_shows_forgiven = clients.no_shows_forgiven + m.no_shows_forgiven
      from clients m where clients.id = v_guest.id and m.id = v_mine;
    delete from clients where id = v_mine;
  end if;
  update clients set user_id = auth.uid() where id = v_guest.id;
end $$;

-- Todo lo del cliente en una sola llamada
create or replace function public.my_account() returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select * from profiles where id = auth.uid()),
  cl as (select * from clients where id = public.my_client_id()),
  s as (select timezone as tz, name, loyalty_enabled from shop_settings where id = 1)
  select case when auth.uid() is null then null else jsonb_build_object(
    'shop', s.name,
    'profile', (select jsonb_build_object('full_name', full_name, 'phone', phone, 'email', email, 'role', role) from me),
    'client', (select jsonb_build_object('id', id, 'full_name', full_name, 'phone', phone, 'card_token', card_token) from cl),
    'upcoming', coalesce((select jsonb_agg(x order by x.starts_at) from (
        select a.id, a.starts_at, a.status, a.total_price, p.full_name as barber,
          (select string_agg(i.name, ' + ') from appointment_items i where i.appointment_id = a.id) as services
        from appointments a join profiles p on p.id = a.barber_id
        where a.client_id = (select id from cl) and a.status in ('pending','confirmed','in_progress') and a.ends_at > now()) x), '[]'::jsonb),
    'past', coalesce((select jsonb_agg(x order by x.starts_at desc) from (
        select a.id, a.starts_at, a.status, a.total_price, p.full_name as barber,
          (select string_agg(i.name, ' + ') from appointment_items i where i.appointment_id = a.id) as services,
          (select stars from ratings r where r.appointment_id = a.id) as stars
        from appointments a join profiles p on p.id = a.barber_id
        where a.client_id = (select id from cl) and (a.status in ('completed','cancelled','no_show') or a.ends_at <= now())
          and a.status <> 'held'
        order by a.starts_at desc limit 30) x), '[]'::jsonb),
    'card', case when s.loyalty_enabled and (select id from cl) is not null then public.card_json((select id from cl)) end) end
  from s
$$;

-- El cliente cambia su nombre y celular
create or replace function public.update_my_client(p_name text, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := public.my_client_id(); ph text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if auth.uid() is null then raise exception 'Entra con tu cuenta'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Escribe tu nombre'; end if;
  if length(ph) < 7 then raise exception 'Celular inválido'; end if;
  if exists (select 1 from clients where phone = ph and id is distinct from v) then
    raise exception 'Ese celular ya está registrado. Si es tuyo, abre el enlace de una de tus reservas y toca “Guardar en mi cuenta”.';
  end if;
  update profiles set full_name = trim(p_name), phone = ph where id = auth.uid();
  if v is null then
    insert into clients (user_id, full_name, phone) values (auth.uid(), trim(p_name), ph);
  else
    update clients set full_name = trim(p_name), phone = ph where id = v;
  end if;
end $$;

-- Invitar: si la persona ya tiene cuenta (por ejemplo de cliente), recibe el rol al instante
create or replace function public.invite_staff(p_email text, p_role public.user_role, p_is_barber boolean, p_name text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  if p_role not in ('admin','barber','receptionist') then raise exception 'Rol inválido'; end if;
  select id into v from profiles where lower(email) = lower(trim(p_email));
  if v is not null then
    perform set_config('app.bypass_guard', 'on', true);
    update profiles set role = p_role, is_barber = p_is_barber or p_role = 'barber', active = true,
      full_name = coalesce(nullif(trim(p_name), ''), full_name) where id = v;
    perform set_config('app.bypass_guard', 'off', true);
    return 'promoted';
  end if;
  insert into staff_invites (email, role, is_barber, full_name)
  values (lower(trim(p_email)), p_role, p_is_barber or p_role = 'barber', nullif(trim(p_name), ''))
  on conflict (email) do update set role = excluded.role, is_barber = excluded.is_barber, full_name = excluded.full_name;
  return 'invited';
end $$;

revoke execute on function public.sync_profile_email() from public, anon, authenticated;
revoke execute on function public.my_client_id() from public, anon;
revoke execute on function public.owns_booking(uuid, text) from public, anon, authenticated;
revoke execute on function public.claim_booking(uuid) from public, anon;
revoke execute on function public.my_account() from public, anon;
revoke execute on function public.update_my_client(text, text) from public, anon;
revoke execute on function public.invite_staff(text, public.user_role, boolean, text) from public, anon;
