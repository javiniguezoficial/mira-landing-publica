import { createClient } from '@/lib/supabase/server'

export interface PublishedNews {
  id: string
  title: string
  slug: string
  excerpt: string | null
  content: string
  category: string | null
  published_at: string
  image_url: string | null
  markets?: { name: string } | null
  products?: { name: string } | null
}

export async function getPublishedNews(): Promise<PublishedNews[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('news')
    .select('id, title, slug, excerpt, content, category, published_at, image_url, markets(name), products(name)')
    .eq('status', 'published')
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })

  if (error) return []
  return (data ?? []) as unknown as PublishedNews[]
}

export async function getPublishedNewsBySlug(slug: string): Promise<PublishedNews | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('news')
    .select('id, title, slug, excerpt, content, category, published_at, image_url, markets(name), products(name)')
    .eq('slug', slug)
    .eq('status', 'published')
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString())
    .single()

  if (error || !data) return null
  return data as unknown as PublishedNews
}
