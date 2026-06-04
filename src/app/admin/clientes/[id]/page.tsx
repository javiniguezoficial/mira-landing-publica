import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Pencil, Building2, Mail, Phone, Globe, MapPin, Users } from 'lucide-react'
import { getOrganizationById } from '@/lib/actions/organizations'
import { ClientStatusBadge } from '@/components/admin/clients/ClientStatusBadge'

export const dynamic = 'force-dynamic'

const TYPE_LABEL: Record<string, string> = { fisica: 'Persona física', juridica: 'Persona jurídica' }

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</span>
      <span className="text-sm text-slate-800 font-body">{value || '—'}</span>
    </div>
  )
}

export default async function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const org = await getOrganizationById(id)
  if (!org) notFound()

  const createdAt = new Date(org.created_at).toLocaleDateString('es-ES', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <div className="p-8 max-w-4xl">
      {/* Cabecera */}
      <div className="mb-8">
        <Link
          href="/admin/clientes"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 mb-4 transition-colors"
        >
          <ChevronLeft size={14} />
          Volver a clientes
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-mira-primary/10 flex items-center justify-center shrink-0">
              <Building2 size={22} className="text-mira-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-heading font-bold text-slate-900">{org.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                {org.type && (
                  <span className="text-xs text-slate-500 font-body">{TYPE_LABEL[org.type]}</span>
                )}
                {org.cif_nif && (
                  <span className="text-xs font-mono text-slate-500">{org.cif_nif}</span>
                )}
                <ClientStatusBadge status={org.subscription_status} />
              </div>
            </div>
          </div>
          <Link
            href={`/admin/clientes/${org.id}/editar`}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shrink-0"
          >
            <Pencil size={14} />
            Editar
          </Link>
        </div>
      </div>

      <div className="space-y-6">
        {/* Datos de empresa */}
        <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-5">
            Datos de la empresa
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-5">
            <DetailRow label="Sector" value={org.sector} />
            <DetailRow label="Facturación anual" value={org.annual_revenue_range} />
            <DetailRow label="Empleados" value={org.employee_count_range} />
            <DetailRow label="Alta en plataforma" value={createdAt} />
          </div>
        </section>

        {/* Contacto */}
        <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-5">
            Contacto y ubicación
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { icon: Mail,  label: org.email,   href: org.email ? `mailto:${org.email}` : null },
              { icon: Phone, label: org.phone,   href: org.phone ? `tel:${org.phone}` : null },
              { icon: Globe, label: org.website, href: org.website ?? null },
              { icon: MapPin, label: [org.city, org.country].filter(Boolean).join(', ') || null, href: null },
            ].map(({ icon: Icon, label, href }) => (
              <div key={label ?? Math.random()} className="flex items-center gap-3">
                <Icon size={15} className="text-slate-400 shrink-0" />
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-mira-primary hover:underline truncate">
                    {label}
                  </a>
                ) : (
                  <span className="text-sm text-slate-600 truncate">{label || '—'}</span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Plan y suscripción */}
        <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-5">
            Plan y suscripción
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-5">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Plan</span>
              {org.plan ? (
                <span className="inline-flex w-fit items-center px-2 py-0.5 rounded text-xs font-bold bg-mira-primary/10 text-mira-primary border border-mira-primary/20 mt-0.5">
                  {org.plan.name}
                </span>
              ) : (
                <span className="text-sm text-slate-400">Sin asignar</span>
              )}
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Estado</span>
              <div className="mt-0.5">
                <ClientStatusBadge status={org.subscription_status} />
              </div>
            </div>
            {org.subscription_start && (
              <DetailRow label="Inicio suscripción" value={new Date(org.subscription_start).toLocaleDateString('es-ES')} />
            )}
            {org.subscription_end && (
              <DetailRow label="Fin suscripción" value={new Date(org.subscription_end).toLocaleDateString('es-ES')} />
            )}
          </div>
        </section>

        {/* Miembros — stub */}
        <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Users size={16} className="text-slate-400" />
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Miembros</h2>
          </div>
          <p className="text-sm text-slate-400 font-body text-center py-6">
            La gestión de miembros se implementará en la siguiente fase.
          </p>
        </section>
      </div>
    </div>
  )
}
