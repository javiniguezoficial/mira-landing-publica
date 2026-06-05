'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface PriceRecord {
  id: string
  product_id: string
  source_id: string | null
  price: number
  unit: string
  currency: string
  country: string
  region: string | null
  recorded_at: string
  min_price: number | null
  max_price: number | null
  avg_price: number | null
  volume: number | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface PriceFormData {
  price: number
  unit: string
  currency: string
  country: string
  region?: string
  recorded_at: string
  min_price?: number | null
  max_price?: number | null
  avg_price?: number | null
  volume?: number | null
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

// ── Listar precios de un producto ─────────────────────────────────────────────

export async function getPricesByProduct(
  productId: string,
  limit = 100,
  offset = 0,
): Promise<{ records: PriceRecord[]; total: number }> {
  const supabase = await requireAdmin()

  const { data, error, count } = await supabase
    .from('product_price_records')
    .select('*', { count: 'exact' })
    .eq('product_id', productId)
    .order('recorded_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(error.message)

  // Convertir numeric strings a number
  const records = (data ?? []).map(r => ({
    ...r,
    price:     parseFloat(r.price),
    min_price: r.min_price != null ? parseFloat(r.min_price) : null,
    max_price: r.max_price != null ? parseFloat(r.max_price) : null,
    avg_price: r.avg_price != null ? parseFloat(r.avg_price) : null,
    volume:    r.volume    != null ? parseFloat(r.volume)    : null,
  })) as PriceRecord[]

  return { records, total: count ?? 0 }
}

// ── Obtener un registro ───────────────────────────────────────────────────────

export async function getPriceRecordById(id: string): Promise<PriceRecord | null> {
  const supabase = await requireAdmin()
  const { data } = await supabase
    .from('product_price_records').select('*').eq('id', id).single()
  if (!data) return null
  return {
    ...data,
    price:     parseFloat(data.price),
    min_price: data.min_price != null ? parseFloat(data.min_price) : null,
    max_price: data.max_price != null ? parseFloat(data.max_price) : null,
    avg_price: data.avg_price != null ? parseFloat(data.avg_price) : null,
    volume:    data.volume    != null ? parseFloat(data.volume)    : null,
  } as PriceRecord
}

// ── Crear ─────────────────────────────────────────────────────────────────────

export async function createPriceRecord(
  productId: string,
  form: PriceFormData,
): Promise<{ id: string }> {
  const supabase = await requireAdmin()
  const { data, error } = await supabase
    .from('product_price_records')
    .insert({
      product_id:  productId,
      price:       form.price,
      unit:        form.unit.trim(),
      currency:    form.currency.trim(),
      country:     form.country.trim(),
      region:      form.region?.trim() || null,
      recorded_at: form.recorded_at,
      min_price:   form.min_price ?? null,
      max_price:   form.max_price ?? null,
      avg_price:   form.avg_price ?? null,
      volume:      form.volume    ?? null,
    })
    .select('id').single()
  if (error) throw new Error(error.message)
  return { id: data.id }
}

// ── Editar ────────────────────────────────────────────────────────────────────

export async function updatePriceRecord(
  id: string,
  form: PriceFormData,
): Promise<void> {
  const supabase = await requireAdmin()
  const { error } = await supabase
    .from('product_price_records')
    .update({
      price:       form.price,
      unit:        form.unit.trim(),
      currency:    form.currency.trim(),
      country:     form.country.trim(),
      region:      form.region?.trim() || null,
      recorded_at: form.recorded_at,
      min_price:   form.min_price ?? null,
      max_price:   form.max_price ?? null,
      avg_price:   form.avg_price ?? null,
      volume:      form.volume    ?? null,
      updated_at:  new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Eliminar ──────────────────────────────────────────────────────────────────

export async function deletePriceRecord(id: string): Promise<void> {
  const supabase = await requireAdmin()
  const { error } = await supabase
    .from('product_price_records').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
