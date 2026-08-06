'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, UserPlus } from 'lucide-react'
import { assignUserToOrganization } from '@/lib/actions/user-admin'
import {
  ASSIGNABLE_ORG_ROLE_LABELS,
  organizationAllows,
  type AssignableOrgRole,
} from '@/lib/auth/user-admin'
import { commercialProfileLabel, normalizeCommercialProfile } from '@/lib/identity'
import {
  OWNER_ASSIGNMENT_ACKNOWLEDGEMENT,
  OWNER_ASSIGNMENT_WARNING,
  requiresOwnerConfirmation,
} from '@/lib/users/assignment-copy'
import { miraBtn, miraField } from '@/lib/miraButtons'
import type { AssignableOrganization } from '@/lib/actions/users'

interface Props {
  userId: string
  userName: string
  /** Organizaciones en las que YA está: no se ofrecen otra vez. */
  currentOrganizationIds: string[]
  organizations: AssignableOrganization[]
  isSelf: boolean
}

const labelCls = 'mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400'

/**
 * Asignar un usuario existente a una organización (039).
 *
 * Es la petición literal del cliente: «quiero poder asignar una cuenta
 * existente a una organización».
 *
 * ── Qué NO es ───────────────────────────────────────────────────────────────
 *
 * NO es una invitación. No crea cuentas, no manda correos y no duplica usuarios
 * por email: trabaja sobre una persona que ya existe. Cuando haya un flujo de
 * invitación real será una acción distinta y vivirá aparte.
 *
 * ── Impacto visible antes de guardar ────────────────────────────────────────
 *
 * El resumen de abajo dice, con palabras, exactamente lo que va a pasar. Es lo
 * que el cliente pidió como «ver claramente el impacto antes de guardar»: los
 * desplegables sueltos no dejan claro que conceder «Puede comprar» habilita
 * lanzar cotizaciones en nombre de esa empresa.
 */
export function AssignOrganizationCard({
  userId,
  userName,
  currentOrganizationIds,
  organizations,
  isSelf,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [orgId, setOrgId] = useState('')
  const [role, setRole] = useState<AssignableOrgRole>('member')
  const [canBuy, setCanBuy] = useState(false)
  const [canSell, setCanSell] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  // Confirmación reforzada de la propiedad. Se reinicia al cambiar de rol o de
  // organización: una casilla marcada que sobrevive a un cambio de contexto ya
  // no confirma lo que dice confirmar.
  const [ownerAck, setOwnerAck] = useState(false)

  const disponibles = useMemo(
    () => organizations.filter((o) => !currentOrganizationIds.includes(o.id)),
    [organizations, currentOrganizationIds],
  )

  const org = disponibles.find((o) => o.id === orgId) ?? null
  const perfil = normalizeCommercialProfile(org?.commercialProfile)
  const admiteCompra = organizationAllows(perfil, 'buy')
  const admiteVenta = organizationAllows(perfil, 'sell')

  // `owner` solo se ofrece cuando la organización NO tiene propietario. Crear un
  // segundo es una transferencia de propiedad, que no se implementa aquí y que
  // el índice único de la base rechazaría igualmente.
  const puedeSerPropietario = !!org && !org.hasOwner

  // Confirmación reforzada SOLO para `owner`: es la única asignación que el
  // panel no puede deshacer después. Pedirla también en `admin` o `member` la
  // convertiría en un trámite que se marca sin leer.
  const exigeConfirmacion = requiresOwnerConfirmation(role)
  const bloqueadoPorConfirmacion = exigeConfirmacion && !ownerAck

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setOk(null)

    if (!orgId) {
      setError('Selecciona una organización.')
      return
    }
    if (bloqueadoPorConfirmacion) {
      setError('Marca la casilla de confirmación para asignar la propiedad.')
      return
    }

    startTransition(async () => {
      const r = await assignUserToOrganization({
        userId,
        organizationId: orgId,
        role,
        // Las capacidades que la empresa no admite no se envían: el servidor las
        // rechazaría, y mandarlas solo produciría un error evitable.
        canBuy: canBuy && admiteCompra,
        canSell: canSell && admiteVenta,
      })

      if (r.ok) {
        setOk(`${userName} ya pertenece a ${org?.name ?? 'la organización'}.`)
        setOrgId('')
        setRole('member')
        setCanBuy(false)
        setCanSell(false)
        setOwnerAck(false)
        router.refresh()
      } else {
        setError(r.error)
      }
    })
  }

  if (isSelf) {
    return (
      <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
        No puedes asignarte a ti mismo a una organización. Pídeselo a otro administrador.
      </p>
    )
  }

  if (disponibles.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-mira-line px-4 py-6 text-center text-sm text-slate-500">
        No queda ninguna organización a la que asignar a esta persona.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="asignar-org">
            Organización <span className="text-red-500">*</span>
          </label>
          <select
            id="asignar-org"
            value={orgId}
            onChange={(e) => {
              setOrgId(e.target.value)
              setRole('member')
              setCanBuy(false)
              setCanSell(false)
              setOwnerAck(false)
            }}
            className={miraField}
          >
            <option value="">— Seleccionar organización —</option>
            {disponibles.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
                {o.hasOwner ? '' : ' · sin propietario'}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls} htmlFor="asignar-rol">
            Rol en la organización
          </label>
          <select
            id="asignar-rol"
            value={role}
            onChange={(e) => {
              setRole(e.target.value as AssignableOrgRole)
              setOwnerAck(false)
            }}
            disabled={!org}
            className={`${miraField} disabled:bg-mira-canvas disabled:text-slate-400`}
          >
            <option value="member">{ASSIGNABLE_ORG_ROLE_LABELS.member}</option>
            <option value="admin">{ASSIGNABLE_ORG_ROLE_LABELS.admin}</option>
            {puedeSerPropietario && (
              <option value="owner">{ASSIGNABLE_ORG_ROLE_LABELS.owner}</option>
            )}
          </select>
          {org && !puedeSerPropietario && (
            <p className="mt-1 text-[11px] text-slate-400">
              Esta organización ya tiene propietario.
            </p>
          )}
        </div>

        <fieldset className="rounded-xl border border-mira-line p-3">
          <legend className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Capacidades
          </legend>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={canBuy}
                disabled={!org || !admiteCompra}
                onChange={(e) => setCanBuy(e.target.checked)}
                className="h-4 w-4 rounded border-mira-line text-mira-magenta focus:ring-mira-magenta/30"
              />
              Puede comprar
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={canSell}
                disabled={!org || !admiteVenta}
                onChange={(e) => setCanSell(e.target.checked)}
                className="h-4 w-4 rounded border-mira-line text-mira-magenta focus:ring-mira-magenta/30"
              />
              Puede vender
            </label>
          </div>
          {org && (
            <p className="mt-2 text-[11px] text-slate-400">
              Perfil comercial de la empresa: {commercialProfileLabel(org.commercialProfile)}.
            </p>
          )}
        </fieldset>
      </div>

      {/* Advertencia de propiedad. Va ANTES del resumen y del botón: quien
          concede la propiedad tiene que leerlo antes de pulsar, no descubrirlo
          al intentar revertirlo. No cambia ninguna protección — el rol `owner`
          solo se ofrece si la organización no tiene propietario, y el trigger
          de 023 sigue siendo quien lo impone. */}
      {exigeConfirmacion && org && (
        <div
          role="alert"
          className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3"
        >
          <p className="flex items-start gap-2 text-xs font-semibold text-amber-900">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            {OWNER_ASSIGNMENT_WARNING}
          </p>
          <label className="flex items-start gap-2 text-xs font-bold text-amber-900">
            <input
              type="checkbox"
              checked={ownerAck}
              onChange={(e) => setOwnerAck(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-amber-400 text-amber-700 focus:ring-amber-500/40"
            />
            {OWNER_ASSIGNMENT_ACKNOWLEDGEMENT}
          </label>
        </div>
      )}

      {/* Impacto, en palabras, antes de confirmar. */}
      {org && (
        <div className="rounded-xl border border-mira-line bg-mira-canvas/50 px-4 py-3 text-xs text-slate-600">
          <p className="font-bold text-mira-ink">Al confirmar:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>
              {userName} pasará a ser{' '}
              <strong>{ASSIGNABLE_ORG_ROLE_LABELS[role].toLowerCase()}</strong> de{' '}
              <strong>{org.name}</strong>, con la pertenencia activa.
            </li>
            <li>
              Podrá ver los datos de esa organización: cotizaciones, mercados y equipo.
            </li>
            <li>
              {canBuy && admiteCompra
                ? 'Podrá lanzar cotizaciones en nombre de la empresa.'
                : 'No podrá lanzar cotizaciones.'}
              {' '}
              {canSell && admiteVenta ? 'Podrá responder como vendedor.' : 'No podrá responder como vendedor.'}
            </li>
            {role === 'owner' && (
              <li className="font-bold text-violet-700">
                Como propietario, será la única persona que puede editar los datos de la
                empresa. Esta asignación no se puede deshacer desde el panel.
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || !orgId || bloqueadoPorConfirmacion}
          className={`${miraBtn.primary} disabled:opacity-40`}
        >
          {pending ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Asignando…
            </>
          ) : (
            <>
              <UserPlus size={14} /> Asignar a la organización
            </>
          )}
        </button>
        {ok && <span className="text-xs font-semibold text-emerald-600">{ok}</span>}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {error}
        </p>
      )}
    </form>
  )
}
