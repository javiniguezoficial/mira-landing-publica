// Textos del bloque de asignación a organizaciones (ajuste de UX tras Fase 2).
//
// Módulo PURO. Existe para que la decisión —qué título toca, cuándo hay que
// avisar— sea comprobable con tests de verdad en lugar de comparar cadenas
// dentro del JSX, y para que la página y el formulario no puedan decir cosas
// distintas sobre la misma acción.
//
// ── El problema que se corrige ──────────────────────────────────────────────
//
// En las pruebas manuales el bloque se leía como «aquí se gestiona a qué
// organización pertenece esta persona». No es eso: SIEMPRE crea una pertenencia
// NUEVA. Con un usuario que ya pertenecía a una empresa, el título «Asignar a
// una organización» invitaba a usarlo para cambiarlo de sitio —que es lo que se
// hace arriba, en «Organizaciones y permisos»— y lo que ocurría era que se le
// añadía una segunda.

import type { AssignableOrgRole } from '@/lib/auth/user-admin'

/** Nombre del bloque de arriba, donde SÍ se editan las pertenencias actuales. */
export const CURRENT_MEMBERSHIPS_SECTION = 'Organizaciones y permisos'

/**
 * Título del bloque, según si la persona ya pertenece a alguna organización.
 *
 * Con cero pertenencias, «Asignar» es exacto: no hay nada que añadir a nada.
 * Con una o más, «Añadir a otra» dice las dos cosas que hacían falta — que se
 * suma, y que no sustituye.
 */
export function assignmentSectionTitle(membershipCount: number): string {
  return membershipCount > 0 ? 'Añadir a otra organización' : 'Asignar a una organización'
}

/**
 * Texto aclaratorio bajo el título.
 *
 * Cuando ya hay pertenencias, dice de forma explícita dónde se editan las
 * actuales. Sin esa frase, la única pista era el orden de los bloques en la
 * página, que no es una pista.
 */
export function assignmentSectionHelp(membershipCount: number): string {
  if (membershipCount > 0) {
    return (
      `Este selector crea una pertenencia NUEVA: no modifica las que ya tiene. ` +
      `Para cambiar el rol, el estado o las capacidades de una organización en la ` +
      `que ya está, usa «${CURRENT_MEMBERSHIPS_SECTION}», más arriba.`
    )
  }
  return (
    'Añade a esta persona a una empresa existente. No crea cuentas ni envía invitaciones.'
  )
}

// ── Advertencia de propiedad ────────────────────────────────────────────────

/**
 * Aviso que se enseña ANTES de confirmar un alta como propietario.
 *
 * Lo pide el propio recorrido de las pruebas: conceder la propiedad es la única
 * asignación que el panel no puede deshacer después, porque retirar o degradar
 * al único propietario dejaría la organización sin ninguno. Quien lo concede
 * tiene que saberlo antes, no descubrirlo al intentar revertirlo.
 */
export const OWNER_ASSIGNMENT_WARNING =
  'Esta persona se convertirá en propietaria de la organización. Mientras sea la ' +
  'única propietaria, no podrá degradarse, desactivarse ni retirarse hasta ' +
  'transferir la propiedad.'

/** Texto de la casilla que hay que marcar para poder confirmar. */
export const OWNER_ASSIGNMENT_ACKNOWLEDGEMENT =
  'Entiendo que esta asignación no se puede deshacer desde el panel.'

/**
 * ¿Hace falta la confirmación reforzada?
 *
 * SOLO para `owner`. Pedirla también en `admin` o `member` la convertiría en un
 * trámite que se marca sin leer, y entonces dejaría de proteger el caso que
 * importa.
 *
 * NO cambia ninguna protección: el rol `owner` sigue ofreciéndose únicamente
 * cuando la organización no tiene propietario, y el trigger de 023 sigue siendo
 * quien lo impone. Esto solo añade una advertencia antes de pulsar.
 */
export function requiresOwnerConfirmation(role: AssignableOrgRole): boolean {
  return role === 'owner'
}
