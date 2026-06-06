import { createClient } from '@/lib/supabase/server'

export interface ClientDashboardData {
  rfqsActive: number
  rfqsTotal: number
  responsesReceived: number
  ticketsOpen: number
  suppliersAvailable: number
  recentRfqs: {
    id: string
    status: string
    created_at: string
    product_name: string | null
    quantity: number
    unit: string
  }[]
  recentNews: {
    id: string
    title: string
    slug: string
    excerpt: string | null
    image_url: string | null
    created_at: string
  }[]
  rfqStatusCounts: { status: string; label: string; count: number }[]
}

const RFQ_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador', open: 'Abierta', closed: 'Cerrada', awarded: 'Adjudicada', cancelled: 'Cancelada',
}

export async function getClientDashboardData(orgId: string, userId: string): Promise<ClientDashboardData> {
  const supabase = await createClient()

  const [
    rfqsResult,
    responsesResult,
    ticketsResult,
    suppliersResult,
    newsResult,
  ] = await Promise.all([
    supabase
      .from('rfqs')
      .select('id, status, created_at, quantity, unit, products(name)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(20),

    supabase
      .from('rfq_responses')
      .select('id, rfq_id, rfqs!inner(organization_id)', { count: 'exact', head: false })
      .eq('rfqs.organization_id', orgId),

    supabase
      .from('support_tickets')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'open'),

    supabase
      .from('suppliers')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true),

    supabase
      .from('news')
      .select('id, title, slug, excerpt, image_url, created_at')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(3),
  ])

  const rfqs = rfqsResult.data ?? []
  const rfqsActive = rfqs.filter(r => ['open', 'draft'].includes(r.status)).length

  // RFQ status counts
  const counts: Record<string, number> = {}
  for (const r of rfqs) { counts[r.status] = (counts[r.status] ?? 0) + 1 }
  const rfqStatusCounts = Object.entries(counts).map(([status, count]) => ({
    status,
    label: RFQ_STATUS_LABELS[status] ?? status,
    count,
  }))

  return {
    rfqsActive,
    rfqsTotal: rfqs.length,
    responsesReceived: responsesResult.data?.length ?? 0,
    ticketsOpen: ticketsResult.count ?? 0,
    suppliersAvailable: suppliersResult.count ?? 0,
    recentRfqs: rfqs.slice(0, 5).map((r: any) => ({
      id: r.id,
      status: r.status,
      created_at: r.created_at,
      product_name: r.products?.name ?? null,
      quantity: r.quantity,
      unit: r.unit,
    })),
    recentNews: newsResult.data ?? [],
    rfqStatusCounts,
  }
}
