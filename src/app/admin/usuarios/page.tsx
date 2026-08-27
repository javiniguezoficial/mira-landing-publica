import Link from 'next/link'
import { UserPlus, Users } from 'lucide-react'
import { listAdminUsers, listAssignableOrganizations } from '@/lib/actions/users'
import { UsersTable } from '@/components/admin/users/UsersTable'
import { UsersFilterBar } from '@/components/admin/users/UsersFilterBar'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { miraBtn } from '@/lib/miraButtons'
import { hasActiveUserFilters, parseUserListParams } from '@/lib/users/list-params'

export const dynamic = 'force-dynamic'

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const sp = await searchParams

  // 039 — los filtros llegan por URL y se normalizan contra listas cerradas
  // antes de tocar nada. Un valor corrupto cae a «sin filtro», nunca se pasa a
  // la consulta tal cual.
  const filters = parseUserListParams(sp)

  const [{ users, total, filtered }, organizations] = await Promise.all([
    listAdminUsers(filters),
    listAssignableOrganizations(),
  ])

  const hayFiltros = hasActiveUserFilters(filters)

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      {/* El alta administrativa vive en su propia página: el formulario tiene
          tres bloques y un resumen, y las capacidades dependen de la
          organización elegida. Ver `/admin/usuarios/nuevo`. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <MiraPageHeader
          icon={Users}
          title="Usuarios"
          subtitle={
            hayFiltros
              ? `${filtered} de ${total} usuario${total !== 1 ? 's' : ''} · filtrando`
              : `${total} usuario${total !== 1 ? 's' : ''} registrado${total !== 1 ? 's' : ''}`
          }
        />
        <Link href="/admin/usuarios/nuevo" className={miraBtn.primary}>
          <UserPlus size={14} /> Nuevo usuario
        </Link>
      </div>

      <UsersFilterBar filters={filters} organizations={organizations} />

      <UsersTable users={users} total={total} hasFilters={hayFiltros} />
    </div>
  )
}
