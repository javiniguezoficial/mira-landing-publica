// Validación de la actualización masiva de proveedores (Fase 3.2).
//
// Módulo PURO: sin Next, sin Supabase, sin `xlsx`. Recibe las celdas ya leídas,
// el estado actual de los proveedores implicados y la taxonomía, y decide qué
// pasa con cada fila. Que sea puro es lo que permite probar los casos feos
// —taxonomía incoherente, `__CLEAR__` prohibido, ID repetido— sin generar
// ficheros binarios ni tocar la base.
//
// ── La regla que gobierna todo ──────────────────────────────────────────────
//
// Una fila NUNCA se aplica «por defecto». Para que se escriba algo tienen que
// darse las cuatro condiciones a la vez:
//
//   1. la fila trae un UUID válido,
//   2. ese UUID corresponde a un proveedor que existe,
//   3. el UUID no se repite en el fichero,
//   4. al menos un campo permitido trae un valor DISTINTO del guardado.
//
// Si falta cualquiera de las cuatro, la fila queda fuera y se explica por qué.

import {
  CLEAR_TOKEN,
  classifyHeader,
  fieldSpec,
  type NormalizedUpdateRow,
  type NormalizedValue,
  type UpdatableField,
  type UpdateRowError,
} from './types'
import type { CellRead, ParsedUpdateRow } from './workbook'

// ── Estado actual de un proveedor ───────────────────────────────────────────
//
// Solo los campos de la allowlist. No se trae la fila entera: lo que no se
// puede actualizar tampoco hace falta para comparar.

export interface SupplierSnapshot {
  id: string
  name: string
  email: string | null
  phone: string | null
  website: string | null
  tax_id: string | null
  country: string
  region: string | null
  city: string | null
  postal_code: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  produccion_value: number | null
  produccion_unit: string | null
  medida: string | null
  notes: string | null
  is_active: boolean
  supplier_market_id: string | null
  supplier_category_id: string | null
  supplier_family_id: string | null
  supplier_subfamily_id: string | null
}

/**
 * Taxonomía, aplanada para poder validar la cadena completa sin consultas.
 *
 * Cada mapa va de identificador a identificador del PADRE. Con eso basta para
 * responder a la única pregunta que importa: «¿esta categoría cuelga de este
 * mercado?».
 */
export interface TaxonomyCatalog {
  markets: ReadonlySet<string>
  /** id de categoría → id de su mercado. */
  categories: ReadonlyMap<string, string>
  /** id de familia → id de su categoría. */
  families: ReadonlyMap<string, string>
  /** id de subfamilia → id de su familia. */
  subfamilies: ReadonlyMap<string, string>
}

// ── Reglas de formato ───────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// El mismo que usan `createSupplier` y `updateSupplier`. No se endurece aquí:
// dos validaciones distintas para el mismo campo acaban rechazando por una vía
// lo que la otra acepta.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_RE = /^https?:\/\/.+/

/** Techo de longitud de cualquier texto. `notes` es el campo largo real. */
export const MAX_TEXT_LENGTH = 2_000
export const MAX_NOTES_LENGTH = 5_000

/** Unidades admitidas, las mismas que ofrece el formulario individual. */
const PRODUCTION_UNITS = new Map<string, string>([
  ['kg', 'kg'],
  ['tn', 'TN'],
])

const TRUE_TOKENS = new Set(['si', 'sí', 'true', '1', 'activo', 'verdadero', 'yes'])
const FALSE_TOKENS = new Set(['no', 'false', '0', 'inactivo', 'falso'])

// ── Plan de columnas ────────────────────────────────────────────────────────

export interface PlannedField {
  field: UpdatableField
  index: number
  header: string
}

export interface ColumnPlan {
  /** Índice de la columna del identificador. `null` si no está. */
  idIndex: number | null
  fields: PlannedField[]
  /** Cabeceras reconocidas que NO se escriben (derivadas o de auditoría). */
  ignored: string[]
  /** Cabeceras que no significan nada aquí. */
  unknown: string[]
  /** El mismo campo aparece en dos columnas: no se puede decidir cuál manda. */
  ambiguous: string[]
}

export function planColumns(headers: string[]): ColumnPlan {
  const fields: PlannedField[] = []
  const ignored: string[] = []
  const unknown: string[] = []
  const ambiguous: string[] = []
  const vistos = new Map<UpdatableField, string>()
  let idIndex: number | null = null

  headers.forEach((header, index) => {
    if (header.trim() === '') return
    const clase = classifyHeader(header)

    switch (clase.role) {
      case 'id':
        // Dos columnas de identificador es la peor ambigüedad posible: decidiría
        // sobre QUÉ proveedor se escribe. La primera manda y la segunda se
        // denuncia.
        if (idIndex === null) idIndex = index
        else ambiguous.push(header)
        break
      case 'field': {
        const previo = vistos.get(clase.field)
        if (previo !== undefined) {
          ambiguous.push(header)
          break
        }
        vistos.set(clase.field, header)
        fields.push({ field: clase.field, index, header })
        break
      }
      case 'ignored':
        ignored.push(header)
        break
      default:
        unknown.push(header)
    }
  })

  return { idIndex, fields, ignored, unknown, ambiguous }
}

// ── Conversión de una celda ─────────────────────────────────────────────────

type ParseOutcome =
  | { kind: 'skip' }
  | { kind: 'value'; value: NormalizedValue }
  | { kind: 'error'; message: string }

/**
 * Número escrito por una persona.
 *
 * Se acepta punto O coma decimal, pero NUNCA los dos en el mismo número:
 * «1.482,5» es mil cuatrocientos ochenta y dos coma cinco en España y uno coma
 * cuatro ocho dos en medio mundo. Adivinar ahí es cómo se multiplica por mil la
 * producción de un proveedor sin que nadie lo note. Misma regla que ya usa la
 * importación de precios.
 */
export function parseDecimal(raw: string): number | null {
  const texto = raw.trim()
  if (texto === '') return null
  if (texto.includes('.') && texto.includes(',')) return null
  const normalizado = texto.replace(',', '.')
  if (!/^[+-]?\d+(\.\d+)?$/.test(normalizado)) return null
  const n = Number(normalizado)
  return Number.isFinite(n) ? n : null
}

export function parseBooleanCell(raw: string): boolean | null {
  const texto = raw.trim().toLowerCase()
  if (TRUE_TOKENS.has(texto)) return true
  if (FALSE_TOKENS.has(texto)) return false
  return null
}

function parseCell(field: UpdatableField, cell: CellRead): ParseOutcome {
  const spec = fieldSpec(field)

  if (cell.error) {
    return { kind: 'error', message: 'La celda contiene un error de Excel (#REF!, #N/A…).' }
  }
  if (cell.formula) {
    return {
      kind: 'error',
      message: 'La celda contiene una fórmula. Pega los valores como texto antes de subir el archivo.',
    }
  }

  const texto = cell.text.trim()

  // Celda vacía = no tocar. NUNCA borrar.
  if (texto === '') return { kind: 'skip' }

  if (texto === CLEAR_TOKEN) {
    if (!spec.clearable) {
      return {
        kind: 'error',
        message: `«${spec.label}» no se puede vaciar: es un campo obligatorio del proveedor.`,
      }
    }
    return { kind: 'value', value: null }
  }

  switch (spec.kind) {
    case 'number': {
      const n = parseDecimal(texto)
      if (n === null) {
        return { kind: 'error', message: `«${texto}» no es un número válido. Usa punto o coma decimal, no los dos.` }
      }
      if (field === 'latitude' && (n < -90 || n > 90)) {
        return { kind: 'error', message: `Latitud fuera de rango: ${n}. Debe estar entre -90 y 90.` }
      }
      if (field === 'longitude' && (n < -180 || n > 180)) {
        return { kind: 'error', message: `Longitud fuera de rango: ${n}. Debe estar entre -180 y 180.` }
      }
      if (field === 'produccion_value' && n < 0) {
        return { kind: 'error', message: 'La producción no puede ser negativa.' }
      }
      return { kind: 'value', value: n }
    }

    case 'boolean': {
      const b = parseBooleanCell(texto)
      if (b === null) {
        return {
          kind: 'error',
          message: `«${texto}» no es un valor de activo reconocible. Escribe «Sí» o «No».`,
        }
      }
      return { kind: 'value', value: b }
    }

    case 'uuid': {
      if (!UUID_RE.test(texto)) {
        return { kind: 'error', message: `«${texto}» no es un identificador válido de taxonomía.` }
      }
      return { kind: 'value', value: texto.toLowerCase() }
    }

    default: {
      const limite = field === 'notes' ? MAX_NOTES_LENGTH : MAX_TEXT_LENGTH
      if (texto.length > limite) {
        return { kind: 'error', message: `«${spec.label}» supera los ${limite} caracteres.` }
      }
      if (field === 'email' && !EMAIL_RE.test(texto)) {
        return { kind: 'error', message: `«${texto}» no es un correo válido.` }
      }
      if (field === 'website' && !URL_RE.test(texto)) {
        return { kind: 'error', message: 'La web debe empezar por http:// o https://.' }
      }
      if (field === 'produccion_unit') {
        const unidad = PRODUCTION_UNITS.get(texto.toLowerCase())
        if (!unidad) {
          return { kind: 'error', message: `«${texto}» no es una unidad admitida. Usa «kg» o «TN».` }
        }
        return { kind: 'value', value: unidad }
      }
      return { kind: 'value', value: texto }
    }
  }
}

// ── Comparación ─────────────────────────────────────────────────────────────

/**
 * ¿El valor nuevo es realmente distinto del guardado?
 *
 * Es lo que separa `valid` de `unchanged`, y por tanto lo que hace idempotente
 * el bloque: subir dos veces el mismo fichero deja todas las filas en
 * `unchanged` la segunda vez, sin escribir nada.
 */
export function sameValue(actual: NormalizedValue, nuevo: NormalizedValue): boolean {
  if (actual === null || actual === undefined) return nuevo === null
  if (nuevo === null) return false
  if (typeof actual === 'number' || typeof nuevo === 'number') {
    return Number(actual) === Number(nuevo)
  }
  if (typeof actual === 'boolean' || typeof nuevo === 'boolean') {
    return Boolean(actual) === Boolean(nuevo)
  }
  return String(actual) === String(nuevo)
}

function currentValue(snapshot: SupplierSnapshot, field: UpdatableField): NormalizedValue {
  const valor = (snapshot as unknown as Record<string, unknown>)[field]
  if (valor === undefined || valor === null) return null
  if (typeof valor === 'number' || typeof valor === 'boolean' || typeof valor === 'string') return valor
  return String(valor)
}

// ── Taxonomía ───────────────────────────────────────────────────────────────

const TAXONOMY_FIELDS: UpdatableField[] = [
  'supplier_market_id',
  'supplier_category_id',
  'supplier_family_id',
  'supplier_subfamily_id',
]

/**
 * Comprueba la cadena completa sobre el estado FINAL de la fila.
 *
 * ── Por qué sobre el estado final y no sobre lo que trae el fichero ────────
 *
 * Porque una fila puede cambiar solo la subfamilia y dejar el resto como está.
 * Validar únicamente lo que viene escrito dejaría pasar una subfamilia que no
 * cuelga de la familia que ya tiene guardada el proveedor.
 *
 * ── Por qué NO se limpian los hijos automáticamente ────────────────────────
 *
 * El formulario individual sí lo hace: al cambiar de mercado, los desplegables
 * de abajo se vacían solos, y quien lo hace lo está VIENDO. Aquí nadie ve nada
 * hasta la vista previa, y un borrado que nadie pidió sobre miles de filas es
 * indistinguible de un fallo. Si hay que vaciar un nivel, se escribe
 * `__CLEAR__` y se ve en la vista previa antes de confirmar.
 */
export function validateTaxonomyChain(
  final: {
    market: string | null
    category: string | null
    family: string | null
    subfamily: string | null
  },
  catalog: TaxonomyCatalog,
): UpdateRowError[] {
  const errores: UpdateRowError[] = []

  if (final.market !== null && !catalog.markets.has(final.market)) {
    errores.push({ column: 'Mercado ID', message: 'El mercado indicado no existe o no está activo.' })
  }
  if (final.category !== null && !catalog.categories.has(final.category)) {
    errores.push({ column: 'Categoría ID', message: 'La categoría indicada no existe o no está activa.' })
  }
  if (final.family !== null && !catalog.families.has(final.family)) {
    errores.push({ column: 'Familia ID', message: 'La familia indicada no existe o no está activa.' })
  }
  if (final.subfamily !== null && !catalog.subfamilies.has(final.subfamily)) {
    errores.push({ column: 'Subfamilia ID', message: 'La subfamilia indicada no existe o no está activa.' })
  }
  if (errores.length > 0) return errores

  if (final.market === null && (final.category !== null || final.family !== null || final.subfamily !== null)) {
    errores.push({
      column: 'Mercado ID',
      message:
        'El proveedor quedaría sin mercado pero con categoría, familia o subfamilia. ' +
        `Vacía también los niveles inferiores con ${CLEAR_TOKEN}.`,
    })
    return errores
  }

  if (final.category !== null && catalog.categories.get(final.category) !== final.market) {
    errores.push({
      column: 'Categoría ID',
      message: 'La categoría no pertenece al mercado que quedaría asignado.',
    })
  }
  if (final.family !== null) {
    if (final.category === null) {
      errores.push({
        column: 'Familia ID',
        message:
          'El proveedor quedaría con familia pero sin categoría. ' +
          `Vacía también la familia y la subfamilia con ${CLEAR_TOKEN}.`,
      })
    } else if (catalog.families.get(final.family) !== final.category) {
      errores.push({
        column: 'Familia ID',
        message: 'La familia no pertenece a la categoría que quedaría asignada.',
      })
    }
  }
  if (final.subfamily !== null) {
    if (final.family === null) {
      errores.push({
        column: 'Subfamilia ID',
        message:
          'El proveedor quedaría con subfamilia pero sin familia. ' +
          `Vacía también la subfamilia con ${CLEAR_TOKEN}.`,
      })
    } else if (catalog.subfamilies.get(final.subfamily) !== final.family) {
      errores.push({
        column: 'Subfamilia ID',
        message: 'La subfamilia no pertenece a la familia que quedaría asignada.',
      })
    }
  }

  return errores
}

// ── Validación de una fila ──────────────────────────────────────────────────

export interface ValidateRowContext {
  plan: ColumnPlan
  suppliers: ReadonlyMap<string, SupplierSnapshot>
  taxonomy: TaxonomyCatalog
}

const SIN_ID: UpdateRowError = {
  column: 'ID interno',
  message:
    'Falta el ID interno. Es obligatorio en todas las filas: sin él no hay forma segura de ' +
    'saber a qué proveedor se refiere.',
}

/**
 * Valida UNA fila, sin saber nada de las demás.
 *
 * La repetición de identificadores NO se decide aquí: hace falta el fichero
 * entero para saberlo. Ver `validateUpdateRows`.
 */
export function validateUpdateRow(
  parsed: ParsedUpdateRow,
  ctx: ValidateRowContext,
): NormalizedUpdateRow {
  const { plan, suppliers, taxonomy } = ctx

  // `raw` se construye SOLO con las cabeceras que hemos reconocido. Nunca se
  // usa una clave que venga del fichero: es la vía por la que un `__proto__`
  // llegaría a un objeto y de ahí a `jsonb`.
  const raw: Record<string, string> = {}
  if (plan.idIndex !== null) {
    raw['ID interno'] = parsed.cells[plan.idIndex]?.text ?? ''
  }
  for (const columna of plan.fields) {
    raw[columna.header] = parsed.cells[columna.index]?.text ?? ''
  }

  const base = {
    line: parsed.line,
    raw,
    currentValues: {} as Record<string, NormalizedValue>,
    changes: {} as Record<string, NormalizedValue>,
    updatedFields: [] as UpdatableField[],
  }

  // ── 1. Identificador ──────────────────────────────────────────────────────
  const idTexto = (plan.idIndex !== null ? parsed.cells[plan.idIndex]?.text ?? '' : '').trim()

  if (idTexto === '') {
    return { ...base, status: 'invalid', supplierId: null, supplierName: null, errors: [SIN_ID] }
  }
  if (!UUID_RE.test(idTexto)) {
    return {
      ...base,
      status: 'invalid',
      supplierId: null,
      supplierName: null,
      errors: [{ column: 'ID interno', message: `«${idTexto}» no es un ID interno válido.` }],
    }
  }

  const supplierId = idTexto.toLowerCase()

  // ── 2. El proveedor tiene que existir ─────────────────────────────────────
  const snapshot = suppliers.get(supplierId)
  if (!snapshot) {
    return {
      ...base,
      status: 'invalid',
      // `supplierId` se deja a null A PROPÓSITO: la columna
      // `supplier_update_rows.supplier_id` tiene una clave foránea contra
      // `suppliers`, y guardar aquí un UUID que no existe haría fallar el
      // INSERT y con él el batch entero. El identificador escrito NO se pierde:
      // sigue en `raw_data['ID interno']`, que es de donde lo saca el informe
      // para que se vea dónde estaba la errata.
      supplierId: null,
      supplierName: null,
      errors: [{
        column: 'ID interno',
        message: 'No existe ningún proveedor con este ID. No se crea ninguno nuevo.',
      }],
    }
  }

  // ── 3. Campos ─────────────────────────────────────────────────────────────
  const errors: UpdateRowError[] = []
  const currentValues: Record<string, NormalizedValue> = {}
  const changes: Record<string, NormalizedValue> = {}
  const updatedFields: UpdatableField[] = []

  for (const columna of plan.fields) {
    const celda = parsed.cells[columna.index]
    if (!celda) continue

    const resultado = parseCell(columna.field, celda)
    if (resultado.kind === 'skip') continue
    if (resultado.kind === 'error') {
      errors.push({ column: columna.header, message: resultado.message })
      continue
    }

    const actual = currentValue(snapshot, columna.field)
    if (sameValue(actual, resultado.value)) continue

    currentValues[columna.field] = actual
    changes[columna.field] = resultado.value
    updatedFields.push(columna.field)
  }

  // `name` es NOT NULL y además es lo que se ve en todas partes. Un nombre en
  // blanco no es un cambio, es un proveedor sin identidad.
  if (changes.name !== undefined && String(changes.name ?? '').trim() === '') {
    errors.push({ column: 'Nombre', message: 'El nombre del proveedor no puede quedar vacío.' })
  }
  if (changes.country !== undefined && String(changes.country ?? '').trim() === '') {
    errors.push({ column: 'País', message: 'El país no puede quedar vacío.' })
  }

  // ── 4. Taxonomía, sobre el estado final ───────────────────────────────────
  const tocaTaxonomia = TAXONOMY_FIELDS.some((f) => changes[f] !== undefined)
  if (tocaTaxonomia && errors.length === 0) {
    const valorFinal = (f: UpdatableField): string | null => {
      const v = changes[f] !== undefined ? changes[f] : currentValue(snapshot, f)
      return v === null || v === undefined ? null : String(v)
    }
    errors.push(...validateTaxonomyChain(
      {
        market: valorFinal('supplier_market_id'),
        category: valorFinal('supplier_category_id'),
        family: valorFinal('supplier_family_id'),
        subfamily: valorFinal('supplier_subfamily_id'),
      },
      taxonomy,
    ))
  }

  if (errors.length > 0) {
    return {
      ...base,
      status: 'invalid',
      supplierId,
      supplierName: snapshot.name,
      currentValues,
      changes: {},
      updatedFields: [],
      errors,
    }
  }

  return {
    ...base,
    status: updatedFields.length > 0 ? 'valid' : 'unchanged',
    supplierId,
    supplierName: snapshot.name,
    currentValues,
    changes,
    updatedFields,
    errors: [],
  }
}

/**
 * Valida el fichero entero.
 *
 * ── Por qué hacen falta dos pasadas ────────────────────────────────────────
 *
 * Porque la repetición de un identificador solo se conoce cuando se ha leído
 * todo. Y la decisión correcta ante un UUID repetido es que NO se aplique
 * NINGUNA de sus filas, ni siquiera la primera:
 *
 *   fila 4 →  QA_PROVEEDOR ... Activo: Sí
 *   fila 9 →  el MISMO id  ... Activo: No
 *
 * ¿Cuál quería la persona? No se sabe. Aplicar la primera y descartar la
 * segunda es tan arbitrario como al revés, y deja al proveedor en un estado
 * que nadie pidió. Marcarlas todas obliga a resolver la ambigüedad en el
 * fichero, que es donde está.
 */
export function validateUpdateRows(
  parsed: ParsedUpdateRow[],
  ctx: ValidateRowContext,
): NormalizedUpdateRow[] {
  const filas = parsed.map((p) => validateUpdateRow(p, ctx))

  // Se cuenta sobre el UUID ESCRITO, no sobre `supplierId`: este último queda a
  // null cuando el proveedor no existe, y entonces dos filas apuntando al mismo
  // identificador inexistente no se verían como repetidas.
  const escrito = (f: NormalizedUpdateRow): string | null => {
    const texto = (f.raw['ID interno'] ?? '').trim().toLowerCase()
    return UUID_RE.test(texto) ? texto : null
  }

  const apariciones = new Map<string, number>()
  for (const f of filas) {
    const id = escrito(f)
    if (id === null) continue
    apariciones.set(id, (apariciones.get(id) ?? 0) + 1)
  }

  return filas.map((f) => {
    const id = escrito(f)
    if (id === null || (apariciones.get(id) ?? 0) < 2) return f
    return {
      ...f,
      status: 'duplicate_id' as const,
      // Se vacían: una fila que no se aplica no puede enseñar cambios
      // pendientes en la vista previa, o parecería que sí se van a escribir.
      changes: {},
      updatedFields: [],
      errors: [{
        column: 'ID interno',
        message:
          'Este ID aparece más de una vez en el archivo. No se aplica NINGUNA de sus filas: ' +
          'deja una sola y vuelve a subirlo.',
      }],
    }
  })
}

/**
 * Extrae los UUID candidatos de todas las filas, para poder cargar en UNA sola
 * consulta los proveedores implicados.
 *
 * Sin esto haría falta una consulta por fila: con 12.288 filas la diferencia
 * entre esto y un N+1 es entre segundos y horas.
 */
export function collectSupplierIds(rows: ParsedUpdateRow[], plan: ColumnPlan): string[] {
  if (plan.idIndex === null) return []
  const ids = new Set<string>()
  for (const fila of rows) {
    const texto = (fila.cells[plan.idIndex]?.text ?? '').trim()
    if (UUID_RE.test(texto)) ids.add(texto.toLowerCase())
  }
  return [...ids]
}

// ── Presentación de valores ─────────────────────────────────────────────────

/** Cómo se enseña un valor en la vista previa y en el informe. */
export function displayValue(value: NormalizedValue | undefined): string {
  if (value === undefined) return ''
  if (value === null) return '(vacío)'
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  return String(value)
}
