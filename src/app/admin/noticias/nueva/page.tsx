import { createNews, getMarketsForSelect, getProductsForSelect } from '@/lib/actions/news'
import { NewsForm } from '../NewsForm'
import Link from 'next/link'
import { ArrowLeft, Newspaper } from 'lucide-react'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

export default async function NuevanoticiaPage() {
  const [markets, products] = await Promise.all([
    getMarketsForSelect(),
    getProductsForSelect(),
  ])

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-6 xl:p-8">
      <div>
        <Link href="/admin/noticias" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-mira-magenta">
          <ArrowLeft size={15} /> Volver a noticias
        </Link>
        <MiraPageHeader icon={Newspaper} title="Nueva noticia" subtitle="Publica una novedad para tus clientes" />
      </div>

      <div className="mira-card rounded-2xl p-5 sm:p-6">
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
