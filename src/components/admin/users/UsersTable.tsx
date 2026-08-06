import Link from 'next/link'
import { Eye, Users } from 'lucide-react'
import { MiraTable, MiraTr, MiraTd } from '@/components/mira/MiraTable'
import { MiraStatusBadge } from '@/components/mira/MiraStatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatChartDateLong } from '@/lib/markets/chart-dates'
import { capabilitiesLabel, organizationRoleLabel, platformRoleLabel, statusLabel } from '@/lib/identity'
import { miraBtn } from '@/lib/miraButtons'
import type { AdminUserRow } from '@/lib/actions/users'

interface Props {
  users: AdminUserRow[]
  total: number
  hasFilters: boolean
}

function fullName(u: AdminUserRow) {
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || '—'
}

/**
 * Listado de usuarios de administración (039).
 *
 * Server Component: los filtros ya se han aplicado en servidor y viajan en la
 * URL, así que aquí no hace falta ni estado ni JavaScript.
 *
 * ── Qué se enseña, y por qué ────────────────────────────────────────────────
 *
 * Las tres cosas que hay que poder ver de un vistazo para administrar:
 * dónde está cada persona, con qué rol y con qué capacidades. Un usuario SIN
 * organización se marca de forma explícita en lugar de dejar la celda vacía:
 * es el caso que hay que localizar para poder asignarlo, no un dato que falte.
 */
export function UsersTable({ users, total, hasFilters }: Props) {
  if (users.length === 0) {
    return (
      <div className="mira-card rounded-2xl">
        <EmptyState
          icon={Users}
          title={total === 0 ? 'Aún no hay usuarios' : 'Sin resultados'}
          description={
            total === 0
              ? 'Los usuarios registrados aparecerán aquí.'
              : 'Ningún usuario coincide con los filtros aplicados.'
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <MiraTable
        headers={[
          'Usuario',
          'Email',
          'Organización',
          'Rol en la empresa',
          'Capacidades',
          'Rol de plataforma',
          'Estado',
          'Alta',
          { label: '', align: 'right' },
        ]}
      >
        {users.map((u) => {
          const principal = u.memberships[0] ?? null
          const extra = u.memberships.length - 1

          return (
            <MiraTr key={u.id}>
              <MiraTd>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mira-magenta-soft text-xs font-bold text-mira-magenta">
                    {(u.firstName ?? u.email)?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <span className="font-bold text-mira-ink">{fullName(u)}</span>
                </div>
              </MiraTd>

              <MiraTd className="text-slate-600">{u.email || '—'}</MiraTd>

              <MiraTd className="text-slate-600">
                {principal ? (
                  <div className="flex flex-col">
                    <span>{principal.organizationName}</span>
                    {extra > 0 && (
                      <span className="text-[11px] text-slate-400">
                        y {extra} organización{extra !== 1 ? 'es' : ''} más
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                    Sin organización
                  </span>
                )}
              </MiraTd>

              <MiraTd className="text-slate-600">
                {principal ? (
                  <div className="flex flex-col">
                    <span>{organizationRoleLabel(principal.orgRole)}</span>
                    {principal.status !== 'active' && (
                      <span className="text-[11px] font-bold text-amber-700">
                        Pertenencia {statusLabel(principal.status).toLowerCase()}
                      </span>
                    )}
                  </div>
                ) : (
                  '—'
                )}
              </MiraTd>

              <MiraTd className="text-xs text-slate-500">
                {principal
                  ? capabilitiesLabel({ can_buy: principal.canBuy, can_sell: principal.canSell })
                  : '—'}
              </MiraTd>

              <MiraTd>
                <MiraStatusBadge status={u.platformRole ?? 'user'} kind="role" />
                <span className="sr-only">{platformRoleLabel(u.platformRole)}</span>
              </MiraTd>

              <MiraTd className="text-xs text-slate-500">{statusLabel(u.status)}</MiraTd>

              <MiraTd className="whitespace-nowrap text-xs text-slate-500">
                {formatChartDateLong(u.createdAt.slice(0, 10))}
              </MiraTd>

              <MiraTd align="right">
                <Link
                  href={`/admin/usuarios/${u.id}`}
                  className={miraBtn.icon}
                  title={`Ver detalle de ${fullName(u)}`}
                  aria-label={`Ver detalle de ${fullName(u)}`}
                >
                  <Eye size={15} />
                </Link>
              </MiraTd>
            </MiraTr>
          )
        })}
      </MiraTable>

      <p className="text-xs text-slate-400">
        {users.length} {users.length === 1 ? 'usuario' : 'usuarios'}
        {hasFilters ? ` de ${total} en total` : ''}
      </p>
    </div>
  )
}
