-- El cierre de caja también cuenta la venta de productos según cómo se pagó
create or replace function public.day_cash_summary(p_day date) returns jsonb
language sql stable security definer set search_path = public as $$
  with s as (select timezone as tz from shop_settings where id = 1),
  rng as (select (p_day::timestamp at time zone s.tz) as f, ((p_day + 1)::timestamp at time zone s.tz) as t from s),
  pays as (
    select p.method, p.amount, p.received_by from payments p, rng
    where p.status = 'confirmed' and coalesce(p.verified_at, p.created_at) >= rng.f and coalesce(p.verified_at, p.created_at) < rng.t
  ),
  sales as (
    select m.method, m.qty * coalesce(m.unit_price, 0) as amount, m.created_by as received_by from stock_movements m, rng
    where m.kind = 'sale' and m.created_at >= rng.f and m.created_at < rng.t
  )
  select case when not public.is_front_desk() then null else jsonb_build_object(
    'cash', coalesce((select sum(amount) from pays where method = 'cash'), 0),
    'qr', coalesce((select sum(amount) from pays where method = 'qr'), 0),
    'transfer', coalesce((select sum(amount) from pays where method = 'transfer'), 0),
    'products_cash', coalesce((select sum(amount) from sales where coalesce(method, 'cash') = 'cash'), 0),
    'products_qr', coalesce((select sum(amount) from sales where method = 'qr'), 0),
    'products_transfer', coalesce((select sum(amount) from sales where method = 'transfer'), 0),
    'by_person', coalesce((select jsonb_agg(x) from (
        select pr.full_name as name, u.method, sum(u.amount) as total
        from (select * from pays union all select coalesce(method, 'cash'), amount, received_by from sales) u
        left join profiles pr on pr.id = u.received_by
        group by pr.full_name, u.method order by pr.full_name) x), '[]'::jsonb),
    'expenses_cash', coalesce((select sum(amount) from expenses where spent_on = p_day and method = 'cash'), 0),
    'closing', (select to_jsonb(c) from cash_closings c where c.day = p_day)
  ) end
$$;
