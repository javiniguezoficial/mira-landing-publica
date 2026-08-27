import Link from 'next/link'
import { ArrowLeft, UserPlus } from 'lucide-react'
import { requirePlatformAdmin } from '@/lib/auth/guards'
import { listAssignableOrganizations } from '@/lib/actions/users'
import { NewUserForm } from '@/components/admin/users/NewUserForm'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

export const dynamic = 'force-dynamic'

/**
 * Alta administrativa de un usuario.
 *
 * ── Por qué una página y no un modal ──────────────────────────────────────
 *
 * Porque el formulario tiene tres bloques —persona, acceso y organización— más
 * un resumen previo, y las capacidades dependen de la organización elegida. Un
 * modal con eso dentro obliga a desplazar, tapa el listado que da contexto y
 * hace que un descuido lo cierre entero.
 *
 * ── Autorización ─────────────────────────────────────────────────────────
 *
 * `requirePlatformAdmin` ANTES de renderizar nada. Es defensa en profundidad
 * junto al middleware y al layout de /admin: un administrador de organización
 * que escriba la URL a mano acaba en su panel de cliente, no aquí. La puerta
 * que de verdad cuenta está en la Server Action, que vuelve a comprobarlo.
 *
 * En esta fase SOLO `platform_admin` crea cuentas. El administrador de una
 * organización sigue gestionando a los miembros que ya existen, y podrá invitar
 * cuando estén definidos los límites por plan.
 */
export default async function NuevoUsuarioPage() {
  await requirePlatformAdmin('redirect-dashboard')

  const organizations = await listAssignableOrganizations()

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6 xl:p-8">
      <Link
        href="/admin/usuarios"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-mira-magenta"
      >
        <ArrowLeft size={14} /> Volver a usuarios
      </Link>

      <MiraPageHeader
        icon={UserPlus}
        title="Nuevo usuario"
        subtitle="Crea la cuenta y envía la invitación para que active su acceso."
      />

      <NewUserForm
        organizations={organizations.map((o) => ({
          id: o.id,
          name: o.name,
          status: o.status,
          commercialProfile: o.commercialProfile,
        }))}
      />
    </div>
  )
}
