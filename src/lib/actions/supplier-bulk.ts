'use server'

import { revalidatePath } from 'next/cache'
import { requirePlatformAdmin, requireSession } from '@/lib/auth/guards'
import { AuthorizationError, isAuthorizationError } from '@/lib/auth/errors'
import { evaluatePlatformAdmin } from '@/lib/auth/policy'
import {
  getSupplierNotes,
  listSuppliersFiltered,
  type Supplier,
  type SupplierFilters,
} from '@/lib/actions/suppliers'
import {
  EXPORT_BATCH_SIZE,
  MAX_EXPORT_ROWS,
  MAX_SELECTED_IDS,
  type SupplierSort,
} from '@/lib/suppliers/list-params'
import type { ExportAudience } from '@/lib/suppliers/export'

const MESSAGES = {
  sesion: 'Debes iniciar sesión.',
  permiso: 'No tienes permiso para realizar esta acción.',
  seleccionVacia: 'No has seleccionado ningún proveedor.',
  demasiados: `No se pueden procesar más de ${MAX_SELECTED_IDS} proveedores a la vez.`,
  limiteExport: `La exportación supera el límite de ${MAX_EXPORT_ROWS.toLocaleString('es-ES')} filas. Acota los filtros y vuelve a intentarlo.`,
  generico: 'No se ha podido completar la operación. Inténtalo de nuevo.',
} as const

// ── Identificadores ─────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Depura la lista de identificadores que llega del navegador.
 *
 * Descarta lo que no sea un UUID y deduplica. No es la comprobación de
 * seguridad —esa la hace RLS al leer o borrar—, sino la que evita mandar basura
 * a la base de datos y la que acota el tamaño de la petición.
 */
export async function sanitizeSupplierIds(ids: unknown): Promise<string[]> {
  if (!Array.isArray(ids)) return []
  const limpios = new Set<string>()
  for (const id of ids) {
    if (typeof id === 'string' && UUID_RE.test(id.trim())) limpios.add(id.trim().toLowerCase())
  }
  return [...limpios]
}

// ── Audiencia ───────────────────────────────────────────────────────────────

export interface ExportContext {
  audience: ExportAudience
  /** Los clientes solo ven proveedores activos; la administración, todos. */
  onlyActive: boolean
}

/**
 * Reconstruye en SERVIDOR quién está exportando, y EXIGE que sea administrador.
 *
 * ── 039: la exportación deja de estar abierta a los clientes ───────────────
 *
 * Antes esta función solo pedía sesión y deducía la audiencia: un cliente
 * exportaba con columnas reducidas. El cliente ha decidido reservar la descarga
 * a `platform_admin`. Ver y buscar proveedores sigue abierto; exportar, no.
 *
 * ── Por qué se comprueba AQUÍ además de en la ruta ─────────────────────────
 *
 * Porque `collectSuppliersForExport` está en un archivo `'use server'`, y en
 * Next.js toda función exportada de un archivo así es un endpoint invocable
 * directamente desde el navegador. Proteger solo el Route Handler dejaría la
 * Server Action accesible por su propio identificador, sin pasar por la ruta.
 *
 * No se acepta la audiencia como parámetro: si el navegador pudiera decir «soy
 * admin», la exportación incluiría notas internas. Se deduce del contexto real,
 * y RLS vuelve a limitarlo por su cuenta.
 */
async function resolveExportContext(): Promise<ExportContext> {
  const { context } = await requireSession()
  if (evaluatePlatformAdmin(context) !== null) {
    throw new AuthorizationError('FORBIDDEN', MESSAGES.permiso)
  }
  return { audience: 'admin', onlyActive: false }
}

// ── Exportación ─────────────────────────────────────────────────────────────

export interface ExportSelection {
  filters: SupplierFilters
  /** Si viene, se exportan SOLO estos; si no, todo el conjunto filtrado. */
  selectedIds?: string[]
}

export interface ExportPayload {
  suppliers: Supplier[]
  audience: ExportAudience
  truncated: boolean
  error?: string
}

/**
 * Reúne los proveedores a exportar.
 *
 * ── Por qué reutiliza `listSuppliersFiltered` ───────────────────────────────
 *
 * Es la MISMA función que alimenta la pantalla, con los mismos filtros, la
 * misma búsqueda secundaria y el mismo orden. Tener una consulta para ver y
 * otra para exportar es como acaban divergiendo: se cambia un filtro en una y
 * la exportación sigue devolviendo otra cosa durante meses sin que nadie lo
 * note.
 *
 * ── Paginado interno ────────────────────────────────────────────────────────
 *
 * Se pide en tandas de 1.000 en lugar de una sola consulta de 15.000: mantiene
 * acotada la memoria del proceso y respeta el techo de la RPC. El bucle corta
 * en `MAX_EXPORT_ROWS`, así que no puede quedarse girando.
 */
export async function collectSuppliersForExport(
  selection: ExportSelection,
): Promise<ExportPayload> {
  let contexto: ExportContext
  try {
    contexto = await resolveExportContext()
  } catch (e) {
    if (isAuthorizationError(e)) {
      // 039 — se distingue «no hay sesión» de «no tienes permiso»: el primero
      // se resuelve entrando, el segundo no se resuelve de ninguna manera y
      // decir «inicia sesión» a quien ya la tiene solo confunde.
      const mensaje = e.code === 'UNAUTHENTICATED' ? MESSAGES.sesion : MESSAGES.permiso
      return { suppliers: [], audience: 'admin', truncated: false, error: mensaje }
    }
    throw e
  }

  const base: SupplierFilters = {
    ...selection.filters,
    // El cliente no puede pedir inactivos ni aunque lo escriba en la URL.
    is_active: contexto.onlyActive ? true : selection.filters.is_active,
  }

  // ── Exportar seleccionados ────────────────────────────────────────────────
  //
  // Los identificadores NO se consultan directamente: se recorre el mismo
  // conjunto filtrado y se conservan los que coinciden. Así un identificador de
  // un proveedor que la persona no puede ver —o que no está en sus filtros—
  // simplemente no aparece, sin necesidad de una comprobación aparte.
  const seleccionados = selection.selectedIds && selection.selectedIds.length > 0
    ? new Set(selection.selectedIds)
    : null

  if (seleccionados && seleccionados.size > MAX_SELECTED_IDS) {
    return { suppliers: [], audience: contexto.audience, truncated: false, error: MESSAGES.demasiados }
  }

  const acumulados: Supplier[] = []
  let offset = 0
  let truncated = false

  for (;;) {
    const { suppliers, hasMore } = await listSuppliersFiltered({
      ...base,
      limit: EXPORT_BATCH_SIZE,
      offset,
    })

    for (const s of suppliers) {
      if (seleccionados && !seleccionados.has(s.id)) continue
      acumulados.push(s)
      if (acumulados.length >= MAX_EXPORT_ROWS) break
    }

    if (acumulados.length >= MAX_EXPORT_ROWS) {
      truncated = true
      break
    }
    // Con selección, se puede parar en cuanto estén todos los pedidos.
    if (seleccionados && acumulados.length === seleccionados.size) break
    if (!hasMore || suppliers.length === 0) break

    offset += EXPORT_BATCH_SIZE
  }

  if (acumulados.length === 0) {
    return {
      suppliers: [],
      audience: contexto.audience,
      truncated: false,
      error: seleccionados ? MESSAGES.seleccionVacia : undefined,
    }
  }

  // 032 — `search_suppliers` ya no devuelve `notes`. La exportación de
  // administración las recupera en UNA sola llamada a `admin_supplier_notes`,
  // que valida `platform_admin` por dentro. Para un cliente el mapa viene
  // vacío y la columna simplemente no existe en su hoja.
  if (contexto.audience === 'admin') {
    const notas = await getSupplierNotes(acumulados.map((s) => s.id))
    if (notas.size > 0) {
      for (const proveedor of acumulados) {
        proveedor.notes = notas.get(proveedor.id) ?? null
      }
    }
  }

  return { suppliers: acumulados, audience: contexto.audience, truncated }
}

// ── Eliminación masiva ──────────────────────────────────────────────────────

export interface BulkDeleteResult {
  deleted: number
  skipped: number
  errors: { id: string; reason: string }[]
  error?: string
}

/**
 * Elimina varios proveedores (3.3).
 *
 * ── Por qué es un borrado real y no un archivado ────────────────────────────
 *
 * Porque es lo que ya hace `deleteSupplier` para uno solo, y el modelo lo
 * admite: la ÚNICA clave foránea que apunta a `suppliers` es
 * `rfq_responses.supplier_id`, declarada `ON DELETE SET NULL`. Borrar un
 * proveedor no borra ninguna respuesta ni ninguna cotización; solo desengancha
 * el enlace, y el nombre del proveedor ya está copiado en la respuesta.
 *
 * Inventar aquí un archivado distinto del borrado individual dejaría dos
 * semánticas para la misma acción. Para retirar sin borrar ya existe el
 * interruptor de activo.
 *
 * ── Qué protege qué ─────────────────────────────────────────────────────────
 *
 *   · `requirePlatformAdmin('throw')` — sesión, rol y perfil ACTIVO;
 *   · `admin_all_suppliers` en RLS — un cliente que llamara a esta acción no
 *     borraría nada aunque el guard fallara;
 *   · los identificadores se depuran y se borran de uno en uno, para poder
 *     informar de cuáles fallaron en lugar de perder la operación entera.
 *
 * No se usa `service_role` en ningún punto.
 */
export async function bulkDeleteSuppliers(ids: string[]): Promise<BulkDeleteResult> {
  let sesion
  try {
    sesion = await requirePlatformAdmin('throw')
  } catch (e) {
    if (isAuthorizationError(e)) {
      return { deleted: 0, skipped: 0, errors: [], error: MESSAGES.permiso }
    }
    throw e
  }

  const limpios = await sanitizeSupplierIds(ids)
  if (limpios.length === 0) {
    return { deleted: 0, skipped: 0, errors: [], error: MESSAGES.seleccionVacia }
  }
  if (limpios.length > MAX_SELECTED_IDS) {
    return { deleted: 0, skipped: 0, errors: [], error: MESSAGES.demasiados }
  }

  const { supabase } = sesion
  const errors: BulkDeleteResult['errors'] = []
  let deleted = 0

  for (const id of limpios) {
    const { data, error } = await supabase.from('suppliers').delete().eq('id', id).select('id')

    if (error) {
      errors.push({
        id,
        reason:
          error.code === '23503'
            ? 'Tiene datos asociados que impiden borrarlo. Puedes dejarlo inactivo.'
            : 'No se ha podido eliminar.',
      })
      continue
    }
    // Cero filas significa que RLS no lo devolvió o que ya no existía. No es un
    // error que reportar: simplemente no se borró.
    if (!data || data.length === 0) continue

    deleted += data.length
  }

  revalidatePath('/admin/proveedores')

  return { deleted, skipped: limpios.length - deleted - errors.length, errors }
}

/** Exporta el orden como tipo, para que las páginas no importen dos módulos. */
export type { SupplierSort }
