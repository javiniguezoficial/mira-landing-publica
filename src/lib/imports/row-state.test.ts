// Derivación del estado de una fila de importación (049).
//
// Cada caso de aquí se corresponde con uno verificado contra la base remota,
// sobre fixtures sintéticos y con rollback. El de verdad importante es el
// tercero: 100 filas válidas, 10 chocando con precios que ya existían →
// `imported_rows = 90`, batch `completed_with_errors`, y la derivación
// devolviendo 90 importadas y 10 que siguen en 'valid'.

import { describe, expect, it } from 'vitest'
import { deriveImportRowStatus, hasImportedPrice } from './row-state'

describe('deriveImportRowStatus', () => {
  it('fila válida que entró: hay precio ⇒ importada', () => {
    expect(deriveImportRowStatus('valid', true)).toBe('imported')
  })

  it('fila válida que chocó con un precio existente: sigue en valid', () => {
    // `on conflict do nothing` no devuelve la fila, así que no hay precio que
    // la referencie. Es exactamente lo que hacía el código anterior: el UPDATE
    // no la tocaba y se quedaba en 'valid'.
    expect(deriveImportRowStatus('valid', false)).toBe('valid')
  })

  it('fila inválida: el estado almacenado manda siempre', () => {
    expect(deriveImportRowStatus('invalid', false)).toBe('invalid')
    // Ni siquiera con un precio detrás: si eso pasara, el problema estaría en
    // la validación y taparlo aquí lo escondería.
    expect(deriveImportRowStatus('invalid', true)).toBe('invalid')
  })

  it('fila duplicada dentro del archivo: el estado almacenado manda', () => {
    expect(deriveImportRowStatus('duplicate', false)).toBe('duplicate')
    expect(deriveImportRowStatus('duplicate', true)).toBe('duplicate')
  })

  it('histórico anterior a la 049: se sigue viendo igual que antes', () => {
    // Las filas viejas llevan 'imported' guardado. Incluidas las 75.002 que en
    // producción lo dicen sin tener ya ningún precio detrás, porque la FK
    // `on delete set null` limpió `imported_record_id` al borrarse esos precios
    // y nadie tocó `status`. No se corrigen aquí.
    expect(deriveImportRowStatus('imported', false)).toBe('imported')
    expect(deriveImportRowStatus('imported', true)).toBe('imported')
  })

  it('no inventa estados fuera del dominio', () => {
    const dominio = new Set(['valid', 'invalid', 'duplicate', 'imported'])
    for (const stored of ['valid', 'invalid', 'duplicate', 'imported'] as const) {
      for (const hasPrice of [true, false]) {
        expect(dominio.has(deriveImportRowStatus(stored, hasPrice))).toBe(true)
      }
    }
  })
})

describe('hasImportedPrice', () => {
  it('lee el embed inverso de PostgREST', () => {
    // Verificado contra la API real: `precios: [{ id: '…' }]`.
    expect(hasImportedPrice([{ id: 'a' }])).toBe(true)
    expect(hasImportedPrice([])).toBe(false)
  })

  it('acepta también la forma colapsada a objeto', () => {
    expect(hasImportedPrice({ id: 'a' })).toBe(true)
  })

  it('trata la ausencia como «no importada»', () => {
    expect(hasImportedPrice(null)).toBe(false)
    expect(hasImportedPrice(undefined)).toBe(false)
  })
})
