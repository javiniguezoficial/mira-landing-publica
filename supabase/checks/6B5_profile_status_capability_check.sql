-- Verificación de la migración 025 — Bloque 6B.5
--
-- Ejecutar DESPUÉS de aplicar 025. Cada bloque va en su propia transacción
-- BEGIN … ROLLBACK y no deja ningún dato.
--
-- IDENTIDADES: no se crean usuarios en Auth. Se reutilizan los cuatro perfiles
-- reales y, dentro de cada transacción, se les da el estado que necesita el
-- escenario. La preparación usa la conexión directa (sin claims), que es el
-- escape documentado de los triggers 021, 023 y 024.
--
--   ANA    ef9f8075-f79f-4cde-8d4c-5e48df0b88e6   owner de Acme, can_buy=true
--   JAVIER 867e813e-4ec3-4759-be0e-e861d9e90df0   platform_admin
--   ACME   35fe4e45-f546-415e-b2e1-01017c200f7f   active, buyer
--
-- Las 3 RFQs reales están en 'open' y NO se modifican en ningún momento.
-- No se usa service_role en ninguna prueba de comportamiento.

-- ═════════════════════════════════════════════════════════════════════════════
-- A. ESTRUCTURA — las dos funciones ya miran profiles.status
-- ═════════════════════════════════════════════════════════════════════════════

select p.proname,
       p.prosecdef as security_definer,
       pg_get_userbyid(p.proowner) as owner,
       coalesce(array_to_string(p.proconfig,', '),'(NINGUNO)') as search_path,
       case p.provolatile when 's' then 'stable' else 'OTRA' end as volatilidad,
       has_function_privilege('anon',          p.oid,'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid,'EXECUTE') as authenticated,
       (p.prosecdef
        and pg_get_userbyid(p.proowner) = 'postgres'
        and p.proconfig is not null
        and p.provolatile = 's'
        and not has_function_privilege('anon', p.oid,'EXECUTE')
        and has_function_privilege('authenticated', p.oid,'EXECUTE')
        and pg_get_functiondef(p.oid) like '%p.status%active%') as ok
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('can_buy_in_org','can_sell_in_org')
order by p.proname;

-- is_org_member NO cambia: sigue sin mirar profiles. Decisión explícita de 6B.5.
select p.proname,
       (pg_get_functiondef(p.oid) not like '%profiles%') as ok_sin_profiles
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('is_org_member','is_org_owner','is_org_admin')
order by p.proname;

-- is_platform_admin sigue exigiendo perfil activo, como desde 021.
select (pg_get_functiondef(p.oid) like '%p.status%active%') as ok
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'is_platform_admin';

-- Nada más ha cambiado: 53 policies y 28 migraciones tras aplicar 025.
select count(*) as policies, count(*) = 53 as ok from pg_policies where schemaname='public';
select count(*) as migraciones,
       (select version||'_'||name from supabase_migrations.schema_migrations
        order by version desc limit 1) as ultima
from supabase_migrations.schema_migrations;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1-8. CAPACIDAD SEGÚN ESTADOS
-- ═════════════════════════════════════════════════════════════════════════════

-- 1. Todo activo + buyer + can_buy=true → true. Es la configuración real de hoy.
begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  do $$
  begin
    insert into r select '1','todo activo + buyer + can_buy',
      (public.can_buy_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f') = true),
      'devuelve '||public.can_buy_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f');
  end $$;
  select * from r;
rollback;

-- 2. PERFIL SUSPENDIDO + resto válido → false. Es el vector que cierra 025.
begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  update public.profiles set status='suspended'
   where id='ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  do $$
  declare e text; v_n int;
  begin
    insert into r select '2a','can_buy_in_org() con perfil suspendido',
      (public.can_buy_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f') = false),
      'devuelve '||public.can_buy_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f');

    -- El vector completo: INSERT directo por PostgREST.
    begin
      insert into public.rfqs(organization_id,created_by,rfq_kind,request_name,deadline,country,status,unit_format,lead_time,sale_currency)
      values ('35fe4e45-f546-415e-b2e1-01017c200f7f','ef9f8075-f79f-4cde-8d4c-5e48df0b88e6','product','Perfil suspendido','2026-12-31','ES','draft','kg','7d','EUR');
      insert into r values ('2b','INSERT con perfil suspendido',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('2b','INSERT con perfil suspendido',true,'DENEGADO'); end;

    -- Y el que convertía el hallazgo en brecha: cancelar lo ya publicado.
    update public.rfqs set status='cancelled'
     where organization_id='35fe4e45-f546-415e-b2e1-01017c200f7f' and status='open';
    get diagnostics v_n = ROW_COUNT;
    insert into r values ('2c','cancelar RFQs abiertas con perfil suspendido', (v_n=0), 'ROW_COUNT='||v_n);

    -- La lectura del histórico SÍ se conserva: is_org_member() no cambia.
    insert into r select '2d','el histórico sigue visible (decisión de 6B.5)',
      (count(*)=3), 'visibles: '||count(*)
      from public.rfqs where organization_id='35fe4e45-f546-415e-b2e1-01017c200f7f';
  end $$;
  select * from r order by n;
rollback;

-- 3. Pertenencia suspendida → false.
begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  update public.organization_members set status='suspended'
   where user_id='ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  do $$
  begin
    insert into r select '3','pertenencia suspendida',
      (public.can_buy_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f') = false),
      'devuelve '||public.can_buy_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f');
    -- Aquí la lectura SÍ desaparece: is_org_member() exige pertenencia activa.
    insert into r select '3b','sin lectura del histórico', (count(*)=0), 'visibles: '||count(*)
      from public.rfqs where organization_id='35fe4e45-f546-415e-b2e1-01017c200f7f';
  end $$;
  select * from r order by n;
rollback;

-- 4. Organización suspendida → false.
begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  update public.organizations set status='suspended'
   where id='35fe4e45-f546-415e-b2e1-01017c200f7f';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  do $$
  begin
    insert into r select '4','organización suspendida',
      (public.can_buy_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f') = false),
      'devuelve '||public.can_buy_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f');
  end $$;
  select * from r;
rollback;

-- 5. can_buy=false → false.
begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  update public.organization_members set can_buy=false
   where user_id='ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  do $$
  begin
    insert into r select '5','can_buy=false',
      (public.can_buy_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f') = false),
      'devuelve '||public.can_buy_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f');
  end $$;
  select * from r;
rollback;

-- 6-7. El techo comercial: seller puro no compra, buyer_seller sí.
begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  update public.organizations set commercial_profile='seller'
   where id='35fe4e45-f546-415e-b2e1-01017c200f7f';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  do $$
  begin
    insert into r select '6','seller puro no compra',
      (public.can_buy_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f') = false),
      'devuelve '||public.can_buy_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f');
  end $$;
  select * from r;
rollback;

begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  update public.organizations set commercial_profile='buyer_seller'
   where id='35fe4e45-f546-415e-b2e1-01017c200f7f';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  do $$
  begin
    insert into r select '7','buyer_seller compra',
      (public.can_buy_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f') = true),
      'devuelve '||public.can_buy_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f');
  end $$;
  select * from r;
rollback;

-- 8. La venta, simétrica. Sigue sin habilitar ninguna funcionalidad: se
--    comprueba la función, no un flujo, porque el portal de vendedor no existe.
begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  update public.organizations set commercial_profile='buyer_seller'
   where id='35fe4e45-f546-415e-b2e1-01017c200f7f';
  update public.organization_members set can_sell=true
   where user_id='ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  do $$
  begin
    insert into r select '8a','can_sell con todo activo',
      (public.can_sell_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f') = true),
      'devuelve '||public.can_sell_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f');
  end $$;
  select * from r;
rollback;

begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  update public.organizations set commercial_profile='buyer_seller'
   where id='35fe4e45-f546-415e-b2e1-01017c200f7f';
  update public.organization_members set can_sell=true
   where user_id='ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
  update public.profiles set status='suspended'
   where id='ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  do $$
  declare e text;
  begin
    insert into r select '8b','can_sell con perfil suspendido',
      (public.can_sell_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f') = false),
      'devuelve '||public.can_sell_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f');
    -- Y sigue sin abrir ninguna vía: rfq_responses no admite al cliente.
    begin
      insert into public.rfq_responses(rfq_id,supplier_name,price,unit,currency,status)
      values ((select id from public.rfqs limit 1),'Como vendedora',10,'kg','EUR','received');
      insert into r values ('8c','can_sell no habilita respuestas',false,'SE PERMITIO — FALLO');
    exception when others then insert into r values ('8c','can_sell no habilita respuestas',true,'DENEGADO'); end;
  end $$;
  select * from r order by n;
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- 9. PLATFORM ADMIN SUSPENDIDO
-- ═════════════════════════════════════════════════════════════════════════════
--
-- `is_platform_admin()` ya lo exigía desde 021: se comprueba para dejar
-- constancia de que 025 no lo altera y de que el guard TypeScript corregido
-- ahora coincide con este resultado.

begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  update public.profiles set status='suspended'
   where id='867e813e-4ec3-4759-be0e-e861d9e90df0';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"867e813e-4ec3-4759-be0e-e861d9e90df0","role":"authenticated"}';
  do $$
  declare v_n int;
  begin
    insert into r select '9a','is_platform_admin() con perfil suspendido',
      (public.is_platform_admin() = false), 'devuelve '||public.is_platform_admin();

    insert into r select '9b','no ve las RFQs como administrador', (count(*)=0),
      'visibles: '||count(*) from public.rfqs;

    update public.rfqs set status='closed' where status='open';
    get diagnostics v_n = ROW_COUNT;
    insert into r values ('9c','no cambia estados como administrador', (v_n=0), 'ROW_COUNT='||v_n);
  end $$;
  select * from r order by n;
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- 10. INTEGRIDAD FINAL
-- ═════════════════════════════════════════════════════════════════════════════

select
  (select count(*) from public.rfqs)                     as rfqs,
  (select count(*) from public.rfqs where status='open') as rfqs_open,
  (select string_agg(distinct status, ', ') from public.rfqs) as estados,
  (select count(*) from public.rfq_responses)            as respuestas,
  (select count(*) from public.profiles)                 as perfiles,
  (select count(*) from public.profiles where status='active') as perfiles_active,
  (select count(*) from public.profiles where role='platform_admin') as admins,
  (select count(*) from public.organizations)            as organizaciones,
  (select count(*) from public.organization_members)     as miembros,
  (select count(*) from public.suppliers)                as proveedores,
  (select count(*) from pg_policies where schemaname='public') as policies,
  ((select count(*) from public.rfqs) = 3
   and (select count(*) from public.rfqs where status='open') = 3
   and (select count(*) from public.rfq_responses) = 2
   and (select count(*) from public.profiles) = 4
   and (select count(*) from public.profiles where status='active') = 4
   and (select count(*) from public.profiles where role='platform_admin') = 3
   and (select count(*) from public.organizations) = 1
   and (select count(*) from public.organization_members) = 1
   and (select count(*) from public.suppliers) = 12288
   and (select count(*) from pg_policies where schemaname='public') = 53) as ok;

-- Ana intacta.
select m.org_role, m.role, m.status as membership_status, m.can_buy, m.can_sell,
       p.status as profile_status,
       (p.status='active' and m.status='active' and m.can_buy and not m.can_sell) as ok
from public.organization_members m join public.profiles p on p.id = m.user_id
where m.user_id = 'ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';

-- Ninguna RFQ de prueba persiste.
select (count(*)=0) as ok, 'RFQs de prueba revertidas' as caso
from public.rfqs where request_name in ('Perfil suspendido','Como vendedora');
