'use client'

import Link from 'next/link'
import type { Supplier } from '@/lib/actions/suppliers'
import type { SupplierListParams } from '@/lib/suppliers/list-params'
import { MiraTable, MiraTr, MiraTd } from '@/components/mira/MiraTable'
import { SupplierResultsToolbar } from '@/components/app/suppliers/SupplierResultsToolbar'
import { useSupplierSelection } from '@/components/app/suppliers/useSupplierSelection'
import { AdminSupplierBulkBar } from './AdminSupplierBulkBar'
import { ToggleActiveSupplier } from '@/app/admin/proveedores/ToggleActiveSupplier'
import { DeleteSupplierButton } from '@/app/admin/proveedores/DeleteSupplierButton'

interface Props {
  suppliers: Supplier[]
  total: number
  params: SupplierListParams
}

// Mismas funciones que la página: la tabla se traslada tal cual, no se rediseña.
function taxonomyBreadcrumb(s: Supplier): string | null {
  if (!s.supplier_market) return null
  return [s.supplier_market?.name, s.supplier_category?.name, s.supplier_family?.name, s.supplier_subfamily?.name]
    .filter(Boolean)
    .join(' › ')
}

function legacyLabel(s: Supplier): string | null {
  const parts = [s.market?.name, s.category, s.family, s.subfamily].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * Tabla de proveedores de administración con selección múltiple (3.1, 3.3, 3.4).
 *
 * Las columnas, los textos y los estilos son EXACTAMENTE los que ya tenía la
 * página: lo único que se añade es una columna de casilla al principio. La
 * tabla pasa a ser un componente cliente porque la selección vive en el
 * navegador, pero no consulta nada — los datos llegan resueltos del servidor y
 * ninguna decisión de permisos depende de este archivo.
 */
export function AdminSupplierTable({ suppliers, total, params }: Props) {
  const seleccion = useSupplierSelection(suppliers.map((s) => s.id))

  const nombresSeleccionados = suppliers
    .filter((s) => seleccion.isSelected(s.id))
    .map((s) => s.name)

  return (
    <div className="space-y-4">
      <SupplierResultsToolbar
        basePath="/admin/proveedores"
        params={params}
        total={total}
        selectedIds={seleccion.selectedIds}
        onClearSelection={seleccion.clear}
        // 039 — la exportación XLSX queda reservada a la administración. Esta
        // tabla solo se monta bajo `/admin/*`, cuyo layout ya ha exigido
        // `platform_admin`: llegar aquí ES la prueba del rol.
        canExport
      />

      {/* Acciones destructivas: solo administración, solo con selección. */}
      {seleccion.count > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-red-50/60 px-4 py-3">
          <AdminSupplierBulkBar
            selectedIds={seleccion.selectedIds}
            selectedNames={nombresSeleccionados}
            onDone={seleccion.clear}
          />
        </div>
      )}

      <MiraTable
        headers={[
          { label: '', align: 'center' },
          'Nombre',
          'Clasificación',
          'Ubicación',
          'Contacto',
          { label: 'Estado / Acciones', align: 'right' },
        ]}
      >
        {suppliers.map((s) => {
          const clasif = taxonomyBreadcrumb(s) ?? legacyLabel(s)
          const isLegacy = !taxonomyBreadcrumb(s) && !!legacyLabel(s)
          return (
            <MiraTr key={s.id}>
              <MiraTd align="center">
                <input
                  type="checkbox"
                  checked={seleccion.isSelected(s.id)}
                  onChange={() => seleccion.toggle(s.id)}
                  aria-label={`Seleccionar ${s.name}`}
                  className="h-4 w-4 accent-mira-magenta"
                />
              </MiraTd>
              <MiraTd className="max-w-[200px]">
                <Link
                  href={`/admin/proveedores/${s.id}`}
                  className="block truncate font-bold text-mira-ink hover:text-mira-magenta"
                  title={s.name}
                >
                  {s.name}
                </Link>
                {s.tax_id && <p className="truncate text-xs text-slate-400">{s.tax_id}</p>}
              </MiraTd>
              <MiraTd className="max-w-[240px]">
                {clasif ? (
                  <div className="flex items-center gap-1.5">
                    {isLegacy && (
                      <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">legacy</span>
                    )}
                    <span className={`truncate text-sm ${isLegacy ? 'text-slate-500' : 'font-medium text-mira-ink'}`} title={clasif}>
                      {clasif}
                    </span>
                  </div>
                ) : (
                  <span className="text-slate-300">Sin clasificar</span>
                )}
              </MiraTd>
              <MiraTd className="max-w-[160px]">
                <div className="truncate text-sm text-slate-600">{s.region ?? '—'}</div>
                {s.city && <div className="truncate text-xs text-slate-400">{s.city}</div>}
              </MiraTd>
              <MiraTd className="max-w-[200px]">
                <div className="truncate text-sm text-slate-600" title={s.email ?? undefined}>{s.email || '—'}</div>
                {s.phone && <div className="truncate text-xs text-slate-400">{s.phone}</div>}
              </MiraTd>
              <MiraTd align="right">
                <div className="flex items-center justify-end gap-3">
                  <div className="flex flex-col items-end gap-1">
                    <ToggleActiveSupplier id={s.id} isActive={s.is_active} />
                    <span className="whitespace-nowrap text-[10px] text-slate-400">Alta {formatDate(s.created_at)}</span>
                  </div>
                  <Link
                    href={`/admin/proveedores/${s.id}`}
                    className="whitespace-nowrap text-xs font-bold text-mira-magenta hover:underline"
                  >
                    Ver →
                  </Link>
                  <DeleteSupplierButton id={s.id} name={s.name} variant="icon" />
                </div>
              </MiraTd>
            </MiraTr>
          )
        })}
      </MiraTable>

      {suppliers.length > 0 && (
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-500">
          <input
            type="checkbox"
            checked={seleccion.allVisibleSelected}
            onChange={seleccion.togglePage}
            aria-label="Seleccionar todos los proveedores de esta página"
            className="h-4 w-4 accent-mira-magenta"
          />
          Seleccionar los {suppliers.length} proveedores de esta página
        </label>
      )}
    </div>
  )
}
