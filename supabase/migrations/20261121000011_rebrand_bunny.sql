-- Nuevo nombre del local (logo de Bunny Barber Studio) y datos de contacto para la página de inicio
alter table public.shop_settings alter column name set default 'Bunny Barber Studio';
update public.shop_settings set name = 'Bunny Barber Studio' where id = 1 and name = 'Barbería Casa';

alter table public.shop_settings
  add column phone text,
  add column whatsapp text,
  add column instagram text,
  add column maps_url text,
  add column about text,
  add column hide_prices boolean not null default false;

-- Lo que ve cualquier visitante en el inicio: datos del local, horario de hoy, servicios, barberos, opiniones y fotos
create or replace function public.shop_public() returns jsonb
language sql stable security definer set search_path = public as $$
  with s as (select * from shop_settings where id = 1),
  today as (select (now() at time zone s.timezone)::date as d, (now() at time zone s.timezone)::time as t from s),
  hours as (
    select wh.start_time, wh.end_time from working_hours wh join profiles p on p.id = wh.barber_id, today
    where p.active and p.is_barber and wh.weekday = extract(dow from today.d)::int
  ),
  week as (
    select wh.weekday, min(wh.start_time) as open, max(wh.end_time) as close
    from working_hours wh join profiles p on p.id = wh.barber_id where p.active and p.is_barber group by wh.weekday
  )
  select jsonb_build_object(
    'name', s.name, 'address', s.address, 'phone', s.phone, 'whatsapp', s.whatsapp, 'instagram', s.instagram,
    'maps_url', s.maps_url, 'about', s.about, 'hide_prices', s.hide_prices, 'queue_enabled', s.queue_enabled,
    'loyalty', case when s.loyalty_enabled then jsonb_build_object('stamps', s.loyalty_stamps, 'reward', s.loyalty_reward) end,
    'today_open', (select min(start_time) from hours), 'today_close', (select max(end_time) from hours),
    'open_now', exists (select 1 from hours, today where today.t >= hours.start_time and today.t < hours.end_time),
    'week', coalesce((select jsonb_agg(jsonb_build_object('weekday', weekday, 'open', open, 'close', close) order by weekday) from week), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'price', base_price, 'minutes', base_minutes) order by sort_order, name)
                          from services where active), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(x) from (
        select r.stars, r.comment, split_part(coalesce(c.full_name, 'Cliente'), ' ', 1) as client, split_part(p.full_name, ' ', 1) as barber, r.created_at
        from ratings r join appointments a on a.id = r.appointment_id join profiles p on p.id = r.barber_id
        left join clients c on c.id = a.client_id
        where r.stars >= 4 and r.comment is not null order by r.created_at desc limit 6) x), '[]'::jsonb),
    'rating', (select round(avg(stars)::numeric, 1) from ratings), 'ratings_count', (select count(*) from ratings),
    'photos', coalesce((select jsonb_agg(path) from (select path from gallery_photos order by created_at desc limit 9) g), '[]'::jsonb))
  from s
$$;

-- Primer horario libre con cualquier barbero para una duración
create or replace function public.first_available(p_minutes int, p_days int default 7)
returns table(barber_id uuid, full_name text, slot_start timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare d date; tz text; b record; t timestamptz;
begin
  select timezone into tz from shop_settings where id = 1;
  for i in 0 .. least(greatest(p_days, 1), 30) - 1 loop
    d := (now() at time zone tz)::date + i;
    barber_id := null;
    for b in select p.id, p.full_name from profiles p where p.active and p.is_barber and p.role in ('admin','barber') loop
      select g.slot_start into t from public.get_available_slots(b.id, d, p_minutes) g order by 1 limit 1;
      if t is not null and (barber_id is null or t < slot_start) then
        barber_id := b.id; full_name := b.full_name; slot_start := t;
      end if;
    end loop;
    if barber_id is not null then return next; return; end if;
  end loop;
end $$;
