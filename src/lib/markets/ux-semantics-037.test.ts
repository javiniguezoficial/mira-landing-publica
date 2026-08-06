// Semántica de la UX de Market Intelligence (037).
//
// ADVERTENCIA: esto NO renderiza componentes. El proyecto no tiene entorno DOM
// y montar uno para cuatro comprobaciones de texto sería desproporcionado. Lo
// que se hace aquí es leer el CÓDIGO FUENTE y fijar las decisiones que un
// refactor descuidado desharía sin romper ni el build ni TypeScript.
//
// Cada bloque corresponde a una petición concreta del cliente.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ALL_COUNTRIES_LABEL,
  ALL_LONJAS_LABEL,
  COUNTRY_FILTER_LABEL,
  LONJA_FILTER_LABEL,
  LONJA_PARAM,
  lonjaAriaLabel,
} from './lonja'

function fuente(...ruta: string[]): string {
  return readFileSync(join(process.cwd(), 'src', ...ruta), 'utf8')
}

/**
 * El archivo SIN comentarios.
 *
 * Las comprobaciones de «esto ya no está» tienen que mirar el código, no la
 * prosa: los comentarios de este bloque explican precisamente qué se ha quitado
 * —«ya no se lee `.limit()`», «fuera la columna Rango»— y harían fallar los
 * tests por nombrar aquello que documentan.
 */
function sinComentarios(texto: string): string {
  return texto
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '') // {/* comentario JSX */}
    .replace(/\/\*[\s\S]*?\*\//g, '')            // /* comentario de bloque */
    .replace(/^\s*\/\/.*$/gm, '')                // // comentario de línea
}

const PORTADA = fuente('app', 'app', 'market-intelligent', 'page.tsx')
const FICHA = fuente('app', 'app', 'market-intelligent', '[marketSlug]', '[productSlug]', 'page.tsx')
const FILTRO = fuente('components', 'app', 'markets', 'LonjaFilter.tsx')
const APP_SHELL = fuente('components', 'app', 'AppShell.tsx')
const ADMIN_SHELL = fuente('components', 'admin', 'AdminShell.tsx')
const BRAND = fuente('components', 'mira', 'MiraBrand.tsx')
const ADMIN_PRECIOS = fuente('app', 'admin', 'precios', 'page.tsx')
const LONJAS_QUERY = fuente('lib', 'queries', 'lonjas.ts')

// ═══════════════════════════════════════════════════════════════════════════
// 1. El filtro de la portada se lee «País»
// ═══════════════════════════════════════════════════════════════════════════
//
// Cambia el RÓTULO y nada más: mismo parámetro, misma columna, misma consulta y
// los mismos valores ofrecidos. El cliente ha pedido renombrar una etiqueta, no
// migrar el modelo a una tabla de países.

describe('1. etiqueta País en la portada', () => {
  it('la portada pasa el rótulo «País» al filtro', () => {
    expect(COUNTRY_FILTER_LABEL).toBe('País')
    expect(PORTADA).toContain('label={COUNTRY_FILTER_LABEL}')
  })

  it('el search param NO cambia: sigue siendo `lonja`', () => {
    expect(LONJA_PARAM).toBe('lonja')
    expect(FILTRO).toContain('params.set(LONJA_PARAM, value)')
  })

  it('la portada sigue filtrando por lonja, sin ninguna traducción de valores', () => {
    expect(PORTADA).toContain('lonjasPorProducto.get(p.id)?.has(lonjaActiva)')
  })

  it('los estados vacíos y el botón de quitar hablan de país', () => {
    expect(PORTADA).toContain('Sin resultados para este país')
    expect(PORTADA).toContain('Quitar filtro de país')
  })

  // La ficha de producto ofrece «Ebro», «Europa» y «Naciones Unidas», que no son
  // países. Llamarlos «País» sería cambiar una etiqueta imprecisa por una falsa.
  it('la ficha de producto SIGUE diciendo «Lonja»', () => {
    expect(LONJA_FILTER_LABEL).toBe('Lonja')
    expect(FICHA).toContain('label={LONJA_FILTER_LABEL}')
    expect(sinComentarios(FICHA)).not.toContain('COUNTRY_FILTER_LABEL')
  })

  it('el texto accesible concuerda con el rótulo que se ve', () => {
    expect(lonjaAriaLabel('España', COUNTRY_FILTER_LABEL)).toBe('País seleccionado: España')
    expect(lonjaAriaLabel('Ebro', LONJA_FILTER_LABEL)).toBe('Lonja seleccionada: Ebro')
    expect(lonjaAriaLabel('', COUNTRY_FILTER_LABEL)).toBe(`País: ${ALL_COUNTRIES_LABEL.toLowerCase()}`)
    expect(lonjaAriaLabel('', LONJA_FILTER_LABEL)).toBe(`Lonja: ${ALL_LONJAS_LABEL.toLowerCase()}`)
  })

  it('el filtro usa el aria-label con su propio rótulo, no uno fijo', () => {
    expect(FILTRO).toContain('lonjaAriaLabel(active, label)')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. Todas las lonjas, no las ocho primeras
// ═══════════════════════════════════════════════════════════════════════════
//
// La causa medida: `getProductLonjas` leía FILAS de precio y PostgREST recorta
// toda respuesta en 1.000. «Canal Estándar» tiene 2.523 precios y 20 lonjas,
// pero en las 1.000 primeras filas solo aparecen 8 — exactamente lo reportado.

describe('2. todas las lonjas de la referencia', () => {
  it('las lonjas se agregan en SQL, no leyendo filas de precio', () => {
    expect(LONJAS_QUERY).toContain("supabase.rpc('market_product_lonjas'")
    expect(LONJAS_QUERY).toContain("supabase.rpc('market_catalog_lonjas'")
  })

  it('ya no se leen filas de `product_price_records` desde el cliente', () => {
    expect(sinComentarios(LONJAS_QUERY)).not.toContain("from('product_price_records')")
  })

  // Un `.limit()` grande NUNCA levantó el techo del servidor: como mucho lo
  // bajaba. Dejarlo escrito daba una falsa sensación de estar cubierto.
  it('no queda ningún límite de filas que aparente resolverlo', () => {
    const codigo = sinComentarios(LONJAS_QUERY)
    expect(codigo).not.toContain('MAX_LONJA_SCAN_ROWS')
    expect(codigo).not.toContain('.limit(')
  })

  it('no hay ningún recorte de las primeras N lonjas', () => {
    expect(sinComentarios(LONJAS_QUERY)).not.toMatch(/slice\(0,\s*\d+\)/)
    expect(sinComentarios(FICHA)).not.toMatch(/lonjas\.slice\(/)
    expect(sinComentarios(FILTRO)).not.toMatch(/available\.slice\(/)
  })

  it('el selector pinta TODAS las opciones que recibe', () => {
    expect(FILTRO).toContain('available.map((lonja) => (')
  })

  // Un botón por lonja rompería el diseño con 27 opciones. El `<select>` nativo
  // trae scroll, teclado y lector de pantalla sin reimplementar nada.
  it('sigue siendo un `select` nativo, con scroll propio', () => {
    expect(FILTRO).toContain('<select')
    expect(FILTRO).toContain('id="mira-lonja-filter"')
  })

  it('la selección viaja en la URL, así que sobrevive a una recarga', () => {
    expect(FILTRO).toContain('router.push(qs ?')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. El logo lleva al Dashboard, no a la landing
// ═══════════════════════════════════════════════════════════════════════════

describe('3. navegación del logo', () => {
  it('el destino es un parámetro, no una ruta fija', () => {
    expect(BRAND).toContain('href = ')
    expect(BRAND).toContain('href={href}')
  })

  it('el área de cliente lleva a /app/dashboard', () => {
    expect(APP_SHELL).toContain('homeHref="/app/dashboard"')
  })

  it('el área de administración lleva a /admin/dashboard', () => {
    expect(ADMIN_SHELL).toContain('homeHref="/admin/dashboard"')
  })

  it('ningún shell manda a la landing pública', () => {
    expect(sinComentarios(APP_SHELL)).not.toContain('homeHref="/"')
    expect(sinComentarios(ADMIN_SHELL)).not.toContain('homeHref="/"')
  })

  // El destino lo decide el layout de servidor que monta cada shell, no el
  // navegador: `/admin/*` ya ha pasado `requirePlatformAdmin` antes de llegar.
  it('el destino NO se decide leyendo el rol en el navegador', () => {
    const codigo = sinComentarios(BRAND)
    expect(codigo).not.toContain('getUser')
    expect(codigo).not.toContain('useState')
    expect(codigo).not.toContain("from('profiles')")
  })

  it('el logo no cierra sesión ni hace checkout', () => {
    const codigo = sinComentarios(BRAND)
    expect(codigo).not.toContain('signOut')
    expect(codigo).not.toContain('checkout')
  })

  it('sigue siendo un `Link` de Next: sin recarga completa', () => {
    expect(BRAND).toContain("import Link from 'next/link'")
  })

  it('es accesible: texto propio y foco de teclado visible', () => {
    expect(BRAND).toContain('aria-label={ariaLabel}')
    expect(BRAND).toContain('focus-visible:ring-2')
    expect(APP_SHELL).toContain('homeLabel="MIRA — ir al Dashboard"')
    expect(ADMIN_SHELL).toContain('homeLabel="MIRA — ir al Dashboard de administración"')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. Columnas del histórico administrativo
// ═══════════════════════════════════════════════════════════════════════════

describe('4. columnas del histórico de precios', () => {
  it('ya no está la columna Rango', () => {
    expect(sinComentarios(ADMIN_PRECIOS)).not.toContain('Rango (mín – máx)')
  })

  it('ya no está la columna Prom.', () => {
    expect(sinComentarios(ADMIN_PRECIOS)).not.toContain("'Prom.'")
  })

  it('está la columna Lonja', () => {
    expect(ADMIN_PRECIOS).toContain("'Lonja',")
  })

  it('está la columna Source', () => {
    expect(ADMIN_PRECIOS).toContain("'Source',")
  })

  // La lonja sale del REGISTRO, no de la ficha del producto: desde 034 una misma
  // referencia cotiza en varias plazas y `product.lonja` es solo el valor por
  // defecto. Enseñar esa era escribir «España» en las 20 filas de un boletín
  // europeo.
  it('la Lonja sale del registro, no del producto', () => {
    expect(ADMIN_PRECIOS).toContain('{r.lonja ?? ')
    expect(sinComentarios(ADMIN_PRECIOS)).not.toContain('r.product?.lonja')
  })

  it('una fuente ausente se enseña como guion, nunca inventada', () => {
    expect(ADMIN_PRECIOS).toContain('{r.source ?? ')
  })

  it('las dos columnas nuevas viajan en el mismo select: no hay N+1', () => {
    const ACCIONES = fuente('lib', 'actions', 'prices.ts')
    expect(ACCIONES).toContain('recorded_at, lonja, metadata')
    // La fuente vive en `metadata->>'source'`, que es donde la escribe el
    // importador desde 030. NO se deduce del nombre del fichero ni de
    // `source_id`, que sigue siendo una columna huérfana con 0 filas.
    expect(ACCIONES).toContain("metadata?.source === 'string'")
    expect(sinComentarios(ACCIONES)).not.toContain('source_id: r.source')
  })
})
