import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export interface SupportTicket {
  id: string
  subject: string
  category: string
  priority: string
  message: string
  status: string
  admin_response: string | null
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
    .select('id, subject, category, priority, status, created_at, updated_at, organization_id, user_id, admin_response, resolved_at, message')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) return []
  return data ?? []
}
