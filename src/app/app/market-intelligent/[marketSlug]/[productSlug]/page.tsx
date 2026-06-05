import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Package } from 'lucide-react'
import { getProductDetail, getProductPriceStats } from '@/lib/queries/prices'
import { PriceChart } from '@/components/app/PriceChart'

export const dynamic = 'force-dynamic'

function fmt(n: number, decimals = 4) {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  }).format(n)
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ marketSlug: string; productSlug: string }>
}) {
  const { marketSlug, productSlug } = await params
  const product = await getProductDetail(marketSlug, productSlug)
  if (!product) notFound()

  const priceStats = await getProductPriceStats(product.id)

  const changePositive = (priceStats?.change30 ?? 0) > 0
  const changeNeutral  = (priceStats?.change30 ?? 0) === 0
  const ChangeIcon = changeNeutral ? Minus : changePositive ? TrendingUp : TrendingDown
  const changeColor = changeNeutral
    ? 'text-slate-500'
    : changePositive ? 'text-red-600' : 'text-green-600'

  return (
    <div className="p-8">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          href="/app/market-intelligent"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ArrowLeft size={14} /> Market Intelligence
        </Link>

        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-mira-primary/10 flex items-center justify-center shrink-0 text-2xl">
            {product.category.icon ?? '📦'}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {product.category.name} · {product.market.name}
              </span>
              <span className="text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-500 rounded font-mono">
                {product.market.country_scope}
              </span>
            </div>
            <h1 className="text-2xl font-heading font-bold text-slate-900">{product.name}</h1>
            {product.description && (
              <p className="text-slate-500 text-sm mt-1">{product.description}</p>
            )}
          </div>
        </div>
      </div>

      {priceStats ? (
        <>
          {/* Precio actual + stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Precio actual */}
            <div className="col-span-2 lg:col-span-1 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Precio actual</p>
              <p className="text-3xl font-display font-bold text-slate-900">
                {fmt(priceStats.current)}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {priceStats.currency} / {priceStats.unit}
              </p>
              <div className={`flex items-center gap-1 mt-2 text-xs font-bold ${changeColor}`}>
                <ChangeIcon size={13} />
                {priceStats.change30 > 0 ? '+' : ''}{fmt(priceStats.change30, 2)}% vs hace 90 días
              </div>
            </div>

            {/* Media 30d */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Media 30 días</p>
              <p className="text-2xl font-display font-bold text-slate-800">{fmt(priceStats.avg30)}</p>
              <p className="text-xs text-slate-400 mt-0.5">{priceStats.currency} / {priceStats.unit}</p>
            </div>

            {/* Mínimo 30d */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Mínimo 30 días</p>
              <p className="text-2xl font-display font-bold text-green-700">{fmt(priceStats.min30)}</p>
              <p className="text-xs text-slate-400 mt-0.5">{priceStats.currency} / {priceStats.unit}</p>
            </div>

            {/* Máximo 30d */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Máximo 30 días</p>
              <p className="text-2xl font-display font-bold text-red-600">{fmt(priceStats.max30)}</p>
              <p className="text-xs text-slate-400 mt-0.5">{priceStats.currency} / {priceStats.unit}</p>
            </div>
          </div>

          {/* Gráfico */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-700">Evolución histórica (90 días)</h2>
              <span className="text-xs text-slate-400">
                {priceStats.history.length} registros · {priceStats.currency}/{priceStats.unit}
              </span>
            </div>
            <PriceChart
              data={priceStats.history}
              unit={priceStats.unit}
              currency={priceStats.currency}
            />
            <p className="text-[10px] text-slate-400 mt-3 text-center">
              — Precio · - - Mín/Máx
            </p>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center mb-6">
          <Package size={28} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No hay datos de precio disponibles para este producto.</p>
        </div>
      )}

      {/* Placeholder datos futuros */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
        <p className="text-slate-400 font-body text-sm">
          Comparativa por región, fuentes y alertas de precio se activarán en las siguientes fases.
        </p>
      </div>
    </div>
  )
}
