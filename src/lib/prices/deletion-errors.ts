// Qué se le enseña al administrador cuando falla la confirmación de un borrado
// de precios (hotfix).
//
// Módulo PURO, y separado de `actions/price-deletions.ts` por dos motivos:
//
//   · aquel archivo es `'use server'`, y en Next.js TODO lo que se exporta de
//     un módulo así tiene que ser una función asíncrona — sería un endpoint
//     invocable desde el navegador. Una función síncrona ahí rompe el build;
//   · así se puede probar exhaustivamente sin arrastrar Supabase ni Next.
//
// ═══════════════════════════════════════════════════════════════════════════
// EL FALLO QUE CORRIGE
// ═══════════════════════════════════════════════════════════════════════════
//
// La acción devolvía `error.message` tal cual, así que el cliente vio en
// pantalla, sobre el formulario de confirmación:
//
//   canceling statement due to statement timeout
//
// Es texto interno del motor. No dice qué ha pasado, no dice si se ha borrado
// algo a medias —no: la RPC es una única transacción, al cancelarse no queda
// nada— y no dice qué hacer. Es además la misma norma que ya sigue el resto
// del proyecto: el detalle técnico se registra en servidor y a la persona se le
// da un mensaje que pueda entender.

/**
 * SQLSTATEs que `apply_price_deletion` levanta A PROPÓSITO.
 *
 * Sus mensajes están redactados para que los lea un administrador —«el lote
 * declara 682 precios y solo hay 680 copias»— y son justamente lo que hay que
 * enseñar: dicen qué ha pasado y qué hacer. Se dejan pasar tal cual.
 *
 *   42501  no es platform_admin
 *   P0002  el lote no existe
 *   22023  el lote ya no está en `ready` (por ejemplo, un doble clic)
 *   23514  copias de seguridad incompletas o sin los campos necesarios
 */
export const SQLSTATES_CON_MENSAJE_PROPIO = new Set(['42501', 'P0002', '22023', '23514'])

/** `query_canceled`: lo que devuelve PostgreSQL al agotar `statement_timeout`. */
export const SQLSTATE_TIMEOUT = '57014'

/** Mensaje por defecto: no filtra absolutamente nada del motor. */
export const MENSAJE_GENERICO =
  'No se ha podido completar el borrado. Inténtalo de nuevo en unos minutos.'

/**
 * Se filtra por CÓDIGO y no por texto a propósito: los mensajes del motor
 * cambian entre versiones de PostgreSQL y se traducen según la configuración
 * del servidor, así que comparar cadenas sería frágil en las dos direcciones.
 */
export function mensajeDeConfirmacion(
  code: string | null | undefined,
  message: string | null | undefined,
): string {
  if (code && SQLSTATES_CON_MENSAJE_PROPIO.has(code) && message) return message

  if (code === SQLSTATE_TIMEOUT) {
    return (
      'La operación ha tardado demasiado y se ha cancelado. No se ha borrado ningún precio ' +
      'y la operación sigue disponible para volver a confirmarla. Si se repite, acota los ' +
      'filtros para eliminar menos precios de una vez.'
    )
  }

  return MENSAJE_GENERICO
}
