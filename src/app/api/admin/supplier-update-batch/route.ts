import { NextRequest, NextResponse } from 'next/server'
import { authorizePlatformAdminApi } from '@/lib/auth/guards'
import { authorizationApiMessage, authorizationHttpStatus } from '@/lib/auth/errors'
import { getSupplierUpdateBatch } from '@/lib/actions/supplier-updates'

/** Resumen de un batch de actualización masiva (Fase 3.2). Solo lectura. */
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
    return NextResponse.json({ error: 'Falta el identificador de la actualización.' }, { status: 400 })
  }

  const batch = await getSupplierUpdateBatch(batchId)
  if (!batch) {
    return NextResponse.json({ error: 'No se ha encontrado la actualización.' }, { status: 404 })
  }

  return NextResponse.json(batch, { headers: { 'Cache-Control': 'no-store' } })
}
