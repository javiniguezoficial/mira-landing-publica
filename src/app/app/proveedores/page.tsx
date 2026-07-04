import { MapPin } from 'lucide-react'
import { listSuppliersFiltered, getSupplierFilterOptions, getSupplierProductionBounds } from '@/lib/actions/suppliers'
import { getSupplierTaxonomyTreeForClient } from '@/lib/actions/supplier-taxonomy'
import { SupplierListClient } from '@/components/app/suppliers/SupplierListClient'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 200

type SP = {
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

function toNum(s?: string): number | undefined {
  if (!s || s.trim() === '') return undefined
  const n = parseFloat(s.replace(',', '.'))
  return Number.isNaN(n) ? undefined : n
}

function buildUrl(base: string, params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v))
  }
  const qs = sp.toString()
  return `${base}${qs ? `?${qs}` : ''}`
}

export default async function ClientSuppliersPage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page ?? '1') || 1)

  // 'q' es la clave URL para el nombre; el resto coinciden con SupplierFilters.
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

  const [{ suppliers, total, hasMore }, filterOptions, taxonomyTree] = await Promise.all([
    listSuppliersFiltered({
      search: filterParams.q,        // SupplierFilters usa 'search', la URL usa 'q'
      country: filterParams.country,
      region: filterParams.region,
      produccion_min: toNum(filterParams.produccion_min),
      produccion_max: toNum(filterParams.produccion_max),
      supplier_market_id: filterParams.supplier_market_id,
      supplier_category_id: filterParams.supplier_category_id,
      supplier_family_id: filterParams.supplier_family_id,
      supplier_subfamily_id: filterParams.supplier_subfamily_id,
      is_active: true,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getSupplierFilterOptions(true),
    getSupplierTaxonomyTreeForClient(),
  ])

  const productionBounds = await getSupplierProductionBounds()

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const prevUrl = page > 1 ? buildUrl('/app/proveedores', { ...filterParams, page: page - 1 }) : null
  const nextUrl = hasMore ? buildUrl('/app/proveedores', { ...filterParams, page: page + 1 }) : null
  const hasActiveFilters = Object.values(filterParams).some(Boolean)

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader
        icon={MapPin}
        title="Proveedores"
        subtitle={
          hasActiveFilters
            ? `${total} resultado${total !== 1 ? 's' : ''} · filtrando`
            : `${total} proveedor${total !== 1 ? 'es' : ''} activos`
        }
      />
      <SupplierListClient
        suppliers={suppliers}
        total={total}
        hasMore={hasMore}
        page={page}
        totalPages={totalPages}
        prevUrl={prevUrl}
        nextUrl={nextUrl}
        filters={filterParams}
        countries={filterOptions.countries}
        regions={filterOptions.regions}
        taxonomyTree={taxonomyTree}
        productionMax={productionBounds.max}
      />
    </div>
  )
}
