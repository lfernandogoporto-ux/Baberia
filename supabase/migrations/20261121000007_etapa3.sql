-- Etapa 3: fidelidad, inventario, galería, calificaciones, historial, pantalla del local, finanzas

alter table public.clients add column card_token uuid not null default gen_random_uuid();
create unique index clients_card_token_key on public.clients (card_token);
alter table public.appointments add column photo_path text;

-- ===== Tarjeta de fidelidad =====
create table public.loyalty_cards (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  stamps int not null default 0,
  required int not null,
  completed_at timestamptz,
  mid_redeemed_at timestamptz,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.loyalty_cards (client_id, created_at);

create table public.loyalty_stamps (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.loyalty_cards(id) on delete cascade,
  appointment_id uuid unique references public.appointments(id) on delete set null,
  stamped_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create or replace function public.add_stamp(p_client uuid, p_appointment uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.shop_settings; c public.loyalty_cards; v_today date;
begin
  if not public.is_staff() then raise exception 'No autorizado'; end if;
  select * into s from shop_settings where id = 1;
  if not s.loyalty_enabled then raise exception 'La tarjeta de fidelidad está desactivada'; end if;
  if not exists (select 1 from clients where id = p_client) then raise exception 'Cliente no encontrado'; end if;
  v_today := (now() at time zone s.timezone)::date;
  if p_appointment is not null then
    if not exists (select 1 from appointments where id = p_appointment and client_id = p_client and status in ('in_progress','completed')) then
      raise exception 'Esa visita no es de este cliente';
    end if;
    if exists (select 1 from loyalty_stamps where appointment_id = p_appointment) then raise exception 'Esta visita ya tiene su sello'; end if;
  elsif exists (select 1 from loyalty_stamps ls join loyalty_cards lc on lc.id = ls.card_id
                where lc.client_id = p_client and (ls.created_at at time zone s.timezone)::date = v_today) then
    raise exception 'Este cliente ya recibió su sello hoy';
  end if;

  select * into c from loyalty_cards where client_id = p_client and completed_at is null order by created_at desc limit 1 for update;
  if not found then
    insert into loyalty_cards (client_id, required) values (p_client, s.loyalty_stamps) returning * into c;
  end if;
  insert into loyalty_stamps (card_id, appointment_id) values (c.id, p_appointment);
  update loyalty_cards set stamps = stamps + 1, completed_at = case when stamps + 1 >= required then now() end
   where id = c.id returning * into c;
  return jsonb_build_object('card_id', c.id, 'stamps', c.stamps, 'required', c.required,
    'completed', c.completed_at is not null,
    'mid_reached', s.loyalty_mid_at is not null and c.stamps = s.loyalty_mid_at,
    'reward', s.loyalty_reward, 'mid_reward', s.loyalty_mid_reward);
end $$;

create or replace function public.redeem_reward(p_card uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.loyalty_cards; mid int;
begin
  if not public.is_staff() then raise exception 'No autorizado'; end if;
  select * into c from loyalty_cards where id = p_card for update;
  if not found then raise exception 'Tarjeta no encontrada'; end if;
  if p_kind = 'final' then
    if c.completed_at is null then raise exception 'La tarjeta todavía no está llena'; end if;
    if c.redeemed_at is not null then raise exception 'Este premio ya se entregó'; end if;
    update loyalty_cards set redeemed_at = now() where id = p_card;
  else
    select loyalty_mid_at into mid from shop_settings where id = 1;
    if mid is null or c.stamps < mid then raise exception 'Todavía no llega al premio intermedio'; end if;
    if c.mid_redeemed_at is not null then raise exception 'Este premio ya se entregó'; end if;
    update loyalty_cards set mid_redeemed_at = now() where id = p_card;
  end if;
end $$;

-- Datos de la tarjeta de un cliente (uso interno)
create or replace function public.card_json(p_client uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with s as (select * from shop_settings where id = 1),
  cl as (select * from clients where id = p_client),
  cur as (select * from loyalty_cards where client_id = p_client order by created_at desc limit 1)
  select jsonb_build_object(
    'enabled', s.loyalty_enabled, 'shop', s.name,
    'first_name', split_part(cl.full_name, ' ', 1),
    'client_id', cl.id, 'token', cl.card_token,
    'card_id', case when cur.redeemed_at is null then cur.id end,
    'stamps', case when cur.id is null or cur.redeemed_at is not null then 0 else cur.stamps end,
    'required', case when cur.id is null or cur.redeemed_at is not null then s.loyalty_stamps else cur.required end,
    'ready', cur.completed_at is not null and cur.redeemed_at is null,
    'mid_at', s.loyalty_mid_at, 'mid_reward', s.loyalty_mid_reward,
    'mid_redeemed', cur.mid_redeemed_at is not null and cur.redeemed_at is null,
    'reward', s.loyalty_reward,
    'completed_cards', (select count(*) from loyalty_cards where client_id = p_client and completed_at is not null))
  from s cross join cl left join cur on true
$$;

-- Tarjeta pública por su código (lo que el cliente ve en su celular)
create or replace function public.get_card(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.card_json(id) from clients where card_token = p_token
$$;

create or replace function public.staff_card(p_key uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  if not public.is_staff() then raise exception 'No autorizado'; end if;
  select id into v from clients where id = p_key or card_token = p_key limit 1;
  if v is null then raise exception 'No encontramos esa tarjeta'; end if;
  return public.card_json(v) || jsonb_build_object('full_name', (select full_name from clients where id = v));
end $$;

-- ===== Inventario =====
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null default 'unidad',
  cost numeric(10,2) not null default 0 check (cost >= 0),
  price numeric(10,2) not null default 0 check (price >= 0),
  stock numeric(10,2) not null default 0,
  min_stock numeric(10,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  kind text not null check (kind in ('purchase','sale','use','adjust')),
  qty numeric(10,2) not null check (qty <> 0),
  unit_cost numeric(10,2),
  unit_price numeric(10,2),
  method public.payment_method,
  note text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.stock_movements (product_id, created_at);
create index on public.stock_movements (kind, created_at);

create or replace function public.apply_stock_movement() returns trigger
language plpgsql security definer set search_path = public as $$
declare delta numeric; cur numeric;
begin
  if new.kind in ('purchase','sale','use') and new.qty <= 0 then raise exception 'La cantidad debe ser mayor a cero'; end if;
  delta := case new.kind when 'purchase' then new.qty when 'adjust' then new.qty else -new.qty end;
  select stock into cur from products where id = new.product_id for update;
  if cur + delta < 0 then raise exception 'No hay suficiente stock (quedan %)', cur; end if;
  if new.kind = 'sale' and new.unit_price is null then
    select price into new.unit_price from products where id = new.product_id;
  end if;
  update products set stock = stock + delta,
    cost = case when new.kind = 'purchase' and new.unit_cost is not null then new.unit_cost else cost end
   where id = new.product_id;
  return new;
end $$;
create trigger apply_stock_movement before insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

-- ===== Galería de trabajos =====
create table public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  path text not null,
  caption text,
  created_at timestamptz not null default now()
);
create index on public.gallery_photos (barber_id, created_at);

-- ===== Calificaciones =====
create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  barber_id uuid not null references public.profiles(id) on delete cascade,
  stars int not null check (stars between 1 and 5),
  comment text check (length(comment) <= 500),
  created_at timestamptz not null default now()
);

create or replace function public.rate_appointment(p_appointment uuid, p_phone text, p_stars int, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_barber uuid; ph text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  select a.barber_id into v_barber from appointments a join clients c on c.id = a.client_id
   where a.id = p_appointment and c.phone = ph and a.status = 'completed';
  if v_barber is null then raise exception 'Solo puedes calificar un corte terminado, con el celular de la reserva'; end if;
  insert into ratings (appointment_id, barber_id, stars, comment)
  values (p_appointment, v_barber, p_stars, nullif(trim(coalesce(p_comment, '')), ''))
  on conflict (appointment_id) do update set stars = excluded.stars, comment = excluded.comment, created_at = now();
end $$;

-- La reserva ahora también devuelve calificación y enlace de la tarjeta
create or replace function public.get_booking(p_appointment uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', a.id, 'status', a.status, 'starts_at', a.starts_at, 'ends_at', a.ends_at,
    'total_price', a.total_price, 'hold_expires_at', a.hold_expires_at,
    'barber', p.full_name,
    'services', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'price', i.price, 'minutes', i.minutes))
                          from appointment_items i where i.appointment_id = a.id), '[]'::jsonb),
    'stars', (select stars from ratings r where r.appointment_id = a.id),
    'card_token', case when (select loyalty_enabled from shop_settings where id = 1) then c.card_token end)
  from appointments a join profiles p on p.id = a.barber_id left join clients c on c.id = a.client_id
  where a.id = p_appointment
$$;

-- Barberos para reservar, con su calificación y sus últimos trabajos
drop function public.list_barbers();
create function public.list_barbers()
returns table(id uuid, full_name text, avatar_url text, rating numeric, ratings_count bigint, photos jsonb)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.avatar_url,
    (select round(avg(stars)::numeric, 1) from ratings r where r.barber_id = p.id),
    (select count(*) from ratings r where r.barber_id = p.id),
    coalesce((select jsonb_agg(g.path) from (select path from gallery_photos g where g.barber_id = p.id order by created_at desc limit 6) g), '[]'::jsonb)
  from profiles p
  where p.active and p.is_barber and p.role in ('admin','barber')
  order by p.full_name
$$;

-- ===== Pantalla del local (solo nombres de pila) =====
create or replace function public.display_board() returns jsonb
language sql stable security definer set search_path = public as $$
  with s as (select * from shop_settings where id = 1)
  select jsonb_build_object(
    'shop', s.name,
    'serving', coalesce((select jsonb_agg(x order by x.since) from (
        select split_part(p.full_name, ' ', 1) as barber, split_part(coalesce(c.full_name, 'Cliente'), ' ', 1) as client,
               a.actual_started_at as since, a.ends_at
        from appointments a join profiles p on p.id = a.barber_id left join clients c on c.id = a.client_id
        where a.status = 'in_progress') x), '[]'::jsonb),
    'queue', coalesce((select jsonb_agg(x order by x.created_at) from (
        select split_part(q.name, ' ', 1) as name, split_part(p.full_name, ' ', 1) as barber, q.created_at
        from queue_entries q left join profiles p on p.id = q.barber_id
        where q.status = 'waiting') x), '[]'::jsonb),
    'next', coalesce((select jsonb_agg(x order by x.starts_at) from (
        select a.starts_at, split_part(p.full_name, ' ', 1) as barber
        from appointments a join profiles p on p.id = a.barber_id
        where a.status in ('pending','confirmed') and a.starts_at > now()
          and (a.starts_at at time zone s.timezone)::date = (now() at time zone s.timezone)::date
        order by a.starts_at limit 6) x), '[]'::jsonb),
    'queue_enabled', s.queue_enabled)
  from s
$$;

-- ===== Clientes: resumen, historial =====
create or replace function public.clients_overview(p_search text default null, p_inactive_days int default null)
returns table(id uuid, full_name text, phone text, visits bigint, last_visit timestamptz, total_spent numeric,
              no_shows int, no_shows_forgiven int, stamps int, required int, card_token uuid)
language sql stable security definer set search_path = public as $$
  select c.id, c.full_name, c.phone,
    count(a.id) filter (where a.status = 'completed'),
    max(a.starts_at) filter (where a.status = 'completed'),
    coalesce(sum(a.total_price) filter (where a.status = 'completed'), 0),
    c.no_shows, c.no_shows_forgiven, lc.stamps, lc.required, c.card_token
  from clients c
  left join appointments a on a.client_id = c.id
  left join lateral (select stamps, required from loyalty_cards l where l.client_id = c.id and l.redeemed_at is null
                     order by created_at desc limit 1) lc on true
  where public.is_staff()
    and (coalesce(trim(p_search), '') = ''
         or c.full_name ilike '%' || trim(p_search) || '%'
         or (length(regexp_replace(p_search, '\D', '', 'g')) >= 3 and c.phone like '%' || regexp_replace(p_search, '\D', '', 'g') || '%'))
  group by c.id, lc.stamps, lc.required
  having p_inactive_days is null
      or max(a.starts_at) filter (where a.status = 'completed') < now() - make_interval(days => p_inactive_days)
  order by max(a.starts_at) filter (where a.status = 'completed') desc nulls last, c.created_at desc
  limit 300
$$;

create or replace function public.client_history(p_client uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.is_staff() then '[]'::jsonb else coalesce(jsonb_agg(x order by x.starts_at desc), '[]'::jsonb) end
  from (
    select a.id, a.starts_at, a.status, a.source, a.total_price, a.photo_path,
      p.full_name as barber,
      (select string_agg(i.name, ' + ') from appointment_items i where i.appointment_id = a.id) as services,
      (select stars from ratings r where r.appointment_id = a.id) as stars
    from appointments a join profiles p on p.id = a.barber_id
    where a.client_id = p_client and a.status <> 'held'
    order by a.starts_at desc limit 50
  ) x
$$;

-- ===== Finanzas =====
create or replace function public.finance_summary(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  with s as (select timezone as tz from shop_settings where id = 1),
  rng as (select (p_from::timestamp at time zone s.tz) as f, ((p_to + 1)::timestamp at time zone s.tz) as t from s),
  pays as (select p.method, p.amount from payments p, rng where p.status = 'confirmed'
           and coalesce(p.verified_at, p.created_at) >= rng.f and coalesce(p.verified_at, p.created_at) < rng.t),
  mv as (select m.* from stock_movements m, rng where m.created_at >= rng.f and m.created_at < rng.t),
  ex as (select * from expenses where spent_on between p_from and p_to),
  t as (select
    coalesce((select sum(amount) from pays), 0) as services,
    coalesce((select sum(qty * coalesce(unit_price, 0)) from mv where kind = 'sale'), 0) as products,
    coalesce((select sum(qty * coalesce(unit_cost, 0)) from mv where kind = 'purchase'), 0) as purchases,
    coalesce((select sum(amount) from ex), 0) as expenses)
  select case when not public.is_admin() then null else jsonb_build_object(
    'services_income', t.services,
    'by_method', jsonb_build_object(
      'cash', coalesce((select sum(amount) from pays where method = 'cash'), 0),
      'qr', coalesce((select sum(amount) from pays where method = 'qr'), 0),
      'transfer', coalesce((select sum(amount) from pays where method = 'transfer'), 0)),
    'products_income', t.products,
    'purchases', t.purchases,
    'expenses', t.expenses,
    'expenses_by_category', coalesce((select jsonb_agg(x order by x.total desc) from (
        select category, sum(amount) as total from ex group by category) x), '[]'::jsonb),
    'profit', t.services + t.products - t.purchases - t.expenses) end
  from t
$$;

-- Lo que le toca a cada barbero en un mes según su forma de pago
create or replace function public.commission_report(p_month date)
returns table(barber_id uuid, name text, pay_mode text, pay_percent numeric, pay_salary numeric, pay_chair_rent numeric,
              cuts bigint, revenue numeric, barber_share numeric, shop_share numeric)
language sql stable security definer set search_path = public as $$
  with s as (select timezone as tz from shop_settings where id = 1),
  rng as (select (date_trunc('month', p_month)::timestamp at time zone s.tz) as f,
                 ((date_trunc('month', p_month) + interval '1 month')::timestamp at time zone s.tz) as t from s),
  rev as (select a.barber_id, count(*) as cuts, sum(a.total_price) as total from appointments a, rng
          where a.status = 'completed' and a.starts_at >= rng.f and a.starts_at < rng.t group by a.barber_id)
  select p.id, p.full_name, p.pay_mode, p.pay_percent, p.pay_salary, p.pay_chair_rent,
    coalesce(rev.cuts, 0), coalesce(rev.total, 0) as revenue,
    case p.pay_mode
      when 'percent' then round(coalesce(rev.total, 0) * p.pay_percent / 100, 2)
      when 'salary' then p.pay_salary
      when 'mixed' then p.pay_salary + round(coalesce(rev.total, 0) * p.pay_percent / 100, 2)
      when 'chair_rent' then coalesce(rev.total, 0) - p.pay_chair_rent
    end,
    case p.pay_mode
      when 'percent' then coalesce(rev.total, 0) - round(coalesce(rev.total, 0) * p.pay_percent / 100, 2)
      when 'salary' then coalesce(rev.total, 0) - p.pay_salary
      when 'mixed' then coalesce(rev.total, 0) - p.pay_salary - round(coalesce(rev.total, 0) * p.pay_percent / 100, 2)
      when 'chair_rent' then p.pay_chair_rent
    end
  from profiles p left join rev on rev.barber_id = p.id
  where public.is_admin() and p.is_barber and p.active
  order by revenue desc
$$;

-- ===== RLS =====
alter table public.loyalty_cards enable row level security;
alter table public.loyalty_stamps enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;
alter table public.gallery_photos enable row level security;
alter table public.ratings enable row level security;

create policy "cards_staff_read" on public.loyalty_cards for select using (public.is_staff());
create policy "stamps_staff_read" on public.loyalty_stamps for select using (public.is_staff());
create policy "products_staff_read" on public.products for select using (public.is_staff());
create policy "products_admin_write" on public.products for all using (public.is_admin()) with check (public.is_admin());
create policy "moves_staff_read" on public.stock_movements for select using (public.is_staff());
create policy "moves_insert" on public.stock_movements for insert
  with check (public.is_admin() or (public.is_staff() and kind in ('sale','use')));
create policy "gallery_read" on public.gallery_photos for select using (true);
create policy "gallery_write" on public.gallery_photos for insert
  with check (public.is_staff() and (barber_id = (select auth.uid()) or public.is_admin()));
create policy "gallery_delete" on public.gallery_photos for delete
  using (barber_id = (select auth.uid()) or public.is_admin());
create policy "ratings_staff_read" on public.ratings for select using (public.is_staff());

-- Fotos: galería pública en "shop/gallery/<barbero>/", fotos de cortes privadas en "cuts"
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('cuts', 'cuts', false, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

create policy "gallery_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'shop' and (storage.foldername(name))[1] = 'gallery'
              and public.is_staff() and ((storage.foldername(name))[2] = (select auth.uid())::text or public.is_admin()));
create policy "gallery_remove" on storage.objects for delete to authenticated
  using (bucket_id = 'shop' and (storage.foldername(name))[1] = 'gallery'
         and ((storage.foldername(name))[2] = (select auth.uid())::text or public.is_admin()));
create policy "cuts_staff_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'cuts' and public.is_staff());
create policy "cuts_staff_read" on storage.objects for select to authenticated
  using (bucket_id = 'cuts' and public.is_staff());

revoke execute on function public.add_stamp(uuid, uuid) from public, anon;
revoke execute on function public.redeem_reward(uuid, text) from public, anon;
revoke execute on function public.card_json(uuid) from public, anon, authenticated;
revoke execute on function public.staff_card(uuid) from public, anon;
revoke execute on function public.apply_stock_movement() from public, anon, authenticated;
revoke execute on function public.clients_overview(text, int) from public, anon;
revoke execute on function public.client_history(uuid) from public, anon;
revoke execute on function public.finance_summary(date, date) from public, anon;
revoke execute on function public.commission_report(date) from public, anon;

alter publication supabase_realtime add table public.stock_movements;
