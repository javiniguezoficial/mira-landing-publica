import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Building2, ChevronLeft, History, ShieldAlert, UserCog, UserPlus } from 'lucide-react'
import { requirePlatformAdmin } from '@/lib/auth/guards'
import {
  checkUserDeletable,
  countActivePlatformAdmins,
  getAdminUserDetail,
  getUserAuditTrail,
  listAssignableOrganizations,
} from '@/lib/actions/users'
import { DangerZoneCard } from '@/components/admin/users/DangerZoneCard'
import { organizationRoleLabel } from '@/lib/identity'
import { MiraSectionCard } from '@/components/mira/MiraSectionCard'
import { MiraStatusBadge } from '@/components/mira/MiraStatusBadge'
import { UserMembershipsPanel } from '@/components/admin/users/UserMembershipsPanel'
import { AssignOrganizationCard } from '@/components/admin/users/AssignOrganizationCard'
import { UserProfileForm } from '@/components/admin/users/UserProfileForm'
import { PlatformAccessCard } from '@/components/admin/users/PlatformAccessCard'
import { ADMIN_AUDIT_ACTION_LABELS, isAdminAuditAction } from '@/lib/audit/actions'
import { assignmentSectionHelp, assignmentSectionTitle } from '@/lib/users/assignment-copy'
import { formatChartDateLong } from '@/lib/markets/chart-dates'
import { statusLabel } from '@/lib/identity'

export const dynamic = 'force-dynamic'

export default async function UsuarioDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  // El layout de /admin ya exige `platform_admin`; se repite aquí porque esta
  // página necesita saber QUIÉN es el administrador para poder distinguir su
  // propia cuenta, y porque la defensa en profundidad no depende del layout.
  const { userId: actorId } = await requirePlatformAdmin()

  const { id } = await params

  // El alta administrativa redirige aquí. Si algún paso posterior a la
  // invitación no salió —el teléfono, el rol o la pertenencia—, llega en
  // `?aviso=` y se enseña arriba del todo. Es lo que hace VISIBLE un estado
  // parcial en lugar de dejarlo enterrado en un log. Ver `createAndInviteUser`.
  const aviso = (await searchParams).aviso?.trim() || null

  // El veredicto de eliminación se calcula en SERVIDOR y baja como prop: la
  // pantalla explica por qué no se puede antes de que nadie pulse nada. La
  // decisión de verdad la vuelve a tomar la acción con los hechos releídos.
  const [user, organizations, activeAdminCount, auditoria, borrado] = await Promise.all([
    getAdminUserDetail(id),
    listAssignableOrganizations(),
    countActivePlatformAdmins(),
    getUserAuditTrail(id),
    checkUserDeletable(id),
  ])

  if (!user) notFound()

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || '—'
  const initials = (user.firstName ?? user.email)?.[0]?.toUpperCase() ?? '?'
  const isSelf = actorId === user.id

  return (
    <div className="w-full max-w-4xl space-y-6 p-4 md:p-6 xl:p-8">
      {aviso && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {aviso}
        </p>
      )}

      {/* ── Cabecera ── */}
      <div>
        <Link
          href="/admin/usuarios"
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition-colors hover:text-mira-magenta"
        >
          <ChevronLeft size={14} />
          Volver a usuarios
        </Link>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-mira-magenta to-mira-magenta-deep text-xl font-bold text-white shadow-lg shadow-mira-magenta/30">
            {initials}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black tracking-tight text-mira-ink md:text-2xl">{fullName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <span className="text-sm text-slate-500">{user.email || '—'}</span>
              <MiraStatusBadge status={user.platformRole ?? 'user'} kind="role" />
              <span className="text-xs text-slate-400">{statusLabel(user.status)}</span>
              {isSelf && (
                <span className="rounded-md bg-mira-magenta-soft px-2 py-0.5 text-[11px] font-bold text-mira-magenta">
                  Tu cuenta
                </span>
              )}
            </div>
          </div>
        </div>

        <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
          <div className="rounded-xl border border-mira-line px-3 py-2">
            <dt className="font-bold uppercase tracking-wider text-slate-400">Alta</dt>
            <dd className="mt-0.5 text-slate-700">
              {formatChartDateLong(user.createdAt.slice(0, 10))}
            </dd>
          </div>
          <div className="rounded-xl border border-mira-line px-3 py-2">
            <dt className="font-bold uppercase tracking-wider text-slate-400">
              Última actualización
            </dt>
            <dd className="mt-0.5 text-slate-700">
              {formatChartDateLong(user.updatedAt.slice(0, 10))}
            </dd>
          </div>
          <div className="rounded-xl border border-mira-line px-3 py-2">
            <dt className="font-bold uppercase tracking-wider text-slate-400">Organizaciones</dt>
            <dd className="mt-0.5 text-slate-700">
              {user.memberships.length === 0 ? 'Ninguna' : user.memberships.length}
            </dd>
          </div>
        </dl>
      </div>

      {/* ── Pertenencias ── */}
      <MiraSectionCard icon={Building2} title="Organizaciones y permisos">
        <div className="p-4">
          <UserMembershipsPanel memberships={user.memberships} isSelf={isSelf} />
        </div>
      </MiraSectionCard>

      {/* ── Asignación ──
          El título y el texto dependen de si ya pertenece a alguna
          organización: este bloque SIEMPRE crea una pertenencia nueva, y con un
          usuario que ya está en una empresa «Asignar a una organización»
          invitaba a usarlo para moverlo de sitio. Ver `lib/users/assignment-copy.ts`. */}
      <MiraSectionCard icon={UserPlus} title={assignmentSectionTitle(user.memberships.length)}>
        <div className="space-y-4 p-4">
          <p className="text-xs text-slate-500">
            {assignmentSectionHelp(user.memberships.length)}
          </p>
          <AssignOrganizationCard
            userId={user.id}
            userName={fullName}
            currentOrganizationIds={user.memberships.map((m) => m.organizationId)}
            organizations={organizations}
            isSelf={isSelf}
          />
        </div>
      </MiraSectionCard>

      {/* ── Perfil ── */}
      <MiraSectionCard icon={UserCog} title="Datos del perfil">
        <div className="p-4">
          <UserProfileForm user={user} />
        </div>
      </MiraSectionCard>

      {/* ── Acceso de plataforma ── */}
      <MiraSectionCard icon={ShieldAlert} title="Acceso de plataforma">
        <div className="space-y-4 p-4">
          <p className="text-xs text-slate-500">
            Rol global y estado de la cuenta. No es el rol dentro de una empresa.
          </p>
          <PlatformAccessCard
            user={user}
            isSelf={isSelf}
            activeAdminCount={activeAdminCount}
          />
        </div>
      </MiraSectionCard>

      {/* ── Auditoría ── */}
      <MiraSectionCard icon={History} title="Historial de administración">
        <div className="space-y-4 p-4">
          <p className="text-xs text-slate-500">
            Últimas operaciones registradas sobre este usuario.
          </p>
          {auditoria.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">
              Todavía no hay operaciones registradas.
            </p>
          ) : (
            <ul className="space-y-2">
              {auditoria.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl border border-mira-line px-3 py-2 text-xs"
                >
                  <span className="font-bold text-mira-ink">
                    {isAdminAuditAction(e.action) ? ADMIN_AUDIT_ACTION_LABELS[e.action] : e.action}
                  </span>
                  <span className="text-slate-500">por {e.actorName}</span>
                  <span className="ml-auto text-slate-400">
                    {formatChartDateLong(e.createdAt.slice(0, 10))}
                  </span>
                  {e.isQa && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                      QA
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </MiraSectionCard>

      {/* ── Zona de peligro ────────────────────────────────────────────
          Al final y en su propia tarjeta: eliminar no es una acción más de
          la ficha, y es la única que no se puede deshacer. */}
      <DangerZoneCard
        userId={user.id}
        email={user.email}
        fullName={fullName}
        organizationName={user.memberships[0]?.organizationName ?? null}
        organizationRole={
          user.memberships[0]?.orgRole ? organizationRoleLabel(user.memberships[0].orgRole) : null
        }
        blocks={borrado.blocks}
        warnings={borrado.warnings}
        isSelf={isSelf}
      />
    </div>
  )
}
