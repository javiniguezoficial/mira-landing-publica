import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { authorizePlatformAdminApi } from '@/lib/auth/guards'
import { authorizationApiMessage, authorizationHttpStatus } from '@/lib/auth/errors'

const COLUMNS = [
  'market_slug',
  'product_slug',
  'recorded_at',
  'price',
  'unit',
  'currency',
  'country',
  'region',
  'min_price',
  'max_price',
  'avg_price',
  'volume',
  'source_name',
  'notes',
]

const EXAMPLE_ROWS = [
  {
    market_slug: 'pollo-espana',
    product_slug: 'pollo-vivo',
    recorded_at: '2026-06-01',
    price: 1.22,
    unit: 'kg',
    currency: 'EUR',
    country: 'ES',
    region: '',
    min_price: 1.18,
    max_price: 1.26,
    avg_price: 1.22,
    volume: '',
    source_name: 'Lonja Bellpuig',
    notes: '',
  },
  {
    market_slug: 'pollo-espana',
    product_slug: 'pechuga-pollo',
    recorded_at: '2026-06-01',
    price: 3.85,
    unit: 'kg',
    currency: 'EUR',
    country: 'ES',
    region: '',
    min_price: 3.70,
    max_price: 4.00,
    avg_price: 3.85,
    volume: '',
    source_name: 'Mercado Mayorista',
    notes: '',
  },
  {
    market_slug: 'cereales-espana',
    product_slug: 'trigo-blando',
    recorded_at: '2026-06-01',
    price: 228.5,
    unit: 'ton',
    currency: 'EUR',
    country: 'ES',
    region: 'Castilla',
    min_price: 224,
    max_price: 233,
    avg_price: 228.5,
    volume: 500,
    source_name: 'MFAO',
    notes: '',
  },
  {
    market_slug: 'cereales-espana',
    product_slug: 'maiz-amarillo',
    recorded_at: '2026-06-01',
    price: 199.0,
    unit: 'ton',
    currency: 'EUR',
    country: 'ES',
    region: '',
    min_price: 195,
    max_price: 203,
    avg_price: 199.0,
    volume: '',
    source_name: '',
    notes: 'Precio de origen',
  },
  {
    market_slug: 'energia-electrica',
    product_slug: 'electricidad-omie',
    recorded_at: '2026-06-01',
    price: 82.4,
    unit: 'MWh',
    currency: 'EUR',
    country: 'ES',
    region: '',
    min_price: 74.1,
    max_price: 91.2,
    avg_price: 82.4,
    volume: '',
    source_name: 'OMIE',
    notes: 'Precio spot diario',
  },
]

export async function GET(request: NextRequest) {
  // Guard: solo admins. Un Route Handler responde JSON — nunca redirige.
  const auth = await authorizePlatformAdminApi()
  if (!auth.ok) {
    return NextResponse.json(
      { error: authorizationApiMessage(auth.error.code) },
      { status: authorizationHttpStatus(auth.error.code) },
    )
  }

  const format = request.nextUrl.searchParams.get('format') ?? 'csv'

  const worksheet = XLSX.utils.json_to_sheet(EXAMPLE_ROWS, { header: COLUMNS })
  const workbook  = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla MIRA')

  if (format === 'xlsx') {
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="plantilla-precios-mira.xlsx"',
      },
    })
  }

  // CSV por defecto
  const csv = XLSX.utils.sheet_to_csv(worksheet)
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="plantilla-precios-mira.csv"',
    },
  })
}
