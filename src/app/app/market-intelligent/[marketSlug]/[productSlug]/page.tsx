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
import { MarketPeriodSelector } from '@/components/app/markets/MarketPeriodSelector'
import { FavoriteMarketButton } from '@/components/app/markets/FavoriteMarketButton'
import { isModuleEnabled } from '@/lib/queries/organization-modules'
import { getMarketAccessContext } from '@/lib/queries/market-access'
import {
  MARKET_FROM_PARAM,
  MARKET_PERIOD_PARAM,
  MARKET_TO_PARAM,
  resolveMarketPeriod,
} from '@/lib/markets/period'
import { LONJA_PARAM, LONJA_FILTER_LABEL, resolveLonja } from '@/lib/markets/lonja'
import { LonjaFilter } from '@/components/app/markets/LonjaFilter'
import { getProductLonjas } from '@/lib/queries/lonjas'
import { formatNumber, isNonMonetaryUnit, magnitudeLabel } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ marketSlug: string; productSlug: string }>
  searchParams: Promise<Record<string, string | undefined>>
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

  const [{ marketSlug, productSlug }, sp] = await Promise.all([params, searchParams])

  // Si el mercado está deshabilitado para la organización (2.2), `client_read_products`
  // ya no devuelve el producto y esto es `null`: la URL directa acaba en 404 sin
  // llegar a consultar ni un precio. No se distingue de «no existe», y es lo
  // correcto: decir «existe pero no puedes verlo» revelaría el catálogo ajeno.
  const product = await getProductDetail(marketSlug, productSlug)
  if (!product) notFound()

  // 2.3 — el periodo llega por URL y se resuelve UNA vez. `from` y `to` van
  // directos a la consulta, así que el recorte lo hace PostgreSQL: nunca se trae
  // el histórico al navegador para filtrarlo después.
  //
  // 037 — con `period=CUSTOM` la ventana la fijan `from` y `to`. Un rango mal
  // escrito NO abre el histórico entero: `resolveMarketPeriod` cae al periodo por
  // defecto y devuelve el error para enseñarlo junto al selector.
  const periodo = resolveMarketPeriod(
    sp[MARKET_PERIOD_PARAM],
    new Date(),
    sp[MARKET_FROM_PARAM],
    sp[MARKET_TO_PARAM],
  )

  // 034 — de qué lonjas hay precios para ESTA referencia.
  const lonjas = await getProductLonjas(product.id)

  // ── «Todas las lonjas» no existe aquí, y es una decisión ─────────────────
  //
  // El gráfico dibuja UNA serie. Con precios de España, Alemania y Europa
  // mezclados en una sola línea, cada cambio de plaza parecería un movimiento
  // de mercado; con varias líneas habría que rehacer el gráfico, las cuatro
  // tarjetas de estadísticas y la comparación de periodos.
  //
  // Se elige lo más honesto de lo que cabe hoy: si hay varias lonjas, se exige
  // elegir una, y por defecto se toma la primera en orden alfabético. Las
  // estadísticas y el gráfico corresponden SIEMPRE a la lonja seleccionada.
  const lonjaPedida = resolveLonja(sp[LONJA_PARAM], lonjas)
  const lonjaActiva = lonjaPedida || (lonjas.length > 0 ? lonjas[0] : '')

  const [priceStats, { favoriteMarketIds }] = await Promise.all([
    getProductPriceStats(product.id, periodo.from, lonjaActiva || null, periodo.to),
    getMarketAccessContext(),
  ])

  // 037 — la magnitud se compone de las DOS columnas: «€/100 kg», «%»,
  // «Unidades». Nunca se supone euros cuando no hay moneda.
  const magnitud = magnitudeLabel(priceStats?.currency ?? null, priceStats?.unit ?? null)

  // `%` y `Unidades` no son precios: son un porcentaje o un índice. Cambia el
  // rótulo de la tarjeta, no el cálculo.
  const esIndicador = isNonMonetaryUnit(priceStats?.unit)

  // Con un rango a medida la etiqueta del periodo no es una letra: se recorta la
  // descripción para que quepa en el rótulo de la tarjeta.
  const etiquetaPeriodo = periodo.period === 'CUSTOM' ? 'rango' : periodo.period

  const changePositive = (priceStats?.changePeriod ?? 0) > 0
  const changeNeutral  = (priceStats?.changePeriod ?? 0) === 0
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
            {/* 034 — `products.lonja` pasa a ser la lonja POR DEFECTO de la
                referencia. Las que de verdad tienen precios salen en el
                selector de abajo, y pueden ser varias. */}
            {product.lonja && (
              <p className="mt-1 text-xs text-slate-400">
                Lonja por defecto: <span className="font-bold text-slate-600">{product.lonja}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Jerarquía de controles: primero el favorito (sobre el mercado), después
          el periodo (sobre la serie). Ambos por encima del gráfico. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FavoriteMarketButton
          marketId={product.market.id}
          marketName={product.market.name}
          initialIsFavorite={favoriteMarketIds.has(product.market.id)}
          variant="button"
        />
        <div className="flex flex-wrap items-end gap-3">
          {/* Con una sola lonja el desplegable no aporta nada: se dice cuál es
              y se deja el espacio al periodo. */}
          {lonjas.length > 1 && (
            <LonjaFilter
              available={lonjas}
              active={lonjaActiva}
              basePath={`/app/market-intelligent/${marketSlug}/${productSlug}`}
              searchParams={sp}
              requireSelection
              // Aquí el selector SÍ se llama «Lonja»: sus valores incluyen
              // «Ebro», «Europa» y «Naciones Unidas», que no son países. El
              // cambio a «País» es solo de la portada (037).
              label={LONJA_FILTER_LABEL}
            />
          )}
          <MarketPeriodSelector
            active={periodo.requested}
            basePath={`/app/market-intelligent/${marketSlug}/${productSlug}`}
            searchParams={sp}
            customFrom={periodo.customFromInput}
            customTo={periodo.customToInput}
            customError={periodo.customError}
          />
        </div>
      </div>

      {lonjas.length > 1 && (
        <p className="text-xs text-slate-500">
          Esta referencia cotiza en {lonjas.length} lonjas. El gráfico y las estadísticas
          corresponden a <span className="font-bold text-mira-ink">{lonjaActiva}</span>; los precios de
          distintas lonjas no se mezclan en una misma serie.
        </p>
      )}

      {priceStats ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MiraKpiCard
              label={esIndicador ? 'Valor actual' : 'Precio actual'}
              value={formatNumber(priceStats.current, 2)}
              sublabel={magnitud}
              icon={TrendingUp}
              tint="magenta"
              delta={!changeNeutral ? { value: `${formatNumber(Math.abs(priceStats.changePeriod), 2)}%`, up: changePositive } : undefined}
            />
            <MiraKpiCard label={`Media · ${etiquetaPeriodo}`} value={formatNumber(priceStats.avgPeriod, 2)} sublabel={magnitud} icon={BarChart3} tint="violet" />
            <MiraKpiCard label={`Mínimo · ${etiquetaPeriodo}`} value={formatNumber(priceStats.minPeriod, 2)} sublabel={magnitud} icon={TrendingDown} tint="emerald" />
            <MiraKpiCard label={`Máximo · ${etiquetaPeriodo}`} value={formatNumber(priceStats.maxPeriod, 2)} sublabel={magnitud} icon={TrendingUp} tint="pink" />
          </div>

          <MiraChartCard
            icon={BarChart3}
            title="Evolución histórica"
            subtitle={`${periodo.description} · ${priceStats.history.length} registros · ${magnitud}`}
          >
            <PriceChart data={priceStats.history} unit={priceStats.unit} currency={priceStats.currency} />
            <p className="mt-3 text-center text-[10px] text-slate-400">— Precio · - - Mín/Máx</p>
          </MiraChartCard>
        </>
      ) : (
        <div className="mira-card rounded-2xl">
          {/* Estado vacío del PERIODO, no del producto: decir «no hay datos»
              a secas cuando lo que pasa es que no los hay en la última semana
              haría pensar que la referencia está muerta. */}
          <EmptyState
            icon={Package}
            title="Sin datos en este periodo"
            description={
              periodo.period === 'ALL'
                ? 'No hay datos disponibles para esta referencia.'
                : periodo.period === 'CUSTOM'
                  ? `No hay registros en el rango seleccionado (${periodo.description.toLowerCase()}). Amplía las fechas o prueba con ALL.`
                  : `No hay registros en ${periodo.description.toLowerCase()}. Prueba con un periodo más amplio o con ALL.`
            }
          />
        </div>
      )}
    </div>
  )
}
