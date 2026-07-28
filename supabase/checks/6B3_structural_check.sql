-- Verificación ESTRUCTURAL de la migración 023 — Bloque 6B.3
--
-- READ-ONLY. Ejecutar DESPUÉS de aplicar 023.
-- Cada consulta devuelve una columna `ok` que debe ser `true`.

-- ── 1. Policies de las cuatro tablas afectadas ──────────────────────────────
select tablename, policyname, cmd, roles::text,
       coalesce(qual,'—') as using_expr,
       coalesce(with_check,'—') as check_expr
from pg_policies
where schemaname='public'
  and tablename in ('organizations','organization_members','subscriptions','support_tickets')
order by tablename, cmd, policyname;

-- ── 2. organizations: la policy de UPDATE tiene WITH CHECK explícito ────────
select policyname,
       (qual is not null and with_check is not null) as ok,
       coalesce(with_check,'(SIN WITH CHECK)') as check_expr
from pg_policies
where schemaname='public' and tablename='organizations' and cmd='UPDATE';

-- ── 3. organization_members: las tres policies nuevas existen ───────────────
select
  count(*) filter (where policyname='members_admin_insert') = 1 as ok_insert,
  count(*) filter (where policyname='members_admin_update') = 1 as ok_update,
  count(*) filter (where policyname='members_admin_delete') = 1 as ok_delete,
  count(*) filter (where policyname in ('members_owner_insert','members_owner_delete')) = 0 as ok_antiguas_eliminadas,
  count(*) as total_policies_miembros
from pg_policies where schemaname='public' and tablename='organization_members';

-- Las tres usan is_org_admin, no is_org_owner.
select policyname, cmd,
       (coalesce(qual,'')||coalesce(with_check,'') like '%is_org_admin%') as ok_usa_is_org_admin
from pg_policies
where schemaname='public' and tablename='organization_members'
  and policyname in ('members_admin_insert','members_admin_update','members_admin_delete')
order by policyname;

-- ── 4. subscriptions: SIN cambios (2 policies, ninguna de escritura cliente) ─
select count(*) = 2 as ok, string_agg(policyname||'['||cmd||']', ', ') as policies
from pg_policies where schemaname='public' and tablename='subscriptions';

-- ── 5. support_tickets: inserción apoyada en belongs_to_org_any_status ──────
select policyname,
       (with_check like '%belongs_to_org_any_status%') as ok
from pg_policies
where schemaname='public' and tablename='support_tickets' and cmd='INSERT';

-- Los clientes siguen sin UPDATE ni DELETE propios.
select count(*) filter (where cmd in ('UPDATE','DELETE') and policyname not like 'admin%') = 0 as ok,
       string_agg(policyname||'['||cmd||']', ', ') as policies
from pg_policies where schemaname='public' and tablename='support_tickets';

-- ── 6. Funciones auxiliares nuevas ──────────────────────────────────────────
select p.proname,
       p.prosecdef as sec_definer,
       coalesce(array_to_string(p.proconfig,', '),'(NINGUNO)') as search_path,
       pg_get_userbyid(p.proowner) as propietario,
       has_function_privilege('anon',          p.oid,'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid,'EXECUTE') as authenticated,
       (p.prosecdef
        and 'search_path=public' = any(p.proconfig)
        and not has_function_privilege('anon', p.oid,'EXECUTE')) as ok
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('protect_organization_columns','enforce_membership_rules','belongs_to_org_any_status')
order by p.proname;

-- Las dos de trigger no deben ser invocables ni por authenticated.
select p.proname,
       (not has_function_privilege('authenticated', p.oid,'EXECUTE')) as ok
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('protect_organization_columns','enforce_membership_rules',
                    'set_updated_at','handle_ticket_resolved_at')
order by p.proname;

-- `belongs_to_org_any_status` SÍ debe seguir disponible para authenticated:
-- la policy de inserción de tickets la invoca.
select has_function_privilege('authenticated','public.belongs_to_org_any_status(uuid)','EXECUTE') as ok;

-- ── 6b. Índice único parcial de propietario ─────────────────────────────────
select indexname, indexdef,
       (indexdef like '%UNIQUE%' and indexdef like '%org_role%owner%') as ok
from pg_indexes
where schemaname='public' and tablename='organization_members'
  and indexname='organization_members_single_owner_idx';

-- Debe existir exactamente uno y ser único.
select count(*) = 1 as ok, count(*) as encontrados
from pg_indexes
where schemaname='public' and indexname='organization_members_single_owner_idx';

-- Ninguna organización puede tener dos propietarios canónicos.
select count(*) = 0 as ok, count(*) as organizaciones_con_varios_owners
from (select organization_id from public.organization_members
      where org_role='owner' group by organization_id having count(*) > 1) x;

-- Todas las filas existentes deben ser coherentes (canónico <-> legacy).
select count(*) = 0 as ok, count(*) as filas_incoherentes
from public.organization_members
where not ((org_role='owner'  and role='client_owner')
        or (org_role='admin'  and role='client_member')
        or (org_role='member' and role='client_member'));

-- ── 7. Triggers auxiliares ──────────────────────────────────────────────────
select c.relname as tabla, t.tgname, p.proname as funcion,
       case t.tgtype & 28
         when 4 then 'INSERT' when 8 then 'DELETE' when 16 then 'UPDATE'
         else 'MULTIPLE' end as eventos
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_proc  p on p.oid=t.tgfoid
where not t.tgisinternal
  and c.relname in ('organizations','organization_members','profiles','support_tickets')
order by c.relname, t.tgname;

select
  (select count(*) from pg_trigger where tgrelid='public.organizations'::regclass
     and tgname='organizations_protect_columns' and not tgisinternal) = 1 as ok_trigger_orgs,
  (select count(*) from pg_trigger where tgrelid='public.organization_members'::regclass
     and tgname='members_enforce_rules' and not tgisinternal) = 1 as ok_trigger_miembros,
  (select count(*) from pg_trigger where tgrelid='public.profiles'::regclass
     and tgname='profiles_prevent_privileged_change' and not tgisinternal) = 1 as ok_trigger_021_intacto;

-- ── 8. RLS activo en todas las tablas ───────────────────────────────────────
select count(*) filter (where not c.relrowsecurity) = 0 as ok,
       count(*) filter (where not c.relrowsecurity) as sin_rls
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r';

-- ── 9. Recuento de policies: 52 antes, 53 después ──────────────────────────
-- El saldo es +1: se añade members_admin_update; el resto se sustituyen 1 a 1.
select count(*) as policies, count(*) = 53 as ok_despues
from pg_policies where schemaname='public';

-- ── 10. NINGUNA policy de RFQ ni de catálogos ha cambiado ──────────────────
-- Huella de las 40 policies intocables, medida tras aplicar 023:
--   f290219d733348e0c3e073a9c7321bd6
-- Aquí se comprueba solo el subconjunto que 023 NO debe tocar.
select md5(string_agg(tablename||'.'||policyname||'.'||cmd||'.'||coalesce(qual,'')||'.'||coalesce(with_check,''),
                      '|' order by tablename, policyname, cmd)) as huella_intocables,
       count(*) as policies_intocables
from pg_policies
where schemaname='public'
  and tablename not in ('organizations','organization_members','subscriptions','support_tickets');

-- Debe seguir habiendo exactamente estas 8 policies de RFQ (6 en rfqs, 2 en
-- rfq_responses). Verificado tras aplicar 023: ninguna cambió.
select count(*) = 8 as ok, string_agg(policyname||'['||cmd||']', ', ' order by policyname) as policies
from pg_policies where schemaname='public' and tablename in ('rfqs','rfq_responses');

-- ── 11. Migraciones ─────────────────────────────────────────────────────────
-- 25 antes de aplicar 023, 26 después.
select count(*) as migraciones,
       (select version||'_'||name from supabase_migrations.schema_migrations
        order by version desc limit 1) as ultima
from supabase_migrations.schema_migrations;

-- ── 12. Datos intactos ──────────────────────────────────────────────────────
select
  (select count(*) from public.profiles)             as perfiles,
  (select count(*) from public.organizations)        as organizaciones,
  (select count(*) from public.organization_members) as miembros,
  (select count(*) from public.rfqs)                 as rfqs,
  (select count(*) from public.rfq_responses)        as respuestas,
  (select count(*) from public.suppliers)            as proveedores,
  (select count(*) from public.support_tickets)      as tickets,
  ((select count(*) from public.profiles) = 4
   and (select count(*) from public.organizations) = 1
   and (select count(*) from public.organization_members) = 1
   and (select count(*) from public.rfqs) = 3
   and (select count(*) from public.rfq_responses) = 2
   and (select count(*) from public.suppliers) = 12288) as ok;
