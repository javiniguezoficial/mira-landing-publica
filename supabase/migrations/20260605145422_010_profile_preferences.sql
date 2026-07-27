-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN RECUPERADA — NO EJECUTAR
--
-- Objeto remoto : supabase_migrations.schema_migrations
-- Version       : 20260605145422
-- Name          : 010_profile_preferences
-- Aplicada por  : hola@javiniguez.com
-- Recuperada    : 2026-07-27 (Bloque 0 — saneamiento de migraciones)
--
-- Esta migración YA ESTÁ APLICADA en producción. El archivo se añade al
-- repositorio únicamente para trazabilidad: el SQL faltaba en `supabase/
-- migrations/` aunque la migración sí constaba en el historial remoto.
--
-- El nombre del archivo usa el prefijo de versión REAL del historial remoto
-- (20260605145422) para que, si algún día el repositorio se enlaza con la
-- Supabase CLI, esta migración se reconozca como YA APLICADA y nunca se
-- vuelva a ejecutar contra producción.
--
-- El cuerpo SQL de más abajo es una COPIA LITERAL de lo aplicado.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists preferred_locale   text not null default 'es',
  add column if not exists preferred_currency text not null default 'EUR',
  add column if not exists preferred_country  text not null default 'ES';
