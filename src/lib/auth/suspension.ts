// Qué puede hacer una cuenta SUSPENDIDA.
//
// Módulo PURO. Existe para que la respuesta a «¿a dónde puede entrar alguien
// suspendido?» esté escrita en UN sitio y la compartan el middleware —que corre
// en el Edge y no puede construir un `AuthContext`— y los guards del servidor.
//
// ═══════════════════════════════════════════════════════════════════════════
// EL HUECO QUE CIERRA
// ═══════════════════════════════════════════════════════════════════════════
//
// `profiles.status = 'suspended'` existía, la interfaz lo enseñaba y la acción
// de administración lo escribía. Pero, para un usuario NORMAL, no impedía nada:
//
//   · `evaluateActiveProfile()` estaba escrita y probada… y no la llamaba nadie
//     («preparada para bloques posteriores», decía su comentario);
//   · `requireSession()` solo comprueba que exista sesión;
//   · `requireMembership()` miraba el estado de la PERTENENCIA y el de la
//     ORGANIZACIÓN, nunca el del perfil;
//   · el middleware solo resolvía el rol, y solo para `/admin`;
//   · las funciones SQL (`is_org_member`, `can_buy_in_org`) tampoco miran
//     `profiles.status`.
//
// Resultado: suspender a alguien le ponía una etiqueta y le dejaba seguir
// usando `/app` con normalidad. Dos de las cuentas actuales estaban en ese
// estado.
//
// Un administrador suspendido SÍ quedaba fuera, porque `evaluatePlatformAdmin`
// sí llamaba a `evaluateActiveProfile`. La asimetría no era intencionada.
//
// ═══════════════════════════════════════════════════════════════════════════
// LA EXCEPCIÓN DE SOPORTE — DELIBERADA, NO SE TOCA
// ═══════════════════════════════════════════════════════════════════════════
//
// Hay una tensión real entre dos cosas que las dos son ciertas:
//
//   «un usuario suspendido no puede operar»
//   «un usuario suspendido tiene que poder preguntar por qué lo está»
//
// El proyecto ya había resuelto la segunda a propósito: `submitSupportTicket`
// usa `requireSession` y NUNCA `requireMembership`, y la policy de inserción se
// apoya en `belongs_to_org_any_status()`, cuyo comentario en base de datos dice
// literalmente: «Uso EXCLUSIVO del canal de soporte, para que un usuario
// suspendido pueda reclamar. No usar en ninguna otra policy.»
//
// Cerrar el hueco sin respetar eso dejaría a las personas suspendidas sin
// forma de reclamar — que es peor que el hueco. Por eso la suspensión se
// impone en `requireMembership` y en la navegación, y NO en `requireSession`:
// el canal de soporte pasa por ahí y sigue abierto.

/** Rutas que una cuenta suspendida SÍ puede seguir abriendo dentro de `/app`. */
export const SUSPENDED_ALLOWED_PATHS = ['/app/ayuda'] as const

/**
 * ¿Puede una cuenta suspendida abrir esta ruta?
 *
 * Compara por prefijo de SEGMENTO, no por `startsWith` a secas: `/app/ayudante`
 * no debe colarse por empezar igual que `/app/ayuda`.
 */
export function suspendedMayVisit(pathname: string): boolean {
  return SUSPENDED_ALLOWED_PATHS.some(
    (permitida) => pathname === permitida || pathname.startsWith(`${permitida}/`),
  )
}

/**
 * ¿Hay que sacar a esta persona de donde está?
 *
 * `status` llega ya normalizado. Un estado desconocido o ausente cuenta como
 * NO activo: fail-closed, igual que el resto de la cadena de autorización.
 */
export function shouldBlockSuspended(
  status: string | null | undefined,
  pathname: string,
): boolean {
  if (status === 'active') return false
  return !suspendedMayVisit(pathname)
}

/** Dónde aterriza quien queda bloqueado. */
export const SUSPENDED_REDIRECT_PATH = '/app/ayuda'

export const SUSPENDED_NOTICE =
  'Tu cuenta está suspendida. Puedes escribirnos desde aquí para saber por qué.'
