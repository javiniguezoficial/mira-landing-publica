'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldCheck, Trash2 } from 'lucide-react'
import {
  removeTeamMember,
  updateTeamMemberCapabilities,
  updateTeamMemberRole,
  updateTeamMemberStatus,
} from '@/lib/actions/team'
import type { TeamMemberView } from '@/lib/queries/team'
import { MANAGEABLE_ROLE_LABELS } from '@/lib/auth/member-write'
import { capabilityCeilingReason, canManageTeam } from '@/lib/auth/team'
import { organizationRoleLabel, statusLabel, type CommercialProfile, type OrganizationRole } from '@/lib/identity'
import { organizationAllows } from '@/lib/auth/user-admin'
import { formatChartDateLong } from '@/lib/markets/chart-dates'
import { miraField } from '@/lib/miraButtons'
import { cn } from '@/lib/utils'

interface Props {
  members: TeamMemberView[]
  commercialProfile: CommercialProfile | null
  actorUserId: string
  actorRole: OrganizationRole | null
}

function nombreCompleto(m: TeamMemberView) {
  return [m.firstName, m.lastName].filter(Boolean).join(' ') || '—'
}

/**
 * Reparto de columnas. Mismo criterio que la tabla del panel de MIRA: `nowrap`
 * SOLO en desplegables, fecha e iconos; nombre, correo y capacidades pueden
 * envolver antes que provocar scroll horizontal.
 */
const COLUMNAS: { label: string; width: string; nowrap?: boolean }[] = [
  { label: 'Miembro',       width: 'w-[22%]' },
  { label: 'Email',         width: 'w-[24%]' },
  { label: 'Rol',           width: 'w-[13%]', nowrap: true },
  { label: 'Estado',        width: 'w-[13%]', nowrap: true },
  { label: 'Capacidades',   width: 'w-[16%]' },
  { label: 'Desde',         width: 'w-[9%]',  nowrap: true },
  { label: '',              width: 'w-[3%]',  nowrap: true },
]

/**
 * Equipo de la propia organización (Bloque 1 · portal cliente).
 *
 * ── Los dos conceptos NO se mezclan ────────────────────────────────────────
 *
 * «Rol» y «Capacidades» son columnas distintas porque son ejes distintos:
 *
 *   Rol          — quién manda dentro de la empresa (owner · admin · member).
 *   Capacidades  — qué operaciones comerciales puede hacer (comprar · vender).
 *
 * Un `member` puede comprar y un `admin` puede no poder. Meterlos en un único
 * desplegable obligaría a inventar combinaciones («admin comprador») que no
 * existen en el modelo y que multiplicarían las opciones sin añadir nada.
 *
 * ── Esto NO es la autorización ─────────────────────────────────────────────
 *
 * Todo lo que aquí sale deshabilitado se vuelve a comprobar en la Server Action
 * y, después, en las policies y el trigger de 023. Lo que se decide aquí es qué
 * se ENSEÑA, no qué se PERMITE.
 */
export function TeamMembersTable({ members, commercialProfile, actorUserId, actorRole }: Props) {
  const puedeGestionar = canManageTeam({ userId: actorUserId, orgRole: actorRole })

  if (members.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-400">
        Tu organización todavía no tiene miembros.
      </p>
    )
  }

  const motivoCompra = capabilityCeilingReason(commercialProfile, 'buy')
  const motivoVenta = capabilityCeilingReason(commercialProfile, 'sell')

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-mira-line bg-mira-canvas/60">
              {COLUMNAS.map((c) => (
                <th
                  key={c.label || 'acciones'}
                  scope="col"
                  className={cn(
                    'px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500',
                    c.width,
                    c.nowrap && 'whitespace-nowrap',
                  )}
                >
                  {c.label || <span className="sr-only">Acciones</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-mira-line">
            {members.map((m) => (
              <TeamMemberRow
                key={m.id}
                member={m}
                admiteCompra={organizationAllows(commercialProfile, 'buy')}
                admiteVenta={organizationAllows(commercialProfile, 'sell')}
                esPropio={m.userId === actorUserId}
                actorRole={actorRole}
                puedeGestionar={puedeGestionar}
              />
            ))}
          </tbody>
        </table>
      </div>

      {(motivoCompra || motivoVenta) && (
        <div className="space-y-1 rounded-xl border border-mira-line bg-mira-canvas/60 px-4 py-3">
          {motivoCompra && <p className="text-xs text-slate-500">· {motivoCompra}</p>}
          {motivoVenta && <p className="text-xs text-slate-500">· {motivoVenta}</p>}
        </div>
      )}
    </div>
  )
}

function TeamMemberRow({
  member,
  admiteCompra,
  admiteVenta,
  esPropio,
  actorRole,
  puedeGestionar,
}: {
  member: TeamMemberView
  admiteCompra: boolean
  admiteVenta: boolean
  esPropio: boolean
  actorRole: OrganizationRole | null
  puedeGestionar: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const esPropietario = member.orgRole === 'owner'
  const objetivoEsAdmin = member.orgRole === 'admin'

  // Espejo de `evaluateMemberUpdate`: nadie toca su propia fila ni la del
  // propietario, y un `admin` no gestiona a otro `admin`.
  const bloqueado =
    pending ||
    !puedeGestionar ||
    esPropio ||
    esPropietario ||
    (objetivoEsAdmin && actorRole !== 'owner')

  // Solo el propietario concede el rol de administrador.
  const puedeConcederAdmin = actorRole === 'owner'

  function ejecutar(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null)
    startTransition(async () => {
      const r = await fn()
      if (r.ok) router.refresh()
      else setError(r.error)
    })
  }

  return (
    <>
      <tr className={cn('transition-colors hover:bg-mira-canvas/70', pending && 'opacity-50')}>
        <td className="px-4 py-3 align-top">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mira-magenta-soft text-xs font-bold text-mira-magenta">
              {(member.firstName ?? member.email)?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0">
              <span className="text-sm font-bold text-mira-ink">{nombreCompleto(member)}</span>
              {esPropio && (
                <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                  Tú
                </span>
              )}
            </div>
          </div>
        </td>

        <td className="break-words px-4 py-3 align-top text-sm text-slate-600">
          {member.email || '—'}
        </td>

        {/* ── Rol organizativo ── */}
        <td className="whitespace-nowrap px-4 py-3 align-top">
          {esPropietario ? (
            <span
              className="inline-flex items-center gap-1 rounded-lg bg-violet-100 px-2 py-1 text-xs font-bold text-violet-700"
              title="El propietario no cambia de rol: la organización se quedaría sin ninguno."
            >
              <ShieldCheck size={11} aria-hidden="true" />
              {organizationRoleLabel('owner')}
            </span>
          ) : (
            <select
              value={member.orgRole ?? 'member'}
              disabled={bloqueado}
              aria-label={`Rol de ${nombreCompleto(member)}`}
              onChange={(e) => ejecutar(() => updateTeamMemberRole(member.id, e.target.value))}
              className={`${miraField} w-full px-2 py-1.5 text-xs disabled:bg-mira-canvas disabled:text-slate-400`}
            >
              <option value="member">{MANAGEABLE_ROLE_LABELS.member}</option>
              {/* Sin propiedad no se ofrece: el servidor lo rechazaría igual, y
                  ofrecer una opción que siempre falla es peor que no ofrecerla. */}
              {(puedeConcederAdmin || objetivoEsAdmin) && (
                <option value="admin">{MANAGEABLE_ROLE_LABELS.admin}</option>
              )}
            </select>
          )}
        </td>

        {/* ── Estado de la pertenencia ── */}
        <td className="whitespace-nowrap px-4 py-3 align-top">
          {esPropietario ? (
            <span className="text-xs text-slate-500">{statusLabel(member.status)}</span>
          ) : (
            <select
              value={member.status === 'active' ? 'active' : 'suspended'}
              disabled={bloqueado}
              aria-label={`Estado de ${nombreCompleto(member)}`}
              onChange={(e) => ejecutar(() => updateTeamMemberStatus(member.id, e.target.value))}
              className={`${miraField} w-full px-2 py-1.5 text-xs disabled:bg-mira-canvas disabled:text-slate-400`}
            >
              <option value="active">Activo</option>
              <option value="suspended">Desactivado</option>
            </select>
          )}
        </td>

        {/* ── Capacidades comerciales ── */}
        <td className="px-4 py-3 align-top">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={member.canBuy}
                // Retirar una capacidad se permite aunque el perfil ya no la
                // contemple: quitar permisos nunca debe quedar bloqueado.
                disabled={bloqueado || (!admiteCompra && !member.canBuy)}
                aria-label={`${nombreCompleto(member)} puede comprar`}
                onChange={(e) =>
                  ejecutar(() =>
                    updateTeamMemberCapabilities(member.id, {
                      canBuy: e.target.checked,
                      canSell: member.canSell,
                    }),
                  )
                }
                className="h-3.5 w-3.5 rounded border-mira-line text-mira-magenta focus:ring-mira-magenta/30"
              />
              Comprar
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={member.canSell}
                disabled={bloqueado || (!admiteVenta && !member.canSell)}
                aria-label={`${nombreCompleto(member)} puede vender`}
                onChange={(e) =>
                  ejecutar(() =>
                    updateTeamMemberCapabilities(member.id, {
                      canBuy: member.canBuy,
                      canSell: e.target.checked,
                    }),
                  )
                }
                className="h-3.5 w-3.5 rounded border-mira-line text-mira-magenta focus:ring-mira-magenta/30"
              />
              Vender
            </label>
          </div>
        </td>

        <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-slate-500">
          {formatChartDateLong(member.joinedAt.slice(0, 10))}
        </td>

        <td className="whitespace-nowrap px-4 py-3 align-top">
          {!esPropietario && (
            <button
              onClick={() => {
                if (!confirm(`¿Retirar a ${nombreCompleto(member)} de la organización?`)) return
                ejecutar(() => removeTeamMember(member.id))
              }}
              disabled={bloqueado}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
              title="Retirar de la organización"
              aria-label={`Retirar a ${nombreCompleto(member)} de la organización`}
            >
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            </button>
          )}
        </td>
      </tr>

      {(error || esPropio || (objetivoEsAdmin && actorRole !== 'owner')) && (
        <tr>
          <td colSpan={COLUMNAS.length} className="px-4 pb-2">
            {error ? (
              <p role="alert" className="rounded border border-red-100 bg-red-50 px-3 py-1.5 text-xs text-red-600">
                {error}
              </p>
            ) : esPropio ? (
              <p className="rounded border border-amber-100 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
                Es tu propia pertenencia: no puedes modificarla. Pídeselo a otra persona con
                permisos, o a MIRA si eres el propietario.
              </p>
            ) : (
              <p className="rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
                Solo el propietario puede gestionar a un administrador.
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
