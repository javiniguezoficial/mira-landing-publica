import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Pencil, Building2, Mail, Phone, Globe, MapPin, Users } from 'lucide-react'
import { getOrganizationById, getOrganizationOwner, getPlans } from '@/lib/actions/organizations'
import { requirePlatformAdmin } from '@/lib/auth/guards'
import { getOrganizationMembers, getProfiles } from '@/lib/actions/users'
import { ClientLifecycleCard } from '@/components/admin/clients/ClientLifecycleCard'
import { OrganizationModulesCard } from '@/components/admin/clients/OrganizationModulesCard'
import { OrganizationMarketsCard } from '@/components/admin/clients/OrganizationMarketsCard'
import { getOrganizationMarketOptions } from '@/lib/actions/organization-markets'
import { parseOrganizationModules } from '@/lib/auth/modules'
import { MiraStatusBadge } from '@/components/mira/MiraStatusBadge'
import { MembersTable } from '@/components/admin/users/MembersTable'
import { AddMemberModal } from '@/components/admin/users/AddMemberModal'
import { miraBtn } from '@/lib/miraButtons'

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
  // 039 — se necesita saber QUIÉN mira para poder marcar su propia fila en el
  // equipo: nadie modifica su propia pertenencia, ni siquiera un administrador
  // de plataforma (trigger de 023).
  const { userId: actorId } = await requirePlatformAdmin()

  const { id } = await params
  const [org, members, allUsers, owner, planes, mercados] = await Promise.all([
    getOrganizationById(id),
    getOrganizationMembers(id),
    getProfiles(),
    getOrganizationOwner(id),
    getPlans(),
    // 2.2 — catálogo con el estado por organización, en dos consultas fijas.
    getOrganizationMarketOptions(id),
  ])
  if (!org) notFound()

  const modules = parseOrganizationModules(org.modules)

  const existingMemberIds = members.map((m) => m.user_id)

  const createdAt = new Date(org.created_at).toLocaleDateString('es-ES', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <div className="w-full max-w-4xl space-y-6 p-4 md:p-6 xl:p-8">
      {/* Cabecera */}
      <div>
        <Link
          href="/admin/clientes"
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition-colors hover:text-mira-magenta"
        >
          <ChevronLeft size={14} />
          Volver a clientes
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-mira-magenta to-mira-magenta-deep shadow-lg shadow-mira-magenta/30">
              <Building2 size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-mira-ink md:text-2xl">{org.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                {org.type && (
                  <span className="text-xs text-slate-500">{TYPE_LABEL[org.type]}</span>
                )}
                {org.cif_nif && (
                  <span className="font-mono text-xs text-slate-500">{org.cif_nif}</span>
                )}
                <MiraStatusBadge status={org.subscription_status} kind="sub" />
              </div>
            </div>
          </div>
          <Link href={`/admin/clientes/${org.id}/editar`} className={`${miraBtn.ghost} shrink-0`}>
            <Pencil size={14} />
            Editar
          </Link>
        </div>
      </div>

      <div className="space-y-6">
        <ClientLifecycleCard
          organizationId={org.id}
          status={org.status}
          planSlug={org.plan?.slug ?? null}
          requestedPlanName={
            (planes ?? []).find((p) => p.id === org.requested_plan_id)?.name ?? null
          }
          planes={(planes ?? []).map((p) => ({ slug: p.slug as string, name: p.name as string }))}
          owner={owner ? { firstName: owner.firstName, lastName: owner.lastName, status: owner.status } : null}
        />

        {/* Módulos contratados (1.4). El jsonb llega crudo de PostgREST y se
            normaliza aquí; la tarjeta solo trabaja con el tipo ya validado. */}
        <OrganizationModulesCard organizationId={org.id} modules={modules} />

        {/* 2.2 — sección propia y separada de «Módulos disponibles»: una decide
            si tiene el módulo, la otra qué mercados ve dentro de él. */}
        <OrganizationMarketsCard
          organizationId={org.id}
          markets={mercados}
          moduleEnabled={modules.markets}
        />

        {/* Datos de empresa */}
        <section className="mira-card rounded-2xl p-5 sm:p-6">
          <h2 className="mb-5 text-xs font-bold uppercase tracking-wider text-slate-400">
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
        <section className="mira-card rounded-2xl p-5 sm:p-6">
          <h2 className="mb-5 text-xs font-bold uppercase tracking-wider text-slate-400">
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
                    className="truncate text-sm text-mira-magenta hover:underline">
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
        <section className="mira-card rounded-2xl p-5 sm:p-6">
          <h2 className="mb-5 text-xs font-bold uppercase tracking-wider text-slate-400">
            Plan y suscripción
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-5">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Plan</span>
              {org.plan ? (
                <span className="mt-0.5 inline-flex w-fit items-center rounded-lg bg-mira-magenta-soft px-2 py-0.5 text-xs font-bold text-mira-magenta">
                  {org.plan.name}
                </span>
              ) : (
                <span className="text-sm text-slate-400">Sin asignar</span>
              )}
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Estado</span>
              <div className="mt-0.5">
                <MiraStatusBadge status={org.subscription_status} kind="sub" />
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

        {/* Miembros */}
        <section className="mira-card overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-mira-line px-5 py-3.5">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-mira-magenta-soft">
                <Users size={14} className="text-mira-magenta" />
              </div>
              <h2 className="text-sm font-black text-mira-ink">
                Miembros ({members.length})
              </h2>
            </div>
            <AddMemberModal orgId={org.id} existingMemberIds={existingMemberIds} allUsers={allUsers} />
          </div>
          <MembersTable
            members={members}
            orgId={org.id}
            commercialProfile={org.commercial_profile ?? null}
            actorId={actorId}
          />
        </section>
      </div>
    </div>
  )
}
