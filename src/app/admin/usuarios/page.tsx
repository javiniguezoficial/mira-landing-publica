import { Users } from 'lucide-react'
import { getProfiles } from '@/lib/actions/users'
import { UsersTable } from '@/components/admin/users/UsersTable'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

export const dynamic = 'force-dynamic'

export default async function UsuariosPage() {
  const users = await getProfiles()

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader
        icon={Users}
        title="Usuarios"
        subtitle="Usuarios registrados en la plataforma"
      />
      <UsersTable users={users} />
    </div>
  )
}
