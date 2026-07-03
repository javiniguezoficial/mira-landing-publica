import { MapPin } from 'lucide-react'
import { listSuppliersFiltered, getSupplierFilterOptions } from '@/lib/actions/suppliers'
import { getMarketsForClient } from '@/lib/actions/markets'
import { SupplierListClient } from '@/components/app/suppliers/SupplierListClient'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 200

type SP = {
  q?: string
  country?: string
  region?: string
  market_id?: string
  category?: string
  family?: string
  subfamily?: string
  produccion?: string
  page?: string
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

  // filterParams usa 'q' como clave URL (nombre del input del formulario)
  const filterParams = {
    q: sp.q || undefined,
    country: sp.country || undefined,
    region: sp.region || undefined,
    market_id: sp.market_id || undefined,
    category: sp.category || undefined,
    family: sp.family || undefined,
    subfamily: sp.subfamily || undefined,
    produccion: sp.produccion || undefined,
  }

  const [{ suppliers, total, hasMore }, markets, filterOptions] = await Promise.all([
    listSuppliersFiltered({
      search: filterParams.q,        // SupplierFilters usa 'search', la URL usa 'q'
      country: filterParams.country,
      region: filterParams.region,
      market_id: filterParams.market_id,
      category: filterParams.category,
      family: filterParams.family,
      subfamily: filterParams.subfamily,
      produccion: filterParams.produccion,
      is_active: true,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getMarketsForClient(),
    getSupplierFilterOptions(true),
  ])

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
        markets={markets}
        filters={filterParams}
        countries={filterOptions.countries}
        regions={filterOptions.regions}
      />
    </div>
  )
}
