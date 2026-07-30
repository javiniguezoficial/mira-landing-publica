// Modelo de módulos por organización (Fase 1.4).
//
// Cubre el parser, los defaults y el helper de comprobación. La semántica SQL
// —`org_module_enabled()`, el CHECK y las policies— se prueba en
// `sql-semantics.test.ts`; la verificación real contra la base de datos vive en
// `supabase/checks/027_modules_check.sql`.

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ORGANIZATION_MODULES,
  ORGANIZATION_MODULE_NAMES,
  MODULE_DISABLED_COPY,
  buildOrganizationModules,
  isOrganizationModuleEnabled,
  isOrganizationModuleName,
  parseOrganizationModules,
} from './modules'

describe('catálogo de módulos', () => {
  it('son exactamente markets y quotes', () => {
    expect([...ORGANIZATION_MODULE_NAMES]).toEqual(['markets', 'quotes'])
  })

  it('ambos vienen activos por defecto — ninguna organización existente pierde acceso', () => {
    expect(DEFAULT_ORGANIZATION_MODULES).toEqual({ markets: true, quotes: true })
  })

  it('reconoce los nombres conocidos y rechaza el resto', () => {
    expect(isOrganizationModuleName('markets')).toBe(true)
    expect(isOrganizationModuleName('quotes')).toBe(true)
    expect(isOrganizationModuleName('suppliers')).toBe(false)
    expect(isOrganizationModuleName('')).toBe(false)
    expect(isOrganizationModuleName(null)).toBe(false)
    expect(isOrganizationModuleName(undefined)).toBe(false)
    expect(isOrganizationModuleName(1)).toBe(false)
  })
})

describe('parseOrganizationModules', () => {
  it('lee el objeto válido tal cual', () => {
    expect(parseOrganizationModules({ markets: true, quotes: false })).toEqual({
      markets: true,
      quotes: false,
    })
    expect(parseOrganizationModules({ markets: false, quotes: false })).toEqual({
      markets: false,
      quotes: false,
    })
  })

  it('descarta claves desconocidas en lugar de propagarlas', () => {
    const parsed = parseOrganizationModules({ markets: false, quotes: true, suppliers: true })
    expect(parsed).toEqual({ markets: false, quotes: true })
    expect('suppliers' in parsed).toBe(false)
  })

  it('un valor no booleano cae al default de ESE módulo, sin arrastrar al otro', () => {
    expect(parseOrganizationModules({ markets: 'false', quotes: false })).toEqual({
      markets: true,
      quotes: false,
    })
    expect(parseOrganizationModules({ markets: 0, quotes: 1 })).toEqual({
      markets: true,
      quotes: true,
    })
    expect(parseOrganizationModules({ markets: null, quotes: false })).toEqual({
      markets: true,
      quotes: false,
    })
  })

  it('una clave ausente cae al default', () => {
    expect(parseOrganizationModules({ quotes: false })).toEqual({ markets: true, quotes: false })
    expect(parseOrganizationModules({})).toEqual({ markets: true, quotes: true })
  })

  // FAIL-OPEN deliberado y acotado: ver el comentario del parser. La autoridad
  // sobre las cotizaciones es RLS, que sí es fail-closed; aquí un valor
  // irreconocible no debe dejar sin producto a un cliente que sí lo tiene.
  it('un valor irreconocible devuelve los defaults, no un objeto vacío', () => {
    for (const raw of [null, undefined, 'markets', 42, true, [], [{ markets: false }]]) {
      expect(parseOrganizationModules(raw)).toEqual(DEFAULT_ORGANIZATION_MODULES)
    }
  })

  it('devuelve una copia: mutarla no contamina los defaults compartidos', () => {
    const parsed = parseOrganizationModules(null)
    parsed.quotes = false
    expect(DEFAULT_ORGANIZATION_MODULES.quotes).toBe(true)
  })
})

describe('isOrganizationModuleEnabled', () => {
  it('responde al estado real del módulo', () => {
    const modules = { markets: true, quotes: false }
    expect(isOrganizationModuleEnabled(modules, 'markets')).toBe(true)
    expect(isOrganizationModuleEnabled(modules, 'quotes')).toBe(false)
  })

  // Aquí sí es fail-closed: es una comprobación, no una lectura.
  it('un módulo desconocido devuelve false — espejo de org_module_enabled()', () => {
    const modules = { markets: true, quotes: true }
    expect(isOrganizationModuleEnabled(modules, 'suppliers')).toBe(false)
    expect(isOrganizationModuleEnabled(modules, '')).toBe(false)
  })

  it('sin módulos devuelve false', () => {
    expect(isOrganizationModuleEnabled(null, 'quotes')).toBe(false)
    expect(isOrganizationModuleEnabled(undefined, 'markets')).toBe(false)
  })
})

describe('buildOrganizationModules — normalización de la acción administrativa', () => {
  it('solo `true` estricto activa', () => {
    expect(buildOrganizationModules({ markets: true, quotes: true })).toEqual({
      markets: true,
      quotes: true,
    })
    expect(buildOrganizationModules({ markets: 'true', quotes: 1 })).toEqual({
      markets: false,
      quotes: false,
    })
    expect(buildOrganizationModules({ markets: undefined, quotes: null })).toEqual({
      markets: false,
      quotes: false,
    })
  })

  it('nunca emite claves fuera del catálogo', () => {
    const built = buildOrganizationModules({ markets: true, quotes: false })
    expect(Object.keys(built).sort()).toEqual(['markets', 'quotes'])
  })
})

describe('textos de módulo deshabilitado', () => {
  it('«Market Intelligence» se mantiene literal', () => {
    expect(MODULE_DISABLED_COPY.markets.title).toContain('Market Intelligence')
  })

  it('los textos hablan de la organización y remiten a la plataforma, no a permisos', () => {
    for (const name of ORGANIZATION_MODULE_NAMES) {
      const copy = MODULE_DISABLED_COPY[name]
      expect(copy.description).toContain('tu organización')
      expect(copy.description).toContain('administrador de la plataforma')
      expect(copy.description.toLowerCase()).not.toContain('no tienes permiso')
    }
  })

  it('Cotizaciones usa el texto acordado', () => {
    expect(MODULE_DISABLED_COPY.quotes.title).toBe('Cotizaciones no disponibles')
    expect(MODULE_DISABLED_COPY.quotes.description).toBe(
      'El módulo de Cotizaciones está deshabilitado para tu organización. ' +
        'Contacta con el administrador de la plataforma para solicitar su activación.',
    )
  })
})
