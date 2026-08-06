'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldCheck, Trash2 } from 'lucide-react'
import {
  removeMembership,
  updateMembershipCapabilities,
  updateMembershipRole,
  updateMembershipStatus,
} from '@/lib/actions/user-admin'
import type { OrgMember } from '@/lib/actions/users'
import {
  ASSIGNABLE_ORG_ROLE_LABELS,
  MEMBERSHIP_STATUS_LABELS,
  organizationAllows,
  type AssignableMembershipStatus,
  type AssignableOrgRole,
} from '@/lib/auth/user-admin'
import { normalizeCommercialProfile, organizationRoleLabel, statusLabel } from '@/lib/identity'
import { formatChartDateLong } from '@/lib/markets/chart-dates'
import { miraField } from '@/lib/miraButtons'

interface Props {
  members: OrgMember[]
  orgId: string
  /** Perfil comercial de la organización: techo de las capacidades. */
  commercialProfile: string | null
  /** Identificador del administrador que está mirando, para su propia fila. */
  actorId: string
}

function fullName(m: OrgMember) {
  const u = m.user
  return [u?.first_name, u?.last_name].filter(Boolean).join(' ') || '—'
}

/**
 * Equipo de una organización (039).
 *
 * ── Qué cambia respecto a la versión anterior ───────────────────────────────
 *
 * Antes solo se podía cambiar el rol y eliminar. Ahora también:
 *
 *   · activar / desactivar la pertenencia — el cliente pedía poder suspender a
 *     alguien sin sacarlo de la empresa y perder su histórico;
 *   · conceder o retirar `can_buy` y `can_sell`, que es lo que de verdad decide
 *     si esa persona puede lanzar cotizaciones.
 *
 * El propietario se identifica de forma explícita y sus controles salen
 * deshabilitados: el trigger de 023 rechaza degradarlo, desactivarlo o
 * eliminarlo porque la organización se quedaría sin ninguno.
 */
export function MembersTable({ members, commercialProfile, actorId }: Props) {
  const perfil = normalizeCommercialProfile(commercialProfile)

  if (members.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-400">
        Esta organización no tiene miembros todavía.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-mira-line bg-mira-canvas/60">
            {['Miembro', 'Email', 'Rol', 'Pertenencia', 'Capacidades', 'Incorporación', ''].map(
              (h, i) => (
                <th
                  key={i}
                  className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-mira-line">
          {members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              admiteCompra={organizationAllows(perfil, 'buy')}
              admiteVenta={organizationAllows(perfil, 'sell')}
              isSelf={m.user_id === actorId}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MemberRow({
  member,
  admiteCompra,
  admiteVenta,
  isSelf,
}: {
  member: OrgMember
  admiteCompra: boolean
  admiteVenta: boolean
  isSelf: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const esPropietario = member.orgRole === 'owner'
  const bloqueado = pending || isSelf

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
      <tr className={`transition-colors hover:bg-mira-canvas/70 ${pending ? 'opacity-50' : ''}`}>
        <td className="whitespace-nowrap px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mira-magenta-soft text-xs font-bold text-mira-magenta">
              {(member.user?.first_name ?? member.user?.email)?.[0]?.toUpperCase() ?? '?'}
            </div>
            <span className="text-sm font-bold text-mira-ink">{fullName(member)}</span>
          </div>
        </td>

        <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
          {member.user?.email || '—'}
        </td>

        {/* ── Rol ── */}
        <td className="whitespace-nowrap px-4 py-3">
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
              aria-label={`Rol de ${fullName(member)}`}
              onChange={(e) =>
                ejecutar(() => updateMembershipRole(member.id, e.target.value as AssignableOrgRole))
              }
              className={`${miraField} w-auto py-1.5 text-xs disabled:bg-mira-canvas disabled:text-slate-400`}
            >
              <option value="admin">{ASSIGNABLE_ORG_ROLE_LABELS.admin}</option>
              <option value="member">{ASSIGNABLE_ORG_ROLE_LABELS.member}</option>
            </select>
          )}
        </td>

        {/* ── Estado de la pertenencia ── */}
        <td className="whitespace-nowrap px-4 py-3">
          {esPropietario ? (
            <span className="text-xs text-slate-500">{statusLabel(member.status)}</span>
          ) : (
            <select
              value={member.status === 'active' ? 'active' : 'suspended'}
              disabled={bloqueado}
              aria-label={`Estado de la pertenencia de ${fullName(member)}`}
              onChange={(e) =>
                ejecutar(() =>
                  updateMembershipStatus(member.id, e.target.value as AssignableMembershipStatus),
                )
              }
              className={`${miraField} w-auto py-1.5 text-xs disabled:bg-mira-canvas disabled:text-slate-400`}
            >
              <option value="active">{MEMBERSHIP_STATUS_LABELS.active}</option>
              <option value="suspended">{MEMBERSHIP_STATUS_LABELS.suspended}</option>
            </select>
          )}
        </td>

        {/* ── Capacidades ── */}
        <td className="whitespace-nowrap px-4 py-3">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={member.can_buy}
                disabled={bloqueado || (!admiteCompra && !member.can_buy)}
                aria-label={`${fullName(member)} puede comprar`}
                onChange={(e) =>
                  ejecutar(() =>
                    updateMembershipCapabilities(member.id, {
                      canBuy: e.target.checked,
                      canSell: member.can_sell,
                    }),
                  )
                }
                className="h-3.5 w-3.5 rounded border-mira-line text-mira-magenta focus:ring-mira-magenta/30"
              />
              Compra
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={member.can_sell}
                disabled={bloqueado || (!admiteVenta && !member.can_sell)}
                aria-label={`${fullName(member)} puede vender`}
                onChange={(e) =>
                  ejecutar(() =>
                    updateMembershipCapabilities(member.id, {
                      canBuy: member.can_buy,
                      canSell: e.target.checked,
                    }),
                  )
                }
                className="h-3.5 w-3.5 rounded border-mira-line text-mira-magenta focus:ring-mira-magenta/30"
              />
              Venta
            </label>
          </div>
        </td>

        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
          {formatChartDateLong(member.joined_at.slice(0, 10))}
        </td>

        <td className="whitespace-nowrap px-4 py-3">
          {!esPropietario && (
            <button
              onClick={() => {
                if (!confirm(`¿Retirar a ${fullName(member)} de la organización?`)) return
                ejecutar(() => removeMembership(member.id))
              }}
              disabled={bloqueado}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
              title="Retirar de la organización"
              aria-label={`Retirar a ${fullName(member)} de la organización`}
            >
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            </button>
          )}
        </td>
      </tr>

      {(error || isSelf) && (
        <tr>
          <td colSpan={7} className="px-4 pb-2">
            {isSelf && !error && (
              <p className="rounded border border-amber-100 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
                Es tu propia pertenencia: no puedes modificarla.
              </p>
            )}
            {error && (
              <p role="alert" className="rounded border border-red-100 bg-red-50 px-3 py-1.5 text-xs text-red-600">
                {error}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
