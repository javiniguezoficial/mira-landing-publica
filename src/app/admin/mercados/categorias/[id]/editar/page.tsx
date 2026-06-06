import { notFound } from 'next/navigation'
import { Layers } from 'lucide-react'
import { CategoryForm } from '@/components/admin/markets/CategoryForm'
import { getCategoryById, updateCategory } from '@/lib/actions/markets'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

export default async function EditarCategoriaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const category = await getCategoryById(id)
  if (!category) notFound()

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader icon={Layers} title="Editar categoría" subtitle={category.name} />
      <CategoryForm
        initial={category}
        onSave={async (form) => {
          'use server'
          await updateCategory(id, form)
        }}
      />
    </div>
  )
}
