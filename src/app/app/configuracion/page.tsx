import { Settings, User, SlidersHorizontal, Lock } from 'lucide-react'
import { getClientConfig } from '@/lib/actions/client-settings'
import { ClientProfileForm } from '@/components/app/settings/ClientProfileForm'
import { ClientPreferencesForm } from '@/components/app/settings/ClientPreferencesForm'
import { PasswordSection } from '@/components/app/settings/PasswordSection'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { MiraFormCard } from '@/components/mira/MiraFormCard'

export const dynamic = 'force-dynamic'

export default async function ClientConfiguracionPage() {
  const config = await getClientConfig()

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader icon={Settings} title="Configuración" subtitle="Gestiona tu perfil personal y las preferencias de tu cuenta." />

      <MiraFormCard title="Perfil personal" icon={User}>
        <ClientProfileForm
          defaultValues={{
            email:      config.profile.email,
            first_name: config.profile.first_name,
            last_name:  config.profile.last_name,
            phone:      config.profile.phone,
          }}
        />
      </MiraFormCard>

      <MiraFormCard title="Preferencias" icon={SlidersHorizontal}>
        <ClientPreferencesForm
          defaultValues={{
            preferred_locale:   config.profile.preferred_locale,
            preferred_currency: config.profile.preferred_currency,
            preferred_country:  config.profile.preferred_country,
          }}
        />
      </MiraFormCard>

      <MiraFormCard title="Seguridad" icon={Lock}>
        <PasswordSection email={config.profile.email} />
      </MiraFormCard>
    </div>
  )
}
