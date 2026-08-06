import { Search, X } from 'lucide-react'
import Link from 'next/link'
import {
  CAPABILITY_FILTERS,
  CAPABILITY_FILTER_LABELS,
  MEMBERSHIP_FILTERS,
  MEMBERSHIP_FILTER_LABELS,
  PROFILE_STATUS_FILTERS,
  USER_PARAM,
  hasActiveUserFilters,
  type UserListFilters,
} from '@/lib/users/list-params'
import type { AssignableOrganization } from '@/lib/actions/users'
import { statusLabel } from '@/lib/identity'
import { miraBtn, miraField } from '@/lib/miraButtons'

interface Props {
  filters: UserListFilters
  organizations: AssignableOrganization[]
}

const labelCls = 'mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400'

/**
 * Filtros del listado de usuarios (039).
 *
 * ── Por qué un `<form method="GET">` y no estado de cliente ─────────────────
 *
 * Porque los filtros acaban en la URL: una búsqueda se puede compartir con
 * alguien, marcarla o recargar sin perderla. Y porque el filtrado ocurre en
 * SERVIDOR: con estado de cliente habría que mandar al navegador la lista
 * completa de usuarios con sus organizaciones y capacidades, que es justo lo
 * que no debe salir de servidor sin necesidad.
 *
 * Es un Server Component: no lleva JavaScript propio.
 */
export function UsersFilterBar({ filters, organizations }: Props) {
  const hayFiltros = hasActiveUserFilters(filters)

  return (
    <form
      method="GET"
      action="/admin/usuarios"
      className="mira-card space-y-4 rounded-2xl p-4"
      // Al cambiar de filtros la página anterior deja de significar lo mismo.
      key={JSON.stringify(filters)}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="lg:col-span-3">
          <label className={labelCls} htmlFor="user-q">
            Buscar
          </label>
          <input
            id="user-q"
            name={USER_PARAM.search}
            defaultValue={filters.search}
            placeholder="Nombre, apellidos o email…"
            className={miraField}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="user-org">
            Organización
          </label>
          <select
            id="user-org"
            name={USER_PARAM.organization}
            defaultValue={filters.organizationId}
            className={miraField}
          >
            <option value="">Todas las organizaciones</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls} htmlFor="user-mem">
            Pertenencia
          </label>
          {/* El filtro que el cliente necesitaba primero: para asignar a alguien
              a una empresa hay que poder encontrar a quien no está en ninguna. */}
          <select
            id="user-mem"
            name={USER_PARAM.membership}
            defaultValue={filters.membership}
            className={miraField}
          >
            {MEMBERSHIP_FILTERS.map((m) => (
              <option key={m} value={m}>
                {MEMBERSHIP_FILTER_LABELS[m]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls} htmlFor="user-cap">
            Capacidad comercial
          </label>
          <select
            id="user-cap"
            name={USER_PARAM.capability}
            defaultValue={filters.capability}
            className={miraField}
          >
            {CAPABILITY_FILTERS.map((c) => (
              <option key={c} value={c}>
                {CAPABILITY_FILTER_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls} htmlFor="user-status">
            Estado del usuario
          </label>
          <select
            id="user-status"
            name={USER_PARAM.status}
            defaultValue={filters.status}
            className={miraField}
          >
            <option value="">Todos los estados</option>
            {PROFILE_STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls} htmlFor="user-role">
            Rol de plataforma
          </label>
          {/* Rol de PLATAFORMA, no de empresa. Son ejes distintos y no se
              mezclan en el mismo desplegable (ver `lib/auth/user-admin.ts`). */}
          <select
            id="user-role"
            name={USER_PARAM.role}
            defaultValue={filters.role}
            className={miraField}
          >
            <option value="">Todos los roles</option>
            <option value="platform_admin">Administrador MIRA</option>
            <option value="user">Usuario</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button type="submit" className={miraBtn.primary}>
          <Search size={14} /> Buscar
        </button>
        {hayFiltros && (
          <Link href="/admin/usuarios" className={miraBtn.ghost}>
            <X size={14} /> Limpiar
          </Link>
        )}
      </div>
    </form>
  )
}
