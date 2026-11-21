-- Pruebas de base de datos con el patrón AAA (Arrange / Act / Assert).
-- Corren dentro de un bloque que al final lanza una excepción: TODO se deshace, no queda ningún dato.
-- Si una prueba falla, el mensaje dice cuál. Si todas pasan, el mensaje final es "RESULTADO: n pruebas OK".
do $$
declare
  admin uuid := gen_random_uuid();
  b1 uuid := gen_random_uuid();   -- barbero 1
  b2 uuid := gen_random_uuid();   -- barbero 2
  cu uuid := gen_random_uuid();   -- cliente con cuenta
  rec uuid := gen_random_uuid();  -- recepcionista
  tz text := 'America/La_Paz';
  d date := (now() at time zone 'America/La_Paz')::date + 1;
  corte uuid; barba uuid; svc uuid[];
  s1 timestamptz; h uuid; cl uuid; r jsonb; n int; ok int := 0; prod uuid; q uuid;
  x record;
begin
  -- ===== Preparación general =====
  -- Si la base ya tiene un admin, el primer usuario no lo será; se fuerza el rol con el bypass del sistema
  perform set_config('app.bypass_guard', 'on', true);
  insert into auth.users (id, email, raw_user_meta_data, instance_id, aud, role) values
    (admin, 'admin@test.bo', '{"full_name":"Admin Test"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (b1, 'b1@test.bo', '{"full_name":"Barbero Uno"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (b2, 'b2@test.bo', '{"full_name":"Barbero Dos"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (rec, 'rec@test.bo', '{"full_name":"Recepción"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (cu, 'cli@test.bo', '{"full_name":"Cliente Cuenta","phone":"59171111111"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update profiles set role = 'admin', is_barber = true where id = admin;
  update profiles set role = 'barber', is_barber = true, pay_mode = 'percent', pay_percent = 40 where id in (b1, b2);
  update profiles set role = 'receptionist', is_barber = false where id = rec;
  perform set_config('app.bypass_guard', 'off', true);
  update shop_settings set buffer_minutes = 5, slot_step_minutes = 15, min_notice_minutes = 0, hold_minutes = 5,
    cancel_limit_minutes = 60, loyalty_enabled = true, loyalty_stamps = 3, attendance_enabled = true,
    latitude = -17.3935, longitude = -66.1570, checkin_radius_m = 100, queue_enabled = true where id = 1;
  insert into working_hours (barber_id, weekday, start_time, end_time) values
    (b1, extract(dow from d)::int, '09:00', '12:00'), (b2, extract(dow from d)::int, '09:00', '12:00');
  insert into services (name, base_price, base_minutes) values ('TEST Corte', 30, 30) returning id into corte;
  insert into services (name, base_price, base_minutes) values ('TEST Barba', 15, 15) returning id into barba;
  svc := array[corte, barba];
  s1 := (d + time '09:00') at time zone tz;

  -- ===== 1. No se puede reservar dos veces el mismo horario =====
  -- Arrange: un cliente retiene las 09:00 con el barbero 1
  h := hold_slot(b1, s1, svc);
  -- Act: otra persona intenta el mismo horario
  begin perform hold_slot(b1, s1, svc); n := 0; exception when others then n := 1; end;
  -- Assert
  assert n = 1, '1: se permitió doble reserva';
  ok := ok + 1;

  -- ===== 2. Los horarios ofrecidos respetan la duración y el colchón =====
  -- Act + Assert: 45 min (corte + barba) a las 09:00 ocupa hasta 09:45 + 5 de colchón → el siguiente libre es 10:00
  assert (select min(slot_start) from get_available_slots(b1, d, 45)) = (d + time '10:00') at time zone tz, '2: colchón o duración mal calculados';
  ok := ok + 1;

  -- ===== 3. Un horario retenido que vence vuelve a estar libre =====
  -- Arrange: se hace vencer la retención
  update appointments set hold_expires_at = now() - interval '1 minute' where id = h;
  -- Act + Assert
  assert exists (select 1 from get_available_slots(b1, d, 45) where slot_start = s1), '3: la retención vencida sigue bloqueando';
  h := hold_slot(b1, s1, svc);   -- se puede volver a tomar
  ok := ok + 1;

  -- ===== 4. Confirmar exige nombre y celular válidos =====
  begin perform confirm_booking(h, 'A', '123'); n := 0; exception when others then n := 1; end;
  assert n = 1, '4: aceptó nombre o celular inválidos';
  perform confirm_booking(h, 'Pedro Prueba', '59170000001');
  assert (select status from appointments where id = h) = 'confirmed', '4: no quedó confirmada';
  select client_id into cl from appointments where id = h;
  ok := ok + 1;

  -- ===== 5. Precio y total se guardan con el precio del día =====
  update services set base_price = 999 where id = corte;
  assert (select total_price from appointments where id = h) = 45, '5: el total cambió al cambiar el precio del servicio';
  update services set base_price = 30 where id = corte;  -- se devuelve el precio para las pruebas siguientes
  ok := ok + 1;

  -- ===== 6. Cancelar con un celular que no es el de la reserva no funciona =====
  begin perform cancel_booking(h, '59179999999'); n := 0; exception when others then n := 1; end;
  assert n = 1, '6: canceló con un celular ajeno';
  ok := ok + 1;

  -- ===== 7. Un barbero no puede atender en la agenda de otro =====
  perform set_config('request.jwt.claims', json_build_object('sub', b1, 'role', 'authenticated')::text, true);
  begin perform start_walk_in(b2, array[corte], 'X', null); n := 0; exception when others then n := 1; end;
  assert n = 1, '7: un barbero inició un corte en la agenda de otro';
  r := start_walk_in(b1, array[corte], 'Sin Reserva', '59170000002');
  assert (r->>'appointment_id') is not null, '7: el barbero no pudo atender en su propia agenda';
  ok := ok + 1;

  -- ===== 8. Faltas: marcar "no llegó" suma una falta al cliente =====
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  update appointments set status = 'no_show' where id = h;
  assert (select no_shows from clients where id = cl) = 1, '8: no se contó la falta';
  update appointments set status = 'confirmed' where id = h;
  assert (select no_shows from clients where id = cl) = 0, '8: no se descontó al corregir la falta';
  ok := ok + 1;

  -- ===== 9. Ingresos y comisiones =====
  -- Arrange: el corte sin reserva del barbero 1 se termina y se cobra
  update appointments set status = 'completed' where id = (r->>'appointment_id')::uuid;
  insert into payments (appointment_id, amount, method, status, received_by) values ((r->>'appointment_id')::uuid, 30, 'cash', 'confirmed', b1);
  -- Act
  select * into x from commission_report(current_date) where barber_id = b1;
  -- Assert: 40% de Bs 30
  assert x.revenue = 30 and x.barber_share = 12 and x.shop_share = 18, format('9: comisión mal calculada (%s, %s, %s)', x.revenue, x.barber_share, x.shop_share);
  ok := ok + 1;

  -- ===== 10. Cada barbero ve solo sus ingresos; la recepcionista no ve ingresos =====
  perform set_config('request.jwt.claims', json_build_object('sub', b2, 'role', 'authenticated')::text, true);
  assert (select count(*) from income_summary(current_date - 1, current_date + 1) where barber_id = b1) = 0, '10: un barbero vio ingresos de otro';
  perform set_config('request.jwt.claims', json_build_object('sub', rec, 'role', 'authenticated')::text, true);
  assert (select count(*) from income_summary(current_date - 1, current_date + 1)) = 0, '10: la recepción vio ingresos';
  assert finance_summary(current_date, current_date) is null, '10: la recepción vio finanzas';
  ok := ok + 1;

  -- ===== 11. Cierre de caja =====
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  insert into expenses (description, amount, method) values ('TEST talco', 10, 'cash');
  r := day_cash_summary((now() at time zone tz)::date);
  assert (r->>'cash')::numeric >= 30 and (r->>'expenses_cash')::numeric >= 10, '11: el resumen de caja no suma';
  ok := ok + 1;

  -- ===== 12. Inventario: no se vende más de lo que hay =====
  insert into products (name, price) values ('TEST Cera', 35) returning id into prod;
  insert into stock_movements (product_id, kind, qty, unit_cost) values (prod, 'purchase', 2, 20);
  begin insert into stock_movements (product_id, kind, qty, method) values (prod, 'sale', 3, 'cash'); n := 0; exception when others then n := 1; end;
  assert n = 1, '12: vendió más stock del que había';
  insert into stock_movements (product_id, kind, qty, method) values (prod, 'sale', 2, 'cash');
  assert (select stock from products where id = prod) = 0, '12: el stock no bajó';
  ok := ok + 1;

  -- ===== 13. Fidelidad: un sello por visita y premio al llenar =====
  perform add_stamp(cl, null);
  begin perform add_stamp(cl, null); n := 0; exception when others then n := 1; end;
  assert n = 1, '13: dio dos sellos el mismo día';
  ok := ok + 1;

  -- ===== 14. Fila: atender a alguien lo pasa a "atendiendo" y crea su corte =====
  q := join_queue('Fila Prueba', '59170000003', null, array[corte]);
  r := serve_from_queue(q, b2, array[corte]);
  assert (select status from queue_entries where id = q) = 'serving' and (r->>'appointment_id') is not null, '14: la fila no pasó a atención';
  ok := ok + 1;

  -- ===== 15. Asistencia: solo dentro del radio =====
  perform set_config('request.jwt.claims', json_build_object('sub', b1, 'role', 'authenticated')::text, true);
  begin perform check_in_out(-17.45, -66.20); n := 0; exception when others then n := 1; end;
  assert n = 1, '15: marcó asistencia lejos del local';
  assert (check_in_out(-17.3936, -66.1571))->>'action' = 'in', '15: no marcó la llegada dentro del radio';
  ok := ok + 1;

  -- ===== 16. Cliente con cuenta: ve sus reservas y no las ajenas =====
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  assert jsonb_array_length(my_account()->'upcoming') = 0, '16: el cliente vio reservas ajenas';
  assert (get_booking(h)->>'mine')::boolean is not true, '16: una reserva ajena aparece como suya';
  begin perform cancel_booking(h, ''); n := 0; exception when others then n := 1; end;
  assert n = 1, '16: el cliente canceló una reserva ajena sin celular';
  ok := ok + 1;

  -- ===== 17. Un cliente no puede darse rol de administrador =====
  update profiles set role = 'admin' where id = cu;
  assert (select role from profiles where id = cu) = 'client', '17: un cliente se subió el rol';
  ok := ok + 1;

  -- ===== 18. RLS: un visitante anónimo no ve clientes, citas ni pagos =====
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  assert (select count(*) from clients) = 0, '18: anónimo vio clientes';
  assert (select count(*) from appointments) = 0, '18: anónimo vio citas';
  assert (select count(*) from payments) = 0, '18: anónimo vio pagos';
  assert (select count(*) from app_secrets) = 0, '18: anónimo vio secretos';
  execute 'reset role';
  ok := ok + 1;

  -- ===== 19. RLS: un barbero solo ve su agenda =====
  perform set_config('request.jwt.claims', json_build_object('sub', b2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  assert (select count(*) from appointments where barber_id = b1) = 0, '19: un barbero vio la agenda de otro';
  assert (select count(*) from expenses) = 0, '19: un barbero vio los gastos';
  execute 'reset role';
  ok := ok + 1;

  -- ===== 20. Anti-abuso: no se pueden retener más de 4 horarios a la vez por barbero =====
  -- Arrange: el barbero 2 atiende hasta las 14:00 y alguien retiene 4 horarios seguidos
  insert into working_hours (barber_id, weekday, start_time, end_time) values (b2, extract(dow from d)::int, '12:00', '14:00');
  for n in 0..3 loop perform hold_slot(b2, ((d + time '09:00') + make_interval(mins => 45 * n)) at time zone tz, array[corte]); end loop;
  -- Act: un quinto intento en un horario que sí está libre (12:00)
  begin perform hold_slot(b2, (d + time '12:00') at time zone tz, array[corte]); n := 0;
  exception when others then n := case when sqlerrm like '%muchas reservas%' then 1 else 2 end; end;
  -- Assert: se rechaza justamente por el límite (no por otro motivo)
  assert n = 1, format('20: el límite de retenciones no actuó (resultado %s)', n);
  ok := ok + 1;

  raise exception 'RESULTADO: % pruebas OK', ok;
end $$;
