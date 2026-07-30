// Filtros temporales rápidos (Fase 2.3).
//
// El reloj se INYECTA en todos los casos: un test que dependiera de `new Date()`
// real fallaría en el cambio de hora, en un bisiesto o de madrugada, que es
// justo cuando este código tiene más posibilidades de estar mal.

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MARKET_PERIOD,
  MARKET_PERIODS,
  MARKET_PERIOD_PARAM,
  buildPeriodHref,
  isMarketPeriod,
  marketPeriodDays,
  marketPeriodDescription,
  marketPeriodStartDate,
  parseMarketPeriod,
  resolveMarketPeriod,
  toDateOnly,
} from './period'

// Mediodía a propósito: si el cálculo colara un `toISOString()`, con una hora
// central del día el error de zona horaria NO se vería. Los casos de madrugada
// van aparte, más abajo.
const AHORA = new Date(2026, 6, 30, 12, 0, 0) // 30 de julio de 2026

describe('catálogo de periodos', () => {
  it('son exactamente W, 3W, 6W, Y, 3Y y ALL, en ese orden', () => {
    expect([...MARKET_PERIODS]).toEqual(['W', '3W', '6W', 'Y', '3Y', 'ALL'])
  })

  it('el periodo por defecto es Y', () => {
    expect(DEFAULT_MARKET_PERIOD).toBe('Y')
  })

  it('cada periodo tiene los días acordados', () => {
    expect(marketPeriodDays('W')).toBe(7)
    expect(marketPeriodDays('3W')).toBe(21)
    expect(marketPeriodDays('6W')).toBe(42)
    expect(marketPeriodDays('Y')).toBe(365)
    expect(marketPeriodDays('3Y')).toBe(1095)
    expect(marketPeriodDays('ALL')).toBeNull()
  })

  it('cada periodo tiene una descripción accesible no vacía', () => {
    for (const p of MARKET_PERIODS) {
      expect(marketPeriodDescription(p).length).toBeGreaterThan(3)
    }
  })

  it('reconoce los periodos válidos y rechaza el resto', () => {
    expect(isMarketPeriod('W')).toBe(true)
    expect(isMarketPeriod('ALL')).toBe(true)
    expect(isMarketPeriod('2W')).toBe(false)
    expect(isMarketPeriod('')).toBe(false)
    expect(isMarketPeriod(null)).toBe(false)
    expect(isMarketPeriod(7)).toBe(false)
  })
})

describe('parseMarketPeriod', () => {
  it('acepta los valores exactos', () => {
    for (const p of MARKET_PERIODS) expect(parseMarketPeriod(p)).toBe(p)
  })

  it('acepta minúsculas y espacios: escribir la URL a mano es un caso real', () => {
    expect(parseMarketPeriod('w')).toBe('W')
    expect(parseMarketPeriod(' 3w ')).toBe('3W')
    expect(parseMarketPeriod('all')).toBe('ALL')
  })

  // Fail-safe hacia el DEFAULT, nunca hacia ALL: un valor corrupto no debe
  // provocar un barrido del histórico entero.
  it('cualquier valor inválido cae al default, no a ALL', () => {
    for (const raw of ['', '2W', 'año', '../../etc', null, undefined, 42, {}, []]) {
      expect(parseMarketPeriod(raw)).toBe(DEFAULT_MARKET_PERIOD)
    }
  })
})

describe('marketPeriodStartDate — límites de fecha', () => {
  // El límite es INCLUSIVO (`recorded_at >= desde`), así que N días de datos
  // significan restar N-1: W cubre hoy y los 6 anteriores.
  it('W = 7 días: del 24 al 30 de julio', () => {
    expect(marketPeriodStartDate('W', AHORA)).toBe('2026-07-24')
  })

  it('3W = 21 días', () => {
    expect(marketPeriodStartDate('3W', AHORA)).toBe('2026-07-10')
  })

  it('6W = 42 días', () => {
    expect(marketPeriodStartDate('6W', AHORA)).toBe('2026-06-19')
  })

  it('Y = 365 días', () => {
    expect(marketPeriodStartDate('Y', AHORA)).toBe('2025-07-31')
  })

  it('3Y = 1095 días', () => {
    expect(marketPeriodStartDate('3Y', AHORA)).toBe('2023-08-01')
  })

  it('ALL no tiene fecha mínima', () => {
    expect(marketPeriodStartDate('ALL', AHORA)).toBeNull()
  })

  it('cada periodo abarca exactamente sus días, contando el límite', () => {
    for (const p of MARKET_PERIODS) {
      const days = marketPeriodDays(p)
      if (days === null) continue
      const desde = marketPeriodStartDate(p, AHORA)!
      const hoy = new Date(2026, 6, 30)
      const inicio = new Date(desde + 'T00:00:00')
      const abarcados = Math.round((hoy.getTime() - inicio.getTime()) / 86_400_000) + 1
      expect(abarcados).toBe(days)
    }
  })

  it('los periodos son monótonos: más grande nunca empieza más tarde', () => {
    const fechas = ['W', '3W', '6W', 'Y', '3Y'].map(
      (p) => marketPeriodStartDate(p as never, AHORA)!,
    )
    for (let i = 1; i < fechas.length; i++) {
      expect(fechas[i] < fechas[i - 1]).toBe(true)
    }
  })
})

describe('timezone y límites de calendario', () => {
  // Esta es la regresión concreta: `toISOString().slice(0,10)` sobre una fecha
  // local de madrugada en UTC+1/+2 devuelve el día ANTERIOR, y sobre una
  // columna `date` eso desplaza la ventana entera un día.
  it('a las 00:30 el día base sigue siendo hoy, no ayer', () => {
    const madrugada = new Date(2026, 6, 30, 0, 30, 0)
    expect(toDateOnly(madrugada)).toBe('2026-07-30')
    expect(marketPeriodStartDate('W', madrugada)).toBe('2026-07-24')
  })

  it('a las 23:30 el día base sigue siendo hoy, no mañana', () => {
    const noche = new Date(2026, 6, 30, 23, 30, 0)
    expect(toDateOnly(noche)).toBe('2026-07-30')
    expect(marketPeriodStartDate('W', noche)).toBe('2026-07-24')
  })

  it('cruza el cambio de mes correctamente', () => {
    expect(marketPeriodStartDate('W', new Date(2026, 2, 3, 12))).toBe('2026-02-25')
  })

  it('cruza el cambio de año correctamente', () => {
    expect(marketPeriodStartDate('W', new Date(2026, 0, 3, 12))).toBe('2025-12-28')
  })

  it('cuenta el 29 de febrero de un bisiesto', () => {
    // 2024 es bisiesto: del 26/02 al 03/03 hay 7 días contando el 29.
    expect(marketPeriodStartDate('W', new Date(2024, 2, 3, 12))).toBe('2024-02-26')
  })

  it('formatea siempre con dos dígitos', () => {
    expect(toDateOnly(new Date(2026, 0, 5, 12))).toBe('2026-01-05')
  })
})

describe('resolveMarketPeriod', () => {
  it('resuelve periodo, fecha y descripción de una vez', () => {
    const r = resolveMarketPeriod('3W', AHORA)
    expect(r.period).toBe('3W')
    expect(r.from).toBe('2026-07-10')
    expect(r.description).toBe(marketPeriodDescription('3W'))
  })

  it('un valor inválido resuelve al default con su fecha', () => {
    const r = resolveMarketPeriod('basura', AHORA)
    expect(r.period).toBe('Y')
    expect(r.from).toBe('2025-07-31')
  })

  it('ALL resuelve sin fecha mínima', () => {
    expect(resolveMarketPeriod('ALL', AHORA).from).toBeNull()
  })
})

describe('buildPeriodHref — search params', () => {
  it('añade el periodo a una ruta sin query', () => {
    expect(buildPeriodHref('/app/market-intelligent', {}, 'W')).toBe(
      '/app/market-intelligent?period=W',
    )
  })

  // Lo importante: cambiar de periodo NO puede perder la lonja ni el mercado
  // que la persona ya había elegido.
  it('conserva el resto de filtros', () => {
    const href = buildPeriodHref(
      '/app/market-intelligent/precios',
      { lonja: 'Lonja de Silleda', market_id: 'm-1' },
      '3Y',
    )
    expect(href).toContain('lonja=Lonja+de+Silleda')
    expect(href).toContain('market_id=m-1')
    expect(href).toContain(`${MARKET_PERIOD_PARAM}=3Y`)
  })

  it('reemplaza el periodo anterior en lugar de duplicarlo', () => {
    const href = buildPeriodHref('/x', { period: 'W', lonja: 'A' }, 'ALL')
    expect(href.match(/period=/g)).toHaveLength(1)
    expect(href).toContain('period=ALL')
  })

  it('descarta la paginación: con otra ventana, la página 7 no significa nada', () => {
    expect(buildPeriodHref('/x', { page: '7' }, 'W')).toBe('/x?period=W')
  })

  it('descarta valores vacíos', () => {
    expect(buildPeriodHref('/x', { lonja: '', tipo: undefined }, 'W')).toBe('/x?period=W')
  })

  it('acepta también un URLSearchParams', () => {
    const params = new URLSearchParams({ lonja: 'A', page: '3' })
    const href = buildPeriodHref('/x', params, '6W')
    expect(href).toContain('lonja=A')
    expect(href).not.toContain('page=')
    expect(href).toContain('period=6W')
  })
})
