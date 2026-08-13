'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createOrganization, updateOrganization } from '@/lib/actions/organizations'
import type { Organization, OrgFormData, SubscriptionStatus, OrgType } from '@/lib/actions/organizations'
import { MiraFormCard } from '@/components/mira/MiraFormCard'
import { miraBtn, miraField, miraLabel } from '@/lib/miraButtons'
import { normalizeCommercialProfile, type CommercialProfile } from '@/lib/identity'
import { Building2, MapPin, CreditCard, Handshake } from 'lucide-react'

interface Plan { id: string; name: string; slug: string }

interface Props {
  org?: Organization
  plans: Plan[]
  mode: 'create' | 'edit'
}

const SECTORS = [
  'Agricultura y alimentación', 'Automoción', 'Construcción', 'Consultoría',
  'Distribución y logística', 'Educación', 'Energía', 'Farmacia y salud',
  'Hostelería y turismo', 'Industria manufacturera', 'Inmobiliaria',
  'Retail y comercio', 'Servicios financieros', 'Tecnología', 'Otro',
]

const REVENUE_RANGES = [
  'Menos de 100K €', '100K – 500K €', '500K – 1M €',
  '1M – 5M €', '5M – 20M €', 'Más de 20M €',
]

const EMPLOYEE_RANGES = [
  '1 – 10', '11 – 50', '51 – 200', '201 – 500', 'Más de 500',
]

const STATUS_OPTIONS: { value: SubscriptionStatus; label: string }[] = [
  { value: 'trial',     label: 'Trial' },
  { value: 'active',    label: 'Activo' },
  { value: 'past_due',  label: 'Vencido' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'expired',   label: 'Expirado' },
]

/**
 * Perfil comercial: el TECHO de las capacidades de cada miembro.
 *
 * Los valores almacenados siguen siendo los de la columna (`buyer` · `seller` ·
 * `buyer_seller`). No se inventa una segunda representación del mismo concepto:
 * lo que cambia aquí es solo la etiqueta que lee una persona.
 */
const COMMERCIAL_PROFILE_OPTIONS: { value: CommercialProfile; label: string; hint: string }[] = [
  { value: 'buyer',        label: 'Comprador',            hint: 'Sus miembros podrán comprar. Nadie podrá vender.' },
  { value: 'seller',       label: 'Vendedor',             hint: 'Sus miembros podrán vender. Nadie podrá comprar.' },
  { value: 'buyer_seller', label: 'Comprador y vendedor', hint: 'Cada miembro puede tener una capacidad, la otra o ambas.' },
]

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className={miraLabel}>
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = miraField

export function ClientForm({ org, plans, mode }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<OrgFormData>({
    name:                 org?.name ?? '',
    type:                 org?.type ?? undefined,
    cif_nif:              org?.cif_nif ?? '',
    sector:               org?.sector ?? '',
    annual_revenue_range: org?.annual_revenue_range ?? '',
    employee_count_range: org?.employee_count_range ?? '',
    city:                 org?.city ?? '',
    country:              org?.country ?? 'ES',
    phone:                org?.phone ?? '',
    email:                org?.email ?? '',
    website:              org?.website ?? '',
    plan_id:              org?.plan_id ?? '',
    subscription_status:  org?.subscription_status ?? 'trial',
    // Una organización existente conserva su perfil; una nueva nace `buyer`,
    // el más restrictivo de los tres.
    commercial_profile:   normalizeCommercialProfile(org?.commercial_profile) ?? 'buyer',
  })

  function set(key: keyof OrgFormData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const perfilActual = normalizeCommercialProfile(form.commercial_profile) ?? 'buyer'
  const perfilOriginal = normalizeCommercialProfile(org?.commercial_profile)
  // Al reducir el perfil, la acción retira las capacidades que dejan de caber.
  // Se avisa ANTES de guardar: es un efecto sobre personas, no sobre la ficha.
  const reduceCapacidades =
    mode === 'edit' &&
    perfilOriginal === 'buyer_seller' &&
    perfilActual !== 'buyer_seller'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) { setError('El nombre de la organización es obligatorio.'); return }

    startTransition(async () => {
      try {
        if (mode === 'create') {
          const { id } = await createOrganization(form)
          router.push(`/admin/clientes/${id}`)
        } else {
          await updateOrganization(org!.id, form)
          router.push(`/admin/clientes/${org!.id}`)
        }
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error inesperado. Inténtalo de nuevo.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Datos básicos */}
      <MiraFormCard title="Datos de la empresa" icon={Building2}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2">
            <Field label="Nombre de la organización" required>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className={inputCls}
                placeholder="Ej. Acme Distribución S.L."
              />
            </Field>
          </div>

          <Field label="Tipo">
            <select value={form.type ?? ''} onChange={(e) => set('type', e.target.value)} className={inputCls}>
              <option value="">— Seleccionar —</option>
              <option value="fisica">Persona física</option>
              <option value="juridica">Persona jurídica</option>
            </select>
          </Field>

          <Field label="CIF / NIF">
            <input
              type="text"
              value={form.cif_nif}
              onChange={(e) => set('cif_nif', e.target.value)}
              className={inputCls}
              placeholder="Ej. B12345678"
            />
          </Field>

          <Field label="Sector">
            <select value={form.sector ?? ''} onChange={(e) => set('sector', e.target.value)} className={inputCls}>
              <option value="">— Seleccionar —</option>
              {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>

          <Field label="Facturación anual">
            <select value={form.annual_revenue_range ?? ''} onChange={(e) => set('annual_revenue_range', e.target.value)} className={inputCls}>
              <option value="">— Seleccionar —</option>
              {REVENUE_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>

          <Field label="Número de empleados">
            <select value={form.employee_count_range ?? ''} onChange={(e) => set('employee_count_range', e.target.value)} className={inputCls}>
              <option value="">— Seleccionar —</option>
              {EMPLOYEE_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
        </div>
      </MiraFormCard>

      {/* Contacto */}
      <MiraFormCard title="Contacto y ubicación" icon={MapPin}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Email">
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} placeholder="empresa@ejemplo.com" />
          </Field>
          <Field label="Teléfono">
            <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} placeholder="+34 600 000 000" />
          </Field>
          <Field label="Sitio web">
            <input type="url" value={form.website} onChange={(e) => set('website', e.target.value)} className={inputCls} placeholder="https://ejemplo.com" />
          </Field>
          <Field label="Ciudad">
            <input type="text" value={form.city} onChange={(e) => set('city', e.target.value)} className={inputCls} placeholder="Madrid" />
          </Field>
          <Field label="País">
            <input type="text" value={form.country} onChange={(e) => set('country', e.target.value)} className={inputCls} placeholder="ES" maxLength={2} />
          </Field>
        </div>
      </MiraFormCard>

      {/* Perfil comercial — techo de las capacidades de los miembros */}
      <MiraFormCard title="Perfil comercial" icon={Handshake}>
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Decide qué puede hacer esta organización en MIRA. Es el <strong>límite</strong> de las
            capacidades de sus miembros: dentro de él, cada persona se configura por separado en
            «Miembros».
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {COMMERCIAL_PROFILE_OPTIONS.map((opt) => {
              const activo = perfilActual === opt.value
              return (
                <label
                  key={opt.value}
                  className={`cursor-pointer rounded-xl border p-4 transition-all ${
                    activo
                      ? 'border-mira-magenta bg-mira-magenta-soft/40 ring-1 ring-mira-magenta/30'
                      : 'border-mira-line hover:border-mira-magenta/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="commercial_profile"
                      value={opt.value}
                      checked={activo}
                      onChange={(e) => set('commercial_profile', e.target.value)}
                      className="h-4 w-4 border-mira-line text-mira-magenta focus:ring-mira-magenta/30"
                    />
                    <span className={`text-sm font-bold ${activo ? 'text-mira-magenta' : 'text-slate-700'}`}>
                      {opt.label}
                    </span>
                  </div>
                  <p className="mt-1.5 pl-6 text-xs leading-relaxed text-slate-500">{opt.hint}</p>
                </label>
              )
            })}
          </div>

          {reduceCapacidades && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Al reducir el perfil comercial se retirarán automáticamente las capacidades que dejen
              de estar permitidas. Volver a ampliarlo <strong>no</strong> las devuelve: habrá que
              concederlas de nuevo miembro a miembro.
            </p>
          )}
        </div>
      </MiraFormCard>

      {/* Plan y suscripción */}
      <MiraFormCard title="Plan y suscripción" icon={CreditCard}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Plan">
            <select value={form.plan_id ?? ''} onChange={(e) => set('plan_id', e.target.value)} className={inputCls}>
              <option value="">Starter (por defecto)</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Estado de suscripción">
            <select value={form.subscription_status} onChange={(e) => set('subscription_status', e.target.value)} className={inputCls}>
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
        </div>
      </MiraFormCard>

      {/* Acciones */}
      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={() => router.back()} className={miraBtn.ghost}>
          Cancelar
        </button>
        <button type="submit" disabled={isPending} className={miraBtn.primary}>
          {isPending
            ? (mode === 'create' ? 'Creando…' : 'Guardando…')
            : (mode === 'create' ? 'Crear organización' : 'Guardar cambios')}
        </button>
      </div>
    </form>
  )
}
