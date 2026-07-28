-- Verificación de COMPORTAMIENTO de la migración 023 — Bloque 6B.3
--
-- Ejecutar DESPUÉS de aplicar 023. Cada escenario va en su propia transacción
-- BEGIN … ROLLBACK y no deja ningún dato.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- IDENTIDADES
-- ─────────────────────────────────────────────────────────────────────────────
--
-- No se crean usuarios en Auth. Se reutilizan los cuatro perfiles existentes y,
-- DENTRO de cada transacción, se les da temporalmente el papel que necesita el
-- escenario. La preparación se hace con la conexión directa (sin claims JWT),
-- que es el escape documentado de los triggers 021 y 023.
--
--   ANA    ef9f8075-f79f-4cde-8d4c-5e48df0b88e6   owner real de Acme
--   JAVIER 867e813e-4ec3-4759-be0e-e861d9e90df0   platform_admin
--   DEMO   d1acedf6-f4a6-49c9-916c-05e60e5b0218   platform_admin
--   CUARTO ed627279-2761-4828-bd79-e1393d76472e   platform_admin
--   ACME   35fe4e45-f546-415e-b2e1-01017c200f7f   active, buyer
--
-- Para los escenarios de equipo, JAVIER pasa temporalmente a `user` + admin de
-- Acme, y DEMO a `user` + member de Acme.
--
-- No se usa service_role en ninguna prueba de comportamiento.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1-2. ORGANIZATIONS: la propietaria edita lo ordinario, no lo privilegiado
-- ═════════════════════════════════════════════════════════════════════════════

begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';

  do $$
  declare e text;
  begin
    -- 1. Campos ordinarios: permitido
    begin
      update public.organizations
         set phone='+34900000000', email='contacto@acme.test', website='https://acme.test',
             city='Valencia', address='Calle Prueba 1', name='Acme Distribución S.L.'
       where id='35fe4e45-f546-415e-b2e1-01017c200f7f';
      insert into r select '1','owner edita campos ordinarios', (phone='+34900000000'), 'phone='||phone
        from public.organizations where id='35fe4e45-f546-415e-b2e1-01017c200f7f';
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('1','owner edita campos ordinarios',false,'BLOQUEADO — FALLO: '||e); end;

    -- 2a. plan_id: denegado
    begin
      update public.organizations set plan_id=(select id from public.plans order by price_monthly desc limit 1)
       where id='35fe4e45-f546-415e-b2e1-01017c200f7f';
      insert into r values ('2a','owner cambia plan_id',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=RETURNED_SQLSTATE;
      insert into r values ('2a','owner cambia plan_id',true,'DENEGADO '||e); end;

    -- 2b. subscription_status: denegado
    begin
      update public.organizations set subscription_status='active'
       where id='35fe4e45-f546-415e-b2e1-01017c200f7f';
      insert into r values ('2b','owner cambia subscription_status',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=RETURNED_SQLSTATE;
      insert into r values ('2b','owner cambia subscription_status',true,'DENEGADO '||e); end;

    -- 2c. status: denegado
    begin
      update public.organizations set status='pending'
       where id='35fe4e45-f546-415e-b2e1-01017c200f7f';
      insert into r values ('2c','owner cambia organizations.status',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=RETURNED_SQLSTATE;
      insert into r values ('2c','owner cambia organizations.status',true,'DENEGADO '||e); end;

    -- 2d. commercial_profile: denegado
    begin
      update public.organizations set commercial_profile='buyer_seller'
       where id='35fe4e45-f546-415e-b2e1-01017c200f7f';
      insert into r values ('2d','owner cambia commercial_profile',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=RETURNED_SQLSTATE;
      insert into r values ('2d','owner cambia commercial_profile',true,'DENEGADO '||e); end;
  end $$;

  select * from r order by n;
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3-5. ALTA DE MIEMBROS por la propietaria
-- ═════════════════════════════════════════════════════════════════════════════

begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  -- Preparación: los candidatos dejan de ser platform_admin para no activar el
  -- escape del trigger cuando actúen como clientes.
  update public.profiles set role='user'
   where id in ('867e813e-4ec3-4759-be0e-e861d9e90df0','d1acedf6-f4a6-49c9-916c-05e60e5b0218');

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';

  do $$
  declare e text;
  begin
    -- 3. owner crea member
    begin
      insert into public.organization_members(organization_id,user_id,role,org_role,status,can_buy,can_sell)
      values ('35fe4e45-f546-415e-b2e1-01017c200f7f','d1acedf6-f4a6-49c9-916c-05e60e5b0218',
              'client_member','member','active',false,false);
      insert into r values ('3','owner crea member',true,'PERMITIDO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('3','owner crea member',false,'BLOQUEADO — FALLO: '||e); end;

    -- 4. owner crea admin
    begin
      insert into public.organization_members(organization_id,user_id,role,org_role,status,can_buy,can_sell)
      values ('35fe4e45-f546-415e-b2e1-01017c200f7f','867e813e-4ec3-4759-be0e-e861d9e90df0',
              'client_member','admin','active',false,false);
      insert into r values ('4','owner crea admin',true,'PERMITIDO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('4','owner crea admin',false,'BLOQUEADO — FALLO: '||e); end;

    -- 5. owner NO crea otro owner
    begin
      insert into public.organization_members(organization_id,user_id,role,org_role,status,can_buy,can_sell)
      values ('35fe4e45-f546-415e-b2e1-01017c200f7f','ed627279-2761-4828-bd79-e1393d76472e',
              'client_owner','owner','active',false,false);
      insert into r values ('5','owner crea OTRO owner',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=RETURNED_SQLSTATE;
      insert into r values ('5','owner crea OTRO owner',true,'DENEGADO '||e); end;

    -- 5b. escritura dual incoherente: denegada
    begin
      insert into public.organization_members(organization_id,user_id,role,org_role,status,can_buy,can_sell)
      values ('35fe4e45-f546-415e-b2e1-01017c200f7f','ed627279-2761-4828-bd79-e1393d76472e',
              'client_owner','member','active',false,false);
      insert into r values ('5b','alta con role legacy incoherente',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=RETURNED_SQLSTATE;
      insert into r values ('5b','alta con role legacy incoherente',true,'DENEGADO '||e); end;

    -- 5c. techo comercial: Acme es `buyer`, no puede conceder can_sell
    begin
      insert into public.organization_members(organization_id,user_id,role,org_role,status,can_buy,can_sell)
      values ('35fe4e45-f546-415e-b2e1-01017c200f7f','ed627279-2761-4828-bd79-e1393d76472e',
              'client_member','member','active',false,true);
      insert into r values ('5c','alta con can_sell en organizacion buyer',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=RETURNED_SQLSTATE;
      insert into r values ('5c','alta con can_sell en organizacion buyer',true,'DENEGADO '||e); end;
  end $$;

  select * from r order by n;
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6-8. ALTA Y GESTIÓN por un ADMINISTRADOR de organización
-- ═════════════════════════════════════════════════════════════════════════════

begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;

  update public.profiles set role='user'
   where id in ('867e813e-4ec3-4759-be0e-e861d9e90df0','d1acedf6-f4a6-49c9-916c-05e60e5b0218',
                'ed627279-2761-4828-bd79-e1393d76472e');
  -- JAVIER = admin de Acme, DEMO = member de Acme
  insert into public.organization_members(organization_id,user_id,role,org_role,status,can_buy,can_sell)
  values ('35fe4e45-f546-415e-b2e1-01017c200f7f','867e813e-4ec3-4759-be0e-e861d9e90df0','client_member','admin','active',false,false),
         ('35fe4e45-f546-415e-b2e1-01017c200f7f','d1acedf6-f4a6-49c9-916c-05e60e5b0218','client_member','member','active',false,false);

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"867e813e-4ec3-4759-be0e-e861d9e90df0","role":"authenticated"}';

  do $$
  declare e text;
  begin
    -- 6. admin crea member
    begin
      insert into public.organization_members(organization_id,user_id,role,org_role,status,can_buy,can_sell)
      values ('35fe4e45-f546-415e-b2e1-01017c200f7f','ed627279-2761-4828-bd79-e1393d76472e',
              'client_member','member','active',false,false);
      insert into r values ('6','admin crea member',true,'PERMITIDO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('6','admin crea member',false,'BLOQUEADO — FALLO: '||e); end;

    -- 7. admin NO crea admin
    begin
      update public.organization_members set org_role='admin'
       where user_id='ed627279-2761-4828-bd79-e1393d76472e';
      insert into r values ('7','admin asciende a otro a admin',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=RETURNED_SQLSTATE;
      insert into r values ('7','admin asciende a otro a admin',true,'DENEGADO '||e); end;

    -- 8. admin NO modifica al owner
    begin
      update public.organization_members set can_buy=false
       where user_id='ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
      insert into r values ('8','admin modifica al owner',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=RETURNED_SQLSTATE;
      insert into r values ('8','admin modifica al owner',true,'DENEGADO '||e); end;

    -- 10. admin modifica capacidades de un member
    begin
      update public.organization_members set can_buy=true
       where user_id='d1acedf6-f4a6-49c9-916c-05e60e5b0218';
      insert into r select '10','admin modifica capacidades de member', can_buy, 'can_buy='||can_buy::text
        from public.organization_members where user_id='d1acedf6-f4a6-49c9-916c-05e60e5b0218';
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('10','admin modifica capacidades de member',false,'BLOQUEADO — FALLO: '||e); end;

    -- 11. nadie modifica su propia fila
    begin
      update public.organization_members set can_buy=true
       where user_id='867e813e-4ec3-4759-be0e-e861d9e90df0';
      insert into r select '11','admin modifica su PROPIA fila', (count(*)=0), 'filas modificadas: '||count(*)
        from public.organization_members
        where user_id='867e813e-4ec3-4759-be0e-e861d9e90df0' and can_buy;
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('11','admin modifica su PROPIA fila',true,'DENEGADO: '||e); end;

    -- 13. admin elimina member
    begin
      delete from public.organization_members where user_id='d1acedf6-f4a6-49c9-916c-05e60e5b0218';
      insert into r select '13','admin elimina member', (count(*)=0), 'quedan: '||count(*)
        from public.organization_members where user_id='d1acedf6-f4a6-49c9-916c-05e60e5b0218';
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('13','admin elimina member',false,'BLOQUEADO — FALLO: '||e); end;

    -- 15. nadie elimina al owner
    begin
      delete from public.organization_members where user_id='ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
      insert into r values ('15','admin elimina al owner',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=RETURNED_SQLSTATE;
      insert into r values ('15','admin elimina al owner',true,'DENEGADO '||e); end;
  end $$;

  select * from r order by n;
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- 9, 12, 14. GESTIÓN por la PROPIETARIA sobre admin y member
-- ═════════════════════════════════════════════════════════════════════════════

begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;

  update public.profiles set role='user'
   where id in ('867e813e-4ec3-4759-be0e-e861d9e90df0','d1acedf6-f4a6-49c9-916c-05e60e5b0218');
  insert into public.organization_members(organization_id,user_id,role,org_role,status,can_buy,can_sell)
  values ('35fe4e45-f546-415e-b2e1-01017c200f7f','867e813e-4ec3-4759-be0e-e861d9e90df0','client_member','admin','active',false,false),
         ('35fe4e45-f546-415e-b2e1-01017c200f7f','d1acedf6-f4a6-49c9-916c-05e60e5b0218','client_member','member','active',false,false);

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';

  do $$
  declare e text;
  begin
    -- 9. owner modifica capacidades de un member
    begin
      update public.organization_members set can_buy=true
       where user_id='d1acedf6-f4a6-49c9-916c-05e60e5b0218';
      insert into r select '9','owner modifica capacidades de member', can_buy, 'can_buy='||can_buy::text
        from public.organization_members where user_id='d1acedf6-f4a6-49c9-916c-05e60e5b0218';
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('9','owner modifica capacidades de member',false,'BLOQUEADO — FALLO: '||e); end;

    -- 9b. owner asciende member -> admin
    begin
      update public.organization_members set org_role='admin'
       where user_id='d1acedf6-f4a6-49c9-916c-05e60e5b0218';
      insert into r select '9b','owner asciende member a admin', (org_role='admin'), 'org_role='||org_role
        from public.organization_members where user_id='d1acedf6-f4a6-49c9-916c-05e60e5b0218';
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('9b','owner asciende member a admin',false,'BLOQUEADO — FALLO: '||e); end;

    -- 9c. owner NO puede ascender a owner
    begin
      update public.organization_members set org_role='owner'
       where user_id='d1acedf6-f4a6-49c9-916c-05e60e5b0218';
      insert into r values ('9c','owner asciende a OWNER',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=RETURNED_SQLSTATE;
      insert into r values ('9c','owner asciende a OWNER',true,'DENEGADO '||e); end;

    -- 9d. owner NO puede conceder can_sell en organizacion buyer
    begin
      update public.organization_members set can_sell=true
       where user_id='d1acedf6-f4a6-49c9-916c-05e60e5b0218';
      insert into r values ('9d','owner concede can_sell en org buyer',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=RETURNED_SQLSTATE;
      insert into r values ('9d','owner concede can_sell en org buyer',true,'DENEGADO '||e); end;

    -- 9e. nadie cambia organization_id ni user_id de una pertenencia
    begin
      update public.organization_members set user_id='ed627279-2761-4828-bd79-e1393d76472e'
       where user_id='d1acedf6-f4a6-49c9-916c-05e60e5b0218';
      insert into r values ('9e','owner cambia user_id de una pertenencia',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=RETURNED_SQLSTATE;
      insert into r values ('9e','owner cambia user_id de una pertenencia',true,'DENEGADO '||e); end;

    -- 12. owner elimina member
    begin
      delete from public.organization_members where user_id='d1acedf6-f4a6-49c9-916c-05e60e5b0218';
      insert into r select '12','owner elimina member', (count(*)=0), 'quedan: '||count(*)
        from public.organization_members where user_id='d1acedf6-f4a6-49c9-916c-05e60e5b0218';
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('12','owner elimina member',false,'BLOQUEADO — FALLO: '||e); end;

    -- 14. owner SÍ elimina admin (un admin no podría)
    begin
      delete from public.organization_members where user_id='867e813e-4ec3-4759-be0e-e861d9e90df0';
      insert into r select '14','owner elimina admin', (count(*)=0), 'quedan: '||count(*)
        from public.organization_members where user_id='867e813e-4ec3-4759-be0e-e861d9e90df0';
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('14','owner elimina admin',false,'BLOQUEADO — FALLO: '||e); end;

    -- 11b. el owner tampoco se modifica a sí mismo
    begin
      update public.organization_members set can_sell=true
       where user_id='ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
      insert into r select '11b','owner modifica su PROPIA fila', (count(*)=0), 'filas modificadas: '||count(*)
        from public.organization_members
        where user_id='ef9f8075-f79f-4cde-8d4c-5e48df0b88e6' and can_sell;
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('11b','owner modifica su PROPIA fila',true,'DENEGADO: '||e); end;
  end $$;

  select * from r order by n;
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- 14b. Un ADMIN no elimina a otro ADMIN
-- ═════════════════════════════════════════════════════════════════════════════

begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;

  update public.profiles set role='user'
   where id in ('867e813e-4ec3-4759-be0e-e861d9e90df0','d1acedf6-f4a6-49c9-916c-05e60e5b0218');
  insert into public.organization_members(organization_id,user_id,role,org_role,status,can_buy,can_sell)
  values ('35fe4e45-f546-415e-b2e1-01017c200f7f','867e813e-4ec3-4759-be0e-e861d9e90df0','client_member','admin','active',false,false),
         ('35fe4e45-f546-415e-b2e1-01017c200f7f','d1acedf6-f4a6-49c9-916c-05e60e5b0218','client_member','admin','active',false,false);

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"867e813e-4ec3-4759-be0e-e861d9e90df0","role":"authenticated"}';

  do $$
  declare e text;
  begin
    begin
      delete from public.organization_members where user_id='d1acedf6-f4a6-49c9-916c-05e60e5b0218';
      insert into r values ('14b','admin elimina a otro admin',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=RETURNED_SQLSTATE;
      insert into r values ('14b','admin elimina a otro admin',true,'DENEGADO '||e); end;
  end $$;

  select * from r;
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- 16. AISLAMIENTO ENTRE ORGANIZACIONES
-- ═════════════════════════════════════════════════════════════════════════════

begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;

  -- Segunda organización temporal con su propia propietaria
  insert into public.organizations(id,name,country,status,commercial_profile,subscription_status)
  values ('11111111-1111-1111-1111-111111111111','Empresa Externa S.L.','ES','active','buyer','trial');
  update public.profiles set role='user' where id='ed627279-2761-4828-bd79-e1393d76472e';
  insert into public.organization_members(organization_id,user_id,role,org_role,status,can_buy,can_sell)
  values ('11111111-1111-1111-1111-111111111111','ed627279-2761-4828-bd79-e1393d76472e','client_owner','owner','active',true,false);

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ed627279-2761-4828-bd79-e1393d76472e","role":"authenticated"}';

  do $$
  begin
    insert into r select '16a','externo ve Acme', (count(*)=0), 'organizaciones visibles de Acme: '||count(*)
      from public.organizations where id='35fe4e45-f546-415e-b2e1-01017c200f7f';

    insert into r select '16b','externo ve miembros de Acme', (count(*)=0), 'miembros visibles: '||count(*)
      from public.organization_members where organization_id='35fe4e45-f546-415e-b2e1-01017c200f7f';

    update public.organizations set phone='+34666666666' where id='35fe4e45-f546-415e-b2e1-01017c200f7f';
    insert into r select '16c','externo edita Acme', (count(*)=0), 'filas modificadas: '||count(*)
      from public.organizations
      where id='35fe4e45-f546-415e-b2e1-01017c200f7f' and phone='+34666666666';

    begin
      insert into public.organization_members(organization_id,user_id,role,org_role,status,can_buy,can_sell)
      values ('35fe4e45-f546-415e-b2e1-01017c200f7f','d1acedf6-f4a6-49c9-916c-05e60e5b0218','client_member','member','active',false,false);
      insert into r values ('16d','externo da de alta en Acme',false,'SE PERMITIO — FALLO');
    exception when others then
      insert into r values ('16d','externo da de alta en Acme',true,'DENEGADO'); end;

    insert into r select '16e','externo ve su PROPIA organizacion', (count(*)=1), 'visibles: '||count(*)
      from public.organizations where id='11111111-1111-1111-1111-111111111111';
  end $$;

  select * from r order by n;
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- 17-18. SUSCRIPCIONES
-- ═════════════════════════════════════════════════════════════════════════════
--
-- La tabla está vacía y la aplicación NO la consulta: el plan del panel sale de
-- organizations.plan_id -> plans. Se comprueba que el propietario puede leerla
-- (por si en el futuro se puebla) y que ningún cliente puede escribirla.

begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';

  do $$
  begin
    insert into r select '17','owner lee subscriptions sin error', true, 'filas visibles: '||count(*)
      from public.subscriptions where organization_id='35fe4e45-f546-415e-b2e1-01017c200f7f';

    begin
      insert into public.subscriptions(organization_id, plan_id, status)
      values ('35fe4e45-f546-415e-b2e1-01017c200f7f',(select id from public.plans limit 1),'active');
      insert into r values ('18','cliente crea suscripcion',false,'SE PERMITIO — FALLO');
    exception when others then
      insert into r values ('18','cliente crea suscripcion',true,'DENEGADO'); end;
  end $$;

  select * from r order by n;
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- 19-21. SOPORTE
-- ═════════════════════════════════════════════════════════════════════════════

begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';

  do $$
  declare v_id uuid; e text;
  declare e text;
  begin
    -- 19. usuario crea su propio ticket
    begin
      insert into public.support_tickets(user_id, organization_id, subject, message, category, priority, status)
      values ('ef9f8075-f79f-4cde-8d4c-5e48df0b88e6','35fe4e45-f546-415e-b2e1-01017c200f7f',
              'prueba 6B3','mensaje','other','normal','open')
      returning id into v_id;
      insert into r values ('19','usuario crea su ticket',true,'PERMITIDO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('19','usuario crea su ticket',false,'BLOQUEADO — FALLO: '||e); end;

    -- 19b. no puede crear un ticket a nombre de otra persona
    begin
      insert into public.support_tickets(user_id, subject, message, category, priority, status)
      values ('867e813e-4ec3-4759-be0e-e861d9e90df0','suplantacion','x','other','normal','open');
      insert into r values ('19b','crea ticket a nombre de otro',false,'SE PERMITIO — FALLO');
    exception when others then
      insert into r values ('19b','crea ticket a nombre de otro',true,'DENEGADO'); end;

    -- 20. no puede cambiar el estado interno ni la respuesta
    if v_id is not null then
      update public.support_tickets set status='closed', admin_response='falso' where id=v_id;
      insert into r select '20','cliente cambia estado del ticket', (count(*)=0), 'filas modificadas: '||count(*)
        from public.support_tickets where id=v_id and status='closed';
    end if;
  end $$;

  select * from r order by n;
rollback;

-- 20b/21. Canal de reclamación: un usuario SUSPENDIDO debe poder abrir ticket.
begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;

  update public.organization_members set status='suspended'
   where user_id='ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';

  do $$
  declare e text;
  begin
    begin
      insert into public.support_tickets(user_id, organization_id, subject, message, category, priority, status)
      values ('ef9f8075-f79f-4cde-8d4c-5e48df0b88e6','35fe4e45-f546-415e-b2e1-01017c200f7f',
              'reclamacion','me han suspendido','account','high','open');
      insert into r values ('20b','SUSPENDIDO abre ticket de su organizacion',true,'PERMITIDO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('20b','SUSPENDIDO abre ticket de su organizacion',false,'BLOQUEADO — FALLO: '||e); end;

    -- 21. pero ya no ve los tickets del resto de la organización
    insert into r select '21','suspendido ve tickets ajenos de su org', (count(*)=0), 'ajenos visibles: '||count(*)
      from public.support_tickets
      where organization_id='35fe4e45-f546-415e-b2e1-01017c200f7f'
        and user_id <> 'ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
  end $$;

  select * from r order by n;
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- 22-23. PLATFORM ADMIN y TRIGGERS
-- ═════════════════════════════════════════════════════════════════════════════

begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"867e813e-4ec3-4759-be0e-e861d9e90df0","role":"authenticated"}';

  do $$
  declare e text;
  begin
    -- 22a. ve todas las organizaciones y miembros
    insert into r select '22a','admin ve todas las organizaciones', (count(*)>=1), 'visibles: '||count(*)
      from public.organizations;

    -- 22b. puede cambiar columnas privilegiadas
    begin
      update public.organizations set commercial_profile='buyer_seller', subscription_status='active'
       where id='35fe4e45-f546-415e-b2e1-01017c200f7f';
      insert into r select '22b','admin cambia columnas privilegiadas', (commercial_profile='buyer_seller'),
        'commercial_profile='||commercial_profile
        from public.organizations where id='35fe4e45-f546-415e-b2e1-01017c200f7f';
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('22b','admin cambia columnas privilegiadas',false,'BLOQUEADO — FALLO: '||e); end;

    -- 22c. puede gestionar miembros sin las restricciones de cliente
    begin
      update public.organization_members set can_sell=true
       where user_id='ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
      insert into r select '22c','admin gestiona al owner de una organizacion', can_sell, 'can_sell='||can_sell::text
        from public.organization_members where user_id='ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('22c','admin gestiona al owner de una organizacion',false,'BLOQUEADO — FALLO: '||e); end;

    -- 23. el trigger updated_at sigue funcionando
    insert into r select '23','trigger updated_at operativo', (updated_at > created_at), 'updated_at avanzo'
      from public.organizations where id='35fe4e45-f546-415e-b2e1-01017c200f7f';
  end $$;

  select * from r order by n;
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- 26-32. PLATFORM_ADMIN FRENTE A LAS INVARIANTES ESTRUCTURALES
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Un administrador de plataforma tiene más AUTORIZACIÓN, pero las INVARIANTES
-- se le aplican igual: no puede corromper el modelo desde la aplicación.

begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"867e813e-4ec3-4759-be0e-e861d9e90df0","role":"authenticated"}';

  do $$
  declare e text;
  begin
    -- 26. NO puede crear un segundo propietario en Acme, que ya tiene uno
    begin
      insert into public.organization_members(organization_id,user_id,role,org_role,status,can_buy,can_sell)
      values ('35fe4e45-f546-415e-b2e1-01017c200f7f','d1acedf6-f4a6-49c9-916c-05e60e5b0218',
              'client_owner','owner','active',false,false);
      insert into r values ('26','platform_admin crea SEGUNDO owner',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('26','platform_admin crea SEGUNDO owner',true,'DENEGADO: '||e); end;

    -- 27. NO puede degradar al propietario único
    begin
      update public.organization_members set org_role='admin', role='client_member'
       where user_id='ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
      insert into r values ('27','platform_admin degrada al unico owner',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('27','platform_admin degrada al unico owner',true,'DENEGADO: '||e); end;

    -- 28. NO puede suspender la pertenencia del propietario
    begin
      update public.organization_members set status='suspended'
       where user_id='ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
      insert into r values ('28','platform_admin suspende al unico owner',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('28','platform_admin suspende al unico owner',true,'DENEGADO: '||e); end;

    -- 29. NO puede eliminar al propietario
    begin
      delete from public.organization_members where user_id='ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
      insert into r values ('29','platform_admin elimina al unico owner',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('29','platform_admin elimina al unico owner',true,'DENEGADO: '||e); end;

    -- 30. Escritura incoherente: es EXACTAMENTE lo que hace hoy
    --     addOrganizationMember al elegir "client_owner" desde /admin.
    begin
      insert into public.organization_members(organization_id,user_id,role,invited_by)
      values ('35fe4e45-f546-415e-b2e1-01017c200f7f','d1acedf6-f4a6-49c9-916c-05e60e5b0218',
              'client_owner','867e813e-4ec3-4759-be0e-e861d9e90df0');
      insert into r values ('30','platform_admin escribe role/org_role incoherente',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('30','platform_admin escribe role/org_role incoherente',true,'DENEGADO: '||e); end;

    -- 30b. Alta coherente de member: SÍ debe funcionar
    begin
      insert into public.organization_members(organization_id,user_id,role,org_role,status,can_buy,can_sell)
      values ('35fe4e45-f546-415e-b2e1-01017c200f7f','d1acedf6-f4a6-49c9-916c-05e60e5b0218',
              'client_member','member','active',false,false);
      insert into r values ('30b','platform_admin da de alta member coherente',true,'PERMITIDO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('30b','platform_admin da de alta member coherente',false,'BLOQUEADO — FALLO: '||e); end;

    -- 31. Identificadores estructurales inmutables, también para platform_admin
    begin
      update public.organization_members set organization_id='35fe4e45-f546-415e-b2e1-01017c200f7f',
             user_id='ed627279-2761-4828-bd79-e1393d76472e'
       where user_id='d1acedf6-f4a6-49c9-916c-05e60e5b0218';
      insert into r values ('31','platform_admin cambia user_id de una pertenencia',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('31','platform_admin cambia user_id de una pertenencia',true,'DENEGADO: '||e); end;

    -- 32. Techo comercial: Acme es `buyer`, no admite can_sell ni para plataforma
    begin
      update public.organization_members set can_sell=true
       where user_id='d1acedf6-f4a6-49c9-916c-05e60e5b0218';
      insert into r values ('32','platform_admin concede can_sell en org buyer',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('32','platform_admin concede can_sell en org buyer',true,'DENEGADO: '||e); end;
  end $$;

  select * from r order by n;
rollback;

-- 33. Un platform_admin SÍ puede crear el PRIMER propietario de una
--     organización huérfana. Es la reparación legítima.
begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;

  insert into public.organizations(id,name,country,status,commercial_profile,subscription_status)
  values ('22222222-2222-2222-2222-222222222222','Organizacion Huerfana S.L.','ES','active','buyer','trial');

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"867e813e-4ec3-4759-be0e-e861d9e90df0","role":"authenticated"}';

  do $$
  declare e text;
  begin
    begin
      insert into public.organization_members(organization_id,user_id,role,org_role,status,can_buy,can_sell)
      values ('22222222-2222-2222-2222-222222222222','d1acedf6-f4a6-49c9-916c-05e60e5b0218',
              'client_owner','owner','active',true,false);
      insert into r values ('33','platform_admin crea PRIMER owner de org huerfana',true,'PERMITIDO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('33','platform_admin crea PRIMER owner de org huerfana',false,'BLOQUEADO — FALLO: '||e); end;

    -- 33b. Y ya no puede crear un segundo en esa misma organización.
    begin
      insert into public.organization_members(organization_id,user_id,role,org_role,status,can_buy,can_sell)
      values ('22222222-2222-2222-2222-222222222222','ed627279-2761-4828-bd79-e1393d76472e',
              'client_owner','owner','active',false,false);
      insert into r values ('33b','platform_admin crea SEGUNDO owner tras el primero',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('33b','platform_admin crea SEGUNDO owner tras el primero',true,'DENEGADO: '||e); end;
  end $$;

  select * from r order by n;
rollback;

-- 34. El ÍNDICE ÚNICO es la garantía frente a concurrencia: aunque se
--     desactivara el trigger, el motor sigue impidiendo dos propietarios.
begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  insert into public.organizations(id,name,country,status,commercial_profile,subscription_status)
  values ('33333333-3333-3333-3333-333333333333','Prueba Indice S.L.','ES','active','buyer','trial');

  alter table public.organization_members disable trigger members_enforce_rules;

  do $$
  declare e text;
  begin
    insert into public.organization_members(organization_id,user_id,role,org_role,status)
    values ('33333333-3333-3333-3333-333333333333','d1acedf6-f4a6-49c9-916c-05e60e5b0218','client_owner','owner','active');
    begin
      insert into public.organization_members(organization_id,user_id,role,org_role,status)
      values ('33333333-3333-3333-3333-333333333333','ed627279-2761-4828-bd79-e1393d76472e','client_owner','owner','active');
      insert into r values ('34','indice unico impide dos owners SIN trigger',false,'SE PERMITIO — FALLO');
    exception when unique_violation then
      insert into r values ('34','indice unico impide dos owners SIN trigger',true,'DENEGADO por indice unico'); end;
  end $$;

  alter table public.organization_members enable trigger members_enforce_rules;
  select * from r;
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- 24-25. TODO REVERTIDO Y CONTEOS REALES
-- ═════════════════════════════════════════════════════════════════════════════

select
  (select count(*) from public.profiles)                              as perfiles,
  (select count(*) from public.profiles where role='platform_admin')  as admins,
  (select count(*) from public.profiles where status='active')        as perfiles_active,
  (select count(*) from public.organizations)                         as organizaciones,
  (select count(*) from public.organization_members)                  as miembros,
  (select count(*) from public.rfqs)                                  as rfqs,
  (select count(*) from public.rfq_responses)                         as respuestas,
  (select count(*) from public.suppliers)                             as proveedores,
  (select count(*) from public.support_tickets)                       as tickets,
  (select count(*) from public.subscriptions)                         as suscripciones,
  (select count(*) from pg_policies where schemaname='public')        as policies,
  ((select count(*) from public.profiles) = 4
   and (select count(*) from public.profiles where role='platform_admin') = 3
   and (select count(*) from public.organizations) = 1
   and (select count(*) from public.organization_members) = 1
   and (select count(*) from public.rfqs) = 3
   and (select count(*) from public.rfq_responses) = 2
   and (select count(*) from public.suppliers) = 12288
   and (select count(*) from public.support_tickets) = 1
   and (select count(*) from public.subscriptions) = 0
   and (select count(*) from pg_policies where schemaname='public') = 53) as ok;

-- Acme y la pertenencia de Ana exactamente como estaban.
select (status='active' and commercial_profile='buyer') as ok, 'Acme intacta' as caso,
       status, commercial_profile
from public.organizations where id='35fe4e45-f546-415e-b2e1-01017c200f7f';

select (org_role='owner' and role='client_owner' and status='active'
        and can_buy and not can_sell) as ok, 'pertenencia de Ana intacta' as caso
from public.organization_members where user_id='ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';

-- La organización temporal del escenario 16 no debe existir.
select (count(*)=0) as ok, 'organizacion temporal revertida' as caso
from public.organizations where id='11111111-1111-1111-1111-111111111111';
