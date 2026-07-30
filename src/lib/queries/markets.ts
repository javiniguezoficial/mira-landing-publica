import { createClient } from '@/lib/supabase/server'

export interface CategoryWithMarkets {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  sort_order: number
  strategic_market_id: string | null
  strategic_market: { id: string; name: string; slug: string; icon: string | null; sort_order: number } | null
  markets: {
    id: string
    name: string
    slug: string
    description: string | null
    country_scope: string
    products: {
      id: string; name: string; slug: string; unit: string
      tipo: string | null; variedad: string | null
      /** 2.4 — la lonja es un atributo del PRODUCTO, no del registro de precio. */
      lonja: string | null
    }[]
  }[]
}

/** Agrupación por Mercado estratégico para Market Intelligence. */
export interface StrategicMarketGroup {
  id: string | null            // null = categorías sin mercado estratégico
  name: string | null
  icon: string | null
  sort_order: number
  categories: CategoryWithMarkets[]
}

export async function getCategoriesWithMarkets(): Promise<CategoryWithMarkets[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('market_categories')
    .select(`
      id, name, slug, description, icon, sort_order, strategic_market_id,
      strategic_market:strategic_markets(id, name, slug, icon, sort_order),
      markets(
        id, name, slug, description, country_scope,
        products(id, name, slug, unit, tipo, variedad, lonja)
      )
    `)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as CategoryWithMarkets[]
}

/**
 * Devuelve las categorías agrupadas por Mercado estratégico.
 * Las categorías sin mercado estratégico asignado (o cuyo mercado
 * estratégico esté inactivo) se agrupan al final bajo id=null.
 */
export async function getStrategicMarketGroups(): Promise<StrategicMarketGroup[]> {
  const categories = await getCategoriesWithMarkets()

  const groups = new Map<string | null, StrategicMarketGroup>()
  for (const cat of categories) {
    const sm = cat.strategic_market
    const key = sm?.id ?? null
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        name: sm?.name ?? null,
        icon: sm?.icon ?? null,
        sort_order: sm?.sort_order ?? Number.MAX_SAFE_INTEGER,
        categories: [],
      })
    }
    groups.get(key)!.categories.push(cat)
  }

  return Array.from(groups.values()).sort((a, b) => {
    // Las categorías sin mercado estratégico (id=null) siempre al final.
    if (a.id === null) return 1
    if (b.id === null) return -1
    return a.sort_order - b.sort_order
  })
}
