import { getNewsById, updateNews, getMarketsForSelect, getProductsForSelect } from '@/lib/actions/news'
import { NewsForm } from '../../NewsForm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Newspaper } from 'lucide-react'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

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
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-6 xl:p-8">
      <div>
        <Link href={`/admin/noticias/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-mira-magenta">
          <ArrowLeft size={15} /> Volver al detalle
        </Link>
        <MiraPageHeader icon={Newspaper} title="Editar noticia" subtitle={news.title} />
      </div>

      <div className="mira-card rounded-2xl p-5 sm:p-6">
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
