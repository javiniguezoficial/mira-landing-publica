-- ═════════════════════════════════════════════════════════════════════════════
-- 054 · El registro público se activa solo
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ── La regla de producto que cambia ─────────────────────────────────────────
--
-- Hasta aquí, toda alta desde la landing nacía `pending` y esperaba a que una
-- persona la activara (026). El QA del 14-09 enseñó la consecuencia real: una
-- cuenta con el correo confirmado, su empresa creada, su membresía de
-- propietario activa y las capacidades correctas veía «Esta organización no
-- está activa actualmente» y no podía entrar en ninguna parte.
--
-- La regla nueva: un registro público CORRECTO —correo confirmado, empresa
-- validada, plan del catálogo— queda operativo de inmediato. No hay aprobación
-- administrativa obligatoria en el autoservicio. La aprobación manual sigue
-- existiendo para el alta ADMINISTRATIVA, que conserva su comportamiento.
--
-- Conviene tener presente qué es cada cosa, porque el incidente nació de
-- confundirlas:
--
--   organizations.status        → concede o deniega el acceso. ES la puerta.
--   plan_id / requested_plan_id → plan concedido / plan solicitado.
--   subscription_status         → `trial`. Etiqueta: no bloquea nada.
--   plan_approved_by/at         → rastro de quién refrendó el plan a mano.
--
-- `trial` NUNCA significó «sin acceso»: hoy mismo operan con normalidad cuatro
-- organizaciones `active` + `trial`. Lo que cerraba la puerta era `status`.
--
-- ── Por qué esto NO es un cambio de una línea ───────────────────────────────
--
-- `enforce_membership_rules` (026) solo deja que alguien se inserte a sí mismo
-- como `owner` en la rama de ARRANQUE, y esa rama exigía que la organización
-- estuviera `pending`. Cambiar solo la RPC habría roto el registro entero: el
-- trigger habría respondido «No se puede crear ni ascender a propietario desde
-- la gestión de equipo» (42501) en cada alta nueva.
--
-- Por eso esta migración toca TRES funciones y unos datos, en este orden:
--
--   1. protect_organization_columns  — la activación en autoservicio no exige
--                                      un aprobador humano (y `signup_source`
--                                      pasa a ser columna protegida);
--   2. enforce_membership_rules      — el arranque se ata a la TRANSACCIÓN;
--   3. create_organization_with_owner— la landing nace `active` con su plan;
--   4. backfill                      — la única organización que quedó atrapada.
--
-- El orden importa: el backfill del punto 4 es un UPDATE `pending → active` y
-- tiene que encontrarse ya con la puerta del punto 1 corregida.
--
-- ── El arranque se ata a la transacción, no al estado ───────────────────────
--
-- La condición vieja («pending» + «landing» + cero miembros) tenía un flanco:
-- `organization_members.user_id` es ON DELETE CASCADE, así que al borrar a un
-- propietario su organización queda sin miembros. Cualquier persona autenticada
-- podía entonces reclamarla como propia. Hoy eso alcanza solo a organizaciones
-- `pending` —vacías—, pero con la regla nueva alcanzaría a organizaciones
-- ACTIVAS CON DATOS.
--
-- La condición nueva no mira el estado: exige que la fila de `organizations` se
-- haya insertado EN LA MISMA TRANSACCIÓN que la membresía —`o.xmin` igual al
-- identificador de transacción en curso—. El arranque deja así de ser un estado
-- reclamable y pasa a ser un instante: solo sirve a quien está creando su
-- organización ahora mismo, dentro de la RPC. De paso cierra el flanco que ya
-- existía.
--
-- AVISO PARA QUIEN TOQUE ESTO DESPUÉS: si algún día el `insert into
-- organizations` de la RPC se envuelve en un bloque `begin … exception`, pasará
-- a ejecutarse en una SUBtransacción, su `xmin` dejará de coincidir con
-- `pg_current_xact_id()` y el registro público se romperá por completo. La RPC
-- no tiene hoy ningún manejador de excepciones, y no debe tenerlo.
--
-- ── Correo confirmado ───────────────────────────────────────────────────────
--
-- La activación automática se concede solo si el propietario tiene el correo
-- verificado. Hoy es redundante —sin confirmar no hay sesión, y sin sesión la
-- RPC ni arranca—, pero deja la garantía escrita aquí y no en un ajuste de
-- Supabase Auth que alguien podría cambiar: si las confirmaciones se apagaran,
-- un correo inventado no se llevaría una organización activa. Sin confirmar se
-- cae al comportamiento de siempre (`pending`), nunca a un estado roto.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1 · La activación en autoservicio no necesita aprobador
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Dos cambios sobre el cuerpo de la 027:
--
--   · activar sigue exigiendo PLAN siempre; el APROBADOR solo se exige cuando
--     la organización no viene de la landing. Sin esto, una organización de
--     autoservicio suspendida no podría reactivarse nunca sin inventarse un
--     aprobador, y el backfill de más abajo sería imposible;
--   · `signup_source` entra en la lista de columnas protegidas. La regla de
--     arriba se apoya en ese valor, así que dejarlo editable por el propietario
--     habría sido dejar la puerta con la llave puesta. Nadie lo escribe fuera
--     de la RPC: no aparece en OWNER_EDITABLE_ORG_COLUMNS ni en ninguna acción.

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
  if tg_op = 'UPDATE'
     and new.status = 'active'
     and old.status is distinct from 'active' then

    if new.plan_id is null then
      raise exception 'Para activar la organización hay que confirmar antes el plan asignado.'
        using errcode = '23514';
    end if;

    -- 054 — el alta de autoservicio no pasa por aprobación: su plan es el que
    -- la persona eligió en la landing y nadie tiene que refrendarlo.
    if new.plan_approved_by is null
       and coalesce(new.signup_source, '') <> 'landing' then
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
     and new.signup_source       is not distinct from old.signup_source
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
    'Solo un administrador de plataforma puede cambiar el plan, la suscripción, el estado, el perfil comercial, el origen del alta o los módulos de una organización.'
    using errcode = '42501';
end;
$$;

comment on function public.protect_organization_columns() is
  '054 — columnas de plataforma de `organizations` (plan, suscripción, estado, '
  'perfil comercial, origen del alta y módulos): solo las cambia un administrador '
  'o el service_role. Activar exige plan SIEMPRE; exige además aprobador humano '
  'salvo en las altas de autoservicio (signup_source = landing), que no pasan '
  'por aprobación.';

revoke all on function public.protect_organization_columns() from public, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2 · El arranque del propietario se ata a la transacción
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Único cambio sobre el cuerpo de la 026: la condición de ARRANQUE. Donde decía
-- «la organización está pending y viene de la landing» ahora dice «la
-- organización viene de la landing y se acaba de crear en esta transacción».
-- Todo lo demás —bloque A de autorización, bloque B de invariantes— es idéntico.

create or replace function public.enforce_membership_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid              uuid    := auth.uid();
  v_jwt_role         text    := auth.role();
  v_fila             record  := coalesce(new, old);
  v_admin_plataforma boolean;
  v_es_owner         boolean;
  v_perfil           text;
  v_legacy_esperado  text;
  v_owner_existente  uuid;
  v_arranque         boolean := false;
begin
  -- ── ESCAPE ÚNICO: conexión SQL directa ────────────────────────────────────
  if v_uid is null and coalesce(v_jwt_role, '') = '' then
    return v_fila;
  end if;

  v_admin_plataforma := (v_jwt_role = 'service_role') or public.is_platform_admin();
  v_es_owner         := public.is_org_owner(v_fila.organization_id);

  -- ── ARRANQUE (026, reescrito en 054) ──────────────────────────────────────
  -- Primer propietario de una organización que se está creando AHORA.
  --
  -- `o.xmin = pg_current_xact_id()::xid` es la condición central: la fila de la
  -- organización tiene que haberse insertado en esta misma transacción. No es
  -- un estado que se pueda esperar fuera —una organización abandonada sin
  -- miembros ya no es reclamable por nadie—, sino el instante del alta dentro
  -- de `create_organization_with_owner`.
  if tg_op = 'INSERT' and new.org_role = 'owner' and new.user_id = v_uid then
    select not exists (
             select 1 from public.organization_members om
              where om.organization_id = new.organization_id
           )
           and exists (
             select 1 from public.organizations o
              where o.id            = new.organization_id
                and o.signup_source = 'landing'
                and o.xmin          = pg_current_xact_id()::xid
           )
      into v_arranque;
  end if;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- BLOQUE A — AUTORIZACIÓN DEL ACTOR
  -- ═══════════════════════════════════════════════════════════════════════════
  if not v_admin_plataforma and not v_arranque then

    if tg_op in ('INSERT', 'UPDATE') then
      if new.org_role = 'owner' or new.role = 'client_owner' then
        raise exception 'No se puede crear ni ascender a propietario desde la gestión de equipo.'
          using errcode = '42501';
      end if;

      if new.org_role = 'admin' and not v_es_owner then
        raise exception 'Solo el propietario puede conceder el rol de administrador.'
          using errcode = '42501';
      end if;
    end if;

    if tg_op = 'UPDATE' then
      if old.org_role = 'admin' and not v_es_owner then
        raise exception 'Solo el propietario puede modificar la pertenencia de un administrador.'
          using errcode = '42501';
      end if;
    end if;

    if tg_op = 'DELETE' then
      if old.org_role = 'admin' and not v_es_owner then
        raise exception 'Solo el propietario puede eliminar a un administrador.'
          using errcode = '42501';
      end if;
    end if;
  end if;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- BLOQUE B — INVARIANTES ESTRUCTURALES
  -- ═══════════════════════════════════════════════════════════════════════════

  if tg_op = 'UPDATE' then
    if new.id              is distinct from old.id
       or new.organization_id is distinct from old.organization_id
       or new.user_id         is distinct from old.user_id
       or new.invited_by      is distinct from old.invited_by then
      raise exception 'Los identificadores estructurales de una pertenencia son inmutables (id, organization_id, user_id, invited_by).'
        using errcode = '23514';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then

    v_legacy_esperado := case new.org_role
                           when 'owner'  then 'client_owner'
                           when 'admin'  then 'client_member'
                           when 'member' then 'client_member'
                         end;

    if v_legacy_esperado is null then
      raise exception 'org_role no reconocido: %. Valores admitidos: owner, admin, member.', new.org_role
        using errcode = '23514';
    end if;

    if new.role is distinct from v_legacy_esperado then
      raise exception 'Escritura incoherente: org_role=% exige role=%, se recibió role=%.',
        new.org_role, v_legacy_esperado, coalesce(new.role, '(null)')
        using errcode = '23514';
    end if;

    if new.org_role = 'owner'
       and (tg_op = 'INSERT' or old.org_role is distinct from 'owner') then

      perform 1 from public.organizations
        where id = new.organization_id
        for update;

      select om.user_id into v_owner_existente
        from public.organization_members om
       where om.organization_id = new.organization_id
         and om.org_role        = 'owner'
         and om.id             <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
       limit 1;

      if v_owner_existente is not null then
        raise exception 'La organización ya tiene un propietario. La transferencia de propiedad es una operación específica que todavía no está implementada.'
          using errcode = '23505';
      end if;
    end if;

    select commercial_profile into v_perfil
      from public.organizations where id = new.organization_id;

    if new.can_buy and coalesce(v_perfil,'') not in ('buyer', 'buyer_seller') then
      raise exception 'La organización no tiene perfil comprador: no se puede conceder can_buy.'
        using errcode = '23514';
    end if;

    if new.can_sell and coalesce(v_perfil,'') not in ('seller', 'buyer_seller') then
      raise exception 'La organización no tiene perfil vendedor: no se puede conceder can_sell.'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.org_role = 'owner' then
    if new.org_role is distinct from 'owner' then
      raise exception 'No se puede degradar al propietario: la organización quedaría sin ninguno.'
        using errcode = '23514';
    end if;
    if new.status is distinct from 'active' then
      raise exception 'No se puede desactivar la pertenencia del propietario: la organización quedaría sin propietario activo.'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' and old.org_role = 'owner' then
    raise exception 'No se puede eliminar al propietario de la organización.'
      using errcode = '23514';
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.user_id = v_uid then
    raise exception 'No se puede modificar ni eliminar la propia pertenencia.'
      using errcode = '42501';
  end if;

  return v_fila;
end;
$$;

comment on function public.enforce_membership_rules() is
  '054 — reglas de pertenencia. El ARRANQUE del primer propietario ya no depende '
  'del estado de la organización sino de la TRANSACCIÓN: solo vale dentro del '
  'mismo `create_organization_with_owner` que acaba de insertarla (o.xmin = '
  'pg_current_xact_id()). Una organización sin miembros no es reclamable por nadie.';

revoke all on function public.enforce_membership_rules() from public, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3 · La landing crea la organización ya operativa
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Cambios respecto de la 053, todos en la rama NO administrativa:
--
--   · `v_status` pasa de 'pending' a 'active' cuando el correo está confirmado;
--   · `plan_id` se concede ya (el plan validado contra el catálogo activo);
--   · `subscription_start` se sella con now();
--   · `plan_approved_by` / `plan_approved_at` siguen NULL: nadie aprobó nada.
--
-- Intactos: el candado de concurrencia de la 052, la idempotencia, la matriz de
-- capacidades de la 053, las validaciones, la autorización, `security definer`,
-- `search_path` y los permisos. El alta ADMINISTRATIVA no cambia en nada.

create or replace function public.create_organization_with_owner(
  p_name              text,
  p_plan_slug         text,
  p_commercial_profile text  default 'buyer',
  p_cif_nif           text   default null,
  p_country           text   default 'ES',
  p_phone             text   default null,
  p_owner_user_id     uuid   default null,
  p_status            text   default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid    := auth.uid();
  v_es_admin   boolean := public.is_platform_admin();
  v_owner      uuid;
  v_plan_id    uuid;
  v_status     text;
  v_source     text;
  v_org        uuid;
  v_existente  uuid;
  v_can_buy    boolean;
  v_can_sell   boolean;
  v_confirmado boolean;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión para crear una organización.'
      using errcode = '42501';
  end if;

  if v_es_admin then
    v_owner := coalesce(p_owner_user_id, v_uid);
  else
    if p_owner_user_id is not null and p_owner_user_id <> v_uid then
      raise exception 'No puedes crear una organización para otra persona.'
        using errcode = '42501';
    end if;
    v_owner := v_uid;
  end if;

  if not exists (select 1 from public.profiles where id = v_owner) then
    raise exception 'El usuario indicado no existe.' using errcode = '23503';
  end if;

  -- 052 — serializa las altas CONCURRENTES del mismo propietario. Sin esto,
  -- dos llamadas simultáneas (callback + primer login, o un doble clic) pueden
  -- pasar ambas la comprobación de abajo antes de que ninguna inserte, y crear
  -- dos empresas. El candado es por-usuario y muere con la transacción.
  perform pg_advisory_xact_lock(hashtextextended('org_signup:' || v_owner::text, 0));

  select om.organization_id into v_existente
    from public.organization_members om
   where om.user_id = v_owner
   limit 1;

  if v_existente is not null then
    return v_existente;
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'El nombre de la empresa es obligatorio.' using errcode = '23514';
  end if;

  if coalesce(p_commercial_profile,'') not in ('buyer', 'seller', 'buyer_seller') then
    raise exception 'El tipo comercial no es válido.' using errcode = '23514';
  end if;

  select id into v_plan_id
    from public.plans
   where slug = p_plan_slug
     and is_active = true;

  if v_plan_id is null then
    raise exception 'El plan seleccionado no está disponible.' using errcode = '23514';
  end if;

  if v_es_admin then
    v_status := coalesce(p_status, 'pending');
    if v_status not in ('pending', 'active') then
      raise exception 'El estado indicado no es válido.' using errcode = '23514';
    end if;
    v_source := 'admin';
  else
    -- 054 — autoservicio: operativa desde el primer minuto. El correo
    -- confirmado es la única condición; sin él se cae al comportamiento
    -- anterior y la activa una persona.
    select (u.email_confirmed_at is not null)
      into v_confirmado
      from auth.users u
     where u.id = v_owner;

    v_status := case when coalesce(v_confirmado, false) then 'active' else 'pending' end;
    v_source := 'landing';
  end if;

  -- 053 — `buyer_seller` compra Y vende.
  v_can_buy  := p_commercial_profile in ('buyer', 'buyer_seller');
  v_can_sell := p_commercial_profile in ('seller', 'buyer_seller');

  insert into public.organizations (
    name, cif_nif, country, phone,
    plan_id, requested_plan_id, plan_approved_by, plan_approved_at,
    status, commercial_profile, signup_source, subscription_status, subscription_start
  ) values (
    btrim(p_name), nullif(btrim(coalesce(p_cif_nif,'')),''), coalesce(nullif(btrim(coalesce(p_country,'')),''),'ES'),
    nullif(btrim(coalesce(p_phone,'')),''),
    v_plan_id,
    v_plan_id,
    case when v_es_admin then v_uid else null end,
    case when v_es_admin then now() else null end,
    v_status, p_commercial_profile, v_source, 'trial',
    case when v_es_admin then null else now() end
  )
  returning id into v_org;

  insert into public.organization_members (
    organization_id, user_id, org_role, role, status, can_buy, can_sell, invited_by
  ) values (
    v_org, v_owner, 'owner', 'client_owner', 'active', v_can_buy, v_can_sell,
    case when v_owner = v_uid then null else v_uid end
  );

  return v_org;
end;
$$;

comment on function public.create_organization_with_owner(text, text, text, text, text, text, uuid, text) is
  '054 — alta de organización con propietario único, idempotente y serializada '
  '(advisory lock por propietario, 052). Desde la landing nace ACTIVA con su '
  'plan concedido y el trial arrancado, sin aprobación administrativa, siempre '
  'que el correo esté confirmado; sin confirmar nace pending. El alta '
  'administrativa conserva su comportamiento. Capacidades del owner: buyer '
  'compra, seller vende, buyer_seller compra Y vende (053).';

-- Los permisos se vuelven a declarar, como siempre: la lección de la 029.
revoke execute on function public.create_organization_with_owner(text, text, text, text, text, text, uuid, text) from public, anon;
grant  execute on function public.create_organization_with_owner(text, text, text, text, text, text, uuid, text) to authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4 · Backfill: la organización que quedó atrapada
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Una sola fila real: la del QA del 14-09, cuyo registro público se completó
-- correctamente y se quedó `pending` con el plan sin conceder.
--
-- El conjunto se acota por CARACTERÍSTICAS ESTRUCTURALES, nunca por nombre:
-- alta de landing + pending + sin plan concedido + con plan solicitado + con un
-- propietario activo (es decir, un onboarding que SÍ se completó). Verificado
-- antes de aplicar: afecta exactamente a 1 fila.
--
-- La guarda de abajo es la red: si el conjunto creciera —porque esta migración
-- tardara en aplicarse y entraran más altas por el camino viejo—, aborta en
-- lugar de tocar filas a ciegas. Con 0 filas no hace nada, así que es
-- reejecutable sin efectos.
--
-- Lo que NO hace, a propósito: no rellena `plan_approved_by` ni
-- `plan_approved_at` (nadie aprobó nada: la fila debe quedar exactamente como
-- la habría dejado el flujo nuevo), no toca la membresía, no crea ninguna
-- organización, y no roza a las `pending` creadas desde administración —MAHOU
-- SAN MIGUEL incluida, que es `signup_source = 'admin'`.

do $$
declare
  v_n integer;
begin
  select count(*)
    into v_n
    from public.organizations o
   where o.signup_source     = 'landing'
     and o.status            = 'pending'
     and o.plan_id           is null
     and o.requested_plan_id is not null
     and exists (
       select 1
         from public.organization_members om
        where om.organization_id = o.id
          and om.org_role        = 'owner'
          and om.status          = 'active'
     );

  if v_n > 1 then
    raise exception
      'Backfill 054 abortado: el conjunto afecta a % organizaciones y se esperaba como máximo 1. Revísalo a mano antes de aplicar.', v_n
      using errcode = '23514';
  end if;

  update public.organizations o
     set status              = 'active',
         plan_id             = o.requested_plan_id,
         subscription_status = 'trial',
         subscription_start  = coalesce(o.subscription_start, now())
   where o.signup_source     = 'landing'
     and o.status            = 'pending'
     and o.plan_id           is null
     and o.requested_plan_id is not null
     and exists (
       select 1
         from public.organization_members om
        where om.organization_id = o.id
          and om.org_role        = 'owner'
          and om.status          = 'active'
     );

  raise notice '054 — organizaciones de autoservicio activadas por backfill: %', v_n;
end;
$$;
