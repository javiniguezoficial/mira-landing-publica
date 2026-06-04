import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Mail, Phone, Building2 } from 'lucide-react'
import { getProfileById, getUserOrganizations } from '@/lib/actions/users'
import { UserRoleBadge } from '@/components/admin/users/UserRoleBadge'
import { ClientStatusBadge } from '@/components/admin/clients/ClientStatusBadge'

export const dynamic = 'force-dynamic'

const ORG_ROLE_LABEL: Record<string, string> = {
  client_owner:  'Owner',
  client_member: 'Member',
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default async function UsuarioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [user, memberships] = await Promise.all([
    getProfileById(id),
    getUserOrganizations(id),
  ])

  if (!user) notFound()

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || '—'
  const initials = (user.first_name ?? user.email)?.[0]?.toUpperCase() ?? '?'

  return (
    <div className="p-8 max-w-3xl">
      {/* Cabecera */}
      <div className="mb-8">
        <Link
          href="/admin/usuarios"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 mb-4 transition-colors"
        >
          <ChevronLeft size={14} />
          Volver a usuarios
        </Link>

        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-mira-primary/10 flex items-center justify-center shrink-0 text-xl font-bold text-mira-primary">
            {initials}
          </div>
          <div>
            <h1 className="text-2xl font-heading font-bold text-slate-900">{fullName}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-slate-500">{user.email}</span>
              <UserRoleBadge role={user.role} />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Perfil */}
        <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-5">Perfil</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <Mail size={15} className="text-slate-400 shrink-0" />
              <span className="text-sm text-slate-700">{user.email || '—'}</span>
            </div>
            <div className="flex items-center gap-3">
              <Phone size={15} className="text-slate-400 shrink-0" />
              <span className="text-sm text-slate-700">{user.phone || '—'}</span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-6 text-xs text-slate-500">
            <span>Alta: {fmt(user.created_at)}</span>
          </div>
        </section>

        {/* Organizaciones */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100">
            <Building2 size={15} className="text-slate-400" />
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Organizaciones ({memberships.length})
            </h2>
          </div>

          {memberships.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8 font-body">
              Este usuario no pertenece a ninguna organización.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Organización', 'Rol', 'Estado', 'Incorporación'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {memberships.map((m) => {
                  const org = (m.organization as unknown) as { id: string; name: string; subscription_status: string; plan: { name: string } | null } | null
                  return (
                    <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        {org ? (
                          <Link href={`/admin/clientes/${org.id}`} className="font-semibold text-slate-900 hover:text-mira-primary transition-colors">
                            {org.name}
                          </Link>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {ORG_ROLE_LABEL[m.role] ?? m.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {org && <ClientStatusBadge status={org.subscription_status as never} />}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {new Date(m.joined_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  )
}
