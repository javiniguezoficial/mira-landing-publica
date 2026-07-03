'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Plus, Pencil, Trash2, ListTree } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import { miraBtn } from '@/lib/miraButtons'
import {
  toggleSupplierMarket, deleteSupplierMarket,
  toggleSupplierCategory, deleteSupplierCategory,
  toggleSupplierFamily, deleteSupplierFamily,
  toggleSupplierSubfamily, deleteSupplierSubfamily,
  type SupplierMarketNode,
} from '@/lib/actions/supplier-taxonomy'
import { TaxonomyNodeModal, type TaxonomyLevel, type EditableNode } from './TaxonomyNodeModal'

interface Props {
  tree: SupplierMarketNode[]
}

interface ModalState {
  level: TaxonomyLevel
  parentId?: string
  node?: EditableNode
}

function toggleNode(level: TaxonomyLevel, id: string, isActive: boolean) {
  switch (level) {
    case 'market':    return toggleSupplierMarket(id, isActive)
    case 'category':  return toggleSupplierCategory(id, isActive)
    case 'family':    return toggleSupplierFamily(id, isActive)
    case 'subfamily': return toggleSupplierSubfamily(id, isActive)
  }
}

function deleteNode(level: TaxonomyLevel, id: string) {
  switch (level) {
    case 'market':    return deleteSupplierMarket(id)
    case 'category':  return deleteSupplierCategory(id)
    case 'family':    return deleteSupplierFamily(id)
    case 'subfamily': return deleteSupplierSubfamily(id)
  }
}

export function SupplierTaxonomyManager({ tree }: Props) {
  const router = useRouter()
  const [modal, setModal] = useState<ModalState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSaved() {
    setModal(null)
    router.refresh()
  }

  function handleToggle(level: TaxonomyLevel, id: string, currentActive: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await toggleNode(level, id, !currentActive)
      if (result && 'error' in result) setError(result.error)
      else router.refresh()
    })
  }

  function handleDelete(level: TaxonomyLevel, id: string, name: string) {
    if (!window.confirm(`¿Eliminar "${name}"? Esta acción no se puede deshacer.`)) return
    setError(null)
    startTransition(async () => {
      const result = await deleteNode(level, id)
      if (result && 'error' in result) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {tree.length} {tree.length === 1 ? 'mercado de proveedor' : 'mercados de proveedor'}
        </p>
        <button
          onClick={() => setModal({ level: 'market' })}
          className={miraBtn.primary}
        >
          <Plus size={14} /> Nuevo mercado
        </button>
      </div>

      {tree.length === 0 ? (
        <div className="mira-card rounded-2xl">
          <EmptyState
            icon={ListTree}
            title="Todavía no hay mercados de proveedor"
            description="Crea el primero para empezar a clasificar proveedores."
          />
        </div>
      ) : (
        <div className="mira-card divide-y divide-mira-line rounded-2xl">
          {tree.map((market) => (
            <details key={market.id} className="group/market px-4 py-3" open>
              <summary className="flex cursor-pointer list-none items-center gap-2 py-1">
                <ChevronRight size={16} className="shrink-0 text-slate-400 transition-transform group-open/market:rotate-90" />
                <span className="flex-1 text-sm font-bold text-mira-ink">{market.name}</span>
                <NodeMeta node={market} />
                <NodeActions
                  onAddChild={() => setModal({ level: 'category', parentId: market.id })}
                  onEdit={() => setModal({ level: 'market', node: market })}
                  onToggle={() => handleToggle('market', market.id, market.is_active)}
                  onDelete={() => handleDelete('market', market.id, market.name)}
                  addLabel="Nueva categoría"
                  disabled={isPending}
                />
              </summary>

              <div className="ml-6 mt-2 space-y-2 border-l border-mira-line pl-4">
                {market.categories.length === 0 ? (
                  <p className="py-1 text-xs text-slate-400">Sin categorías todavía.</p>
                ) : (
                  market.categories.map((category) => (
                    <details key={category.id} className="group/category" open>
                      <summary className="flex cursor-pointer list-none items-center gap-2 py-1">
                        <ChevronRight size={14} className="shrink-0 text-slate-400 transition-transform group-open/category:rotate-90" />
                        <span className="flex-1 text-sm font-semibold text-slate-700">{category.name}</span>
                        <NodeMeta node={category} />
                        <NodeActions
                          onAddChild={() => setModal({ level: 'family', parentId: category.id })}
                          onEdit={() => setModal({ level: 'category', node: category })}
                          onToggle={() => handleToggle('category', category.id, category.is_active)}
                          onDelete={() => handleDelete('category', category.id, category.name)}
                          addLabel="Nueva familia"
                          disabled={isPending}
                        />
                      </summary>

                      <div className="ml-6 mt-2 space-y-2 border-l border-mira-line pl-4">
                        {category.families.length === 0 ? (
                          <p className="py-1 text-xs text-slate-400">Sin familias todavía.</p>
                        ) : (
                          category.families.map((family) => (
                            <details key={family.id} className="group/family" open>
                              <summary className="flex cursor-pointer list-none items-center gap-2 py-1">
                                <ChevronRight size={13} className="shrink-0 text-slate-400 transition-transform group-open/family:rotate-90" />
                                <span className="flex-1 text-sm text-slate-600">{family.name}</span>
                                <NodeMeta node={family} />
                                <NodeActions
                                  onAddChild={() => setModal({ level: 'subfamily', parentId: family.id })}
                                  onEdit={() => setModal({ level: 'family', node: family })}
                                  onToggle={() => handleToggle('family', family.id, family.is_active)}
                                  onDelete={() => handleDelete('family', family.id, family.name)}
                                  addLabel="Nueva subfamilia"
                                  disabled={isPending}
                                />
                              </summary>

                              <div className="ml-6 mt-2 space-y-1.5 border-l border-mira-line pl-4">
                                {family.subfamilies.length === 0 ? (
                                  <p className="py-1 text-xs text-slate-400">Sin subfamilias todavía.</p>
                                ) : (
                                  family.subfamilies.map((sub) => (
                                    <div key={sub.id} className="flex items-center gap-2 py-1">
                                      <span className="flex-1 text-sm text-slate-500">{sub.name}</span>
                                      <NodeMeta node={sub} />
                                      <NodeActions
                                        onEdit={() => setModal({ level: 'subfamily', node: sub })}
                                        onToggle={() => handleToggle('subfamily', sub.id, sub.is_active)}
                                        onDelete={() => handleDelete('subfamily', sub.id, sub.name)}
                                        disabled={isPending}
                                      />
                                    </div>
                                  ))
                                )}
                              </div>
                            </details>
                          ))
                        )}
                      </div>
                    </details>
                  ))
                )}
              </div>
            </details>
          ))}
        </div>
      )}

      {modal && (
        <TaxonomyNodeModal
          level={modal.level}
          parentId={modal.parentId}
          node={modal.node}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

function NodeMeta({ node }: { node: { slug: string; sort_order: number; is_active: boolean } }) {
  return (
    <span className="flex items-center gap-2 text-[11px] text-slate-400">
      <span className="hidden font-mono sm:inline">{node.slug}</span>
      <span>#{node.sort_order}</span>
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${node.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
        {node.is_active ? 'Activo' : 'Inactivo'}
      </span>
    </span>
  )
}

function NodeActions({
  onAddChild, onEdit, onToggle, onDelete, addLabel, disabled,
}: {
  onAddChild?: () => void
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
  addLabel?: string
  disabled: boolean
}) {
  return (
    <span className="flex shrink-0 items-center gap-1" onClick={(e) => e.preventDefault()}>
      {onAddChild && (
        <button
          type="button"
          onClick={onAddChild}
          disabled={disabled}
          title={addLabel}
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-mira-magenta-soft hover:text-mira-magenta"
        >
          <Plus size={14} />
        </button>
      )}
      <button
        type="button"
        onClick={onEdit}
        disabled={disabled}
        title="Editar"
        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-mira-canvas hover:text-slate-600"
      >
        <Pencil size={13} />
      </button>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        title="Activar/desactivar"
        className="rounded-lg px-2 py-1 text-[11px] font-bold text-slate-400 transition-colors hover:bg-mira-canvas hover:text-slate-600"
      >
        Act./Desact.
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        title="Eliminar"
        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
      >
        <Trash2 size={13} />
      </button>
    </span>
  )
}
