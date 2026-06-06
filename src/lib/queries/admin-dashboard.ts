import { createClient } from '@/lib/supabase/server'

export interface AdminKpis {
  organizations: number
  users: number
  rfqsOpen: number
  ticketsOpen: number
  newsPublished: number
  suppliersActive: number
  productsActive: number
  priceRecords: number
}

export interface RecentRfq {
  id: string
  status: string
  created_at: string
  product_name: string | null
  org_name: string | null
}

export interface RecentTicket {
  id: string
  subject: string
  status: string
  priority: string
  created_at: string
}

export interface RecentNews {
  id: string
  title: string
  status: string
  created_at: string
}

export interface RfqStatusCount {
  status: string
  count: number
}

export interface TicketStatusCount {
  status: string
  label: string
  count: number
}

export interface PriceRecordPoint {
  date: string
  count: number
}

export async function getAdminKpis(): Promise<AdminKpis> {
  const supabase = await createClient()

  const [
    { count: organizations },
    { count: users },
    { count: rfqsOpen },
    { count: ticketsOpen },
    { count: newsPublished },
    { count: suppliersActive },
    { count: productsActive },
    { count: priceRecords },
  ] = await Promise.all([
    supabase.from('organizations').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('rfqs').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('news').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('suppliers').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('product_price_records').select('*', { count: 'exact', head: true }),
  ])

  return {
    organizations: organizations ?? 0,
    users: users ?? 0,
    rfqsOpen: rfqsOpen ?? 0,
    ticketsOpen: ticketsOpen ?? 0,
    newsPublished: newsPublished ?? 0,
    suppliersActive: suppliersActive ?? 0,
    productsActive: productsActive ?? 0,
    priceRecords: priceRecords ?? 0,
  }
}

export async function getRecentRfqs(limit = 5): Promise<RecentRfq[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('rfqs')
    .select('id, status, created_at, products(name), organizations(name)')
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map((r: any) => ({
    id: r.id,
    status: r.status,
    created_at: r.created_at,
    product_name: r.products?.name ?? null,
    org_name: r.organizations?.name ?? null,
  }))
}

export async function getRecentTickets(limit = 5): Promise<RecentTicket[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('support_tickets')
    .select('id, subject, status, priority, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function getRecentNews(limit = 4): Promise<RecentNews[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('news')
    .select('id, title, status, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function getRfqStatusCounts(): Promise<RfqStatusCount[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('rfqs').select('status')
  if (!data) return []

  const counts: Record<string, number> = {}
  for (const row of data) { counts[row.status] = (counts[row.status] ?? 0) + 1 }

  const ORDER = ['draft', 'open', 'closed', 'awarded', 'cancelled']
  const LABELS: Record<string, string> = {
    draft: 'Borrador', open: 'Abierta', closed: 'Cerrada', awarded: 'Adjudicada', cancelled: 'Cancelada',
  }
  return ORDER.filter(s => counts[s]).map(s => ({ status: LABELS[s] ?? s, count: counts[s] }))
}

export async function getTicketStatusCounts(): Promise<TicketStatusCount[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('support_tickets').select('status, priority')
  if (!data) return []

  const counts: Record<string, number> = {}
  for (const row of data) { counts[row.status] = (counts[row.status] ?? 0) + 1 }

  const DEFS = [
    { status: 'open',        label: 'Abierto' },
    { status: 'in_progress', label: 'En proceso' },
    { status: 'resolved',    label: 'Resuelto' },
    { status: 'closed',      label: 'Cerrado' },
  ]
  return DEFS.filter(d => counts[d.status]).map(d => ({ ...d, count: counts[d.status] }))
}

export async function getPriceRecordsLast30Days(): Promise<PriceRecordPoint[]> {
  const supabase = await createClient()
  const since = new Date()
  since.setDate(since.getDate() - 29)
  const sinceStr = since.toISOString().split('T')[0]

  const { data } = await supabase
    .from('product_price_records')
    .select('recorded_at')
    .gte('recorded_at', sinceStr)
    .order('recorded_at', { ascending: true })

  if (!data) return []

  const counts: Record<string, number> = {}
  for (const row of data) {
    const d = row.recorded_at as string
    counts[d] = (counts[d] ?? 0) + 1
  }

  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({
      date: new Date(date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
      count,
    }))
}

export async function getLatestPrices(limit = 4): Promise<{ product: string; price: number; unit: string; currency: string }[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('product_price_records')
    .select('price, unit, currency, products(name)')
    .order('recorded_at', { ascending: false })
    .limit(limit * 3) // over-fetch to deduplicate by product

  if (!data) return []

  const seen = new Set<string>()
  const result: { product: string; price: number; unit: string; currency: string }[] = []
  for (const r of data as any[]) {
    const name = r.products?.name
    if (name && !seen.has(name)) {
      seen.add(name)
      result.push({ product: name, price: parseFloat(r.price), unit: r.unit, currency: r.currency })
    }
    if (result.length >= limit) break
  }
  return result
}
