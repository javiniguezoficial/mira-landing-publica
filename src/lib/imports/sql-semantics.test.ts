// Semántica SQL y seguridad de la importación masiva (migración 030).
//
// ADVERTENCIA, la misma que en los demás `sql-semantics`: esto NO consulta la
// base de datos. Comprueba (a) que la máquina de estados que asume la
// aplicación coincide con los CHECK de la migración, y (b) leyendo el TEXTO del
// SQL versionado, que la 030 declara lo que debe declarar.
//
// La verificación real contra la base de datos está en el informe del bloque.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  IMPORT_BATCH_STATUSES,
  IMPORT_ROW_STATUSES,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  canCancelBatch,
  canCommitBatch,
  isBatchFinal,
  type ImportBatchStatus,
} from './types'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function migration030(): string {
  const nombre = readdirSync(MIGRATIONS_DIR).find((f) => f.includes('_030_'))
  if (!nombre) throw new Error('Falta la migración 030')
  return readFileSync(join(MIGRATIONS_DIR, nombre), 'utf8')
}

/** SQL sin comentarios: la 030 explica mucho en prosa y no queremos falsos positivos. */
function sqlEjecutable(texto: string): string {
  return texto
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

// ═══════════════════════════════════════════════════════════════════════════
// Clave natural
// ═══════════════════════════════════════════════════════════════════════════

describe('clave natural de product_price_records', () => {
  it('el índice único existe con las cuatro columnas y en ese orden', () => {
    const sql = sqlEjecutable(migration030())
    expect(sql).toContain(
      'create unique index if not exists product_price_records_natural_key on public.product_price_records (product_id, recorded_at, currency, unit)',
    )
  })

  // Se evaluó y se descartó: agrupando también por país siguen saliendo 0
  // duplicados y no hay ningún producto+fecha con más de un país.
  it('NO incluye country: el modelo no lo justifica', () => {
    const sql = sqlEjecutable(migration030())
    const idx = sql.match(/create unique index[^;]*product_price_records_natural_key[^;]*;/)?.[0] ?? ''
    expect(idx).not.toContain('country')
  })

  it('la migración no borra ni fusiona datos para poder crear el índice', () => {
    const sql = sqlEjecutable(migration030())
    expect(sql).not.toContain('delete from public.product_price_records')
    expect(sql).not.toMatch(/update public\.product_price_records set (price|recorded_at|unit|currency)/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Máquina de estados
// ═══════════════════════════════════════════════════════════════════════════

describe('estados del batch', () => {
  it('los estados de TypeScript son exactamente los del CHECK', () => {
    const sql = sqlEjecutable(migration030())
    for (const estado of IMPORT_BATCH_STATUSES) {
      expect(sql, `el CHECK de status debe admitir «${estado}»`).toContain(`'${estado}'`)
    }
  })

  it('solo se importa desde ready', () => {
    expect(canCommitBatch('ready')).toBe(true)
    for (const s of IMPORT_BATCH_STATUSES.filter((x) => x !== 'ready')) {
      expect(canCommitBatch(s), `no se debe poder importar desde ${s}`).toBe(false)
    }
  })

  it('se cancela desde ready o invalid, nunca desde uno cerrado', () => {
    expect(canCancelBatch('ready')).toBe(true)
    expect(canCancelBatch('invalid')).toBe(true)
    expect(canCancelBatch('completed')).toBe(false)
    expect(canCancelBatch('completed_with_errors')).toBe(false)
    expect(canCancelBatch('cancelled')).toBe(false)
  })

  it('los estados finales no se reabren', () => {
    for (const s of ['completed', 'completed_with_errors', 'cancelled'] as ImportBatchStatus[]) {
      expect(isBatchFinal(s)).toBe(true)
      expect(canCommitBatch(s)).toBe(false)
      expect(canCancelBatch(s)).toBe(false)
    }
    expect(isBatchFinal('ready')).toBe(false)
  })

  it('los estados de fila coinciden con su CHECK', () => {
    const sql = sqlEjecutable(migration030())
    for (const estado of IMPORT_ROW_STATUSES) {
      expect(sql).toContain(`'${estado}'`)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Idempotencia
// ═══════════════════════════════════════════════════════════════════════════

describe('idempotencia de la importación', () => {
  const sql = sqlEjecutable(migration030())

  // Serializa las confirmaciones concurrentes: doble clic o dos pestañas.
  it('la función bloquea el batch antes de decidir', () => {
    expect(sql).toContain('for update')
  })

  it('comprueba el estado y rechaza si ya no es ready', () => {
    expect(sql).toContain("v_batch.status <> 'ready'")
  })

  // Entre validar y confirmar pueden pasar minutos: sin esto, una sola colisión
  // abortaría la transacción entera.
  it('el INSERT tolera colisiones con la clave natural', () => {
    expect(sql).toContain('on conflict (product_id, recorded_at, currency, unit) do nothing')
  })

  it('solo inserta las filas válidas', () => {
    expect(sql).toContain("r.status = 'valid'")
  })

  it('el fichero se identifica por hash para detectar reimportaciones', () => {
    expect(sql).toContain('file_hash')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Seguridad
// ═══════════════════════════════════════════════════════════════════════════

describe('RLS y grants de la 030', () => {
  const sql = sqlEjecutable(migration030())

  it('RLS activada en las dos tablas nuevas', () => {
    expect(sql).toContain('alter table public.market_import_batches enable row level security')
    expect(sql).toContain('alter table public.market_import_rows enable row level security')
  })

  // Sin policy para el resto, RLS deniega por defecto: un usuario normal no
  // puede listar batches, ver nombres de fichero ni leer filas.
  it('las únicas policies exigen is_platform_admin()', () => {
    const policies = sql.match(/create policy [^;]+;/g) ?? []
    expect(policies.length).toBe(2)
    for (const p of policies) {
      expect(p).toContain('is_platform_admin()')
    }
  })

  it('la función valida platform_admin POR DENTRO, no solo en la Server Action', () => {
    // `security definer` sin esta comprobación sería una puerta trasera para
    // cualquier `authenticated`.
    expect(sql).toContain('if not public.is_platform_admin() then')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
  })

  it('revoca a PUBLIC y a anon con la firma completa', () => {
    expect(sql).toContain('revoke all on function public.commit_market_import(uuid) from public;')
    expect(sql).toContain('revoke all on function public.commit_market_import(uuid) from anon;')
  })

  it('concede solo a authenticated y service_role, nunca a anon', () => {
    const grants = sql.match(/grant execute on function [^;]+;/g) ?? []
    expect(grants.length).toBeGreaterThan(0)
    for (const g of grants) {
      expect(g).toContain('authenticated')
      expect(g).not.toMatch(/\bto\b[^;]*\banon\b/)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Auditoría
// ═══════════════════════════════════════════════════════════════════════════

describe('trazabilidad', () => {
  const sql = sqlEjecutable(migration030())

  it('cada precio importado guarda su batch y su fila de origen', () => {
    expect(sql).toContain('add column if not exists import_batch_id')
    expect(sql).toContain('add column if not exists import_row_id')
  })

  // Los 608 registros anteriores no vinieron de ninguna importación: NULL es la
  // respuesta correcta, no un valor inventado.
  it('las columnas de auditoría son nullable: no se rompe el histórico', () => {
    expect(sql).not.toMatch(/add column if not exists import_batch_id[^;]*not null/)
    expect(sql).not.toMatch(/add column if not exists import_row_id[^;]*not null/)
  })

  // Borrar un lote no puede llevarse por delante precios reales.
  it('borrar un batch no borra los precios', () => {
    const cols = sql.match(/add column if not exists import_(batch|row)_id[^;]+;/g) ?? []
    expect(cols.length).toBe(2)
    for (const c of cols) expect(c).toContain('on delete set null')
  })

  it('la fila guarda qué registro creó', () => {
    expect(sql).toContain('imported_record_id')
  })

  it('el batch guarda quién y cuándo', () => {
    expect(sql).toContain('created_by')
    expect(sql).toContain('imported_at')
    expect(sql).toContain('validated_at')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Límites
// ═══════════════════════════════════════════════════════════════════════════

describe('límites del MVP', () => {
  it('10 MB y 15.000 filas, declarados explícitamente', () => {
    expect(MAX_IMPORT_FILE_BYTES).toBe(10 * 1024 * 1024)
    expect(MAX_IMPORT_ROWS).toBe(15_000)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Regresión: la 030 no toca lo que no debe
// ═══════════════════════════════════════════════════════════════════════════

describe('regresión — alcance de la 030', () => {
  const sql = sqlEjecutable(migration030())

  it('no toca cotizaciones', () => {
    expect(sql).not.toContain('rfqs')
    expect(sql).not.toContain('rfq_responses')
  })

  it('no toca módulos, favoritos ni mercados deshabilitados', () => {
    expect(sql).not.toContain('organizations.modules')
    expect(sql).not.toContain('user_market_favorites')
    expect(sql).not.toContain('organization_disabled_markets')
  })

  it('no redefine las funciones de autorización existentes', () => {
    for (const fn of ['is_org_member', 'can_buy_in_org', 'org_module_enabled', 'market_enabled_for_user']) {
      expect(sql).not.toContain(`create or replace function public.${fn}`)
    }
  })

  it('no altera las policies de catálogo', () => {
    for (const p of ['client_read_markets', 'client_read_products', 'client_read_price_records']) {
      expect(sql).not.toContain(p)
    }
  })

  // El único INSERT sobre precios vive DENTRO de `commit_market_import`, que es
  // su cometido. Lo que no puede haber es DML suelto: aplicar la migración no
  // debe mover ni una fila de negocio.
  it('aplicar la migración no inserta ni borra datos de negocio', () => {
    const sinFuncion = sql.replace(/create or replace function[\s\S]*?\$\$;/g, '')
    expect(sinFuncion).not.toContain('insert into')
    expect(sinFuncion).not.toContain('delete from')
    expect(sinFuncion).not.toMatch(/\bupdate public\./)
  })
})
