import { Lock } from 'lucide-react'
import {
  MODULE_DISABLED_COPY,
  ORGANIZATION_MODULE_DESCRIPTIONS,
  type OrganizationModuleName,
} from '@/lib/auth/modules'

interface Props {
  module: OrganizationModuleName
}

/**
 * Variante compacta, para ocupar el hueco de un panel dentro de una pantalla
 * que sigue teniendo contenido válido — el Dashboard, sobre todo.
 *
 * Dice lo mismo en menos espacio. Lo que NO hace es enseñar un cero: un panel
 * de cotizaciones con «0 RFQs» sería mentira, porque las hay, y llevaría a la
 * persona a pensar que su empresa nunca ha pedido nada.
 */
export function ModuleDisabledInline({ module }: Props) {
  const copy = MODULE_DISABLED_COPY[module]

  return (
    <div className="flex flex-col items-center justify-center gap-2 px-5 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
        <Lock size={16} className="text-slate-400" />
      </div>
      <p className="text-xs font-bold text-mira-ink">{copy.title}</p>
      <p className="max-w-xs text-[11px] text-slate-500">{copy.description}</p>
    </div>
  )
}

/**
 * Pantalla informativa de un módulo apagado para la organización (1.4).
 *
 * Deliberadamente NO se parece a un error de permisos: no dice «no tienes
 * acceso» ni «no autorizado». Explica QUÉ hace el módulo, POR QUÉ no está
 * disponible —una decisión sobre la empresa, no sobre la persona— y A QUIÉN
 * dirigirse. Alguien que llega aquí no ha hecho nada mal.
 *
 * Se muestra en lugar del contenido operativo, nunca junto a él: la ruta sigue
 * siendo accesible para poder dar esta explicación, no para enseñar datos.
 */
export function ModuleDisabledNotice({ module }: Props) {
  const copy = MODULE_DISABLED_COPY[module]

  return (
    <div className="mira-card rounded-2xl">
      <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
          <Lock size={24} className="text-slate-400" />
        </div>

        <p className="mb-1 text-sm font-bold text-mira-ink">{copy.title}</p>

        <p className="max-w-sm text-xs text-slate-500">{copy.description}</p>

        {/* Para qué sirve el módulo: quien nunca lo ha tenido activo no sabe
            qué está pidiendo si solo se le dice que está deshabilitado. */}
        <div className="mt-6 max-w-md rounded-xl border border-mira-line bg-mira-canvas px-4 py-3">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Para qué sirve
          </p>
          <p className="text-xs text-slate-600">{ORGANIZATION_MODULE_DESCRIPTIONS[module]}</p>
        </div>
      </div>
    </div>
  )
}
