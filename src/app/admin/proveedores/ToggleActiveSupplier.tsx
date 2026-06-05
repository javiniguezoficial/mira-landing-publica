'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toggleSupplierActive } from '@/lib/actions/suppliers'

export function ToggleActiveSupplier({ id, isActive }: { id: string; isActive: boolean }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleToggle() {
    startTransition(async () => {
      await toggleSupplierActive(id, !isActive)
      router.refresh()
    })
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors disabled:opacity-50 ${
        isActive
          ? 'bg-green-100 text-green-700 hover:bg-green-200'
          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
      }`}
    >
      {isActive ? 'Activo' : 'Inactivo'}
    </button>
  )
}
