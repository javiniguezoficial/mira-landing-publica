import { NextRequest, NextResponse } from 'next/server'
import { authorizePlatformAdminApi } from '@/lib/auth/guards'
import { authorizationApiMessage, authorizationHttpStatus } from '@/lib/auth/errors'
import { getImportErrorsCsv } from '@/lib/actions/market-imports'

/**
 * CSV de las filas rechazadas de un batch (Fase 2.5).
 *
 * El contenido sale de lo que subió alguien, así que `buildCsv` antepone un
 * apóstrofo a cualquier celda que empiece por `=`, `+`, `-` o `@`. Sin eso, este
 * fichero ejecutaría fórmulas en el Excel de quien lo abre — y quien lo abre es
 * precisamente la persona administradora.
 */
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
    return NextResponse.json({ error: 'Falta el identificador de la importación.' }, { status: 400 })
  }

  const csv = await getImportErrorsCsv(batchId)

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="mira-errores-importacion.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
