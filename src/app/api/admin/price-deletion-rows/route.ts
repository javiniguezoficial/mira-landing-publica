import { NextRequest, NextResponse } from 'next/server'
import { authorizePlatformAdminApi } from '@/lib/auth/guards'
import { authorizationApiMessage, authorizationHttpStatus } from '@/lib/auth/errors'
import { getDeletionRows } from '@/lib/actions/price-deletions'

/**
 * Filas de la vista previa de un borrado, paginadas (035).
 *
 * Route Handler y no Server Action porque el asistente pagina sin recargar: es
 * una lectura pura que el componente pide bajo demanda.
 */
export async function GET(request: NextRequest) {
  const auth = await authorizePlatformAdminApi()
  if (!auth.ok) {
    return NextResponse.json(
      { error: authorizationApiMessage(auth.error.code) },
      { status: authorizationHttpStatus(auth.error.code) },
    )
  }

  const params = request.nextUrl.searchParams
  const batchId = params.get('batchId')
  if (!batchId) {
    return NextResponse.json({ error: 'Falta el identificador de la operación.' }, { status: 400 })
  }

  const page = Math.max(1, Number(params.get('page')) || 1)
  const resultado = await getDeletionRows(batchId, { page })

  return NextResponse.json(resultado, { headers: { 'Cache-Control': 'no-store' } })
}
