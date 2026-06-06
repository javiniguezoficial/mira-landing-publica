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
      className={`rounded-lg px-2 py-0.5 text-xs font-bold transition-colors disabled:opacity-50 ${
        isActive
          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
      }`}
    >
      {isActive ? 'Activo' : 'Inactivo'}
    </button>
  )
}
