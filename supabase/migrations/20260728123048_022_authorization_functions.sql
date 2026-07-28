-- 022 — Funciones canónicas de autorización y grants
--
-- ─────────────────────────────────────────────────────────────────────────────
-- QUÉ CORRIGE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- El modelo de estados introducido en 6A (profiles.status, organizations.status,
-- organization_members.status) y las capacidades comerciales (can_buy/can_sell)
-- NO tenían ningún efecto sobre RLS: las funciones que usan las 52 policies los
-- ignoraban por completo. En la práctica:
--
--   · un administrador de plataforma suspendido conservaba permisos totales;
--   · un miembro `suspended`, o meramente `invited`, mantenía acceso íntegro;
--   · una organización `suspended` seguía operando con normalidad;
--   · `can_buy` / `can_sell` eran columnas decorativas.
--
-- Esta migración redefine las tres funciones existentes para que exijan estados
-- activos y añade tres helpers nuevos que consumirán 6B.3 y 6B.4.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- EFECTO INMEDIATO EN PRODUCCIÓN: NINGUNO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Verificado antes de escribir esta migración:
--   4/4 perfiles          status = 'active'
--   1/1 organización      status = 'active'
--   1/1 pertenencia       status = 'active'
--
-- Al no existir ninguna fila en otro estado, añadir el filtro no cambia el
-- resultado de ninguna policy. Debe volver a comprobarse INMEDIATAMENTE ANTES
-- de aplicar.
--
-- NO se crea, elimina ni modifica ninguna policy: siguen siendo 52. El cambio
-- de comportamiento llega a través de las funciones que las policies invocan.
--
-- Compatibilidad legacy: se conserva el fallback a `role = 'client_owner'`.
-- No se estrecha ningún CHECK ni se elimina ninguna columna.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Funciones de autorización
-- ─────────────────────────────────────────────────────────────────────────────

-- Administrador de plataforma. Exige que el propio administrador esté activo:
-- suspender a un administrador debe retirarle los permisos de verdad.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id     = auth.uid()
      and p.role   = 'platform_admin'
      and p.status = 'active'
  );
$$;

-- Pertenencia activa a una organización activa.
-- `invited` todavía NO concede acceso: la invitación se acepta en 6C.
create or replace function public.is_org_member(org_id uuid)
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
    where om.organization_id = org_id
      and om.user_id         = auth.uid()
      and om.status          = 'active'
      and o.status           = 'active'
  );
$$;

-- Propietario de la organización. Acepta el rol canónico y, temporalmente, el
-- legacy `client_owner`.
create or replace function public.is_org_owner(org_id uuid)
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
    where om.organization_id = org_id
      and om.user_id         = auth.uid()
      and om.status          = 'active'
      and o.status           = 'active'
      and (om.org_role = 'owner' or om.role = 'client_owner')
  );
$$;

-- Puede administrar la organización: jerárquico, owner ⊃ admin.
--
-- El legacy `client_owner` cuenta como owner y por tanto satisface esta
-- función. `client_member` NO se convierte en administrador: el modelo antiguo
-- solo distinguía propietario y miembro, así que ascenderlo inventaría un
-- permiso que nunca tuvo.
create or replace function public.is_org_admin(org_id uuid)
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
    where om.organization_id = org_id
      and om.user_id         = auth.uid()
      and om.status          = 'active'
      and o.status           = 'active'
      and (om.org_role in ('owner', 'admin') or om.role = 'client_owner')
  );
$$;

-- Capacidad de compra. El perfil comercial de la organización es el TECHO: una
-- empresa `seller` no compra aunque la fila del miembro tenga can_buy = true.
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
    where om.organization_id  = org_id
      and om.user_id          = auth.uid()
      and om.status           = 'active'
      and o.status            = 'active'
      and om.can_buy          = true
      and o.commercial_profile in ('buyer', 'buyer_seller')
  );
$$;

-- Capacidad de venta, simétrica de la anterior.
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
    where om.organization_id  = org_id
      and om.user_id          = auth.uid()
      and om.status           = 'active'
      and o.status            = 'active'
      and om.can_sell         = true
      and o.commercial_profile in ('seller', 'buyer_seller')
  );
$$;

comment on function public.is_org_admin(uuid)   is 'Owner o admin de la organización, con estados activos. Acepta el legacy client_owner como owner.';
comment on function public.can_buy_in_org(uuid) is 'Capacidad de compra del miembro, limitada por commercial_profile de la organización.';
comment on function public.can_sell_in_org(uuid) is 'Capacidad de venta del miembro, limitada por commercial_profile de la organización.';

-- Un administrador de plataforma NO se convierte automáticamente en miembro,
-- comprador ni vendedor de ninguna organización: estas seis funciones evalúan
-- pertenencias reales. La administración global depende de is_platform_admin().

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Grants — funciones usadas por las policies
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Las expresiones de una policy se evalúan con los privilegios del usuario que
-- ejecuta la consulta, así que `authenticated` DEBE conservar EXECUTE o las 52
-- policies fallarían. `anon` no lo necesita: sin sesión, `auth.uid()` es NULL y
-- todas devuelven false; exponerlas por RPC solo añade superficie.

revoke execute on function public.is_platform_admin()      from public, anon;
revoke execute on function public.is_org_member(uuid)      from public, anon;
revoke execute on function public.is_org_owner(uuid)       from public, anon;
revoke execute on function public.is_org_admin(uuid)       from public, anon;
revoke execute on function public.can_buy_in_org(uuid)     from public, anon;
revoke execute on function public.can_sell_in_org(uuid)    from public, anon;

grant execute on function public.is_platform_admin()   to authenticated, service_role;
grant execute on function public.is_org_member(uuid)   to authenticated, service_role;
grant execute on function public.is_org_owner(uuid)    to authenticated, service_role;
grant execute on function public.is_org_admin(uuid)    to authenticated, service_role;
grant execute on function public.can_buy_in_org(uuid)  to authenticated, service_role;
grant execute on function public.can_sell_in_org(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Grants — funciones que NUNCA deben ser invocables por RPC
-- ─────────────────────────────────────────────────────────────────────────────
--
-- PostgreSQL comprueba EXECUTE al CREAR un trigger, no al dispararlo, y la
-- función corre con los privilegios de su propietario. Revocar EXECUTE a los
-- roles de cliente NO afecta a ningún trigger:
--
--   on_auth_user_created (auth.users)        -> handle_new_user()
--   profiles_prevent_privileged_change       -> prevent_privileged_profile_change()
--   ensure_rls (event trigger)               -> rls_auto_enable()
--   *_updated_at                             -> set_updated_at()
--   support_tickets_resolved_at              -> handle_ticket_resolved_at()

-- Trigger de Auth. El registro de usuarios sigue funcionando igual: lo dispara
-- Postgres al insertar en auth.users, no el cliente.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Trigger de profiles heredado, ya sin trigger asociado tras la migración 021.
revoke execute on function public.prevent_role_change() from public, anon, authenticated;

-- Event trigger de RLS. Lo dispara el motor como propietario; no se invoca.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Bootstrap del primer administrador. Ya cumplió su función: existen 3
-- administradores y la propia función aborta si encuentra alguno. Estaba
-- expuesta a `anon` vía /rest/v1/rpc/, donde servía como oráculo (sus dos
-- mensajes de error distintos permiten averiguar si un UUID tiene perfil) y
-- como puerta de escalada si el recuento de administradores llegara a cero.
--
-- No se elimina ni se cambia su lógica: solo deja de ser alcanzable desde el
-- exterior. Sigue disponible para `postgres` y `service_role`.
revoke execute on function public.bootstrap_first_platform_admin(uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. search_path en las funciones de trigger que carecían de él
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Sin `search_path` fijo, quien pueda crear objetos en un esquema del path
-- podría interponer una función homónima. Ambas son triviales y solo usan
-- `now()`, así que basta con `pg_catalog`. El comportamiento no cambia.

alter function public.set_updated_at()            set search_path = pg_catalog;
alter function public.handle_ticket_resolved_at() set search_path = pg_catalog;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Definiciones EXACTAS anteriores a esta migración. Restaurarlas devuelve el
-- comportamiento previo (los estados vuelven a ignorarse).
--
--   create or replace function public.is_platform_admin()
--   returns boolean language sql stable security definer set search_path to 'public'
--   as $$
--     select exists (
--       select 1 from public.profiles
--       where id = auth.uid() and role = 'platform_admin'
--     );
--   $$;
--
--   create or replace function public.is_org_member(org_id uuid)
--   returns boolean language sql stable security definer set search_path to 'public'
--   as $$
--     select exists (
--       select 1 from public.organization_members
--       where organization_id = org_id and user_id = auth.uid()
--     );
--   $$;
--
--   create or replace function public.is_org_owner(org_id uuid)
--   returns boolean language sql stable security definer set search_path to 'public'
--   as $$
--     select exists (
--       select 1 from public.organization_members
--       where organization_id = org_id
--         and user_id = auth.uid()
--         and (org_role = 'owner' or role = 'client_owner')
--     );
--   $$;
--
--   drop function if exists public.is_org_admin(uuid);
--   drop function if exists public.can_buy_in_org(uuid);
--   drop function if exists public.can_sell_in_org(uuid);
--
--   -- Grants previos (todas tenían EXECUTE para PUBLIC, anon y authenticated):
--   grant execute on function public.is_platform_admin() to public;
--   grant execute on function public.is_org_member(uuid) to public;
--   grant execute on function public.is_org_owner(uuid) to public;
--   grant execute on function public.handle_new_user() to public;
--   grant execute on function public.prevent_role_change() to public;
--   grant execute on function public.rls_auto_enable() to public;
--   grant execute on function public.bootstrap_first_platform_admin(uuid) to public;
--
--   alter function public.set_updated_at() reset search_path;
--   alter function public.handle_ticket_resolved_at() reset search_path;
--
-- ADVERTENCIA: si se revierte 022 sin revertir 021, el trigger de profiles
-- sigue funcionando pero un administrador SUSPENDIDO volvería a poder cambiar
-- roles y estados. Revertir siempre 022 antes que 021.
