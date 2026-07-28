// Errores de autorización de MIRA (Bloque 6B.1).
//
// Módulo puro: no importa Next ni Supabase, para que la traducción de un fallo
// de autorización a la respuesta de cada superficie sea testeable sin red.
//
// La DECISIÓN de autorizar está centralizada (ver `policy.ts`), pero la
// RESPUESTA no: una página redirige, un Server Action devuelve o lanza, y un
// Route Handler responde JSON. Forzar un único comportamiento rompería alguna
// de las tres.

/**
 * Motivo por el que se deniega el acceso.
 *
 * En 6B.1 solo se emiten de forma efectiva `UNAUTHENTICATED`, `FORBIDDEN`,
 * `NO_ORGANIZATION` e `INVALID_ROLE`. Los estados de perfil/organización y las
 * capacidades comerciales se evalúan (ver `policy.ts`) pero todavía NO se
 * aplican como restricción: eso corresponde a 6B.2, 6B.4 y 6B.5.
 */
export type AuthorizationCode =
  /** No hay sesión. */
  | 'UNAUTHENTICATED'
  /** Hay sesión, pero el usuario no tiene permiso sobre el recurso. */
  | 'FORBIDDEN'
  /** El usuario no tiene ninguna pertenencia utilizable. */
  | 'NO_ORGANIZATION'
  /** El rol almacenado no se reconoce. Fail-closed: se deniega. */
  | 'INVALID_ROLE'

const DEFAULT_MESSAGES: Record<AuthorizationCode, string> = {
  UNAUTHENTICATED: 'Debes iniciar sesión.',
  FORBIDDEN: 'No tienes permiso de administrador',
  NO_ORGANIZATION: 'No tienes una organización asignada.',
  INVALID_ROLE: 'Tu rol no permite realizar esta acción.',
}

export class AuthorizationError extends Error {
  readonly code: AuthorizationCode

  constructor(code: AuthorizationCode, message?: string) {
    super(message ?? DEFAULT_MESSAGES[code])
    this.name = 'AuthorizationError'
    this.code = code
    // Mantiene `instanceof` operativo al compilar a ES5/ES2015 con TS.
    Object.setPrototypeOf(this, AuthorizationError.prototype)
  }
}

export function isAuthorizationError(error: unknown): error is AuthorizationError {
  return error instanceof AuthorizationError
}

/**
 * Código HTTP para un Route Handler. 401 significa "no sé quién eres";
 * 403, "sé quién eres y no te corresponde".
 */
export function authorizationHttpStatus(code: AuthorizationCode): 401 | 403 {
  return code === 'UNAUTHENTICATED' ? 401 : 403
}

/**
 * Mensaje que devuelve la API. Se mantienen literalmente los textos que ya
 * emitían los Route Handlers antes de 6B.1, para no cambiar el contrato.
 */
export function authorizationApiMessage(code: AuthorizationCode): string {
  return code === 'UNAUTHENTICATED' ? 'No autorizado' : 'Acceso denegado'
}
