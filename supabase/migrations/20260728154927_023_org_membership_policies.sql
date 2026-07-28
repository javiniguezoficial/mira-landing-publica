-- 023 — Policies de organizaciones, miembros, suscripciones y soporte
--
-- ═════════════════════════════════════════════════════════════════════════════
-- DEFECTOS QUE CORRIGE (verificados empíricamente con ROLLBACK)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- 1. `org_owner_update` es `USING is_org_owner(id)` SIN `WITH CHECK`. Cuando una
--    policy UPDATE no declara WITH CHECK, PostgreSQL reutiliza la expresión
--    USING, que no mira columnas. Comprobado: el propietario puede modificar por
--    PostgREST directo `plan_id`, `subscription_status`, `commercial_profile` y
--    `status`. Los cuatro intentos tuvieron éxito con la identidad real.
--
-- 2. `members_owner_insert` no restringe los valores insertados. Comprobado en
--    aislamiento: el propietario puede crear un SEGUNDO propietario.
--
-- 3. No existe policy UPDATE de `organization_members` para clientes: la
--    gestión de equipo está, de hecho, sin implementar.
--
-- 4. `members_owner_delete` permite al propietario borrar a otro propietario.
--
-- 5. Regresión latente de 022: `client_insert_own_ticket` exige
--    `is_org_member()`, que desde 022 requiere estados activos. Comprobado: un
--    usuario suspendido NO puede abrir un ticket asociado a su organización,
--    justo cuando necesita reclamar.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA: tres capas con responsabilidades distintas
-- ═════════════════════════════════════════════════════════════════════════════
--
--   POLICY     -> sobre QUÉ FILAS puede actuar cada actor.
--   TRIGGER A  -> AUTORIZACIÓN: qué puede hacer cada actor. Aquí, y solo aquí,
--                 un `platform_admin` tiene más margen que un cliente.
--   TRIGGER B  -> INVARIANTES ESTRUCTURALES: qué estados son representables.
--                 Se aplican a TODO EL MUNDO, incluido `platform_admin` y
--                 `service_role`. Un administrador de plataforma tiene más
--                 autorización funcional, pero no puede corromper el modelo.
--
-- Una policy no puede comparar OLD con NEW sin una subconsulta a su propia
-- tabla, lo que provoca recursión RLS. Un trigger BEFORE recibe ambos de forma
-- nativa. Por eso el control de columnas y de invariantes vive en triggers.
--
-- ÚNICO escape a las invariantes: la conexión SQL directa (sin claims de
-- PostgREST). Es la vía de recuperación extraordinaria y de las migraciones.
-- Quien la tiene ya puede alterar estos mismos triggers, así que bloquearla no
-- añadiría seguridad y sí impediría reparar el sistema.
--
-- NO se tocan: RFQs, respuestas de RFQ, catálogos, módulos, Auth, ni el CHECK
-- ni los valores legacy de `organization_members.role`.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. ORGANIZATIONS — protección de columnas privilegiadas
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Editables por el PROPIETARIO (datos empresariales ordinarios):
--   name, cif_nif, type, sector, annual_revenue_range, employee_count_range,
--   address, city, country, phone, email, website
--
-- Reservadas a PLATFORM_ADMIN:
--   id, plan_id, subscription_status, subscription_start, subscription_end,
--   status, commercial_profile, created_at

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
  if new.id                      is not distinct from old.id
     and new.plan_id             is not distinct from old.plan_id
     and new.subscription_status is not distinct from old.subscription_status
     and new.subscription_start  is not distinct from old.subscription_start
     and new.subscription_end    is not distinct from old.subscription_end
     and new.status              is not distinct from old.status
     and new.commercial_profile  is not distinct from old.commercial_profile
     and new.created_at          is not distinct from old.created_at then
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

comment on function public.protect_organization_columns() is
  'Impide que el propietario modifique plan_id, subscription_*, status o commercial_profile. Trigger y no policy: una policy no puede comparar OLD con NEW sin recursión RLS.';

revoke execute on function public.protect_organization_columns() from public, anon, authenticated;

drop trigger if exists organizations_protect_columns on public.organizations;

create trigger organizations_protect_columns
  before update on public.organizations
  for each row
  execute function public.protect_organization_columns();

drop policy if exists org_owner_update on public.organizations;

create policy org_owner_update on public.organizations
  for update
  using (public.is_org_owner(id))
  with check (public.is_org_owner(id));

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. ORGANIZATION_MEMBERS — unicidad del propietario
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ESTRATEGIA CONTRA PROPIETARIOS DUPLICADOS EN CONCURRENCIA
--
-- Un `select count(*)` dentro del trigger NO basta: dos transacciones
-- simultáneas pueden leer ambas "cero propietarios" antes de que ninguna haya
-- confirmado, e insertar las dos. Se combinan dos mecanismos:
--
--   (a) ÍNDICE ÚNICO PARCIAL sobre (organization_id) where org_role='owner'.
--       Es la garantía REAL: la impone el motor en el momento de escribir, es
--       atómica y no depende de que ningún código la recuerde. Dos inserciones
--       concurrentes de propietario terminan con una de las dos abortada por
--       violación de unicidad, incluso en el nivel de aislamiento por defecto.
--
--   (b) BLOQUEO EXPLÍCITO de la fila de `organizations` en el trigger antes de
--       comprobar si ya hay propietario. Serializa las creaciones dentro de la
--       misma organización, de modo que el segundo intento recibe un mensaje
--       claro ("ya existe un propietario") en lugar del error críptico de
--       unicidad. Es ergonomía, no seguridad: la seguridad la da (a).
--
-- Compatibilidad legacy: el índice se define sobre `org_role`, el modelo
-- canónico. La invariante de coherencia dual (más abajo) garantiza que
-- `role='client_owner'` y `org_role='owner'` van siempre juntos, así que
-- indexar el canónico cubre también el legacy. Verificado antes de escribir
-- esta migración: la única fila existente es coherente
-- (org_role='owner' + role='client_owner') y ninguna organización tiene dos
-- propietarios, de modo que el índice se crea sin conflicto.

create unique index if not exists organization_members_single_owner_idx
  on public.organization_members (organization_id)
  where org_role = 'owner';

comment on index public.organization_members_single_owner_idx is
  'Como máximo un propietario por organización. Garantía a nivel de motor frente a inserciones concurrentes.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. ORGANIZATION_MEMBERS — autorización e invariantes
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Decisión: un ADMINISTRADOR DE ORGANIZACIÓN **no** puede crear otros
-- administradores. Solo el propietario concede o retira el rol `admin`. Quien
-- puede nombrar administradores puede multiplicar su propio poder; una
-- organización debe tener una única raíz de confianza, y así el propietario
-- siempre puede degradar a un administrador sin que este haya podido crear una
-- red paralela.

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
begin
  -- ── ESCAPE ÚNICO: conexión SQL directa ────────────────────────────────────
  -- Sin contexto de PostgREST no hay actor al que responsabilizar. Es la vía de
  -- migración y de recuperación extraordinaria. Ni `service_role` ni
  -- `platform_admin` entran aquí: ambos operan a través de la aplicación.
  if v_uid is null and coalesce(v_jwt_role, '') = '' then
    return v_fila;
  end if;

  v_admin_plataforma := (v_jwt_role = 'service_role') or public.is_platform_admin();
  v_es_owner         := public.is_org_owner(v_fila.organization_id);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- BLOQUE A — AUTORIZACIÓN DEL ACTOR
  -- Solo aquí `platform_admin` tiene un trato distinto.
  -- ═══════════════════════════════════════════════════════════════════════════
  if not v_admin_plataforma then

    if tg_op in ('INSERT', 'UPDATE') then
      -- Un cliente NUNCA crea ni asciende a propietario, ni siquiera cuando la
      -- organización no tiene ninguno. Esa reparación es de la plataforma.
      if new.org_role = 'owner' or new.role = 'client_owner' then
        raise exception 'No se puede crear ni ascender a propietario desde la gestión de equipo.'
          using errcode = '42501';
      end if;

      -- Solo el propietario concede el rol de administrador.
      if new.org_role = 'admin' and not v_es_owner then
        raise exception 'Solo el propietario puede conceder el rol de administrador.'
          using errcode = '42501';
      end if;
    end if;

    if tg_op = 'UPDATE' then
      -- Un administrador no gestiona a otro administrador; solo el propietario.
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
  -- Se aplican SIEMPRE: cliente, service_role y platform_admin por igual.
  -- Definen qué estados son representables, no quién puede actuar.
  -- ═══════════════════════════════════════════════════════════════════════════

  -- B.1 a B.4 — Identificadores inmutables tras la inserción.
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

    -- B.5 a B.8 — Coherencia entre el modelo canónico y el legacy.
    -- Mientras exista la columna `role`, cada `org_role` tiene exactamente un
    -- valor legacy admisible. Esto impide que una escritura parcial deje la
    -- fila en un estado ambiguo que las funciones de autorización tendrían que
    -- desempatar adivinando.
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

    -- B.9 y B.12 — Como máximo un propietario por organización.
    -- El índice único es la garantía; este bloque aporta el mensaje claro y
    -- serializa la comprobación bloqueando la fila de la organización.
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

    -- B.13 — Techo comercial: las capacidades del miembro no pueden exceder el
    -- perfil comercial de la organización. Mismo criterio que can_buy_in_org()
    -- y can_sell_in_org(). Defensa en profundidad.
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

  -- B.10, B.11 y B.14 — Una organización nunca se queda sin propietario por una
  -- operación ordinaria. Como el índice garantiza que hay a lo sumo uno, basta
  -- con proteger esa fila: degradarla, suspenderla o borrarla dejaría cero.
  --
  -- Aplica también a `platform_admin`: la transferencia de propiedad será una
  -- operación atómica propia, no un UPDATE suelto. La reparación extraordinaria
  -- sigue disponible por conexión SQL directa.
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
  -- Para los clientes lo impide además la policy; aquí se cubre también a
  -- `platform_admin`, que podría pertenecer a una organización de forma
  -- excepcional.
  if tg_op in ('UPDATE', 'DELETE') and old.user_id = v_uid then
    raise exception 'No se puede modificar ni eliminar la propia pertenencia.'
      using errcode = '42501';
  end if;

  return v_fila;
end;
$$;

comment on function public.enforce_membership_rules() is
  'Bloque A: autorización (platform_admin tiene más margen). Bloque B: invariantes estructurales que se aplican a todos, incluido platform_admin. Único escape: conexión SQL directa.';

revoke execute on function public.enforce_membership_rules() from public, anon, authenticated;

drop trigger if exists members_enforce_rules on public.organization_members;

create trigger members_enforce_rules
  before insert or update or delete on public.organization_members
  for each row
  execute function public.enforce_membership_rules();

-- ── Policies ────────────────────────────────────────────────────────────────
--
-- `members_same_org_select` y `members_admin_all` se conservan sin cambios.

drop policy if exists members_owner_insert on public.organization_members;

create policy members_admin_insert on public.organization_members
  for insert
  with check (public.is_org_admin(organization_id));

-- Nueva: hasta ahora ningún cliente podía actualizar pertenencias.
create policy members_admin_update on public.organization_members
  for update
  using (public.is_org_admin(organization_id) and user_id <> auth.uid())
  with check (public.is_org_admin(organization_id) and user_id <> auth.uid());

drop policy if exists members_owner_delete on public.organization_members;

create policy members_admin_delete on public.organization_members
  for delete
  using (public.is_org_admin(organization_id) and user_id <> auth.uid());

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. SUBSCRIPTIONS — sin cambios, deliberadamente
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Auditado: la aplicación NO consulta esta tabla y está vacía (0 filas). El
-- plan y el estado que muestra el panel salen de `organizations.plan_id` ->
-- `plans` y de `organizations.subscription_status`.
--
-- Ampliar el SELECT a administradores o miembros añadiría superficie sin
-- funcionalidad que la justifique. Se conservan `subscriptions_admin_all` y
-- `subscriptions_owner_select`. Ningún cliente puede escribir.

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. SUPPORT_TICKETS — preservar el canal de reclamación
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.belongs_to_org_any_status(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = org_id
      and om.user_id         = auth.uid()
  );
$$;

comment on function public.belongs_to_org_any_status(uuid) is
  'Pertenencia sin exigir estados activos. Uso EXCLUSIVO del canal de soporte, para que un usuario suspendido pueda reclamar. No usar en ninguna otra policy.';

revoke execute on function public.belongs_to_org_any_status(uuid) from public, anon;
grant  execute on function public.belongs_to_org_any_status(uuid) to authenticated, service_role;

drop policy if exists client_insert_own_ticket on public.support_tickets;

create policy client_insert_own_ticket on public.support_tickets
  for insert
  with check (
    auth.uid() = user_id
    and (organization_id is null or public.belongs_to_org_any_status(organization_id))
  );

-- `client_select_own_tickets` se conserva TAL CUAL: que un miembro activo vea
-- los tickets de su organización es el comportamiento actual del producto.
-- Anotado como decisión a revisar, no como defecto de seguridad.
--
-- Los clientes siguen SIN policy UPDATE ni DELETE.

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Limpieza pendiente de 022
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Devuelven tipo `trigger`, así que PostgREST no puede invocarlas por RPC y no
-- eran explotables, pero no hay razón para mantener el grant. Independiente del
-- resto: su rollback es un GRANT.

revoke execute on function public.set_updated_at()            from public, anon, authenticated;
revoke execute on function public.handle_ticket_resolved_at() from public, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Orden de reversión. Las policies y los triggers referencian a las funciones,
-- así que las funciones se eliminan AL FINAL.
--
--   -- 1. support_tickets
--   drop policy if exists client_insert_own_ticket on public.support_tickets;
--   create policy client_insert_own_ticket on public.support_tickets
--     for insert
--     with check ((auth.uid() = user_id)
--                 AND ((organization_id IS NULL) OR is_org_member(organization_id)));
--
--   -- 2. organization_members: policies, trigger e índice
--   drop policy if exists members_admin_insert on public.organization_members;
--   drop policy if exists members_admin_update on public.organization_members;
--   drop policy if exists members_admin_delete on public.organization_members;
--
--   create policy members_owner_insert on public.organization_members
--     for insert with check (is_org_owner(organization_id));
--
--   create policy members_owner_delete on public.organization_members
--     for delete using ((user_id <> auth.uid()) AND is_org_owner(organization_id));
--
--   drop trigger if exists members_enforce_rules on public.organization_members;
--   drop index  if exists public.organization_members_single_owner_idx;
--
--   -- 3. organizations
--   drop policy if exists org_owner_update on public.organizations;
--   create policy org_owner_update on public.organizations
--     for update using (is_org_owner(id));            -- sin WITH CHECK, como estaba
--
--   drop trigger if exists organizations_protect_columns on public.organizations;
--
--   -- 4. funciones, una vez ninguna policy ni trigger las referencia
--   drop function if exists public.enforce_membership_rules();
--   drop function if exists public.protect_organization_columns();
--   drop function if exists public.belongs_to_org_any_status(uuid);
--
--   -- 5. grants de las funciones de trigger
--   grant execute on function public.set_updated_at() to public;
--   grant execute on function public.handle_ticket_resolved_at() to public;
--
-- Estado resultante: las 52 policies originales con sus definiciones exactas,
-- sin índice de unicidad y sin los tres triggers/funciones nuevos.
--
-- ADVERTENCIA: revertir reabre los cinco defectos de la cabecera, en particular
-- que el propietario pueda cambiarse el plan y crear un segundo propietario.
