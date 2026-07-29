-- 025 — El perfil suspendido pierde las capacidades comerciales
--
-- ═════════════════════════════════════════════════════════════════════════════
-- BRECHA QUE CORRIGE (verificada empíricamente con ROLLBACK)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- `can_buy_in_org()` y `can_sell_in_org()` consultan `organization_members` y
-- `organizations`, y NUNCA miran `profiles.status`. Suspender a una persona no
-- le retira, por tanto, ninguna capacidad comercial.
--
-- Reproducido en transacción con rollback, con Ana en `profiles.status =
-- 'suspended'` y pertenencia, organización y `can_buy` intactos:
--
--   can_buy_in_org(acme)                      -> true
--   INSERT de una RFQ vía PostgREST           -> PERMITIDO
--   UPDATE de las RFQs abiertas a 'cancelled' -> ROW_COUNT = 3
--
-- Ese último resultado es lo que convierte el hallazgo en una brecha y no en
-- una inconsistencia de interfaz: una cuenta suspendida podía CANCELAR las tres
-- cotizaciones publicadas de su organización por acceso directo, sin pasar por
-- la aplicación. Ocultar botones no lo impedía, porque el vector no usa la
-- interfaz.
--
-- Contraste: `is_platform_admin()` sí exige `p.status = 'active'` desde 021, así
-- que la administración de plataforma nunca tuvo este agujero. La asimetría era
-- entre esa función y las dos de capacidad, no un criterio deliberado.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- ALCANCE
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Se redefinen EXACTAMENTE dos funciones. Se añade un JOIN con `profiles` y la
-- condición `p.status = 'active'`; el resto del cuerpo es idéntico.
--
-- NO se tocan: `is_org_member`, `is_org_owner`, `is_org_admin`,
-- `is_platform_admin`, ninguna policy, ningún trigger, ninguna tabla, ningún
-- dato. El total de policies sigue siendo 53.
--
-- ── Por qué `is_org_member()` se queda como está ────────────────────────────
--
-- Decisión explícita de 6B.5: la LECTURA organizativa y las ACCIONES
-- comerciales son cosas distintas.
--
--   · El modelo aprobado prohíbe a un perfil suspendido CREAR y GESTIONAR
--     cotizaciones. No dice que deba dejar de ver el histórico de su empresa.
--   · `is_org_member()` es el `USING` de las policies SELECT de rfqs,
--     rfq_responses, profiles y organizations. Añadirle `profiles.status` no
--     cerraría una escritura —ya las cierra 025— y en cambio dejaría a una
--     cuenta suspendida sin ver absolutamente nada, en superficies que este
--     bloque no ha auditado.
--   · Un cambio así merece su propio bloque, con su matriz de lectura y su QA.
--
-- Ninguna decisión anterior obliga a bloquear también la lectura, así que se
-- deja fuera a propósito y queda registrado aquí.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Capacidad de compra
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Seis condiciones simultáneas:
--   · hay usuario autenticado (auth.uid() no nulo: si lo fuera, ninguna fila
--     casaría y la función devolvería false igualmente);
--   · el PERFIL está activo;
--   · existe pertenencia de ese usuario en esa organización;
--   · la PERTENENCIA está activa;
--   · la ORGANIZACIÓN está activa;
--   · el miembro tiene `can_buy` y el perfil comercial lo admite.

create or replace function public.can_buy_in_org(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    join public.organizations o on o.id = om.organization_id
    join public.profiles p       on p.id = om.user_id
    where om.organization_id  = org_id
      and om.user_id          = auth.uid()
      and p.status            = 'active'
      and om.status           = 'active'
      and o.status            = 'active'
      and om.can_buy          = true
      and o.commercial_profile in ('buyer', 'buyer_seller')
  );
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Capacidad de venta — simétrica
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Sigue sin estar conectada a ninguna policy ni a ninguna interfaz: el portal
-- de vendedor no existe. Se corrige igualmente para que no nazca con la misma
-- brecha el día que se conecte.

create or replace function public.can_sell_in_org(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    join public.organizations o on o.id = om.organization_id
    join public.profiles p       on p.id = om.user_id
    where om.organization_id  = org_id
      and om.user_id          = auth.uid()
      and p.status            = 'active'
      and om.status           = 'active'
      and o.status            = 'active'
      and om.can_sell         = true
      and o.commercial_profile in ('seller', 'buyer_seller')
  );
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Comentarios y grants
-- ═════════════════════════════════════════════════════════════════════════════
--
-- `create or replace` conserva propietario, ACL y propiedades, pero los grants
-- se reafirman de forma explícita para que la migración sea autosuficiente y no
-- dependa de lo que dejó 022.
--
-- `authenticated` DEBE conservar EXECUTE: las expresiones de una policy se
-- evalúan con los privilegios de quien consulta, así que revocarlo rompería las
-- policies de RFQ. `anon` no lo necesita: sin sesión `auth.uid()` es NULL y
-- ambas devuelven false.

comment on function public.can_buy_in_org(uuid) is
  'Capacidad de compra: perfil activo, pertenencia activa, organización activa, can_buy y techo de commercial_profile. Suspender el perfil retira la capacidad.';
comment on function public.can_sell_in_org(uuid) is
  'Capacidad de venta: perfil activo, pertenencia activa, organización activa, can_sell y techo de commercial_profile. Suspender el perfil retira la capacidad.';

revoke execute on function public.can_buy_in_org(uuid)  from public, anon;
revoke execute on function public.can_sell_in_org(uuid) from public, anon;

grant execute on function public.can_buy_in_org(uuid)  to authenticated, service_role;
grant execute on function public.can_sell_in_org(uuid) to authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Definiciones EXACTAS anteriores, tal y como las devuelve hoy
-- `pg_get_functiondef()` en el proyecto remoto:
--
--   create or replace function public.can_buy_in_org(org_id uuid)
--   returns boolean
--   language sql
--   stable
--   security definer
--   set search_path = public
--   as $$
--     select exists (
--       select 1
--       from public.organization_members om
--       join public.organizations o on o.id = om.organization_id
--       where om.organization_id  = org_id
--         and om.user_id          = auth.uid()
--         and om.status           = 'active'
--         and o.status            = 'active'
--         and om.can_buy          = true
--         and o.commercial_profile in ('buyer', 'buyer_seller')
--     );
--   $$;
--
--   create or replace function public.can_sell_in_org(org_id uuid)
--   returns boolean
--   language sql
--   stable
--   security definer
--   set search_path = public
--   as $$
--     select exists (
--       select 1
--       from public.organization_members om
--       join public.organizations o on o.id = om.organization_id
--       where om.organization_id  = org_id
--         and om.user_id          = auth.uid()
--         and om.status           = 'active'
--         and o.status            = 'active'
--         and om.can_sell         = true
--         and o.commercial_profile in ('seller', 'buyer_seller')
--     );
--   $$;
--
--   revoke execute on function public.can_buy_in_org(uuid)  from public, anon;
--   revoke execute on function public.can_sell_in_org(uuid) from public, anon;
--   grant  execute on function public.can_buy_in_org(uuid)  to authenticated, service_role;
--   grant  execute on function public.can_sell_in_org(uuid) to authenticated, service_role;
--
-- Como 025 no crea ni destruye objetos, revertir es sustituir dos cuerpos. No
-- hay policies, triggers ni datos que restaurar.
--
-- ADVERTENCIA: revertir reabre el vector de la cabecera, incluida la
-- cancelación de cotizaciones publicadas desde una cuenta suspendida.
