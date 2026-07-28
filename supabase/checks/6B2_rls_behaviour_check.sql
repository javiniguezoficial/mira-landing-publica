-- Verificación de COMPORTAMIENTO de las migraciones 021 y 022 — Bloque 6B.2
--
-- Ejecutar DESPUÉS de aplicar ambas migraciones.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CÓMO FUNCIONA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Cada escenario va en su propia transacción BEGIN … ROLLBACK. Dentro de ella:
--
--   1. se ajustan estados con la conexión directa (sin claims JWT), que es el
--      único contexto en el que el trigger de 021 permite tocar role/status;
--   2. `set local role authenticated` + `set local request.jwt.claims` emulan
--      exactamente lo que hace PostgREST con una sesión real;
--   3. `rollback` deshace TODO, incluidos los ajustes de preparación.
--
-- NO se crean usuarios en Auth: se reutilizan las identidades existentes y se
-- alteran sus estados solo dentro de la transacción.
--
-- NO se usa service_role para ninguna prueba de comportamiento.
--
-- Cada consulta devuelve una columna `ok` que debe ser `true`.
--
-- Identidades (verificar que siguen vigentes antes de ejecutar):
--   Ana    ef9f8075-f79f-4cde-8d4c-5e48df0b88e6  user,           owner de Acme
--   Javier 867e813e-4ec3-4759-be0e-e861d9e90df0  platform_admin, sin organización
--   Acme   35fe4e45-f546-415e-b2e1-01017c200f7f  active, buyer

\set ana    '''ef9f8075-f79f-4cde-8d4c-5e48df0b88e6'''
\set javier '''867e813e-4ec3-4759-be0e-e861d9e90df0'''
\set acme   '''35fe4e45-f546-415e-b2e1-01017c200f7f'''

-- ═════════════════════════════════════════════════════════════════════════════
-- 1-3. Integridad de profiles (migración 021)
-- ═════════════════════════════════════════════════════════════════════════════

-- 1. Ana NO puede cambiar su propio status.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  do $$
  begin
    begin
      update public.profiles set status = 'suspended'
      where id = 'ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
      raise exception 'FALLO test 1: Ana pudo cambiar su propio status';
    exception when insufficient_privilege then
      raise notice 'OK test 1: cambio de status denegado';
    end;
  end $$;
rollback;

-- 2. Ana NO puede autopromoverse a platform_admin.
--    Este es exactamente el vector explotable que corrige 021.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  do $$
  begin
    begin
      update public.profiles set role = 'platform_admin'
      where id = 'ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
      raise exception 'FALLO test 2: Ana pudo autopromoverse a platform_admin';
    exception when insufficient_privilege then
      raise notice 'OK test 2: autopromocion denegada';
    end;
  end $$;
rollback;

-- 3. Ana SÍ puede cambiar un campo ordinario, y el rollback lo revierte.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  update public.profiles set phone = '+34000000000'
  where id = 'ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
  select (phone = '+34000000000') as ok, 'test 3: campo ordinario editable' as caso
  from public.profiles where id = 'ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
rollback;
-- Comprobación posterior al rollback: el teléfono NO quedó modificado.
select (phone is distinct from '+34000000000') as ok, 'test 3b: rollback efectivo' as caso
from public.profiles where id = 'ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';

-- ═════════════════════════════════════════════════════════════════════════════
-- 4-5. is_platform_admin() y el estado del administrador
-- ═════════════════════════════════════════════════════════════════════════════

-- 4. Administrador ACTIVO sí lo es.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"867e813e-4ec3-4759-be0e-e861d9e90df0","role":"authenticated"}';
  select public.is_platform_admin() as ok, 'test 4: admin activo' as caso;
rollback;

-- 5. Administrador SUSPENDIDO deja de serlo.
begin;
  update public.profiles set status = 'suspended'
  where id = '867e813e-4ec3-4759-be0e-e861d9e90df0';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"867e813e-4ec3-4759-be0e-e861d9e90df0","role":"authenticated"}';
  select (not public.is_platform_admin()) as ok, 'test 5: admin suspendido' as caso;
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6-8. Pertenencia y estado de organización
-- ═════════════════════════════════════════════════════════════════════════════

-- 6. Miembro activo de organización activa.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  select public.is_org_member('35fe4e45-f546-415e-b2e1-01017c200f7f') as ok,
         'test 6: miembro activo' as caso;
rollback;

-- 7. Pertenencia `suspended` pierde el acceso. Se comprueba también `invited`.
begin;
  update public.organization_members set status = 'suspended'
  where user_id = 'ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  select (not public.is_org_member('35fe4e45-f546-415e-b2e1-01017c200f7f')) as ok,
         'test 7: pertenencia suspended' as caso;
rollback;

begin;
  update public.organization_members set status = 'invited'
  where user_id = 'ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  select (not public.is_org_member('35fe4e45-f546-415e-b2e1-01017c200f7f')) as ok,
         'test 7b: pertenencia invited' as caso;
rollback;

-- 8. Organización `suspended` invalida la pertenencia, aunque el miembro esté
--    activo. Se comprueba también `pending`.
begin;
  update public.organizations set status = 'suspended'
  where id = '35fe4e45-f546-415e-b2e1-01017c200f7f';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  select (not public.is_org_member('35fe4e45-f546-415e-b2e1-01017c200f7f'))
         and (not public.is_org_owner('35fe4e45-f546-415e-b2e1-01017c200f7f'))
         and (not public.can_buy_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f')) as ok,
         'test 8: organizacion suspended' as caso;
rollback;

begin;
  update public.organizations set status = 'pending'
  where id = '35fe4e45-f546-415e-b2e1-01017c200f7f';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  select (not public.is_org_member('35fe4e45-f546-415e-b2e1-01017c200f7f')) as ok,
         'test 8b: organizacion pending' as caso;
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- 9-12. Roles organizativos
-- ═════════════════════════════════════════════════════════════════════════════

-- 9. Owner canónico (org_role='owner', sin legacy).
begin;
  update public.organization_members set org_role = 'owner', role = 'client_member'
  where user_id = 'ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  select public.is_org_owner('35fe4e45-f546-415e-b2e1-01017c200f7f')
         and public.is_org_admin('35fe4e45-f546-415e-b2e1-01017c200f7f') as ok,
         'test 9: owner canonico' as caso;
rollback;

-- 10. Owner legacy (role='client_owner', org_role degradado a 'member').
begin;
  update public.organization_members set org_role = 'member', role = 'client_owner'
  where user_id = 'ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  select public.is_org_owner('35fe4e45-f546-415e-b2e1-01017c200f7f')
         and public.is_org_admin('35fe4e45-f546-415e-b2e1-01017c200f7f') as ok,
         'test 10: owner legacy compatible' as caso;
rollback;

-- 11. Admin satisface is_org_admin pero NO is_org_owner.
begin;
  update public.organization_members set org_role = 'admin', role = 'client_member'
  where user_id = 'ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  select public.is_org_admin('35fe4e45-f546-415e-b2e1-01017c200f7f')
         and (not public.is_org_owner('35fe4e45-f546-415e-b2e1-01017c200f7f')) as ok,
         'test 11: admin' as caso;
rollback;

-- 12. Member no es admin ni owner. `client_member` legacy tampoco asciende.
begin;
  update public.organization_members set org_role = 'member', role = 'client_member'
  where user_id = 'ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  select public.is_org_member('35fe4e45-f546-415e-b2e1-01017c200f7f')
         and (not public.is_org_admin('35fe4e45-f546-415e-b2e1-01017c200f7f'))
         and (not public.is_org_owner('35fe4e45-f546-415e-b2e1-01017c200f7f')) as ok,
         'test 12: member' as caso;
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- 13-16. Capacidades comerciales, limitadas por el perfil de la organización
-- ═════════════════════════════════════════════════════════════════════════════

-- 13. Buyer con can_buy=true SÍ compra. (Es el estado real de Ana hoy.)
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  select public.can_buy_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f') as ok,
         'test 13: buyer + can_buy' as caso;
rollback;

-- 14. Seller con can_buy=true NO compra: el perfil comercial es el techo.
begin;
  update public.organizations set commercial_profile = 'seller'
  where id = '35fe4e45-f546-415e-b2e1-01017c200f7f';
  update public.organization_members set can_buy = true
  where user_id = 'ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  select (not public.can_buy_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f')) as ok,
         'test 14: seller no compra' as caso;
rollback;

-- 15. Seller con can_sell=true SÍ vende.
begin;
  update public.organizations set commercial_profile = 'seller'
  where id = '35fe4e45-f546-415e-b2e1-01017c200f7f';
  update public.organization_members set can_sell = true
  where user_id = 'ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  select public.can_sell_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f') as ok,
         'test 15: seller + can_sell' as caso;
rollback;

-- 16. Buyer con can_sell=true NO vende.
begin;
  update public.organization_members set can_sell = true
  where user_id = 'ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  select (not public.can_sell_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f')) as ok,
         'test 16: buyer no vende' as caso;
rollback;

-- 16b. buyer_seller admite ambas capacidades.
begin;
  update public.organizations set commercial_profile = 'buyer_seller'
  where id = '35fe4e45-f546-415e-b2e1-01017c200f7f';
  update public.organization_members set can_buy = true, can_sell = true
  where user_id = 'ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ef9f8075-f79f-4cde-8d4c-5e48df0b88e6","role":"authenticated"}';
  select public.can_buy_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f')
         and public.can_sell_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f') as ok,
         'test 16b: buyer_seller' as caso;
rollback;

-- 16c. Un platform_admin sin pertenencia NO es miembro, ni compra, ni vende.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"867e813e-4ec3-4759-be0e-e861d9e90df0","role":"authenticated"}';
  select (not public.is_org_member('35fe4e45-f546-415e-b2e1-01017c200f7f'))
         and (not public.can_buy_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f'))
         and (not public.can_sell_in_org('35fe4e45-f546-415e-b2e1-01017c200f7f'))
         and public.is_platform_admin() as ok,
         'test 16c: admin no hereda pertenencia' as caso;
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- 17. anon no puede ejecutar las funciones privilegiadas
-- ═════════════════════════════════════════════════════════════════════════════

select
  p.proname as funcion,
  (not has_function_privilege('anon', p.oid, 'EXECUTE')) as ok
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_platform_admin','is_org_member','is_org_owner',
                    'is_org_admin','can_buy_in_org','can_sell_in_org',
                    'bootstrap_first_platform_admin','handle_new_user',
                    'prevent_privileged_profile_change','rls_auto_enable')
order by p.proname;

-- ═════════════════════════════════════════════════════════════════════════════
-- 18. Los triggers siguen funcionando
-- ═════════════════════════════════════════════════════════════════════════════

-- set_updated_at sobre organizations: la conexión directa no dispara el
-- trigger de profiles, así que se usa otra tabla con el mismo trigger.
begin;
  update public.organizations set city = 'Ciudad de prueba'
  where id = '35fe4e45-f546-415e-b2e1-01017c200f7f';
  select (updated_at > created_at) as ok, 'test 18: set_updated_at activo' as caso
  from public.organizations where id = '35fe4e45-f546-415e-b2e1-01017c200f7f';
rollback;

-- El trigger de profiles permite el cambio privilegiado desde conexión directa
-- (sin claims), que es el escape documentado para migraciones y mantenimiento.
begin;
  update public.profiles set status = 'suspended'
  where id = 'ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
  select (status = 'suspended') as ok, 'test 18b: escape de mantenimiento' as caso
  from public.profiles where id = 'ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';
rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- 19. Estado final: nada ha cambiado
-- ═════════════════════════════════════════════════════════════════════════════

select
  (select count(*) from public.profiles)                               as perfiles,
  (select count(*) from public.profiles where role='platform_admin')   as admins,
  (select count(*) from public.profiles where status='active')         as perfiles_activos,
  (select count(*) from public.organizations)                          as organizaciones,
  (select count(*) from public.organization_members)                   as pertenencias,
  (select count(*) from public.rfqs)                                   as rfqs,
  (select count(*) from public.rfq_responses)                          as respuestas,
  (select count(*) from public.suppliers)                              as proveedores,
  (select count(*) from pg_policies where schemaname='public')         as policies,
  ((select count(*) from public.profiles) = 4
   and (select count(*) from public.profiles where role='platform_admin') = 3
   and (select count(*) from public.profiles where status='active') = 4
   and (select count(*) from public.organizations) = 1
   and (select count(*) from public.organization_members) = 1
   and (select count(*) from public.rfqs) = 3
   and (select count(*) from public.rfq_responses) = 2
   and (select count(*) from public.suppliers) = 12288
   and (select count(*) from pg_policies where schemaname='public') = 52) as ok;

-- Y que Ana conserva exactamente su configuración de partida.
select (role = 'user' and status = 'active') as ok, 'Ana intacta' as caso
from public.profiles where id = 'ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';

select (org_role = 'owner' and role = 'client_owner'
        and status = 'active' and can_buy and not can_sell) as ok,
       'pertenencia de Ana intacta' as caso
from public.organization_members where user_id = 'ef9f8075-f79f-4cde-8d4c-5e48df0b88e6';

select (status = 'active' and commercial_profile = 'buyer') as ok,
       'Acme intacta' as caso
from public.organizations where id = '35fe4e45-f546-415e-b2e1-01017c200f7f';
