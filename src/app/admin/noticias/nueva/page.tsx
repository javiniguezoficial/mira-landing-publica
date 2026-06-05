import { createNews, getMarketsForSelect, getProductsForSelect } from '@/lib/actions/news'
import { NewsForm } from '../NewsForm'
import Link from 'next/link'
import { ArrowLeft, Newspaper } from 'lucide-react'

export default async function NuevanoticiaPage() {
  const [markets, products] = await Promise.all([
    getMarketsForSelect(),
    getProductsForSelect(),
  ])

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/noticias" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft size={15} /> Volver a noticias
        </Link>
        <div className="flex items-center gap-3">
          <Newspaper className="text-mira-primary" size={24} />
          <h1 className="text-2xl font-display font-bold text-slate-900">Nueva noticia</h1>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <NewsForm
          action={createNews}
          markets={markets}
          products={products}
          submitLabel="Crear noticia"
        />
      </div>
    </div>
  )
}
