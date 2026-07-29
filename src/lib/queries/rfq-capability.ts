import { loadAuthContext } from '@/lib/auth/context'
import { resolveFallbackMembership } from '@/lib/auth/membership'
import { evaluateCommercialAction, evaluateOrganizationAccess } from '@/lib/auth/policy'

/**
 * Qué puede hacer con cotizaciones la persona que hace la petición.
 *
 * Son DOS decisiones distintas y no se deben confundir:
 *
 *   · `canRead`   — espejo de `is_org_member()`, que es el `USING` de
 *                   `org_member_select_rfqs`. Sin él la consulta devolvería
 *                   cero filas, así que la pantalla no debe ofrecer histórico.
 *   · `canCreate` — espejo de `can_buy_in_org()` más el estado del perfil.
 *
 * Un miembro activo SIN `can_buy` tiene `canRead` y no `canCreate`: ve lo que
 * su empresa ya solicitó, pero no crea nada. Una pertenencia u organización
 * suspendida no tiene ninguna de las dos.
 */
export interface RfqAccess {
  canRead: boolean
  canCreate: boolean
}

export async function getRfqAccess(): Promise<RfqAccess> {
  const { context } = await loadAuthContext()
  if (!context) return { canRead: false, canCreate: false }

  const membership = resolveFallbackMembership(context.memberships)

  return {
    canRead: evaluateOrganizationAccess(membership) === null,
    canCreate: evaluateCommercialAction(context, membership, 'buy') === null,
  }
}

/**
 * ¿Puede crear cotizaciones? Atajo para las superficies que solo necesitan esa
 * respuesta. Ocultar el botón no basta: la URL se puede escribir a mano, así
 * que la página `/app/rfqs/nueva` también comprueba, y la Server Action vuelve
 * a comprobar por si la suspensión llega con el formulario ya abierto.
 */
export async function canCreateRfq(): Promise<boolean> {
  return (await getRfqAccess()).canCreate
}
