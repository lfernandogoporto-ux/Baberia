-- Correcciones de la auditoría: índices, políticas sin duplicar, anti-abuso de retenciones y de comprobantes

-- ===== 1. Índices para llaves foráneas y consultas frecuentes =====
create index if not exists appointment_items_service_id_idx on public.appointment_items (service_id);
create index if not exists appointments_created_by_idx on public.appointments (created_by);
create index if not exists barber_services_service_id_idx on public.barber_services (service_id);
create index if not exists cash_closings_closed_by_idx on public.cash_closings (closed_by);
create index if not exists expenses_created_by_idx on public.expenses (created_by);
create index if not exists loyalty_stamps_card_id_idx on public.loyalty_stamps (card_id);
create index if not exists loyalty_stamps_stamped_by_idx on public.loyalty_stamps (stamped_by);
create index if not exists payments_received_by_idx on public.payments (received_by);
create index if not exists payments_verified_by_idx on public.payments (verified_by);
create index if not exists payments_paid_at_idx on public.payments ((coalesce(verified_at, created_at))) where status = 'confirmed';
create index if not exists push_subscriptions_appointment_id_idx on public.push_subscriptions (appointment_id);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
create index if not exists queue_entries_appointment_id_idx on public.queue_entries (appointment_id);
create index if not exists queue_entries_barber_id_idx on public.queue_entries (barber_id);
create index if not exists ratings_barber_id_idx on public.ratings (barber_id);
create index if not exists stock_movements_created_by_idx on public.stock_movements (created_by);
create index if not exists appointments_held_idx on public.appointments (barber_id, hold_expires_at) where status = 'held';

-- ===== 2. Políticas: la escritura del admin ya no duplica la lectura =====
do $$
declare t text;
begin
  foreach t in array array['services', 'barber_services', 'working_hours', 'products'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format('create policy %I on public.%I for insert with check (public.is_admin())', t || '_admin_insert', t);
    execute format('create policy %I on public.%I for update using (public.is_admin()) with check (public.is_admin())', t || '_admin_update', t);
    execute format('create policy %I on public.%I for delete using (public.is_admin())', t || '_admin_delete', t);
  end loop;
end $$;

drop policy if exists "time_off_write" on public.time_off;
create policy "time_off_insert" on public.time_off for insert with check (public.is_admin() or barber_id = (select auth.uid()));
create policy "time_off_update" on public.time_off for update using (public.is_admin() or barber_id = (select auth.uid())) with check (public.is_admin() or barber_id = (select auth.uid()));
create policy "time_off_delete" on public.time_off for delete using (public.is_admin() or barber_id = (select auth.uid()));

-- ===== 3. Anti-abuso: nadie puede retener todos los horarios a la vez =====
create or replace function public.hold_slot(p_barber uuid, p_start timestamptz, p_service_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  s public.shop_settings;
  v_minutes int; v_n int; v_id uuid;
begin
  select * into s from shop_settings where id = 1;
  perform pg_advisory_xact_lock(hashtext(p_barber::text));
  delete from appointments where status = 'held' and hold_expires_at < now();

  -- Límite de retenciones activas: por barbero y en total (una persona real retiene una a la vez)
  if (select count(*) from appointments where status = 'held' and barber_id = p_barber) >= 4
     or (select count(*) from appointments where status = 'held') >= 40 then
    raise exception 'Hay muchas reservas en proceso en este momento. Intenta de nuevo en un minuto.';
  end if;

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

-- ===== 4. Comprobantes: solo en la carpeta de una reserva vigente y como máximo 5 por reserva =====
create or replace function public.can_upload_proof(p_folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from appointments a
    where a.id::text = p_folder and a.status in ('pending','confirmed','in_progress')
  ) and (select count(*) from storage.objects o where o.bucket_id = 'proofs' and (storage.foldername(o.name))[1] = p_folder) < 5
$$;

drop policy if exists "proofs_upload" on storage.objects;
create policy "proofs_upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'proofs' and public.can_upload_proof((storage.foldername(name))[1]));

-- El comprobante enviado debe estar en la carpeta de su propia reserva
create or replace function public.submit_payment_proof(p_appointment uuid, p_phone text, p_proof_path text, p_amount numeric, p_method public.payment_method default 'qr')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.owns_booking(p_appointment, p_phone) then raise exception 'No encontramos esa reserva con ese celular'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then raise exception 'Monto inválido'; end if;
  if p_proof_path is null or split_part(p_proof_path, '/', 1) <> p_appointment::text then raise exception 'Comprobante inválido'; end if;
  if (select count(*) from payments where appointment_id = p_appointment and status = 'to_verify') >= 3 then
    raise exception 'Ya enviaste varios comprobantes. Espera a que la barbería los revise.';
  end if;
  insert into payments (appointment_id, amount, method, status, proof_path)
  values (p_appointment, p_amount, p_method, 'to_verify', p_proof_path)
  returning id into v_id;
  return v_id;
end $$;

drop index if exists public.stock_movements_product_id_created_at_idx;
create index if not exists stock_movements_product_id_idx on public.stock_movements (product_id);
