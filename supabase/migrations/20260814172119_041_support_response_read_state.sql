-- 041 — Estado de lectura de las respuestas de soporte
--
-- ═════════════════════════════════════════════════════════════════════════════
-- POR QUÉ HACE FALTA ESQUEMA NUEVO
-- ═════════════════════════════════════════════════════════════════════════════
--
-- El badge de «Ayuda» del portal cliente contaba, hasta ahora, los tickets con
-- `admin_response` informado. Es un dato REAL pero no es una notificación: no
-- baja nunca, porque una respuesta no deja de existir cuando alguien la lee.
--
-- Con el esquema anterior no había forma de distinguir «respondido» de «leído»:
--
--   · no existía ninguna columna de lectura;
--   · `updated_at` NO sirve como fecha de respuesta: el trigger
--     `set_updated_at` la refresca en CUALQUIER escritura, y
--     `updateTicketStatus` cambia el estado sin tocar la respuesta. Un ticket
--     respondido el lunes y cerrado el viernes tiene `updated_at` del viernes;
--   · `resolved_at` marca el paso a `resolved`/`closed`, que es otra cosa: un
--     ticket respondido y todavía `in_progress` lo tiene a nulo.
--
-- Se añaden por tanto DOS marcas de tiempo, que es el mínimo que responde a la
-- pregunta «¿hay algo que esta persona no haya visto?».
--
-- ═════════════════════════════════════════════════════════════════════════════
-- CÓMO SE ESCRIBE CADA UNA
-- ═════════════════════════════════════════════════════════════════════════════
--
--   admin_responded_at  la escribe un TRIGGER, no la aplicación. Así queda
--                       garantizada aunque alguien actualice la fila desde
--                       PostgREST, desde psql o desde una acción futura que
--                       nadie ha escrito todavía.
--
--   response_seen_at    la escribe una FUNCIÓN `security definer`, nunca el
--                       cliente directamente. Ver el bloque de seguridad.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- SEGURIDAD: POR QUÉ UNA RPC Y NO UNA POLICY UPDATE
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Marcar como leído es un UPDATE, y hoy el cliente NO tiene ninguna policy
-- UPDATE sobre `support_tickets` — solo INSERT del suyo y SELECT.
--
-- Añadir una policy UPDATE para esto sería desproporcionado: PostgreSQL aplica
-- RLS a la FILA, no a la columna, así que una policy que permitiera «actualizar
-- mi propio ticket» dejaría al cliente reescribir también `admin_response`,
-- `status` o `priority`. Habría que añadir además un trigger que rechazara el
-- cambio de las demás columnas — dos piezas para lo que una función resuelve.
--
-- `mark_my_support_responses_seen()` toca UNA sola columna, solo en las filas
-- cuyo `user_id = auth.uid()`, y no acepta ningún parámetro: no hay ningún
-- identificador que manipular. La superficie de escritura del cliente sobre
-- esta tabla sigue siendo, después de esta migración, exactamente cero columnas
-- elegibles por él.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- QUÉ PASA CON LAS RESPUESTAS ANTERIORES A ESTA MIGRACIÓN
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Se marcan como YA VISTAS. Es una decisión deliberada: si se dejaran como no
-- leídas, cada cliente entraría mañana y encontraría un aviso por respuestas de
-- hace meses que probablemente ya leyó. Un sistema de notificaciones que nace
-- gritando pierde su valor el primer día.
--
-- `admin_responded_at` se rellena con `updated_at`, que es la mejor
-- aproximación disponible —imprecisa, como explica el bloque de arriba— y
-- `response_seen_at` con el mismo valor, de modo que la comparación
-- `seen < responded` es falsa y el ticket cuenta como leído.
--
-- No se toca ninguna otra columna ni ningún ticket sin respuesta.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Columnas
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.support_tickets
  add column if not exists admin_responded_at timestamptz,
  add column if not exists response_seen_at   timestamptz;

comment on column public.support_tickets.admin_responded_at is
  'Cuándo se escribió o se cambió `admin_response`. La fija el trigger '
  '`support_tickets_response_state`, nunca la aplicación. Nula si no hay '
  'respuesta. NO confundir con `updated_at`, que cambia con cualquier '
  'escritura, ni con `resolved_at`, que marca el cierre.';

comment on column public.support_tickets.response_seen_at is
  'Cuándo vio la respuesta la persona propietaria del ticket. La escribe SOLO '
  '`mark_my_support_responses_seen()`. Una respuesta está sin leer cuando '
  '`admin_responded_at` no es nula y `response_seen_at` es nula o anterior.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Trigger: mantiene `admin_responded_at` y protege `updated_at`
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Dos responsabilidades, y las dos tienen que vivir juntas porque ambas
-- dependen de comparar OLD con NEW en la misma escritura:
--
--   a) si `admin_response` CAMBIA de verdad, se sella la fecha de respuesta.
--      Guardar exactamente el mismo texto NO cuenta: `is distinct from` ya lo
--      resuelve, así que un administrador que reabre el formulario y pulsa
--      «Guardar» sin tocar nada no vuelve a marcar la respuesta como nueva.
--
--   b) si la ÚNICA columna que cambia es `response_seen_at`, se restaura
--      `updated_at`. Sin esto, cada vez que alguien abriera su pantalla de
--      Ayuda se movería la «Última actualización» del ticket — y esa fecha se
--      le enseña al propio usuario y al administrador. Leer no es actualizar.
--
-- El nombre del trigger ordena DESPUÉS de `set_updated_at_support_tickets`
-- ('se' < 'su'), que es imprescindible: PostgreSQL dispara los BEFORE por orden
-- alfabético, así que este puede deshacer lo que aquel acaba de poner.

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
  if new.admin_response is distinct from old.admin_response then
    v_respuesta_util := coalesce(btrim(new.admin_response), '') <> '';

    if v_respuesta_util then
      -- Respuesta nueva o corregida: se sella ahora y pasa a estar sin leer,
      -- porque `response_seen_at` queda por detrás de esta marca.
      new.admin_responded_at := now();
    else
      -- La respuesta se ha retirado: no hay nada que leer, así que tampoco hay
      -- fecha de respuesta. Se limpian las dos para no dejar un estado que
      -- diga «respondido» sobre un ticket sin respuesta.
      new.admin_responded_at := null;
      new.response_seen_at   := null;
    end if;

    return new;
  end if;

  -- (b) Marcado de lectura: no debe mover `updated_at`.
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

comment on function public.handle_support_response_state() is
  'Sella `admin_responded_at` cuando cambia la respuesta, y evita que marcar '
  'una respuesta como leída mueva `updated_at`.';

-- Función de trigger: no la invoca nadie por RPC.
revoke all on function public.handle_support_response_state() from public, anon, authenticated;

drop trigger if exists support_tickets_response_state on public.support_tickets;
create trigger support_tickets_response_state
  before update on public.support_tickets
  for each row execute function public.handle_support_response_state();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Backfill: lo anterior a esta migración se considera LEÍDO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `set_updated_at_support_tickets` se desactiva durante el relleno. Sin eso,
-- esta migración movería la «Última actualización» de TODOS los tickets ya
-- respondidos a la fecha del despliegue — un dato que se le enseña tanto al
-- cliente como al administrador, y que no ha cambiado: lo único que se está
-- haciendo es rellenar dos columnas nuevas con información que ya existía.
--
-- El nuevo trigger sí se deja activo: con `admin_response` sin cambios y
-- `admin_responded_at` cambiando, ninguna de sus dos ramas se activa. Es un
-- no-op, y comprobarlo aquí es preferible a desactivarlo «por si acaso».

alter table public.support_tickets disable trigger set_updated_at_support_tickets;

update public.support_tickets
   set admin_responded_at = coalesce(admin_responded_at, updated_at),
       response_seen_at   = coalesce(response_seen_at,   updated_at)
 where admin_response is not null
   and btrim(admin_response) <> ''
   and (admin_responded_at is null or response_seen_at is null);

alter table public.support_tickets enable trigger set_updated_at_support_tickets;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Marcar como leídas las respuestas PROPIAS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Sin parámetros a propósito: no hay ningún identificador que quien llama pueda
-- manipular. El conjunto de filas lo decide `auth.uid()` dentro de la función.
--
-- `security definer` porque el cliente no tiene —ni debe tener— UPDATE sobre
-- `support_tickets`. La función es la ÚNICA vía, y solo escribe una columna.
--
-- Devuelve cuántas filas ha marcado, para poder registrarlo sin tener que
-- volver a consultar.

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
   where t.user_id = v_uid                    -- SOLO las suyas
     and t.admin_responded_at is not null     -- que tengan respuesta
     and (t.response_seen_at is null          -- y estén sin leer
          or t.response_seen_at < t.admin_responded_at);

  get diagnostics v_filas = row_count;
  return v_filas;
end;
$$;

comment on function public.mark_my_support_responses_seen() is
  'Marca como vistas las respuestas de los tickets de quien llama. No acepta '
  'parámetros: el conjunto lo decide auth.uid(). Es la única vía por la que un '
  'cliente escribe en support_tickets, y solo toca `response_seen_at`.';

revoke all on function public.mark_my_support_responses_seen() from public, anon;
grant execute on function public.mark_my_support_responses_seen() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Índice
-- ─────────────────────────────────────────────────────────────────────────────
--
-- El recuento de no leídas se ejecuta en CADA navegación del portal cliente.
-- Parcial sobre las que tienen respuesta: los tickets sin responder —la
-- mayoría con el tiempo— ni siquiera entran en el índice.

create index if not exists idx_support_tickets_unread
  on public.support_tickets (user_id, admin_responded_at, response_seen_at)
  where admin_responded_at is not null;
