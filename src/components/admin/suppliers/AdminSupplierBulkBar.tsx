'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, AlertTriangle, Loader2, X } from 'lucide-react'
import { bulkDeleteSuppliers } from '@/lib/actions/supplier-bulk'
import { miraBtn } from '@/lib/miraButtons'

interface Props {
  selectedIds: string[]
  /** Nombres de los seleccionados, para poder enseñarlos en la confirmación. */
  selectedNames: string[]
  onDone: () => void
}

/**
 * Eliminación masiva de proveedores (3.3), solo administración.
 *
 * ── Por qué existe y por qué es un borrado real ─────────────────────────────
 *
 * Porque la eliminación individual ya existe con esa misma semántica y el
 * modelo la admite: la única clave foránea que apunta a `suppliers` es
 * `rfq_responses.supplier_id`, declarada `ON DELETE SET NULL`. Borrar un
 * proveedor no borra respuestas ni cotizaciones; solo desengancha el enlace.
 *
 * Este componente solo se monta en la superficie de administración. Eso no es
 * la protección: la protección es que la Server Action exige `platform_admin`
 * y que RLS solo concede escritura a `admin_all_suppliers`.
 */
export function AdminSupplierBulkBar({ selectedIds, selectedNames, onDone }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmando, setConfirmando] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (selectedIds.length === 0) return null

  function eliminar() {
    setError(null)
    setResultado(null)
    startTransition(async () => {
      const r = await bulkDeleteSuppliers(selectedIds)

      if (r.error) {
        setError(r.error)
        setConfirmando(false)
        return
      }

      // Resultado detallado: eliminados, omitidos y fallidos. Un «hecho» a
      // secas escondería que tres proveedores no se pudieron borrar.
      const partes = [`${r.deleted} eliminado${r.deleted !== 1 ? 's' : ''}`]
      if (r.skipped > 0) partes.push(`${r.skipped} omitido${r.skipped !== 1 ? 's' : ''}`)
      if (r.errors.length > 0) partes.push(`${r.errors.length} con error`)

      setResultado(partes.join(' · '))
      if (r.errors.length > 0) {
        setError(`No se pudieron eliminar ${r.errors.length}: ${r.errors[0].reason}`)
      }

      setConfirmando(false)
      onDone()
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        disabled={pending}
        className={`${miraBtn.danger} disabled:opacity-40`}
      >
        <Trash2 size={14} /> Eliminar seleccionados
      </button>

      {resultado && (
        <span className="text-xs font-semibold text-slate-600">{resultado}</span>
      )}
      {error && (
        <span className="text-xs font-semibold text-red-700">{error}</span>
      )}

      {/* Confirmación explícita. Sin esto, un clic accidental sobre 200 filas
          seleccionadas sería irreversible. */}
      {confirmando && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mira-bulk-delete-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-mira-plum-deep/70 p-4 backdrop-blur-sm"
        >
          <div className="mira-card w-full max-w-md rounded-2xl p-5 sm:p-6">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50">
                <AlertTriangle size={18} className="text-red-600" />
              </div>
              <div className="min-w-0">
                <h2 id="mira-bulk-delete-title" className="text-sm font-black text-mira-ink">
                  Eliminar {selectedIds.length} proveedor{selectedIds.length !== 1 ? 'es' : ''}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Esta acción <strong>no se puede deshacer</strong>. Los proveedores se borran de
                  forma permanente.
                </p>
              </div>
            </div>

            <div className="mb-4 max-h-40 overflow-y-auto rounded-xl border border-mira-line bg-mira-canvas/50 p-3">
              <ul className="space-y-0.5">
                {selectedNames.slice(0, 12).map((nombre, i) => (
                  <li key={i} className="truncate text-xs text-slate-600">· {nombre}</li>
                ))}
              </ul>
              {selectedNames.length > 12 && (
                <p className="mt-1 text-[11px] text-slate-400">
                  y {selectedNames.length - 12} más…
                </p>
              )}
            </div>

            <p className="mb-4 text-[11px] text-slate-500">
              Las respuestas de cotización asociadas se conservan: solo pierden el enlace al
              proveedor. Si solo quieres retirarlo del catálogo, déjalo inactivo en su lugar.
            </p>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                disabled={pending}
                className={miraBtn.ghost}
              >
                <X size={14} /> Cancelar
              </button>
              <button
                type="button"
                onClick={eliminar}
                disabled={pending}
                className={`${miraBtn.danger} disabled:opacity-40`}
              >
                {pending ? (
                  <><Loader2 size={14} className="animate-spin" /> Eliminando…</>
                ) : (
                  <><Trash2 size={14} /> Sí, eliminar {selectedIds.length}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
