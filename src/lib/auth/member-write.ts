// Escritura canónica de pertenencias (Bloque 6B.3, fase 2).
//
// Módulo puro. Construye las filas de `organization_members` que la migración
// 023 acepta, y traduce sus errores a mensajes que se puedan enseñar.
//
// La migración impone que el modelo canónico y el legacy vayan siempre
// coherentes. Mientras exista la columna `role`, toda escritura debe fijar
// AMBOS valores de forma explícita; depender del default de `org_role` produce
// filas que el trigger rechaza.

/** Roles que la gestión administrativa ordinaria puede asignar. */
export type ManageableOrgRole = 'admin' | 'member'

const MANAGEABLE_ROLES: ManageableOrgRole[] = ['admin', 'member']

/**
 * Valor legacy que corresponde a cada rol asignable. `owner` no aparece: la
 * propiedad no se crea ni se transfiere desde estas acciones.
 */
const LEGACY_FOR: Record<ManageableOrgRole, string> = {
  admin: 'client_member',
  member: 'client_member',
}

/** Etiquetas visibles. La interfaz nunca muestra valores técnicos. */
export const MANAGEABLE_ROLE_LABELS: Record<ManageableOrgRole, string> = {
  admin: 'Administrador',
  member: 'Miembro',
}

/**
 * Normaliza el rol recibido de un formulario. Fail-closed: cualquier valor que
 * no sea exactamente `admin` o `member` devuelve `null`.
 *
 * Rechaza explícitamente `owner`, `client_owner` y `client_member`: los dos
 * primeros porque la propiedad no se gestiona aquí, el tercero porque es un
 * valor legacy que la interfaz ya no debe enviar.
 */
export function normalizeManageableRole(raw: unknown): ManageableOrgRole | null {
  if (typeof raw !== 'string') return null
  return MANAGEABLE_ROLES.find((r) => r === raw) ?? null
}

export interface MembershipInsert {
  organization_id: string
  user_id: string
  org_role: ManageableOrgRole
  role: string
  status: 'active'
  can_buy: boolean
  can_sell: boolean
  invited_by: string | null
}

/**
 * Fila completa para dar de alta a alguien.
 *
 * Escribe TODOS los campos de autorización de forma explícita. No se apoya en
 * ningún default: un default silencioso en una columna de permisos es una
 * decisión de seguridad que nadie ha tomado a conciencia.
 *
 * Las capacidades comerciales arrancan en `false`. Se conceden después, de
 * forma deliberada, y siempre limitadas por el perfil comercial de la
 * organización.
 */
export function buildMembershipInsert(params: {
  organizationId: string
  userId: string
  role: ManageableOrgRole
  invitedBy?: string | null
}): MembershipInsert {
  return {
    organization_id: params.organizationId,
    user_id: params.userId,
    org_role: params.role,
    role: LEGACY_FOR[params.role],
    status: 'active',
    can_buy: false,
    can_sell: false,
    invited_by: params.invitedBy ?? null,
  }
}

export interface MembershipRoleUpdate {
  org_role: ManageableOrgRole
  role: string
}

/** Cambio de rol: canónico y legacy SIEMPRE juntos, nunca por separado. */
export function buildMembershipRoleUpdate(role: ManageableOrgRole): MembershipRoleUpdate {
  return { org_role: role, role: LEGACY_FOR[role] }
}

// ── Traducción de errores ───────────────────────────────────────────────────

export interface DatabaseErrorLike {
  code?: string | null
  message?: string | null
}

const MENSAJE_GENERICO = 'No se ha podido completar la operación.'

/**
 * Traduce un error de la base de datos a un mensaje que se pueda enseñar.
 *
 * NUNCA devuelve SQLSTATE, nombres de constraint ni texto interno de
 * PostgreSQL: el detalle técnico se registra aparte, en el servidor.
 * Ante un error que no reconoce, devuelve un mensaje genérico en lugar de
 * arriesgarse a filtrar información.
 */
export function translateMembershipError(error: DatabaseErrorLike | null | undefined): string {
  if (!error) return MENSAJE_GENERICO

  const code = error.code ?? ''
  const texto = (error.message ?? '').toLowerCase()

  // Unicidad de propietario (índice parcial).
  if (code === '23505' && texto.includes('propietario')) {
    return 'La organización ya tiene un propietario.'
  }
  if (code === '23505') {
    return 'El usuario ya es miembro de esta organización.'
  }

  if (texto.includes('propia pertenencia')) {
    return 'No puedes modificar tu propia pertenencia desde esta acción.'
  }

  if (texto.includes('ya tiene un propietario')) {
    return 'La organización ya tiene un propietario.'
  }

  if (texto.includes('crear ni ascender a propietario')) {
    return 'No se puede crear otro propietario.'
  }

  if (
    texto.includes('degradar al propietario') ||
    texto.includes('eliminar al propietario') ||
    texto.includes('desactivar la pertenencia del propietario')
  ) {
    return 'El propietario no puede modificarse desde esta acción.'
  }

  if (texto.includes('escritura incoherente') || texto.includes('org_role no reconocido')) {
    return 'El rol seleccionado no es válido.'
  }

  if (texto.includes('identificadores estructurales')) {
    return 'No se pueden modificar los datos internos de una pertenencia.'
  }

  if (texto.includes('perfil comprador') || texto.includes('perfil vendedor')) {
    return 'La organización no admite esa capacidad comercial.'
  }

  if (texto.includes('solo el propietario')) {
    return 'Solo el propietario de la organización puede realizar este cambio.'
  }

  return MENSAJE_GENERICO
}

/**
 * Detalle técnico para el registro del servidor. Incluye el código y el mensaje
 * de PostgreSQL, que son diagnósticos, pero ningún dato personal.
 */
export function membershipErrorDetail(
  operacion: string,
  error: DatabaseErrorLike | null | undefined,
): string {
  return `[members] ${operacion} falló: ${error?.code ?? 'sin código'} ${error?.message ?? ''}`.trim()
}
