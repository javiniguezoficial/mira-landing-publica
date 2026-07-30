// Disponibilidad de un mercado (Fase 2.1 y 2.2).
//
// Módulo puro. Existe para que TRES conceptos distintos no vuelvan a mezclarse
// en ningún componente:
//
//   1. MÓDULO `markets`     — ¿tiene la organización contratado Market
//                             Intelligence? Es 1.4. Vive en
//                             `organizations.modules` y se evalúa con
//                             `evaluateOrganizationModule`.
//   2. MERCADO PERMITIDO    — teniendo el módulo, ¿puede esta organización ver
//                             ESTE mercado concreto? Es 2.2. Vive en
//                             `organization_disabled_markets`.
//   3. MERCADO FAVORITO     — ¿lo ha marcado ESTA PERSONA? Es 2.1. Vive en
//                             `user_market_favorites`. No concede acceso: es
//                             una preferencia de presentación.
//
// La jerarquía no es negociable y va en este orden: sin módulo no hay nada que
// mirar; con módulo pero mercado deshabilitado, el mercado no existe para esa
// organización; y un favorito NUNCA levanta ninguna de las dos anteriores. Un
// favorito que apunta a un mercado deshabilitado se conserva en la base de
// datos y deja de mostrarse, para que reaparezca intacto si se rehabilita.

/** Por qué no se puede ver un mercado. `null` = sí se puede. */
export type MarketAccessDenial =
  /** La organización no tiene contratado Market Intelligence (1.4). */
  | 'module-disabled'
  /** El módulo está activo, pero este mercado concreto está deshabilitado (2.2). */
  | 'market-disabled'

export interface MarketAccessInput {
  /** ¿Está activo el módulo `markets` para la organización? */
  moduleEnabled: boolean
  /** Identificadores de mercado deshabilitados para la organización. */
  disabledMarketIds: ReadonlySet<string> | readonly string[]
}

function asSet(ids: ReadonlySet<string> | readonly string[]): ReadonlySet<string> {
  return ids instanceof Set ? ids : new Set(ids)
}

/**
 * ¿Puede la organización ver este mercado?
 *
 * El módulo se comprueba PRIMERO: si Market Intelligence está apagado, el
 * motivo correcto es `module-disabled` aunque además el mercado estuviera
 * deshabilitado. Es el hecho dominante y el que lleva al mensaje útil.
 */
export function evaluateMarketAccess(
  marketId: string,
  input: MarketAccessInput,
): MarketAccessDenial | null {
  if (!input.moduleEnabled) return 'module-disabled'
  return asSet(input.disabledMarketIds).has(marketId) ? 'market-disabled' : null
}

export function isMarketVisible(marketId: string, input: MarketAccessInput): boolean {
  return evaluateMarketAccess(marketId, input) === null
}

/**
 * Filtra una lista de cosas que tienen `id` de mercado.
 *
 * Con el módulo apagado devuelve la lista VACÍA, no la original: es la misma
 * decisión que `evaluateMarketAccess`, aplicada en bloque.
 */
export function filterVisibleMarkets<T extends { id: string }>(
  markets: readonly T[],
  input: MarketAccessInput,
): T[] {
  if (!input.moduleEnabled) return []
  const disabled = asSet(input.disabledMarketIds)
  return markets.filter((m) => !disabled.has(m.id))
}

/**
 * Favoritos que hoy se pueden mostrar.
 *
 * Devuelve un subconjunto; NO modifica la lista original ni sugiere borrar
 * nada. El favorito es del usuario y sobrevive a que su organización pierda
 * acceso al mercado — que es temporal y reversible.
 */
export function visibleFavoriteMarketIds(
  favoriteMarketIds: readonly string[],
  input: MarketAccessInput,
): string[] {
  if (!input.moduleEnabled) return []
  const disabled = asSet(input.disabledMarketIds)
  return favoriteMarketIds.filter((id) => !disabled.has(id))
}

// ── Textos ──────────────────────────────────────────────────────────────────
//
// El mensaje de `module-disabled` NO vive aquí: lo da `MODULE_DISABLED_COPY`
// de 1.4, y duplicarlo permitiría que las dos versiones se separaran.

export const MARKET_DISABLED_COPY = {
  title: 'Mercado no disponible',
  description:
    'Este mercado no está disponible para tu organización. ' +
    'Contacta con el administrador de la plataforma si necesitas acceder a él.',
} as const

/** Estado vacío del bloque de favoritos, cuando la persona no ha marcado ninguno. */
export const NO_FAVORITES_COPY = {
  title: 'Todavía no tienes mercados favoritos',
  description:
    'Marca la estrella de un mercado en Market Intelligence para tenerlo aquí a mano.',
} as const
