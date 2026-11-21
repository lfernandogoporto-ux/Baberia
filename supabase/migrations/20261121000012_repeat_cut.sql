-- El historial del cliente devuelve barbero y servicios para "Repetir este corte"
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
        select a.id, a.starts_at, a.ends_at, a.status, a.total_price, a.barber_id, p.full_name as barber,
          (select string_agg(i.name, ' + ') from appointment_items i where i.appointment_id = a.id) as services
        from appointments a join profiles p on p.id = a.barber_id
        where a.client_id = (select id from cl) and a.status in ('pending','confirmed','in_progress') and a.ends_at > now()) x), '[]'::jsonb),
    'past', coalesce((select jsonb_agg(x order by x.starts_at desc) from (
        select a.id, a.starts_at, a.status, a.total_price, a.barber_id, p.full_name as barber,
          (select string_agg(i.name, ' + ') from appointment_items i where i.appointment_id = a.id) as services,
          (select array_agg(i.service_id) from appointment_items i where i.appointment_id = a.id and i.service_id is not null) as service_ids,
          (select stars from ratings r where r.appointment_id = a.id) as stars
        from appointments a join profiles p on p.id = a.barber_id
        where a.client_id = (select id from cl) and (a.status in ('completed','cancelled','no_show') or a.ends_at <= now())
          and a.status <> 'held'
        order by a.starts_at desc limit 30) x), '[]'::jsonb),
    'card', case when s.loyalty_enabled and (select id from cl) is not null then public.card_json((select id from cl)) end) end
  from s
$$;
