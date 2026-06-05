'use client'

import { useState } from 'react'
import { Trash2, AlertTriangle, X } from 'lucide-react'
import { deleteNews } from '@/lib/actions/news'
import { useRouter } from 'next/navigation'

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
        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
        title="Eliminar"
      >
        <Trash2 size={15} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-lg shrink-0">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-display font-bold text-slate-900 mb-1">Eliminar noticia</h3>
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
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-3">{error}</p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
