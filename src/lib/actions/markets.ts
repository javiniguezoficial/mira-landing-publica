'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface MarketCategory {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Market {
  id: string
  category_id: string
  name: string
  slug: string
  description: string | null
  country_scope: string
  is_active: boolean
  created_at: string
  updated_at: string
  category?: Pick<MarketCategory, 'id' | 'name' | 'slug'> | null
}

export interface Product {
  id: string
  market_id: string
  name: string
  slug: string
  unit: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  market?: Pick<Market, 'id' | 'name' | 'slug'> | null
}

// ── Guard ─────────────────────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'platform_admin') redirect('/app/dashboard')
  return supabase
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function getCategories(): Promise<MarketCategory[]> {
  const supabase = await requireAdmin()
  const { data, error } = await supabase
    .from('market_categories')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as MarketCategory[]
}

export async function getCategoryById(id: string): Promise<MarketCategory | null> {
  const supabase = await requireAdmin()
  const { data } = await supabase
    .from('market_categories').select('*').eq('id', id).single()
  return data as MarketCategory | null
}

export async function createCategory(form: {
  name: string; slug: string; description?: string; icon?: string; sort_order?: number
}): Promise<{ id: string }> {
  const supabase = await requireAdmin()
  const { data, error } = await supabase
    .from('market_categories')
    .insert({
      name: form.name.trim(),
      slug: form.slug.trim(),
      description: form.description?.trim() || null,
      icon: form.icon?.trim() || null,
      sort_order: form.sort_order ?? 0,
    })
    .select('id').single()
  if (error) throw new Error(error.message)
  return { id: data.id }
}

export async function updateCategory(id: string, form: {
  name: string; slug: string; description?: string; icon?: string; sort_order?: number; is_active?: boolean
}): Promise<void> {
  const supabase = await requireAdmin()
  const { error } = await supabase
    .from('market_categories')
    .update({
      name: form.name.trim(),
      slug: form.slug.trim(),
      description: form.description?.trim() || null,
      icon: form.icon?.trim() || null,
      sort_order: form.sort_order ?? 0,
      is_active: form.is_active ?? true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function toggleCategory(id: string, is_active: boolean): Promise<void> {
  const supabase = await requireAdmin()
  const { error } = await supabase
    .from('market_categories')
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Markets ───────────────────────────────────────────────────────────────────

export async function getMarkets(): Promise<Market[]> {
  const supabase = await requireAdmin()
  const { data, error } = await supabase
    .from('markets')
    .select('*, category:market_categories(id, name, slug)')
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as Market[]
}

export async function getMarketById(id: string): Promise<Market | null> {
  const supabase = await requireAdmin()
  const { data } = await supabase
    .from('markets')
    .select('*, category:market_categories(id, name, slug)')
    .eq('id', id).single()
  return data as Market | null
}

export async function createMarket(form: {
  category_id: string; name: string; slug: string; description?: string; country_scope?: string
}): Promise<{ id: string }> {
  const supabase = await requireAdmin()
  const { data, error } = await supabase
    .from('markets')
    .insert({
      category_id: form.category_id,
      name: form.name.trim(),
      slug: form.slug.trim(),
      description: form.description?.trim() || null,
      country_scope: form.country_scope?.trim() || 'ES',
    })
    .select('id').single()
  if (error) throw new Error(error.message)
  return { id: data.id }
}

export async function updateMarket(id: string, form: {
  category_id: string; name: string; slug: string; description?: string; country_scope?: string; is_active?: boolean
}): Promise<void> {
  const supabase = await requireAdmin()
  const { error } = await supabase
    .from('markets')
    .update({
      category_id: form.category_id,
      name: form.name.trim(),
      slug: form.slug.trim(),
      description: form.description?.trim() || null,
      country_scope: form.country_scope?.trim() || 'ES',
      is_active: form.is_active ?? true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function toggleMarket(id: string, is_active: boolean): Promise<void> {
  const supabase = await requireAdmin()
  const { error } = await supabase
    .from('markets')
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Products ──────────────────────────────────────────────────────────────────

export async function getProductsByMarket(market_id: string): Promise<Product[]> {
  const supabase = await requireAdmin()
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('market_id', market_id)
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as Product[]
}

export async function getProductById(id: string): Promise<Product | null> {
  const supabase = await requireAdmin()
  const { data } = await supabase
    .from('products').select('*').eq('id', id).single()
  return data as Product | null
}

export async function createProduct(form: {
  market_id: string; name: string; slug: string; unit: string; description?: string
}): Promise<{ id: string }> {
  const supabase = await requireAdmin()
  const { data, error } = await supabase
    .from('products')
    .insert({
      market_id: form.market_id,
      name: form.name.trim(),
      slug: form.slug.trim(),
      unit: form.unit.trim(),
      description: form.description?.trim() || null,
    })
    .select('id').single()
  if (error) throw new Error(error.message)
  return { id: data.id }
}

export async function updateProduct(id: string, form: {
  name: string; slug: string; unit: string; description?: string; is_active?: boolean
}): Promise<void> {
  const supabase = await requireAdmin()
  const { error } = await supabase
    .from('products')
    .update({
      name: form.name.trim(),
      slug: form.slug.trim(),
      unit: form.unit.trim(),
      description: form.description?.trim() || null,
      is_active: form.is_active ?? true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function toggleProduct(id: string, is_active: boolean): Promise<void> {
  const supabase = await requireAdmin()
  const { error } = await supabase
    .from('products')
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}
