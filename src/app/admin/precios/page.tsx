import Link from 'next/link'
import { Plus, Upload, Trash2, DollarSign, Search, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { listPriceRecordsFiltered, getPricingTree, getPriceInsights, type PriceListFilters } from '@/lib/actions/prices'
import { PricingHierarchySelects } from '@/components/admin/prices/PricingHierarchySelects'
import { PriceExtraFilters } from '@/components/admin/prices/PriceExtraFilters'
import { PriceSummaryCards } from '@/components/admin/prices/PriceSummaryCards'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { MiraTable, MiraTr, MiraTd } from '@/components/mira/MiraTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { miraBtn, miraField } from '@/lib/miraButtons'
import { formatChartDateLong } from '@/lib/markets/chart-dates'
import { formatNumber, formatPrice, unitLabel } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
const adminLabelCls = 'mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400'
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

// 037 — `recorded_at` es una fecha CIVIL (`date`), no un instante.
// `new Date('2026-05-15')` la interpreta como medianoche UTC y en una zona con
// desfase negativo la enseñaba como día 14. `formatCivilDateLong` la parte a
// mano, así que el día es siempre el que dice la base.
function formatDate(d: string) {
  return formatChartDateLong(d)
}

function buildUrl(base: string, params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v))
  }
  const qs = sp.toString()
  return `${base}${qs ? `?${qs}` : ''}`
}

export default async function AdminPreciosPage({ searchParams }: { searchParams: Promise<SP> }) {
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
  const prevUrl = page > 1 ? buildUrl('/admin/precios', { ...sp, page: page - 1 }) : null
  const nextUrl = hasMore ? buildUrl('/admin/precios', { ...sp, page: page + 1 }) : null

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader
        icon={DollarSign}
        title="Precios"
        subtitle={hasActiveFilters ? `${total} registro${total !== 1 ? 's' : ''} · filtrando` : `${total} registro${total !== 1 ? 's' : ''} de precio`}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/admin/precios/importar" className={miraBtn.ghost}>
              <Upload size={14} /> Importar precios
            </Link>
            {/* 035 — retirar precios mal cargados sin entrar a la base de datos.
                Separado de «Importar» a propósito: son operaciones opuestas. */}
            <Link href="/admin/precios/eliminar" className={miraBtn.ghost}>
              <Trash2 size={14} /> Eliminar precios
            </Link>
            <Link href="/admin/precios/nuevo" className={miraBtn.primary}>
              <Plus size={14} /> Añadir precio
            </Link>
          </div>
        }
      />

      <form
        key={JSON.stringify(filters)}
        method="GET"
        action="/admin/precios"
        className="mira-card space-y-4 rounded-2xl p-4"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <PricingHierarchySelects hierarchy={hierarchy} values={sp} labelClassName={adminLabelCls} />
        </div>

        <div className="grid gap-3 border-t border-mira-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <PriceExtraFilters facets={hierarchy.facets} values={sp} labelClassName={adminLabelCls} />
        </div>

        <div className="grid gap-3 border-t border-mira-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={adminLabelCls}>Fecha desde</label>
            <input type="date" name="date_from" defaultValue={sp.date_from ?? ''} className={miraField} />
          </div>
          <div>
            <label className={adminLabelCls}>Fecha hasta</label>
            <input type="date" name="date_to" defaultValue={sp.date_to ?? ''} className={miraField} />
          </div>
          <div>
            <label className={adminLabelCls}>País</label>
            <input name="country" defaultValue={sp.country ?? ''} placeholder="Ej. ES" className={`${miraField} font-mono`} />
          </div>
          <div>
            <label className={adminLabelCls}>Moneda</label>
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
            <Link href="/admin/precios" className={miraBtn.ghost}>
              <X size={14} /> Limpiar
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="mira-card rounded-2xl">
          <EmptyState
            icon={DollarSign}
            title={hasActiveFilters ? 'Sin resultados' : 'Aún no hay precios'}
            description={
              hasActiveFilters
                ? 'Ningún registro de precio coincide con los filtros aplicados.'
                : 'Añade el primer precio manualmente o impórtalos desde archivo.'
            }
            action={hasActiveFilters ? undefined : { label: 'Añadir precio', href: '/admin/precios/nuevo' }}
          />
        </div>
      ) : (
        <>
          <PriceSummaryCards insights={insights} />

          {/*
            037 — columnas del histórico, según lo pedido:

              · fuera «Rango (mín – máx)» y «Prom.». Son opcionales y casi
                siempre vacías en las cargas reales; ocupaban dos columnas para
                enseñar dos guiones. Los datos NO se borran: siguen en la tabla
                y en el detalle del registro.
              · dentro «Lonja» y «Source».

            «Lonja» sale del REGISTRO (`product_price_records.lonja`), no de la
            ficha del producto: desde 034 una misma referencia cotiza en varias
            plazas, y `product.lonja` es solo el valor por defecto. Por eso
            también desaparece de la línea secundaria de «Referencia», donde
            repetía —y a veces contradecía— la columna nueva.

            «Source» es `metadata->>'source'`, que es donde el importador la
            guarda desde 030. Las 73.340 filas actuales la tienen informada.
            NO se deduce del nombre del fichero ni de `source_id`, que sigue
            siendo una columna huérfana con 0 filas: una fuente inventada es
            peor que un guion.

            Las dos vienen en el mismo `select` de la página (50 filas): ni una
            consulta más, ni N+1.
          */}
          <MiraTable
            headers={[
              'Fecha',
              'Referencia',
              'Clasificación',
              'Lonja',
              { label: 'Precio', align: 'right' },
              { label: 'Volumen', align: 'right' },
              'Source',
              'País · Zona',
            ]}
          >
            {rows.map((r) => {
              const sub = [r.product?.variedad, r.product?.calibre, r.product?.incoterm, r.product?.tipo].filter(Boolean)
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
                <MiraTd className="text-slate-600">{r.lonja ?? '—'}</MiraTd>
                <MiraTd align="right">
                  <span className="font-bold tabular-nums text-mira-ink">
                    {formatPrice(r.price, { unit: r.unit, currency: r.currency })}
                  </span>
                </MiraTd>
                <MiraTd align="right" className="tabular-nums text-slate-600">
                  {r.volume != null ? `${formatNumber(r.volume)}${r.unit ? ` ${unitLabel(r.unit)}` : ''}` : '—'}
                </MiraTd>
                <MiraTd className="text-xs text-slate-500">{r.source ?? '—'}</MiraTd>
                <MiraTd className="text-slate-600">
                  {[r.country, r.region].filter(Boolean).join(' · ') || '—'}
                </MiraTd>
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
