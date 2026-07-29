'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  activateOrganization,
  setOrganizationPlan,
  setOrganizationStatus,
} from '@/lib/actions/organizations'
import { miraBtn } from '@/lib/miraButtons'

interface PlanOption {
  slug: string
  name: string
}

interface Props {
  organizationId: string
  status: string
  planSlug: string | null
  /** Plan que el cliente pidió al registrarse. Informativo: no concede nada. */
  requestedPlanName: string | null
  planes: PlanOption[]
  owner: { firstName: string | null; lastName: string | null; status: string } | null
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente de activación',
  active: 'Activo',
  suspended: 'Suspendido',
  rejected: 'Rechazado',
}

/**
 * Gestión básica del ciclo de vida de un cliente: plan y estado.
 *
 * Los botones se ocultan según el estado, pero la protección real está en las
 * Server Actions, que exigen `platform_admin` activo y validan el destino. Aquí
 * solo se evita ofrecer una acción que no tiene sentido.
 */
export function ClientLifecycleCard({
  organizationId,
  status,
  planSlug,
  requestedPlanName,
  planes,
  owner,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState(planSlug ?? '')

  function ejecutar(accion: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const resultado = await accion()
      if (resultado?.error) setError(resultado.error)
      else router.refresh()
    })
  }

  return (
    <section className="mira-card rounded-2xl p-5 sm:p-6">
      <h2 className="mb-5 text-xs font-bold uppercase tracking-wider text-slate-400">
        Estado y plan
      </h2>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Estado</span>
          <span className="text-sm font-bold text-mira-ink">{STATUS_LABEL[status] ?? status}</span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Propietario
          </span>
          <span className="text-sm text-slate-800">
            {owner
              ? `${[owner.firstName, owner.lastName].filter(Boolean).join(' ') || 'Sin nombre'}`
              : 'Sin propietario asignado'}
          </span>
        </div>
      </div>

      {/* El plan solicitado es lo que el cliente pidió en la landing: viaja en
          la metadata del registro, así que es una petición, no una concesión. */}
      {status !== 'active' && requestedPlanName && (
        <p className="mt-5 rounded-xl border border-mira-line bg-mira-canvas px-4 py-3 text-sm text-slate-600">
          Plan solicitado por el cliente: <strong>{requestedPlanName}</strong>. Confirma el plan que
          le asignas antes de activarlo.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="min-w-[180px]">
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
            {status === 'active' ? 'Plan' : 'Plan asignado'}
          </label>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="w-full rounded-xl border border-mira-line bg-white px-3 py-2 text-sm text-mira-ink"
          >
            <option value="">Sin plan</option>
            {planes.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          disabled={pending || !plan || plan === planSlug}
          onClick={() => ejecutar(() => setOrganizationPlan(organizationId, plan))}
          className={`${miraBtn.ghost} disabled:opacity-40`}
        >
          Guardar plan
        </button>

        {/* Activar concede el plan seleccionado y registra quién lo aprobó, en
            la misma operación. Sin plan elegido no se puede pulsar, y SQL lo
            rechazaría igualmente. */}
        {status !== 'active' && (
          <button
            type="button"
            disabled={pending || !plan}
            title={!plan ? 'Selecciona antes el plan que le asignas' : undefined}
            onClick={() => ejecutar(() => activateOrganization(organizationId, plan))}
            className={`${miraBtn.primary} disabled:opacity-40`}
          >
            {status === 'suspended' ? 'Reactivar con este plan' : 'Activar con este plan'}
          </button>
        )}

        {status === 'active' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => ejecutar(() => setOrganizationStatus(organizationId, 'suspended'))}
            className={`${miraBtn.ghost} disabled:opacity-40`}
          >
            Suspender
          </button>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  )
}
