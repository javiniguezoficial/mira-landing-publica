'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface SupplierMarket {
  id: string
  name: string
  slug: string
  description: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SupplierCategory {
  id: string
  supplier_market_id: string
  name: string
  slug: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SupplierFamily {
  id: string
  supplier_category_id: string
  name: string
  slug: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SupplierSubfamily {
  id: string
  supplier_family_id: string
  name: string
  slug: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SupplierFamilyNode extends SupplierFamily {
  subfamilies: SupplierSubfamily[]
}

export interface SupplierCategoryNode extends SupplierCategory {
  families: SupplierFamilyNode[]
}

export interface SupplierMarketNode extends SupplierMarket {
  categories: SupplierCategoryNode[]
}

export interface NodeFormData {
  name: string
  slug?: string
  description?: string
  sort_order?: number
  is_active?: boolean
}

// Todas las mutaciones devuelven el error como VALOR, no con throw. En
// producción Next.js redacta el mensaje de cualquier Error lanzado desde un
// Server Action (lo sustituye por uno genérico) — devolverlo como dato es la
// única forma de que el mensaje real (p. ej. "slug duplicado") llegue a la UI.
export type TaxonomyActionResult = { id: string } | { error: string }
export type TaxonomyVoidResult = { error: string } | void

// ── Guard: solo platform_admin (mismo patrón que markets.ts/suppliers.ts) ────

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'platform_admin') redirect('/app/dashboard')
  return supabase
}

// ── Slug (mismo patrón que generateSlug() en news.ts) ────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function revalidateTaxonomy() {
  revalidatePath('/admin/proveedores/taxonomia')
}

// Traduce errores de Postgres a mensajes claros para el admin.
function friendlyDbError(error: { code?: string; message: string }, entityLabel: string): string {
  if (error.code === '23505') return `Ya existe ${entityLabel} con ese slug. Usa uno distinto.`
  return error.message
}

// ── Árbol completo (para la pantalla única) ───────────────────────────────────

export async function getSupplierTaxonomyTree(): Promise<SupplierMarketNode[]> {
  const supabase = await requireAdmin()

  const [marketsRes, categoriesRes, familiesRes, subfamiliesRes] = await Promise.all([
    supabase.from('supplier_markets').select('*').order('sort_order').order('name'),
    supabase.from('supplier_categories').select('*').order('sort_order').order('name'),
    supabase.from('supplier_families').select('*').order('sort_order').order('name'),
    supabase.from('supplier_subfamilies').select('*').order('sort_order').order('name'),
  ])

  const markets = (marketsRes.data ?? []) as SupplierMarket[]
  const categories = (categoriesRes.data ?? []) as SupplierCategory[]
  const families = (familiesRes.data ?? []) as SupplierFamily[]
  const subfamilies = (subfamiliesRes.data ?? []) as SupplierSubfamily[]

  return markets.map((market) => ({
    ...market,
    categories: categories
      .filter((c) => c.supplier_market_id === market.id)
      .map((category) => ({
        ...category,
        families: families
          .filter((f) => f.supplier_category_id === category.id)
          .map((family) => ({
            ...family,
            subfamilies: subfamilies.filter((s) => s.supplier_family_id === family.id),
          })),
      })),
  }))
}

// ── Mercado de proveedor ──────────────────────────────────────────────────────

export async function createSupplierMarket(form: NodeFormData): Promise<TaxonomyActionResult> {
  const supabase = await requireAdmin()
  if (!form.name?.trim()) return { error: 'El nombre es obligatorio' }

  const slug = form.slug?.trim() ? slugify(form.slug) : slugify(form.name)
  if (!slug) return { error: 'No se pudo generar un slug válido a partir del nombre' }

  const { data, error } = await supabase
    .from('supplier_markets')
    .insert({
      name: form.name.trim(),
      slug,
      description: form.description?.trim() || null,
      sort_order: form.sort_order ?? 0,
      is_active: form.is_active ?? true,
    })
    .select('id')
    .single()

  if (error) return { error: friendlyDbError(error, 'un mercado de proveedor') }
  revalidateTaxonomy()
  return { id: data.id }
}

export async function updateSupplierMarket(id: string, form: NodeFormData): Promise<TaxonomyVoidResult> {
  const supabase = await requireAdmin()
  if (!form.name?.trim()) return { error: 'El nombre es obligatorio' }

  const slug = form.slug?.trim() ? slugify(form.slug) : slugify(form.name)
  if (!slug) return { error: 'No se pudo generar un slug válido a partir del nombre' }

  const { error } = await supabase
    .from('supplier_markets')
    .update({
      name: form.name.trim(),
      slug,
      description: form.description?.trim() || null,
      sort_order: form.sort_order ?? 0,
      is_active: form.is_active ?? true,
    })
    .eq('id', id)

  if (error) return { error: friendlyDbError(error, 'un mercado de proveedor') }
  revalidateTaxonomy()
}

export async function toggleSupplierMarket(id: string, is_active: boolean): Promise<TaxonomyVoidResult> {
  const supabase = await requireAdmin()
  const { error } = await supabase.from('supplier_markets').update({ is_active }).eq('id', id)
  if (error) return { error: error.message }
  revalidateTaxonomy()
}

export async function deleteSupplierMarket(id: string): Promise<TaxonomyVoidResult> {
  const supabase = await requireAdmin()

  const { count } = await supabase
    .from('supplier_categories')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_market_id', id)

  if ((count ?? 0) > 0) {
    return { error: 'No se puede eliminar porque tiene categorías asociadas. Desactívalo o elimina primero sus categorías.' }
  }

  const { error } = await supabase.from('supplier_markets').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidateTaxonomy()
}

// ── Categoría de proveedor ────────────────────────────────────────────────────

export async function createSupplierCategory(supplierMarketId: string, form: NodeFormData): Promise<TaxonomyActionResult> {
  const supabase = await requireAdmin()
  if (!form.name?.trim()) return { error: 'El nombre es obligatorio' }

  const slug = form.slug?.trim() ? slugify(form.slug) : slugify(form.name)
  if (!slug) return { error: 'No se pudo generar un slug válido a partir del nombre' }

  const { data, error } = await supabase
    .from('supplier_categories')
    .insert({
      supplier_market_id: supplierMarketId,
      name: form.name.trim(),
      slug,
      sort_order: form.sort_order ?? 0,
      is_active: form.is_active ?? true,
    })
    .select('id')
    .single()

  if (error) return { error: friendlyDbError(error, 'una categoría con ese slug en este mercado') }
  revalidateTaxonomy()
  return { id: data.id }
}

export async function updateSupplierCategory(id: string, form: NodeFormData): Promise<TaxonomyVoidResult> {
  const supabase = await requireAdmin()
  if (!form.name?.trim()) return { error: 'El nombre es obligatorio' }

  const slug = form.slug?.trim() ? slugify(form.slug) : slugify(form.name)
  if (!slug) return { error: 'No se pudo generar un slug válido a partir del nombre' }

  const { error } = await supabase
    .from('supplier_categories')
    .update({
      name: form.name.trim(),
      slug,
      sort_order: form.sort_order ?? 0,
      is_active: form.is_active ?? true,
    })
    .eq('id', id)

  if (error) return { error: friendlyDbError(error, 'una categoría con ese slug en este mercado') }
  revalidateTaxonomy()
}

export async function toggleSupplierCategory(id: string, is_active: boolean): Promise<TaxonomyVoidResult> {
  const supabase = await requireAdmin()
  const { error } = await supabase.from('supplier_categories').update({ is_active }).eq('id', id)
  if (error) return { error: error.message }
  revalidateTaxonomy()
}

export async function deleteSupplierCategory(id: string): Promise<TaxonomyVoidResult> {
  const supabase = await requireAdmin()

  const { count } = await supabase
    .from('supplier_families')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_category_id', id)

  if ((count ?? 0) > 0) {
    return { error: 'No se puede eliminar porque tiene familias asociadas. Desactívala o elimina primero sus familias.' }
  }

  const { error } = await supabase.from('supplier_categories').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidateTaxonomy()
}

// ── Familia de proveedor ──────────────────────────────────────────────────────

export async function createSupplierFamily(supplierCategoryId: string, form: NodeFormData): Promise<TaxonomyActionResult> {
  const supabase = await requireAdmin()
  if (!form.name?.trim()) return { error: 'El nombre es obligatorio' }

  const slug = form.slug?.trim() ? slugify(form.slug) : slugify(form.name)
  if (!slug) return { error: 'No se pudo generar un slug válido a partir del nombre' }

  const { data, error } = await supabase
    .from('supplier_families')
    .insert({
      supplier_category_id: supplierCategoryId,
      name: form.name.trim(),
      slug,
      sort_order: form.sort_order ?? 0,
      is_active: form.is_active ?? true,
    })
    .select('id')
    .single()

  if (error) return { error: friendlyDbError(error, 'una familia con ese slug en esta categoría') }
  revalidateTaxonomy()
  return { id: data.id }
}

export async function updateSupplierFamily(id: string, form: NodeFormData): Promise<TaxonomyVoidResult> {
  const supabase = await requireAdmin()
  if (!form.name?.trim()) return { error: 'El nombre es obligatorio' }

  const slug = form.slug?.trim() ? slugify(form.slug) : slugify(form.name)
  if (!slug) return { error: 'No se pudo generar un slug válido a partir del nombre' }

  const { error } = await supabase
    .from('supplier_families')
    .update({
      name: form.name.trim(),
      slug,
      sort_order: form.sort_order ?? 0,
      is_active: form.is_active ?? true,
    })
    .eq('id', id)

  if (error) return { error: friendlyDbError(error, 'una familia con ese slug en esta categoría') }
  revalidateTaxonomy()
}

export async function toggleSupplierFamily(id: string, is_active: boolean): Promise<TaxonomyVoidResult> {
  const supabase = await requireAdmin()
  const { error } = await supabase.from('supplier_families').update({ is_active }).eq('id', id)
  if (error) return { error: error.message }
  revalidateTaxonomy()
}

export async function deleteSupplierFamily(id: string): Promise<TaxonomyVoidResult> {
  const supabase = await requireAdmin()

  const { count } = await supabase
    .from('supplier_subfamilies')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_family_id', id)

  if ((count ?? 0) > 0) {
    return { error: 'No se puede eliminar porque tiene subfamilias asociadas. Desactívala o elimina primero sus subfamilias.' }
  }

  const { error } = await supabase.from('supplier_families').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidateTaxonomy()
}

// ── Subfamilia de proveedor ────────────────────────────────────────────────────

export async function createSupplierSubfamily(supplierFamilyId: string, form: NodeFormData): Promise<TaxonomyActionResult> {
  const supabase = await requireAdmin()
  if (!form.name?.trim()) return { error: 'El nombre es obligatorio' }

  const slug = form.slug?.trim() ? slugify(form.slug) : slugify(form.name)
  if (!slug) return { error: 'No se pudo generar un slug válido a partir del nombre' }

  const { data, error } = await supabase
    .from('supplier_subfamilies')
    .insert({
      supplier_family_id: supplierFamilyId,
      name: form.name.trim(),
      slug,
      sort_order: form.sort_order ?? 0,
      is_active: form.is_active ?? true,
    })
    .select('id')
    .single()

  if (error) return { error: friendlyDbError(error, 'una subfamilia con ese slug en esta familia') }
  revalidateTaxonomy()
  return { id: data.id }
}

export async function updateSupplierSubfamily(id: string, form: NodeFormData): Promise<TaxonomyVoidResult> {
  const supabase = await requireAdmin()
  if (!form.name?.trim()) return { error: 'El nombre es obligatorio' }

  const slug = form.slug?.trim() ? slugify(form.slug) : slugify(form.name)
  if (!slug) return { error: 'No se pudo generar un slug válido a partir del nombre' }

  const { error } = await supabase
    .from('supplier_subfamilies')
    .update({
      name: form.name.trim(),
      slug,
      sort_order: form.sort_order ?? 0,
      is_active: form.is_active ?? true,
    })
    .eq('id', id)

  if (error) return { error: friendlyDbError(error, 'una subfamilia con ese slug en esta familia') }
  revalidateTaxonomy()
}

export async function toggleSupplierSubfamily(id: string, is_active: boolean): Promise<TaxonomyVoidResult> {
  const supabase = await requireAdmin()
  const { error } = await supabase.from('supplier_subfamilies').update({ is_active }).eq('id', id)
  if (error) return { error: error.message }
  revalidateTaxonomy()
}

export async function deleteSupplierSubfamily(id: string): Promise<TaxonomyVoidResult> {
  const supabase = await requireAdmin()

  // La FK suppliers.supplier_subfamily_id es ON DELETE SET NULL (no rompería
  // datos), pero bloqueamos igualmente si hay proveedores clasificados aquí
  // para no orfanizar su clasificación en silencio. No borra proveedores.
  const { count } = await supabase
    .from('suppliers')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_subfamily_id', id)

  if ((count ?? 0) > 0) {
    return { error: 'No se puede eliminar porque hay proveedores clasificados con esta subfamilia. Reclasifícalos primero o desactívala.' }
  }

  const { error } = await supabase.from('supplier_subfamilies').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidateTaxonomy()
}
