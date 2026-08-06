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
  MARKET_QUICK_PERIODS,
  buildPeriodHref,
  customRangeDescription,
  isMarketPeriod,
  marketPeriodDays,
  marketPeriodDescription,
  marketPeriodLabel,
  marketPeriodStartDate,
  parseCustomRange,
  parseMarketPeriod,
  resolveMarketPeriod,
  toDateOnly,
} from './period'

// Mediodía a propósito: si el cálculo colara un `toISOString()`, con una hora
// central del día el error de zona horaria NO se vería. Los casos de madrugada
// van aparte, más abajo.
const AHORA = new Date(2026, 6, 30, 12, 0, 0) // 30 de julio de 2026

describe('catálogo de periodos', () => {
  // 037 — se añade CUSTOM AL FINAL. Los seis atajos conservan su sitio y su
  // orden: quien ya sabía dónde estaba «3Y» lo sigue encontrando ahí.
  it('son W, 3W, 6W, Y, 3Y, ALL y CUSTOM, en ese orden', () => {
    expect([...MARKET_PERIODS]).toEqual(['W', '3W', '6W', 'Y', '3Y', 'ALL', 'CUSTOM'])
  })

  it('los atajos rápidos siguen siendo exactamente los seis de siempre', () => {
    expect([...MARKET_QUICK_PERIODS]).toEqual(['W', '3W', '6W', 'Y', '3Y', 'ALL'])
  })

  it('CUSTOM se lee «Personalizado»; los demás, su propia clave', () => {
    expect(marketPeriodLabel('CUSTOM')).toBe('Personalizado')
    expect(marketPeriodLabel('3W')).toBe('3W')
    expect(marketPeriodLabel('ALL')).toBe('ALL')
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

// ═══════════════════════════════════════════════════════════════════════════
// PERIODO PERSONALIZADO (037)
// ═══════════════════════════════════════════════════════════════════════════
//
// Semántica que se fija aquí: los DOS extremos son inclusivos, son fechas
// civiles, no se corrige nada y un rango inválido cae al periodo por DEFECTO —
// nunca a ALL, que barrería el histórico entero sin que nadie lo haya pedido.

describe('parseCustomRange', () => {
  it('acepta un rango bien formado', () => {
    expect(parseCustomRange('2025-01-01', '2025-01-31')).toEqual({
      range: { from: '2025-01-01', to: '2025-01-31' },
    })
  })

  it('acepta un rango de un solo día: desde = hasta', () => {
    expect(parseCustomRange('2025-06-10', '2025-06-10').range).toEqual({
      from: '2025-06-10',
      to: '2025-06-10',
    })
  })

  it('acepta un rango multianual', () => {
    expect(parseCustomRange('2020-01-01', '2026-12-31').range).toEqual({
      from: '2020-01-01',
      to: '2026-12-31',
    })
  })

  it('rechaza que falten las dos fechas', () => {
    const { range, error } = parseCustomRange('', '')
    expect(range).toBeUndefined()
    expect(error).toContain('fecha de inicio y la fecha final')
  })

  it('rechaza que falte solo la de inicio', () => {
    const { range, error } = parseCustomRange('', '2025-01-31')
    expect(range).toBeUndefined()
    expect(error).toContain('inicio')
  })

  it('rechaza que falte solo la final', () => {
    const { range, error } = parseCustomRange('2025-01-01', '')
    expect(range).toBeUndefined()
    expect(error).toContain('final')
  })

  // NO se intercambian los extremos. Intercambiarlos devolvería datos que nadie
  // ha pedido y el error pasaría inadvertido.
  it('rechaza desde POSTERIOR a hasta, y no los intercambia', () => {
    const { range, error } = parseCustomRange('2025-03-01', '2025-01-01')
    expect(range).toBeUndefined()
    expect(error).toContain('no puede ser posterior')
    expect(error).toContain('01/03/2025')
    expect(error).toContain('01/01/2025')
  })

  it('rechaza fechas mal formadas', () => {
    expect(parseCustomRange('01/01/2025', '2025-01-31').error).toContain('inicio')
    expect(parseCustomRange('2025-01-01', 'mañana').error).toContain('final')
  })

  // Una fecha sintácticamente correcta que no existe en el calendario tampoco
  // vale: corregirla al 3 de marzo en silencio es lo peor que se puede hacer.
  it('rechaza un 31 de febrero', () => {
    expect(parseCustomRange('2026-02-31', '2026-03-31').error).toContain('inicio')
  })

  it('describe el rango en formato español', () => {
    expect(customRangeDescription({ from: '2025-01-01', to: '2025-01-31' }))
      .toBe('Del 01/01/2025 al 31/01/2025')
  })
})

describe('resolveMarketPeriod con CUSTOM', () => {
  it('un rango válido fija from y to, ambos inclusivos', () => {
    const r = resolveMarketPeriod('CUSTOM', AHORA, '2025-01-01', '2025-01-31')
    expect(r.period).toBe('CUSTOM')
    expect(r.requested).toBe('CUSTOM')
    expect(r.from).toBe('2025-01-01')
    expect(r.to).toBe('2025-01-31')
    expect(r.customError).toBeNull()
    expect(r.description).toBe('Del 01/01/2025 al 31/01/2025')
  })

  // Lo importante: NO cae en ALL. Una fecha mal escrita no puede acabar
  // barriendo los 73.000 registros de la tabla.
  it('un rango inválido cae al periodo por DEFECTO, no a ALL', () => {
    const r = resolveMarketPeriod('CUSTOM', AHORA, '2025-03-01', '2025-01-01')
    expect(r.period).toBe(DEFAULT_MARKET_PERIOD)
    expect(r.period).not.toBe('ALL')
    expect(r.from).toBe(marketPeriodStartDate(DEFAULT_MARKET_PERIOD, AHORA))
    expect(r.to).toBeNull()
  })

  // …pero el selector sigue marcando «Personalizado» y los campos conservan lo
  // que se escribió: saltar a otra pestaña perdería el error de vista.
  it('un rango inválido conserva CUSTOM como periodo PEDIDO y lo escrito', () => {
    const r = resolveMarketPeriod('CUSTOM', AHORA, '2025-03-01', '2025-01-01')
    expect(r.requested).toBe('CUSTOM')
    expect(r.customFromInput).toBe('2025-03-01')
    expect(r.customToInput).toBe('2025-01-01')
    expect(r.customError).toContain('no puede ser posterior')
  })

  it('CUSTOM sin fechas es un rango incompleto, no «todo el histórico»', () => {
    const r = resolveMarketPeriod('CUSTOM', AHORA)
    expect(r.period).toBe(DEFAULT_MARKET_PERIOD)
    expect(r.to).toBeNull()
    expect(r.customError).toBeTruthy()
  })

  it('los seis atajos siguen sin límite superior', () => {
    for (const p of MARKET_QUICK_PERIODS) {
      const r = resolveMarketPeriod(p, AHORA)
      expect(r.to, p).toBeNull()
      expect(r.requested, p).toBe(p)
      expect(r.customError, p).toBeNull()
    }
  })

  it('`from`/`to` sueltos NO tienen efecto si el periodo no es CUSTOM', () => {
    const r = resolveMarketPeriod('W', AHORA, '2020-01-01', '2020-12-31')
    expect(r.period).toBe('W')
    expect(r.from).toBe(marketPeriodStartDate('W', AHORA))
    expect(r.to).toBeNull()
  })
})

describe('buildPeriodHref con CUSTOM', () => {
  it('escribe period, from y to, y conserva el resto de la query', () => {
    const href = buildPeriodHref('/x', { lonja: 'Ebro' }, 'CUSTOM', {
      from: '2025-01-01',
      to: '2025-01-31',
    })
    expect(href).toContain('period=CUSTOM')
    expect(href).toContain('from=2025-01-01')
    expect(href).toContain('to=2025-01-31')
    expect(href).toContain('lonja=Ebro')
  })

  // Arrastrar el rango a un atajo dejaría en la URL un filtro que ya no se está
  // aplicando, y bastaría volver a «Personalizado» para que reapareciera.
  it('al volver a un atajo NO arrastra from ni to', () => {
    const href = buildPeriodHref(
      '/x',
      { period: 'CUSTOM', from: '2025-01-01', to: '2025-01-31', lonja: 'Ebro' },
      '3Y',
    )
    expect(href).toContain('period=3Y')
    expect(href).not.toContain('from=')
    expect(href).not.toContain('to=')
    expect(href).toContain('lonja=Ebro')
  })

  it('mantiene la lonja al cambiar de rango: los dos filtros se combinan', () => {
    const href = buildPeriodHref('/x', { lonja: 'España', market_id: 'm-1' }, 'CUSTOM', {
      from: '2024-01-01',
      to: '2024-06-30',
    })
    expect(href).toContain('lonja=España'.replace('ñ', '%C3%B1'))
    expect(href).toContain('market_id=m-1')
  })

  it('no duplica from ni to cuando ya venían en la query', () => {
    const href = buildPeriodHref(
      '/x',
      { from: '2000-01-01', to: '2000-12-31' },
      'CUSTOM',
      { from: '2025-01-01', to: '2025-01-31' },
    )
    expect(href.match(/from=/g)).toHaveLength(1)
    expect(href.match(/[?&]to=/g)).toHaveLength(1)
    expect(href).toContain('from=2025-01-01')
    expect(href).toContain('to=2025-01-31')
  })
})
