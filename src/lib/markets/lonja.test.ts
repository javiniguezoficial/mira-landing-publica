// Filtro por lonja (Fase 2.4).
//
// La lonja es `products.lonja`: TEXTO LIBRE, no una tabla. Estos tests fijan
// que el filtro es una ALLOWLIST contra los valores realmente disponibles y no
// un saneado de cadena, que es lo que evita usarlo para sondear qué lonjas
// existen en mercados que la organización no puede ver.

import { describe, expect, it } from 'vitest'
import {
  ALL_LONJAS,
  ALL_LONJAS_LABEL,
  collectLonjas,
  lonjaAriaLabel,
  normalizeLonja,
  resolveLonja,
} from './lonja'

const DISPONIBLES = ['Lonja de Binéfar', 'Lonja de Silleda', 'Mercolleida']

describe('normalizeLonja', () => {
  it('recorta espacios', () => {
    expect(normalizeLonja('  Mercolleida  ')).toBe('Mercolleida')
  })

  // Deliberado: la comparación contra la base de datos es exacta (`eq`), así
  // que bajar a minúsculas produciría un filtro que no casa con ninguna fila.
  it('NO cambia mayúsculas ni acentos: la comparación es exacta', () => {
    expect(normalizeLonja('Lonja de Binéfar')).toBe('Lonja de Binéfar')
    expect(normalizeLonja('MERCOLLEIDA')).toBe('MERCOLLEIDA')
  })

  it('lo que no es texto se convierte en cadena vacía', () => {
    for (const raw of [null, undefined, 42, {}, []]) {
      expect(normalizeLonja(raw)).toBe('')
    }
  })
})

describe('resolveLonja — allowlist', () => {
  it('sin valor: todas las lonjas', () => {
    expect(resolveLonja('', DISPONIBLES)).toBe(ALL_LONJAS)
    expect(resolveLonja(undefined, DISPONIBLES)).toBe(ALL_LONJAS)
    expect(resolveLonja(null, DISPONIBLES)).toBe(ALL_LONJAS)
  })

  it('una lonja válida se conserva', () => {
    expect(resolveLonja('Mercolleida', DISPONIBLES)).toBe('Mercolleida')
  })

  it('tolera espacios sobrantes en la URL', () => {
    expect(resolveLonja('  Mercolleida ', DISPONIBLES)).toBe('Mercolleida')
  })

  // Una lonja inexistente NO se pasa a la consulta: cae a «todas».
  it('una lonja inexistente cae a todas, no se consulta', () => {
    expect(resolveLonja('Lonja Fantasma', DISPONIBLES)).toBe(ALL_LONJAS)
  })

  // El caso que importa para 2.2: la lonja de un mercado que esta organización
  // no puede ver nunca está en `available`, así que nunca llega al filtro.
  it('una lonja de otro mercado (fuera de las disponibles) cae a todas', () => {
    expect(resolveLonja('Lonja de Zamora', DISPONIBLES)).toBe(ALL_LONJAS)
    expect(resolveLonja('Mercolleida', ['Lonja de Silleda'])).toBe(ALL_LONJAS)
  })

  it('sin lonjas disponibles todo cae a todas', () => {
    expect(resolveLonja('Mercolleida', [])).toBe(ALL_LONJAS)
  })

  it('la comparación distingue mayúsculas: no hay coincidencia parcial', () => {
    expect(resolveLonja('mercolleida', DISPONIBLES)).toBe(ALL_LONJAS)
    expect(resolveLonja('Merco', DISPONIBLES)).toBe(ALL_LONJAS)
  })
})

describe('collectLonjas', () => {
  it('deduplica, ordena en español y descarta vacíos', () => {
    expect(
      collectLonjas(['Mercolleida', null, 'Ávila', 'Mercolleida', '  ', undefined, 'Binéfar']),
    ).toEqual(['Ávila', 'Binéfar', 'Mercolleida'])
  })

  it('sin valores devuelve lista vacía', () => {
    expect(collectLonjas([])).toEqual([])
    expect(collectLonjas([null, undefined, ''])).toEqual([])
  })

  it('recorta antes de deduplicar', () => {
    expect(collectLonjas(['Mercolleida', ' Mercolleida '])).toEqual(['Mercolleida'])
  })
})

describe('accesibilidad', () => {
  it('el texto describe la lonja activa', () => {
    expect(lonjaAriaLabel('Mercolleida')).toContain('Mercolleida')
  })

  it('sin lonja activa menciona que están todas', () => {
    expect(lonjaAriaLabel('')).toContain(ALL_LONJAS_LABEL.toLowerCase())
  })
})

describe('combinación lonja + periodo', () => {
  // Los dos filtros son independientes y se aplican a la vez: uno acota el
  // producto y el otro la ventana. Ninguno anula al otro.
  it('una lonja válida sobrevive al cambio de periodo', () => {
    const lonja = resolveLonja('Mercolleida', DISPONIBLES)
    expect(lonja).toBe('Mercolleida')
    // `buildPeriodHref` conserva el resto de params — probado en period.test.ts.
  })

  it('una lonja sin datos en el periodo sigue siendo una lonja válida', () => {
    // El filtro no sabe nada de datos: valida pertenencia al conjunto. Que la
    // consulta devuelva cero filas es un estado vacío, no un error.
    expect(resolveLonja('Lonja de Silleda', DISPONIBLES)).toBe('Lonja de Silleda')
  })
})
