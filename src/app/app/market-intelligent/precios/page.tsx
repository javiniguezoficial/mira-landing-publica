import Link from 'next/link'
import { ArrowLeft, DollarSign, Search, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { listPriceRecordsFiltered, getPricingTree, getPriceInsights, type PriceListFilters } from '@/lib/actions/prices'
import { PricingHierarchySelects } from '@/components/admin/prices/PricingHierarchySelects'
import { PriceExtraFilters } from '@/components/admin/prices/PriceExtraFilters'
import { PriceSummaryCards } from '@/components/admin/prices/PriceSummaryCards'
import { PriceEvolutionChart } from '@/components/admin/prices/PriceEvolutionChart'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { MiraChartCard } from '@/components/mira/MiraChartCard'
import { MiraTable, MiraTr, MiraTd } from '@/components/mira/MiraTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { ModuleDisabledNotice } from '@/components/shared/ModuleDisabledNotice'
import { isModuleEnabled } from '@/lib/queries/organization-modules'
import { miraBtn, miraField, miraLabel } from '@/lib/miraButtons'
import { formatNumber, formatPrice, unitLabel } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
const CURRENCIES = ['EUR', 'USD', 'GBP']

type SP = {
  strategic_market_id?: string
  category_id?: string
  market_id?: string
  product_id?: string
  lonja?: string
  variedad?: string
  calibre?: string
  incoterm?: string
  tipo?: string
  region?: string
  unit?: string
  date_from?: string
  date_to?: string
  country?: string
  currency?: string
  page?: string
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function buildUrl(base: string, params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v))
  }
  const qs = sp.toString()
  return `${base}${qs ? `?${qs}` : ''}`
}

export default async function ClientPreciosPage({ searchParams }: { searchParams: Promise<SP> }) {
  // Subruta de Market Intelligence: se protege igual que la portada, porque es
  // una URL directa perfectamente escribible y es la que expone los precios.
  if (!(await isModuleEnabled('markets'))) {
    return (
      <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
        <MiraPageHeader
          icon={DollarSign}
          title="Market Intelligence"
          subtitle="Módulo no disponible para tu organización"
        />
        <ModuleDisabledNotice module="markets" />
      </div>
    )
  }

  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page ?? '1') || 1)

  const filters: PriceListFilters = {
    strategic_market_id: sp.strategic_market_id || undefined,
    category_id: sp.category_id || undefined,
    market_id: sp.market_id || undefined,
    product_id: sp.product_id || undefined,
    lonja: sp.lonja || undefined,
    variedad: sp.variedad || undefined,
    calibre: sp.calibre || undefined,
    incoterm: sp.incoterm || undefined,
    tipo: sp.tipo || undefined,
    region: sp.region || undefined,
    unit: sp.unit || undefined,
    date_from: sp.date_from || undefined,
    date_to: sp.date_to || undefined,
    country: sp.country || undefined,
    currency: sp.currency || undefined,
  }

  const [{ rows, total, hasMore }, hierarchy, insights] = await Promise.all([
    listPriceRecordsFiltered({ ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    getPricingTree(),
    getPriceInsights(filters),
  ])

  const hasActiveFilters = Object.values(filters).some(Boolean)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const prevUrl = page > 1 ? buildUrl('/app/market-intelligent/precios', { ...sp, page: page - 1 }) : null
  const nextUrl = hasMore ? buildUrl('/app/market-intelligent/precios', { ...sp, page: page + 1 }) : null

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <div>
        <Link href="/app/market-intelligent" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-mira-magenta">
          <ArrowLeft size={14} /> Volver a Market Intelligence
        </Link>
        <MiraPageHeader
          icon={DollarSign}
          title="Precios"
          subtitle={hasActiveFilters ? `${total} registro${total !== 1 ? 's' : ''} · filtrando` : `${total} registro${total !== 1 ? 's' : ''} de precio`}
        />
      </div>

      <form
        key={JSON.stringify(filters)}
        method="GET"
        action="/app/market-intelligent/precios"
        className="mira-card space-y-4 rounded-2xl p-4"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <PricingHierarchySelects hierarchy={hierarchy} values={sp} />
        </div>

        <div className="grid gap-3 border-t border-mira-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <PriceExtraFilters facets={hierarchy.facets} values={sp} />
        </div>

        <div className="grid gap-3 border-t border-mira-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={miraLabel}>Fecha desde</label>
            <input type="date" name="date_from" defaultValue={sp.date_from ?? ''} className={miraField} />
          </div>
          <div>
            <label className={miraLabel}>Fecha hasta</label>
            <input type="date" name="date_to" defaultValue={sp.date_to ?? ''} className={miraField} />
          </div>
          <div>
            <label className={miraLabel}>País</label>
            <input name="country" defaultValue={sp.country ?? ''} placeholder="Ej. ES" className={`${miraField} font-mono`} />
          </div>
          <div>
            <label className={miraLabel}>Moneda</label>
            <select name="currency" defaultValue={sp.currency ?? ''} className={miraField}>
              <option value="">Todas</option>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button type="submit" className={miraBtn.primary}>
            <Search size={14} /> Buscar
          </button>
          {hasActiveFilters && (
            <Link href="/app/market-intelligent/precios" className={miraBtn.ghost}>
              <X size={14} /> Limpiar filtros
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="mira-card rounded-2xl">
          <EmptyState
            icon={DollarSign}
            title={hasActiveFilters ? 'Sin resultados' : 'Sin precios disponibles'}
            description={
              hasActiveFilters
                ? 'Ningún precio coincide con los filtros seleccionados.'
                : 'No hay precios disponibles en tu plan en este momento.'
            }
          />
        </div>
      ) : (
        <>
          <PriceSummaryCards insights={insights} />

          <MiraChartCard
            title="Evolución de precios"
            subtitle="Precio promedio diario según los filtros aplicados"
          >
            <PriceEvolutionChart series={insights.series} unit={insights.unit} currency={insights.currency} />
          </MiraChartCard>

          <MiraTable
            headers={[
              'Fecha',
              'Referencia',
              'Clasificación',
              { label: 'Precio', align: 'right' },
              { label: 'Rango (mín – máx)', align: 'right' },
              { label: 'Prom.', align: 'right' },
              { label: 'Volumen', align: 'right' },
              'País · Zona',
            ]}
          >
            {rows.map((r) => {
              const sub = [r.product?.variedad, r.product?.calibre, r.product?.lonja, r.product?.incoterm, r.product?.tipo].filter(Boolean)
              return (
              <MiraTr key={r.id}>
                <MiraTd className="whitespace-nowrap text-slate-500">{formatDate(r.recorded_at)}</MiraTd>
                <MiraTd>
                  <div className="font-bold text-mira-ink">{r.product?.name ?? '—'}</div>
                  {sub.length > 0 && (
                    <div className="text-xs text-slate-400">{sub.join(' · ')}</div>
                  )}
                </MiraTd>
                <MiraTd className="text-xs text-slate-500">
                  {[r.strategic?.name, r.category?.name, r.market?.name].filter(Boolean).join(' › ') || '—'}
                </MiraTd>
                <MiraTd align="right">
                  <span className="font-bold tabular-nums text-mira-ink">
                    {formatPrice(r.price, { unit: r.unit, currency: r.currency })}
                  </span>
                </MiraTd>
                <MiraTd align="right" className="tabular-nums text-xs text-slate-400">
                  {r.min_price != null || r.max_price != null
                    ? `${formatPrice(r.min_price, { currency: r.currency })} – ${formatPrice(r.max_price, { currency: r.currency })}`
                    : '—'}
                </MiraTd>
                <MiraTd align="right" className="tabular-nums text-slate-600">
                  {r.avg_price != null ? formatPrice(r.avg_price, { currency: r.currency }) : '—'}
                </MiraTd>
                <MiraTd align="right" className="tabular-nums text-slate-600">
                  {r.volume != null ? `${formatNumber(r.volume)}${r.unit ? ` ${unitLabel(r.unit)}` : ''}` : '—'}
                </MiraTd>
                <MiraTd className="text-slate-600">{[r.country, r.region].filter(Boolean).join(' · ') || '—'}</MiraTd>
              </MiraTr>
              )
            })}
          </MiraTable>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              {prevUrl ? (
                <Link href={prevUrl} className={miraBtn.ghost}><ChevronLeft size={14} /> Anterior</Link>
              ) : (
                <span className="cursor-not-allowed rounded-xl px-4 py-2 text-sm text-slate-300"><ChevronLeft size={14} className="inline" /> Anterior</span>
              )}
              <span className="text-sm text-slate-500">Página <span className="font-bold text-mira-ink">{page}</span> de {totalPages}</span>
              {nextUrl ? (
                <Link href={nextUrl} className={miraBtn.ghost}>Siguiente <ChevronRight size={14} /></Link>
              ) : (
                <span className="cursor-not-allowed rounded-xl px-4 py-2 text-sm text-slate-300">Siguiente <ChevronRight size={14} className="inline" /></span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
