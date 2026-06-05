import { Settings, User, SlidersHorizontal, Lock } from 'lucide-react'
import { getClientConfig } from '@/lib/actions/client-settings'
import { ClientProfileForm } from '@/components/app/settings/ClientProfileForm'
import { ClientPreferencesForm } from '@/components/app/settings/ClientPreferencesForm'
import { PasswordSection } from '@/components/app/settings/PasswordSection'

export const dynamic = 'force-dynamic'

export default async function ClientConfiguracionPage() {
  // getClientConfig redirige a /login si no hay sesión
  const config = await getClientConfig()

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Cabecera */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-lg bg-mira-primary/10 flex items-center justify-center">
          <Settings size={20} className="text-mira-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">Configuración</h1>
          <p className="text-sm text-slate-500">Gestiona tu perfil personal y las preferencias de tu cuenta.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* ── Perfil personal ──────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100">
            <User size={16} className="text-slate-500" />
            <h2 className="text-base font-heading font-semibold text-slate-800">Perfil personal</h2>
          </div>
          <div className="p-6">
            <ClientProfileForm
              defaultValues={{
                email:      config.profile.email,
                first_name: config.profile.first_name,
                last_name:  config.profile.last_name,
                phone:      config.profile.phone,
              }}
            />
          </div>
        </section>

        {/* ── Preferencias ─────────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100">
            <SlidersHorizontal size={16} className="text-slate-500" />
            <h2 className="text-base font-heading font-semibold text-slate-800">Preferencias</h2>
          </div>
          <div className="p-6">
            <ClientPreferencesForm
              defaultValues={{
                preferred_locale:   config.profile.preferred_locale,
                preferred_currency: config.profile.preferred_currency,
                preferred_country:  config.profile.preferred_country,
              }}
            />
          </div>
        </section>

        {/* ── Seguridad ────────────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100">
            <Lock size={16} className="text-slate-500" />
            <h2 className="text-base font-heading font-semibold text-slate-800">Seguridad</h2>
          </div>
          <div className="p-6">
            <PasswordSection email={config.profile.email} />
          </div>
        </section>
      </div>
    </div>
  )
}
