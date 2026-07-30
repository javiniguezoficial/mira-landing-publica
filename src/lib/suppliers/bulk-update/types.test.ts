// Contrato del formato de actualización masiva (Fase 3.2).
//
// Lo que se fija aquí es lo que decide si una columna del fichero se escribe o
// se ignora. Una regresión en este módulo no rompe nada visiblemente: hace que
// una columna que nadie autorizó empiece a escribirse.

import { describe, expect, it } from 'vitest'
import {
  BATCH_STATUS_LABELS,
  CLEAR_TOKEN,
  ID_HEADER,
  IGNORED_HEADERS,
  ROW_STATUS_LABELS,
  UPDATABLE_FIELDS,
  UPDATE_BATCH_STATUSES,
  UPDATE_ROW_STATUSES,
  canApplyBatch,
  canCancelBatch,
  classifyHeader,
  fieldSpec,
  isBatchFinal,
  normalizeHeader,
  resolveBatchStatus,
  summarizeRows,
  type NormalizedUpdateRow,
} from './types'

// ── Cabeceras ───────────────────────────────────────────────────────────────

describe('reconocimiento de cabeceras', () => {
  it('acepta la cabecera exacta de la exportación administrativa', () => {
    expect(classifyHeader(ID_HEADER)).toEqual({ role: 'id' })
    expect(classifyHeader('Notas internas')).toEqual({ role: 'field', field: 'notes' })
    expect(classifyHeader('Código postal')).toEqual({ role: 'field', field: 'postal_code' })
    expect(classifyHeader('Unidad producción')).toEqual({ role: 'field', field: 'produccion_unit' })
  })

  // Quien edita en Excel arrastra espacios y a veces pierde las tildes al
  // pasar por otra herramienta. Eso no puede convertir una columna válida en
  // desconocida.
  it('no depende de tildes, mayúsculas ni espacios de más', () => {
    expect(classifyHeader('  CODIGO POSTAL  ')).toEqual({ role: 'field', field: 'postal_code' })
    expect(classifyHeader('id  interno')).toEqual({ role: 'id' })
    expect(classifyHeader('NOTAS INTERNAS')).toEqual({ role: 'field', field: 'notes' })
  })

  it('acepta también el nombre interno, para ficheros generados por script', () => {
    expect(classifyHeader('supplier_market_id')).toEqual({ role: 'field', field: 'supplier_market_id' })
    expect(classifyHeader('is_active')).toEqual({ role: 'field', field: 'is_active' })
    expect(classifyHeader('id')).toEqual({ role: 'id' })
  })

  // «Clasificación» es el camino ya montado y «Fecha de alta» no es editable.
  // Vienen en la exportación, así que NO pueden romper el fichero: se ignoran.
  it('las columnas derivadas y de auditoría se ignoran, no rompen', () => {
    for (const h of IGNORED_HEADERS) {
      expect(classifyHeader(h), `«${h}» debería ignorarse`).toEqual({ role: 'ignored' })
    }
  })

  it('lo que no conoce lo declara desconocido, nunca lo adivina', () => {
    expect(classifyHeader('Comentarios del comercial')).toEqual({ role: 'unknown' })
    expect(classifyHeader('nombre_2')).toEqual({ role: 'unknown' })
    expect(classifyHeader('')).toEqual({ role: 'unknown' })
  })

  it('normalizeHeader no colapsa cabeceras distintas', () => {
    const claves = UPDATABLE_FIELDS.map((f) => normalizeHeader(f.header))
    expect(new Set(claves).size).toBe(claves.length)
  })
})

// ── Allowlist ───────────────────────────────────────────────────────────────

describe('allowlist de campos', () => {
  // Si alguno de estos volviera a la lista, una actualización masiva podría
  // reescribir la fecha de alta o apuntar la fila a otro proveedor.
  it('los campos prohibidos NO están', () => {
    const campos = UPDATABLE_FIELDS.map((f) => f.field) as string[]
    for (const prohibido of [
      'id', 'created_at', 'updated_at',
      'category', 'family', 'subfamily', 'produccion', 'market_id',
    ]) {
      expect(campos, `«${prohibido}» no puede ser actualizable`).not.toContain(prohibido)
    }
  })

  // `name`, `country` e `is_active` son NOT NULL en `suppliers`.
  it('solo los campos nullable admiten vaciado', () => {
    expect(fieldSpec('name').clearable).toBe(false)
    expect(fieldSpec('country').clearable).toBe(false)
    expect(fieldSpec('is_active').clearable).toBe(false)

    for (const campo of ['email', 'notes', 'latitude', 'supplier_market_id'] as const) {
      expect(fieldSpec(campo).clearable, `«${campo}» debería poder vaciarse`).toBe(true)
    }
  })

  it('cada campo tiene cabecera y etiqueta legibles', () => {
    for (const spec of UPDATABLE_FIELDS) {
      expect(spec.header.length).toBeGreaterThan(2)
      expect(spec.label.length).toBeGreaterThan(2)
    }
  })

  it('no hay cabeceras repetidas', () => {
    const cabeceras = UPDATABLE_FIELDS.map((f) => f.header)
    expect(new Set(cabeceras).size).toBe(cabeceras.length)
  })

  it('la palabra de borrado es inconfundible', () => {
    expect(CLEAR_TOKEN).toBe('__CLEAR__')
    // Nadie escribe esto por accidente, y no puede confundirse con un valor.
    expect(classifyHeader(CLEAR_TOKEN)).toEqual({ role: 'unknown' })
  })
})

// ── Estados ─────────────────────────────────────────────────────────────────

function fila(status: NormalizedUpdateRow['status']): NormalizedUpdateRow {
  return {
    line: 2,
    status,
    supplierId: null,
    supplierName: null,
    raw: {},
    currentValues: {},
    changes: {},
    updatedFields: [],
    errors: [],
  }
}

describe('estado del batch', () => {
  it('con al menos una fila aplicable queda pendiente de confirmar', () => {
    expect(resolveBatchStatus(summarizeRows([fila('valid'), fila('invalid')]))).toBe('ready')
  })

  // Un fichero perfecto que no cambia nada NO es un fichero inválido. Decirle
  // «inválido» a quien ha subido la exportación sin tocarla es mentirle.
  it('si todo coincide ya, es «sin cambios» y no «inválido»', () => {
    expect(resolveBatchStatus(summarizeRows([fila('unchanged'), fila('unchanged')]))).toBe('no_changes')
  })

  it('sin nada aplicable pero con errores, es inválido', () => {
    expect(resolveBatchStatus(summarizeRows([fila('invalid'), fila('duplicate_id')]))).toBe('invalid')
  })

  it('solo se aplica desde «ready»', () => {
    for (const estado of UPDATE_BATCH_STATUSES) {
      expect(canApplyBatch(estado)).toBe(estado === 'ready')
    }
  })

  it('un batch cerrado no se puede descartar ni reabrir', () => {
    expect(canCancelBatch('completed')).toBe(false)
    expect(canCancelBatch('completed_with_errors')).toBe(false)
    expect(isBatchFinal('completed')).toBe(true)
    expect(isBatchFinal('ready')).toBe(false)
  })

  it('todo estado tiene etiqueta visible', () => {
    for (const e of UPDATE_BATCH_STATUSES) expect(BATCH_STATUS_LABELS[e]).toBeTruthy()
    for (const e of UPDATE_ROW_STATUSES) expect(ROW_STATUS_LABELS[e]).toBeTruthy()
  })
})

describe('recuento', () => {
  it('cuenta cada estado por separado', () => {
    const resumen = summarizeRows([
      fila('valid'), fila('valid'), fila('unchanged'),
      fila('invalid'), fila('duplicate_id'), fila('duplicate_id'),
    ])
    expect(resumen).toEqual({
      totalRows: 6,
      validRows: 2,
      unchangedRows: 1,
      invalidRows: 1,
      duplicateRows: 2,
    })
  })
})
