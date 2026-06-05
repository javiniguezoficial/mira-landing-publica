'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// Solo estos campos son editables desde el cliente
const EDITABLE_FIELDS = ['phone', 'email', 'website', 'city'] as const
type EditableField = (typeof EDITABLE_FIELDS)[number]

export interface UpdateOrgBasicResult {
  error?: string
}

export async function updateOrgBasic(
  formData: FormData
): Promise<UpdateOrgBasicResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verificar que el usuario es client_owner de su organización
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!membership) {
    return { error: 'No tienes una organización asignada.' }
  }

  if (membership.role !== 'client_owner') {
    return { error: 'Solo el propietario de la organización puede editar estos datos.' }
  }

  const orgId = membership.organization_id

  // Construir payload solo con campos permitidos
  const payload: Partial<Record<EditableField, string | null>> = {}
  for (const field of EDITABLE_FIELDS) {
    const value = (formData.get(field) as string)?.trim() || null
    payload[field] = value
  }

  const { error } = await supabase
    .from('organizations')
    .update(payload)
    .eq('id', orgId)

  if (error) return { error: error.message }

  redirect('/app/mi-organizacion')
}
