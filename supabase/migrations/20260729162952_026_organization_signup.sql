-- 026 — Alta de organización con propietario, atómica
--
-- ═════════════════════════════════════════════════════════════════════════════
-- QUÉ RESUELVE
-- ═════════════════════════════════════════════════════════════════════════════
--
-- 1. Una organización podía crearse SIN propietario. `createOrganization` solo
--    insertaba en `organizations`; el índice `organization_members_single_owner_idx`
--    garantiza COMO MUCHO un owner, nunca AL MENOS uno. Hoy es posible tener una
--    empresa activa con cero propietarios.
--
-- 2. El registro público no creaba organización. `handle_new_user()` inserta un
--    perfil `client_member` y nada más, así que quien se registraba terminaba
--    como usuario activo sin empresa: una vía muerta.
--
-- 3. El plan llegaba sin validar. Se añade la resolución por `slug` contra
--    `public.plans` con `is_active = true`, que es la allowlist real. El
--    navegador nunca decide precio, nombre libre ni estado.
--
-- La solución es UNA función transaccional que crea organización y propietario
-- juntos o no crea nada. No se toca Stripe, ni invitaciones, ni RFQs, ni
-- Market Intelligence, ni proveedores, ni módulos.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- POR QUÉ HACE FALTA TOCAR `enforce_membership_rules`
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Su BLOQUE A prohíbe a cualquiera que no sea `platform_admin` insertar una
-- pertenencia con `org_role = 'owner'`:
--
--   'No se puede crear ni ascender a propietario desde la gestión de equipo.'
--
-- Es la regla correcta para la gestión de equipo, y NO se relaja. Lo que se
-- añade es una excepción de ARRANQUE, deliberadamente estrecha: el creador de
-- una organización recién nacida desde la landing se registra como propietario
-- de sí mismo. Las cinco condiciones deben cumplirse a la vez:
--
--   · es un INSERT;
--   · `user_id = auth.uid()` — solo puedes hacerte propietario de ti mismo;
--   · la organización tiene CERO pertenencias;
--   · su `status` es 'pending';
--   · su `signup_source` es 'landing'.
--
-- Las dos últimas cierran el hueco que de otro modo abriría la tercera: una
-- organización creada por administración lleva `signup_source = 'admin'`, así
-- que nadie puede reclamar como propia una empresa ajena que se hubiera quedado
-- sin miembros. Y como la función crea ambas filas en la misma transacción, la
-- ventana en la que esas condiciones se cumplen no es alcanzable desde fuera.
--
-- El BLOQUE B —identificadores inmutables, coherencia role/org_role, propietario
-- único y techo comercial— sigue aplicándose íntegro a esta inserción.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Origen del alta
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Deja preparada la distinción para cuando exista Stripe, sin construir nada
-- de facturación ahora. `admin` es el valor por defecto porque es como se
-- crearon las organizaciones existentes.

alter table public.organizations
  add column if not exists signup_source text not null default 'admin';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.organizations'::regclass
       and conname  = 'organizations_signup_source_check'
  ) then
    alter table public.organizations
      add constraint organizations_signup_source_check
      check (signup_source in ('landing', 'admin', 'stripe'));
  end if;
end $$;

comment on column public.organizations.signup_source is
  'Origen del alta: landing (autoservicio), admin (creada por la plataforma) o stripe (reservado, sin implementar).';

-- ═════════════════════════════════════════════════════════════════════════════
-- 1b. Plan SOLICITADO frente a plan ASIGNADO
-- ═════════════════════════════════════════════════════════════════════════════
--
-- El plan que llega de la landing es una SOLICITUD, no una concesión: viaja en
-- la metadata del registro, que el navegador escribe. Cambiar 'starter' por
-- 'enterprise' es trivial desde las herramientas del navegador.
--
-- Por eso se separan:
--
--   · `requested_plan_id` — lo que pidió el cliente. Informativo.
--   · `plan_id`           — lo que la plataforma le concede. Gobierna de verdad.
--
-- Un alta desde la landing deja `plan_id` en NULL: no se concede ningún plan
-- hasta que una persona lo confirma. Y como una organización no puede pasar a
-- `active` sin plan asignado y aprobado (ver el trigger más abajo), manipular el
-- navegador no puede terminar en un Enterprise activo por accidente.

alter table public.organizations
  add column if not exists requested_plan_id uuid references public.plans(id) on delete set null,
  add column if not exists plan_approved_by  uuid references public.profiles(id) on delete set null,
  add column if not exists plan_approved_at  timestamptz;

comment on column public.organizations.requested_plan_id is
  'Plan que el cliente solicitó al registrarse. Es una solicitud, no una concesión: nunca gobierna el acceso.';
comment on column public.organizations.plan_approved_by is
  'Administrador de plataforma que confirmó el plan asignado. Obligatorio para activar la organización.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 1c. No se activa una organización sin plan aprobado
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Se amplía `protect_organization_columns` con una condición: pasar a `active`
-- exige `plan_id` y `plan_approved_by`. Así «activar» deja de ser un botón que
-- se pueda pulsar sin mirar el plan.
--
-- Solo se comprueba en la TRANSICIÓN (`old.status` distinto de 'active'), de
-- modo que las organizaciones que ya están activas —Acme— no se ven afectadas y
-- no hace falta ningún backfill.
--
-- El resto del cuerpo es idéntico al de 023.

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
  -- ── Puerta de activación (026) ───────────────────────────────────────────
  -- Se aplica a TODOS, incluida la conexión directa: representar una
  -- organización activa sin plan concedido no debería ser posible.
  if tg_op = 'UPDATE'
     and new.status = 'active'
     and old.status is distinct from 'active' then
    if new.plan_id is null or new.plan_approved_by is null then
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
     and new.plan_approved_by    is not distinct from old.plan_approved_by then
    return new;
  end if;

  -- Conexión SQL directa: migraciones y mantenimiento.
  if v_uid is null and coalesce(v_jwt_role, '') = '' then
    return new;
  end if;

  if v_jwt_role = 'service_role' or public.is_platform_admin() then
    return new;
  end if;

  raise exception
    'Solo un administrador de plataforma puede cambiar el plan, la suscripción, el estado o el perfil comercial de una organización.'
    using errcode = '42501';
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Excepción de arranque en las reglas de pertenencia
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Se reescribe la función completa para no depender de un parche parcial. El
-- único cambio respecto a 023 es el bloque marcado como «ARRANQUE (026)».

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

  -- ── ARRANQUE (026) ────────────────────────────────────────────────────────
  -- Primer propietario de una organización recién creada desde la landing.
  if tg_op = 'INSERT' and new.org_role = 'owner' and new.user_id = v_uid then
    select not exists (
             select 1 from public.organization_members om
              where om.organization_id = new.organization_id
           )
           and exists (
             select 1 from public.organizations o
              where o.id             = new.organization_id
                and o.status         = 'pending'
                and o.signup_source  = 'landing'
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
  -- Se aplican SIEMPRE, incluido el arranque de 026.
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

  -- Nadie modifica ni elimina su propia pertenencia desde la gestión ordinaria.
  -- El arranque es un INSERT, así que no entra aquí.
  if tg_op in ('UPDATE', 'DELETE') and old.user_id = v_uid then
    raise exception 'No se puede modificar ni eliminar la propia pertenencia.'
      using errcode = '42501';
  end if;

  return v_fila;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2b. Ver la propia pertenencia, sea cual sea el estado
-- ═════════════════════════════════════════════════════════════════════════════
--
-- PROBLEMA DETECTADO ANTES DE APLICAR, verificado en remoto con ROLLBACK.
--
-- `members_same_org_select` usaba `is_org_member(organization_id)`, que exige
-- organización ACTIVA. Con una organización `pending` —que es como nace toda
-- alta desde la landing— el resultado era:
--
--   select ... from organization_members where user_id = auth.uid()  -> 0 filas
--
-- Es decir: `loadAuthContext` recibía `memberships: []`, y la persona que
-- acababa de registrar su empresa leía «Todavía no tienes una organización
-- asociada». Exactamente la mentira que 6B.5.1 se propuso eliminar, reaparecida
-- por la puerta de atrás.
--
-- La corrección es la mínima posible: cada quien puede leer SU PROPIA fila de
-- pertenencia en cualquier estado. No concede nada más —ni ver a los demás
-- miembros, ni leer la organización, ni operar—: `is_org_member()` sigue
-- gobernando todo lo demás y no se toca.
--
-- Efecto colateral, y es el deseado: una pertenencia SUSPENDIDA también se
-- vuelve legible por su titular, así que el estado `membership_suspended` de
-- 6B.5.1 por fin puede mostrarse en lugar de «no tienes organización».
--
-- El total de policies NO cambia: se sustituye una, no se añade ninguna.
--
-- La organización en sí sigue sin ser legible mientras no esté activa, de modo
-- que la pantalla muestra el estado pero no el nombre de la empresa. Es
-- deliberado: ampliar `org_members_select` daría acceso a los datos completos
-- de la empresa —CIF, plan, contacto— a alguien cuya pertenencia está en
-- entredicho, y eso excede lo que hace falta para dar un mensaje correcto.

drop policy if exists members_same_org_select on public.organization_members;

create policy members_same_org_select on public.organization_members
  for select
  using (
    public.is_org_member(organization_id)
    or user_id = auth.uid()
  );

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Alta atómica de organización y propietario
-- ═════════════════════════════════════════════════════════════════════════════
--
-- SECURITY DEFINER es imprescindible: `organizations` solo admite INSERT a
-- `platform_admin` (policy `org_admin_all`), y el alta desde la landing la hace
-- el propio usuario recién registrado. La función es, por tanto, la frontera de
-- autorización, y valida todo lo que la policy dejaría de comprobar.
--
-- Se ejecuta SIEMPRE con un usuario autenticado. Nunca con service_role desde
-- el navegador.
--
-- IDEMPOTENTE: si quien llama ya tiene una pertenencia, devuelve su organización
-- sin crear nada. Es lo que neutraliza el doble envío del formulario.

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
  v_uid       uuid    := auth.uid();
  v_es_admin  boolean := public.is_platform_admin();
  v_owner     uuid;
  v_plan_id   uuid;
  v_status    text;
  v_source    text;
  v_org       uuid;
  v_existente uuid;
  v_can_buy   boolean;
  v_can_sell  boolean;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión para crear una organización.'
      using errcode = '42501';
  end if;

  -- ── Quién será el propietario ─────────────────────────────────────────────
  -- Solo `platform_admin` puede nombrar propietario a otra persona. Un usuario
  -- normal solo puede crear su propia empresa.
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

  -- ── Idempotencia ──────────────────────────────────────────────────────────
  -- Doble envío, doble pestaña o reintento tras un timeout: si esa persona ya
  -- pertenece a una organización, se devuelve la que tiene.
  select om.organization_id into v_existente
    from public.organization_members om
   where om.user_id = v_owner
   limit 1;

  if v_existente is not null then
    return v_existente;
  end if;

  -- ── Validaciones ──────────────────────────────────────────────────────────
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'El nombre de la empresa es obligatorio.' using errcode = '23514';
  end if;

  if coalesce(p_commercial_profile,'') not in ('buyer', 'seller', 'buyer_seller') then
    raise exception 'El tipo comercial no es válido.' using errcode = '23514';
  end if;

  -- El plan se resuelve contra el catálogo real. El navegador envía un slug;
  -- ni el precio, ni el nombre, ni ningún límite salen de él.
  select id into v_plan_id
    from public.plans
   where slug = p_plan_slug
     and is_active = true;

  if v_plan_id is null then
    raise exception 'El plan seleccionado no está disponible.' using errcode = '23514';
  end if;

  -- El estado NUNCA lo decide el usuario. Desde la landing la empresa nace
  -- 'pending' y la activa una persona; solo la administración puede elegir.
  if v_es_admin then
    v_status := coalesce(p_status, 'pending');
    if v_status not in ('pending', 'active') then
      raise exception 'El estado indicado no es válido.' using errcode = '23514';
    end if;
    v_source := 'admin';
  else
    v_status := 'pending';
    v_source := 'landing';
  end if;

  -- Capacidades del propietario, coherentes con el perfil comercial. En
  -- `buyer_seller` NO se conceden las dos: vender se habilita a mano cuando
  -- exista el portal de vendedor.
  v_can_buy  := p_commercial_profile in ('buyer', 'buyer_seller');
  v_can_sell := p_commercial_profile = 'seller';

  -- ── Alta ──────────────────────────────────────────────────────────────────
  --
  -- Desde la landing el plan queda SOLICITADO y `plan_id` en NULL: el navegador
  -- no concede nada. Solo la administración asigna plan, y al hacerlo queda
  -- registrado quién lo aprobó.
  insert into public.organizations (
    name, cif_nif, country, phone,
    plan_id, requested_plan_id, plan_approved_by, plan_approved_at,
    status, commercial_profile, signup_source, subscription_status
  ) values (
    btrim(p_name), nullif(btrim(coalesce(p_cif_nif,'')),''), coalesce(nullif(btrim(coalesce(p_country,'')),''),'ES'),
    nullif(btrim(coalesce(p_phone,'')),''),
    case when v_es_admin then v_plan_id else null end,
    v_plan_id,
    case when v_es_admin then v_uid else null end,
    case when v_es_admin then now() else null end,
    v_status, p_commercial_profile, v_source, 'trial'
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
  'Crea una organización y su ÚNICO propietario en la misma transacción. Idempotente por usuario. El plan se valida contra plans.is_active y el estado nunca lo decide el usuario.';

revoke execute on function public.create_organization_with_owner(text, text, text, text, text, text, uuid, text) from public, anon;
grant  execute on function public.create_organization_with_owner(text, text, text, text, text, text, uuid, text) to authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═════════════════════════════════════════════════════════════════════════════
--
--   drop function if exists public.create_organization_with_owner(text, text, text, text, text, text, uuid, text);
--   alter table public.organizations drop constraint if exists organizations_signup_source_check;
--   alter table public.organizations
--     drop column if exists signup_source,
--     drop column if exists requested_plan_id,
--     drop column if exists plan_approved_by,
--     drop column if exists plan_approved_at;
--   drop policy if exists members_same_org_select on public.organization_members;
--   create policy members_same_org_select on public.organization_members
--     for select using (is_org_member(organization_id));
--
--   -- y restaurar con el cuerpo de 023:
--   --   · `enforce_membership_rules`     — sin `v_arranque` ni el bloque ARRANQUE (026);
--   --   · `protect_organization_columns` — sin la puerta de activación ni las dos
--   --     columnas nuevas en la comparación de «sin cambios».
--
-- Revertir reabre los dos huecos de la cabecera: organizaciones sin propietario
-- y registro público que no crea empresa.
