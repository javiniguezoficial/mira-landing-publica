// Periodos de importación: semana ISO, mes y año (Fase 2.5).
//
// Los casos que de verdad importan son los bordes de la semana ISO: son los que
// fallan con la aproximación ingenua de «1 de enero más N×7», y equivocarse ahí
// significa rechazar el archivo correcto de la semana o, peor, aceptar el de otra.

import { describe, expect, it } from 'vitest'
import {
  isDateInPeriod,
  isImportPeriodType,
  isoWeekOf,
  isoWeekStart,
  isoWeeksInYear,
  parseDateOnly,
  resolveImportPeriod,
  toDateOnly,
  MAX_IMPORT_YEAR,
  MIN_IMPORT_YEAR,
} from './period'

describe('tipos de periodo', () => {
  it('solo week, month y year', () => {
    expect(isImportPeriodType('week')).toBe(true)
    expect(isImportPeriodType('month')).toBe(true)
    expect(isImportPeriodType('year')).toBe(true)
    expect(isImportPeriodType('day')).toBe(false)
    expect(isImportPeriodType('')).toBe(false)
    expect(isImportPeriodType(null)).toBe(false)
  })
})

describe('parseDateOnly', () => {
  it('acepta AAAA-MM-DD', () => {
    expect(toDateOnly(parseDateOnly('2026-07-27')!)).toBe('2026-07-27')
  })

  it('rechaza otros formatos: son ambiguos', () => {
    for (const raw of ['27/07/2026', '2026/07/27', '27-07-2026', '2026-7-2', 'ayer', '']) {
      expect(parseDateOnly(raw)).toBeNull()
    }
  })

  it('rechaza fechas que no existen', () => {
    expect(parseDateOnly('2026-02-30')).toBeNull()
    expect(parseDateOnly('2026-13-01')).toBeNull()
    expect(parseDateOnly('2025-02-29')).toBeNull()
  })

  it('acepta el 29 de febrero de un bisiesto', () => {
    expect(parseDateOnly('2024-02-29')).not.toBeNull()
  })
})

// ── Semana ISO 8601 ─────────────────────────────────────────────────────────

describe('semana ISO', () => {
  it('la semana empieza en lunes', () => {
    expect(isoWeekStart(2026, 31).getDay()).toBe(1)
    expect(toDateOnly(isoWeekStart(2026, 31))).toBe('2026-07-27')
  })

  it('2026 tiene 53 semanas y 2025 tiene 52', () => {
    expect(isoWeeksInYear(2026)).toBe(53)
    expect(isoWeeksInYear(2025)).toBe(52)
  })

  // El caso que rompe las implementaciones aproximadas: días de enero que
  // pertenecen a la última semana del año anterior, y al revés.
  it('el 1 de enero de 2027 pertenece a la semana 53 de 2026', () => {
    expect(isoWeekOf(new Date(2027, 0, 1))).toEqual({ year: 2026, week: 53 })
  })

  it('el 29 de diciembre de 2025 pertenece a la semana 1 de 2026', () => {
    expect(isoWeekOf(new Date(2025, 11, 29))).toEqual({ year: 2026, week: 1 })
  })

  it('el 31 de diciembre de 2024 pertenece a la semana 1 de 2025', () => {
    expect(isoWeekOf(new Date(2024, 11, 31))).toEqual({ year: 2025, week: 1 })
  })

  it('ida y vuelta: el lunes de la semana N está en la semana N', () => {
    for (const [year, week] of [[2026, 1], [2026, 31], [2026, 53], [2025, 52]] as const) {
      expect(isoWeekOf(isoWeekStart(year, week))).toEqual({ year, week })
    }
  })
})

describe('resolveImportPeriod — semana', () => {
  it('devuelve el rango de lunes a domingo', () => {
    const { range } = resolveImportPeriod({ type: 'week', year: 2026, week: 31 })
    expect(range!.from).toBe('2026-07-27')
    expect(range!.to).toBe('2026-08-02')
    expect(range!.label).toContain('Semana 31 de 2026')
  })

  it('la semana 53 de un año que la tiene es válida', () => {
    expect(resolveImportPeriod({ type: 'week', year: 2026, week: 53 }).range).toBeTruthy()
  })

  it('la semana 53 de un año de 52 se rechaza', () => {
    const r = resolveImportPeriod({ type: 'week', year: 2025, week: 53 })
    expect(r.range).toBeUndefined()
    expect(r.error).toContain('52')
  })

  it('rechaza semanas fuera de rango', () => {
    expect(resolveImportPeriod({ type: 'week', year: 2026, week: 0 }).error).toBeTruthy()
    expect(resolveImportPeriod({ type: 'week', year: 2026, week: 99 }).error).toBeTruthy()
    expect(resolveImportPeriod({ type: 'week', year: 2026 }).error).toBeTruthy()
  })
})

describe('resolveImportPeriod — mes', () => {
  it('cubre el mes natural completo', () => {
    const { range } = resolveImportPeriod({ type: 'month', year: 2026, month: 7 })
    expect(range!.from).toBe('2026-07-01')
    expect(range!.to).toBe('2026-07-31')
  })

  it('resuelve febrero y los bisiestos sin tablas', () => {
    expect(resolveImportPeriod({ type: 'month', year: 2025, month: 2 }).range!.to).toBe('2025-02-28')
    expect(resolveImportPeriod({ type: 'month', year: 2024, month: 2 }).range!.to).toBe('2024-02-29')
  })

  it('rechaza meses fuera de 1–12', () => {
    expect(resolveImportPeriod({ type: 'month', year: 2026, month: 0 }).error).toBeTruthy()
    expect(resolveImportPeriod({ type: 'month', year: 2026, month: 13 }).error).toBeTruthy()
    expect(resolveImportPeriod({ type: 'month', year: 2026 }).error).toBeTruthy()
  })
})

describe('resolveImportPeriod — año', () => {
  it('cubre el año completo', () => {
    const { range } = resolveImportPeriod({ type: 'year', year: 2025 })
    expect(range!.from).toBe('2025-01-01')
    expect(range!.to).toBe('2025-12-31')
  })

  it('rechaza años absurdos', () => {
    expect(resolveImportPeriod({ type: 'year', year: MIN_IMPORT_YEAR - 1 }).error).toBeTruthy()
    expect(resolveImportPeriod({ type: 'year', year: MAX_IMPORT_YEAR + 1 }).error).toBeTruthy()
    expect(resolveImportPeriod({ type: 'year', year: NaN }).error).toBeTruthy()
  })
})

describe('isDateInPeriod', () => {
  const semana = resolveImportPeriod({ type: 'week', year: 2026, week: 31 }).range!
  const mes = resolveImportPeriod({ type: 'month', year: 2026, month: 7 }).range!
  const anio = resolveImportPeriod({ type: 'year', year: 2026 }).range!

  it('ambos extremos están INCLUIDOS', () => {
    expect(isDateInPeriod('2026-07-27', semana)).toBe(true)
    expect(isDateInPeriod('2026-08-02', semana)).toBe(true)
  })

  it('un día antes o después queda fuera', () => {
    expect(isDateInPeriod('2026-07-26', semana)).toBe(false)
    expect(isDateInPeriod('2026-08-03', semana)).toBe(false)
  })

  it('mes: dentro y fuera', () => {
    expect(isDateInPeriod('2026-07-01', mes)).toBe(true)
    expect(isDateInPeriod('2026-07-31', mes)).toBe(true)
    expect(isDateInPeriod('2026-06-30', mes)).toBe(false)
    expect(isDateInPeriod('2026-08-01', mes)).toBe(false)
  })

  it('año: dentro y fuera', () => {
    expect(isDateInPeriod('2026-01-01', anio)).toBe(true)
    expect(isDateInPeriod('2026-12-31', anio)).toBe(true)
    expect(isDateInPeriod('2025-12-31', anio)).toBe(false)
    expect(isDateInPeriod('2027-01-01', anio)).toBe(false)
  })
})

describe('timezone', () => {
  // `toISOString()` convertiría a UTC y en España devolvería el día anterior de
  // madrugada, desplazando el rango entero un día.
  it('a las 00:30 el día sigue siendo el mismo', () => {
    expect(toDateOnly(new Date(2026, 6, 27, 0, 30))).toBe('2026-07-27')
  })

  it('a las 23:30 tampoco salta al siguiente', () => {
    expect(toDateOnly(new Date(2026, 6, 27, 23, 30))).toBe('2026-07-27')
  })

  it('la semana calculada de madrugada es la correcta', () => {
    expect(isoWeekOf(new Date(2026, 6, 27, 0, 30))).toEqual({ year: 2026, week: 31 })
  })
})
