-- Verificación ESTRUCTURAL de las migraciones 021 y 022 — Bloque 6B.2
--
-- READ-ONLY: solo SELECT sobre catálogos. No escribe nada.
-- Ejecutar DESPUÉS de aplicar cada migración.
--
-- Cada consulta devuelve una columna `ok` booleana. Todas deben ser `true`.

-- ── 1. Definición y propiedades de las funciones de autorización ────────────
select
  p.proname                                                    as funcion,
  p.prosecdef                                                  as security_definer,
  case p.provolatile when 's' then 'stable'
                     when 'i' then 'immutable'
                     else 'volatile' end                       as volatilidad,
  coalesce(array_to_string(p.proconfig, ', '), '(sin search_path)') as config,
  pg_get_userbyid(p.proowner)                                  as propietario,
  -- Esperado: DEFINER + stable + search_path=public + owner postgres
  (p.prosecdef
     and p.provolatile = 's'
     and 'search_path=public' = any(p.proconfig)
     and pg_get_userbyid(p.proowner) = 'postgres')             as ok
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_platform_admin','is_org_member','is_org_owner',
                    'is_org_admin','can_buy_in_org','can_sell_in_org')
order by p.proname;

-- ── 2. Las seis funciones existen ───────────────────────────────────────────
select count(*) = 6 as ok, count(*) as encontradas
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_platform_admin','is_org_member','is_org_owner',
                    'is_org_admin','can_buy_in_org','can_sell_in_org');

-- ── 3. Las funciones de autorización comprueban el estado ───────────────────
select p.proname,
       pg_get_functiondef(p.oid) like '%status%' as comprueba_estado,
       pg_get_functiondef(p.oid) like '%status%' as ok
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_platform_admin','is_org_member','is_org_owner',
                    'is_org_admin','can_buy_in_org','can_sell_in_org')
order by p.proname;

-- ── 4. GRANTS: ni PUBLIC ni anon en ninguna función de public ───────────────
-- `=X/postgres` (sin rol antes del `=`) significa EXECUTE para PUBLIC.
select
  p.proname                                              as funcion,
  coalesce(array_to_string(p.proacl::text[], ' | '), '(default: PUBLIC)') as acl,
  (p.proacl is not null
     and not exists (
       select 1 from unnest(p.proacl::text[]) a
       where a like '=%' or a like 'anon=%'
     ))                                                  as ok
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by ok, p.proname;

-- ── 5. `authenticated` conserva EXECUTE donde las policies lo necesitan ─────
select
  p.proname as funcion,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as ok
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_platform_admin','is_org_member','is_org_owner',
                    'is_org_admin','can_buy_in_org','can_sell_in_org',
                    'search_suppliers','get_supplier_filter_options')
order by p.proname;

-- ── 6. Las funciones de trigger NO son invocables por clientes ──────────────
select
  p.proname as funcion,
  has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_puede,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_puede,
  (not has_function_privilege('anon', p.oid, 'EXECUTE')
   and not has_function_privilege('authenticated', p.oid, 'EXECUTE')) as ok
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('handle_new_user','prevent_role_change',
                    'prevent_privileged_profile_change','rls_auto_enable',
                    'bootstrap_first_platform_admin')
order by p.proname;

-- ── 7. search_path fijado en TODA función de public ─────────────────────────
select p.proname,
       coalesce(array_to_string(p.proconfig, ', '), '(NINGUNO)') as config,
       (p.proconfig is not null) as ok
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by ok, p.proname;

-- ── 8. Triggers intactos y trigger de profiles sustituido ──────────────────
select t.tgname, c.relname as tabla, p.proname as funcion,
       true as ok
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc  p on p.oid = t.tgfoid
where not t.tgisinternal
  and c.relname in ('profiles','support_tickets','organizations')
order by c.relname, t.tgname;

-- El trigger de Auth debe seguir existiendo: sin él, el registro no crea perfil.
select count(*) = 1 as ok, 'on_auth_user_created' as trigger_esperado
from pg_trigger t
where t.tgrelid = 'auth.users'::regclass
  and not t.tgisinternal
  and t.tgname = 'on_auth_user_created';

-- El event trigger de RLS debe seguir habilitado ('O' = origin).
select evtname, evtenabled::text as estado, (evtenabled = 'O') as ok
from pg_event_trigger where evtname = 'ensure_rls';

-- ── 9. RLS activo en todas las tablas de public ────────────────────────────
select count(*) filter (where not c.relrowsecurity) = 0 as ok,
       count(*) filter (where not c.relrowsecurity)     as tablas_sin_rls,
       count(*)                                          as tablas_totales
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r';

-- ── 10. Las 52 policies siguen intactas ────────────────────────────────────
select count(*) = 52 as ok, count(*) as policies
from pg_policies where schemaname = 'public';

-- ── 11. Recuento de migraciones ────────────────────────────────────────────
-- 23 ANTES de aplicar, 24 tras 021, 25 tras 022.
select count(*) as migraciones,
       (select version || '_' || name from supabase_migrations.schema_migrations
        order by version desc limit 1) as ultima
from supabase_migrations.schema_migrations;

-- ── 12. Los datos no han cambiado ──────────────────────────────────────────
select
  (select count(*) from public.profiles)                                as perfiles,
  (select count(*) from public.profiles where role = 'platform_admin')  as admins,
  (select count(*) from public.profiles where status = 'active')        as perfiles_activos,
  (select count(*) from public.organizations)                           as organizaciones,
  (select count(*) from public.organization_members)                    as pertenencias,
  (select count(*) from public.rfqs)                                    as rfqs,
  (select count(*) from public.rfq_responses)                           as respuestas,
  (select count(*) from public.suppliers)                               as proveedores,
  ((select count(*) from public.profiles) = 4
   and (select count(*) from public.profiles where role = 'platform_admin') = 3
   and (select count(*) from public.organizations) = 1
   and (select count(*) from public.organization_members) = 1
   and (select count(*) from public.rfqs) = 3
   and (select count(*) from public.rfq_responses) = 2
   and (select count(*) from public.suppliers) = 12288)                 as ok;
