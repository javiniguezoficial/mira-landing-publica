import { loadAuthContext } from '@/lib/auth/context'
import { resolveFallbackMembership } from '@/lib/auth/membership'
import { evaluateRfqCreation } from '@/lib/auth/rfq'

/**
 * ¿Puede la persona que hace la petición crear cotizaciones?
 *
 * Se consulta desde las páginas Server para decidir si mostrar «Nueva RFQ» y
 * para cortar el acceso directo a `/app/rfqs/nueva`. Ocultar el botón no basta:
 * la URL se puede escribir a mano, así que la página también comprueba.
 */
export async function canCreateRfq(): Promise<boolean> {
  const { context } = await loadAuthContext()
  if (!context) return false
  return evaluateRfqCreation(resolveFallbackMembership(context.memberships)) === null
}
