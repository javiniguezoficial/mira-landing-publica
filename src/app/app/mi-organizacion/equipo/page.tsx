import Link from 'next/link'
import { ChevronLeft, Users, ShieldAlert, Info } from 'lucide-react'
import { getMyTeam } from '@/lib/queries/team'
import { TEAM_MESSAGES } from '@/lib/auth/team'
import { ORGANIZATION_ACCESS_MESSAGES } from '@/lib/auth/access'
import { commercialProfileLabel } from '@/lib/identity'
import { TeamMembersTable } from '@/components/app/team/TeamMembersTable'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { EmptyState } from '@/components/shared/EmptyState'

export const dynamic = 'force-dynamic'

/**
 * Gestión de equipo del portal de cliente (Bloque 1).
 *
 * ── Por qué una ruta propia y no una sección de `/app/mi-organizacion` ─────
 *
 * Porque la diferencia entre `admin` y `member` que pedía el cliente tiene que
 * ser una PUERTA, no un bloque escondido. Con una ruta propia, un `member` que
 * escriba la URL a mano recibe la denegación del servidor; con una sección
 * condicional dentro de otra página, lo único que habría entre él y los
 * controles sería un `if` de React.
 *
 * La ficha de la organización sigue siendo de lectura para todo el mundo.
 */
export default async function EquipoPage() {
  const result = await getMyTeam()

  if (result.status === 'no_org') {
    return (
      <Marco>
        <EmptyState
          icon={Users}
          title="Sin organización asignada"
          description={ORGANIZATION_ACCESS_MESSAGES.no_membership}
        />
      </Marco>
    )
  }

  if (result.status === 'inactive') {
    return (
      <Marco>
        <EmptyState icon={Users} title="Acceso no disponible" description={result.access.message} />
      </Marco>
    )
  }

  // `member`: pertenece y su acceso está activo, pero no gestiona a nadie. Se
  // dice explícitamente en lugar de enseñar una tabla vacía, que se leería como
  // «no tienes compañeros».
  if (result.status === 'forbidden') {
    return (
      <Marco>
        <EmptyState
          icon={ShieldAlert}
          title="No tienes permiso para gestionar el equipo"
          description={`${TEAM_MESSAGES.soloOwnerAdmin} Puedes consultar los miembros de tu organización en su ficha.`}
          action={{ label: 'Ver mi organización', href: '/app/mi-organizacion' }}
        />
      </Marco>
    )
  }

  const { members, commercialProfile, actorUserId, actorRole, organizationName } = result

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6 xl:p-8">
      <div>
        <Link
          href="/app/mi-organizacion"
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition-colors hover:text-mira-magenta"
        >
          <ChevronLeft size={14} />
          Volver a mi organización
        </Link>
        <MiraPageHeader
          icon={Users}
          title="Equipo"
          subtitle={`${organizationName} · Perfil comercial: ${commercialProfileLabel(commercialProfile)}`}
        />
      </div>

      {/* Los dos ejes, explicados antes de la tabla. El cliente percibía
          «administrador» y «miembro» como lo mismo justamente porque nada
          contaba qué decide cada columna. */}
      <section className="flex items-start gap-3 rounded-2xl border border-mira-line bg-mira-canvas/60 px-5 py-4">
        <Info size={16} className="mt-0.5 shrink-0 text-mira-magenta" aria-hidden="true" />
        <div className="space-y-1.5 text-xs leading-relaxed text-slate-600">
          <p>
            <span className="font-bold text-mira-ink">Rol</span> — quién administra la organización.
            El <strong>propietario</strong> manda y no se puede modificar desde aquí; un{' '}
            <strong>administrador</strong> gestiona a los miembros; un <strong>miembro</strong> no
            administra a nadie. Solo el propietario concede el rol de administrador.
          </p>
          <p>
            <span className="font-bold text-mira-ink">Capacidades</span> — qué puede hacer
            comercialmente cada persona. Son independientes del rol: un miembro puede comprar y un
            administrador puede no poder. El límite lo pone el perfil comercial de la organización
            («{commercialProfileLabel(commercialProfile)}»), que solo cambia MIRA.
          </p>
        </div>
      </section>

      <section className="mira-card overflow-hidden rounded-2xl">
        <div className="flex items-center gap-2 border-b border-mira-line px-5 py-3.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-mira-magenta-soft">
            <Users size={14} className="text-mira-magenta" />
          </div>
          <h2 className="text-sm font-black text-mira-ink">
            Miembros <span className="font-normal text-slate-400">({members.length})</span>
          </h2>
        </div>

        <TeamMembersTable
          members={members}
          commercialProfile={commercialProfile}
          actorUserId={actorUserId}
          actorRole={actorRole}
        />
      </section>

      {/* Alta de miembros: hoy no existe en el portal. Se dice, en lugar de
          ofrecer un botón que no puede funcionar. Ver la cabecera de
          `lib/actions/team.ts` para el motivo. */}
      <p className="rounded-xl border border-mira-line bg-white px-5 py-4 text-xs leading-relaxed text-slate-500">
        Para <strong>incorporar</strong> a una persona nueva a tu organización, escríbenos desde{' '}
        <Link href="/app/ayuda" className="font-bold text-mira-magenta hover:underline">
          Ayuda y soporte
        </Link>
        . El alta la realiza el equipo de MIRA; desde aquí puedes gestionar a quienes ya pertenecen.
      </p>
    </div>
  )
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader icon={Users} title="Equipo" subtitle="Gestión de miembros" />
      <div className="mira-card rounded-2xl">{children}</div>
    </div>
  )
}
