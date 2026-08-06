// Fechas de los gráficos (037).
//
// El fallo que se corrige: los ejes y tooltips escribían `15 may.` siempre, así
// que en una serie de tres años el 15 de mayo de 2024, el de 2025 y el de 2026
// se leían igual.

import { describe, expect, it } from 'vitest'
import {
  formatChartDate,
  formatChartDateLong,
  formatChartDateShort,
  formatCivilDateLong,
  formatCivilDateNumeric,
  parseCivilDate,
  spansMultipleYears,
  toLocalDate,
} from './chart-dates'

describe('parseCivilDate', () => {
  it('parte una fecha ISO en sus tres números', () => {
    expect(parseCivilDate('2024-05-15')).toEqual({ year: 2024, month: 5, day: 15 })
  })

  it('acepta el 29 de febrero de un bisiesto', () => {
    expect(parseCivilDate('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 })
  })

  // NO se desplaza al 1 de marzo, que es lo que haría `new Date()`. Sobre la
  // fecha de un precio, corregir en silencio es peor que rechazar.
  it('rechaza el 29 de febrero de un año no bisiesto', () => {
    expect(parseCivilDate('2025-02-29')).toBeNull()
  })

  it('rechaza fechas que no existen aunque la sintaxis sea correcta', () => {
    expect(parseCivilDate('2026-02-31')).toBeNull()
    expect(parseCivilDate('2026-13-01')).toBeNull()
    expect(parseCivilDate('2026-00-10')).toBeNull()
  })

  it('rechaza lo que no tiene la forma AAAA-MM-DD', () => {
    for (const raw of ['15/05/2024', '2024-5-15', '2024-05', '', 'ayer', null, undefined]) {
      expect(parseCivilDate(raw), `«${raw}»`).toBeNull()
    }
  })
})

describe('formato corto y largo', () => {
  it('el corto no lleva año: «15 may.»', () => {
    expect(formatChartDateShort('2024-05-15')).toBe('15 may.')
  })

  it('el largo SÍ lleva año: «15 may. 2024»', () => {
    expect(formatChartDateLong('2024-05-15')).toBe('15 may. 2024')
  })

  it('los doce meses se abrevian en español', () => {
    const esperado = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
    esperado.forEach((mes, i) => {
      const mm = String(i + 1).padStart(2, '0')
      expect(formatChartDateShort(`2025-${mm}-01`)).toBe(`1 ${mes}.`)
    })
  })

  it('`formatChartDate` elige uno u otro según el interruptor', () => {
    expect(formatChartDate('2024-05-15', false)).toBe('15 may.')
    expect(formatChartDate('2024-05-15', true)).toBe('15 may. 2024')
  })

  it('caso inválido: devuelve el texto tal cual en lugar de «Invalid Date»', () => {
    expect(formatChartDateShort('no-es-fecha')).toBe('no-es-fecha')
    expect(formatChartDateLong('')).toBe('')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// EL CASO QUE MOTIVA EL BLOQUE
// ═══════════════════════════════════════════════════════════════════════════

describe('mismo día y mes en años distintos', () => {
  const fechas = ['2024-05-15', '2025-05-15', '2026-05-15']

  it('sin año son INDISTINGUIBLES — la razón del cambio', () => {
    const cortas = fechas.map(formatChartDateShort)
    expect(new Set(cortas).size).toBe(1)
  })

  it('con año son las tres distintas', () => {
    const largas = fechas.map(formatChartDateLong)
    expect(new Set(largas).size).toBe(3)
    expect(largas).toEqual(['15 may. 2024', '15 may. 2025', '15 may. 2026'])
  })
})

describe('spansMultipleYears', () => {
  it('un periodo corto dentro del mismo año NO necesita el año', () => {
    expect(spansMultipleYears(['2026-01-05', '2026-01-12', '2026-01-19'])).toBe(false)
  })

  it('un periodo multianual SÍ lo necesita', () => {
    expect(spansMultipleYears(['2024-05-15', '2025-05-15', '2026-05-15'])).toBe(true)
  })

  // Tres semanas a caballo de fin de año son un periodo corto y aun así cruzan
  // dos años: por eso se mira el AÑO de cada punto y no la distancia entre el
  // primero y el último.
  it('tres semanas de diciembre a enero cruzan dos años', () => {
    expect(spansMultipleYears(['2025-12-20', '2025-12-31', '2026-01-10'])).toBe(true)
  })

  it('una sola fecha no cruza nada', () => {
    expect(spansMultipleYears(['2026-03-01'])).toBe(false)
  })

  it('una serie vacía no cruza nada', () => {
    expect(spansMultipleYears([])).toBe(false)
  })

  // Una fecha ilegible no debe decidir el formato de todo el eje.
  it('ignora las fechas que no se pueden leer', () => {
    expect(spansMultipleYears(['2026-01-05', null, 'basura', '2026-02-05'])).toBe(false)
    expect(spansMultipleYears(['2025-01-05', undefined, '2026-02-05'])).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ZONA HORARIA
// ═══════════════════════════════════════════════════════════════════════════
//
// `new Date('2024-05-15')` es medianoche UTC. Formateada en una zona con
// desfase NEGATIVO da el día 14. `recorded_at` es `date`, una fecha civil sin
// hora ni zona, así que el día que se enseña debe ser SIEMPRE el que dice la
// base — vea quien lo vea y desde donde lo vea.

describe('no hay desplazamiento por zona horaria', () => {
  it('el día formateado es el día escrito, no el de UTC', () => {
    expect(formatChartDateLong('2024-05-15')).toContain('15 ')
    expect(formatChartDateShort('2024-01-01')).toBe('1 ene.')
    expect(formatChartDateLong('2024-12-31')).toBe('31 dic. 2024')
  })

  it('`toLocalDate` construye la fecha en horario LOCAL, no en UTC', () => {
    const d = toLocalDate('2024-05-15')!
    expect(d.getFullYear()).toBe(2024)
    expect(d.getMonth()).toBe(4)
    expect(d.getDate()).toBe(15)
    expect(d.getHours()).toBe(0)
  })

  // REGRESIÓN. Documenta POR QUÉ no se usa `new Date(iso)`: esa cadena la
  // interpreta el parser como un INSTANTE en UTC, y en cualquier zona al oeste
  // de Greenwich su día local es el 14. El test no depende de la zona en la que
  // corra: comprueba las dos naturalezas, no una diferencia concreta.
  it('`new Date(iso)` es un instante UTC; `toLocalDate` es una fecha civil', () => {
    const utc = new Date('2024-05-15')
    expect(utc.getUTCHours()).toBe(0)
    expect(utc.getUTCDate()).toBe(15)

    const local = toLocalDate('2024-05-15')!
    expect(local.getHours()).toBe(0)
    expect(local.getDate()).toBe(15)

    // Y lo que de verdad importa: el texto es el mismo se mire desde donde se
    // mire, porque se compone de los números de la cadena y de nada más.
    expect(formatChartDateLong('2024-05-15')).toBe('15 may. 2024')
  })
})

describe('formatos para texto y tabla', () => {
  it('el largo legible se escribe con preposiciones', () => {
    expect(formatCivilDateLong('2024-05-15')).toBe('15 de mayo de 2024')
  })

  it('el numérico rellena con ceros', () => {
    expect(formatCivilDateNumeric('2024-05-05')).toBe('05/05/2024')
    expect(formatCivilDateNumeric('2024-12-31')).toBe('31/12/2024')
  })
})
