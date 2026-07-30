// Disponibilidad de mercados y favoritos (Fase 2.1 y 2.2).
//
// Lo que se fija aquí es la JERARQUÍA de los tres conceptos, que es lo único
// que no puede romperse sin abrir un agujero:
//
//   módulo `markets` (1.4)  >  mercado permitido (2.2)  >  favorito (2.1)
//
// Un favorito nunca levanta ninguna de las dos restricciones anteriores.

import { describe, expect, it } from 'vitest'
import {
  MARKET_DISABLED_COPY,
  NO_FAVORITES_COPY,
  evaluateMarketAccess,
  filterVisibleMarkets,
  isMarketVisible,
  visibleFavoriteMarketIds,
} from './access'

const CON_MODULO = { moduleEnabled: true, disabledMarketIds: [] as string[] }

describe('evaluateMarketAccess', () => {
  it('con módulo activo y mercado habilitado: concede', () => {
    expect(evaluateMarketAccess('m-1', CON_MODULO)).toBeNull()
    expect(isMarketVisible('m-1', CON_MODULO)).toBe(true)
  })

  it('mercado deshabilitado: market-disabled', () => {
    const input = { moduleEnabled: true, disabledMarketIds: ['m-1'] }
    expect(evaluateMarketAccess('m-1', input)).toBe('market-disabled')
    expect(evaluateMarketAccess('m-2', input)).toBeNull()
  })

  // El módulo es el hecho DOMINANTE: si está apagado, ese es el motivo aunque
  // además el mercado estuviera deshabilitado. Lleva al mensaje útil.
  it('sin módulo: module-disabled, aunque el mercado también esté deshabilitado', () => {
    expect(evaluateMarketAccess('m-1', { moduleEnabled: false, disabledMarketIds: ['m-1'] })).toBe(
      'module-disabled',
    )
    expect(evaluateMarketAccess('m-9', { moduleEnabled: false, disabledMarketIds: [] })).toBe(
      'module-disabled',
    )
  })

  it('acepta indistintamente Set y array', () => {
    const conSet = { moduleEnabled: true, disabledMarketIds: new Set(['m-1']) }
    const conArray = { moduleEnabled: true, disabledMarketIds: ['m-1'] }
    expect(evaluateMarketAccess('m-1', conSet)).toBe('market-disabled')
    expect(evaluateMarketAccess('m-1', conArray)).toBe('market-disabled')
  })
})

describe('filterVisibleMarkets', () => {
  const mercados = [{ id: 'm-1' }, { id: 'm-2' }, { id: 'm-3' }]

  it('sin restricciones devuelve todos', () => {
    expect(filterVisibleMarkets(mercados, CON_MODULO)).toHaveLength(3)
  })

  it('excluye los deshabilitados y deja el resto intacto', () => {
    const visibles = filterVisibleMarkets(mercados, {
      moduleEnabled: true,
      disabledMarketIds: ['m-2'],
    })
    expect(visibles.map((m) => m.id)).toEqual(['m-1', 'm-3'])
  })

  it('sin módulo devuelve la lista VACÍA, no la original', () => {
    expect(
      filterVisibleMarkets(mercados, { moduleEnabled: false, disabledMarketIds: [] }),
    ).toEqual([])
  })

  it('no muta la lista recibida', () => {
    const original = [...mercados]
    filterVisibleMarkets(mercados, { moduleEnabled: true, disabledMarketIds: ['m-2'] })
    expect(mercados).toEqual(original)
  })

  it('otra organización con el mercado habilitado no se ve afectada', () => {
    // Mismo catálogo, dos configuraciones: cada una filtra la suya.
    const acme = filterVisibleMarkets(mercados, { moduleEnabled: true, disabledMarketIds: ['m-2'] })
    const otra = filterVisibleMarkets(mercados, { moduleEnabled: true, disabledMarketIds: [] })
    expect(acme.map((m) => m.id)).toEqual(['m-1', 'm-3'])
    expect(otra.map((m) => m.id)).toEqual(['m-1', 'm-2', 'm-3'])
  })
})

describe('visibleFavoriteMarketIds — el favorito no es un bypass', () => {
  const favoritos = ['m-1', 'm-2', 'm-3']

  it('con todo habilitado se ven todos', () => {
    expect(visibleFavoriteMarketIds(favoritos, CON_MODULO)).toEqual(['m-1', 'm-2', 'm-3'])
  })

  // El punto central de 2.1 + 2.2: marcar algo como favorito NO da acceso.
  it('un favorito de un mercado deshabilitado NO se muestra', () => {
    expect(
      visibleFavoriteMarketIds(favoritos, { moduleEnabled: true, disabledMarketIds: ['m-2'] }),
    ).toEqual(['m-1', 'm-3'])
  })

  it('sin módulo no se muestra ninguno', () => {
    expect(
      visibleFavoriteMarketIds(favoritos, { moduleEnabled: false, disabledMarketIds: [] }),
    ).toEqual([])
  })

  // Filtrar es de PRESENTACIÓN: la lista original no se toca, así que la fila
  // sigue en `user_market_favorites` y reaparece al rehabilitar el mercado.
  it('filtrar no borra: la lista original queda intacta', () => {
    const original = [...favoritos]
    visibleFavoriteMarketIds(favoritos, { moduleEnabled: false, disabledMarketIds: ['m-1'] })
    expect(favoritos).toEqual(original)
  })

  it('rehabilitar el mercado devuelve el favorito sin haberlo vuelto a marcar', () => {
    const apagado = { moduleEnabled: true, disabledMarketIds: ['m-2'] }
    const encendido = { moduleEnabled: true, disabledMarketIds: [] as string[] }
    expect(visibleFavoriteMarketIds(favoritos, apagado)).not.toContain('m-2')
    expect(visibleFavoriteMarketIds(favoritos, encendido)).toContain('m-2')
  })

  it('sin favoritos devuelve lista vacía, no error', () => {
    expect(visibleFavoriteMarketIds([], CON_MODULO)).toEqual([])
  })
})

describe('textos', () => {
  it('el mercado deshabilitado remite a la plataforma, no a permisos personales', () => {
    expect(MARKET_DISABLED_COPY.description).toContain('tu organización')
    expect(MARKET_DISABLED_COPY.description.toLowerCase()).not.toContain('no tienes permiso')
  })

  it('el estado sin favoritos explica cómo añadirlos', () => {
    expect(NO_FAVORITES_COPY.description).toContain('estrella')
  })
})
