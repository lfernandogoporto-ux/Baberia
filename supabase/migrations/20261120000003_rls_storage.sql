-- Etapa 1: seguridad por filas (RLS), almacenamiento y tiempo real

alter table public.shop_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.staff_invites enable row level security;
alter table public.services enable row level security;
alter table public.barber_services enable row level security;
alter table public.working_hours enable row level security;
alter table public.time_off enable row level security;
alter table public.clients enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_items enable row level security;
alter table public.payments enable row level security;
alter table public.push_subscriptions enable row level security;

-- Configuración: todos leen, solo el admin cambia
create policy "settings_read" on public.shop_settings for select using (true);
create policy "settings_admin_update" on public.shop_settings for update using (public.is_admin()) with check (public.is_admin());

-- Perfiles
create policy "profiles_read" on public.profiles for select using (id = (select auth.uid()) or public.is_staff());
create policy "profiles_update" on public.profiles for update
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());
create policy "profiles_admin_delete" on public.profiles for delete using (public.is_admin());

create policy "invites_admin" on public.staff_invites for all using (public.is_admin()) with check (public.is_admin());

-- Catálogo y horarios: lectura pública, escritura del admin
create policy "services_read" on public.services for select using (true);
create policy "services_admin_write" on public.services for all using (public.is_admin()) with check (public.is_admin());

create policy "barber_services_read" on public.barber_services for select using (true);
create policy "barber_services_admin_write" on public.barber_services for all using (public.is_admin()) with check (public.is_admin());

create policy "working_hours_read" on public.working_hours for select using (true);
create policy "working_hours_admin_write" on public.working_hours for all using (public.is_admin()) with check (public.is_admin());

create policy "time_off_read" on public.time_off for select using (public.is_staff());
create policy "time_off_write" on public.time_off for all
  using (public.is_admin() or barber_id = (select auth.uid()))
  with check (public.is_admin() or barber_id = (select auth.uid()));

-- Clientes: solo el personal
create policy "clients_staff_all" on public.clients for all using (public.is_staff()) with check (public.is_staff());

-- Citas: admin y recepcionista ven todo; el barbero solo su agenda
create policy "appointments_read" on public.appointments for select
  using (public.is_front_desk() or (public.is_staff() and barber_id = (select auth.uid())));
create policy "appointments_insert" on public.appointments for insert
  with check (public.is_front_desk() or (public.is_staff() and barber_id = (select auth.uid())));
create policy "appointments_update" on public.appointments for update
  using (public.is_front_desk() or (public.is_staff() and barber_id = (select auth.uid())))
  with check (public.is_front_desk() or (public.is_staff() and barber_id = (select auth.uid())));
create policy "appointments_admin_delete" on public.appointments for delete using (public.is_admin());

-- Servicios de la cita y pagos: siguen la visibilidad de la cita
create policy "items_all" on public.appointment_items for all
  using (exists (select 1 from public.appointments a where a.id = appointment_id))
  with check (public.is_staff() and exists (select 1 from public.appointments a where a.id = appointment_id));

create policy "payments_read" on public.payments for select
  using (exists (select 1 from public.appointments a where a.id = appointment_id));
create policy "payments_insert" on public.payments for insert
  with check (public.is_staff() and exists (select 1 from public.appointments a where a.id = appointment_id));
create policy "payments_update" on public.payments for update
  using (public.is_staff() and exists (select 1 from public.appointments a where a.id = appointment_id))
  with check (public.is_staff() and exists (select 1 from public.appointments a where a.id = appointment_id));
create policy "payments_admin_delete" on public.payments for delete using (public.is_admin());

create policy "push_own" on public.push_subscriptions for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Almacenamiento: "shop" público (QR, fotos), "proofs" privado (comprobantes)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('shop', 'shop', true, 5242880, array['image/png','image/jpeg','image/webp']),
  ('proofs', 'proofs', false, 5242880, array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy "shop_admin_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'shop' and public.is_admin());
create policy "shop_admin_update" on storage.objects for update to authenticated
  using (bucket_id = 'shop' and public.is_admin());
create policy "shop_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'shop' and public.is_admin());

create policy "proofs_upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'proofs');
create policy "proofs_staff_read" on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and public.is_staff());

-- Tiempo real para la agenda
alter publication supabase_realtime add table public.appointments, public.payments;
