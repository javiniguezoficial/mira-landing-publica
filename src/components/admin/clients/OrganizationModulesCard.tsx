'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Blocks } from 'lucide-react'
import { setOrganizationModules } from '@/lib/actions/organizations'
import {
  ORGANIZATION_MODULE_DESCRIPTIONS,
  ORGANIZATION_MODULE_LABELS,
  ORGANIZATION_MODULE_NAMES,
  type OrganizationModules,
} from '@/lib/auth/modules'
import { miraBtn } from '@/lib/miraButtons'

interface Props {
  organizationId: string
  modules: OrganizationModules
}

/**
 * Módulos contratados por el cliente (1.4).
 *
 * Los interruptores son solo la superficie. La protección real vive en tres
 * sitios que no dependen de esta pantalla:
 *
 *   · la Server Action exige `platform_admin` con perfil activo;
 *   · el trigger `protect_organization_columns` impide que nadie más cambie la
 *     columna, ni siquiera la persona propietaria de la organización, que sí
 *     tiene UPDATE sobre su propia fila;
 *   · las policies de rfqs comprueban el módulo en cada consulta.
 *
 * El guardado es explícito, no al vuelo: apagar un módulo deja sin operar a una
 * empresa entera y no debe ocurrir por un clic accidental.
 */
export function OrganizationModulesCard({ organizationId, modules }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)
  const [estado, setEstado] = useState<OrganizationModules>(modules)

  const hayCambios = ORGANIZATION_MODULE_NAMES.some((name) => estado[name] !== modules[name])

  function guardar() {
    setError(null)
    setGuardado(false)
    startTransition(async () => {
      const resultado = await setOrganizationModules(organizationId, {
        markets: estado.markets,
        quotes: estado.quotes,
      })
      if (resultado?.error) {
        setError(resultado.error)
        return
      }
      setGuardado(true)
      router.refresh()
    })
  }

  return (
    <section className="mira-card rounded-2xl p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-mira-magenta-soft">
          <Blocks size={14} className="text-mira-magenta" />
        </div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Módulos disponibles
        </h2>
      </div>

      <p className="mb-5 text-xs text-slate-500">
        Controla qué módulos puede usar esta organización. Al desactivar uno, sus miembros siguen
        viendo el enlace en el menú, pero encuentran una pantalla que explica que está
        deshabilitado. No se borra ningún dato ni se modifican los permisos de cada persona.
      </p>

      <div className="space-y-3">
        {ORGANIZATION_MODULE_NAMES.map((name) => {
          const activo = estado[name]
          return (
            <label
              key={name}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-mira-line bg-mira-canvas/50 px-4 py-3 transition-colors hover:border-mira-magenta/30"
            >
              <input
                type="checkbox"
                checked={activo}
                disabled={pending}
                onChange={(e) => {
                  setGuardado(false)
                  setEstado((prev) => ({ ...prev, [name]: e.target.checked }))
                }}
                className="mt-0.5 h-4 w-4 shrink-0 accent-mira-magenta"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-mira-ink">
                    {ORGANIZATION_MODULE_LABELS[name]}
                  </span>
                  <span
                    className={
                      activo
                        ? 'rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700'
                        : 'rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500'
                    }
                  >
                    {activo ? 'Activo' : 'Desactivado'}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {ORGANIZATION_MODULE_DESCRIPTIONS[name]}
                </span>
              </span>
            </label>
          )
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || !hayCambios}
          onClick={guardar}
          className={`${miraBtn.primary} disabled:opacity-40`}
        >
          {pending ? 'Guardando…' : 'Guardar módulos'}
        </button>

        {hayCambios && !pending && (
          <button
            type="button"
            onClick={() => {
              setEstado(modules)
              setError(null)
            }}
            className={miraBtn.ghost}
          >
            Descartar cambios
          </button>
        )}

        {guardado && !hayCambios && (
          <span className="text-xs font-semibold text-emerald-700">Módulos actualizados.</span>
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
