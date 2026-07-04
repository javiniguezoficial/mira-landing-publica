import Link from 'next/link'
import { Plus, Truck, Search, X, Upload, ListTree } from 'lucide-react'
import { listSuppliersFiltered, getSupplierFilterOptions, type SupplierFilters, type Supplier } from '@/lib/actions/suppliers'
import { getActiveSupplierTaxonomyTree } from '@/lib/actions/supplier-taxonomy'
import { SupplierTaxonomyFilterSelects } from '@/components/admin/suppliers/SupplierTaxonomyFilterSelects'
import { ToggleActiveSupplier } from './ToggleActiveSupplier'
import { DeleteSupplierButton } from './DeleteSupplierButton'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { MiraTable, MiraTr, MiraTd } from '@/components/mira/MiraTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { miraBtn, miraField } from '@/lib/miraButtons'

export const dynamic = 'force-dynamic'

const adminLabelCls = 'mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function taxonomyBreadcrumb(s: Supplier): string | null {
  if (!s.supplier_market) return null
  return [s.supplier_market?.name, s.supplier_category?.name, s.supplier_family?.name, s.supplier_subfamily?.name]
    .filter(Boolean).join(' › ')
}

function legacyLabel(s: Supplier): string | null {
  const parts = [s.market?.name, s.category, s.family, s.subfamily].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

type AdminSP = {
  q?: string
  country?: string
  region?: string
  produccion_min?: string
  produccion_max?: string
  supplier_market_id?: string
  supplier_category_id?: string
  supplier_family_id?: string
  supplier_subfamily_id?: string
}

function toNum(s?: string): number | undefined {
  if (!s || s.trim() === '') return undefined
  const n = parseFloat(s.replace(',', '.'))
  return Number.isNaN(n) ? undefined : n
}

export default async function AdminSuppliersPage({
  searchParams,
}: {
  searchParams: Promise<AdminSP>
}) {
  const sp = await searchParams
  const filters: SupplierFilters = {
    search: sp.q || undefined,
    country: sp.country || undefined,
    region: sp.region || undefined,
    supplier_market_id: sp.supplier_market_id || undefined,
    supplier_category_id: sp.supplier_category_id || undefined,
    supplier_family_id: sp.supplier_family_id || undefined,
    supplier_subfamily_id: sp.supplier_subfamily_id || undefined,
    produccion_min: toNum(sp.produccion_min),
    produccion_max: toNum(sp.produccion_max),
  }

  const [{ suppliers, total, hasMore }, taxonomyTree, filterOptions] = await Promise.all([
    listSuppliersFiltered(filters),
    getActiveSupplierTaxonomyTree(),
    getSupplierFilterOptions(false),
  ])

  const hasActiveFilters = Object.values(filters).some(Boolean)

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader
        icon={Truck}
        title="Proveedores"
        subtitle={
          hasActiveFilters
            ? `${total} resultado${total !== 1 ? 's' : ''} · filtrando`
            : `${total} proveedor${total !== 1 ? 'es' : ''} en total`
        }
        actions={
          <div className="flex items-center gap-2">
            <Link href="/admin/proveedores/taxonomia" className={miraBtn.ghost}>
              <ListTree size={14} /> Gestionar taxonomía
            </Link>
            <Link href="/admin/proveedores/importar" className={miraBtn.ghost}>
              <Upload size={14} /> Importar proveedores
            </Link>
            <Link href="/admin/proveedores/nuevo" className={miraBtn.primary}>
              <Plus size={14} /> Nuevo proveedor
            </Link>
          </div>
        }
      />

      {/* Filtros — key remonta el formulario cuando cambian los filtros
          (incluido "Limpiar"), evitando que un <select>/<input> no
          controlado se quede visualmente con el valor anterior. */}
      <form
        key={JSON.stringify(filters)}
        method="GET"
        action="/admin/proveedores"
        className="mira-card space-y-4 rounded-2xl p-4"
      >
        {/* Fila superior */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={adminLabelCls}>Nombre del proveedor</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                name="q"
                defaultValue={sp.q ?? ''}
                placeholder="Nombre del proveedor…"
                className={`${miraField} pl-8`}
              />
            </div>
          </div>

          <div>
            <label className={adminLabelCls}>País</label>
            <select name="country" defaultValue={sp.country ?? ''} className={miraField}>
              <option value="">Todos</option>
              {filterOptions.countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={adminLabelCls}>Provincia</label>
            <select name="region" defaultValue={sp.region ?? ''} className={miraField}>
              <option value="">Todas</option>
              {filterOptions.regions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={adminLabelCls}>Producción (rango)</label>
            <div className="flex items-center gap-2">
              <input name="produccion_min" type="number" min="0" step="any" defaultValue={sp.produccion_min ?? ''} placeholder="mín" className={miraField} />
              <span className="text-slate-400">–</span>
              <input name="produccion_max" type="number" min="0" step="any" defaultValue={sp.produccion_max ?? ''} placeholder="máx" className={miraField} />
            </div>
          </div>
        </div>

        {/* Fila inferior — taxonomía propia de proveedores (selects encadenados) */}
        <div className="border-t border-mira-line pt-4">
          {taxonomyTree.length === 0 ? (
            <p className="text-xs text-slate-400">
              Todavía no hay taxonomía de proveedores.{' '}
              <Link href="/admin/proveedores/taxonomia" className="font-semibold text-mira-magenta hover:underline">
                Créala aquí
              </Link>.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SupplierTaxonomyFilterSelects tree={taxonomyTree} values={sp} labelClassName={adminLabelCls} />
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 pt-1">
          <button type="submit" className={miraBtn.primary}>
            <Search size={14} /> Buscar
          </button>
          {hasActiveFilters && (
            <Link href="/admin/proveedores" className={miraBtn.ghost}>
              <X size={14} /> Limpiar
            </Link>
          )}
        </div>
      </form>

      {/* Indicador de límite */}
      {hasMore && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Mostrando los primeros {suppliers.length} de {total} proveedores. Usa los filtros para afinar la búsqueda.
        </div>
      )}

      {suppliers.length === 0 ? (
        <div className="mira-card rounded-2xl">
          <EmptyState
            icon={Truck}
            title={hasActiveFilters ? 'Sin resultados' : 'Aún no hay proveedores'}
            description={
              hasActiveFilters
                ? 'Ningún proveedor coincide con los filtros aplicados.'
                : 'Registra el primer proveedor del catálogo.'
            }
            action={hasActiveFilters ? undefined : { label: 'Crear proveedor', href: '/admin/proveedores/nuevo' }}
          />
        </div>
      ) : (
        <MiraTable
          headers={[
            'Nombre',
            'Clasificación',
            'Provincia · Localidad',
            'Contacto',
            'Alta',
            'Estado',
            { label: '', align: 'right' },
          ]}
        >
          {suppliers.map((s) => (
            <MiraTr key={s.id}>
              <MiraTd>
                <Link
                  href={`/admin/proveedores/${s.id}`}
                  className="font-bold text-mira-ink hover:text-mira-magenta"
                >
                  {s.name}
                </Link>
                {s.tax_id && <p className="text-xs text-slate-400">{s.tax_id}</p>}
              </MiraTd>
              <MiraTd>
                {taxonomyBreadcrumb(s) ? (
                  <div className="text-sm font-medium text-mira-ink">{taxonomyBreadcrumb(s)}</div>
                ) : legacyLabel(s) ? (
                  <div className="text-xs text-slate-400">
                    <span className="mr-1 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">legacy</span>
                    {legacyLabel(s)}
                  </div>
                ) : (
                  <span className="text-slate-300">Sin clasificar</span>
                )}
              </MiraTd>
              <MiraTd>
                <div className="text-sm text-slate-600">{s.region ?? '—'}</div>
                {s.city && <div className="text-xs text-slate-400">{s.city}</div>}
              </MiraTd>
              <MiraTd>
                <div className="text-sm text-slate-600">{s.email || '—'}</div>
                {s.phone && <div className="text-xs text-slate-400">{s.phone}</div>}
              </MiraTd>
              <MiraTd className="text-slate-500">{formatDate(s.created_at)}</MiraTd>
              <MiraTd>
                <ToggleActiveSupplier id={s.id} isActive={s.is_active} />
              </MiraTd>
              <MiraTd align="right">
                <div className="flex items-center justify-end gap-2">
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
          ))}
        </MiraTable>
      )}
    </div>
  )
}
