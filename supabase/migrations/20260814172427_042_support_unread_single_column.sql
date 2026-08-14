-- 042 — El estado «sin leer» se expresa con UNA sola columna
--
-- ═════════════════════════════════════════════════════════════════════════════
-- POR QUÉ ESTA MIGRACIÓN EXISTE
-- ═════════════════════════════════════════════════════════════════════════════
--
-- La 041 dejó el estado de lectura repartido en dos columnas, y «sin leer» se
-- expresaba comparándolas entre sí:
--
--   admin_responded_at is not null
--   and (response_seen_at is null or response_seen_at < admin_responded_at)
--
-- Esa condición es correcta en SQL, pero NO se puede expresar por PostgREST,
-- que es como la aplicación consulta. PostgREST interpreta el lado derecho de
-- un filtro como un LITERAL, no como otra columna. Comprobado contra la API
-- real de este proyecto:
--
--   GET /rest/v1/support_tickets?or=(response_seen_at.lt.admin_responded_at)
--   → 400  22007  invalid input syntax for type timestamp with time zone:
--                 "admin_responded_at"
--
-- Se podría haber resuelto con otra RPC solo para contar, pero eso añade una
-- función más que mantener para algo que el modelo puede expresar solo.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- EL CAMBIO
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Cuando llega una respuesta NUEVA o CORREGIDA, el trigger pone además
-- `response_seen_at` a NULL. Con eso, «sin leer» pasa a ser una condición de
-- una sola columna:
--
--   admin_responded_at is not null  and  response_seen_at is null
--
-- que PostgREST sí expresa: `.not('admin_responded_at','is',null)`
--                           `.is('response_seen_at', null)`
--
-- Se pierde el histórico de «cuándo miró por última vez», que no se usa en
-- ningún sitio. A cambio, la condición es trivial, no depende de la precisión
-- relativa de dos marcas de tiempo y no puede desincronizarse.
--
-- NO se toca ningún dato existente: las filas rellenadas por la 041 tienen
-- `response_seen_at` informado, así que siguen contando como leídas — que es
-- exactamente lo que se decidió allí para no llenar de avisos a los clientes.

create or replace function public.handle_support_response_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_respuesta_util boolean;
begin
  -- (a) ¿Ha cambiado la respuesta?
  --
  -- `is distinct from` trata NULL como un valor más, así que guardar
  -- exactamente el mismo texto no entra aquí: un administrador que reabre el
  -- formulario y pulsa «Guardar» sin tocar nada NO vuelve a marcarla como nueva.
  if new.admin_response is distinct from old.admin_response then
    v_respuesta_util := coalesce(btrim(new.admin_response), '') <> '';

    if v_respuesta_util then
      -- Respuesta nueva o corregida: se sella la fecha y vuelve a estar SIN
      -- LEER. Poner `response_seen_at` a NULL es lo que hace que el estado se
      -- pueda consultar mirando una sola columna.
      new.admin_responded_at := now();
      new.response_seen_at   := null;
    else
      -- La respuesta se ha retirado: no hay nada que leer, así que tampoco hay
      -- fecha de respuesta.
      new.admin_responded_at := null;
      new.response_seen_at   := null;
    end if;

    return new;
  end if;

  -- (b) Marcado de lectura: no debe mover `updated_at`.
  --
  -- Sin esto, cada vez que alguien abriera su pantalla de Ayuda se movería la
  -- «Última actualización» del ticket — una fecha que se le enseña al propio
  -- usuario y al administrador. Leer no es actualizar.
  if new.response_seen_at is distinct from old.response_seen_at
     and new.admin_response      is not distinct from old.admin_response
     and new.status              is not distinct from old.status
     and new.priority            is not distinct from old.priority
     and new.category            is not distinct from old.category
     and new.subject             is not distinct from old.subject
     and new.message             is not distinct from old.message
     and new.admin_responded_at  is not distinct from old.admin_responded_at
     and new.resolved_at         is not distinct from old.resolved_at then
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$$;

-- La RPC deja de necesitar la comparación entre columnas.
create or replace function public.mark_my_support_responses_seen()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_filas integer;
begin
  -- Sin sesión no se marca nada. No es un error: es que no hay nadie.
  if v_uid is null then
    return 0;
  end if;

  update public.support_tickets t
     set response_seen_at = now()
   where t.user_id = v_uid                  -- SOLO las suyas
     and t.admin_responded_at is not null   -- que tengan respuesta
     and t.response_seen_at   is null;      -- y estén sin leer

  get diagnostics v_filas = row_count;
  return v_filas;
end;
$$;

comment on column public.support_tickets.response_seen_at is
  'Cuándo vio la respuesta la persona propietaria del ticket. NULL = sin leer. '
  'La pone a NULL el trigger cuando llega una respuesta nueva, y solo la '
  'rellena `mark_my_support_responses_seen()`.';

-- El índice parcial de 041 sigue sirviendo, pero se ajusta al predicado real
-- que va a usar la consulta: solo las filas SIN LEER.
drop index if exists public.idx_support_tickets_unread;
create index if not exists idx_support_tickets_unread
  on public.support_tickets (user_id)
  where admin_responded_at is not null and response_seen_at is null;
