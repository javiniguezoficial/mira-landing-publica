// Semántica SQL de los indicadores sin moneda y de las lecturas completas (037).
//
// ADVERTENCIA, la de siempre: esto NO consulta la base de datos. Lee el TEXTO
// del SQL versionado y comprueba que la migración declara lo que la aplicación
// da por hecho. La verificación real está en el informe del bloque.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NON_MONETARY_MEASURES } from '@/lib/imports/units'

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

const SQL = ejecutable(migracion('_037_'))

// ═══════════════════════════════════════════════════════════════════════════
// La moneda deja de ser obligatoria
// ═══════════════════════════════════════════════════════════════════════════

describe('currency opcional', () => {
  it('retira el NOT NULL', () => {
    expect(SQL).toContain('alter column currency drop not null')
  })

  // Un default de EUR sobre una columna ya opcional seguiría suponiendo euros
  // en silencio, que es justo la suposición que se está quitando.
  it('retira también el default EUR', () => {
    expect(SQL).toContain('alter column currency drop default')
  })

  it('no inventa ningún valor centinela tipo NONE o N/A', () => {
    expect(SQL).not.toContain("'none'")
    expect(SQL).not.toContain("'n/a'")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// La coherencia moneda ↔ unidad la garantiza la base
// ═══════════════════════════════════════════════════════════════════════════

describe('restricción de coherencia', () => {
  it('existe y es un CHECK sobre la tabla de precios', () => {
    expect(SQL).toContain('add constraint product_price_records_currency_unit_consistency')
    expect(SQL).toContain('check (')
  })

  it('es simétrica: sin moneda si la unidad no es monetaria, con moneda si lo es', () => {
    expect(SQL).toContain('then currency is null')
    expect(SQL).toContain('else currency is not null')
  })

  it('nombra las mismas unidades no monetarias que el código', () => {
    for (const medida of NON_MONETARY_MEASURES) {
      expect(SQL, medida).toContain(`'${medida.toLowerCase()}'`)
    }
  })

  // El histórico ha usado «Unidades», «unidad» y «unidades» para lo mismo. Un
  // alta manual con otra grafía no debe acabar exigiendo una moneda inexistente.
  it('tolera las grafías antiguas del índice', () => {
    for (const grafia of ['unidad', 'unidades', 'ud', 'uds']) {
      expect(SQL, grafia).toContain(`'${grafia}'`)
    }
  })

  it('normaliza antes de comparar, para que la grafía no decida', () => {
    expect(SQL).toContain('lower(btrim(unit))')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Clave natural
// ═══════════════════════════════════════════════════════════════════════════

describe('clave natural', () => {
  it('recrea el índice único de la clave natural', () => {
    expect(SQL).toContain('drop index if exists public.product_price_records_natural_key')
    expect(SQL).toContain('create unique index if not exists product_price_records_natural_key')
  })

  // En SQL, NULL nunca es igual a NULL. Sin el coalesce, una columna `currency`
  // nullable dejaría insertar infinitas filas del mismo índice, día y lonja.
  it('colapsa la moneda ausente con coalesce, igual que ya hacía con la lonja', () => {
    expect(SQL).toContain("(coalesce(currency, ''))")
    expect(SQL).toContain("(coalesce(btrim(lonja), ''))")
  })

  it('conserva las cinco columnas de la clave', () => {
    for (const col of ['product_id', 'recorded_at', 'currency', 'unit', 'lonja']) {
      expect(SQL, col).toContain(col)
    }
  })

  // Si el `on conflict` no reprodujera la expresión del índice carácter a
  // carácter, PostgreSQL no sabría a qué índice se refiere y la función fallaría
  // en tiempo de ejecución, no al crearse.
  it('el ON CONFLICT del importador usa exactamente la misma expresión', () => {
    const conflicto = SQL.slice(SQL.indexOf('on conflict ('))
    expect(conflicto).toContain("coalesce(currency, '')")
    expect(conflicto).toContain("coalesce(btrim(lonja), '')")
  })

  it('el importador NO rellena la moneda ausente al insertar', () => {
    const insert = SQL.slice(SQL.indexOf('insert into public.product_price_records'))
    expect(insert).toContain('r.resolved_currency')
    expect(insert).not.toContain("coalesce(r.resolved_currency, 'eur')")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// La confirmación de la importación no cambia de contrato
// ═══════════════════════════════════════════════════════════════════════════

describe('commit_market_import', () => {
  it('sigue recibiendo ÚNICAMENTE el batch_id', () => {
    expect(SQL).toContain('create or replace function public.commit_market_import(p_batch_id uuid)')
  })

  it('sigue comprobando platform_admin dentro de la función', () => {
    expect(SQL).toContain('if not public.is_platform_admin() then')
  })

  it('sigue bloqueando el batch para que un doble clic no importe dos veces', () => {
    expect(SQL).toContain('for update')
    expect(SQL).toContain("if v_batch.status <> 'ready' then")
  })

  it('sigue insertando SOLO las filas válidas', () => {
    expect(SQL).toContain("and r.status = 'valid'")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Lecturas completas: el techo de filas de PostgREST
// ═══════════════════════════════════════════════════════════════════════════
//
// El «solo aparecen las ocho primeras lonjas» no era un slice ni un problema de
// CSS: las consultas leían FILAS de precio y PostgREST recortaba la respuesta en
// 1.000. Estas funciones devuelven UN escalar agregado, que no se puede recortar.

const FUNCIONES_LECTURA = [
  'market_product_lonjas',
  'market_catalog_lonjas',
  'market_price_facets',
  'market_existing_price_keys',
] as const

describe('funciones de lectura agregada', () => {
  it('existen las cuatro', () => {
    for (const fn of FUNCIONES_LECTURA) {
      expect(SQL, fn).toContain(`create or replace function public.${fn}`)
    }
  })

  it('todas devuelven un escalar jsonb, no un conjunto de filas', () => {
    for (const fn of FUNCIONES_LECTURA) {
      const desde = SQL.indexOf(`create or replace function public.${fn}`)
      const cuerpo = SQL.slice(desde, desde + 400)
      expect(cuerpo, fn).toContain('returns jsonb')
      expect(cuerpo, fn).not.toContain('returns setof')
      expect(cuerpo, fn).not.toContain('returns table')
    }
  })

  // SECURITY INVOKER es lo que las hace seguras: las policies de
  // `product_price_records` se aplican íntegras, así que una organización con un
  // mercado deshabilitado (028) no ve sus lonjas en el desplegable.
  it('todas son SECURITY INVOKER, nunca DEFINER', () => {
    for (const fn of FUNCIONES_LECTURA) {
      const desde = SQL.indexOf(`create or replace function public.${fn}`)
      const cuerpo = SQL.slice(desde, desde + 400)
      expect(cuerpo, fn).toContain('security invoker')
      expect(cuerpo, fn).not.toContain('security definer')
    }
  })

  it('todas fijan el search_path', () => {
    for (const fn of FUNCIONES_LECTURA) {
      const desde = SQL.indexOf(`create or replace function public.${fn}`)
      expect(SQL.slice(desde, desde + 400), fn).toContain('set search_path = public')
    }
  })

  it('el distinct lo hace PostgreSQL, no el navegador', () => {
    expect(SQL).toContain('jsonb_agg(distinct btrim(r.lonja))')
    expect(SQL).toContain('jsonb_agg(distinct btrim(r.unit))')
  })

  // Acotar por producto Y por periodo es lo que impide que la vista previa
  // dependa de leer los 73.000 registros de la tabla.
  it('las claves existentes se acotan por producto y por fecha', () => {
    const desde = SQL.indexOf('create or replace function public.market_existing_price_keys')
    const cuerpo = SQL.slice(desde, desde + 900)
    expect(cuerpo).toContain('r.product_id = any(p_product_ids)')
    expect(cuerpo).toContain('r.recorded_at >= p_from')
    expect(cuerpo).toContain('r.recorded_at <= p_to')
  })

  it('devuelve la moneda ya colapsada, como el índice', () => {
    const desde = SQL.indexOf('create or replace function public.market_existing_price_keys')
    expect(SQL.slice(desde, desde + 900)).toContain("coalesce(r.currency, '')")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Grants
// ═══════════════════════════════════════════════════════════════════════════
//
// El revoke de `anon` es EXPRESO, no solo de PUBLIC: el esquema tiene un
// `alter default privileges … to anon` y revocar de PUBLIC no lo alcanza (029).

describe('permisos', () => {
  const TODAS = ['commit_market_import', ...FUNCIONES_LECTURA]

  it('ninguna función queda ejecutable por anon', () => {
    for (const fn of TODAS) {
      expect(SQL, fn).toContain(`revoke all on function public.${fn}`)
    }
    const revokes = SQL.match(/revoke all on function public\.\w+\([^)]*\) from anon/g) ?? []
    expect(revokes).toHaveLength(TODAS.length)
  })

  it('se revoca también de PUBLIC antes de conceder', () => {
    const revokes = SQL.match(/revoke all on function public\.\w+\([^)]*\) from public/g) ?? []
    expect(revokes).toHaveLength(TODAS.length)
  })

  it('se concede a authenticated y service_role, a nadie más', () => {
    const grants = SQL.match(/grant execute on function public\.\w+\([^)]*\) to ([^;]+);/g) ?? []
    expect(grants).toHaveLength(TODAS.length)
    for (const g of grants) {
      expect(g).toContain('authenticated')
      expect(g).toContain('service_role')
      expect(g).not.toContain('anon')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Lo que la migración NO hace
// ═══════════════════════════════════════════════════════════════════════════

describe('la migración no destruye nada', () => {
  it('no borra registros de precio', () => {
    expect(SQL).not.toMatch(/delete\s+from\s+public\.product_price_records/)
  })

  it('no reescribe registros de precio', () => {
    expect(SQL).not.toMatch(/update\s+public\.product_price_records\s+set/)
  })

  it('no usa TRUNCATE en ninguna tabla', () => {
    expect(SQL).not.toContain('truncate')
  })

  it('no toca los snapshots de auditoría del borrado', () => {
    expect(SQL).not.toContain('market_price_deletion_rows')
    expect(SQL).not.toContain('original_data')
  })

  it('no toca proveedores, usuarios, roles ni membresías', () => {
    for (const tabla of ['suppliers', 'profiles', 'organizations', 'organization_members']) {
      expect(SQL, tabla).not.toContain(tabla)
    }
  })

  it('no crea ni modifica policies', () => {
    expect(SQL).not.toContain('create policy')
    expect(SQL).not.toContain('drop policy')
    expect(SQL).not.toContain('alter policy')
  })

  it('no toca products.unit ni products.lonja', () => {
    expect(SQL).not.toMatch(/update\s+public\.products\s+set/)
    expect(SQL).not.toContain('alter table public.products')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 038 — El mismo resultado, por índice
// ═══════════════════════════════════════════════════════════════════════════
//
// 037 dejó las lonjas CORRECTAS pero lentas: `jsonb_agg(distinct btrim(x))`
// obliga a recorrer el montón y ordenar las 73.340 filas. Medido: 915 ms en
// cada carga de /admin/precios y 549 ms en la portada de Market Intelligence.
//
// 038 separa el `distinct` (sobre la columna cruda, que sí resuelve el índice)
// del `btrim` (después, sobre las 116 filas que quedan). 30 ms y 41 ms.
//
// Se lee aparte porque 037 ya está aplicada: la forma correcta de cambiar una
// función desplegada es una migración nueva, no editar la anterior.

const SQL_038 = ejecutable(migracion('_038_'))

describe('038 — plan de ejecución de las lecturas', () => {
  it('redefine solo las dos funciones que recorrían la tabla entera', () => {
    expect(SQL_038).toContain('create or replace function public.market_price_facets()')
    expect(SQL_038).toContain('create or replace function public.market_catalog_lonjas()')
  })

  // Estas dos ya estaban acotadas —por producto y por producto+fecha—, así que
  // no había nada que arreglar en ellas.
  it('NO toca market_product_lonjas ni market_existing_price_keys', () => {
    expect(SQL_038).not.toContain('function public.market_product_lonjas')
    expect(SQL_038).not.toContain('function public.market_existing_price_keys')
  })

  // La clave del cambio: una expresión sobre la columna no casa con un índice
  // sobre la columna, así que el `btrim` dentro del `distinct` forzaba el
  // recorrido del montón.
  it('el distinct va sobre la columna CRUDA, sin btrim', () => {
    expect(SQL_038).toContain('select distinct r.lonja')
    expect(SQL_038).toContain('select distinct r.unit')
    expect(SQL_038).toContain('select distinct r.product_id, r.lonja')
  })

  it('el btrim se aplica después, ya sobre el resultado agregado', () => {
    expect(SQL_038).toContain('btrim(s.lonja)')
    expect(SQL_038).toContain('btrim(s.unit)')
  })

  it('sigue sin poder recortarse: devuelven un escalar jsonb', () => {
    expect(SQL_038).toContain('returns jsonb')
    expect(SQL_038).not.toContain('returns setof')
  })

  it('siguen siendo SECURITY INVOKER: las policies se aplican igual', () => {
    expect(SQL_038).toContain('security invoker')
    expect(SQL_038).not.toContain('security definer')
  })

  it('vuelve a dejar los permisos escritos, y anon sigue fuera', () => {
    for (const fn of ['market_price_facets', 'market_catalog_lonjas']) {
      expect(SQL_038, fn).toContain(`revoke all on function public.${fn}() from anon`)
      expect(SQL_038, fn).toContain(`grant execute on function public.${fn}() to authenticated, service_role`)
    }
  })

  it('no escribe, no borra y no toca ninguna tabla', () => {
    expect(SQL_038).not.toContain('alter table')
    expect(SQL_038).not.toMatch(/delete\s+from/)
    expect(SQL_038).not.toMatch(/update\s+public\./)
    expect(SQL_038).not.toContain('truncate')
    expect(SQL_038).not.toContain('create policy')
  })
})
