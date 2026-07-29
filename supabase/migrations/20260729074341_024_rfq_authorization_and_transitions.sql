-- 024 — Autorización de RFQs y transiciones de estado
--
-- ═════════════════════════════════════════════════════════════════════════════
-- DEFECTOS QUE CORRIGE (verificados empíricamente con ROLLBACK)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- A. `can_buy` NO se comprueba en ningún punto del sistema. `org_member_insert_rfqs`
--    solo exige `is_org_member(organization_id)`. Comprobado: con `can_buy=false`
--    la creación de una RFQ tuvo ÉXITO. Tampoco aparece `can_buy` en ninguna
--    línea del código de la aplicación. La capacidad introducida en 6A es, en lo
--    que respecta a las RFQs, decorativa.
--
-- B. La transición `draft → open` se puede hacer por PostgREST directo, saltándose
--    `publishRfq()`. Comprobado: un UPDATE de `status` a 'open' modificó 1 fila.
--    El `WITH CHECK` de `org_member_update_draft_rfqs` admite 'draft', 'open' y
--    'cancelled' sin mirar de qué estado se viene, así que cualquier validación
--    que la Server Action añada es eludible.
--
-- C. La RFQ se comporta como un recurso PERSONAL, no de la organización:
--    `created_by = auth.uid()` en USING. Comprobado: el propietario NO puede
--    editar el borrador de un miembro de su equipo (0 filas afectadas). Si el
--    creador abandona la organización, su RFQ queda huérfana.
--
-- D. Una RFQ publicada no se puede cancelar: `USING (status = 'draft')` deja
--    fuera cualquier fila en 'open'. Las 3 RFQs reales están en 'open', así que
--    hoy son inmutables para el cliente. Es un vacío funcional, no una fuga.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA (la misma de 023)
-- ═════════════════════════════════════════════════════════════════════════════
--
--   POLICY   -> QUÉ FILAS puede tocar cada actor (pertenencia, capacidad, rol).
--   TRIGGER  -> QUÉ CAMBIOS son admisibles: transiciones de estado,
--               identificadores inmutables y contenido congelado tras publicar.
--               Se aplican a TODOS, incluido `platform_admin`, que tiene más
--               transiciones disponibles pero no puede invertir una máquina de
--               estados ni reescribir una cotización ya publicada.
--
-- Único escape: conexión SQL directa, para migraciones y recuperación.
--
-- La propiedad de la RFQ pasa a ser de la ORGANIZACIÓN. `created_by` se conserva
-- y se vuelve inmutable: identifica al creador, no otorga propiedad exclusiva.
--
-- NO se toca: organizations, organization_members, subscriptions, support,
-- catálogos, Market Intelligence, proveedores, módulos ni Auth.
-- NO se borra ni se modifica ninguna RFQ existente.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Transiciones de estado
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Estados reales, tomados del CHECK vigente `rfqs_status_check`:
--   draft, open, closed, awarded, cancelled
--
-- No se inventa ninguno ni se amplía el CHECK.
--
--   CLIENTE (con can_buy):        PLATFORM_ADMIN (además):
--     draft  -> open                open   -> closed
--     draft  -> cancelled           open   -> awarded
--     open   -> cancelled           closed -> awarded
--                                   closed -> open      (reapertura administrativa)
--
--   Finales para todos: `awarded` y `cancelled` no vuelven atrás.
--   Un estado que no cambia siempre se admite (editar el borrador sin publicar).
--
--   `closed -> open` reabre el ESTADO, no el contenido: la cotización vuelve al
--   mercado tal y como se publicó. Ninguna transición devuelve a 'draft', que es
--   la única situación en la que el contenido se puede escribir.

create or replace function public.is_valid_rfq_transition(
  estado_anterior text,
  estado_nuevo    text,
  es_plataforma   boolean
) returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    -- Sin cambio de estado: siempre admisible.
    when estado_anterior is not distinct from estado_nuevo then true
    -- Estados finales: nadie los revierte desde la aplicación.
    when estado_anterior in ('awarded', 'cancelled') then false
    -- Transiciones de cliente.
    when estado_anterior = 'draft' and estado_nuevo in ('open', 'cancelled') then true
    when estado_anterior = 'open'  and estado_nuevo = 'cancelled'            then true
    -- Transiciones reservadas a la plataforma.
    when es_plataforma and estado_anterior = 'open'   and estado_nuevo in ('closed', 'awarded') then true
    when es_plataforma and estado_anterior = 'closed' and estado_nuevo in ('awarded', 'open')   then true
    else false
  end;
$$;

comment on function public.is_valid_rfq_transition(text, text, boolean) is
  'Matriz de transiciones de rfqs.status. Los estados awarded y cancelled son finales. Las transiciones a closed/awarded quedan reservadas a platform_admin.';

revoke execute on function public.is_valid_rfq_transition(text, text, boolean) from public, anon;
grant  execute on function public.is_valid_rfq_transition(text, text, boolean) to authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Trigger de integridad de RFQ
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.enforce_rfq_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid    := auth.uid();
  v_jwt_role     text    := auth.role();
  v_es_plataforma boolean;
  v_antes        public.rfqs%rowtype;
  v_despues      public.rfqs%rowtype;
begin
  -- Escape único: conexión SQL directa (migraciones, mantenimiento).
  if v_uid is null and coalesce(v_jwt_role, '') = '' then
    return new;
  end if;

  v_es_plataforma := (v_jwt_role = 'service_role') or public.is_platform_admin();

  -- ── INVARIANTES, para todos ──────────────────────────────────────────────
  --
  -- La RFQ pertenece a la organización y la creó quien la creó. Ninguna de las
  -- dos cosas se reescribe: mover una RFQ de organización cambiaría quién puede
  -- verla, y reasignar `created_by` falsearía la trazabilidad.
  if new.id              is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.created_by      is distinct from old.created_by
     or new.created_at      is distinct from old.created_at then
    raise exception 'No se pueden modificar los datos internos de la cotización.'
      using errcode = '23514';
  end if;

  -- ── TRANSICIONES ────────────────────────────────────────────────────────
  if not public.is_valid_rfq_transition(old.status, new.status, v_es_plataforma) then
    if old.status in ('awarded', 'cancelled') then
      raise exception 'Esta cotización ya no se puede modificar.'
        using errcode = '23514';
    end if;
    raise exception 'No se puede realizar ese cambio de estado.'
      using errcode = '23514';
  end if;

  -- ── CONTENIDO CONGELADO tras publicar ───────────────────────────────────
  --
  -- Una cotización que ha salido de 'draft' ya ha podido ser consultada y
  -- utilizada por terceros. Su contenido ES el objeto comercial que vieron, así
  -- que queda congelado para TODOS: member, admin de organización, owner,
  -- `platform_admin` y `service_role` usado desde la aplicación. Alterarlo sin
  -- versionado ni traza cambiaría el documento a posteriori.
  --
  -- `platform_admin` conserva únicamente sus transiciones de estado. Reabrir
  -- (closed -> open) devuelve la cotización al mercado; NO autoriza a reescribir
  -- lo ya publicado. Rectificación, nueva versión, reapertura auditada y
  -- registro de cambios son funcionalidad futura, no una excepción silenciosa.
  --
  -- La comparación es de FILA COMPLETA, no una lista de columnas: cualquier
  -- columna que se añada a `rfqs` en el futuro nace congelada sin tener que
  -- acordarse de esta función. Solo se neutralizan las dos que sí pueden
  -- cambiar: `status`, gobernado por la matriz de transiciones de arriba, y
  -- `updated_at`, marca técnica que mantiene el trigger `rfqs_updated_at`.
  --
  -- La conexión SQL directa sigue siendo la vía extraordinaria de recuperación:
  -- sale antes, por el escape del principio de la función.
  if old.status <> 'draft' then
    v_antes   := old;
    v_despues := new;

    v_despues.status     := v_antes.status;
    v_despues.updated_at := v_antes.updated_at;

    if v_despues is distinct from v_antes then
      raise exception 'Esta cotización ya no se puede modificar.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_rfq_integrity() is
  'Identificadores inmutables, matriz de transiciones y congelado del contenido en cuanto la cotización sale de draft. Se aplica a todos sin excepción: platform_admin dispone de más transiciones de estado, no de permiso para reescribir el contenido publicado.';

revoke execute on function public.enforce_rfq_integrity() from public, anon, authenticated;

drop trigger if exists rfqs_enforce_integrity on public.rfqs;

create trigger rfqs_enforce_integrity
  before update on public.rfqs
  for each row
  execute function public.enforce_rfq_integrity();

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Policies de rfqs
-- ═════════════════════════════════════════════════════════════════════════════

-- SELECT: sin cambios. El histórico sigue visible para todo miembro activo,
-- tenga o no `can_buy`: retirar la capacidad de comprar no debe borrar lo que la
-- organización ya solicitó. `admin_select_rfqs` y `org_member_select_rfqs` se
-- conservan tal cual.

-- INSERT: exige capacidad de compra real, no solo pertenencia.
drop policy if exists org_member_insert_rfqs on public.rfqs;

create policy org_member_insert_rfqs on public.rfqs
  for insert
  with check (
    public.can_buy_in_org(organization_id)
    and created_by = auth.uid()
    and status = 'draft'
    and rfq_kind = any (array['product', 'service'])
    and request_name is not null
    and length(btrim(request_name)) > 0
  );

-- UPDATE: la RFQ es de la organización.
--   · quien la creó puede gestionarla;
--   · owner y admin pueden gestionar cualquiera de su organización;
--   · en ambos casos hace falta `can_buy` vigente.
-- El trigger decide qué cambios concretos son admisibles.
drop policy if exists org_member_update_draft_rfqs on public.rfqs;

create policy org_member_update_rfqs on public.rfqs
  for update
  using (
    public.can_buy_in_org(organization_id)
    and (created_by = auth.uid() or public.is_org_admin(organization_id))
  )
  with check (
    public.can_buy_in_org(organization_id)
    and (created_by = auth.uid() or public.is_org_admin(organization_id))
  );

-- DELETE: sigue sin policy para clientes. Una RFQ no se borra, se cancela: es un
-- documento con valor histórico y con respuestas asociadas.

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. rfq_responses — sin ampliar
-- ═════════════════════════════════════════════════════════════════════════════
--
-- `org_member_select_rfq_responses` y `admin_all_rfq_responses` se conservan sin
-- cambios: la organización compradora ve las respuestas a sus RFQs y solo
-- `platform_admin` las gestiona.
--
-- NO se habilita a vendedores. `can_sell_in_org()` existe desde 022 y sigue sin
-- conectarse a ninguna policy ni a ninguna interfaz: el portal de vendedor no
-- existe todavía, y una policy sin superficie que la ejercite es superficie
-- muerta que alguien acabaría dando por buena.

-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Orden: policies primero, luego el trigger, luego las funciones.
--
--   drop policy if exists org_member_insert_rfqs on public.rfqs;
--   create policy org_member_insert_rfqs on public.rfqs
--     for insert
--     with check (((created_by = auth.uid()) AND is_org_member(organization_id)
--                  AND (rfq_kind = ANY (ARRAY['product'::text, 'service'::text]))
--                  AND (request_name IS NOT NULL)
--                  AND (length(btrim(request_name)) > 0)));
--
--   drop policy if exists org_member_update_rfqs on public.rfqs;
--   create policy org_member_update_draft_rfqs on public.rfqs
--     for update
--     using (((created_by = auth.uid()) AND (status = 'draft'::text)
--             AND is_org_member(organization_id)))
--     with check (((created_by = auth.uid())
--             AND (status = ANY (ARRAY['draft'::text, 'open'::text, 'cancelled'::text]))
--             AND is_org_member(organization_id)));
--
--   drop trigger if exists rfqs_enforce_integrity on public.rfqs;
--   drop function if exists public.enforce_rfq_integrity();
--   drop function if exists public.is_valid_rfq_transition(text, text, boolean);
--
-- Estado resultante: las 53 policies de antes de 024, sin trigger ni funciones
-- nuevas. `admin_select_rfqs`, `admin_insert_rfqs`, `admin_update_rfqs`,
-- `org_member_select_rfqs` y las dos de rfq_responses no se tocan en ningún
-- momento, así que el rollback las deja como estaban.
--
-- ADVERTENCIA: revertir reabre los cuatro defectos de la cabecera, en particular
-- que cualquier miembro sin `can_buy` pueda crear cotizaciones.
