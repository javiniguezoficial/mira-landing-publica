// Contrato del borrado administrado de precios (035).
//
// Lo que se fija aquí es la barrera que separa «revisar» de «borrar». Un fallo
// en este módulo no rompe nada visiblemente: hace que un botón destructivo se
// habilite antes de tiempo.

import { describe, expect, it } from 'vitest'
import {
  CONFIRM_PHRASE_ALL,
  CONFIRM_PHRASE_IMPORT,
  DELETION_BATCH_STATUSES,
  DELETION_BATCH_STATUS_LABELS,
  DELETION_MODES,
  DELETION_MODE_LABELS,
  canApplyDeletion,
  canCancelDeletion,
  confirmPhraseFor,
  confirmPhraseForFilters,
  describeDeletionFilters,
  hasAnyDeletionFilter,
  isConfirmPhraseValid,
  isDeletionFinal,
  isDeletionMode,
  normalizeDeletionFilters,
} from './deletion'

// ── Modos y estados ─────────────────────────────────────────────────────────

describe('modos', () => {
  it('son exactamente tres', () => {
    expect([...DELETION_MODES]).toEqual(['import', 'filters', 'all'])
  })

  it('cada uno tiene etiqueta', () => {
    for (const m of DELETION_MODES) expect(DELETION_MODE_LABELS[m]).toBeTruthy()
  })

  it('no acepta un modo inventado', () => {
    expect(isDeletionMode('todo')).toBe(false)
    expect(isDeletionMode('all')).toBe(true)
  })
})

describe('estados', () => {
  // Un lote cerrado no se reabre: si se pudiera, una segunda confirmación
  // borraría precios que ya no están en ninguna copia pendiente.
  it('solo se aplica desde «ready»', () => {
    for (const s of DELETION_BATCH_STATUSES) {
      expect(canApplyDeletion(s), s).toBe(s === 'ready')
      expect(canCancelDeletion(s), s).toBe(s === 'ready')
    }
  })

  it('los estados cerrados son finales', () => {
    expect(isDeletionFinal('completed')).toBe(true)
    expect(isDeletionFinal('completed_with_errors')).toBe(true)
    expect(isDeletionFinal('cancelled')).toBe(true)
    expect(isDeletionFinal('ready')).toBe(false)
  })

  it('todo estado tiene etiqueta visible', () => {
    for (const s of DELETION_BATCH_STATUSES) expect(DELETION_BATCH_STATUS_LABELS[s]).toBeTruthy()
  })
})

// ── Filtros ─────────────────────────────────────────────────────────────────

describe('filtros', () => {
  it('descarta los vacíos y recorta los que hay', () => {
    expect(normalizeDeletionFilters({ lonja: '  Ebro  ', currency: '', unit: undefined }))
      .toEqual({ lonja: 'Ebro' })
  })

  // Es el cerrojo: un borrado «filtrado» sin filtros borraría el histórico
  // entero mientras la pantalla dice otra cosa.
  it('detecta cuándo no hay ningún filtro', () => {
    expect(hasAnyDeletionFilter({})).toBe(false)
    expect(hasAnyDeletionFilter({ lonja: '   ' })).toBe(false)
    expect(hasAnyDeletionFilter({ lonja: 'Ebro' })).toBe(true)
  })

  it('los describe de forma legible para la auditoría', () => {
    expect(describeDeletionFilters({ lonja: 'Ebro', date_from: '2024-01-01' }))
      .toBe('Lonja: Ebro · Desde: 2024-01-01')
    expect(describeDeletionFilters({})).toBe('Sin filtros')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// FRASES DE CONFIRMACIÓN
// ═══════════════════════════════════════════════════════════════════════════

describe('frases de confirmación', () => {
  it('cada modo tiene la suya', () => {
    expect(confirmPhraseFor('all', 608)).toBe(CONFIRM_PHRASE_ALL)
    expect(confirmPhraseFor('import', 21)).toBe(CONFIRM_PHRASE_IMPORT)
    expect(confirmPhraseFor('filters', 90)).toBe('ELIMINAR 90 PRECIOS')
  })

  it('la del borrado filtrado lleva el número dentro', () => {
    expect(confirmPhraseForFilters(1)).toBe('ELIMINAR 1 PRECIO')
    expect(confirmPhraseForFilters(608)).toBe('ELIMINAR 608 PRECIOS')
  })

  it('acepta la frase exacta', () => {
    expect(isConfirmPhraseValid('ELIMINAR 90 PRECIOS', 'filters', 90)).toBe(true)
    expect(isConfirmPhraseValid('ELIMINAR TODOS LOS PRECIOS', 'all', 608)).toBe(true)
  })

  // Nadie debería fallar por un espacio al pegar, pero «eliminar» a secas no
  // puede valer: el punto de la frase es que haya que leerla.
  it('tolera espacios y minúsculas, no otra cosa', () => {
    expect(isConfirmPhraseValid('  eliminar 90 precios  ', 'filters', 90)).toBe(true)
    expect(isConfirmPhraseValid('ELIMINAR  90  PRECIOS', 'filters', 90)).toBe(true)
    expect(isConfirmPhraseValid('eliminar', 'filters', 90)).toBe(false)
    expect(isConfirmPhraseValid('sí', 'filters', 90)).toBe(false)
    expect(isConfirmPhraseValid('', 'filters', 90)).toBe(false)
  })

  // Si entre la vista previa y la confirmación cambiara el recuento, la frase
  // escrita deja de coincidir y el botón se apaga solo.
  it('un recuento distinto invalida la frase ya escrita', () => {
    expect(isConfirmPhraseValid('ELIMINAR 90 PRECIOS', 'filters', 91)).toBe(false)
  })

  // La frase de «todos» no debe poder usarse para un borrado filtrado ni al
  // revés: son barreras distintas para riesgos distintos.
  it('las frases no son intercambiables entre modos', () => {
    expect(isConfirmPhraseValid(CONFIRM_PHRASE_ALL, 'filters', 608)).toBe(false)
    expect(isConfirmPhraseValid('ELIMINAR 608 PRECIOS', 'all', 608)).toBe(false)
    expect(isConfirmPhraseValid(CONFIRM_PHRASE_IMPORT, 'all', 21)).toBe(false)
  })
})
