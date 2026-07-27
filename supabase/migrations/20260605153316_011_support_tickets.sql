-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN RECUPERADA — NO EJECUTAR
--
-- Objeto remoto : supabase_migrations.schema_migrations
-- Version       : 20260605153316
-- Name          : 011_support_tickets
-- Aplicada por  : hola@javiniguez.com
-- Recuperada    : 2026-07-27 (Bloque 0 — saneamiento de migraciones)
--
-- Esta migración YA ESTÁ APLICADA en producción. El archivo se añade al
-- repositorio únicamente para trazabilidad: el SQL faltaba en `supabase/
-- migrations/` aunque la migración sí constaba en el historial remoto.
--
-- El nombre del archivo usa el prefijo de versión REAL del historial remoto
-- (20260605153316) para que, si algún día el repositorio se enlaza con la
-- Supabase CLI, esta migración se reconozca como YA APLICADA y nunca se
-- vuelva a ejecutar contra producción.
--
-- El cuerpo SQL de más abajo es una COPIA LITERAL de lo aplicado. No se ha
-- corregido ni mejorado nada — en particular, `handle_ticket_resolved_at()`
-- se creó SIN `set search_path`, lo que el linter de Supabase marca como
-- aviso. Corregirlo queda FUERA del alcance de este bloque (ver
-- `docs/DATABASE_OVERVIEW.md` → "Historial de migraciones y reconciliación").
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Tabla support_tickets ────────────────────────────────────────────────────
create table public.support_tickets (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        references public.organizations(id) on delete set null,
  user_id         uuid        not null references public.profiles(id) on delete cascade,
  subject         text        not null,
  category        text        not null,
  priority        text        not null default 'normal',
  message         text        not null,
  status          text        not null default 'open',
  admin_response  text,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint support_tickets_category_check
    check (category in ('account','data','prices','rfq','suppliers','billing','other')),
  constraint support_tickets_priority_check
    check (priority in ('low','normal','high')),
  constraint support_tickets_status_check
    check (status in ('open','in_progress','resolved','closed'))
);

-- Índices
create index idx_support_tickets_status  on public.support_tickets (status);
create index idx_support_tickets_user    on public.support_tickets (user_id);
create index idx_support_tickets_org     on public.support_tickets (organization_id);
create index idx_support_tickets_created on public.support_tickets (created_at desc);

-- Trigger updated_at
create trigger set_updated_at_support_tickets
  before update on public.support_tickets
  for each row execute procedure set_updated_at();

-- Trigger resolved_at: se rellena al pasar a resolved/closed, se limpia al volver a open/in_progress
create or replace function handle_ticket_resolved_at()
returns trigger language plpgsql as $$
begin
  if new.status in ('resolved','closed') and old.status not in ('resolved','closed') then
    new.resolved_at := now();
  elsif new.status in ('open','in_progress') and old.status in ('resolved','closed') then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

create trigger support_tickets_resolved_at
  before update on public.support_tickets
  for each row execute procedure handle_ticket_resolved_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.support_tickets enable row level security;

-- Admin: acceso total
create policy "admin_all_support_tickets"
  on public.support_tickets for all
  using (is_platform_admin())
  with check (is_platform_admin());

-- Cliente: puede crear sus propios tickets
-- user_id debe ser el suyo; si incluye organization_id debe pertenecer a ella
create policy "client_insert_own_ticket"
  on public.support_tickets for insert
  with check (
    auth.uid() = user_id
    and (
      organization_id is null
      or is_org_member(organization_id)
    )
  );

-- Cliente: puede ver sus propios tickets o los de su organización
create policy "client_select_own_tickets"
  on public.support_tickets for select
  using (
    auth.uid() = user_id
    or (
      organization_id is not null
      and is_org_member(organization_id)
    )
  );

-- Cliente: sin UPDATE ni DELETE (solo admin puede modificar)
