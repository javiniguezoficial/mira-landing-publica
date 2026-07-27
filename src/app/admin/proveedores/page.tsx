import Link from 'next/link'
import { Plus, Truck, Search, X, Upload, ListTree, ChevronLeft, ChevronRight } from 'lucide-react'
import { listSuppliersFiltered, getSupplierFilterOptions, getSupplierProductionBounds, type SupplierFilters, type Supplier } from '@/lib/actions/suppliers'
import { getActiveSupplierTaxonomyTree } from '@/lib/actions/supplier-taxonomy'
import { SupplierTaxonomyFilterSelects } from '@/components/admin/suppliers/SupplierTaxonomyFilterSelects'
import { ProductionRangeFilter } from '@/components/app/suppliers/ProductionRangeFilter'
import { ToggleActiveSupplier } from './ToggleActiveSupplier'
import { DeleteSupplierButton } from './DeleteSupplierButton'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { MiraTable, MiraTr, MiraTd } from '@/components/mira/MiraTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { miraBtn, miraField } from '@/lib/miraButtons'
import { parsePage, pageOffset, totalPages, pageRange, toNum, buildUrl } from '@/lib/pagination'
import { formatNumber } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// Mismo tamaño de página que el listado de cliente (/app/proveedores).
const PAGE_SIZE = 200

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
  page?: string
}

export default async function AdminSuppliersPage({
  searchParams,
}: {
  searchParams: Promise<AdminSP>
}) {
  const sp = await searchParams
  const page = parsePage(sp.page)

  // Parámetros tal y como viajan en la URL (sin `page`). Se reutilizan para
  // reconstruir los enlaces de paginación conservando los filtros y para saber
  // si hay algún filtro activo — por eso no deben mezclarse con limit/offset.
  const filterParams = {
    q: sp.q || undefined,
    country: sp.country || undefined,
    region: sp.region || undefined,
    produccion_min: sp.produccion_min || undefined,
    produccion_max: sp.produccion_max || undefined,
    supplier_market_id: sp.supplier_market_id || undefined,
    supplier_category_id: sp.supplier_category_id || undefined,
    supplier_family_id: sp.supplier_family_id || undefined,
    supplier_subfamily_id: sp.supplier_subfamily_id || undefined,
  }

  const filters: SupplierFilters = {
    search: filterParams.q,        // la URL usa 'q', SupplierFilters usa 'search'
    country: filterParams.country,
    region: filterParams.region,
    supplier_market_id: filterParams.supplier_market_id,
    supplier_category_id: filterParams.supplier_category_id,
    supplier_family_id: filterParams.supplier_family_id,
    supplier_subfamily_id: filterParams.supplier_subfamily_id,
    produccion_min: toNum(filterParams.produccion_min),
    produccion_max: toNum(filterParams.produccion_max),
  }

  const [{ suppliers, total, hasMore }, taxonomyTree, filterOptions, productionBounds] = await Promise.all([
    listSuppliersFiltered({ ...filters, limit: PAGE_SIZE, offset: pageOffset(page, PAGE_SIZE) }),
    getActiveSupplierTaxonomyTree(),
    getSupplierFilterOptions(false),
    getSupplierProductionBounds(),
  ])

  const hasActiveFilters = Object.values(filterParams).some(Boolean)
  const pages = totalPages(total, PAGE_SIZE)
  const range = pageRange(page, PAGE_SIZE, suppliers.length)
  const firstPageUrl = buildUrl('/admin/proveedores', filterParams)
  const prevUrl = page > 1 ? buildUrl('/admin/proveedores', { ...filterParams, page: page - 1 }) : null
  const nextUrl = hasMore ? buildUrl('/admin/proveedores', { ...filterParams, page: page + 1 }) : null
  // `?page=9999`: la consulta no falla, simplemente no devuelve filas. Se
  // detecta para ofrecer una salida en vez de dejar la pantalla vacía.
  const outOfRange = suppliers.length === 0 && page > 1

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

          <ProductionRangeFilter
            max={productionBounds.max}
            initialMin={sp.produccion_min}
            initialMax={sp.produccion_max}
            labelClassName={adminLabelCls}
          />
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

      {/* Rango mostrado */}
      {range && (
        <p className="text-sm text-slate-500">
          Mostrando{' '}
          <span className="font-bold text-mira-ink">
            {formatNumber(range.from)}–{formatNumber(range.to)}
          </span>{' '}
          de {formatNumber(total)} {total === 1 ? 'proveedor' : 'proveedores'}
          {hasActiveFilters && ' (filtrado)'}
        </p>
      )}

      {suppliers.length === 0 ? (
        <div className="mira-card rounded-2xl">
          <EmptyState
            icon={Truck}
            title={
              outOfRange
                ? 'Esta página no tiene resultados'
                : hasActiveFilters
                  ? 'Sin resultados'
                  : 'Aún no hay proveedores'
            }
            description={
              outOfRange
                ? 'El número de página solicitado está fuera del listado.'
                : hasActiveFilters
                  ? 'Ningún proveedor coincide con los filtros aplicados.'
                  : 'Registra el primer proveedor del catálogo.'
            }
            action={hasActiveFilters || outOfRange ? undefined : { label: 'Crear proveedor', href: '/admin/proveedores/nuevo' }}
          />
          {outOfRange && (
            <div className="flex justify-center pb-10">
              <Link href={firstPageUrl} className={miraBtn.primary}>
                Volver a la primera página
              </Link>
            </div>
          )}
        </div>
      ) : (
        <MiraTable
          headers={[
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
      )}

      {/* Paginación — mismo patrón que el listado de cliente */}
      {pages > 1 && (
        <div className="flex flex-col items-center justify-center gap-2 pt-2 sm:flex-row sm:gap-3">
          {prevUrl ? (
            <Link href={prevUrl} className={miraBtn.ghost}>
              <ChevronLeft size={14} /> Anterior
            </Link>
          ) : (
            <span className="cursor-not-allowed rounded-xl px-4 py-2 text-sm text-slate-300">
              <ChevronLeft size={14} className="inline" /> Anterior
            </span>
          )}
          <span className="text-sm text-slate-500">
            Página <span className="font-bold text-mira-ink">{page}</span> de {pages}
          </span>
          {nextUrl ? (
            <Link href={nextUrl} className={miraBtn.ghost}>
              Siguiente <ChevronRight size={14} />
            </Link>
          ) : (
            <span className="cursor-not-allowed rounded-xl px-4 py-2 text-sm text-slate-300">
              Siguiente <ChevronRight size={14} className="inline" />
            </span>
          )}
        </div>
      )}
    </div>
  )
}
