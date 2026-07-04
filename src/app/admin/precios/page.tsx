import Link from 'next/link'
import { Plus, Upload, DollarSign, Search, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { listPriceRecordsFiltered, getPricingTree, type PriceListFilters } from '@/lib/actions/prices'
import { PricingHierarchySelects } from '@/components/admin/prices/PricingHierarchySelects'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { MiraTable, MiraTr, MiraTd } from '@/components/mira/MiraTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { miraBtn, miraField } from '@/lib/miraButtons'
import { formatPrice } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
const adminLabelCls = 'mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400'
const CURRENCIES = ['EUR', 'USD', 'GBP']

type SP = {
  strategic_market_id?: string
  category_id?: string
  market_id?: string
  product_id?: string
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

export default async function AdminPreciosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page ?? '1') || 1)

  const filters: PriceListFilters = {
    strategic_market_id: sp.strategic_market_id || undefined,
    category_id: sp.category_id || undefined,
    market_id: sp.market_id || undefined,
    product_id: sp.product_id || undefined,
    date_from: sp.date_from || undefined,
    date_to: sp.date_to || undefined,
    country: sp.country || undefined,
    currency: sp.currency || undefined,
  }

  const [{ rows, total, hasMore }, hierarchy] = await Promise.all([
    listPriceRecordsFiltered({ ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    getPricingTree(),
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
          <MiraTable
            headers={[
              'Fecha',
              'Referencia',
              'Clasificación',
              { label: 'Precio', align: 'right' },
              'País · Zona',
              { label: 'Rango', align: 'right' },
            ]}
          >
            {rows.map((r) => (
              <MiraTr key={r.id}>
                <MiraTd className="whitespace-nowrap text-slate-500">{formatDate(r.recorded_at)}</MiraTd>
                <MiraTd>
                  <div className="font-bold text-mira-ink">{r.product?.name ?? '—'}</div>
                  {(r.product?.variedad || r.product?.calibre || r.product?.lonja) && (
                    <div className="text-xs text-slate-400">
                      {[r.product?.variedad, r.product?.calibre, r.product?.lonja].filter(Boolean).join(' · ')}
                    </div>
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
                <MiraTd className="text-slate-600">
                  {[r.country, r.region].filter(Boolean).join(' · ')}
                </MiraTd>
                <MiraTd align="right" className="tabular-nums text-xs text-slate-400">
                  {r.min_price != null || r.max_price != null
                    ? `${formatPrice(r.min_price, { currency: r.currency })} – ${formatPrice(r.max_price, { currency: r.currency })}`
                    : '—'}
                </MiraTd>
              </MiraTr>
            ))}
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
