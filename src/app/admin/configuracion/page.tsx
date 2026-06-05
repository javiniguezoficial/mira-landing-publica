import { Settings, User, SlidersHorizontal } from 'lucide-react'
import { getAdminConfig } from '@/lib/actions/admin-settings'
import { AdminProfileForm } from '@/components/admin/settings/AdminProfileForm'
import { PlatformSettingsForm } from '@/components/admin/settings/PlatformSettingsForm'

export const dynamic = 'force-dynamic'

export default async function AdminConfiguracionPage() {
  // getAdminConfig ya redirige a /login si no es platform_admin
  const config = await getAdminConfig()

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Cabecera */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-lg bg-mira-primary/10 flex items-center justify-center">
          <Settings size={20} className="text-mira-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">Configuración</h1>
          <p className="text-sm text-slate-500">Gestiona tu perfil y los ajustes generales de la plataforma.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* ── Perfil del administrador ─────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100">
            <User size={16} className="text-slate-500" />
            <h2 className="text-base font-heading font-semibold text-slate-800">Perfil del administrador</h2>
          </div>
          <div className="p-6">
            <AdminProfileForm
              defaultValues={{
                email:      config.profile.email,
                first_name: config.profile.first_name,
                last_name:  config.profile.last_name,
                phone:      config.profile.phone,
                avatar_url: config.profile.avatar_url,
              }}
            />
          </div>
        </section>

        {/* ── Ajustes generales de la plataforma ──────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100">
            <SlidersHorizontal size={16} className="text-slate-500" />
            <h2 className="text-base font-heading font-semibold text-slate-800">Ajustes generales de la plataforma</h2>
          </div>
          <div className="p-6">
            <PlatformSettingsForm
              defaultValues={{
                platform_name:    config.settings.platform_name,
                support_email:    config.settings.support_email,
                default_country:  config.settings.default_country,
                default_currency: config.settings.default_currency,
                maintenance_mode: config.settings.maintenance_mode,
              }}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
