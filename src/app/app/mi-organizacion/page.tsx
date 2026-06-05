import { getMyOrganization } from '@/lib/queries/my-organization'
import Link from 'next/link'
import {
  Building2, Users, Pencil, Globe, Mail, Phone,
  MapPin, Calendar, BadgeCheck, CreditCard, Briefcase,
} from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  client_owner: 'Propietario',
  client_member: 'Miembro',
  org_owner: 'Propietario',
  org_admin: 'Administrador',
  org_member: 'Miembro',
}

const STATUS_STYLES: Record<string, string> = {
  trial:     'bg-amber-100 text-amber-800',
  active:    'bg-emerald-100 text-emerald-800',
  past_due:  'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-600',
  expired:   'bg-slate-100 text-slate-500',
}

const STATUS_LABELS: Record<string, string> = {
  trial:     'Prueba',
  active:    'Activa',
  past_due:  'Pago pendiente',
  cancelled: 'Cancelada',
  expired:   'Expirada',
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-slate-800 font-medium">{value || <span className="text-slate-400 font-normal">—</span>}</p>
    </div>
  )
}

export default async function MiOrganizacionPage() {
  const result = await getMyOrganization()

  if (result.status === 'no_org') {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3 mb-8">
          <Building2 className="text-mira-primary" size={28} />
          <h1 className="text-2xl font-display font-bold text-slate-900">Mi organización</h1>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <Building2 size={40} className="mx-auto text-slate-200 mb-4" />
          <p className="font-semibold text-slate-600 mb-1">No tienes una organización asignada</p>
          <p className="text-sm text-slate-400">Contacta con tu administrador para que te añada a una organización.</p>
        </div>
      </div>
    )
  }

  const { org, members, userRole } = result
  const isOwner = userRole === 'client_owner'

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Building2 className="text-mira-primary" size={28} />
          <div>
            <h1 className="text-2xl font-display font-bold text-slate-900">{org.name}</h1>
            <p className="text-sm text-slate-500">Mi organización</p>
          </div>
        </div>
        {isOwner && (
          <Link
            href="/app/mi-organizacion/editar"
            className="flex items-center gap-2 px-4 py-2 bg-mira-primary text-white text-sm font-semibold rounded-lg hover:bg-mira-primary/90 transition-colors"
          >
            <Pencil size={15} />
            Editar datos
          </Link>
        )}
      </div>

      <div className="space-y-5">
        {/* Plan y suscripción */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4 flex items-center gap-2">
            <CreditCard size={15} /> Plan y suscripción
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Plan</p>
              <p className="text-sm font-semibold text-mira-primary">{org.plan?.name ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Estado</p>
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[org.subscription_status] ?? 'bg-slate-100 text-slate-600'}`}>
                {STATUS_LABELS[org.subscription_status] ?? org.subscription_status}
              </span>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Alta</p>
              <p className="text-sm text-slate-800 font-medium">
                {org.subscription_start
                  ? new Date(org.subscription_start).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
                  : new Date(org.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>

        {/* Datos de empresa */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4 flex items-center gap-2">
            <Briefcase size={15} /> Datos de empresa
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
            <Field label="Razón social" value={org.name} />
            <Field label="Tipo" value={org.type} />
            <Field label="CIF / NIF" value={org.cif_nif} />
            <Field label="Sector" value={org.sector} />
            <Field label="Facturación anual" value={org.annual_revenue_range} />
            <Field label="Nº empleados" value={org.employee_count_range} />
          </div>
        </div>

        {/* Datos de contacto — editables */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide flex items-center gap-2">
              <MapPin size={15} /> Contacto y ubicación
            </h2>
            {isOwner && (
              <Link href="/app/mi-organizacion/editar" className="text-xs text-mira-primary font-semibold hover:underline flex items-center gap-1">
                <Pencil size={11} /> Editar
              </Link>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="flex items-start gap-2.5">
              <MapPin size={15} className="text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Ubicación</p>
                <p className="text-sm text-slate-800 font-medium">
                  {[org.city, org.country].filter(Boolean).join(', ') || '—'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Phone size={15} className="text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Teléfono</p>
                <p className="text-sm text-slate-800 font-medium">{org.phone || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Mail size={15} className="text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Email</p>
                <p className="text-sm text-slate-800 font-medium">{org.email || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Globe size={15} className="text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Web</p>
                {org.website
                  ? <a href={org.website} target="_blank" rel="noopener noreferrer" className="text-sm text-mira-primary font-medium hover:underline">{org.website}</a>
                  : <p className="text-sm text-slate-800 font-medium">—</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Miembros */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <Users size={15} className="text-slate-400" />
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">
              Miembros <span className="text-slate-300 font-normal">({members.length})</span>
            </h2>
          </div>
          {members.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">Sin miembros registrados.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Nombre</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Rol</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Miembro desde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m) => {
                  const name = [m.profile?.first_name, m.profile?.last_name].filter(Boolean).join(' ') || '—'
                  const isMe = false // Could compare m.user_id with current user if needed
                  return (
                    <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-mira-primary/10 text-mira-primary flex items-center justify-center text-xs font-bold shrink-0">
                            {name !== '—' ? name.charAt(0).toUpperCase() : '?'}
                          </div>
                          <span className="font-semibold text-slate-800">{name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                          m.role === 'client_owner' || m.role === 'org_owner'
                            ? 'bg-mira-primary/10 text-mira-primary'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {(m.role === 'client_owner' || m.role === 'org_owner') && <BadgeCheck size={10} />}
                          {ROLE_LABELS[m.role] ?? m.role}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-500">
                        {new Date(m.joined_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
