-- Verificación ESTRUCTURAL de la migración 024 — Bloque 6B.4
--
-- READ-ONLY. Ejecutar DESPUÉS de aplicar 024.
-- Cada consulta devuelve una columna `ok` que debe ser `true`.

-- ── 1. Policies de RFQ ──────────────────────────────────────────────────────
select tablename, policyname, cmd,
       coalesce(qual,'—') as using_expr, coalesce(with_check,'—') as check_expr
from pg_policies where schemaname='public' and tablename in ('rfqs','rfq_responses')
order by tablename, cmd, policyname;

-- INSERT exige capacidad de compra, no solo pertenencia.
select policyname,
       (with_check like '%can_buy_in_org%'
        and with_check like '%created_by = auth.uid()%'
        and with_check like '%draft%') as ok
from pg_policies
where schemaname='public' and tablename='rfqs' and cmd='INSERT'
  and policyname='org_member_insert_rfqs';

-- UPDATE: capacidad + (creador o administración de la organización).
select policyname,
       (qual like '%can_buy_in_org%' and qual like '%is_org_admin%'
        and with_check like '%can_buy_in_org%') as ok
from pg_policies
where schemaname='public' and tablename='rfqs' and cmd='UPDATE'
  and policyname='org_member_update_rfqs';

-- La policy antigua ya no existe.
select count(*) = 0 as ok, count(*) as encontradas
from pg_policies
where schemaname='public' and policyname='org_member_update_draft_rfqs';

-- SELECT de rfqs sin tocar: el histórico sigue visible sin can_buy.
select policyname, (qual like '%is_org_member%') as ok
from pg_policies
where schemaname='public' and tablename='rfqs' and cmd='SELECT'
  and policyname='org_member_select_rfqs';

-- Los clientes siguen SIN DELETE.
select count(*) = 0 as ok, count(*) as policies_delete_cliente
from pg_policies
where schemaname='public' and tablename='rfqs' and cmd='DELETE' and policyname not like 'admin%';

-- rfq_responses: exactamente 2 policies, sin ampliar a vendedores.
select count(*) = 2 as ok, string_agg(policyname||'['||cmd||']', ', ') as policies
from pg_policies where schemaname='public' and tablename='rfq_responses';

-- `can_sell_in_org` sigue SIN usarse en ninguna policy.
select count(*) = 0 as ok, count(*) as policies_con_can_sell
from pg_policies
where schemaname='public'
  and (coalesce(qual,'') || coalesce(with_check,'')) like '%can_sell_in_org%';

-- ── 2. Funciones nuevas ─────────────────────────────────────────────────────
select p.proname, p.prosecdef as sec_def,
       case p.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end as vol,
       coalesce(array_to_string(p.proconfig,', '),'(NINGUNO)') as search_path,
       pg_get_userbyid(p.proowner) as owner,
       has_function_privilege('anon',          p.oid,'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid,'EXECUTE') as authenticated,
       (not has_function_privilege('anon', p.oid,'EXECUTE')
        and p.proconfig is not null) as ok
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('is_valid_rfq_transition','enforce_rfq_integrity')
order by p.proname;

-- El trigger no debe ser invocable por clientes; la función de transición sí,
-- porque no otorga nada por sí sola.
select
  (not has_function_privilege('authenticated','public.enforce_rfq_integrity()','EXECUTE')) as ok_trigger_no_invocable,
  has_function_privilege('authenticated','public.is_valid_rfq_transition(text,text,boolean)','EXECUTE') as ok_transicion_disponible;

-- ── 3. Trigger ──────────────────────────────────────────────────────────────
select c.relname as tabla, t.tgname, p.proname as funcion
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid
where not t.tgisinternal and c.relname in ('rfqs','rfq_responses')
order by c.relname, t.tgname;

select
  (select count(*) from pg_trigger where tgrelid='public.rfqs'::regclass
     and tgname='rfqs_enforce_integrity' and not tgisinternal) = 1 as ok_trigger_nuevo,
  (select count(*) from pg_trigger where tgrelid='public.rfqs'::regclass
     and tgname='rfqs_updated_at' and not tgisinternal) = 1 as ok_updated_at_intacto;

-- ── 4. Constraints y estados: sin cambios ───────────────────────────────────
select con.conname, pg_get_constraintdef(con.oid) as definicion,
       (pg_get_constraintdef(con.oid) like '%draft%open%closed%awarded%cancelled%') as ok
from pg_constraint con join pg_class c on c.oid=con.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='rfqs' and con.conname='rfqs_status_check';

-- Ningún estado fuera del CHECK.
select count(*) = 0 as ok, count(*) as rfqs_con_estado_invalido
from public.rfqs where status not in ('draft','open','closed','awarded','cancelled');

-- ── 5. RLS activo ───────────────────────────────────────────────────────────
select count(*) filter (where not c.relrowsecurity) = 0 as ok
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r';

-- ── 6. Total de policies: 53 antes, 53 después ──────────────────────────────
-- 024 sustituye dos policies una a una; no añade ni quita ninguna.
select count(*) as policies, count(*) = 53 as ok
from pg_policies where schemaname='public';

-- ── 7. Nada fuera de RFQ ha cambiado ────────────────────────────────────────
-- Huella de las 45 policies que 024 NO debe tocar, medida ANTES de aplicar:
--   9ae86154f90e3aa2fe4aba4e20294e06
-- Debe ser idéntica después.
select md5(string_agg(tablename||'.'||policyname||'.'||cmd||'.'||coalesce(qual,'')||'.'||coalesce(with_check,''),
                      '|' order by tablename, policyname, cmd)) as huella_no_rfq,
       count(*) as policies_no_rfq
from pg_policies
where schemaname='public' and tablename not in ('rfqs','rfq_responses');

-- Organizaciones, miembros, soporte y suscripciones intactos.
select count(*) = 13 as ok, count(*) as policies_6b3
from pg_policies where schemaname='public'
  and tablename in ('organizations','organization_members','subscriptions','support_tickets');

-- Los triggers de 021 y 023 siguen en su sitio.
select
  (select count(*) from pg_trigger where tgrelid='public.profiles'::regclass
     and tgname='profiles_prevent_privileged_change' and not tgisinternal) = 1 as ok_021,
  (select count(*) from pg_trigger where tgrelid='public.organization_members'::regclass
     and tgname='members_enforce_rules' and not tgisinternal) = 1 as ok_023_miembros,
  (select count(*) from pg_trigger where tgrelid='public.organizations'::regclass
     and tgname='organizations_protect_columns' and not tgisinternal) = 1 as ok_023_orgs,
  (select count(*) from pg_indexes where schemaname='public'
     and indexname='organization_members_single_owner_idx') = 1 as ok_023_indice;

-- ── 8. Migraciones ──────────────────────────────────────────────────────────
-- 26 antes de aplicar 024, 27 después.
select count(*) as migraciones,
       (select version||'_'||name from supabase_migrations.schema_migrations
        order by version desc limit 1) as ultima
from supabase_migrations.schema_migrations;

-- ── 9. Datos intactos ───────────────────────────────────────────────────────
select
  (select count(*) from public.rfqs)            as rfqs,
  (select count(*) from public.rfq_responses)   as respuestas,
  (select count(*) from public.profiles)        as perfiles,
  (select count(*) from public.organizations)   as organizaciones,
  (select count(*) from public.organization_members) as miembros,
  (select count(*) from public.suppliers)       as proveedores,
  (select string_agg(distinct status, ', ') from public.rfqs) as estados_rfq,
  ((select count(*) from public.rfqs) = 3
   and (select count(*) from public.rfq_responses) = 2
   and (select count(*) from public.profiles) = 4
   and (select count(*) from public.organizations) = 1
   and (select count(*) from public.organization_members) = 1
   and (select count(*) from public.suppliers) = 12288) as ok;
