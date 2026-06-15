import {
  Building2, Users, FileText, LifeBuoy, Newspaper,
  Truck, Package, TrendingUp, Plus, Upload, PlusCircle, LayoutDashboard, Tag,
} from 'lucide-react'
import { formatNumber, formatPrice } from '@/lib/utils'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { MiraKpiCard } from '@/components/mira/MiraKpiCard'
import { MiraChartCard } from '@/components/mira/MiraChartCard'
import { MiraSectionCard } from '@/components/mira/MiraSectionCard'
import { MiraStatusBadge } from '@/components/mira/MiraStatusBadge'
import { MiraDonut } from '@/components/mira/charts/MiraDonut'
import { MiraAreaChart } from '@/components/mira/charts/MiraAreaChart'
import { MiraVerticalBars } from '@/components/mira/charts/MiraVerticalBars'
import { TICKET_COLORS } from '@/components/mira/charts/palette'
import { EmptyState } from '@/components/shared/EmptyState'
import {
  getAdminKpis, getRecentRfqs, getRecentTickets, getRecentNews,
  getRfqStatusCounts, getTicketStatusCounts, getPriceRecordsLast30Days, getLatestPrices,
} from '@/lib/queries/admin-dashboard'

export const dynamic = 'force-dynamic'

const PRI_C: Record<string, string> = { low: 'text-slate-400', normal: 'text-violet-500', high: 'text-red-500' }
const PRI_L: Record<string, string> = { low: 'Baja', normal: 'Normal', high: 'Alta' }

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (d < 60) return `${d}s`
  if (d < 3600) return `${Math.floor(d / 60)}m`
  if (d < 86400) return `${Math.floor(d / 3600)}h`
  return `${Math.floor(d / 86400)}d`
}

const btnPrimary = 'inline-flex items-center gap-1.5 rounded-xl bg-mira-magenta px-4 py-2 text-sm font-bold text-white shadow-lg shadow-mira-magenta/25 transition-colors hover:bg-mira-magenta-deep'
const btnGhost = 'inline-flex items-center gap-1.5 rounded-xl border border-mira-line bg-white px-4 py-2 text-sm font-bold text-slate-600 transition-colors hover:border-mira-magenta/30 hover:text-mira-magenta'

export default async function AdminDashboardPage() {
  const [kpis, recentRfqs, recentTickets, recentNews, rfqChart, ticketChart, priceChart, latestPrices] =
    await Promise.all([
      getAdminKpis(), getRecentRfqs(6), getRecentTickets(6), getRecentNews(4),
      getRfqStatusCounts(), getTicketStatusCounts(), getPriceRecordsLast30Days(), getLatestPrices(5),
    ])

  const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const rfqBars = rfqChart.map(r => ({ label: r.status, value: r.count }))
  const ticketDonut = ticketChart.map(t => ({ label: t.label, value: t.count, color: TICKET_COLORS[t.status] ?? '#94A3B8' }))
  const priceArea = priceChart.slice(-14).map(p => ({ label: p.date, value: p.count }))

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader
        icon={LayoutDashboard}
        title="Panel de administración"
        subtitle={today.charAt(0).toUpperCase() + today.slice(1)}
        actions={
          <>
            <a href="/admin/noticias/nueva" className={btnPrimary}><Plus size={14} /> Nueva noticia</a>
            <a href="/admin/precios/importar" className={btnGhost}><Upload size={14} /> Importar precios</a>
            <a href="/admin/clientes/nuevo" className={btnGhost}><PlusCircle size={14} /> Nuevo cliente</a>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiraKpiCard label="Clientes" value={kpis.organizations} sublabel="organizaciones" icon={Building2} tint="magenta" href="/admin/clientes" />
        <MiraKpiCard label="Usuarios" value={kpis.users} sublabel="perfiles activos" icon={Users} tint="blue" href="/admin/usuarios" />
        <MiraKpiCard label="RFQs abiertas" value={kpis.rfqsOpen} sublabel="pendientes" icon={FileText} tint="purple" href="/admin/rfqs" />
        <MiraKpiCard label="Tickets" value={kpis.ticketsOpen} sublabel="abiertos" icon={LifeBuoy} tint="pink" href="/admin/soporte" />
        <MiraKpiCard label="Noticias" value={kpis.newsPublished} sublabel="publicadas" icon={Newspaper} tint="emerald" href="/admin/noticias" />
        <MiraKpiCard label="Proveedores" value={kpis.suppliersActive} sublabel="activos" icon={Truck} tint="cyan" href="/admin/proveedores" />
        <MiraKpiCard label="Productos" value={kpis.productsActive} sublabel="en mercados" icon={Package} tint="violet" href="/admin/mercados" />
        <MiraKpiCard label="Precios" value={formatNumber(kpis.priceRecords)} sublabel="registros" icon={TrendingUp} tint="amber" href="/admin/mercados" />
      </div>

      {/* Gráficos principales */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 xl:gap-6">
        <MiraChartCard
          className="xl:col-span-2"
          icon={TrendingUp}
          title="Registros de precios"
          subtitle="Importaciones diarias — últimos 14 días"
          action={{ label: 'Importar', href: '/admin/precios/importar' }}
        >
          <MiraAreaChart data={priceArea} unit="registros" height={300} />
        </MiraChartCard>

        <MiraChartCard
          icon={LifeBuoy}
          iconTint="bg-pink-100 text-pink-600"
          title="Tickets de soporte"
          subtitle="Por estado"
          action={{ label: 'Ver', href: '/admin/soporte' }}
        >
          <MiraDonut data={ticketDonut} unit="tickets" height={220} />
        </MiraChartCard>
      </div>

      {/* RFQs por estado + últimos precios */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 xl:gap-6">
        <MiraChartCard
          className="xl:col-span-2"
          icon={FileText}
          iconTint="bg-purple-100 text-purple-600"
          title="RFQs por estado"
          subtitle="Distribución de solicitudes de cotización"
          action={{ label: 'Ver todas', href: '/admin/rfqs' }}
        >
          <MiraVerticalBars data={rfqBars} unit="RFQs" height={300} />
        </MiraChartCard>

        <MiraSectionCard title="Últimos precios" icon={TrendingUp} action={{ label: 'Ver', href: '/admin/mercados' }} bodyClassName="px-5 py-2">
          {latestPrices.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Sin datos</p>
          ) : latestPrices.map((p, i) => (
            <div key={i} className="flex items-center justify-between border-b border-mira-line py-3 last:border-0">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-mira-magenta-soft">
                  <TrendingUp size={13} className="text-mira-magenta" />
                </div>
                <span className="truncate text-sm font-semibold text-slate-700">{p.product}</span>
              </div>
              <div className="shrink-0 text-right">
                <span className="text-sm font-black text-mira-ink">
                  {formatPrice(p.price, { unit: p.unit, currency: p.currency, decimals: p.price > 100 ? 0 : 2 })}
                </span>
              </div>
            </div>
          ))}
        </MiraSectionCard>
      </div>

      {/* Actividad reciente */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 xl:gap-6">
        <MiraSectionCard title="Últimas RFQs" icon={FileText} iconTint="bg-purple-100 text-purple-600" action={{ label: 'Ver todas', href: '/admin/rfqs' }}>
          {recentRfqs.length === 0
            ? <EmptyState icon={FileText} title="Sin RFQs todavía" />
            : <div className="divide-y divide-mira-line">
                {recentRfqs.map(r => (
                  <a key={r.id} href={`/admin/rfqs/${r.id}`} className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-mira-canvas">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-50"><FileText size={13} className="text-purple-500" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-800 transition-colors group-hover:text-mira-magenta">{r.product_name ?? '—'}</p>
                      <p className="truncate text-[10px] text-slate-400">{r.org_name ?? 'Sin org'}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <MiraStatusBadge status={r.status} kind="rfq" />
                      <span className="text-[10px] text-slate-400">{timeAgo(r.created_at)}</span>
                    </div>
                  </a>
                ))}
              </div>
          }
        </MiraSectionCard>

        <MiraSectionCard title="Últimos tickets" icon={LifeBuoy} iconTint="bg-pink-100 text-pink-600" action={{ label: 'Ver todos', href: '/admin/soporte' }}>
          {recentTickets.length === 0
            ? <EmptyState icon={LifeBuoy} title="Sin tickets todavía" />
            : <div className="divide-y divide-mira-line">
                {recentTickets.map(t => (
                  <a key={t.id} href={`/admin/soporte/${t.id}`} className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-mira-canvas">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pink-50"><LifeBuoy size={13} className="text-pink-500" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-800 transition-colors group-hover:text-mira-magenta">{t.subject}</p>
                      <span className={`text-[10px] font-semibold ${PRI_C[t.priority] ?? ''}`}>
                        <Tag size={8} className="mr-0.5 inline" />{PRI_L[t.priority] ?? t.priority}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <MiraStatusBadge status={t.status} kind="ticket" />
                      <span className="text-[10px] text-slate-400">{timeAgo(t.created_at)}</span>
                    </div>
                  </a>
                ))}
              </div>
          }
        </MiraSectionCard>

        <MiraSectionCard title="Últimas noticias" icon={Newspaper} iconTint="bg-emerald-100 text-emerald-600" action={{ label: 'Ver todas', href: '/admin/noticias' }}>
          {recentNews.length === 0
            ? <EmptyState icon={Newspaper} title="Sin noticias" action={{ label: 'Crear', href: '/admin/noticias/nueva' }} />
            : <div className="divide-y divide-mira-line">
                {recentNews.map(n => (
                  <a key={n.id} href={`/admin/noticias/${n.id}`} className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-mira-canvas">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50"><Newspaper size={13} className="text-emerald-500" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-800 transition-colors group-hover:text-mira-magenta">{n.title}</p>
                      <span className="text-[10px] text-slate-400">{timeAgo(n.created_at)}</span>
                    </div>
                    <MiraStatusBadge status={n.status} kind="news" />
                  </a>
                ))}
              </div>
          }
        </MiraSectionCard>
      </div>
    </div>
  )
}
