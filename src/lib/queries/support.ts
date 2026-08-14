import { createClient } from '@/lib/supabase/server'
import { PENDING_TICKET_STATUSES } from '@/lib/support/badge'
import { redirect } from 'next/navigation'

export interface SupportTicket {
  id: string
  subject: string
  category: string
  priority: string
  message: string
  status: string
  admin_response: string | null
  /** Cuándo se escribió o cambió la respuesta. La sella un trigger (041). */
  admin_responded_at: string | null
  /** Cuándo la vio su propietario. Solo la escribe la RPC de lectura (041). */
  response_seen_at: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  organization_id: string | null
  user_id: string
  // joined
  organization_name?: string | null
  user_name?: string | null
}

// ─── Admin: todos los tickets con filtros ─────────────────────────────────────

export async function getTickets(filters: {
  status?: string
  priority?: string
  category?: string
} = {}): Promise<SupportTicket[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let query = supabase
    .from('support_tickets')
    .select(`
      *,
      organizations ( name ),
      profiles ( first_name, last_name )
    `)
    .order('created_at', { ascending: false })

  if (filters.status)   query = query.eq('status',   filters.status)
  if (filters.priority) query = query.eq('priority', filters.priority)
  if (filters.category) query = query.eq('category', filters.category)

  const { data, error } = await query
  if (error) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((t: any) => ({
    ...t,
    organization_name: t.organizations?.name ?? null,
    user_name: [t.profiles?.first_name, t.profiles?.last_name].filter(Boolean).join(' ') || null,
  }))
}

// ─── Admin: detalle de un ticket ──────────────────────────────────────────────

export async function getTicket(id: string): Promise<SupportTicket | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase
    .from('support_tickets')
    .select(`
      *,
      organizations ( name ),
      profiles ( first_name, last_name )
    `)
    .eq('id', id)
    .single()

  if (error || !data) return null

  return {
    ...data,
    organization_name: (data as any).organizations?.name ?? null,
    user_name: [(data as any).profiles?.first_name, (data as any).profiles?.last_name].filter(Boolean).join(' ') || null,
  }
}

// ─── Cliente: mis tickets recientes ───────────────────────────────────────────

export async function getMyTickets(): Promise<SupportTicket[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('support_tickets')
    .select('id, subject, category, priority, status, created_at, updated_at, organization_id, user_id, admin_response, admin_responded_at, response_seen_at, resolved_at, message')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) return []
  return data ?? []
}

// ─── Aviso de tickets pendientes (Fase 039) ───────────────────────────────────

/**
 * Cuántos tickets requieren atención ahora mismo.
 *
 * Alimenta el badge junto a «Soporte» en la barra lateral de administración.
 *
 * ── Por qué `head: true` ───────────────────────────────────────────────────
 *
 * Porque solo interesa el número: no se traen filas. Es una cuenta que se
 * ejecuta en CADA navegación del panel, así que tiene que costar lo mínimo. Con
 * `idx_support_tickets_status` (039) la resuelve el índice.
 *
 * ── Por qué no hay polling ─────────────────────────────────────────────────
 *
 * El dato se calcula en el layout del servidor y se refresca al navegar o al
 * revalidar. Un intervalo constante haría una consulta cada pocos segundos por
 * cada pestaña abierta para enterarse de algo que llega varias veces al día.
 *
 * ── Fail-safe ──────────────────────────────────────────────────────────────
 *
 * Ante cualquier error devuelve 0, y el badge no se pinta. Un contador roto no
 * debe llenar la barra lateral de avisos falsos ni tumbar el panel entero.
 */
export async function getPendingTicketCount(): Promise<number> {
  const supabase = await createClient()

  const { count, error } = await supabase
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .in('status', [...PENDING_TICKET_STATUSES])

  if (error) {
    console.error(`[support] recuento de tickets pendientes falló: ${error.code ?? '?'} ${error.message}`)
    return 0
  }

  return count ?? 0
}

// ─── Aviso de respuestas SIN LEER para el CLIENTE ─────────────────────────────

/**
 * Cuántas respuestas de MIRA no ha visto todavía quien pregunta.
 *
 * ── Qué cambia respecto a la primera versión ───────────────────────────────
 *
 * Antes se contaban los tickets CON respuesta, porque el esquema no sabía
 * distinguir leído de no leído. Ese número no bajaba nunca: una respuesta no
 * deja de existir cuando alguien la lee, así que el aviso era permanente y por
 * tanto inútil como notificación.
 *
 * La migración 041 añadió las dos marcas que faltaban, y ahora la pregunta se
 * responde de verdad:
 *
 *   sin leer  ⇔  admin_responded_at IS NOT NULL  AND  response_seen_at IS NULL
 *
 * `admin_responded_at` la sella un trigger cuando la respuesta CAMBIA de
 * verdad, y en ese mismo momento vuelve a poner `response_seen_at` a NULL.
 * Rellenarla solo puede hacerlo `mark_my_support_responses_seen()`. Guardar la
 * misma respuesta otra vez no vuelve a marcarla como nueva.
 *
 * La condición usa UNA sola columna a propósito (042): PostgREST interpreta el
 * lado derecho de un filtro como literal, no como otra columna, así que
 * comparar `response_seen_at < admin_responded_at` devuelve `400 22007`. Está
 * comprobado contra la API real.
 *
 * ── Por qué se filtra por `user_id` y no se deja solo a RLS ────────────────
 *
 * La policy `client_select_own_tickets` admite además los tickets de la MISMA
 * ORGANIZACIÓN. Sin este filtro, el badge contaría solicitudes de compañeros
 * que la pantalla de Ayuda —que filtra por `user_id`, igual que aquí— no llega
 * a mostrar: el usuario vería «3» y encontraría una. Y, sobre todo, marcaría
 * como leído algo que no es suyo.
 *
 * RLS sigue siendo la barrera real: aunque este filtro se cayera, PostgREST no
 * devolvería tickets de otra organización.
 *
 * ── Por qué `head: true` ───────────────────────────────────────────────────
 *
 * Porque solo interesa el número. Se ejecuta en CADA navegación del portal, así
 * que no se traen filas ni contenido de tickets. El índice parcial
 * `idx_support_tickets_unread` (041) lo resuelve sin tocar los tickets sin
 * responder. Mismo criterio que `getPendingTicketCount`.
 *
 * Fail-safe: ante cualquier error devuelve 0 y el badge no se pinta. Un
 * contador roto no debe llenar la barra lateral de avisos falsos.
 */
export async function getMyUnreadResponseCount(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const { count, error } = await supabase
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .not('admin_responded_at', 'is', null)
    .is('response_seen_at', null)

  if (error) {
    console.error(
      `[support] recuento de respuestas sin leer falló: ${error.code ?? '?'} ${error.message}`,
    )
    return 0
  }

  return count ?? 0
}
