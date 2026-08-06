'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Loader2, ShieldCheck, Trash2 } from 'lucide-react'
import {
  removeMembership,
  updateMembershipCapabilities,
  updateMembershipRole,
  updateMembershipStatus,
} from '@/lib/actions/user-admin'
import {
  ASSIGNABLE_ORG_ROLE_LABELS,
  MEMBERSHIP_STATUS_LABELS,
  organizationAllows,
  type AssignableMembershipStatus,
  type AssignableOrgRole,
} from '@/lib/auth/user-admin'
import { commercialProfileLabel, normalizeCommercialProfile, organizationRoleLabel, statusLabel } from '@/lib/identity'
import { miraBtn, miraField } from '@/lib/miraButtons'
import type { AdminUserMembership } from '@/lib/actions/users'

interface Props {
  memberships: AdminUserMembership[]
  /** Para impedir en la interfaz lo que el servidor rechazaría igualmente. */
  isSelf: boolean
}

const labelCls = 'mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400'

/**
 * Gestión de las pertenencias de un usuario (039).
 *
 * ── Los tres ejes, separados también en pantalla ────────────────────────────
 *
 *   ROL EN LA EMPRESA   owner · admin · member
 *   ESTADO              activa · desactivada
 *   CAPACIDADES         can_buy · can_sell, acotadas por el perfil de la empresa
 *
 * El rol de PLATAFORMA no aparece aquí: está en su propia tarjeta, con su
 * confirmación. Mezclarlos haría que conceder «Administrador» de una empresa y
 * conceder el panel de MIRA se parecieran demasiado.
 *
 * ── Qué se deshabilita y por qué ────────────────────────────────────────────
 *
 * El propietario no cambia de rol, no se desactiva y no se retira: el trigger
 * de 023 lo rechaza porque la organización se quedaría sin ninguno. Se enseña
 * el motivo en el propio control en lugar de dejar que se pulse y falle.
 *
 * Una capacidad que la empresa no admite sale deshabilitada con la explicación:
 * el problema no es el permiso de la persona, es el perfil comercial de la
 * organización, y eso se arregla en otra pantalla.
 */
export function UserMembershipsPanel({ memberships, isSelf }: Props) {
  if (memberships.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-mira-line px-4 py-6 text-center text-sm text-slate-500">
        Este usuario no pertenece a ninguna organización. Asígnalo a una desde el
        bloque de abajo.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {memberships.map((m) => (
        <MembershipCard key={m.id} membership={m} isSelf={isSelf} />
      ))}
    </div>
  )
}

function MembershipCard({
  membership: m,
  isSelf,
}: {
  membership: AdminUserMembership
  isSelf: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const esPropietario = m.orgRole === 'owner'
  const perfil = normalizeCommercialProfile(m.commercialProfile)
  const admiteCompra = organizationAllows(perfil, 'buy')
  const admiteVenta = organizationAllows(perfil, 'sell')

  // La propia pertenencia no se toca desde el panel: el trigger de 023 lo
  // rechaza para todo el mundo, incluido un administrador de plataforma.
  const bloqueado = isSelf || pending

  function ejecutar(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, exito: string) {
    setError(null)
    setOk(null)
    startTransition(async () => {
      const r = await fn()
      if (r.ok) {
        setOk(exito)
        router.refresh()
      } else {
        setError(r.error)
      }
    })
  }

  return (
    <div className="mira-card space-y-4 rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Building2 size={15} className="shrink-0 text-mira-magenta" aria-hidden="true" />
        <span className="text-sm font-bold text-mira-ink">{m.organizationName}</span>
        {esPropietario && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">
            <ShieldCheck size={11} aria-hidden="true" />
            {organizationRoleLabel('owner')}
          </span>
        )}
        <span className="rounded-md bg-mira-canvas px-2 py-0.5 text-[10px] font-bold text-slate-500">
          {commercialProfileLabel(m.commercialProfile)}
        </span>
        {m.status !== 'active' && (
          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
            Pertenencia {statusLabel(m.status).toLowerCase()}
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* ── Rol en la organización ── */}
        <div>
          <label className={labelCls} htmlFor={`rol-${m.id}`}>
            Rol en la organización
          </label>
          <select
            id={`rol-${m.id}`}
            value={m.orgRole ?? 'member'}
            disabled={bloqueado || esPropietario}
            onChange={(e) =>
              ejecutar(
                () => updateMembershipRole(m.id, e.target.value as AssignableOrgRole),
                'Rol actualizado.',
              )
            }
            className={`${miraField} disabled:cursor-not-allowed disabled:bg-mira-canvas disabled:text-slate-400`}
          >
            {esPropietario && <option value="owner">{ASSIGNABLE_ORG_ROLE_LABELS.owner}</option>}
            <option value="admin">{ASSIGNABLE_ORG_ROLE_LABELS.admin}</option>
            <option value="member">{ASSIGNABLE_ORG_ROLE_LABELS.member}</option>
          </select>
          {esPropietario && (
            <p className="mt-1 text-[11px] text-slate-400">
              El propietario no cambia de rol: la organización se quedaría sin ninguno.
            </p>
          )}
        </div>

        {/* ── Estado de la pertenencia ── */}
        <div>
          <label className={labelCls} htmlFor={`estado-${m.id}`}>
            Estado de la pertenencia
          </label>
          <select
            id={`estado-${m.id}`}
            value={m.status === 'active' ? 'active' : 'suspended'}
            disabled={bloqueado || esPropietario}
            onChange={(e) =>
              ejecutar(
                () => updateMembershipStatus(m.id, e.target.value as AssignableMembershipStatus),
                'Estado actualizado.',
              )
            }
            className={`${miraField} disabled:cursor-not-allowed disabled:bg-mira-canvas disabled:text-slate-400`}
          >
            <option value="active">{MEMBERSHIP_STATUS_LABELS.active}</option>
            <option value="suspended">{MEMBERSHIP_STATUS_LABELS.suspended}</option>
          </select>
          {esPropietario && (
            <p className="mt-1 text-[11px] text-slate-400">
              El propietario no se desactiva.
            </p>
          )}
        </div>
      </div>

      {/* ── Capacidades comerciales ── */}
      <fieldset className="rounded-xl border border-mira-line p-3">
        <legend className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Capacidades comerciales
        </legend>
        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={m.canBuy}
              disabled={bloqueado || (!admiteCompra && !m.canBuy)}
              onChange={(e) =>
                ejecutar(
                  () =>
                    updateMembershipCapabilities(m.id, {
                      canBuy: e.target.checked,
                      canSell: m.canSell,
                    }),
                  'Capacidades actualizadas.',
                )
              }
              className="h-4 w-4 rounded border-mira-line text-mira-magenta focus:ring-mira-magenta/30"
            />
            Puede comprar
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={m.canSell}
              disabled={bloqueado || (!admiteVenta && !m.canSell)}
              onChange={(e) =>
                ejecutar(
                  () =>
                    updateMembershipCapabilities(m.id, {
                      canBuy: m.canBuy,
                      canSell: e.target.checked,
                    }),
                  'Capacidades actualizadas.',
                )
              }
              className="h-4 w-4 rounded border-mira-line text-mira-magenta focus:ring-mira-magenta/30"
            />
            Puede vender
          </label>
        </div>
        {(!admiteCompra || !admiteVenta) && (
          <p className="mt-2 text-[11px] text-slate-400">
            El perfil comercial de la organización es «{commercialProfileLabel(m.commercialProfile)}»:
            solo admite las capacidades que contempla. Cámbialo en la ficha del cliente si hace falta.
          </p>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        {!esPropietario && (
          <button
            type="button"
            disabled={bloqueado}
            onClick={() => {
              if (!confirm(`¿Retirar a este usuario de «${m.organizationName}»?`)) return
              ejecutar(() => removeMembership(m.id), 'Usuario retirado de la organización.')
            }}
            className={`${miraBtn.ghost} text-red-600 hover:border-red-300 hover:text-red-700 disabled:opacity-40`}
          >
            <Trash2 size={14} /> Retirar de la organización
          </button>
        )}

        {pending && (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <Loader2 size={13} className="animate-spin" /> Guardando…
          </span>
        )}
        {ok && !pending && <span className="text-xs font-semibold text-emerald-600">{ok}</span>}
      </div>

      {isSelf && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Es tu propia pertenencia: no puedes modificarla. Pídeselo a otro administrador.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
