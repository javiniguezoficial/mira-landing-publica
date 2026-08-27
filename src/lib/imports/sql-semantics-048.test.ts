// Semántica de la migración 048 · poda de índices del camino de importación.
//
// ADVERTENCIA, la de siempre en los `sql-semantics`: esto NO consulta la base.
// Lee el TEXTO del SQL versionado y comprueba que la migración hace lo que dice
// y —sobre todo— que NO hace lo que no debe. La verificación contra el remoto
// está en el informe del bloque: md5 del SQL ejecutable idéntico, 12→11 índices
// en `product_price_records` y 5→4 en `market_import_rows`.

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

describe('048 · qué poda', () => {
  it('lleva el `version` real con el que quedó registrada en remoto', () => {
    // La disciplina del proyecto: el fichero se renombra al version que asignó
    // Supabase, para que el repo siga describiendo la base.
    expect(nombreDe('_048_')).toBe('20260827162152_048_prune_redundant_import_indexes.sql')
  })

  it('quita los dos índices, y solo esos dos', () => {
    const sql = sqlEjecutable('_048_')

    expect(sql).toContain('drop index if exists public.idx_mir_batch_line')
    expect(sql).toContain('drop index if exists public.idx_ppr_product_country_recorded')

    const drops = sql.match(/drop index/g) ?? []
    expect(drops.length).toBe(2)
  })

  it('usa `if exists`: reaplicarla no puede fallar', () => {
    const sql = sqlEjecutable('_048_')
    const dropsSinGuard = (sql.match(/drop index (?!if exists)/g) ?? []).length
    expect(dropsSinGuard).toBe(0)
  })
})

describe('048 · qué NO toca', () => {
  const sql = () => sqlEjecutable('_048_')

  it('no toca el índice único que respalda la restricción', () => {
    // `market_import_rows_unique_line` es el superviviente del par duplicado, y
    // no es opcional: respalda una restricción UNIQUE.
    expect(sql()).not.toContain('market_import_rows_unique_line')
  })

  it('no toca los índices que sostienen las FK', () => {
    // La lección de la 044: sin ellos, borrar un batch o una fila haría un
    // Seq Scan por fila.
    expect(sql()).not.toContain('drop index if exists public.idx_ppr_import_batch')
    expect(sql()).not.toContain('drop index if exists public.idx_ppr_import_row')
    expect(sql()).not.toContain('drop index if exists public.idx_mir_imported_record')
  })

  it('no toca idx_ppr_product_id, que es el más leído de Pricing', () => {
    expect(sql()).not.toContain('drop index if exists public.idx_ppr_product_id')
  })

  it('no toca el statement_timeout de ningún rol', () => {
    expect(sql()).not.toMatch(/statement_timeout/)
    expect(sql()).not.toMatch(/alter role/)
  })

  it('no redefine funciones, policies ni RLS', () => {
    const s = sql()
    expect(s).not.toMatch(/create (or replace )?function/)
    expect(s).not.toMatch(/create policy|alter policy|drop policy/)
    expect(s).not.toMatch(/row level security/)
    expect(s).not.toMatch(/grant |revoke /)
  })
})

describe('048 · corrige encima, no reescribe', () => {
  it('las migraciones que crearon los índices siguen intactas', () => {
    // Nunca se edita una migración aplicada. Que la 030 y la 003 sigan
    // conteniendo su `create index` es la prueba de que la 048 corrige encima.
    expect(sqlEjecutable('_030_')).toContain('create index if not exists idx_mir_batch_line')
    expect(sqlEjecutable('003_')).toContain('idx_ppr_product_country_recorded')
  })
})
