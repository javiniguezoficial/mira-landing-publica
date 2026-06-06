'use client'

import { useState } from 'react'
import { Trash2, AlertTriangle, X } from 'lucide-react'
import { deleteNews } from '@/lib/actions/news'
import { useRouter } from 'next/navigation'
import { miraBtn } from '@/lib/miraButtons'

export function NewsDeleteButton({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleDelete = async () => {
    setLoading(true)
    const result = await deleteNews(id)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    } else {
      setOpen(false)
      router.refresh()
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
        title="Eliminar"
      >
        <Trash2 size={15} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start gap-3">
              <div className="shrink-0 rounded-xl bg-red-100 p-2">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="mb-1 font-black text-mira-ink">Eliminar noticia</h3>
                <p className="text-sm text-slate-600">
                  ¿Estás seguro de que quieres eliminar{' '}
                  <span className="font-semibold">&ldquo;{title}&rdquo;</span>? Esta acción no se puede deshacer.
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 ml-auto shrink-0">
                <X size={18} />
              </button>
            </div>

            {error && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className={miraBtn.ghost} disabled={loading}>
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={loading} className={miraBtn.danger}>
                {loading ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
