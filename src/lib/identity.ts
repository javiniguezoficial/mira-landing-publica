// Modelo canónico de identidad de MIRA (Bloque 6A).
//
// Separa tres ejes que en el modelo antiguo estaban mezclados:
//   1. Rol global de plataforma      → PlatformRole
//   2. Rol dentro de la organización → OrganizationRole
//   3. Capacidades comerciales       → can_buy / can_sell
//
// Módulo puro (sin Next ni Supabase) para que sea testeable: los archivos de
// `src/lib/actions/` llevan 'use server' y allí todo export debe ser async.
//
// Durante la transición conviven valores legacy en base de datos
// (`client_owner`, `client_member`). Los adaptadores de aquí los traducen; el
// resto de la aplicación solo debería razonar con los tipos canónicos.

// ── Tipos canónicos ─────────────────────────────────────────────────────────

/** Rol global. Decide el acceso a /admin. */
export type PlatformRole = 'platform_admin' | 'user'

/** Estado global del usuario. */
export type ProfileStatus = 'pending' | 'active' | 'suspended' | 'rejected'

/** Rol dentro de una organización concreta. */
export type OrganizationRole = 'owner' | 'admin' | 'member'

/** Estado de la organización. */
export type OrganizationStatus = 'pending' | 'active' | 'suspended' | 'rejected'

/** Qué puede hacer comercialmente la organización. Es el techo de sus miembros. */
export type CommercialProfile = 'buyer' | 'seller' | 'buyer_seller'

/** Estado de la pertenencia de un usuario a una organización. */
export type MembershipStatus = 'invited' | 'active' | 'suspended'

// Los valores `org_owner` / `org_admin` / `org_member` NO forman parte del
// modelo: nunca existieron en base de datos (el CHECK los habría rechazado) y
// eran restos de un diseño abandonado. Se tratan como desconocidos.

// ── Adaptadores del modelo legacy ───────────────────────────────────────────

/**
 * Traduce el valor almacenado en `organization_members` al rol canónico.
 * Devuelve null ante cualquier valor no reconocido — un valor desconocido
 * NUNCA debe conceder privilegios.
 */
export function normalizeOrganizationRole(
  raw: string | null | undefined,
): OrganizationRole | null {
  switch (raw) {
    case 'owner':
    case 'client_owner':   // legacy
      return 'owner'
    case 'admin':
      return 'admin'
    case 'member':
    case 'client_member':  // legacy
      return 'member'
    default:
      return null
  }
}

/**
 * Traduce el valor almacenado en `profiles.role` al rol global canónico.
 * Los valores legacy de cliente colapsan en 'user': la jerarquía de empresa
 * vive en `organization_members`, no en el perfil.
 */
export function normalizePlatformRole(
  raw: string | null | undefined,
): PlatformRole | null {
  switch (raw) {
    case 'platform_admin':
      return 'platform_admin'
    case 'user':
    case 'client_owner':   // legacy
    case 'client_member':  // legacy
      return 'user'
    default:
      return null
  }
}

// ── Comprobaciones de rol ───────────────────────────────────────────────────

/** Propietario en sentido estricto. */
export function isOwner(raw: string | null | undefined): boolean {
  return normalizeOrganizationRole(raw) === 'owner'
}

/**
 * Puede administrar la organización. Es jerárquico: el propietario puede todo
 * lo que puede un administrador.
 */
export function isOrgAdmin(raw: string | null | undefined): boolean {
  const role = normalizeOrganizationRole(raw)
  return role === 'owner' || role === 'admin'
}

/** Pertenece a la organización con algún rol válido. */
export function isOrgMember(raw: string | null | undefined): boolean {
  return normalizeOrganizationRole(raw) !== null
}

/** Administrador de plataforma. */
export function isPlatformAdmin(raw: string | null | undefined): boolean {
  return normalizePlatformRole(raw) === 'platform_admin'
}

// ── Capacidades comerciales ─────────────────────────────────────────────────

export interface MembershipCapabilities {
  can_buy?: boolean | null
  can_sell?: boolean | null
}

/** Solo `true` estricto concede la capacidad; null/undefined no. */
export function canBuy(m: MembershipCapabilities | null | undefined): boolean {
  return m?.can_buy === true
}

export function canSell(m: MembershipCapabilities | null | undefined): boolean {
  return m?.can_sell === true
}

// ── Etiquetas visibles ──────────────────────────────────────────────────────

const ORG_ROLE_LABELS: Record<OrganizationRole, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  member: 'Miembro',
}

const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  platform_admin: 'Administrador MIRA',
  user: 'Usuario',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  active: 'Activo',
  suspended: 'Suspendido',
  rejected: 'Rechazado',
  invited: 'Invitado',
}

const COMMERCIAL_PROFILE_LABELS: Record<CommercialProfile, string> = {
  buyer: 'Comprador',
  seller: 'Vendedor',
  buyer_seller: 'Comprador y vendedor',
}

/** Etiqueta del rol organizativo; '—' si el valor no se reconoce. */
export function organizationRoleLabel(raw: string | null | undefined): string {
  const role = normalizeOrganizationRole(raw)
  return role ? ORG_ROLE_LABELS[role] : '—'
}

export function platformRoleLabel(raw: string | null | undefined): string {
  const role = normalizePlatformRole(raw)
  return role ? PLATFORM_ROLE_LABELS[role] : '—'
}

export function statusLabel(raw: string | null | undefined): string {
  return raw ? (STATUS_LABELS[raw] ?? raw) : '—'
}

export function commercialProfileLabel(raw: string | null | undefined): string {
  return raw ? (COMMERCIAL_PROFILE_LABELS[raw as CommercialProfile] ?? raw) : '—'
}

/** Resumen legible de las capacidades de un miembro. */
export function capabilitiesLabel(m: MembershipCapabilities | null | undefined): string {
  const buy = canBuy(m)
  const sell = canSell(m)
  if (buy && sell) return 'Compra y vende'
  if (buy) return 'Compra'
  if (sell) return 'Vende'
  return 'Sin capacidades comerciales'
}

// ── Resolución de pertenencias ──────────────────────────────────────────────

/**
 * Añade a cada miembro su rol canónico resuelto, priorizando `org_role` y
 * cayendo al legacy `role` mientras dure la transición.
 *
 * Conserva el orden y NO filtra a nadie: el propietario es un miembro más de la
 * lista, así que aparece siempre en el recuento del equipo.
 */
export function resolveMemberRoles<T extends { org_role?: string | null; role?: string | null }>(
  members: T[] | null | undefined,
): Array<T & { orgRole: OrganizationRole | null }> {
  if (!Array.isArray(members)) return []
  return members
    .filter((m): m is T => m != null)
    .map((m) => ({ ...m, orgRole: normalizeOrganizationRole(m.org_role ?? m.role) }))
}

/**
 * Devuelve la pertenencia activa del usuario, o null si no pertenece a ninguna
 * organización.
 *
 * Un administrador de plataforma sin pertenencia explícita cae aquí: gestiona
 * clientes desde /admin y no se le inventa ninguna organización.
 */
export function resolveActiveMembership<T extends { organization_id?: string | null }>(
  memberships: T[] | null | undefined,
): T | null {
  if (!Array.isArray(memberships)) return null
  return memberships.find((m) => m != null && !!m.organization_id) ?? null
}

// ── Elección determinista de propietario ────────────────────────────────────

export interface ElectableMember {
  user_id: string
  joined_at: string
  /**
   * Rol global del perfil del miembro. Los administradores de plataforma solo
   * se eligen como último recurso — ver `pickOwnerUserId`.
   */
  platform_role?: string | null
}

/**
 * Reproduce en TypeScript el criterio de la migración 019. Prioridad:
 *
 *   1. Miembro cuyo perfil NO sea platform_admin. La propiedad de una empresa
 *      cliente es responsabilidad del cliente; asignarla a un administrador de
 *      MIRA mezclaría la identidad del proveedor de servicio con la del cliente.
 *   2. Entre los candidatos, el de `joined_at` más antiguo.
 *   3. Desempate estable por `user_id`, para que el resultado no dependa del
 *      orden de entrada.
 *   4. Fallback: si todos los miembros son platform_admin, se elige al más
 *      antiguo de ellos — una organización sin propietario es peor que una con
 *      un propietario interno provisional.
 *
 * Se usa para verificar y explicar la elección en la interfaz de administración;
 * la fuente de verdad sigue siendo la base de datos.
 */
export function pickOwnerUserId(
  members: ElectableMember[] | null | undefined,
): string | null {
  if (!Array.isArray(members) || members.length === 0) return null

  const validos = members.filter(
    (m) => m && typeof m.user_id === 'string' && typeof m.joined_at === 'string',
  )
  if (validos.length === 0) return null

  const porAntiguedad = (a: ElectableMember, b: ElectableMember) => {
    if (a.joined_at !== b.joined_at) return a.joined_at < b.joined_at ? -1 : 1
    return a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0
  }

  const esAdminPlataforma = (m: ElectableMember) =>
    normalizePlatformRole(m.platform_role) === 'platform_admin'

  const candidatos = validos.filter((m) => !esAdminPlataforma(m))
  const elegibles = candidatos.length > 0 ? candidatos : validos

  return [...elegibles].sort(porAntiguedad)[0].user_id
}
