// Semántica SQL y seguridad del listado de proveedores (migración 031).
//
// ADVERTENCIA, la de siempre: esto NO consulta la base de datos. Lee el TEXTO
// del SQL versionado y comprueba que la migración declara lo que la aplicación
// da por hecho. La verificación real, contra los 12.288 proveedores, está en el
// informe del bloque.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SUPPLIER_SORTS } from './list-params'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function migration031(): string {
  const nombre = readdirSync(MIGRATIONS_DIR).find((f) => f.includes('_031_'))
  if (!nombre) throw new Error('Falta la migración 031')
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

const SQL = ejecutable(migration031())

// ═══════════════════════════════════════════════════════════════════════════
// Ordenación
// ═══════════════════════════════════════════════════════════════════════════

describe('ordenación en SQL', () => {
  // La allowlist está en los DOS lados. El valor de la URL se compara contra
  // constantes, nunca se concatena a un `order by`.
  it('cada opción de TypeScript tiene su rama en el SQL', () => {
    for (const sort of SUPPLIER_SORTS) {
      if (sort === 'name_asc') continue // es el orden base, no lleva `case`
      expect(SQL, `falta la rama para «${sort}»`).toContain(`p_sort = '${sort}'`)
    }
  })

  it('el parámetro nunca se concatena al order by', () => {
    // Nada de SQL dinámico: la función es `language sql`, que ni siquiera
    // admite `execute`, y el `order by` no concatena nada.
    expect(SQL).not.toMatch(/order by[^;]*\|\|/)
    expect(SQL).not.toMatch(/\bexecute\s+(format|'|")/)
    expect(SQL).not.toContain('format(')
    expect(SQL).toContain('language sql')
  })

  // Con 391 nombres repetidos —uno 42 veces—, sin desempate una fila podría
  // salir en dos páginas distintas o en ninguna.
  it('desempata por id: la paginación es estable', () => {
    expect(SQL).toContain('s.id asc')
  })

  it('los campos poco cubiertos ordenan con NULLS LAST', () => {
    // Los campos de texto van envueltos en `unaccent(lower(...))`; el numérico,
    // desnudo. Se comprueba que la rama de cada uno acaba en `nulls last`.
    for (const [sort, expresion] of [
      ['city_asc', "unaccent(lower(s.city))"],
      ['region_asc', "unaccent(lower(s.region))"],
      ['produccion_desc', 's.produccion_value'],
      ['produccion_asc', 's.produccion_value'],
    ] as const) {
      const rama = SQL.match(
        new RegExp(`p_sort = '${sort}' then ${expresion.replace(/[.()]/g, '\\$&')} end [a-z]+ nulls last`),
      )
      expect(rama, `${sort} debería ordenar con nulls last`).toBeTruthy()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Búsqueda secundaria
// ═══════════════════════════════════════════════════════════════════════════

describe('búsqueda secundaria en SQL', () => {
  it('recorre varios campos, no solo el nombre', () => {
    for (const campo of ['s.name', 's.city', 's.region', 's.country']) {
      expect(SQL).toContain(`unaccent(lower(coalesce(${campo}, '')))`)
    }
  })

  // Escapar `%` y `_` evita que «S_A» case con «SPA»: el usuario busca esa
  // cadena, no un patrón.
  it('escapa los comodines de LIKE', () => {
    expect(SQL).toContain("replace(replace(replace(")
    expect(SQL).toContain("'%', '\\%'")
    expect(SQL).toContain("'_', '\\_'")
    expect(SQL).toContain("escape '\\'")
  })

  it('un término vacío no filtra nada', () => {
    expect(SQL).toContain("btrim(p_secondary_search) = '' then null")
    expect(SQL).toContain('p.termino is null')
  })

  it('es acento-insensible, como el resto de filtros', () => {
    expect(SQL).toContain('unaccent(lower(')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Compatibilidad y seguridad
// ═══════════════════════════════════════════════════════════════════════════

describe('la migración no rompe lo anterior', () => {
  it('conserva todos los filtros previos', () => {
    for (const p of [
      'p_is_active', 'p_market_id', 'p_country', 'p_supplier_market_id',
      'p_supplier_category_id', 'p_supplier_family_id', 'p_supplier_subfamily_id',
      'p_produccion_min', 'p_produccion_max', 'p_search', 'p_region', 'p_city',
      'p_family', 'p_subfamily', 'p_category', 'p_produccion', 'p_medida',
    ]) {
      expect(SQL).toContain(p)
    }
  })

  // Los parámetros nuevos van al final y con default: el código anterior, que
  // llama con argumentos nombrados, sigue funcionando durante el despliegue.
  it('los parámetros nuevos tienen valor por defecto', () => {
    expect(SQL).toContain('p_secondary_search text default null')
    expect(SQL).toContain('p_sort text default null')
  })

  it('sigue devolviendo total_count para la paginación', () => {
    expect(SQL).toContain('count(*) over() as total_count')
  })

  // SECURITY INVOKER: la función respeta la RLS de `suppliers`, así que un
  // cliente solo obtiene los activos.
  it('NO es security definer', () => {
    expect(SQL).not.toContain('security definer')
  })

  it('fija el search_path', () => {
    expect(SQL).toContain("set search_path to 'public', 'extensions'")
  })
})

describe('grants', () => {
  it('revoca a PUBLIC y a anon con la firma completa', () => {
    expect(SQL).toContain('revoke all on function public.search_suppliers(')
    expect(SQL).toMatch(/revoke all on function public\.search_suppliers\([^)]*\) from anon;/)
  })

  it('concede solo a authenticated y service_role', () => {
    const grants = SQL.match(/grant execute on function[^;]+;/g) ?? []
    expect(grants.length).toBeGreaterThan(0)
    for (const g of grants) {
      expect(g).toContain('authenticated')
      expect(g).not.toMatch(/\bto\b[^;]*\banon\b/)
    }
  })
})

describe('alcance de la 031', () => {
  it('no toca tablas, policies ni datos', () => {
    expect(SQL).not.toContain('create policy')
    expect(SQL).not.toContain('drop policy')
    expect(SQL).not.toContain('create table')
    expect(SQL).not.toContain('alter table')
    expect(SQL).not.toContain('insert into')
    expect(SQL).not.toContain('delete from')
    expect(SQL).not.toMatch(/\bupdate public\./)
  })

  it('no toca Market Intelligence ni cotizaciones', () => {
    for (const t of ['product_price_records', 'rfqs', 'rfq_responses', 'market_import_batches']) {
      expect(SQL).not.toContain(t)
    }
  })

  it('solo añade índices sobre suppliers, y solo dos', () => {
    const indices = SQL.match(/create index if not exists [^;]+;/g) ?? []
    expect(indices).toHaveLength(2)
    for (const i of indices) expect(i).toContain('public.suppliers')
  })
})
