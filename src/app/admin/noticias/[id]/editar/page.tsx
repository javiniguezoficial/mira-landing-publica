import { getNewsById, updateNews, getMarketsForSelect, getProductsForSelect } from '@/lib/actions/news'
import { NewsForm } from '../../NewsForm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Pencil } from 'lucide-react'

export default async function EditarNoticiaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [news, markets, products] = await Promise.all([
    getNewsById(id),
    getMarketsForSelect(),
    getProductsForSelect(),
  ])

  if (!news) notFound()

  const action = async (formData: FormData) => {
    'use server'
    return updateNews(id, formData)
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href={`/admin/noticias/${id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft size={15} /> Volver al detalle
        </Link>
        <div className="flex items-center gap-3">
          <Pencil className="text-mira-primary" size={22} />
          <h1 className="text-2xl font-display font-bold text-slate-900">Editar noticia</h1>
        </div>
        <p className="text-sm text-slate-500 mt-1 ml-9">{news.title}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <NewsForm
          action={action}
          defaultValues={news}
          markets={markets}
          products={products}
          submitLabel="Guardar cambios"
        />
      </div>
    </div>
  )
}
