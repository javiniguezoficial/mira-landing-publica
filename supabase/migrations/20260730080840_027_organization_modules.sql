-- 027 — Configuración modular por cliente (Fase 1.4)
--
-- ═════════════════════════════════════════════════════════════════════════════
-- QUÉ RESUELVE
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Hasta aquí, apagar Cotizaciones para una empresa entera solo se podía imitar
-- retirando `can_buy` a cada miembro uno a uno. Eso confunde dos cosas que no
-- son la misma:
--
--   · `can_buy` es una CAPACIDAD PERSONAL: esta persona compra o no compra.
--   · el módulo es una CONFIGURACIÓN DE LA ORGANIZACIÓN: esta empresa tiene
--     contratado el módulo o no lo tiene.
--
-- Se mantienen como dos ejes independientes, tanto en SQL como en la aplicación.
-- Un miembro con `can_buy = true` en una organización con `quotes = false` no
-- puede operar; y apagar el módulo no toca ni una sola fila de
-- `organization_members`, así que volver a encenderlo devuelve exactamente el
-- estado anterior.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- ALCANCE
-- ═════════════════════════════════════════════════════════════════════════════
--
-- SE AÑADE:
--   · `organizations.modules` (jsonb, NOT NULL, default con ambos módulos ON);
--   · CHECK `organizations_modules_valid`, que fija la forma exacta del objeto;
--   · función `org_module_enabled(uuid, text)`.
--
-- SE REEMPLAZAN (drop + create de la MISMA policy, mismo nombre, mismo alcance):
--   · rfqs.org_member_select_rfqs            [SELECT]
--   · rfqs.org_member_insert_rfqs            [INSERT]
--   · rfqs.org_member_update_rfqs            [UPDATE]
--   · rfq_responses.org_member_select_rfq_responses [SELECT]
--
--   A las cuatro se les AÑADE un `and org_module_enabled(..., 'quotes')`. No se
--   retira ninguna condición previa: la protección solo se estrecha. El total
--   de policies sigue siendo 53.
--
-- SE MODIFICA:
--   · trigger `protect_organization_columns()`, para que `modules` quede en la
--     lista de columnas que solo un administrador de plataforma puede cambiar.
--
-- NO SE TOCA:
--   · `can_buy_in_org()` ni `can_sell_in_org()` — son el eje personal, y
--     mezclar ahí el módulo dejaría abiertas las LECTURAS, que no pasan por
--     esas funciones (ver más abajo);
--   · `is_org_member()`, `is_org_owner()`, `is_org_admin()`,
--     `is_platform_admin()`;
--   · las policies `admin_*` de rfqs y rfq_responses;
--   · planes, suscripciones, onboarding, proveedores, roles ni ningún dato
--     productivo más allá del default de la columna nueva.
--
-- ── Por qué NO basta con reforzar `can_buy_in_org()` ────────────────────────
--
-- `can_buy_in_org()` solo gobierna INSERT y UPDATE de rfqs. Las dos SELECT
-- —`org_member_select_rfqs` y `org_member_select_rfq_responses`— se apoyan en
-- `is_org_member()`. Reforzar únicamente la capacidad habría dejado a toda la
-- organización leyendo el histórico de cotizaciones y las respuestas de
-- proveedores con el módulo apagado. Por eso el módulo se añade a las CUATRO
-- policies, y no a la función de capacidad.
--
-- ── Sobre el bypass administrativo (INTENCIONAL, se preserva) ───────────────
--
-- Las policies `admin_select_rfqs`, `admin_insert_rfqs`, `admin_update_rfqs` y
-- `admin_all_rfq_responses` siguen dependiendo solo de `is_platform_admin()`.
-- Un administrador de plataforma CONSERVA acceso a las cotizaciones de una
-- organización con el módulo apagado.
--
-- Es deliberado y necesario: quien apaga el módulo es justamente el
-- administrador, y tiene que poder seguir dando soporte, auditar y reactivar.
-- El módulo es una configuración comercial del cliente, no un secreto frente a
-- la plataforma. Si algún día se quisiera que el apagado ocultara los datos
-- también a la plataforma, sería otro bloque y otra decisión de producto.
--
-- DELETE: ni `rfqs` ni `rfq_responses` tienen policy de DELETE para miembros de
-- organización, así que el borrado ya estaba cerrado para todo el mundo salvo
-- `admin_all_rfq_responses`. No se añade ninguna: cerrar más no hace falta.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Columna `modules`
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Una columna jsonb en `organizations`, no una tabla aparte. Los módulos son
-- exactamente dos, no llevan metadatos propios (ni fecha, ni autor, ni
-- histórico) y siempre se leen junto con la organización, que es lo que las
-- policies ya tienen a mano en `organization_id`. Una tabla añadiría un join a
-- cada evaluación de RLS sin aportar nada que hoy se necesite.
--
-- El DEFAULT con ambos módulos activos es lo que garantiza que ninguna
-- organización existente pierda acceso: el `alter table` rellena las filas ya
-- creadas con ese mismo valor.

alter table public.organizations
  add column if not exists modules jsonb not null
    default '{"markets": true, "quotes": true}'::jsonb;

comment on column public.organizations.modules is
  'Módulos contratados por la organización (1.4). Objeto jsonb con exactamente '
  'dos claves booleanas: markets y quotes. Solo lo puede modificar un '
  'platform_admin (ver protect_organization_columns).';

-- ── Forma válida del objeto ──────────────────────────────────────────────────
--
-- El CHECK impide guardar cualquier cosa que la aplicación no sepa leer:
--
--   · tiene que ser un OBJETO jsonb (no array, no string, no número, no null
--     JSON — el NOT NULL de la columna cubre el null SQL);
--   · `markets` y `quotes` tienen que existir y ser BOOLEANOS. `jsonb_typeof`
--     devuelve 'boolean' solo para true/false, así que "true" (string), 1
--     (número) y null quedan fuera;
--   · la última condición reconstruye el objeto con SOLO las dos claves
--     conocidas y exige que sea idéntico al guardado. Así se prohíbe cualquier
--     clave arbitraria sin subconsultas, que en un CHECK no están permitidas.
--
-- ── Por qué cada condición va envuelta en `coalesce(..., '')` ────────────────
--
-- Un CHECK que evalúa a NULL se ACEPTA; solo rechaza cuando evalúa a false.
-- `jsonb_typeof(modules -> 'quotes')` sobre una clave AUSENTE devuelve NULL, y
-- `NULL = 'boolean'` es NULL, no false. La primera versión de este CHECK, sin
-- los `coalesce`, dejaba pasar `{"markets": true}`, `{"quotes": true}` y `{}`.
-- Se detectó probando las once formas inválidas contra la base de datos, no
-- leyendo el SQL. Comparar contra `''` fuerza un booleano en todos los casos.
--
-- Usar `->` en lugar del operador `-` también es deliberado: `'5'::jsonb -
-- 'markets'` LANZA («cannot delete from scalar»), mientras que `'5'::jsonb ->
-- 'markets'` simplemente devuelve NULL. La restricción rechaza en vez de
-- reventar con un error interno de PostgreSQL.

alter table public.organizations
  drop constraint if exists organizations_modules_valid;

alter table public.organizations
  add constraint organizations_modules_valid check (
    coalesce(jsonb_typeof(modules), '') = 'object'
    and coalesce(jsonb_typeof(modules -> 'markets'), '') = 'boolean'
    and coalesce(jsonb_typeof(modules -> 'quotes'),  '') = 'boolean'
    and modules = jsonb_build_object(
          'markets', modules -> 'markets',
          'quotes',  modules -> 'quotes'
        )
  );

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. `org_module_enabled(org_id, module_name)`
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Misma forma que el resto de funciones de autorización del proyecto: `stable`,
-- `security definer` y `search_path` explícito. `security definer` es
-- imprescindible porque la función se invoca DENTRO de las policies de rfqs; sin
-- él, leer `organizations` volvería a pasar por RLS y la evaluación se
-- enredaría con la policy de la propia tabla.
--
-- Fail-closed en los cuatro casos que pide el modelo:
--
--   · organización inexistente  -> no hay fila     -> coalesce -> false
--   · módulo desconocido        -> el WHERE filtra -> coalesce -> false
--   · clave ausente             -> `->` da NULL    -> coalesce -> false
--   · valor no booleano         -> `'true'::jsonb` no casa    -> false
--
-- La comparación es contra el literal JSON `true`, no contra el texto: el
-- string "true" es `'"true"'::jsonb` y NO es igual a `'true'::jsonb`. Aunque el
-- CHECK ya impide guardar eso, la función no depende de ello para ser segura.
--
-- La lista blanca está escrita aquí de forma literal a propósito: un módulo
-- nuevo obliga a pasar por una migración, no aparece por escribir una clave
-- suelta en el jsonb.

create or replace function public.org_module_enabled(org_id uuid, module_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select o.modules -> module_name = 'true'::jsonb
      from public.organizations o
      where o.id = org_id
        and module_name in ('markets', 'quotes')
    ),
    false
  );
$$;

comment on function public.org_module_enabled(uuid, text) is
  'Fase 1.4 — ¿tiene esta organización activo este módulo? Solo reconoce '
  'markets y quotes; cualquier otro nombre, organización inexistente o valor no '
  'booleano devuelve false.';

revoke all on function public.org_module_enabled(uuid, text) from public;
grant execute on function public.org_module_enabled(uuid, text) to authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Policies de `rfqs` — se añade el módulo a las tres de organización
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Cada una conserva LITERALMENTE su condición anterior y suma el módulo. Se
-- recrean con el mismo nombre para que el recuento de policies no cambie.

-- 3.1 SELECT — antes: is_org_member(organization_id)
drop policy if exists org_member_select_rfqs on public.rfqs;
create policy org_member_select_rfqs on public.rfqs
  for select
  using (
    is_org_member(organization_id)
    and org_module_enabled(organization_id, 'quotes')
  );

-- 3.2 INSERT — antes: can_buy_in_org(...) + autoría + estado + campos mínimos
drop policy if exists org_member_insert_rfqs on public.rfqs;
create policy org_member_insert_rfqs on public.rfqs
  for insert
  with check (
    can_buy_in_org(organization_id)
    and org_module_enabled(organization_id, 'quotes')
    and created_by = auth.uid()
    and status = 'draft'
    and rfq_kind = any (array['product'::text, 'service'::text])
    and request_name is not null
    and length(btrim(request_name)) > 0
  );

-- 3.3 UPDATE — antes: can_buy_in_org(...) + (autoría o admin de organización)
drop policy if exists org_member_update_rfqs on public.rfqs;
create policy org_member_update_rfqs on public.rfqs
  for update
  using (
    can_buy_in_org(organization_id)
    and org_module_enabled(organization_id, 'quotes')
    and (created_by = auth.uid() or is_org_admin(organization_id))
  )
  with check (
    can_buy_in_org(organization_id)
    and org_module_enabled(organization_id, 'quotes')
    and (created_by = auth.uid() or is_org_admin(organization_id))
  );

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Policy de `rfq_responses`
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Las respuestas de proveedores son el resultado comercial de una cotización.
-- Su visibilidad se deriva de la RFQ padre, así que el módulo se comprueba
-- sobre la organización de ESA RFQ, no sobre ninguna otra.
--
-- Sin este cambio, apagar el módulo habría ocultado las cotizaciones pero
-- dejado legibles las ofertas recibidas por acceso directo a PostgREST.

drop policy if exists org_member_select_rfq_responses on public.rfq_responses;
create policy org_member_select_rfq_responses on public.rfq_responses
  for select
  using (
    exists (
      select 1
      from public.rfqs r
      where r.id = rfq_responses.rfq_id
        and is_org_member(r.organization_id)
        and org_module_enabled(r.organization_id, 'quotes')
    )
  );

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. `modules` pasa a ser columna protegida
-- ═════════════════════════════════════════════════════════════════════════════
--
-- BRECHA QUE CIERRA: `organizations` tiene la policy `org_owner_update`, que
-- permite a la persona propietaria hacer UPDATE sobre su propia organización.
-- El trigger `protect_organization_columns` es lo único que impide que use esa
-- vía para tocar el plan o el estado. Sin añadir `modules` a esa lista, un
-- owner podría RE-ACTIVARSE los módulos que la plataforma le ha apagado, con un
-- solo PATCH a PostgREST y sin pasar por la aplicación.
--
-- El cuerpo es idéntico al de 026 salvo por:
--   · una línea más en la comparación: `new.modules is not distinct from
--     old.modules`;
--   · el texto del error, que ahora menciona los módulos.
--
-- Se preservan sin cambios la puerta de activación de 026 y los dos bypass
-- existentes (service_role y platform_admin), que son intencionales.

create or replace function public.protect_organization_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_jwt_role text := auth.role();
begin
  -- ── Puerta de activación (026) ───────────────────────────────────────────
  if tg_op = 'UPDATE'
     and new.status = 'active'
     and old.status is distinct from 'active' then
    if new.plan_id is null or new.plan_approved_by is null then
      raise exception 'Para activar la organización hay que confirmar antes el plan asignado.'
        using errcode = '23514';
    end if;
  end if;

  if new.id                      is not distinct from old.id
     and new.plan_id             is not distinct from old.plan_id
     and new.subscription_status is not distinct from old.subscription_status
     and new.subscription_start  is not distinct from old.subscription_start
     and new.subscription_end    is not distinct from old.subscription_end
     and new.status              is not distinct from old.status
     and new.commercial_profile  is not distinct from old.commercial_profile
     and new.created_at          is not distinct from old.created_at
     and new.requested_plan_id   is not distinct from old.requested_plan_id
     and new.plan_approved_by    is not distinct from old.plan_approved_by
     and new.modules             is not distinct from old.modules then
    return new;
  end if;

  if v_uid is null and coalesce(v_jwt_role, '') = '' then
    return new;
  end if;

  if v_jwt_role = 'service_role' or public.is_platform_admin() then
    return new;
  end if;

  raise exception
    'Solo un administrador de plataforma puede cambiar el plan, la suscripción, el estado, el perfil comercial o los módulos de una organización.'
    using errcode = '42501';
end;
$$;
