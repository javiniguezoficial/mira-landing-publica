import Link from 'next/link'
import { Plus, Truck, Search, X, Upload, ListTree, FileSpreadsheet, ChevronLeft, ChevronRight } from 'lucide-react'
import { listSuppliersFiltered, getSupplierFilterOptions, getSupplierProductionBounds, type SupplierFilters } from '@/lib/actions/suppliers'
import { getActiveSupplierTaxonomyTree } from '@/lib/actions/supplier-taxonomy'
import { SupplierTaxonomyFilterSelects } from '@/components/admin/suppliers/SupplierTaxonomyFilterSelects'
import { ProductionRangeFilter } from '@/components/app/suppliers/ProductionRangeFilter'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { AdminSupplierTable } from '@/components/admin/suppliers/AdminSupplierTable'
import type { SupplierListParams } from '@/lib/suppliers/list-params'
import { parseSupplierSort, parseSecondarySearch } from '@/lib/suppliers/list-params'
import { EmptyState } from '@/components/shared/EmptyState'
import { miraBtn, miraField } from '@/lib/miraButtons'
import { parsePage, pageOffset, totalPages, pageRange, toNum, buildUrl } from '@/lib/pagination'
import { formatNumber } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// Mismo tamaño de página que el listado de cliente (/app/proveedores).
const PAGE_SIZE = 200

const adminLabelCls = 'mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400'




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
  /** 3.1 — búsqueda secundaria dentro de los resultados. */
  qr?: string
  /** 3.1 — clave de ordenación (allowlist). */
  sort?: string
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

  // 3.1 — se normalizan aquí, contra la allowlist, antes de tocar la consulta.
  const secondarySearch = parseSecondarySearch(sp.qr)
  const sort = parseSupplierSort(sp.sort)

  // Parámetros tal y como deben viajar en la URL: los filtros más la búsqueda
  // secundaria y el orden. Los comparte la barra de resultados y la exportación,
  // que así exporta exactamente lo que se está viendo.
  const urlParams: SupplierListParams = {
    ...filterParams,
    qr: secondarySearch || undefined,
    sort,
  }

  const filters: SupplierFilters = {
    search: filterParams.q,        // la URL usa 'q', SupplierFilters usa 'search'
    secondary_search: secondarySearch || undefined,
    sort,
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
  const firstPageUrl = buildUrl('/admin/proveedores', urlParams)
  const prevUrl = page > 1 ? buildUrl('/admin/proveedores', { ...urlParams, page: page - 1 }) : null
  const nextUrl = hasMore ? buildUrl('/admin/proveedores', { ...urlParams, page: page + 1 }) : null
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
            {/* 3.2 — actualizar ≠ importar. Dos enlaces distintos, a propósito:
                uno da de alta y el otro NUNCA crea nada. */}
            <Link href="/admin/proveedores/actualizar" className={miraBtn.ghost}>
              <FileSpreadsheet size={14} /> Actualizar en masa
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
        <AdminSupplierTable suppliers={suppliers} total={total} params={urlParams} />
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
