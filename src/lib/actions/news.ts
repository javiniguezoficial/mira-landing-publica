'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type NewsStatus = 'draft' | 'published' | 'archived'

export interface NewsItem {
  id: string
  title: string
  slug: string
  excerpt: string | null
  content: string
  status: NewsStatus
  category: string | null
  market_id: string | null
  product_id: string | null
  image_url: string | null
  published_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  markets?: { name: string } | null
  products?: { name: string } | null
}

// ── HTML sanitización ─────────────────────────────────────────────────────────

// Etiquetas permitidas (output de Tiptap con StarterKit + Link)
const ALLOWED_TAGS = new Set([
  'p', 'h2', 'h3', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'br',
])

// Atributos seguros por etiqueta
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'rel', 'target']),
}

function sanitizeHtml(html: string): string {
  // Eliminar etiquetas no permitidas pero conservar su contenido de texto
  // Eliminar atributos peligrosos en etiquetas permitidas
  return html
    // Eliminar script, style, iframe y similares (con contenido)
    .replace(/<(script|style|iframe|object|embed|form|input|button|svg)[^>]*>[\s\S]*?<\/\1>/gi, '')
    // Eliminar atributos de eventos (on*)
    .replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    // Eliminar javascript: en href
    .replace(/href\s*=\s*["']?\s*javascript:[^"'\s>]*/gi, 'href="#"')
    // Para etiquetas <a>, mantener solo href, rel, target
    .replace(/<a([^>]*)>/gi, (_match, attrs: string) => {
      const href = /href\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? ''
      const safehref = /^https?:\/\/|^mailto:/i.test(href) ? href : '#'
      return `<a href="${safehref}" rel="noopener noreferrer nofollow" target="_blank">`
    })
}

// ── Excerpt automático ────────────────────────────────────────────────────────

function generateExcerpt(html: string, wordCount = 20): string {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const words = text.split(' ').filter(Boolean)
  if (words.length <= wordCount) return words.join(' ')
  return words.slice(0, wordCount).join(' ') + '…'
}

// ── Slug ──────────────────────────────────────────────────────────────────────

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

// ── Slug único ────────────────────────────────────────────────────────────────

async function assertSlugUnique(
  supabase: Awaited<ReturnType<typeof createClient>>,
  slug: string,
  excludeId?: string
): Promise<void> {
  let query = supabase.from('news').select('id').eq('slug', slug)
  if (excludeId) query = query.neq('id', excludeId)
  const { data } = await query
  if (data && data.length > 0) {
    throw new Error(`El slug "${slug}" ya está en uso. Elige otro.`)
  }
}

// ── Subida de imagen ──────────────────────────────────────────────────────────

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const MAX_SIZE = 5 * 1024 * 1024

export async function uploadNewsImage(
  formData: FormData
): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado.' }

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { error: 'No se recibió ningún archivo.' }

  if (!ALLOWED_MIME.has(file.type)) {
    return { error: 'Solo se permiten imágenes JPG, PNG o WebP.' }
  }
  if (file.size > MAX_SIZE) {
    return { error: 'El archivo supera los 5 MB máximos.' }
  }

  const ext = file.type === 'image/png' ? 'png'
    : file.type === 'image/webp' ? 'webp'
    : 'jpg'
  const filename = `news/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const bytes = await file.arrayBuffer()
  const { error } = await supabase.storage
    .from('news-images')
    .upload(filename, bytes, { contentType: file.type, upsert: false })

  if (error) return { error: error.message }

  const { data: urlData } = supabase.storage
    .from('news-images')
    .getPublicUrl(filename)

  return { url: urlData.publicUrl }
}

// ── Queries admin ─────────────────────────────────────────────────────────────

export async function getNewsListAdmin(filters?: {
  status?: string
  category?: string
}): Promise<NewsItem[]> {
  const supabase = await createClient()
  let query = supabase
    .from('news')
    .select('*, markets(name), products(name)')
    .order('created_at', { ascending: false })
  if (filters?.status && filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters?.category && filters.category !== 'all') query = query.eq('category', filters.category)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as NewsItem[]
}

export async function getNewsById(id: string): Promise<NewsItem | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('news')
    .select('*, markets(name), products(name)')
    .eq('id', id)
    .single()
  if (error) return null
  return data as unknown as NewsItem
}

// ── Crear noticia ─────────────────────────────────────────────────────────────

export async function createNews(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const title = (formData.get('title') as string)?.trim()
  const rawSlug = (formData.get('slug') as string)?.trim()
  const slug = rawSlug || generateSlug(title)
  const status = (formData.get('status') as NewsStatus) || 'draft'
  const rawContent = (formData.get('content') as string) || ''
  const content = sanitizeHtml(rawContent)
  const excerpt = generateExcerpt(content)

  if (!title) return { error: 'El título es obligatorio.' }
  if (!content || content === '<p></p>') return { error: 'El contenido es obligatorio.' }
  if (!slug) return { error: 'El slug es obligatorio.' }

  try {
    await assertSlugUnique(supabase, slug)
  } catch (e: unknown) {
    return { error: (e as Error).message }
  }

  // published_at siempre desde el servidor para evitar ambigüedad de zona horaria
  const published_at = status === 'published' ? new Date().toISOString() : null

  const { error } = await supabase.from('news').insert({
    title,
    slug,
    excerpt,
    content,
    status,
    category: (formData.get('category') as string) || null,
    market_id: (formData.get('market_id') as string) || null,
    product_id: (formData.get('product_id') as string) || null,
    image_url: (formData.get('image_url') as string) || null,
    published_at,
    created_by: user.id,
  })
  if (error) return { error: error.message }

  redirect('/admin/noticias')
}

// ── Actualizar noticia ────────────────────────────────────────────────────────

export async function updateNews(id: string, formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const title = (formData.get('title') as string)?.trim()
  const slug = (formData.get('slug') as string)?.trim()
  const status = (formData.get('status') as NewsStatus) || 'draft'
  const rawContent = (formData.get('content') as string) || ''
  const content = sanitizeHtml(rawContent)
  const excerpt = generateExcerpt(content)

  if (!title) return { error: 'El título es obligatorio.' }
  if (!content || content === '<p></p>') return { error: 'El contenido es obligatorio.' }
  if (!slug) return { error: 'El slug es obligatorio.' }

  try {
    await assertSlugUnique(supabase, slug, id)
  } catch (e: unknown) {
    return { error: (e as Error).message }
  }

  const { data: existing } = await supabase.from('news').select('published_at').eq('id', id).single()

  // Al publicar: usar fecha existente si ya tenía (preservar), o now() si es la primera vez
  // Al volver a draft/archived: preservar published_at (no borrar)
  let published_at: string | null = existing?.published_at ?? null
  if (status === 'published' && !existing?.published_at) {
    published_at = new Date().toISOString()
  }

  const { error } = await supabase.from('news').update({
    title,
    slug,
    excerpt,
    content,
    status,
    category: (formData.get('category') as string) || null,
    market_id: (formData.get('market_id') as string) || null,
    product_id: (formData.get('product_id') as string) || null,
    image_url: (formData.get('image_url') as string) || null,
    published_at,
  }).eq('id', id)

  if (error) return { error: error.message }
  redirect(`/admin/noticias/${id}`)
}

// ── Cambiar estado ────────────────────────────────────────────────────────────

export async function changeNewsStatus(
  id: string,
  newStatus: NewsStatus
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: existing } = await supabase.from('news').select('published_at').eq('id', id).single()
  const payload: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'published' && !existing?.published_at) {
    payload.published_at = new Date().toISOString()
  }

  const { error } = await supabase.from('news').update(payload).eq('id', id)
  if (error) return { error: error.message }
  return {}
}

// ── Eliminar noticia ──────────────────────────────────────────────────────────

export async function deleteNews(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.from('news').delete().eq('id', id)
  if (error) return { error: error.message }
  return {}
}

// ── Selectores ────────────────────────────────────────────────────────────────

export async function getMarketsForSelect(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('markets').select('id, name').order('name')
  return data ?? []
}

export async function getProductsForSelect(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('products').select('id, name').order('name')
  return data ?? []
}
