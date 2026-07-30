import { NextRequest, NextResponse } from 'next/server'
import { authorizePlatformAdminApi } from '@/lib/auth/guards'
import { authorizationApiMessage, authorizationHttpStatus } from '@/lib/auth/errors'
import { getSupplierUpdateReportRows } from '@/lib/actions/supplier-updates'
import {
  buildUpdateReportFilename,
  buildUpdateReportWorkbook,
} from '@/lib/suppliers/bulk-update/report'

/**
 * Informe XLSX de una actualización masiva (Fase 3.2).
 *
 * ── Autorización ───────────────────────────────────────────────────────────
 *
 * Doble, y las dos hacen falta:
 *
 *   · `authorizePlatformAdminApi` corta aquí con 401/403 —un Route Handler no
 *     puede redirigir a /login devolviendo un binario—;
 *   · RLS (`admin_all_supplier_update_rows`) vuelve a cortarlo por su cuenta al
 *     leer, así que un fallo en el guard no expondría el informe.
 *
 * El informe contiene notas internas en las columnas de valores: es
 * exactamente el tipo de contenido que 032 cerró para los clientes.
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
    return NextResponse.json({ error: 'Falta el identificador de la actualización.' }, { status: 400 })
  }

  const filas = await getSupplierUpdateReportRows(batchId)
  if (filas.length === 0) {
    return NextResponse.json({ error: 'No se ha encontrado la actualización.' }, { status: 404 })
  }

  const buffer = buildUpdateReportWorkbook(filas)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${buildUpdateReportFilename()}"`,
      'Cache-Control': 'no-store',
    },
  })
}
