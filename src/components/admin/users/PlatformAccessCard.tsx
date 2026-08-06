'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, ShieldAlert } from 'lucide-react'
import { setUserPlatformRole, setUserProfileStatus } from '@/lib/actions/user-admin'
import { platformRoleLabel, statusLabel } from '@/lib/identity'
import { miraBtn } from '@/lib/miraButtons'
import type { AdminUserRow } from '@/lib/actions/users'

interface Props {
  user: AdminUserRow
  isSelf: boolean
  /** Administradores de plataforma ACTIVOS, incluido este usuario. */
  activeAdminCount: number
}

/**
 * Acceso de PLATAFORMA: rol global y estado del usuario (039).
 *
 * ── Por qué esto vive en su propia tarjeta ──────────────────────────────────
 *
 * Porque `platform_admin` no es un rol de empresa. Da acceso al panel de MIRA:
 * a TODOS los clientes, a todos los precios y a la exportación de proveedores.
 * Ofrecerlo en el mismo desplegable que «Miembro» o «Administrador» de una
 * organización hace inevitable concederlo por error algún día.
 *
 * Por eso no es un `select` que se aplica al cambiar, sino un botón con
 * confirmación escrita que dice lo que va a pasar.
 *
 * ── Protecciones, y dónde vive cada una ─────────────────────────────────────
 *
 *   nadie cambia su propio rol       → acción + esta interfaz
 *   nadie degrada al último admin    → acción + trigger de 039 (autoridad)
 *   solo un admin puede ejecutarlo   → `requirePlatformAdmin` + trigger de 021
 *
 * La interfaz solo ADELANTA la denegación; no es la barrera.
 */
export function PlatformAccessCard({ user, isSelf, activeAdminCount }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const esAdmin = user.platformRole === 'platform_admin'
  const estaActivo = user.status === 'active'
  const esUltimoAdmin = esAdmin && estaActivo && activeAdminCount <= 1

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

  function cambiarRol() {
    const nuevo = esAdmin ? 'user' : 'platform_admin'
    const aviso = esAdmin
      ? `Vas a RETIRAR el acceso de administrador de plataforma a ${nombre(user)}.\n\n` +
        'Dejará de ver el panel de MIRA, todos los clientes y la exportación de proveedores.\n\n¿Continuar?'
      : `Vas a CONCEDER acceso de administrador de plataforma a ${nombre(user)}.\n\n` +
        'Podrá ver y gestionar TODAS las organizaciones, todos los precios, todos los usuarios\n' +
        'y descargar el listado completo de proveedores.\n\n¿Continuar?'

    if (!confirm(aviso)) return
    ejecutar(
      () => setUserPlatformRole(user.id, nuevo),
      esAdmin ? 'Acceso de administrador retirado.' : 'Acceso de administrador concedido.',
    )
  }

  function cambiarEstado() {
    const nuevo = estaActivo ? 'suspended' : 'active'
    const aviso = estaActivo
      ? `Vas a SUSPENDER a ${nombre(user)}.\n\nNo podrá acceder a la plataforma hasta que se reactive.\n\n¿Continuar?`
      : `Vas a REACTIVAR a ${nombre(user)}.\n\nRecuperará el acceso con los permisos que ya tenía.\n\n¿Continuar?`

    if (!confirm(aviso)) return
    ejecutar(
      () => setUserProfileStatus(user.id, nuevo),
      estaActivo ? 'Usuario suspendido.' : 'Usuario reactivado.',
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-mira-line p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Rol de plataforma
          </p>
          <p className="mt-1 text-sm font-bold text-mira-ink">
            {platformRoleLabel(user.platformRole)}
          </p>
        </div>
        <div className="rounded-xl border border-mira-line p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Estado del usuario
          </p>
          <p className="mt-1 text-sm font-bold text-mira-ink">{statusLabel(user.status)}</p>
        </div>
      </div>

      {isSelf ? (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          Es tu propia cuenta. No puedes cambiar tu rol de plataforma ni tu estado:
          pídeselo a otro administrador para que el cambio quede visto por dos personas.
        </p>
      ) : (
        <>
          {esUltimoAdmin && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              Es el ÚNICO administrador de plataforma activo. No se puede degradar ni
              suspender: nadie podría volver a entrar en el panel.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={cambiarRol}
              disabled={pending || esUltimoAdmin}
              className={`${esAdmin ? miraBtn.ghost : miraBtn.primary} disabled:opacity-40`}
            >
              {pending ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
              {esAdmin ? 'Retirar administrador de plataforma' : 'Hacer administrador de plataforma'}
            </button>

            <button
              type="button"
              onClick={cambiarEstado}
              disabled={pending || esUltimoAdmin}
              className={`${miraBtn.ghost} disabled:opacity-40`}
            >
              {estaActivo ? 'Suspender usuario' : 'Reactivar usuario'}
            </button>

            {ok && <span className="text-xs font-semibold text-emerald-600">{ok}</span>}
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

function nombre(u: AdminUserRow): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || 'este usuario'
}
