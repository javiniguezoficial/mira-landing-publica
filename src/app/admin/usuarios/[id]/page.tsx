import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Mail, Phone, Building2 } from 'lucide-react'
import { getProfileById, getUserOrganizations } from '@/lib/actions/users'
import { MiraStatusBadge } from '@/components/mira/MiraStatusBadge'

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
    <div className="w-full max-w-3xl space-y-6 p-4 md:p-6 xl:p-8">
      {/* Cabecera */}
      <div>
        <Link
          href="/admin/usuarios"
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition-colors hover:text-mira-magenta"
        >
          <ChevronLeft size={14} />
          Volver a usuarios
        </Link>

        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-mira-magenta to-mira-magenta-deep text-xl font-bold text-white shadow-lg shadow-mira-magenta/30">
            {initials}
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-mira-ink md:text-2xl">{fullName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <span className="text-sm text-slate-500">{user.email}</span>
              <MiraStatusBadge status={user.role} kind="role" />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Perfil */}
        <section className="mira-card rounded-2xl p-5 sm:p-6">
          <h2 className="mb-5 text-xs font-bold uppercase tracking-wider text-slate-400">Perfil</h2>
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
          <div className="mt-4 flex items-center gap-6 border-t border-mira-line pt-4 text-xs text-slate-500">
            <span>Alta: {fmt(user.created_at)}</span>
          </div>
        </section>

        {/* Organizaciones */}
        <section className="mira-card overflow-hidden rounded-2xl">
          <div className="flex items-center gap-2 border-b border-mira-line px-5 py-3.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-mira-magenta-soft">
              <Building2 size={14} className="text-mira-magenta" />
            </div>
            <h2 className="text-sm font-black text-mira-ink">
              Organizaciones ({memberships.length})
            </h2>
          </div>

          {memberships.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              Este usuario no pertenece a ninguna organización.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-mira-line bg-mira-canvas/60">
                    {['Organización', 'Rol', 'Estado', 'Incorporación'].map((h) => (
                      <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-mira-line">
                  {memberships.map((m) => {
                    const org = (m.organization as unknown) as { id: string; name: string; subscription_status: string; plan: { name: string } | null } | null
                    return (
                      <tr key={m.id} className="transition-colors hover:bg-mira-canvas/70">
                        <td className="whitespace-nowrap px-4 py-3">
                          {org ? (
                            <Link href={`/admin/clientes/${org.id}`} className="font-bold text-mira-ink transition-colors hover:text-mira-magenta">
                              {org.name}
                            </Link>
                          ) : '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="inline-flex items-center rounded-lg bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                            {ORG_ROLE_LABEL[m.role] ?? m.role}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {org && <MiraStatusBadge status={org.subscription_status} kind="sub" />}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                          {new Date(m.joined_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
