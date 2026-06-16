import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'

const COLUMNS = [
  'nombre',
  'email',
  'telefono',
  'web',
  'nif_cif',
  'pais',
  'provincia',
  'localidad',
  'codigo_postal',
  'direccion',
  'latitud',
  'longitud',
  'categoria',
  'mercado',
  'familia',
  'subfamilia',
  'produccion',
  'medida',
  'notas',
  'activo',
]

const EXAMPLE_ROWS = [
  {
    nombre: 'Cooperativa Lechera del Norte',
    email: 'contacto@lecheranorte.es',
    telefono: '+34 985 11 22 33',
    web: 'https://lecheranorte.es',
    nif_cif: 'F33001122',
    pais: 'ES',
    provincia: 'Asturias',
    localidad: 'Oviedo',
    codigo_postal: '33001',
    direccion: 'Polígono Industrial Silvota, nave 12',
    latitud: 43.3619,
    longitud: -5.8494,
    categoria: 'Productor',
    mercado: '',
    familia: 'Lácteos',
    subfamilia: 'Leche cruda',
    produccion: '12000 TN',
    medida: 'litro',
    notas: 'Recogida diaria',
    activo: 'si',
  },
  {
    nombre: 'Cítricos del Mediterráneo S.L.',
    email: 'ventas@citricosmed.com',
    telefono: '961 00 11 22',
    web: '',
    nif_cif: 'B46002233',
    pais: 'ES',
    provincia: 'Valencia',
    localidad: 'Alzira',
    codigo_postal: '46600',
    direccion: 'Camí de l\'Alquerieta, 8',
    latitud: 39.1503,
    longitud: -0.4344,
    categoria: 'Exportador',
    mercado: '',
    familia: 'Frutas',
    subfamilia: 'Cítricos',
    produccion: '5000 TN',
    medida: 'kg',
    notas: '',
    activo: '1',
  },
  {
    nombre: 'Molinos de Castilla',
    email: '',
    telefono: '',
    web: '',
    nif_cif: '',
    pais: 'ES',
    provincia: 'Valladolid',
    localidad: 'Medina del Campo',
    codigo_postal: '47400',
    direccion: '',
    latitud: '',
    longitud: '',
    categoria: 'Transformador',
    mercado: '',
    familia: 'Cereales',
    subfamilia: 'Harinas',
    produccion: '',
    medida: 'TN',
    notas: 'Sin coordenadas: no aparecerá en el mapa',
    activo: 'no',
  },
]

export async function GET(request: NextRequest) {
  // Guard: solo admins (mismo patrón que la plantilla de precios)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'platform_admin') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  const format = request.nextUrl.searchParams.get('format') ?? 'csv'

  const worksheet = XLSX.utils.json_to_sheet(EXAMPLE_ROWS, { header: COLUMNS })
  const workbook  = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla proveedores')

  if (format === 'xlsx') {
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="plantilla-proveedores-mira.xlsx"',
      },
    })
  }

  // CSV con separador ';' por compatibilidad con Excel en España.
  // BOM UTF-8 para que Excel respete los acentos.
  const csv = '﻿' + XLSX.utils.sheet_to_csv(worksheet, { FS: ';' })
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="plantilla-proveedores-mira.csv"',
    },
  })
}
