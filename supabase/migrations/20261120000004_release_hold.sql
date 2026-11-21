-- Libera un horario retenido si el cliente cambia de opinión (solo afecta citas en estado "held")
create or replace function public.release_hold(p_appointment uuid) returns void
language sql security definer set search_path = public as $$
  delete from appointments where id = p_appointment and status = 'held'
$$;
