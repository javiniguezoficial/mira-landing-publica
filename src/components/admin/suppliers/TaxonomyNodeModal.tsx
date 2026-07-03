'use client'

import { useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { miraBtn, miraField, miraLabel } from '@/lib/miraButtons'
import {
  createSupplierMarket, updateSupplierMarket,
  createSupplierCategory, updateSupplierCategory,
  createSupplierFamily, updateSupplierFamily,
  createSupplierSubfamily, updateSupplierSubfamily,
  type NodeFormData,
} from '@/lib/actions/supplier-taxonomy'

export type TaxonomyLevel = 'market' | 'category' | 'family' | 'subfamily'

const LEVEL_LABELS: Record<TaxonomyLevel, string> = {
  market: 'mercado de proveedor',
  category: 'categoría',
  family: 'familia',
  subfamily: 'subfamilia',
}

export interface EditableNode {
  id: string
  name: string
  slug: string
  description?: string | null
  sort_order: number
  is_active: boolean
}

interface Props {
  level: TaxonomyLevel
  // Requerido al crear category/family/subfamily — id del padre directo.
  parentId?: string
  // Si viene informado, el modal edita este nodo en vez de crear uno nuevo.
  node?: EditableNode
  onClose: () => void
  onSaved: () => void
}

export function TaxonomyNodeModal({ level, parentId, node, onClose, onSaved }: Props) {
  const isEdit = !!node
  const [name, setName] = useState(node?.name ?? '')
  const [slug, setSlug] = useState(node?.slug ?? '')
  const [description, setDescription] = useState(node?.description ?? '')
  const [sortOrder, setSortOrder] = useState(String(node?.sort_order ?? 0))
  const [isActive, setIsActive] = useState(node?.is_active ?? true)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const form: NodeFormData = {
      name: name.trim(),
      slug: slug.trim() || undefined,
      description: level === 'market' ? description.trim() || undefined : undefined,
      sort_order: parseInt(sortOrder, 10) || 0,
      is_active: isActive,
    }

    startTransition(async () => {
      const result = isEdit
        ? await updateNode(level, node!.id, form)
        : await createNode(level, parentId!, form)

      if (result && 'error' in result) {
        setError(result.error)
        return
      }
      onSaved()
    })
  }

  const title = isEdit ? `Editar ${LEVEL_LABELS[level]}` : `Nueva ${LEVEL_LABELS[level]}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-base font-black text-mira-ink">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-mira-canvas">
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={miraLabel}>Nombre <span className="text-red-500">*</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={miraField} placeholder="Ej. Lácteos" autoFocus />
          </div>

          <div>
            <label className={miraLabel}>Slug <span className="text-slate-400 font-normal">(opcional)</span></label>
            <input value={slug} onChange={(e) => setSlug(e.target.value)} className={miraField} placeholder="Se genera automáticamente a partir del nombre" />
          </div>

          {level === 'market' && (
            <div>
              <label className={miraLabel}>Descripción <span className="text-slate-400 font-normal">(opcional)</span></label>
              <textarea value={description ?? ''} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${miraField} resize-none`} />
            </div>
          )}

          <div>
            <label className={miraLabel}>Orden</label>
            <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className={miraField} />
          </div>

          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 accent-mira-magenta" />
            <span className="text-sm text-slate-700">Activo</span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className={miraBtn.ghost}>Cancelar</button>
            <button type="submit" disabled={isPending} className={miraBtn.primary}>
              {isPending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function createNode(level: TaxonomyLevel, parentId: string, form: NodeFormData) {
  switch (level) {
    case 'market':    return createSupplierMarket(form)
    case 'category':  return createSupplierCategory(parentId, form)
    case 'family':    return createSupplierFamily(parentId, form)
    case 'subfamily': return createSupplierSubfamily(parentId, form)
  }
}

function updateNode(level: TaxonomyLevel, id: string, form: NodeFormData) {
  switch (level) {
    case 'market':    return updateSupplierMarket(id, form)
    case 'category':  return updateSupplierCategory(id, form)
    case 'family':    return updateSupplierFamily(id, form)
    case 'subfamily': return updateSupplierSubfamily(id, form)
  }
}
