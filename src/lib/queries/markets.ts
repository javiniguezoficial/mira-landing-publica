import { createClient } from '@/lib/supabase/server'

export interface CategoryWithMarkets {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  sort_order: number
  markets: {
    id: string
    name: string
    slug: string
    description: string | null
    country_scope: string
    products: { id: string; name: string; slug: string; unit: string }[]
  }[]
}

export async function getCategoriesWithMarkets(): Promise<CategoryWithMarkets[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('market_categories')
    .select(`
      id, name, slug, description, icon, sort_order,
      markets(
        id, name, slug, description, country_scope,
        products(id, name, slug, unit)
      )
    `)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as CategoryWithMarkets[]
}
