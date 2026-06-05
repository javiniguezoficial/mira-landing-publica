import { notFound } from 'next/navigation'
import { CategoryForm } from '@/components/admin/markets/CategoryForm'
import { getCategoryById, updateCategory } from '@/lib/actions/markets'

export default async function EditarCategoriaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const category = await getCategoryById(id)
  if (!category) notFound()

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-slate-900">Editar categoría</h1>
        <p className="text-slate-500 font-body text-sm mt-1">{category.name}</p>
      </div>
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
