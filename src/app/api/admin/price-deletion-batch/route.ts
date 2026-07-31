import { NextRequest, NextResponse } from 'next/server'
import { authorizePlatformAdminApi } from '@/lib/auth/guards'
import { authorizationApiMessage, authorizationHttpStatus } from '@/lib/auth/errors'
import { getDeletionBatch } from '@/lib/actions/price-deletions'

/** Resumen de una operación de borrado (035). Solo lectura. */
export async function GET(request: NextRequest) {
  const auth = await authorizePlatformAdminApi()
  if (!auth.ok) {
    return NextResponse.json(
      { error: authorizationApiMessage(auth.error.code) },
      { status: authorizationHttpStatus(auth.error.code) },
    )
  }

  const batchId = request.nextUrl.searchParams.get('batchId')
  if (!batchId) {
    return NextResponse.json({ error: 'Falta el identificador de la operación.' }, { status: 400 })
  }

  const batch = await getDeletionBatch(batchId)
  if (!batch) {
    return NextResponse.json({ error: 'No se ha encontrado la operación.' }, { status: 404 })
  }

  return NextResponse.json(batch, { headers: { 'Cache-Control': 'no-store' } })
}
