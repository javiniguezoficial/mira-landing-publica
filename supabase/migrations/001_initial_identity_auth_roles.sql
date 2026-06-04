-- ══════════════════════════════════════════════════════════════════════
-- MIRA Platform — Migration 001 rev3
-- Identity, Auth, Roles, Billing base
--
-- Orden de ejecución:
--   0. Extensiones
--   1. Tablas (sin RLS)
--   2. Funciones helper (SECURITY DEFINER)
--   3. Triggers
--   4. RLS + policies
--   5. Seed
--
-- Para aplicar: copiar y pegar en Supabase → SQL Editor → Run
-- ══════════════════════════════════════════════════════════════════════


-- ── 0. EXTENSIONES ────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";


-- ══════════════════════════════════════════════════════════════════════
-- BLOQUE 1: TABLAS
-- Sin RLS todavía. Orden por dependencias FK:
--   plans → organizations → profiles → organization_members → subscriptions
-- ══════════════════════════════════════════════════════════════════════

-- ── 1.1 plans ──────────────────────────────────────────────────────────
create table public.plans (
  id              uuid          primary key default uuid_generate_v4(),
  name            text          not null,
  slug            text          not null unique
                    check (slug in ('starter', 'business', 'enterprise')),
  price_monthly   numeric(10,2) check (price_monthly >= 0),
  price_annual    numeric(10,2) check (price_annual >= 0),
  max_users       int           check (max_users > 0),
  max_rfqs_month  int           check (max_rfqs_month > 0),
  has_ai          boolean       not null default false,
  has_api         boolean       not null default false,
  has_history     boolean       not null default false,
  is_active       boolean       not null default true,
  created_at      timestamptz   not null default now()
);

create index idx_plans_slug
  on public.plans (slug);


-- ── 1.2 organizations ─────────────────────────────────────────────────
create table public.organizations (
  id                   uuid         primary key default uuid_generate_v4(),
  name                 text         not null,
  cif_nif              text,
  type                 text         check (type in ('fisica', 'juridica')),
  sector               text,
  annual_revenue_range text,
  employee_count_range text,
  address              text,
  city                 text,
  country              text         not null default 'ES',
  phone                text,
  email                text,
  website              text,
  plan_id              uuid         references public.plans(id) on delete set null,
  subscription_status  text         not null default 'trial'
                         check (subscription_status in
                           ('trial', 'active', 'past_due', 'cancelled', 'expired')),
  subscription_start   timestamptz,
  subscription_end     timestamptz,
  created_at           timestamptz  not null default now(),
  updated_at           timestamptz  not null default now()
);

create index idx_organizations_plan_id
  on public.organizations (plan_id);
create index idx_organizations_subscription_status
  on public.organizations (subscription_status);


-- ── 1.3 profiles ──────────────────────────────────────────────────────
-- FK a auth.users con cascade delete:
-- si el usuario se elimina de Auth, su profile desaparece también.
create table public.profiles (
  id          uuid         primary key references auth.users(id) on delete cascade,
  role        text         not null default 'client_member'
                check (role in ('platform_admin', 'client_owner', 'client_member')),
  first_name  text,
  last_name   text,
  phone       text,
  avatar_url  text,
  created_at  timestamptz  not null default now(),
  updated_at  timestamptz  not null default now()
);

create index idx_profiles_role
  on public.profiles (role);


-- ── 1.4 organization_members ──────────────────────────────────────────
create table public.organization_members (
  id               uuid         primary key default uuid_generate_v4(),
  organization_id  uuid         not null
                     references public.organizations(id) on delete cascade,
  user_id          uuid         not null
                     references public.profiles(id) on delete cascade,
  role             text         not null default 'client_member'
                     check (role in ('client_owner', 'client_member')),
  invited_by       uuid         references public.profiles(id) on delete set null,
  joined_at        timestamptz  not null default now(),

  unique (organization_id, user_id)
);

create index idx_org_members_org_id
  on public.organization_members (organization_id);
create index idx_org_members_user_id
  on public.organization_members (user_id);
create index idx_org_members_role
  on public.organization_members (organization_id, role);


-- ── 1.5 subscriptions ─────────────────────────────────────────────────
create table public.subscriptions (
  id               uuid         primary key default uuid_generate_v4(),
  organization_id  uuid         not null
                     references public.organizations(id) on delete cascade,
  plan_id          uuid         not null
                     references public.plans(id) on delete restrict,
  status           text         not null default 'trial'
                     check (status in ('trial', 'active', 'past_due', 'cancelled', 'expired')),
  billing_cycle    text         check (billing_cycle in ('monthly', 'annual')),
  started_at       timestamptz  not null default now(),
  ended_at         timestamptz,
  notes            text,
  created_by       uuid         references public.profiles(id) on delete set null,
  created_at       timestamptz  not null default now()
);

create index idx_subscriptions_org_id
  on public.subscriptions (organization_id);
create index idx_subscriptions_status
  on public.subscriptions (organization_id, status);


-- ══════════════════════════════════════════════════════════════════════
-- BLOQUE 2: FUNCIONES HELPER (SECURITY DEFINER)
--
-- Bypassan RLS cuando se ejecutan → las policies las usan para
-- verificar permisos sin causar recursión sobre tablas con RLS activo.
--
-- stable     → Postgres puede cachear el resultado en la misma query.
-- search_path = public → previene ataques de inyección de schema.
-- ══════════════════════════════════════════════════════════════════════

-- ¿El usuario actual es platform_admin?
create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id   = auth.uid()
      and role = 'platform_admin'
  );
$$;

-- ¿El usuario actual es miembro de la organización indicada?
create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org_id
      and user_id         = auth.uid()
  );
$$;

-- ¿El usuario actual es client_owner de la organización indicada?
create or replace function public.is_org_owner(org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org_id
      and user_id         = auth.uid()
      and role            = 'client_owner'
  );
$$;


-- ══════════════════════════════════════════════════════════════════════
-- BLOQUE 3: TRIGGERS Y FUNCIONES DE TRIGGER
-- ══════════════════════════════════════════════════════════════════════

-- ── 3.1 handle_new_user ───────────────────────────────────────────────
-- Se ejecuta tras cada INSERT en auth.users (cada signup).
-- SECURITY DEFINER → bypassa RLS → el INSERT en profiles siempre funciona.
-- first_name y last_name vienen de options.data en supabase.auth.signUp().
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, first_name, last_name)
  values (
    new.id,
    'client_member',
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();


-- ── 3.2 set_updated_at ────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row
  execute procedure public.set_updated_at();

create trigger organizations_updated_at
  before update on public.organizations
  for each row
  execute procedure public.set_updated_at();


-- ── 3.3 prevent_role_change ───────────────────────────────────────────
-- Bloquea cambios de role para usuarios normales.
-- Excepciones permitidas:
--   - El role no cambió (short-circuit).
--   - El ejecutor es postgres (SQL Editor de Supabase) o service_role.
--   - El ejecutor ya es platform_admin (puede promover a otros).
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Si el role no cambió, no hay nada que verificar.
  if old.role = new.role then
    return new;
  end if;

  -- postgres (SQL Editor) y service_role pueden cambiar roles libremente.
  -- Esto permite el bootstrap del primer admin y operaciones de mantenimiento.
  if current_role in ('postgres', 'service_role') then
    return new;
  end if;

  -- Cualquier otro ejecutor necesita ser platform_admin.
  if not public.is_platform_admin() then
    raise exception 'Solo platform_admin puede cambiar el role de un usuario.';
  end if;

  return new;
end;
$$;

create trigger profiles_prevent_role_change
  before update on public.profiles
  for each row
  execute procedure public.prevent_role_change();


-- ── 3.4 bootstrap_first_platform_admin ───────────────────────────────
-- Promueve el primer platform_admin de forma segura.
-- Condiciones:
--   - No debe existir ningún platform_admin todavía.
--   - El target_user_id debe tener un profile existente.
-- Si ya existe un admin: lanza error explicativo, no modifica nada.
-- Recomendación: conservar tras usarla (si ya hay admin, es inofensiva).
create or replace function public.bootstrap_first_platform_admin(
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Bloquear si ya existe algún platform_admin.
  if exists (
    select 1 from public.profiles
    where role = 'platform_admin'
  ) then
    raise exception
      'Ya existe un platform_admin. Usa un admin existente para promover nuevos admins.';
  end if;

  -- Verificar que el usuario objetivo tiene profile creado.
  if not exists (
    select 1 from public.profiles
    where id = target_user_id
  ) then
    raise exception
      'No existe ningún profile con ese user_id. ¿El usuario se ha registrado ya?';
  end if;

  -- Promover a platform_admin.
  -- El trigger prevent_role_change permite este cambio porque
  -- esta función corre como postgres (SECURITY DEFINER).
  update public.profiles
  set role = 'platform_admin'
  where id = target_user_id;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════
-- BLOQUE 4: RLS + POLICIES
--
-- En este punto todas las tablas, funciones helper y triggers existen.
-- Todas las policies usan is_platform_admin(), is_org_member(),
-- is_org_owner() → cero subconsultas sobre tablas con RLS activo.
-- ══════════════════════════════════════════════════════════════════════

-- ── 4.1 RLS: plans ────────────────────────────────────────────────────
alter table public.plans enable row level security;

-- Cualquier visitante (sin login) puede leer planes activos.
-- Necesario para la sección Pricing de la landing sin autenticación.
create policy "plans_public_read"
  on public.plans
  for select
  using (is_active = true);

create policy "plans_admin_all"
  on public.plans
  for all
  using (public.is_platform_admin());


-- ── 4.2 RLS: organizations ────────────────────────────────────────────
alter table public.organizations enable row level security;

create policy "org_members_select"
  on public.organizations
  for select
  using (public.is_org_member(id));

create policy "org_owner_update"
  on public.organizations
  for update
  using (public.is_org_owner(id));

create policy "org_admin_all"
  on public.organizations
  for all
  using (public.is_platform_admin());


-- ── 4.3 RLS: profiles ─────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- Cada usuario ve solo su propio perfil.
create policy "profiles_own_select"
  on public.profiles
  for select
  using (id = auth.uid());

-- Cada usuario puede actualizar su propio perfil.
-- El cambio de role está bloqueado por el trigger prevent_role_change.
create policy "profiles_own_update"
  on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- platform_admin ve y modifica todos los perfiles.
-- is_platform_admin() es SECURITY DEFINER → sin recursión.
create policy "profiles_admin_all"
  on public.profiles
  for all
  using (public.is_platform_admin());


-- ── 4.4 RLS: organization_members ────────────────────────────────────
alter table public.organization_members enable row level security;

-- Un miembro ve a todos los miembros de su misma organización.
create policy "members_same_org_select"
  on public.organization_members
  for select
  using (public.is_org_member(organization_id));

-- Solo client_owner puede invitar nuevos miembros.
create policy "members_owner_insert"
  on public.organization_members
  for insert
  with check (public.is_org_owner(organization_id));

-- Solo client_owner puede eliminar miembros.
-- No puede eliminarse a sí mismo (evita org sin owner).
create policy "members_owner_delete"
  on public.organization_members
  for delete
  using (
    user_id <> auth.uid()
    and public.is_org_owner(organization_id)
  );

create policy "members_admin_all"
  on public.organization_members
  for all
  using (public.is_platform_admin());


-- ── 4.5 RLS: subscriptions ────────────────────────────────────────────
alter table public.subscriptions enable row level security;

-- client_owner puede ver el historial de suscripción de su organización.
create policy "subscriptions_owner_select"
  on public.subscriptions
  for select
  using (public.is_org_owner(organization_id));

-- Solo platform_admin puede escribir en subscriptions.
create policy "subscriptions_admin_all"
  on public.subscriptions
  for all
  using (public.is_platform_admin());


-- ══════════════════════════════════════════════════════════════════════
-- BLOQUE 5: SEED
-- Solo los 3 planes. Ningún usuario ni organización de prueba.
-- Los precios coinciden con la sección Pricing de la landing.
-- ══════════════════════════════════════════════════════════════════════

insert into public.plans
  (name, slug, price_monthly, price_annual,
   max_users, max_rfqs_month, has_ai, has_api, has_history)
values
  ('Starter',    'starter',    149,  1490,  3,    50,   false, false, false),
  ('Business',   'business',   349,  3490,  10,   200,  true,  false, true),
  ('Enterprise', 'enterprise', null, null,  null, null, true,  true,  true);


-- ══════════════════════════════════════════════════════════════════════
-- BOOTSTRAP DEL PRIMER PLATFORM_ADMIN
--
-- Ejecutar DESPUÉS de aplicar esta migración y DESPUÉS de registrarse
-- en /registro con el email del administrador real.
--
-- Paso 1 → Registrarse en /registro.
--          El trigger handle_new_user crea el profile automáticamente.
--
-- Paso 2 → Supabase → Authentication → Users → copiar el UUID.
--
-- Paso 3 → Supabase → SQL Editor → ejecutar:
--
--          select public.bootstrap_first_platform_admin('<pegar-uuid-aqui>');
--
-- Paso 4 → Verificar:
--
--          select id, role, first_name, last_name
--          from public.profiles
--          where role = 'platform_admin';
--
-- La función queda activa pero es inofensiva si ya existe un admin:
-- simplemente lanza error y no modifica nada.
-- ══════════════════════════════════════════════════════════════════════
