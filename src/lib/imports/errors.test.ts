// Saneamiento de los errores de la importación.
//
// Lo que se protege aquí es una sola promesa: por la interfaz no sale nada que
// venga de dentro. Ni SQL, ni stack, ni rutas del bundle, ni el texto crudo de
// PostgreSQL. Lo único que puede cruzar es el digest de Next.

import { describe, expect, it } from 'vitest'
import {
  IMPORT_COMMIT_ERROR_CODES,
  IMPORT_TIMEOUT_ERROR,
  IMPORT_UNEXPECTED_ERROR,
  STATEMENT_TIMEOUT_CODE,
  safeCommitErrorMessage,
  safeErrorReference,
  toSafeImportError,
} from './errors'

describe('toSafeImportError', () => {
  it('devuelve el mensaje genérico ante cualquier excepción', () => {
    for (const e of [
      new Error('connect ECONNREFUSED 10.0.0.7:5432'),
      new TypeError('Failed to fetch'),
      'una cadena suelta',
      null,
      undefined,
      { code: 'PGRST301' },
    ]) {
      expect(toSafeImportError(e).message).toBe(IMPORT_UNEXPECTED_ERROR)
    }
  })

  it('nunca filtra el mensaje ni el stack del error original', () => {
    const e = new Error(
      'duplicate key value violates unique constraint "product_price_records_natural_key"',
    )
    e.stack = 'Error: ...\n    at /app/.next/server/chunks/1234.js:9:1'

    const safe = toSafeImportError(e)
    const texto = `${safe.message} ${safe.reference ?? ''}`

    expect(texto).not.toContain('duplicate key')
    expect(texto).not.toContain('product_price_records')
    expect(texto).not.toContain('.next')
    expect(texto).not.toContain('/app/')
  })

  it('no menciona el tamaño del archivo: la causa de una excepción es desconocida', () => {
    // Esto es la regla explícita del encargo. Con el transporte ya en 12 MB, un
    // fallo puede venir de la red, del parser o de la base; contestar «el
    // archivo es demasiado grande» mandaría a partir un fichero que está bien.
    expect(IMPORT_UNEXPECTED_ERROR).not.toMatch(/tamaño|MB|grande|supera/i)
  })

  it('dice expresamente que no se ha importado nada', () => {
    expect(IMPORT_UNEXPECTED_ERROR).toContain('No se ha importado ningún dato')
  })
})

describe('safeErrorReference', () => {
  it('acepta el digest de Next, con y sin código de error', () => {
    expect(safeErrorReference({ digest: '2434070509' })).toBe('2434070509')
    expect(safeErrorReference({ digest: '2434070509@E394' })).toBe('2434070509@E394')
  })

  it('rechaza cualquier cosa que no tenga forma de digest', () => {
    for (const digest of [
      'Error: relation "profiles" does not exist',
      '<script>alert(1)</script>',
      'esto.no.es-un-digest',
      '',
      '  2434070509  ',
      '2434070509@X394',
    ]) {
      expect(safeErrorReference({ digest })).toBeNull()
    }
  })

  it('devuelve null cuando no hay digest', () => {
    expect(safeErrorReference(new Error('x'))).toBeNull()
    expect(safeErrorReference(null)).toBeNull()
    expect(safeErrorReference('cadena')).toBeNull()
    expect(safeErrorReference({ digest: 42 })).toBeNull()
  })
})

describe('safeCommitErrorMessage', () => {
  it('deja pasar los mensajes que lanza commit_market_import a propósito', () => {
    const propios: [string, string][] = [
      ['42501', 'Solo un administrador de plataforma puede importar precios.'],
      ['P0002', 'No se ha encontrado la importación indicada.'],
      ['22023', 'Esta importación ya no se puede confirmar (estado actual: completed).'],
    ]
    for (const [code, message] of propios) {
      expect(IMPORT_COMMIT_ERROR_CODES.has(code)).toBe(true)
      expect(safeCommitErrorMessage(code, message)).toBe(message)
    }
  })

  it('explica el timeout de sentencia sin nombrar nada interno', () => {
    const msg = safeCommitErrorMessage(
      STATEMENT_TIMEOUT_CODE,
      'canceling statement due to statement timeout',
    )
    expect(msg).toBe(IMPORT_TIMEOUT_ERROR)
    expect(msg).not.toContain('statement')
    expect(msg).toContain('No se ha importado ningún dato')
  })

  it('oculta el texto de PostgreSQL de cualquier error no previsto', () => {
    const sql =
      'insert or update on table "product_price_records" violates foreign key '
      + 'constraint "product_price_records_product_id_fkey"'

    const msg = safeCommitErrorMessage('23503', sql)

    expect(msg).toBe(IMPORT_UNEXPECTED_ERROR)
    expect(msg).not.toContain('product_price_records')
    expect(msg).not.toContain('constraint')
    expect(msg).not.toContain('insert or update')
  })

  it('cae al genérico cuando no hay código, aunque venga mensaje', () => {
    expect(safeCommitErrorMessage(null, 'relation "profiles" does not exist'))
      .toBe(IMPORT_UNEXPECTED_ERROR)
    expect(safeCommitErrorMessage(undefined, undefined)).toBe(IMPORT_UNEXPECTED_ERROR)
  })

  it('no deja pasar un código nuestro sin mensaje', () => {
    expect(safeCommitErrorMessage('42501', '')).toBe(IMPORT_UNEXPECTED_ERROR)
    expect(safeCommitErrorMessage('42501', null)).toBe(IMPORT_UNEXPECTED_ERROR)
  })
})
