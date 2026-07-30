import { loadAuthContext } from '@/lib/auth/context'
import { resolveFallbackMembership } from '@/lib/auth/membership'
import {
  DEFAULT_ORGANIZATION_MODULES,
  isOrganizationModuleEnabled,
  type OrganizationModuleName,
  type OrganizationModules,
} from '@/lib/auth/modules'

/**
 * Módulos de la organización con la que opera quien hace la petición (1.4).
 *
 * SOLO SERVIDOR. No hace ninguna consulta propia: los módulos ya viajan dentro
 * de `AuthMembership` porque `getAuthContext` los trae en el mismo embed de
 * `organizations` que ya cargaba el nombre, el estado y el perfil comercial.
 * Añadir una columna a una consulta que de todos modos ocurre no cuesta un
 * viaje más; una query separada por componente, sí.
 *
 * Sin pertenencia devuelve los DEFAULTS —todo activo—. Es el caso de un
 * `platform_admin` sin organización: no hay cliente al que aplicarle una
 * configuración comercial, así que no hay nada que restringir. Las superficies
 * de cliente exigen pertenencia por su cuenta, y la autoridad última sobre las
 * cotizaciones sigue siendo RLS.
 */
export async function getOrganizationModules(): Promise<OrganizationModules> {
  const { context } = await loadAuthContext()
  if (!context) return { ...DEFAULT_ORGANIZATION_MODULES }

  const membership = resolveFallbackMembership(context.memberships)
  if (!membership) return { ...DEFAULT_ORGANIZATION_MODULES }

  return membership.modules
}

/** Atajo para las superficies que solo preguntan por un módulo concreto. */
export async function isModuleEnabled(module: OrganizationModuleName): Promise<boolean> {
  return isOrganizationModuleEnabled(await getOrganizationModules(), module)
}
