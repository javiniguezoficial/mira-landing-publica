// Catálogo de acciones auditables (Fase 039).
//
// Módulo PURO, separado del escritor para que un test pueda comprobar que la
// lista de TypeScript y el `check` de la migración 039 dicen exactamente lo
// mismo. Si divergen, el INSERT falla en producción con un error de
// restricción y la operación se queda sin registrar.

export const ADMIN_AUDIT_ACTIONS = [
  'membership.created',
  'membership.role_changed',
  'membership.status_changed',
  'membership.capabilities_changed',
  'membership.removed',
  'profile.updated',
  'profile.platform_role_changed',
  'profile.status_changed',
  /** 046 — cuenta creada e invitada desde el panel de administración. */
  'user.invited',
] as const

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number]

export function isAdminAuditAction(raw: unknown): raw is AdminAuditAction {
  return typeof raw === 'string' && (ADMIN_AUDIT_ACTIONS as readonly string[]).includes(raw)
}

/** Etiquetas visibles del histórico. La interfaz nunca muestra el valor técnico. */
export const ADMIN_AUDIT_ACTION_LABELS: Record<AdminAuditAction, string> = {
  'membership.created': 'Asignado a una organización',
  'user.invited': 'Cuenta creada e invitada',
  'membership.role_changed': 'Cambio de rol en la organización',
  'membership.status_changed': 'Cambio de estado de la pertenencia',
  'membership.capabilities_changed': 'Cambio de capacidades comerciales',
  'membership.removed': 'Retirado de la organización',
  'profile.updated': 'Datos del perfil actualizados',
  'profile.platform_role_changed': 'Cambio de rol de plataforma',
  'profile.status_changed': 'Cambio de estado del perfil',
}
