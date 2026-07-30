import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Package, BarChart3 } from 'lucide-react'
import { getProductDetail, getProductPriceStats } from '@/lib/queries/prices'
import { PriceChart } from '@/components/app/PriceChart'
import { MiraKpiCard } from '@/components/mira/MiraKpiCard'
import { MiraChartCard } from '@/components/mira/MiraChartCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { ModuleDisabledNotice } from '@/components/shared/ModuleDisabledNotice'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { isModuleEnabled } from '@/lib/queries/organization-modules'
import { formatNumber, currencySymbol, unitLabel } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ marketSlug: string; productSlug: string }>
}) {
  // Detalle de producto: es la superficie que enseña los precios de una
  // referencia concreta, así que se comprueba antes de resolver nada.
  if (!(await isModuleEnabled('markets'))) {
    return (
      <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
        <MiraPageHeader
          icon={Package}
          title="Market Intelligence"
          subtitle="Módulo no disponible para tu organización"
        />
        <ModuleDisabledNotice module="markets" />
      </div>
    )
  }

  const { marketSlug, productSlug } = await params
  const product = await getProductDetail(marketSlug, productSlug)
  if (!product) notFound()

  const priceStats = await getProductPriceStats(product.id)

  const changePositive = (priceStats?.change30 ?? 0) > 0
  const changeNeutral  = (priceStats?.change30 ?? 0) === 0
  const ChangeIcon = changeNeutral ? Minus : changePositive ? TrendingUp : TrendingDown
  const changeColor = changeNeutral ? 'text-slate-500' : changePositive ? 'text-red-600' : 'text-emerald-600'

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      {/* Breadcrumb + header */}
      <div>
        <Link href="/app/market-intelligent" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition-colors hover:text-mira-magenta">
          <ArrowLeft size={14} /> Market Intelligence
        </Link>
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-mira-magenta-soft text-2xl">
            {product.category.icon ?? '📦'}
          </div>
          <div>
            <div className="mb-0.5 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {product.category.name} · {product.market.name}
              </span>
              <span className="rounded-md bg-mira-canvas px-2 py-0.5 font-mono text-[10px] font-bold text-slate-500">
                {product.market.country_scope}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-mira-ink">{product.name}</h1>
            {product.description && <p className="mt-1 text-sm text-slate-500">{product.description}</p>}
          </div>
        </div>
      </div>

      {priceStats ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MiraKpiCard
              label="Precio actual"
              value={formatNumber(priceStats.current, 2)}
              sublabel={`${currencySymbol(priceStats.currency)} / ${unitLabel(priceStats.unit)}`}
              icon={TrendingUp}
              tint="magenta"
              delta={!changeNeutral ? { value: `${formatNumber(Math.abs(priceStats.change30), 2)}%`, up: changePositive } : undefined}
            />
            <MiraKpiCard label="Media 30 días" value={formatNumber(priceStats.avg30, 2)} sublabel={`${currencySymbol(priceStats.currency)} / ${unitLabel(priceStats.unit)}`} icon={BarChart3} tint="violet" />
            <MiraKpiCard label="Mínimo 30 días" value={formatNumber(priceStats.min30, 2)} sublabel={`${currencySymbol(priceStats.currency)} / ${unitLabel(priceStats.unit)}`} icon={TrendingDown} tint="emerald" />
            <MiraKpiCard label="Máximo 30 días" value={formatNumber(priceStats.max30, 2)} sublabel={`${currencySymbol(priceStats.currency)} / ${unitLabel(priceStats.unit)}`} icon={TrendingUp} tint="pink" />
          </div>

          <MiraChartCard
            icon={BarChart3}
            title="Evolución histórica"
            subtitle={`Últimos 90 días · ${priceStats.history.length} registros · ${currencySymbol(priceStats.currency)}/${unitLabel(priceStats.unit)}`}
          >
            <PriceChart data={priceStats.history} unit={priceStats.unit} currency={priceStats.currency} />
            <p className="mt-3 text-center text-[10px] text-slate-400">— Precio · - - Mín/Máx</p>
          </MiraChartCard>
        </>
      ) : (
        <div className="mira-card rounded-2xl">
          <EmptyState icon={Package} title="Sin datos de precio" description="No hay datos de precio disponibles para esta referencia." />
        </div>
      )}
    </div>
  )
}
