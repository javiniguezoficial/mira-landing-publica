// Semántica de la migración 049 · `commit_market_import` sin reescritura de filas.
//
// ADVERTENCIA, la de siempre: esto NO consulta la base. Lee el TEXTO del SQL
// versionado. La verificación real contra el remoto está en el informe del
// bloque —md5 del SQL ejecutable idéntico, `prosecdef = true`,
// `search_path = public`, permisos `authenticated`/`service_role` sin `anon`, y
// la propia función ejecutada contra fixtures con rollback—.
//
// Lo que protege este fichero es que la optimización no se lleve por delante
// nada de lo que sujetaba la confirmación: la autorización, el bloqueo, la
// máquina de estados o el `on conflict`.

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

const sql = () => sqlEjecutable('_049_')

describe('049 · lo que elimina', () => {
  it('lleva el `version` real con el que quedó registrada en remoto', () => {
    expect(nombreDe('_049_')).toBe('20260827165931_049_commit_import_without_row_writeback.sql')
  })

  it('ya no actualiza `market_import_rows` fila a fila', () => {
    const s = sql()
    expect(s).not.toContain('update public.market_import_rows')
    expect(s).not.toMatch(/set status = 'imported'/)
    expect(s).not.toMatch(/imported_record_id\s*=\s*i\.id/)
  })

  it('cuenta lo insertado desde el CTE, no con `get diagnostics`', () => {
    const s = sql()
    expect(s).toContain('select count(*) into v_insertadas from insertadas')
    expect(s).not.toContain('get diagnostics v_insertadas')
  })

  it('NO borra las columnas: se conservan por compatibilidad', () => {
    const s = sql()
    expect(s).not.toMatch(/drop column/)
    expect(s).not.toMatch(/alter table public\.market_import_rows drop/)
  })

  it('documenta la semántica nueva en las dos columnas', () => {
    const s = sql()
    expect(s).toContain('comment on column public.market_import_rows.status')
    expect(s).toContain('comment on column public.market_import_rows.imported_record_id')
  })
})

describe('049 · lo que preserva intacto', () => {
  it('mantiene firma, security definer y search_path', () => {
    const s = sql()
    expect(s).toContain('create or replace function public.commit_market_import(p_batch_id uuid)')
    expect(s).toContain('returns jsonb')
    expect(s).toContain('security definer')
    expect(s).toContain('set search_path = public')
  })

  it('mantiene la comprobación de autorización como primera línea del cuerpo', () => {
    const s = sql()
    expect(s).toContain('if not public.is_platform_admin() then')
    expect(s).toContain("errcode = '42501'")
    // La autorización va ANTES del bloqueo del batch.
    expect(s.indexOf('is_platform_admin')).toBeLessThan(s.indexOf('for update'))
  })

  it('mantiene el bloqueo que serializa el doble clic', () => {
    expect(sql()).toContain('for update')
  })

  it('mantiene la máquina de estados y sus tres códigos', () => {
    const s = sql()
    expect(s).toContain("errcode = 'p0002'")   // batch inexistente
    expect(s).toContain("errcode = '22023'")   // batch no confirmable
    expect(s).toContain("v_batch.status <> 'ready'")
    expect(s).toContain("then 'completed_with_errors'")
    expect(s).toContain("else 'completed'")
  })

  it('mantiene el `on conflict` sobre la clave natural completa', () => {
    const s = sql()
    expect(s).toContain('on conflict')
    expect(s).toContain('do nothing')
    for (const parte of ['product_id', 'recorded_at', "coalesce(currency, '')", 'unit', "coalesce(btrim(lonja), '')"]) {
      expect(s).toContain(parte)
    }
  })

  it('sigue insertando SOLO las filas válidas', () => {
    expect(sql()).toContain("r.status = 'valid'")
  })

  it('sigue escribiendo el lineage en cada precio', () => {
    // `import_batch_id` e `import_row_id` son ahora la ÚNICA fuente de verdad.
    const s = sql()
    expect(s).toContain('import_batch_id, import_row_id')
  })

  it('mantiene el jsonb de retorno con las seis claves', () => {
    const s = sql()
    for (const k of ['batch_id', 'status', 'imported_rows', 'valid_rows', 'invalid_rows', 'duplicate_rows']) {
      expect(s).toContain(`'${k}'`)
    }
  })

  it('vuelve a declarar los permisos, sin `anon`', () => {
    const s = sql()
    expect(s).toContain('revoke all on function public.commit_market_import(uuid) from public')
    expect(s).toContain('revoke all on function public.commit_market_import(uuid) from anon')
    expect(s).toContain('grant execute on function public.commit_market_import(uuid) to authenticated, service_role')
  })
})

describe('049 · lo que no toca', () => {
  it('no cambia el statement_timeout de ningún rol', () => {
    const s = sql()
    expect(s).not.toMatch(/statement_timeout/)
    expect(s).not.toMatch(/alter role/)
  })

  it('no toca RLS ni policies', () => {
    const s = sql()
    expect(s).not.toMatch(/create policy|alter policy|drop policy/)
    expect(s).not.toMatch(/row level security/)
  })

  it('no toca índices: eso fue la 048', () => {
    expect(sql()).not.toMatch(/create index|drop index/)
  })

  it('corrige encima: las migraciones anteriores siguen intactas', () => {
    // Nunca se edita una migración aplicada. La 030, la 034 y la 037 conservan
    // su versión con el UPDATE masivo.
    for (const m of ['_030_', '_034_', '_037_']) {
      expect(sqlEjecutable(m)).toContain('update public.market_import_rows')
    }
  })
})
