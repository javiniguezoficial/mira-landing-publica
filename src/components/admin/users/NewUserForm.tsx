'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { UserPlus, Building2, ShieldCheck, IdCard, Info, Loader2 } from 'lucide-react'
import { createAndInviteUser } from '@/lib/actions/user-admin'
import {
  DEFAULT_PLATFORM_ROLE,
  NEW_USER_ORG_ROLES,
  NEW_USER_ORG_ROLE_LABELS,
  NEW_USER_PLATFORM_ROLES,
  NEW_USER_PLATFORM_ROLE_LABELS,
  buildNewUserSummary,
  organizationAcceptsNewMembers,
  type NewUserOrgRole,
  type NewUserPlatformRole,
} from '@/lib/auth/new-user'
import { organizationAllows } from '@/lib/auth/user-admin'
import { commercialProfileLabel, normalizeCommercialProfile } from '@/lib/identity'
import { MiraSectionCard } from '@/components/mira/MiraSectionCard'
import { miraBtn, miraField, miraLabel } from '@/lib/miraButtons'

export interface OrganizationOption {
  id: string
  name: string
  status: string | null
  commercialProfile: string | null
}

interface Props {
  organizations: OrganizationOption[]
}

const SIN_ORGANIZACION = ''

/**
 * Alta administrativa de un usuario.
 *
 * ── Qué NO decide esta pantalla ───────────────────────────────────────────
 *
 * Nada. Todo lo que se elige aquí se vuelve a validar en el servidor contra la
 * base: el rol, la organización, su estado y las capacidades. Deshabilitar una
 * casilla es una comodidad para que no se pida lo imposible, no una protección
 * — un POST a mano se la salta, y por eso `createAndInviteUser` relee la
 * organización y falla si las capacidades exceden su perfil comercial.
 *
 * ── Por qué no hay campo de contraseña ────────────────────────────────────
 *
 * Porque nadie de MIRA debe conocer la contraseña de un cliente. La cuenta se
 * crea con `inviteUserByEmail` y es la propia persona quien la establece desde
 * el enlace del correo.
 */
export function NewUserForm({ organizations }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [platformRole, setPlatformRole] = useState<NewUserPlatformRole>(DEFAULT_PLATFORM_ROLE)
  const [organizationId, setOrganizationId] = useState<string>(SIN_ORGANIZACION)
  const [orgRole, setOrgRole] = useState<NewUserOrgRole>('member')
  const [canBuy, setCanBuy] = useState(false)
  const [canSell, setCanSell] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Solo las organizaciones que hoy pueden recibir miembros. La misma regla se
  // vuelve a aplicar en el servidor.
  const asignables = useMemo(
    () => organizations.filter((o) => organizationAcceptsNewMembers(o.status)),
    [organizations],
  )

  const seleccionada = asignables.find((o) => o.id === organizationId) ?? null
  const perfil = normalizeCommercialProfile(seleccionada?.commercialProfile)
  const permiteComprar = organizationAllows(perfil, 'buy')
  const permiteVender = organizationAllows(perfil, 'sell')

  /**
   * Cambiar de organización RECALCULA las capacidades.
   *
   * Sin esto, marcar «Vender» en una empresa `buyer_seller` y cambiar después a
   * una `buyer` dejaría la casilla marcada sobre una empresa que no vende. El
   * servidor lo rechazaría —y está bien que lo haga—, pero el administrador se
   * habría llevado un error por algo que la pantalla le dejó hacer.
   */
  function cambiarOrganizacion(id: string) {
    setOrganizationId(id)
    setError(null)

    const org = asignables.find((o) => o.id === id) ?? null
    const nuevoPerfil = normalizeCommercialProfile(org?.commercialProfile)
    setCanBuy((actual) => actual && organizationAllows(nuevoPerfil, 'buy'))
    setCanSell((actual) => actual && organizationAllows(nuevoPerfil, 'sell'))
  }

  const resumen = buildNewUserSummary({
    email,
    platformRole,
    organizationName: seleccionada?.name ?? null,
    orgRole: seleccionada ? orgRole : null,
    canBuy: canBuy && permiteComprar,
    canSell: canSell && permiteVender,
  })

  const puedeEnviar = firstName.trim().length > 0 && email.trim().length > 0 && !pending

  function enviar() {
    if (!puedeEnviar) return
    setError(null)

    startTransition(async () => {
      const res = await createAndInviteUser({
        firstName,
        lastName,
        email,
        phone,
        platformRole,
        organizationId: organizationId || null,
        orgRole: organizationId ? orgRole : null,
        canBuy: canBuy && permiteComprar,
        canSell: canSell && permiteVender,
      })

      if (!res.ok) {
        setError(res.error)
        return
      }

      // A la ficha del usuario recién creado: es donde se ve si todo quedó como
      // se pidió y desde donde se corrige lo que falte.
      const destino = `/admin/usuarios/${res.userId}`
      router.push(res.warning ? `${destino}?aviso=${encodeURIComponent(res.warning)}` : destino)
    })
  }

  return (
    <div className="space-y-6">
      {/* ── Datos personales ─────────────────────────────────────────── */}
      <MiraSectionCard title="Datos personales" icon={IdCard} bodyClassName="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="nu-nombre" className={miraLabel}>
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              id="nu-nombre" type="text" required value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={miraField} placeholder="Ana"
            />
          </div>
          <div>
            <label htmlFor="nu-apellidos" className={miraLabel}>Apellidos</label>
            <input
              id="nu-apellidos" type="text" value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={miraField} placeholder="Pérez García"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="nu-email" className={miraLabel}>
              Email <span className="text-red-500">*</span>
            </label>
            <input
              id="nu-email" type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off" className={miraField} placeholder="ana@empresa.com"
            />
            <p className="mt-1.5 text-xs text-slate-400">
              Aquí llegará la invitación para activar la cuenta.
            </p>
          </div>
          <div>
            <label htmlFor="nu-telefono" className={miraLabel}>Teléfono</label>
            <input
              id="nu-telefono" type="tel" value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={miraField} placeholder="+34 600 000 000"
            />
          </div>
        </div>
      </MiraSectionCard>

      {/* ── Acceso ───────────────────────────────────────────────────── */}
      <MiraSectionCard title="Acceso" icon={ShieldCheck} bodyClassName="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="nu-rol" className={miraLabel}>Rol de plataforma</label>
            <select
              id="nu-rol" value={platformRole}
              onChange={(e) => setPlatformRole(e.target.value as NewUserPlatformRole)}
              className={miraField}
            >
              {NEW_USER_PLATFORM_ROLES.map((r) => (
                <option key={r} value={r}>{NEW_USER_PLATFORM_ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={miraLabel}>Estado</label>
            {/* No es un desplegable: una cuenta que se acaba de invitar nace
                activa. Suspenderla antes de que exista no significa nada, y
                cambiarlo después tiene su propia acción en la ficha. */}
            <p className="rounded-xl border border-mira-line bg-mira-canvas px-3.5 py-2.5 text-sm text-slate-600">
              Activo
            </p>
          </div>
        </div>

        {/* Conceder el panel entero de MIRA no puede pasar sin que se lea. */}
        {platformRole === 'platform_admin' && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <strong>Administrador MIRA</strong> da acceso al panel completo: todos los clientes,
            todos los precios y la exportación de proveedores. Concédelo solo al equipo de MIRA.
          </p>
        )}

        <p className="text-xs text-slate-400">
          No se define ninguna contraseña: la establece la propia persona desde el enlace de la
          invitación.
        </p>
      </MiraSectionCard>

      {/* ── Organización ─────────────────────────────────────────────── */}
      <MiraSectionCard title="Organización" icon={Building2} bodyClassName="space-y-4 p-5">
        <div>
          <label htmlFor="nu-org" className={miraLabel}>Organización</label>
          <select
            id="nu-org" value={organizationId}
            onChange={(e) => cambiarOrganizacion(e.target.value)}
            className={miraField}
          >
            <option value={SIN_ORGANIZACION}>Sin organización</option>
            {asignables.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-slate-400">
            Opcional. Solo aparecen las organizaciones que admiten nuevos miembros.
          </p>
        </div>

        {seleccionada && (
          <>
            <div>
              <label htmlFor="nu-orgrol" className={miraLabel}>Rol en la organización</label>
              <select
                id="nu-orgrol" value={orgRole}
                onChange={(e) => setOrgRole(e.target.value as NewUserOrgRole)}
                className={miraField}
              >
                {NEW_USER_ORG_ROLES.map((r) => (
                  <option key={r} value={r}>{NEW_USER_ORG_ROLE_LABELS[r]}</option>
                ))}
              </select>
              {/* El propietario es único por empresa y no se puede degradar:
                  crearlo desde aquí abriría estados que ninguna pantalla sabe
                  deshacer. */}
              <p className="mt-1.5 text-xs text-slate-400">
                El propietario no se asigna desde aquí: se define al dar de alta la organización.
              </p>
            </div>

            <div>
              <label className={miraLabel}>Capacidades comerciales</label>
              <p className="mb-2 text-xs text-slate-400">
                Perfil de la organización: <strong>{commercialProfileLabel(perfil)}</strong>. Solo
                se pueden conceder las capacidades que ese perfil admite.
              </p>
              <div className="flex flex-wrap gap-3">
                <label
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${
                    permiteComprar
                      ? 'cursor-pointer border-mira-line bg-white text-mira-ink'
                      : 'cursor-not-allowed border-mira-line bg-mira-canvas text-slate-400'
                  }`}
                >
                  <input
                    type="checkbox" checked={canBuy && permiteComprar} disabled={!permiteComprar}
                    onChange={(e) => setCanBuy(e.target.checked)}
                    className="h-4 w-4 accent-mira-magenta"
                  />
                  Puede comprar
                </label>
                <label
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${
                    permiteVender
                      ? 'cursor-pointer border-mira-line bg-white text-mira-ink'
                      : 'cursor-not-allowed border-mira-line bg-mira-canvas text-slate-400'
                  }`}
                >
                  <input
                    type="checkbox" checked={canSell && permiteVender} disabled={!permiteVender}
                    onChange={(e) => setCanSell(e.target.checked)}
                    className="h-4 w-4 accent-mira-magenta"
                  />
                  Puede vender
                </label>
              </div>
            </div>
          </>
        )}
      </MiraSectionCard>

      {/* ── Resumen ──────────────────────────────────────────────────── */}
      <MiraSectionCard title="Al confirmar" icon={Info} bodyClassName="p-5">
        <ul className="space-y-1.5">
          {resumen.map((linea, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-mira-magenta" />
              {linea}
            </li>
          ))}
        </ul>

        {error && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button" onClick={enviar} disabled={!puedeEnviar}
            className={`${miraBtn.primary} disabled:opacity-40`}
          >
            {pending
              ? <><Loader2 size={14} className="animate-spin" /> Creando…</>
              : <><UserPlus size={14} /> Crear e invitar usuario</>}
          </button>
          <Link href="/admin/usuarios" className={miraBtn.ghost}>Cancelar</Link>
        </div>
      </MiraSectionCard>
    </div>
  )
}
