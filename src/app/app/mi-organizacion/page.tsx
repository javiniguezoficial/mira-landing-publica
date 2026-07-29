import { getMyOrganization } from '@/lib/queries/my-organization'
import { ORGANIZATION_ACCESS_MESSAGES } from '@/lib/auth/access'
import Link from 'next/link'
import {
  Building2, Users, Pencil, Globe, Mail, Phone,
  MapPin, CreditCard, Briefcase, BadgeCheck,
} from 'lucide-react'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { MiraStatusBadge } from '@/components/mira/MiraStatusBadge'
import { MiraTable, MiraTr, MiraTd } from '@/components/mira/MiraTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { miraBtn } from '@/lib/miraButtons'
import { organizationRoleLabel, isOwner as isOwnerRole } from '@/lib/identity'

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value || <span className="font-normal text-slate-400">—</span>}</p>
    </div>
  )
}

function SectionCard({ icon: Icon, title, action, children }: { icon: any; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mira-card rounded-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-500">
          <Icon size={15} /> {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  )
}

export default async function MiOrganizacionPage() {
  const result = await getMyOrganization()

  if (result.status === 'no_org') {
    return (
      <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
        <MiraPageHeader icon={Building2} title="Mi organización" />
        <div className="mira-card rounded-2xl">
          <EmptyState icon={Building2} title="No tienes una organización asignada" description={ORGANIZATION_ACCESS_MESSAGES.no_membership} />
        </div>
      </div>
    )
  }

  // Pertenece, pero su acceso no está activo. No se intenta una vista de solo
  // lectura: `is_org_member()` deniega el SELECT, así que no habría datos que
  // mostrar. Lo útil aquí es decir por qué y hacia dónde ir.
  if (result.status === 'inactive') {
    return (
      <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
        <MiraPageHeader icon={Building2} title="Mi organización" />
        <div className="mira-card rounded-2xl">
          <EmptyState icon={Building2} title="Acceso no disponible" description={result.access.message} />
        </div>
      </div>
    )
  }

  const { org, members, userRole } = result
  const isOwner = isOwnerRole(userRole)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader
        icon={Building2}
        title={org.name}
        subtitle="Mi organización"
        actions={isOwner && (
          <Link href="/app/mi-organizacion/editar" className={miraBtn.primary}>
            <Pencil size={15} /> Editar datos
          </Link>
        )}
      />

      {/* Plan y suscripción */}
      <SectionCard icon={CreditCard} title="Plan y suscripción">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
          <div>
            <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Plan</p>
            <p className="text-sm font-bold text-mira-magenta">{org.plan?.name ?? '—'}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Estado</p>
            <MiraStatusBadge status={org.subscription_status} kind="sub" />
          </div>
          <div>
            <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Alta</p>
            <p className="text-sm font-medium text-slate-800">
              {(org.subscription_start ? new Date(org.subscription_start) : new Date(org.created_at))
                .toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Datos de empresa */}
      <SectionCard icon={Briefcase} title="Datos de empresa">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
          <Field label="Razón social" value={org.name} />
          <Field label="Tipo" value={org.type} />
          <Field label="CIF / NIF" value={org.cif_nif} />
          <Field label="Sector" value={org.sector} />
          <Field label="Facturación anual" value={org.annual_revenue_range} />
          <Field label="Nº empleados" value={org.employee_count_range} />
        </div>
      </SectionCard>

      {/* Contacto y ubicación */}
      <SectionCard
        icon={MapPin}
        title="Contacto y ubicación"
        action={isOwner && (
          <Link href="/app/mi-organizacion/editar" className="flex items-center gap-1 text-xs font-bold text-mira-magenta hover:underline">
            <Pencil size={11} /> Editar
          </Link>
        )}
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {[
            { icon: MapPin, label: 'Ubicación', value: [org.city, org.country].filter(Boolean).join(', ') || '—' },
            { icon: Phone, label: 'Teléfono', value: org.phone || '—' },
            { icon: Mail, label: 'Email', value: org.email || '—' },
          ].map(({ icon: Ic, label, value }) => (
            <div key={label} className="flex items-start gap-2.5">
              <Ic size={15} className="mt-0.5 shrink-0 text-slate-400" />
              <div>
                <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                <p className="text-sm font-medium text-slate-800">{value}</p>
              </div>
            </div>
          ))}
          <div className="flex items-start gap-2.5">
            <Globe size={15} className="mt-0.5 shrink-0 text-slate-400" />
            <div>
              <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Web</p>
              {org.website
                ? <a href={org.website} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-mira-magenta hover:underline">{org.website}</a>
                : <p className="text-sm font-medium text-slate-800">—</p>}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Miembros */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-500">
          <Users size={15} /> Miembros <span className="font-normal text-slate-300">({members.length})</span>
        </h2>
        {members.length === 0 ? (
          <div className="mira-card rounded-2xl p-8 text-center text-sm text-slate-400">Sin miembros registrados.</div>
        ) : (
          <MiraTable headers={['Nombre', 'Rol', 'Miembro desde']}>
            {members.map((m) => {
              const name = [m.profile?.first_name, m.profile?.last_name].filter(Boolean).join(' ') || '—'
              const memberIsOwner = m.orgRole === 'owner'
              return (
                <MiraTr key={m.id}>
                  <MiraTd>
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mira-magenta-soft text-xs font-bold text-mira-magenta">
                        {name !== '—' ? name.charAt(0).toUpperCase() : '?'}
                      </div>
                      <span className="font-bold text-mira-ink">{name}</span>
                    </div>
                  </MiraTd>
                  <MiraTd>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${memberIsOwner ? 'bg-mira-magenta-soft text-mira-magenta' : 'bg-slate-100 text-slate-600'}`}>
                      {memberIsOwner && <BadgeCheck size={10} />}
                      {organizationRoleLabel(m.orgRole)}
                    </span>
                  </MiraTd>
                  <MiraTd className="text-slate-500">
                    {new Date(m.joined_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </MiraTd>
                </MiraTr>
              )
            })}
          </MiraTable>
        )}
      </div>
    </div>
  )
}
