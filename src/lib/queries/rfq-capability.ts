import { loadAuthContext } from '@/lib/auth/context'
import { resolveFallbackMembership } from '@/lib/auth/membership'
import {
  evaluateCommercialAction,
  evaluateOrganizationAccess,
  evaluateOrganizationModule,
} from '@/lib/auth/policy'

/**
 * Qué puede hacer con cotizaciones la persona que hace la petición.
 *
 * Son TRES ejes distintos y no se deben confundir. Desde 1.4 el tercero es el
 * módulo, y por eso se expone por separado en lugar de fundirse en los otros
 * dos: la interfaz necesita distinguir «no puedes» de «tu empresa no lo tiene».
 *
 *   · `moduleEnabled` — espejo de `org_module_enabled(org, 'quotes')`. Es una
 *                       propiedad de la ORGANIZACIÓN. Cuando es `false`, RLS
 *                       vacía el listado y rechaza toda escritura, así que
 *                       `canRead` y `canCreate` son `false` por construcción.
 *   · `canRead`       — espejo de `is_org_member()`, el `USING` de
 *                       `org_member_select_rfqs`. Sin él la consulta devolvería
 *                       cero filas, así que la pantalla no debe ofrecer
 *                       histórico.
 *   · `canCreate`     — espejo de `can_buy_in_org()` más el estado del perfil.
 *
 * Un miembro activo SIN `can_buy` tiene `canRead` y no `canCreate`: ve lo que
 * su empresa ya solicitó, pero no crea nada. Una pertenencia u organización
 * suspendida no tiene ninguna de las dos. Y con el módulo apagado no tiene
 * ninguna aunque conserve `can_buy` y sea propietaria.
 */
export interface RfqAccess {
  canRead: boolean
  canCreate: boolean
  moduleEnabled: boolean
}

export async function getRfqAccess(): Promise<RfqAccess> {
  const { context } = await loadAuthContext()
  if (!context) return { canRead: false, canCreate: false, moduleEnabled: false }

  const membership = resolveFallbackMembership(context.memberships)
  const moduleEnabled = evaluateOrganizationModule(membership, 'quotes') === null

  return {
    moduleEnabled,
    canRead: moduleEnabled && evaluateOrganizationAccess(membership) === null,
    canCreate: moduleEnabled && evaluateCommercialAction(context, membership, 'buy') === null,
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
