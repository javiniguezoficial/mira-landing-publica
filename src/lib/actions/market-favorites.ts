'use server'

import { revalidatePath } from 'next/cache'
import { requireSession } from '@/lib/auth/guards'
import { isAuthorizationError } from '@/lib/auth/errors'

export interface FavoriteActionResult {
  /** Estado en el que ha quedado el mercado tras la operación. */
  isFavorite?: boolean
  error?: string
}

const MESSAGES = {
  sesion: 'Debes iniciar sesión para gestionar tus favoritos.',
  mercado: 'No se ha indicado el mercado.',
  generico: 'No se ha podido actualizar el favorito. Inténtalo de nuevo.',
  noDisponible:
    'Este mercado no está disponible para tu organización, así que no puede marcarse como favorito.',
} as const

/**
 * Marca o desmarca un mercado como favorito de QUIEN HACE LA PETICIÓN (2.1).
 *
 * ── Por qué el `user_id` no es un parámetro ─────────────────────────────────
 *
 * Se toma SIEMPRE de la sesión, nunca de la llamada. Aunque alguien invocara
 * esta Server Action a mano, no hay ningún hueco por donde pasar el
 * identificador de otra persona. Y aunque lo hubiera, las policies de
 * `user_market_favorites` son `user_id = auth.uid()` en las tres operaciones,
 * así que la base de datos rechazaría la fila igualmente.
 *
 * ── Idempotencia ────────────────────────────────────────────────────────────
 *
 * El INSERT lleva `on_conflict` sobre el índice único `(user_id, market_id)`,
 * así que dos clics seguidos —o dos pestañas abiertas— no crean dos filas ni
 * devuelven un error de duplicado. Se resuelve en la base de datos y no
 * comprobando antes con un SELECT, que dejaría una ventana de carrera entre la
 * comprobación y la escritura.
 *
 * ── Por qué se comprueba la visibilidad al AÑADIR ───────────────────────────
 *
 * No se puede marcar como favorito un mercado que la organización tiene
 * deshabilitado: sería marcar algo que no se puede ver. La comprobación se hace
 * leyendo el mercado con el cliente normal — si RLS no lo devuelve, no está
 * disponible. Quitar un favorito NO comprueba nada: si el mercado se
 * deshabilitó después, la persona debe poder retirarlo igualmente.
 */
export async function toggleMarketFavorite(
  marketId: string,
  makeFavorite: boolean,
): Promise<FavoriteActionResult> {
  if (!marketId?.trim()) return { error: MESSAGES.mercado }

  let sesion
  try {
    sesion = await requireSession()
  } catch (e) {
    if (isAuthorizationError(e)) return { error: MESSAGES.sesion }
    throw e
  }

  const { supabase, userId } = sesion

  if (makeFavorite) {
    // RLS decide: si el mercado está deshabilitado para su organización o
    // inactivo, `client_read_markets` no lo devuelve y no hay nada que marcar.
    const { data: market } = await supabase
      .from('markets')
      .select('id')
      .eq('id', marketId)
      .maybeSingle()

    if (!market) return { error: MESSAGES.noDisponible }

    const { error } = await supabase
      .from('user_market_favorites')
      .upsert({ user_id: userId, market_id: marketId }, { onConflict: 'user_id,market_id' })

    if (error) {
      console.error(`[favorites] alta falló: ${error.code ?? 'sin código'} ${error.message}`)
      return { error: MESSAGES.generico }
    }
  } else {
    const { error } = await supabase
      .from('user_market_favorites')
      .delete()
      .eq('user_id', userId)
      .eq('market_id', marketId)

    if (error) {
      console.error(`[favorites] baja falló: ${error.code ?? 'sin código'} ${error.message}`)
      return { error: MESSAGES.generico }
    }
  }

  // El bloque de favoritos vive en el Dashboard y en Market Intelligence.
  revalidatePath('/app/dashboard')
  revalidatePath('/app/market-intelligent')

  return { isFavorite: makeFavorite }
}

/** Identificadores de los mercados favoritos de quien hace la petición. */
export async function listMyFavoriteMarketIds(): Promise<string[]> {
  let sesion
  try {
    sesion = await requireSession()
  } catch (e) {
    if (isAuthorizationError(e)) return []
    throw e
  }

  const { data } = await sesion.supabase
    .from('user_market_favorites')
    .select('market_id')
    .eq('user_id', sesion.userId)

  return (data ?? []).map((r) => r.market_id as string)
}
