import { NextResponse } from 'next/server'
import { authorizePlatformAdminApi } from '@/lib/auth/guards'
import { authorizationApiMessage, authorizationHttpStatus } from '@/lib/auth/errors'
import {
  UPDATE_TEMPLATE_FILENAME,
  buildUpdateTemplateWorkbook,
} from '@/lib/suppliers/bulk-update/report'

/**
 * Plantilla de actualización masiva (Fase 3.2).
 *
 * Es una alternativa a la exportación administrativa, no su sustituta: quien ya
 * tiene una exportación puede subirla tal cual. La plantilla sirve para quien
 * va a tocar solo unos pocos proveedores y no quiere arrastrar 12.288 filas.
 *
 * ── Por qué se genera aquí y no es un fichero estático ────────────────────
 *
 * Porque las cabeceras salen de la MISMA allowlist que valida el parser
 * (`TEMPLATE_HEADERS`). Un fichero estático en `public/` se quedaría desfasado
 * el día que se añada un campo, y nadie lo notaría hasta rellenar una columna
 * que se ignora en silencio.
 */
export async function GET() {
  const auth = await authorizePlatformAdminApi()
  if (!auth.ok) {
    return NextResponse.json(
      { error: authorizationApiMessage(auth.error.code) },
      { status: authorizationHttpStatus(auth.error.code) },
    )
  }

  const buffer = buildUpdateTemplateWorkbook()

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${UPDATE_TEMPLATE_FILENAME}"`,
      'Cache-Control': 'no-store',
    },
  })
}
