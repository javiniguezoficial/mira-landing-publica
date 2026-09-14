// Semántica de la migración 050 · `market_existing_price_keys` como definer.
//
// ── El bug que este fichero impide repetir ──────────────────────────────────
//
// 28-08-2026: la validación de la importación devolvía «No se ha podido
// procesar el archivo» para TODO fichero, también los ya importados antes. La
// causa no era el código de a230621 —`validateImportFile` no cambió— sino esta
// RPC ejecutándose como `authenticated` CON RLS: la policy se evaluaba una vez
// POR FILA de precio del periodo (~54 µs/fila), y cuando el propio cliente
// llevó el año 2025 a 37.280 precios importando su histórico, la llamada pasó
// de 210 ms a 6,5 s y empezó a cruzar el `statement_timeout` de 8 s. Medido
// con la RPC real: postgres 1.043 ms · authenticated 6.467 ms; tras la 050,
// 172-195 ms.
//
// ADVERTENCIA, la de siempre: esto NO consulta la base. Lee el TEXTO del SQL
// versionado. La verificación contra el remoto está en el informe del bloque:
// md5 idéntico, benchmark post-arreglo y guard 42501 comprobado en vivo.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function nombreDe(fragmento: string): string {
  const f = readdirSync(MIGRATIONS_DIR).find((x) => x.includes(fragmento))
  if (!f) throw new Error(`Falta la migración ${fragmento}`)
  return f
}

function sqlEjecutable(fragmento: string): string {
  return readFileSync(join(MIGRATIONS_DIR, nombreDe(fragmento)), 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

const sql = () => sqlEjecutable('_050_')

describe('050 · el arreglo', () => {
  it('lleva el `version` real con el que quedó registrada en remoto', () => {
    expect(nombreDe('_050_')).toBe('20260828115254_050_existing_price_keys_definer.sql')
  })

  it('convierte la RPC en security definer', () => {
    const s = sql()
    expect(s).toContain(
      'create or replace function public.market_existing_price_keys( p_product_ids uuid[], p_from date, p_to date )',
    )
    expect(s).toContain('security definer')
    expect(s).toContain("set search_path = public")
  })

  it('sigue siendo una lectura pura', () => {
    expect(sql()).toContain('stable')
  })

  it('conserva la firma y el retorno: jsonb con la clave natural de cinco partes', () => {
    const s = sql()
    expect(s).toContain('returns jsonb')
    for (const parte of [
      'r.product_id::text',
      "to_char(r.recorded_at, 'yyyy-mm-dd')",
      "coalesce(r.currency, '')",
      'r.unit',
      "coalesce(btrim(r.lonja), '')",
    ]) {
      expect(s).toContain(parte)
    }
  })
})

describe('050 · la seguridad NO se relaja', () => {
  it('el guard de platform_admin vive DENTRO de la función', () => {
    // Sin esta línea, `security definer` dejaría leer la tabla entera de
    // precios a cualquier authenticated. La autorización va en la base, no
    // solo en la interfaz.
    const s = sql()
    expect(s).toContain('if not public.is_platform_admin() then')
    expect(s).toContain("errcode = '42501'")
    // Y ANTES de la consulta.
    expect(s.indexOf('is_platform_admin')).toBeLessThan(s.indexOf('from public.product_price_records'))
  })

  it('vuelve a declarar los permisos, sin `anon`', () => {
    const s = sql()
    expect(s).toContain('revoke all on function public.market_existing_price_keys(uuid[], date, date) from public')
    expect(s).toContain('revoke all on function public.market_existing_price_keys(uuid[], date, date) from anon')
    expect(s).toContain('grant execute on function public.market_existing_price_keys(uuid[], date, date) to authenticated, service_role')
  })

  it('no toca policies, RLS, statement_timeout ni índices', () => {
    const s = sql()
    expect(s).not.toMatch(/create policy|alter policy|drop policy/)
    expect(s).not.toMatch(/row level security/)
    // El `comment on function` MENCIONA el statement_timeout —es la causa del
    // bug y debe quedar contada—; lo prohibido es CAMBIARLO.
    expect(s).not.toMatch(/set\s+statement_timeout/)
    expect(s).not.toMatch(/alter role/)
    expect(s).not.toMatch(/create index|drop index/)
  })

  it('no toca ninguna otra función', () => {
    const creates = sql().match(/create or replace function/g) ?? []
    expect(creates.length).toBe(1)
  })
})

describe('050 · corrige encima, no reescribe', () => {
  it('la 037, que creó la RPC, sigue intacta', () => {
    const s037 = sqlEjecutable('_037_')
    expect(s037).toContain('create or replace function public.market_existing_price_keys')
    // La versión de la 037 era `language sql` sin definer: si esto dejara de
    // ser cierto, alguien editó una migración aplicada.
    expect(s037).toContain('language sql')
  })
})
