'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { deleteSupplier } from '@/lib/actions/suppliers'
import { miraBtn } from '@/lib/miraButtons'

interface Props {
  id: string
  name: string
  // 'button' = botón con texto (detalle); 'icon' = solo icono (fila de tabla)
  variant?: 'button' | 'icon'
  // A dónde ir tras borrar; por defecto refresca la vista actual
  redirectTo?: string
}

export function DeleteSupplierButton({ id, name, variant = 'button', redirectTo }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    if (!window.confirm(`Esta acción eliminará el proveedor "${name}". ¿Seguro que quieres continuar?`)) return
    setError(null)
    startTransition(async () => {
      const result = await deleteSupplier(id)
      if (result && 'error' in result) {
        setError(result.error)
        return
      }
      if (redirectTo) router.push(redirectTo)
      router.refresh()
    })
  }

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        title={error ?? 'Eliminar proveedor'}
        className={`rounded-lg p-1.5 transition-colors hover:bg-red-50 ${error ? 'text-red-500' : 'text-slate-400 hover:text-red-500'}`}
      >
        <Trash2 size={14} />
      </button>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className={`${miraBtn.ghost} text-red-600 hover:bg-red-50`}
      >
        <Trash2 size={13} /> {isPending ? 'Eliminando…' : 'Eliminar proveedor'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
