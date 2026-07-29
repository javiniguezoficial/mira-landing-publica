import {
  Building2, Users, FileText, Newspaper, Truck, TrendingUp,
  Plus, MapPin, HelpCircle, Zap, ArrowRight,
} from 'lucide-react'
import { currencySymbol, unitLabel } from '@/lib/utils'
import { redirect } from 'next/navigation'
import { getActiveOrg } from '@/lib/queries/user-org'
import { canCreateRfq } from '@/lib/queries/rfq-capability'
import { ORGANIZATION_ACCESS_MESSAGES } from '@/lib/auth/access'
import { organizationRoleLabel } from '@/lib/identity'
import { getClientDashboardData } from '@/lib/queries/client-dashboard'
import { getLatestPrices } from '@/lib/queries/admin-dashboard'
import { createClient } from '@/lib/supabase/server'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { MiraKpiCard } from '@/components/mira/MiraKpiCard'
import { MiraChartCard } from '@/components/mira/MiraChartCard'
import { MiraSectionCard } from '@/components/mira/MiraSectionCard'
import { MiraStatusBadge } from '@/components/mira/MiraStatusBadge'
import { MiraQuickAction } from '@/components/mira/MiraQuickAction'
import { MiraDonut } from '@/components/mira/charts/MiraDonut'
import { MiraRankBars } from '@/components/mira/charts/MiraRankBars'
import { RFQ_COLORS } from '@/components/mira/charts/palette'

export const dynamic = 'force-dynamic'

// El rol llega ya normalizado desde `getActiveOrg`; `organizationRoleLabel`
// traduce tanto el valor canónico como el legacy a la misma etiqueta visible.

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (d < 60) return `${d}s`
  if (d < 3600) return `${Math.floor(d / 60)}m`
  if (d < 86400) return `${Math.floor(d / 3600)}h`
  return `${Math.floor(d / 86400)}d`
}

/**
 * Pantalla de acceso no disponible.
 *
 * Sirve para los dos casos, con textos distintos: no pertenecer a ninguna
 * organización y pertenecer sin acceso activo. Antes solo existía el primero y
 * se usaba también para el segundo, de modo que a alguien suspendido se le
 * decía que no tiene empresa. Soporte sigue accesible desde el menú lateral en
 * ambos casos: es la vía por la que puede reclamar.
 */
function SinAccesoScreen({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-mira-magenta-soft">
        <Building2 size={32} className="text-mira-magenta" />
      </div>
      <h2 className="mb-2 text-xl font-black text-mira-ink">{titulo}</h2>
      <p className="max-w-sm text-sm text-slate-500">{descripcion}</p>
      <a href="/app/ayuda" className="mt-6 text-sm font-bold text-mira-magenta hover:underline">
        Contactar con soporte
      </a>
    </div>
  )
}

export default async function AppDashboard() {
  const result = await getActiveOrg()

  if (result.status === 'no_org') {
    return (
      <SinAccesoScreen
        titulo="Sin organización asignada"
        descripcion={ORGANIZATION_ACCESS_MESSAGES.no_membership}
      />
    )
  }

  if (result.status === 'inactive') {
    return <SinAccesoScreen titulo="Acceso no disponible" descripcion={result.access.message} />
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { org } = result
  const [data, latestPrices, puedeCrearRfq] = await Promise.all([
    getClientDashboardData(org.id, user.id),
    getLatestPrices(5),
    canCreateRfq(),
  ])

  const roleLabel = organizationRoleLabel(org.userRole)
  const rfqDonut = data.rfqStatusCounts.map(d => ({ label: d.label, value: d.count, color: RFQ_COLORS[d.status] ?? '#94A3B8' }))
  const priceBars = latestPrices.map(p => ({
    label: p.product,
    value: p.price,
    sublabel: `${currencySymbol(p.currency)}/${unitLabel(p.unit)}`,
  }))

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader
        icon={Building2}
        title={org.name}
        subtitle={`Organización activa · Rol: ${roleLabel}`}
        actions={
          <>
            <span className="rounded-xl border border-mira-line bg-white px-3 py-2 text-xs font-bold text-slate-600">
              {org.plan?.name ?? 'Sin plan'}
            </span>
            <MiraStatusBadge status={org.subscription_status} kind="sub" className="px-3 py-2 text-xs" />
            {puedeCrearRfq && (
              <a href="/app/rfqs/nueva" className="inline-flex items-center gap-1.5 rounded-xl bg-mira-magenta px-4 py-2 text-sm font-bold text-white shadow-lg shadow-mira-magenta/25 transition-colors hover:bg-mira-magenta-deep">
                <Plus size={14} /> Nueva RFQ
              </a>
            )}
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiraKpiCard label="Miembros" value={org.memberCount} sublabel="en tu organización" icon={Users} tint="violet" href="/app/mi-organizacion" />
        <MiraKpiCard label="RFQs activas" value={data.rfqsActive} sublabel={`de ${data.rfqsTotal} total`} icon={FileText} tint="magenta" href="/app/rfqs" />
        <MiraKpiCard label="Respuestas" value={data.responsesReceived} sublabel="de proveedores" icon={TrendingUp} tint="emerald" href="/app/rfqs" />
        <MiraKpiCard label="Proveedores" value={data.suppliersAvailable} sublabel="disponibles" icon={Truck} tint="cyan" href="/app/proveedores" />
      </div>

      {/* Market Intelligence protagonista + donut RFQs */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 xl:gap-6">
        <MiraChartCard
          className="xl:col-span-2"
          icon={Zap}
          title="Market Intelligence"
          subtitle="Precios de referencia más recientes (€)"
          action={{ label: 'Explorar mercados', href: '/app/market-intelligent' }}
        >
          {priceBars.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">Sin datos de precios disponibles</p>
          ) : (
            <MiraRankBars data={priceBars} decimals={2} />
          )}
          <a href="/app/market-intelligent" className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-mira-magenta to-mira-magenta-deep py-2.5 text-sm font-bold text-white shadow-md shadow-mira-magenta/25 transition-opacity hover:opacity-90">
            <TrendingUp size={15} /> Ver evolución de precios
          </a>
        </MiraChartCard>

        <MiraChartCard
          icon={FileText}
          iconTint="bg-purple-100 text-purple-600"
          title="Mis cotizaciones"
          subtitle={`${data.rfqsTotal} RFQs en total`}
          action={{ label: 'Ver', href: '/app/rfqs' }}
        >
          <MiraDonut data={rfqDonut} unit="RFQs" height={220} />
        </MiraChartCard>
      </div>

      {/* Mis RFQs + noticias */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:gap-6">
        <MiraSectionCard title="Mis últimas RFQs" icon={FileText} iconTint="bg-purple-100 text-purple-600" action={{ label: 'Ver todas', href: '/app/rfqs' }}>
          {data.recentRfqs.length === 0
            ? <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
                <FileText size={28} className="text-slate-300" />
                <p className="text-sm text-slate-400">Sin RFQs todavía</p>
                {puedeCrearRfq && <a href="/app/rfqs/nueva" className="rounded-xl bg-mira-magenta px-4 py-2 text-xs font-bold text-white">Nueva RFQ</a>}
              </div>
            : <div className="divide-y divide-mira-line">
                {data.recentRfqs.map(rfq => (
                  <a key={rfq.id} href={`/app/rfqs/${rfq.id}`} className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-mira-canvas">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-50"><FileText size={13} className="text-purple-500" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-800 transition-colors group-hover:text-mira-magenta">{rfq.product_name ?? 'Producto'}</p>
                      <p className="text-[10px] text-slate-400">{rfq.quantity} {rfq.unit}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <MiraStatusBadge status={rfq.status} kind="rfq" />
                      <span className="text-[10px] text-slate-400">{timeAgo(rfq.created_at)}</span>
                    </div>
                  </a>
                ))}
              </div>
          }
        </MiraSectionCard>

        <MiraSectionCard title="Últimas noticias" icon={Newspaper} iconTint="bg-emerald-100 text-emerald-600" action={{ label: 'Ver todas', href: '/app/noticias' }}>
          {data.recentNews.length === 0
            ? <div className="px-5 py-10 text-center text-sm text-slate-400">Sin noticias publicadas</div>
            : <div className="divide-y divide-mira-line">
                {data.recentNews.map(n => (
                  <a key={n.id} href={`/app/noticias/${n.slug}`} className="group flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-mira-canvas">
                    {n.image_url
                      ? <img src={n.image_url} alt="" className="h-11 w-11 shrink-0 rounded-xl bg-slate-100 object-cover" />
                      : <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50"><Newspaper size={16} className="text-emerald-400" /></div>
                    }
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs font-bold text-slate-800 transition-colors group-hover:text-mira-magenta">{n.title}</p>
                      {n.excerpt && <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-400">{n.excerpt}</p>}
                      <p className="mt-1 text-[10px] text-slate-400">{timeAgo(n.created_at)}</p>
                    </div>
                  </a>
                ))}
              </div>
          }
        </MiraSectionCard>
      </div>

      {/* Accesos rápidos */}
      <div className="mira-card rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-black text-mira-ink">Accesos rápidos</h2>
          <a href="/app/ayuda" className="flex items-center gap-1 text-xs font-bold text-mira-magenta hover:underline">Ayuda <ArrowRight size={12} /></a>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {puedeCrearRfq && <MiraQuickAction href="/app/rfqs/nueva" label="Nueva RFQ" desc="Solicitar cotización" icon={Plus} gradient="from-mira-magenta to-purple-600" />}
          <MiraQuickAction href="/app/market-intelligent" label="Market Intelligence" desc="Precios de mercado" icon={TrendingUp} gradient="from-fuchsia-500 to-pink-600" />
          <MiraQuickAction href="/app/proveedores" label="Proveedores" desc="Mapa y catálogo" icon={MapPin} gradient="from-cyan-500 to-blue-600" />
          <MiraQuickAction href="/app/ayuda" label="Ayuda" desc="FAQ y soporte" icon={HelpCircle} gradient="from-emerald-500 to-teal-600" />
        </div>
      </div>
    </div>
  )
}
