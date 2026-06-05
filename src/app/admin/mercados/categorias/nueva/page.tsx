import { CategoryForm } from '@/components/admin/markets/CategoryForm'
import { createCategory } from '@/lib/actions/markets'

export default function NuevaCategoriaPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-slate-900">Nueva categoría</h1>
        <p className="text-slate-500 font-body text-sm mt-1">Añade una categoría de mercado</p>
      </div>
      <CategoryForm
        onSave={async (form) => {
          'use server'
          await createCategory(form)
        }}
      />
    </div>
  )
}
