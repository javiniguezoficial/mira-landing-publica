-- Verificación de COMPORTAMIENTO de la migración 024 — Bloque 6B.4
--
-- Ejecutar DESPUÉS de aplicar 024. Cada escenario va en su propia transacción
-- BEGIN … ROLLBACK y no deja ningún dato.
--
-- IDENTIDADES: no se crean usuarios en Auth. Se reutilizan los cuatro perfiles
-- reales y, dentro de cada transacción, se les da el papel que necesita el
-- escenario. La preparación usa la conexión directa (sin claims), que es el
-- escape documentado de los triggers 021, 023 y 024.
--
--   ANA    ef9f8075-f79f-4cde-8d4c-5e48df0b88e6   owner de Acme, can_buy=true
--   JAVIER 867e813e-4ec3-4759-be0e-e861d9e90df0   platform_admin
--   DEMO   d1acedf6-f4a6-49c9-916c-05e60e5b0218   platform_admin
--   CUARTO ed627279-2761-4828-bd79-e1393d76472e   platform_admin
--   ACME   35fe4e45-f546-415e-b2e1-01017c200f7f   active, buyer
--
-- Las 3 RFQs reales están en estado 'open' y NO se modifican en ningún momento.
--
-- No se usa service_role en ninguna prueba de comportamiento.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1-6. CREACIÓN según capacidad
-- ═════════════════════════════════════════════════════════════════════════════

-- 1-3. Owner, admin y member CON can_buy crean cotizaciones.
begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  update public.profiles set role='user'
   where id in ('867e813e-4ec3-4759-be0e-e861d9e90df0','d1acedf6-f4a6-49c9-916c-05e60e5b0218');
  insert into public.organization_members(organization_id,user_id,role,org_role,status,can_buy,can_sell)
  values ('35fe4e45-f546-415e-b2e1-01017c200f7f','867e813e-4ec3-4759-be0e-e861d9e90df0','client_member','admin','active',true,false),
         ('35fe4e45-f546-415e-b2e1-01017c200f7f','d1acedf6-f4a6-49c9-916c-05e60e5b0218','client_member','member','active',true,false);

  set local role authenticated;
  do $$
  declare e text;
  begin
    -- 1. owner
    perform set_config('request.jwt.claims','{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}',true);
    begin
      insert into public.rfqs(organization_id,created_by,rfq_kind,request_name,deadline,country,status,unit_format,lead_time,sale_currency)
      values ('35fe4e45-f546-415e-b2e1-01017c200f7f','ef9f8075-f79f-4cde-8d4c-5e48df0b88e6','product','De owner','2026-12-31','ES','draft','kg','7d','EUR');
      insert into r values ('1','owner con can_buy crea',true,'PERMITIDO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('1','owner con can_buy crea',false,'BLOQUEADO — FALLO: '||e); end;

    -- 2. admin
    perform set_config('request.jwt.claims','{"sub":"867e813e-4ec3-4759-be0e-e861d9e90df0","role":"authenticated"}',true);
    begin
      insert into public.rfqs(organization_id,created_by,rfq_kind,request_name,deadline,country,status,unit_format,lead_time,sale_currency)
      values ('35fe4e45-f546-415e-b2e1-01017c200f7f','867e813e-4ec3-4759-be0e-e861d9e90df0','product','De admin','2026-12-31','ES','draft','kg','7d','EUR');
      insert into r values ('2','admin con can_buy crea',true,'PERMITIDO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('2','admin con can_buy crea',false,'BLOQUEADO — FALLO: '||e); end;

    -- 3. member
    perform set_config('request.jwt.claims','{"sub":"d1acedf6-f4a6-49c9-916c-05e60e5b0218","role":"authenticated"}',true);
    begin
      insert into public.rfqs(organization_id,created_by,rfq_kind,request_name,deadline,country,status,unit_format,lead_time,sale_currency)
      values ('35fe4e45-f546-415e-b2e1-01017c200f7f','d1acedf6-f4a6-49c9-916c-05e60e5b0218','product','De member','2026-12-31','ES','draft','kg','7d','EUR');
      insert into r values ('3','member con can_buy crea',true,'PERMITIDO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('3','member con can_buy crea',false,'BLOQUEADO — FALLO: '||e); end;

    -- Crear para OTRO usuario o con otro created_by: denegado.
    begin
      insert into public.rfqs(organization_id,created_by,rfq_kind,request_name,deadline,country,status,unit_format,lead_time,sale_currency)
      values ('35fe4e45-f546-415e-b2e1-01017c200f7f','ef9f8075-f79f-4cde-8d4c-5e48df0b88e6','product','Suplantada','2026-12-31','ES','draft','kg','7d','EUR');
      insert into r values ('3b','crear con created_by ajeno',false,'SE PERMITIO — FALLO');
    exception when others then insert into r values ('3b','crear con created_by ajeno',true,'DENEGADO'); end;

    -- Crear directamente en 'open': denegado (el alta siempre es borrador).
    begin
      insert into public.rfqs(organization_id,created_by,rfq_kind,request_name,deadline,country,status,unit_format,lead_time,sale_currency)
      values ('35fe4e45-f546-415e-b2e1-01017c200f7f','d1acedf6-f4a6-49c9-916c-05e60e5b0218','product','Nace abierta','2026-12-31','ES','open','kg','7d','EUR');
      insert into r values ('3c','crear directamente en open',false,'SE PERMITIO — FALLO');
    exception when others then insert into r values ('3c','crear directamente en open',true,'DENEGADO'); end;
  end $$;
  select * from r order by n;
rollback;

-- 4-5. SIN can_buy no se crea, ni siquiera siendo owner.
begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  update public.organization_members set can_buy=false where user_id='ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  do $$
  declare e text;
  begin
    begin
      insert into public.rfqs(organization_id,created_by,rfq_kind,request_name,deadline,country,status,unit_format,lead_time,sale_currency)
      values ('35fe4e45-f546-415e-b2e1-01017c200f7f','ef9f8075-f79f-4cde-8d4c-5e48df0b88e6','product','Sin capacidad','2026-12-31','ES','draft','kg','7d','EUR');
      insert into r values ('5','owner SIN can_buy crea',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('5','owner SIN can_buy crea',true,'DENEGADO: '||e); end;

    -- 8. Pero SIGUE viendo el histórico de su organización.
    insert into r select '8','sin can_buy ve el historico', (count(*)=3), 'RFQs visibles: '||count(*)
      from public.rfqs where organization_id='35fe4e45-f546-415e-b2e1-01017c200f7f';
  end $$;
  select * from r order by n;
rollback;

-- 6. Organización SELLER: no compra aunque el miembro tenga can_buy.
begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  update public.organizations set commercial_profile='seller' where id='35fe4e45-f546-415e-b2e1-01017c200f7f';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  do $$
  declare e text;
  begin
    begin
      insert into public.rfqs(organization_id,created_by,rfq_kind,request_name,deadline,country,status,unit_format,lead_time,sale_currency)
      values ('35fe4e45-f546-415e-b2e1-01017c200f7f','ef9f8075-f79f-4cde-8d4c-5e48df0b88e6','product','De vendedora','2026-12-31','ES','draft','kg','7d','EUR');
      insert into r values ('6','seller con can_buy=true crea',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('6','seller con can_buy=true crea',true,'DENEGADO'); end;
  end $$;
  select * from r;
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. AISLAMIENTO ENTRE ORGANIZACIONES
-- ═════════════════════════════════════════════════════════════════════════════

begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  insert into public.organizations(id,name,country,status,commercial_profile,subscription_status)
  values ('44444444-4444-4444-4444-444444444444','Externa S.L.','ES','active','buyer','trial');
  update public.profiles set role='user' where id='ed627279-2761-4828-bd79-e1393d76472e';
  insert into public.organization_members(organization_id,user_id,role,org_role,status,can_buy,can_sell)
  values ('44444444-4444-4444-4444-444444444444','ed627279-2761-4828-bd79-e1393d76472e','client_owner','owner','active',true,false);

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ed627279-2761-4828-bd79-e1393d76472e","role":"authenticated"}';
  do $$
  declare v_n int;
  begin
    insert into r select '7a','externo ve RFQs de Acme', (count(*)=0), 'visibles: '||count(*)
      from public.rfqs where organization_id='35fe4e45-f546-415e-b2e1-01017c200f7f';

    update public.rfqs set status='cancelled' where organization_id='35fe4e45-f546-415e-b2e1-01017c200f7f';
    get diagnostics v_n = ROW_COUNT;
    insert into r values ('7b','externo modifica RFQs de Acme', (v_n=0), 'ROW_COUNT='||v_n);

    insert into r select '7c','externo ve respuestas de Acme', (count(*)=0), 'visibles: '||count(*)
      from public.rfq_responses;
  end $$;
  select * from r order by n;
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- 9-14. GESTIÓN: la cotización es de la ORGANIZACIÓN
-- ═════════════════════════════════════════════════════════════════════════════

begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  update public.profiles set role='user'
   where id in ('867e813e-4ec3-4759-be0e-e861d9e90df0','d1acedf6-f4a6-49c9-916c-05e60e5b0218');
  insert into public.organization_members(organization_id,user_id,role,org_role,status,can_buy,can_sell)
  values ('35fe4e45-f546-415e-b2e1-01017c200f7f','867e813e-4ec3-4759-be0e-e861d9e90df0','client_member','admin','active',true,false),
         ('35fe4e45-f546-415e-b2e1-01017c200f7f','d1acedf6-f4a6-49c9-916c-05e60e5b0218','client_member','member','active',true,false);
  -- Borrador creado por el MEMBER
  insert into public.rfqs(id,organization_id,created_by,rfq_kind,request_name,deadline,country,status,unit_format,lead_time,sale_currency)
  values ('88888888-8888-8888-8888-888888888888','35fe4e45-f546-415e-b2e1-01017c200f7f','d1acedf6-f4a6-49c9-916c-05e60e5b0218','product','Borrador del member','2026-12-31','ES','draft','kg','7d','EUR');

  set local role authenticated;
  do $$
  declare v_n int; e text;
  begin
    -- 9. El OWNER edita el borrador del member (antes imposible).
    perform set_config('request.jwt.claims','{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}',true);
    update public.rfqs set request_name='editada por owner' where id='88888888-8888-8888-8888-888888888888';
    get diagnostics v_n = ROW_COUNT;
    insert into r values ('9','owner edita borrador de un member', (v_n=1), 'ROW_COUNT='||v_n);

    -- 13/14. Identificadores inmutables, también para el owner.
    begin
      update public.rfqs set organization_id='44444444-4444-4444-4444-444444444444'
       where id='88888888-8888-8888-8888-888888888888';
      insert into r values ('13','cambiar organization_id',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('13','cambiar organization_id',true,'DENEGADO: '||e); end;

    begin
      update public.rfqs set created_by='ef9f8075-f79f-4cde-8d4c-5e48df0b88e6'
       where id='88888888-8888-8888-8888-888888888888';
      insert into r values ('14','cambiar created_by',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('14','cambiar created_by',true,'DENEGADO: '||e); end;

    -- 10. El ADMIN también edita el borrador del member.
    perform set_config('request.jwt.claims','{"sub":"867e813e-4ec3-4759-be0e-e861d9e90df0","role":"authenticated"}',true);
    update public.rfqs set request_name='editada por admin' where id='88888888-8888-8888-8888-888888888888';
    get diagnostics v_n = ROW_COUNT;
    insert into r values ('10','admin edita borrador de un member', (v_n=1), 'ROW_COUNT='||v_n);

    -- 12. El propio member edita la suya.
    perform set_config('request.jwt.claims','{"sub":"d1acedf6-f4a6-49c9-916c-05e60e5b0218","role":"authenticated"}',true);
    update public.rfqs set request_name='editada por su creador' where id='88888888-8888-8888-8888-888888888888';
    get diagnostics v_n = ROW_COUNT;
    insert into r values ('12','member edita su propio borrador', (v_n=1), 'ROW_COUNT='||v_n);
  end $$;
  select * from r order by n;
rollback;

-- 11. Un member NO edita la cotización de otro member.
begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  update public.profiles set role='user'
   where id in ('d1acedf6-f4a6-49c9-916c-05e60e5b0218','ed627279-2761-4828-bd79-e1393d76472e');
  insert into public.organization_members(organization_id,user_id,role,org_role,status,can_buy,can_sell)
  values ('35fe4e45-f546-415e-b2e1-01017c200f7f','d1acedf6-f4a6-49c9-916c-05e60e5b0218','client_member','member','active',true,false),
         ('35fe4e45-f546-415e-b2e1-01017c200f7f','ed627279-2761-4828-bd79-e1393d76472e','client_member','member','active',true,false);
  insert into public.rfqs(id,organization_id,created_by,rfq_kind,request_name,deadline,country,status,unit_format,lead_time,sale_currency)
  values ('88888888-8888-8888-8888-888888888888','35fe4e45-f546-415e-b2e1-01017c200f7f','d1acedf6-f4a6-49c9-916c-05e60e5b0218','product','De otro member','2026-12-31','ES','draft','kg','7d','EUR');

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ed627279-2761-4828-bd79-e1393d76472e","role":"authenticated"}';
  do $$
  declare v_n int;
  begin
    update public.rfqs set request_name='usurpada' where id='88888888-8888-8888-8888-888888888888';
    get diagnostics v_n = ROW_COUNT;
    insert into r values ('11','member edita RFQ de otro member', (v_n=0), 'ROW_COUNT='||v_n);
    -- Pero SÍ la ve: el histórico es de la organización.
    insert into r select '11b','y sin embargo la ve', (count(*)=1), 'visibles: '||count(*)
      from public.rfqs where id='88888888-8888-8888-8888-888888888888';
  end $$;
  select * from r order by n;
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- 15-18. TRANSICIONES DE ESTADO
-- ═════════════════════════════════════════════════════════════════════════════

begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  insert into public.rfqs(id,organization_id,created_by,rfq_kind,request_name,deadline,country,status,unit_format,lead_time,sale_currency)
  values ('77777777-7777-7777-7777-777777777777','35fe4e45-f546-415e-b2e1-01017c200f7f','ef9f8075-f79f-4cde-8d4c-5e48df0b88e6','product','Para transiciones','2026-12-31','ES','draft','kg','7d','EUR');

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  do $$
  declare e text; v_n int;
  begin
    -- 17. draft -> awarded: transición inválida para el cliente.
    begin
      update public.rfqs set status='awarded' where id='77777777-7777-7777-7777-777777777777';
      insert into r values ('17','draft -> awarded (cliente)',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('17','draft -> awarded (cliente)',true,'DENEGADO: '||e); end;

    -- 17b. draft -> closed: también inválida.
    begin
      update public.rfqs set status='closed' where id='77777777-7777-7777-7777-777777777777';
      insert into r values ('17b','draft -> closed (cliente)',false,'SE PERMITIO — FALLO');
    exception when others then insert into r values ('17b','draft -> closed (cliente)',true,'DENEGADO'); end;

    -- 15. draft -> open: permitida.
    update public.rfqs set status='open' where id='77777777-7777-7777-7777-777777777777';
    get diagnostics v_n = ROW_COUNT;
    insert into r values ('15','draft -> open', (v_n=1), 'ROW_COUNT='||v_n);

    -- 15b. open -> draft: retroceso denegado.
    begin
      update public.rfqs set status='draft' where id='77777777-7777-7777-7777-777777777777';
      insert into r values ('15b','open -> draft (retroceso)',false,'SE PERMITIO — FALLO');
    exception when others then insert into r values ('15b','open -> draft (retroceso)',true,'DENEGADO'); end;

    -- 16. open -> cancelled: permitida (antes imposible: USING exigía draft).
    update public.rfqs set status='cancelled' where id='77777777-7777-7777-7777-777777777777';
    get diagnostics v_n = ROW_COUNT;
    insert into r values ('16','open -> cancelled', (v_n=1), 'ROW_COUNT='||v_n);

    -- 18. cancelled es final: no se reabre.
    begin
      update public.rfqs set status='open' where id='77777777-7777-7777-7777-777777777777';
      insert into r values ('18','cancelled -> open (reapertura)',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('18','cancelled -> open (reapertura)',true,'DENEGADO: '||e); end;
  end $$;
  select * from r order by n;
rollback;

-- 18b. `awarded` también es final, incluso para platform_admin.
begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  insert into public.rfqs(id,organization_id,created_by,rfq_kind,request_name,deadline,country,status,unit_format,lead_time,sale_currency)
  values ('77777777-7777-7777-7777-777777777777','35fe4e45-f546-415e-b2e1-01017c200f7f','ef9f8075-f79f-4cde-8d4c-5e48df0b88e6','product','Adjudicada','2026-12-31','ES','awarded','kg','7d','EUR');
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"867e813e-4ec3-4759-be0e-e861d9e90df0","role":"authenticated"}';
  do $$
  declare e text;
  begin
    begin
      update public.rfqs set status='open' where id='77777777-7777-7777-7777-777777777777';
      insert into r values ('18b','platform_admin reabre una adjudicada',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('18b','platform_admin reabre una adjudicada',true,'DENEGADO: '||e); end;
  end $$;
  select * from r;
rollback;

-- 22. platform_admin conserva sus transiciones administrativas.
begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  insert into public.rfqs(id,organization_id,created_by,rfq_kind,request_name,deadline,country,status,unit_format,lead_time,sale_currency)
  values ('77777777-7777-7777-7777-777777777777','35fe4e45-f546-415e-b2e1-01017c200f7f','ef9f8075-f79f-4cde-8d4c-5e48df0b88e6','product','Abierta','2026-12-31','ES','open','kg','7d','EUR');
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"867e813e-4ec3-4759-be0e-e861d9e90df0","role":"authenticated"}';
  do $$
  declare v_n int;
  begin
    insert into r select '22a','platform_admin ve todas las RFQs', (count(*)>=4), 'visibles: '||count(*) from public.rfqs;
    update public.rfqs set status='closed' where id='77777777-7777-7777-7777-777777777777';
    get diagnostics v_n = ROW_COUNT;
    insert into r values ('22b','platform_admin: open -> closed', (v_n=1), 'ROW_COUNT='||v_n);
    update public.rfqs set status='awarded' where id='77777777-7777-7777-7777-777777777777';
    get diagnostics v_n = ROW_COUNT;
    insert into r values ('22c','platform_admin: closed -> awarded', (v_n=1), 'ROW_COUNT='||v_n);
  end $$;
  select * from r order by n;
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- 19-21, 23. BORRADO, RESPUESTAS Y can_sell
-- ═════════════════════════════════════════════════════════════════════════════

begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  do $$
  declare v_n int; e text;
  begin
    -- 19. El cliente no borra cotizaciones: se cancelan.
    delete from public.rfqs where organization_id='35fe4e45-f546-415e-b2e1-01017c200f7f';
    get diagnostics v_n = ROW_COUNT;
    insert into r values ('19','cliente borra RFQs', (v_n=0), 'ROW_COUNT='||v_n);

    -- 20. La organización compradora VE las respuestas a sus cotizaciones.
    insert into r select '20','organizacion ve sus respuestas', (count(*)=2), 'visibles: '||count(*)
      from public.rfq_responses;

    -- 21. Pero no las crea: el portal de vendedor no existe todavía.
    begin
      insert into public.rfq_responses(rfq_id,supplier_name,price,unit,currency,status)
      values ((select id from public.rfqs limit 1),'Proveedor falso',10,'kg','EUR','received');
      insert into r values ('21','cliente inserta respuesta',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('21','cliente inserta respuesta',true,'DENEGADO'); end;

    -- 23. can_sell no habilita ningún flujo por sí solo.
    insert into r select '23','can_sell_in_org no aparece en ninguna policy', (count(*)=0),
      'policies que la usan: '||count(*)
      from pg_policies where schemaname='public'
        and (coalesce(qual,'')||coalesce(with_check,'')) like '%can_sell_in_org%';
  end $$;
  select * from r order by n;
rollback;

-- 23b. Aun con can_sell=true, no se abre ninguna vía nueva.
begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  update public.organizations set commercial_profile='buyer_seller' where id='35fe4e45-f546-415e-b2e1-01017c200f7f';
  update public.organization_members set can_sell=true where user_id='ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  do $$
  begin
    begin
      insert into public.rfq_responses(rfq_id,supplier_name,price,unit,currency,status)
      values ((select id from public.rfqs limit 1),'Como vendedora',10,'kg','EUR','received');
      insert into r values ('23b','con can_sell=true inserta respuesta',false,'SE PERMITIO — FALLO');
    exception when others then insert into r values ('23b','con can_sell=true inserta respuesta',true,'DENEGADO'); end;
  end $$;
  select * from r;
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- A. CONTENIDO PUBLICADO CONGELADO PARA TODOS
-- ═════════════════════════════════════════════════════════════════════════════
--
-- El contenido solo se escribe mientras la cotización es borrador. En cuanto se
-- publica queda congelado para el cliente Y para `platform_admin`: lo que los
-- proveedores han visto no se reescribe sin versionado ni traza.

begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  insert into public.rfqs(id,organization_id,created_by,rfq_kind,request_name,deadline,country,status,unit_format,lead_time,sale_currency)
  values ('99999999-9999-9999-9999-999999999999','35fe4e45-f546-415e-b2e1-01017c200f7f','ef9f8075-f79f-4cde-8d4c-5e48df0b88e6','product','Nombre original','2026-12-31','ES','draft','kg','7d','EUR');

  set local role authenticated;
  do $$
  declare e text; v_n int;
  begin
    -- A1. Ana (owner, can_buy) publica su propio borrador: draft -> open.
    perform set_config('request.jwt.claims','{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}',true);
    update public.rfqs set status='open' where id='99999999-9999-9999-9999-999999999999';
    get diagnostics v_n = ROW_COUNT;
    insert into r values ('A1','cliente publica su borrador', (v_n=1), 'ROW_COUNT='||v_n);

    -- A2. Ya publicada: el cliente no reescribe el contenido.
    begin
      update public.rfqs set request_name='Reescrita por el cliente'
       where id='99999999-9999-9999-9999-999999999999';
      insert into r values ('A2','cliente edita contenido de una open',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('A2','cliente edita contenido de una open',true,'DENEGADO: '||e); end;

    -- A3. `platform_admin` tampoco: dispone de transiciones, no de reescritura.
    perform set_config('request.jwt.claims','{"sub":"867e813e-4ec3-4759-be0e-e861d9e90df0","role":"authenticated"}',true);
    begin
      update public.rfqs set request_name='Reescrita por la plataforma'
       where id='99999999-9999-9999-9999-999999999999';
      insert into r values ('A3','platform_admin edita contenido de una open',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('A3','platform_admin edita contenido de una open',true,'DENEGADO: '||e); end;

    -- A4. Cualquier otro campo comercial, mismo resultado.
    begin
      update public.rfqs set target_price=999, deadline='2027-01-31',
             custom_conditions='[{"clausula":"añadida a posteriori"}]'::jsonb
       where id='99999999-9999-9999-9999-999999999999';
      insert into r values ('A4','platform_admin edita precio, plazo y condiciones',false,'SE PERMITIO — FALLO');
    exception when others then insert into r values ('A4','platform_admin edita precio, plazo y condiciones',true,'DENEGADO'); end;

    -- A5-A6. Las transiciones administrativas SÍ siguen disponibles.
    update public.rfqs set status='closed' where id='99999999-9999-9999-9999-999999999999';
    get diagnostics v_n = ROW_COUNT;
    insert into r values ('A5','platform_admin: open -> closed', (v_n=1), 'ROW_COUNT='||v_n);

    update public.rfqs set status='open' where id='99999999-9999-9999-9999-999999999999';
    get diagnostics v_n = ROW_COUNT;
    insert into r values ('A6','platform_admin: closed -> open (reapertura)', (v_n=1), 'ROW_COUNT='||v_n);

    -- A7. Reabrir devuelve el ESTADO, no la escritura del contenido histórico.
    begin
      update public.rfqs set request_name='Reescrita tras reabrir'
       where id='99999999-9999-9999-9999-999999999999';
      insert into r values ('A7','reabrir NO habilita reescribir el contenido',false,'SE PERMITIO — FALLO');
    exception when others then insert into r values ('A7','reabrir NO habilita reescribir el contenido',true,'DENEGADO'); end;

    -- A8. Después de todos los intentos, el valor original sigue intacto.
    insert into r select 'A8','el contenido conserva su valor original',
      (request_name='Nombre original' and target_price is null and deadline='2026-12-31'),
      'request_name='||request_name||' · deadline='||deadline
      from public.rfqs where id='99999999-9999-9999-9999-999999999999';
  end $$;
  select * from r order by n;
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- B. USUARIO SIN NINGUNA ORGANIZACIÓN
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Identidad temporal sin pertenencia: el cuarto perfil, degradado a `user` para
-- que `is_platform_admin()` no le abra ninguna puerta por el otro lado.

begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  update public.profiles set role='user' where id='ed627279-2761-4828-bd79-e1393d76472e';
  delete from public.organization_members where user_id='ed627279-2761-4828-bd79-e1393d76472e';

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ed627279-2761-4828-bd79-e1393d76472e","role":"authenticated"}';
  do $$
  declare v_n int; e text;
  begin
    -- B1-B2. No ve nada.
    insert into r select 'B1','sin organización ve RFQs', (count(*)=0), 'visibles: '||count(*)
      from public.rfqs;
    insert into r select 'B2','sin organización ve respuestas', (count(*)=0), 'visibles: '||count(*)
      from public.rfq_responses;

    -- B3. No crea.
    begin
      insert into public.rfqs(organization_id,created_by,rfq_kind,request_name,deadline,country,status,unit_format,lead_time,sale_currency)
      values ('35fe4e45-f546-415e-b2e1-01017c200f7f','ed627279-2761-4828-bd79-e1393d76472e','product','Sin pertenencia','2026-12-31','ES','draft','kg','7d','EUR');
      insert into r values ('B3','sin organización crea RFQ',false,'SE PERMITIO — FALLO');
    exception when others then get stacked diagnostics e=MESSAGE_TEXT;
      insert into r values ('B3','sin organización crea RFQ',true,'DENEGADO'); end;

    -- B4-B5. No modifica ni borra.
    update public.rfqs set status='cancelled'
     where organization_id='35fe4e45-f546-415e-b2e1-01017c200f7f';
    get diagnostics v_n = ROW_COUNT;
    insert into r values ('B4','sin organización modifica RFQs ajenas', (v_n=0), 'ROW_COUNT='||v_n);

    delete from public.rfqs;
    get diagnostics v_n = ROW_COUNT;
    insert into r values ('B5','sin organización borra RFQs', (v_n=0), 'ROW_COUNT='||v_n);
  end $$;
  select * from r order by n;
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- C. PUBLICACIÓN DIRECTA SIN CAPACIDAD — vector B en su forma estricta
-- ═════════════════════════════════════════════════════════════════════════════
--
-- El borrador nace legítimamente, con `can_buy=true`. Después se retira la
-- capacidad y se intenta la publicación por UPDATE directo contra PostgREST,
-- saltándose `publishRfq()`. No es el INSERT lo que se prueba aquí, sino la
-- transición: la policy de UPDATE ya no encuentra fila que tocar.

begin;
  create temp table r(n text, caso text, ok boolean, detalle text) on commit drop;
  grant all on r to authenticated;
  insert into public.rfqs(id,organization_id,created_by,rfq_kind,request_name,deadline,country,status,unit_format,lead_time,sale_currency)
  values ('66666666-6666-6666-6666-666666666666','35fe4e45-f546-415e-b2e1-01017c200f7f','ef9f8075-f79f-4cde-8d4c-5e48df0b88e6','product','Borrador legitimo','2026-12-31','ES','draft','kg','7d','EUR');

  -- La capacidad se retira DESPUÉS de crear el borrador.
  update public.organization_members set can_buy=false
   where user_id='ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  do $$
  declare v_n int;
  begin
    -- C1. Publicar por UPDATE directo: denegado por falta de capacidad.
    update public.rfqs set status='open' where id='66666666-6666-6666-6666-666666666666';
    get diagnostics v_n = ROW_COUNT;
    insert into r values ('C1','publicar sin can_buy (UPDATE directo)', (v_n=0), 'ROW_COUNT='||v_n);

    -- C2. Cancelar tampoco.
    update public.rfqs set status='cancelled' where id='66666666-6666-6666-6666-666666666666';
    get diagnostics v_n = ROW_COUNT;
    insert into r values ('C2','cancelar sin can_buy', (v_n=0), 'ROW_COUNT='||v_n);

    -- C3. Ni editar el contenido de su propio borrador.
    update public.rfqs set request_name='Editada sin capacidad'
     where id='66666666-6666-6666-6666-666666666666';
    get diagnostics v_n = ROW_COUNT;
    insert into r values ('C3','editar el propio borrador sin can_buy', (v_n=0), 'ROW_COUNT='||v_n);

    -- C4-C5. Sigue en draft y sigue siendo visible: el histórico no depende de
    -- la capacidad de comprar.
    insert into r select 'C4','la cotización sigue en draft', (status='draft'), 'status='||status
      from public.rfqs where id='66666666-6666-6666-6666-666666666666';
    insert into r select 'C5','y sigue siendo visible sin can_buy', (count(*)=1), 'visibles: '||count(*)
      from public.rfqs where id='66666666-6666-6666-6666-666666666666';
  end $$;
  select * from r order by n;
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- 24-25. INTEGRIDAD FINAL
-- ═════════════════════════════════════════════════════════════════════════════

select
  (select count(*) from public.rfqs)                     as rfqs,
  (select count(*) from public.rfq_responses)            as respuestas,
  (select string_agg(distinct status, ', ') from public.rfqs) as estados,
  (select count(*) from public.profiles)                 as perfiles,
  (select count(*) from public.profiles where role='platform_admin') as admins,
  (select count(*) from public.organizations)            as organizaciones,
  (select count(*) from public.organization_members)     as miembros,
  (select count(*) from public.suppliers)                as proveedores,
  (select count(*) from pg_policies where schemaname='public') as policies,
  ((select count(*) from public.rfqs) = 3
   and (select count(*) from public.rfq_responses) = 2
   and (select count(*) from public.profiles) = 4
   and (select count(*) from public.profiles where role='platform_admin') = 3
   and (select count(*) from public.organizations) = 1
   and (select count(*) from public.organization_members) = 1
   and (select count(*) from public.suppliers) = 12288
   and (select count(*) from pg_policies where schemaname='public') = 53) as ok;

-- Las 3 RFQs reales siguen abiertas y con su organización y creador intactos.
select id, organization_id, created_by, status,
       (status='open' and organization_id='35fe4e45-f546-415e-b2e1-01017c200f7f') as ok
from public.rfqs order by created_at;

-- Ninguna organización ni cotización de prueba persiste.
select (count(*)=0) as ok, 'organizaciones y RFQs de prueba revertidas' as caso
from public.organizations where id = '44444444-4444-4444-4444-444444444444';

select (count(*)=0) as ok, 'RFQs de prueba revertidas' as caso
from public.rfqs
where id in ('88888888-8888-8888-8888-888888888888','77777777-7777-7777-7777-777777777777',
             '99999999-9999-9999-9999-999999999999','66666666-6666-6666-6666-666666666666');
