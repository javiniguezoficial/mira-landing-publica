import { getProfiles } from '@/lib/actions/users'
import { UsersTable } from '@/components/admin/users/UsersTable'

export const dynamic = 'force-dynamic'

export default async function UsuariosPage() {
  const users = await getProfiles()

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-slate-900">Usuarios</h1>
        <p className="text-slate-500 font-body text-sm mt-1">
          Usuarios registrados en la plataforma
        </p>
      </div>
      <UsersTable users={users} />
    </div>
  )
}
