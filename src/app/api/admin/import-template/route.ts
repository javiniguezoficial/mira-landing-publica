import { NextResponse } from 'next/server'
import { authorizePlatformAdminApi } from '@/lib/auth/guards'
import { authorizationApiMessage, authorizationHttpStatus } from '@/lib/auth/errors'
import { getImportTemplateCsv } from '@/lib/actions/market-imports'

/**
 * Plantilla oficial de importación (Fase 2.5).
 *
 * El contenido lo genera `getImportTemplateCsv`, junto al validador, para que la
 * plantilla y las columnas que se validan no puedan separarse. Una plantilla que
 * ofrece una columna que el validador ignora es peor que no tenerla.
 */
export async function GET() {
  const auth = await authorizePlatformAdminApi()
  if (!auth.ok) {
    return NextResponse.json(
      { error: authorizationApiMessage(auth.error.code) },
      { status: authorizationHttpStatus(auth.error.code) },
    )
  }

  const csv = await getImportTemplateCsv()

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="mira-plantilla-precios.csv"',
      'Cache-Control': 'no-store',
    },
  })
}
