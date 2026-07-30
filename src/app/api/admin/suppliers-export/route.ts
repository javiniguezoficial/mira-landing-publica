import { NextRequest, NextResponse } from 'next/server'
import { collectSuppliersForExport, sanitizeSupplierIds } from '@/lib/actions/supplier-bulk'
import { buildSuppliersWorkbook } from '@/lib/suppliers/export'
import {
  buildExportFilename,
  normalizeSupplierParams,
  parseExportMode,
  type SupplierListParams,
} from '@/lib/suppliers/list-params'
import { toNum } from '@/lib/pagination'

/**
 * Descarga de proveedores en XLSX (Fase 3.4).
 *
 * ── Por qué un Route Handler y no una Server Action ─────────────────────────
 *
 * Porque devuelve un fichero binario con sus cabeceras de descarga. Una Server
 * Action tendría que serializar el buffer y reconstruirlo en el navegador, que
 * es justo lo que se quiere evitar: el XLSX se arma entero en servidor.
 *
 * ── Autorización ───────────────────────────────────────────────────────────
 *
 * NO lleva `authorizePlatformAdminApi`: esta ruta la usan las dos superficies,
 * y un cliente puede exportar lo que ya ve. Quién es y qué columnas le
 * corresponden lo decide `collectSuppliersForExport` reconstruyendo el contexto
 * en servidor —nunca a partir de un parámetro—, y RLS vuelve a acotarlo por su
 * cuenta. Sin sesión, esa función devuelve el error de sesión y aquí sale un
 * 401.
 *
 * Está bajo `/api/admin/` solo por vecindad con el resto de rutas de descarga;
 * su control de acceso es el descrito, no el del prefijo.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams

  // Los filtros llegan por URL, EXACTAMENTE con los mismos nombres que usa el
  // listado. Es lo que garantiza que se exporta lo que se está viendo.
  const raw: SupplierListParams = {
    q: params.get('q') ?? undefined,
    qr: params.get('qr') ?? undefined,
    country: params.get('country') ?? undefined,
    region: params.get('region') ?? undefined,
    produccion_min: params.get('produccion_min') ?? undefined,
    produccion_max: params.get('produccion_max') ?? undefined,
    supplier_market_id: params.get('supplier_market_id') ?? undefined,
    supplier_category_id: params.get('supplier_category_id') ?? undefined,
    supplier_family_id: params.get('supplier_family_id') ?? undefined,
    supplier_subfamily_id: params.get('supplier_subfamily_id') ?? undefined,
    sort: params.get('sort') ?? undefined,
  }

  const normalized = normalizeSupplierParams(raw)
  const mode = parseExportMode(params.get('mode'))

  const selectedIds =
    mode === 'selected'
      ? await sanitizeSupplierIds((params.get('ids') ?? '').split(',').filter(Boolean))
      : undefined

  if (mode === 'selected' && (!selectedIds || selectedIds.length === 0)) {
    return NextResponse.json({ error: 'No has seleccionado ningún proveedor.' }, { status: 400 })
  }

  const resultado = await collectSuppliersForExport({
    filters: {
      search: normalized.filters.q,
      country: normalized.filters.country,
      region: normalized.filters.region,
      produccion_min: toNum(normalized.filters.produccion_min),
      produccion_max: toNum(normalized.filters.produccion_max),
      supplier_market_id: normalized.filters.supplier_market_id,
      supplier_category_id: normalized.filters.supplier_category_id,
      supplier_family_id: normalized.filters.supplier_family_id,
      supplier_subfamily_id: normalized.filters.supplier_subfamily_id,
      secondary_search: normalized.secondarySearch || undefined,
      sort: normalized.sort,
    },
    selectedIds,
  })

  if (resultado.error) {
    const status = resultado.error.includes('iniciar sesión') ? 401 : 400
    return NextResponse.json({ error: resultado.error }, { status })
  }

  if (resultado.suppliers.length === 0) {
    return NextResponse.json(
      { error: 'No hay proveedores que exportar con los filtros actuales.' },
      { status: 404 },
    )
  }

  const buffer = buildSuppliersWorkbook(resultado.suppliers, resultado.audience)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${buildExportFilename()}"`,
      'Cache-Control': 'no-store',
      // Aviso de recorte, para que la interfaz pueda decirlo sin adivinar.
      ...(resultado.truncated ? { 'X-Mira-Export-Truncated': '1' } : {}),
    },
  })
}
