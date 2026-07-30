import { NextRequest, NextResponse } from 'next/server'
import { authorizePlatformAdminApi } from '@/lib/auth/guards'
import { authorizationApiMessage, authorizationHttpStatus } from '@/lib/auth/errors'
import { getSupplierUpdateRows } from '@/lib/actions/supplier-updates'
import { UPDATE_ROW_STATUSES, type UpdateRowStatus } from '@/lib/suppliers/bulk-update/types'

/**
 * Filas de un batch, paginadas (Fase 3.2).
 *
 * Route Handler y no Server Action porque el asistente pagina y filtra sin
 * recargar: es una lectura pura que el componente pide bajo demanda.
 *
 * El filtro se valida contra la lista cerrada de estados. Un valor cualquiera
 * cae a «todas» en lugar de llegar a la consulta.
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
    return NextResponse.json({ error: 'Falta el identificador de la actualización.' }, { status: 400 })
  }

  const statusRaw = params.get('status') ?? 'all'
  const status: UpdateRowStatus | 'all' =
    UPDATE_ROW_STATUSES.includes(statusRaw as UpdateRowStatus) ? (statusRaw as UpdateRowStatus) : 'all'

  const page = Math.max(1, Number(params.get('page')) || 1)

  const resultado = await getSupplierUpdateRows(batchId, { status, page })

  return NextResponse.json(resultado, { headers: { 'Cache-Control': 'no-store' } })
}
