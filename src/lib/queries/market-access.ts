import { loadAuthContext } from '@/lib/auth/context'
import { resolveFallbackMembership } from '@/lib/auth/membership'
import { isOrganizationModuleEnabled } from '@/lib/auth/modules'
import type { MarketAccessInput } from '@/lib/markets/access'

/**
 * Contexto de Market Intelligence para quien hace la petición (2.1 y 2.2).
 *
 * SOLO SERVIDOR. Reúne en UNA carga los tres ejes que antes habrían obligado a
 * consultar tres veces:
 *
 *   · `moduleEnabled`     — módulo `markets` de la organización (1.4). Ya viaja
 *                           dentro de `AuthMembership`, así que no cuesta nada.
 *   · `disabledMarketIds` — mercados que la organización tiene deshabilitados.
 *   · `favoriteMarketIds` — favoritos de ESTA persona.
 *
 * Las dos consultas que sí hacen falta salen EN PARALELO, y ninguna se repite
 * por componente: la página la llama una vez y pasa el resultado hacia abajo.
 * Es lo que evita el N+1 clásico de «cada tarjeta de mercado pregunta si es
 * favorita».
 *
 * Ambas van por el cliente NORMAL, sujeto a RLS. `user_market_favorites` solo
 * devuelve los del propio usuario porque su policy es `user_id = auth.uid()`;
 * no hace falta filtrar aquí, pero se filtra igualmente por claridad y para no
 * depender solo de la base de datos.
 */
export interface MarketAccessContext extends MarketAccessInput {
  moduleEnabled: boolean
  disabledMarketIds: Set<string>
  favoriteMarketIds: Set<string>
  /** `null` si no hay sesión o la persona no tiene pertenencia utilizable. */
  organizationId: string | null
  userId: string | null
}

const EMPTY: MarketAccessContext = {
  moduleEnabled: false,
  disabledMarketIds: new Set(),
  favoriteMarketIds: new Set(),
  organizationId: null,
  userId: null,
}

export async function getMarketAccessContext(): Promise<MarketAccessContext> {
  const { supabase, context } = await loadAuthContext()
  if (!context) return { ...EMPTY, disabledMarketIds: new Set(), favoriteMarketIds: new Set() }

  const membership = resolveFallbackMembership(context.memberships)

  // Sin pertenencia no hay organización que restrinja nada —un `platform_admin`
  // sin empresa, por ejemplo—, pero sí puede tener favoritos propios.
  const moduleEnabled = membership
    ? isOrganizationModuleEnabled(membership.modules, 'markets')
    : true

  const [disabled, favorites] = await Promise.all([
    membership
      ? supabase
          .from('organization_disabled_markets')
          .select('market_id')
          .eq('organization_id', membership.organizationId)
      : Promise.resolve({ data: [] as { market_id: string }[] }),
    supabase
      .from('user_market_favorites')
      .select('market_id')
      .eq('user_id', context.user.id),
  ])

  return {
    moduleEnabled,
    disabledMarketIds: new Set((disabled.data ?? []).map((r) => r.market_id)),
    favoriteMarketIds: new Set((favorites.data ?? []).map((r) => r.market_id)),
    organizationId: membership?.organizationId ?? null,
    userId: context.user.id,
  }
}

/**
 * Solo los identificadores de mercado deshabilitados. Para las superficies que
 * no necesitan favoritos y así se ahorran esa consulta.
 */
export async function getDisabledMarketIds(): Promise<Set<string>> {
  const { supabase, context } = await loadAuthContext()
  if (!context) return new Set()

  const membership = resolveFallbackMembership(context.memberships)
  if (!membership) return new Set()

  const { data } = await supabase
    .from('organization_disabled_markets')
    .select('market_id')
    .eq('organization_id', membership.organizationId)

  return new Set((data ?? []).map((r) => r.market_id))
}

/**
 * Mercados deshabilitados de UNA organización concreta, para la ficha de
 * administración. Exige `platform_admin` por la policy `admin_all_disabled_markets`;
 * un miembro normal que llamara aquí con otra organización recibiría el
 * conjunto vacío, no los datos.
 */
export async function getDisabledMarketIdsForOrganization(
  organizationId: string,
): Promise<Set<string>> {
  const { supabase, context } = await loadAuthContext()
  if (!context) return new Set()

  const { data } = await supabase
    .from('organization_disabled_markets')
    .select('market_id')
    .eq('organization_id', organizationId)

  return new Set((data ?? []).map((r) => r.market_id))
}
