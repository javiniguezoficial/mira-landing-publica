import { Settings, User, SlidersHorizontal } from 'lucide-react'
import { getAdminConfig } from '@/lib/actions/admin-settings'
import { AdminProfileForm } from '@/components/admin/settings/AdminProfileForm'
import { PlatformSettingsForm } from '@/components/admin/settings/PlatformSettingsForm'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { MiraFormCard } from '@/components/mira/MiraFormCard'

export const dynamic = 'force-dynamic'

export default async function AdminConfiguracionPage() {
  // getAdminConfig ya redirige a /login si no es platform_admin
  const config = await getAdminConfig()

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader
        icon={Settings}
        title="Configuración"
        subtitle="Gestiona tu perfil y los ajustes generales de la plataforma."
      />

      <div className="grid grid-cols-1 gap-6">
        {/* ── Perfil del administrador ─────────────────────────────────────── */}
        <MiraFormCard title="Perfil del administrador" icon={User}>
          <AdminProfileForm
            defaultValues={{
              email:      config.profile.email,
              first_name: config.profile.first_name,
              last_name:  config.profile.last_name,
              phone:      config.profile.phone,
              avatar_url: config.profile.avatar_url,
            }}
          />
        </MiraFormCard>

        {/* ── Ajustes generales de la plataforma ──────────────────────────── */}
        <MiraFormCard title="Ajustes generales de la plataforma" icon={SlidersHorizontal}>
          <PlatformSettingsForm
            defaultValues={{
              platform_name:    config.settings.platform_name,
              support_email:    config.settings.support_email,
              default_country:  config.settings.default_country,
              default_currency: config.settings.default_currency,
              maintenance_mode: config.settings.maintenance_mode,
            }}
          />
        </MiraFormCard>
      </div>
    </div>
  )
}
