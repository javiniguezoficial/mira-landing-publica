// Semántica SQL de la migración 034 (lonja por precio y nueva clave natural).
//
// ADVERTENCIA, la de siempre: esto NO consulta la base de datos. Lee el TEXTO
// del SQL versionado y comprueba que la migración declara lo que la aplicación
// da por hecho. La verificación real, contra los 608 precios, está en el
// informe del bloque.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function migracion(prefijo: string): string {
  const nombre = readdirSync(MIGRATIONS_DIR).find((f) => f.includes(prefijo))
  if (!nombre) throw new Error(`Falta la migración ${prefijo}`)
  return readFileSync(join(MIGRATIONS_DIR, nombre), 'utf8')
}

function ejecutable(texto: string): string {
  return texto
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

const SQL = ejecutable(migracion('_034_'))

// ═══════════════════════════════════════════════════════════════════════════
// La columna y su relleno
// ═══════════════════════════════════════════════════════════════════════════

describe('columna de lonja', () => {
  it('se añade a `product_price_records`', () => {
    expect(SQL).toContain('alter table public.product_price_records add column if not exists lonja text')
  })

  it('el backfill copia `products.lonja` y es repetible', () => {
    expect(SQL).toContain('update public.product_price_records r set lonja = nullif(btrim(p.lonja)')
    // `where lonja is null` hace que aplicarla dos veces no pise nada.
    expect(SQL).toContain('and r.lonja is null')
  })

  // Reescribirla convertiría el importador en algo que reclasifica productos.
  it('NO se toca `products.lonja`', () => {
    expect(SQL).not.toMatch(/update\s+public\.products\b/)
    expect(SQL).not.toMatch(/alter table public\.products\b/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// La clave natural
// ═══════════════════════════════════════════════════════════════════════════

describe('clave natural', () => {
  // Sin esto, la segunda plaza de cada referencia seguiría entrando como
  // duplicada: es el fallo que se está corrigiendo.
  it('el índice anterior se elimina', () => {
    expect(SQL).toContain('drop index if exists public.product_price_records_natural_key')
  })

  it('el nuevo incluye la lonja', () => {
    expect(SQL).toContain(
      'create unique index if not exists product_price_records_natural_key on public.product_price_records ( product_id, recorded_at, currency, unit, (coalesce(btrim(lonja), \'\')) )',
    )
  })

  // En un índice único, NULL nunca es igual a NULL: sin `coalesce` se podrían
  // insertar infinitas filas del mismo producto y día con la lonja vacía.
  it('el `coalesce` cierra el agujero de los NULL', () => {
    expect(SQL).toContain("coalesce(btrim(lonja), '')")
  })

  it('el `on conflict` de la RPC apunta EXACTAMENTE a esa expresión', () => {
    expect(SQL).toContain(
      "on conflict (product_id, recorded_at, currency, unit, (coalesce(btrim(lonja), ''))) do nothing",
    )
  })
})

describe('índices de consulta', () => {
  it('filtrar por lonja no recorre la tabla', () => {
    expect(SQL).toContain('idx_ppr_product_lonja_recorded on public.product_price_records (product_id, lonja, recorded_at desc)')
  })

  it('el selector de lonjas tiene su índice parcial', () => {
    expect(SQL).toContain('idx_ppr_lonja on public.product_price_records (lonja) where lonja is not null')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// La RPC
// ═══════════════════════════════════════════════════════════════════════════

describe('commit_market_import', () => {
  it('escribe la lonja resuelta por el servidor', () => {
    expect(SQL).toContain('add column if not exists resolved_lonja text')
    expect(SQL).toContain('r.resolved_lonja')
    expect(SQL).toContain('recorded_at, lonja,')
  })

  // Todo esto venía de la 030 y NO puede perderse al redefinir la función.
  it('conserva las garantías de la 030', () => {
    expect(SQL).toContain('security definer')
    expect(SQL).toContain('set search_path = public')
    expect(SQL).toContain('if not public.is_platform_admin() then')
    expect(SQL).toContain('for update')
    expect(SQL).toContain("if v_batch.status <> 'ready' then")
    expect(SQL).toContain("and r.status = 'valid'")
  })

  it('la comprobación de permiso va antes de escribir', () => {
    const permiso = SQL.indexOf('if not public.is_platform_admin() then')
    const insert = SQL.indexOf('insert into public.product_price_records')
    expect(permiso).toBeGreaterThan(-1)
    expect(permiso).toBeLessThan(insert)
  })

  it('nada de SQL dinámico', () => {
    expect(SQL).not.toMatch(/\bexecute\s+(format|'|")/)
    expect(SQL).not.toContain('format(')
  })
})

describe('grants', () => {
  it('se revoca de PUBLIC y expresamente de anon', () => {
    expect(SQL).toContain('revoke all on function public.commit_market_import(uuid) from public')
    expect(SQL).toContain('revoke all on function public.commit_market_import(uuid) from anon')
    expect(SQL).toContain('grant execute on function public.commit_market_import(uuid) to authenticated, service_role')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Lo que no se toca
// ═══════════════════════════════════════════════════════════════════════════

describe('alcance de la migración', () => {
  it('no toca proveedores ni la actualización masiva 3.2', () => {
    expect(SQL).not.toContain('public.suppliers')
    expect(SQL).not.toContain('supplier_update_')
    expect(SQL).not.toContain('apply_supplier_update')
  })

  it('no crea ni borra policies', () => {
    expect(SQL).not.toContain('create policy')
    expect(SQL).not.toContain('drop policy')
  })

  it('no borra ningún precio', () => {
    expect(SQL).not.toMatch(/delete\s+from\s+public\.product_price_records/)
  })
})
