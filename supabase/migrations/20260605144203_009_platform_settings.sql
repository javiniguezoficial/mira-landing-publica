-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN RECUPERADA — NO EJECUTAR
--
-- Objeto remoto : supabase_migrations.schema_migrations
-- Version       : 20260605144203
-- Name          : 009_platform_settings
-- Aplicada por  : hola@javiniguez.com
-- Recuperada    : 2026-07-27 (Bloque 0 — saneamiento de migraciones)
--
-- Esta migración YA ESTÁ APLICADA en producción. El archivo se añade al
-- repositorio únicamente para trazabilidad: el SQL faltaba en `supabase/
-- migrations/` aunque la migración sí constaba en el historial remoto.
--
-- El nombre del archivo usa el prefijo de versión REAL del historial remoto
-- (20260605144203) para que, si algún día el repositorio se enlaza con la
-- Supabase CLI, esta migración se reconozca como YA APLICADA y nunca se
-- vuelva a ejecutar contra producción.
--
-- El cuerpo SQL de más abajo es una COPIA LITERAL de lo aplicado. No se ha
-- corregido ni mejorado nada (ver `docs/DATABASE_OVERVIEW.md` → "Historial de
-- migraciones y reconciliación" para los riesgos detectados y no corregidos).
-- ═══════════════════════════════════════════════════════════════════════════

-- Tabla platform_settings (singleton)
create table public.platform_settings (
  id               uuid primary key default gen_random_uuid(),
  platform_name    text not null default 'MIRA',
  support_email    text,
  default_country  text not null default 'ES',
  default_currency text not null default 'EUR',
  maintenance_mode boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Una sola fila posible
create unique index platform_settings_singleton
  on public.platform_settings ((true));

-- RLS
alter table public.platform_settings enable row level security;

create policy "platform_admin_select_settings"
  on public.platform_settings for select
  using (is_platform_admin());

create policy "platform_admin_insert_settings"
  on public.platform_settings for insert
  with check (is_platform_admin());

create policy "platform_admin_update_settings"
  on public.platform_settings for update
  using (is_platform_admin())
  with check (is_platform_admin());

create policy "platform_admin_delete_settings"
  on public.platform_settings for delete
  using (is_platform_admin());

-- Trigger updated_at
create trigger set_updated_at_platform_settings
  before update on public.platform_settings
  for each row execute procedure set_updated_at();

-- Fila inicial
insert into public.platform_settings
  (platform_name, support_email, default_country, default_currency, maintenance_mode)
values
  ('MIRA', null, 'ES', 'EUR', false);
