-- 039 — Auditoría de administración y protección del último administrador
--
-- ═════════════════════════════════════════════════════════════════════════════
-- QUÉ SE AÑADE, Y POR QUÉ TAN POCO
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Esta fase abre la gestión de usuarios, memberships, roles y capacidades desde
-- el panel de administración. Casi todas las reglas que hacen falta YA existen
-- en la base de datos desde 019–026, y se han verificado antes de escribir esto:
--
--   organization_members  · trigger `enforce_membership_rules` (023)
--                            - no se crea ni asciende a propietario salvo
--                              platform_admin y solo si la organización no
--                              tiene ninguno;
--                            - no se degrada, suspende ni elimina al
--                              propietario;
--                            - identificadores estructurales inmutables;
--                            - can_buy/can_sell acotados por
--                              organizations.commercial_profile;
--                            - nadie modifica su propia pertenencia;
--                            - coherencia obligatoria org_role ↔ role legacy.
--                          · índice único (organization_id, user_id)
--                            → una pertenencia duplicada es imposible.
--                          · índice único parcial sobre org_role='owner'
--                            → dos propietarios son imposibles.
--
--   profiles              · trigger `prevent_privileged_profile_change` (021)
--                            → solo un platform_admin ACTIVO puede cambiar
--                              `role` o `status` de un perfil.
--
-- Es decir: el modelo ya impide la escalada de privilegios y protege al
-- propietario. Añadir aquí una segunda capa de reglas duplicaría la autoridad y
-- las dos acabarían divergiendo. Esta migración se limita a las DOS cosas que
-- de verdad faltan.
--
-- ── Estado medido antes de aplicar ──────────────────────────────────────────
--
--   perfiles                          5
--   platform_admin activos            3
--   organizaciones                    2   (una sin propietario y sin miembros:
--                                          «MIRA Pricing Technologies SL»,
--                                          creada el 03/08/2026 — es un estado
--                                          legítimo, no una corrupción, y NO se
--                                          corrige aquí)
--   memberships                       1   (Ana, owner de Acme, activa)
--   memberships activas duplicadas    0
--   usuarios con varias memberships   0
--   usuarios sin organización         4
--   tickets                           2   (1 abierto)
--
-- ESTA MIGRACIÓN NO ESCRIBE, NO BORRA Y NO CORRIGE NINGÚN DATO EXISTENTE.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Registro de auditoría de administración
-- ═════════════════════════════════════════════════════════════════════════════
--
-- No existía ninguna tabla de auditoría en el esquema (comprobado: ni `audit`,
-- ni `log`, ni `event`, ni `history`). Se crea la mínima que cubre lo que esta
-- fase necesita poder responder meses después:
--
--   «¿quién sacó a esta persona de esta empresa, y cuándo?»
--   «¿quién le dio permiso de compra?»
--   «¿quién convirtió a este usuario en administrador de plataforma?»
--
-- ── Por qué SIN claves foráneas ────────────────────────────────────────────
--
-- Un registro de auditoría tiene que sobrevivir al borrado de aquello que
-- describe. Con una FK a `profiles`, borrar la cuenta de alguien arrastraría —o
-- vaciaría— justo las filas que explican qué se hizo con ella. Se guardan UUID
-- sueltos y se aceptan referencias colgantes: es el comportamiento correcto
-- para un histórico.
--
-- ── Qué NO se guarda ───────────────────────────────────────────────────────
--
-- Ni contraseñas, ni tokens, ni el perfil completo. `before`/`after` contienen
-- exclusivamente los campos de autorización que cambian —rol, estado,
-- capacidades—, que es lo que hay que poder auditar. El correo NO se copia
-- aquí: vive en `auth.users` y se resuelve al mostrar el registro.

create table if not exists public.admin_audit_log (
  id                     uuid primary key default gen_random_uuid(),

  -- Quién lo hizo. Siempre presente: estas acciones exigen sesión.
  actor_id               uuid not null,

  -- Qué hizo. Lista cerrada: un valor libre acabaría siendo inservible para
  -- filtrar y permitiría escribir cualquier cosa desde una acción futura.
  action                 text not null check (action in (
    'membership.created',
    'membership.role_changed',
    'membership.status_changed',
    'membership.capabilities_changed',
    'membership.removed',
    'profile.updated',
    'profile.platform_role_changed',
    'profile.status_changed'
  )),

  -- Sobre quién y en qué organización. `target_organization_id` es null en las
  -- acciones que solo tocan el perfil.
  target_user_id         uuid,
  target_organization_id uuid,

  -- Estado ANTES y DESPUÉS, solo de los campos de autorización afectados.
  before_state           jsonb,
  after_state            jsonb,

  -- Marca de datos de prueba. Permite crear registros de QA y localizarlos
  -- después sin confundirlos con operaciones reales.
  is_qa                  boolean not null default false,

  created_at             timestamptz not null default now()
);

comment on table public.admin_audit_log is
  'Fase 039 — histórico de operaciones de administración sobre usuarios, '
  'memberships, roles y capacidades. Sin claves foráneas a propósito: debe '
  'sobrevivir al borrado de lo que describe.';

comment on column public.admin_audit_log.is_qa is
  'Fase 039 — marca las filas generadas en pruebas. Los datos de QA se '
  'eliminan, pero si alguno quedara debe poder distinguirse de una operación real.';

-- Consultas previstas: «lo último que ha pasado», «historial de este usuario»
-- e «historial de esta empresa».
create index if not exists idx_admin_audit_created
  on public.admin_audit_log (created_at desc);

create index if not exists idx_admin_audit_target_user
  on public.admin_audit_log (target_user_id, created_at desc)
  where target_user_id is not null;

create index if not exists idx_admin_audit_target_org
  on public.admin_audit_log (target_organization_id, created_at desc)
  where target_organization_id is not null;

-- ── RLS: solo administración, y solo añadir ────────────────────────────────
--
-- Hay policy de SELECT y de INSERT. NO hay policy de UPDATE ni de DELETE, y esa
-- ausencia es la protección: con RLS activa, lo que ninguna policy permite está
-- prohibido. Un registro de auditoría que se puede reescribir no es auditoría.
--
-- El INSERT exige `actor_id = auth.uid()`: nadie puede atribuir una acción a
-- otra persona, ni siquiera un administrador.

alter table public.admin_audit_log enable row level security;

drop policy if exists audit_admin_select on public.admin_audit_log;
create policy audit_admin_select on public.admin_audit_log
  for select using (public.is_platform_admin());

drop policy if exists audit_admin_insert on public.admin_audit_log;
create policy audit_admin_insert on public.admin_audit_log
  for insert with check (
    public.is_platform_admin() and actor_id = auth.uid()
  );

-- El revoke de `anon` es EXPRESO, no solo de PUBLIC: el esquema tiene un
-- `alter default privileges … to anon` y revocar de PUBLIC no lo alcanza (029).
revoke all on table public.admin_audit_log from public;
revoke all on table public.admin_audit_log from anon;
grant select, insert on table public.admin_audit_log to authenticated;
grant all on table public.admin_audit_log to service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. El último administrador de plataforma no se puede quedar sin sistema
-- ═════════════════════════════════════════════════════════════════════════════
--
-- `prevent_privileged_profile_change` (021) decide QUIÉN puede cambiar rol y
-- estado. No dice nada sobre el resultado, así que hoy un administrador puede
-- degradarse a sí mismo o suspender al único que queda y dejar la plataforma
-- sin nadie capaz de volver a entrar en /admin. Recuperarlo exigiría una
-- conexión SQL directa.
--
-- ── Es un INVARIANTE, no autorización ──────────────────────────────────────
--
-- Por eso no mira quién llama: se aplica a todo el mundo, incluido
-- `service_role`. Igual que las reglas de propietario de 023, «más permisos» no
-- significa «poder corromper el modelo».
--
-- ── Solo UPDATE ────────────────────────────────────────────────────────────
--
-- No se cubre DELETE a propósito. Las filas de `profiles` se borran en cascada
-- al eliminar la cuenta en `auth.users`, y bloquear eso desde aquí convertiría
-- un borrado de cuenta en un error incomprensible. El caso que importa —y el
-- único que ocurre desde el panel— es la degradación.
--
-- ── Orden de los triggers ──────────────────────────────────────────────────
--
-- PostgreSQL los ejecuta por orden alfabético de nombre:
--
--   profiles_prevent_privileged_change   (021, autorización)
--   profiles_protect_last_admin          (039, invariante)
--
-- Primero se comprueba si quien llama puede tocar el rol; solo después, si el
-- resultado deja el sistema en un estado válido. Es el orden correcto: a un
-- usuario sin permiso hay que decirle que no puede, no que «queda un solo
-- administrador».

create or replace function public.protect_last_platform_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo interesa la transición «era administrador activo» → «ya no lo es».
  -- `is distinct from` trata NULL como un valor más: un status a NULL también
  -- cuenta como dejar de estar activo.
  if old.role = 'platform_admin'
     and old.status = 'active'
     and (new.role is distinct from 'platform_admin'
          or new.status is distinct from 'active') then

    if not exists (
      select 1
        from public.profiles p
       where p.role   = 'platform_admin'
         and p.status = 'active'
         and p.id    <> old.id
    ) then
      raise exception
        'No se puede degradar ni suspender al último administrador de plataforma activo.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.protect_last_platform_admin() is
  'Fase 039 — invariante: siempre queda al menos un platform_admin activo. Se '
  'aplica a todos los actores, incluido service_role, igual que las reglas de '
  'propietario de 023.';

drop trigger if exists profiles_protect_last_admin on public.profiles;
create trigger profiles_protect_last_admin
  before update on public.profiles
  for each row execute function public.protect_last_platform_admin();

revoke all on function public.protect_last_platform_admin() from public;
revoke all on function public.protect_last_platform_admin() from anon;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Índice para el aviso de tickets
-- ═════════════════════════════════════════════════════════════════════════════
--
-- El badge de Soporte cuenta los tickets pendientes en CADA navegación del
-- panel. Hoy la tabla tiene 2 filas y sobraría, pero es una cuenta que se
-- ejecuta en todas las páginas de administración y conviene que no dependa de
-- cuánto crezca.

create index if not exists idx_support_tickets_status
  on public.support_tickets (status);

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Lo que esta migración NO hace
-- ═════════════════════════════════════════════════════════════════════════════
--
-- · No crea, borra ni modifica ningún perfil, membership ni organización.
-- · No asigna propietario a «MIRA Pricing Technologies SL». Esa organización
--   existe sin miembros y sin propietario; corregirlo automáticamente
--   significaría elegir a alguien, y esa es una decisión de negocio. La
--   interfaz de esta fase permite hacerlo a mano y de forma explícita.
-- · No duplica las reglas de 023 ni las de 021. La autoridad sigue siendo la
--   que ya estaba.
-- · No toca precios, importaciones, snapshots de borrado ni proveedores.
-- · No toca `plans`, `subscription_status` ni nada relacionado con Stripe.
-- · No añade ni cambia ninguna policy fuera de la tabla nueva: el recuento pasa
--   de 64 a 66 (las dos de `admin_audit_log`).
