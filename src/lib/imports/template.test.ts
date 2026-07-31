// La plantilla oficial debe poder volver a subirse (Fase 2.5).
//
// Este es el test que faltaba. La ruta anterior `price-template` servía una
// plantilla con `source_name` —columna que el validador nuevo no conoce— y sin
// `lonja`, y nadie lo habría notado hasta rellenar la fuente y ver que no se
// guardaba. Aquí se comprueba el ciclo completo: se genera la plantilla, se
// vuelve a leer con el parser real y se valida con el validador real.

import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv'
import { resolveImportPeriod } from './period'
import {
  TEMPLATE_COLUMNS,
  TEMPLATE_EXAMPLE_ROW,
  buildImportTemplateCsv,
  parseImportTemplateCsv,
} from './template'
import {
  ALL_IMPORT_COLUMNS,
  OPTIONAL_IMPORT_COLUMNS,
  REQUIRED_IMPORT_COLUMNS,
} from './types'
import { validateHeaders, validateRow, type ValidationCatalog } from './validation'

describe('columnas de la plantilla', () => {
  it('son exactamente las que reconoce el importador', () => {
    expect(TEMPLATE_COLUMNS).toEqual([...ALL_IMPORT_COLUMNS])
  })

  it('incluye todas las obligatorias', () => {
    for (const c of REQUIRED_IMPORT_COLUMNS) expect(TEMPLATE_COLUMNS).toContain(c)
  })

  it('incluye todas las opcionales admitidas', () => {
    for (const c of OPTIONAL_IMPORT_COLUMNS) expect(TEMPLATE_COLUMNS).toContain(c)
  })

  // Las dos discrepancias concretas de la plantilla antigua.
  it('NO arrastra columnas del importador antiguo', () => {
    expect(TEMPLATE_COLUMNS).not.toContain('source_name')
    expect(TEMPLATE_COLUMNS).toContain('source')
    expect(TEMPLATE_COLUMNS).toContain('lonja')
  })

  it('no ofrece ninguna columna que el validador ignore', () => {
    const { unknown } = validateHeaders([...TEMPLATE_COLUMNS])
    expect(unknown).toEqual([])
  })
})

describe('formato del archivo descargado', () => {
  const csv = buildImportTemplateCsv()

  // Sin BOM, Excel abre «Boletín» como «BoletÃ­n».
  it('lleva BOM de UTF-8 para que Excel respete los acentos', () => {
    expect(csv.startsWith('﻿')).toBe(true)
  })

  it('usa CRLF, que es lo que espera Excel', () => {
    expect(csv).toContain('\r\n')
  })

  it('tiene cabecera y una sola fila de ejemplo', () => {
    const parsed = parseCsv(csv)
    expect(parsed.headers).toEqual([...TEMPLATE_COLUMNS])
    expect(parsed.rows).toHaveLength(1)
  })

  it('no arrastra errores de parseo', () => {
    expect(parseImportTemplateCsv().errors).toEqual([])
  })
})

describe('la plantilla no contiene datos productivos', () => {
  // Identificadores inventados a propósito: con slugs reales, subir la plantilla
  // sin editar escribiría un precio falso sobre un producto real. Al no existir,
  // la fila de ejemplo se rechaza sola.
  it('los slugs de ejemplo no son de la plataforma', () => {
    expect(TEMPLATE_EXAMPLE_ROW.market_slug).toBe('cereales-nacional')
    expect(TEMPLATE_EXAMPLE_ROW.product_slug).toBe('trigo-blando-panificable')
  })

  it('no incluye UUIDs ni correos', () => {
    const csv = buildImportTemplateCsv()
    expect(csv).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
    expect(csv).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i)
  })

  it('ninguna celda parece una fórmula', () => {
    for (const valor of Object.values(TEMPLATE_EXAMPLE_ROW)) {
      if (valor === '') continue
      expect(['=', '+', '-', '@']).not.toContain(valor[0])
    }
  })
})

// ── El ciclo completo: descargar → rellenar → subir ─────────────────────────

describe('la plantilla la acepta el validador real', () => {
  const SEMANA = resolveImportPeriod({ type: 'week', year: 2026, week: 31 }).range!

  /** Catálogo mínimo que contiene el producto de ejemplo de la plantilla. */
  function catalogoConEjemplo(): ValidationCatalog {
    return {
      products: new Map([
        [
          `${TEMPLATE_EXAMPLE_ROW.market_slug}::${TEMPLATE_EXAMPLE_ROW.product_slug}`,
          {
            productId: 'p-ejemplo',
            productSlug: TEMPLATE_EXAMPLE_ROW.product_slug,
            productName: 'Trigo blando panificable',
            marketId: 'm-ejemplo',
            marketSlug: TEMPLATE_EXAMPLE_ROW.market_slug,
            marketName: 'Cereales nacional',
            lonja: TEMPLATE_EXAMPLE_ROW.lonja,
            // 034 — la unidad configurada de la referencia, en la forma
            // combinada real del catálogo.
            unit: '€/TN',
          },
        ],
      ]),
      marketSlugs: new Set([TEMPLATE_EXAMPLE_ROW.market_slug]),
      existingKeys: new Set(),
    }
  }

  it('la cabecera pasa la validación sin avisos', () => {
    const parsed = parseImportTemplateCsv()
    const r = validateHeaders(parsed.headers)
    expect(r.ok).toBe(true)
    expect(r.missing).toEqual([])
    expect(r.unknown).toEqual([])
  })

  it('la fila de ejemplo es VÁLIDA si su producto existe', () => {
    const parsed = parseImportTemplateCsv()
    const fila = validateRow(
      parsed.rows[0].line,
      parsed.rows[0].values,
      catalogoConEjemplo(),
      SEMANA,
      new Set(),
    )
    expect(fila.errors).toEqual([])
    expect(fila.status).toBe('valid')
  })

  it('todos los valores del ejemplo se interpretan bien', () => {
    const parsed = parseImportTemplateCsv()
    const fila = validateRow(2, parsed.rows[0].values, catalogoConEjemplo(), SEMANA, new Set())
    expect(fila.recordedAt).toBe('2026-07-27')
    expect(fila.price).toBe(241.5)
    expect(fila.currency).toBe('EUR')
    expect(fila.unit).toBe('ton')
    expect(fila.minPrice).toBe(238)
    expect(fila.maxPrice).toBe(244)
    expect(fila.volume).toBe(1200)
    expect(fila.region).toBe('Lleida')
    expect(fila.country).toBe('ES')
  })

  it('la fecha de ejemplo cae dentro del periodo que sugiere', () => {
    // Si la fecha del ejemplo quedara fuera de cualquier periodo razonable,
    // quien la suba sin editar recibiría un error desconcertante.
    expect(TEMPLATE_EXAMPLE_ROW.recorded_at >= SEMANA.from).toBe(true)
    expect(TEMPLATE_EXAMPLE_ROW.recorded_at <= SEMANA.to).toBe(true)
  })

  // Sin el producto en el catálogo, la plantilla se rechaza con un error que se
  // entiende. Es el comportamiento que se quiere si alguien la sube sin editar.
  it('sin ese producto, se rechaza con un error claro', () => {
    const vacio: ValidationCatalog = {
      products: new Map(),
      marketSlugs: new Set(),
      existingKeys: new Set(),
    }
    const parsed = parseImportTemplateCsv()
    const fila = validateRow(2, parsed.rows[0].values, vacio, SEMANA, new Set())
    expect(fila.status).toBe('invalid')
    expect(fila.errors[0].column).toBe('market_slug')
    expect(fila.errors[0].message).toContain('no existe')
  })
})
