// Privacidad de `suppliers.notes` (migración 032).
//
// ADVERTENCIA, la de siempre: esto NO consulta la base de datos. Lee el TEXTO
// del SQL versionado y comprueba que la migración declara la protección, y
// comprueba en TypeScript que la exportación de cliente no puede contener
// notas. La verificación real —Ana bloqueada con 42501, admin leyendo por la
// función— está en el informe del bloque.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Supplier } from '@/lib/actions/suppliers'
import { buildExportRows, exportColumnsFor } from './export'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function migration032(): string {
  const nombre = readdirSync(MIGRATIONS_DIR).find((f) => f.includes('_032_'))
  if (!nombre) throw new Error('Falta la migración 032')
  return readFileSync(join(MIGRATIONS_DIR, nombre), 'utf8')
}

function ejecutable(texto: string): string {
  return texto
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

const SQL = ejecutable(migration032())

// ═══════════════════════════════════════════════════════════════════════════
// La protección está en PostgreSQL
// ═══════════════════════════════════════════════════════════════════════════

describe('privilegios de columna', () => {
  // El intento inicial fue `revoke select (notes)`, y NO funcionó: en
  // PostgreSQL los privilegios de columna solo suman, así que un SELECT de
  // tabla ya alcanza todas las columnas. Hay que retirar el de tabla.
  it('retira el SELECT de TABLA, no solo el de columna', () => {
    expect(SQL).toContain('revoke select on public.suppliers from authenticated;')
    expect(SQL).toContain('revoke select on public.suppliers from anon;')
  })

  it('vuelve a conceder solo las columnas permitidas', () => {
    expect(SQL).toMatch(/grant select \([^)]*\) on public\.suppliers to authenticated;/)
  })

  it('la concesión NO incluye notes', () => {
    const grant = SQL.match(/grant select \(([^)]*)\) on public\.suppliers to authenticated;/)?.[1] ?? ''
    expect(grant.length).toBeGreaterThan(50)
    expect(grant.split(',').map((c) => c.trim())).not.toContain('notes')
  })

  // Los campos comerciales siguen disponibles: su clasificación es de 3.5 y
  // este hotfix no la adelanta.
  it('sí incluye los campos comerciales y de ubicación', () => {
    const grant = SQL.match(/grant select \(([^)]*)\) on public\.suppliers to authenticated;/)?.[1] ?? ''
    const columnas = grant.split(',').map((c) => c.trim())
    for (const c of [
      'id', 'name', 'email', 'phone', 'tax_id', 'website',
      'country', 'region', 'city', 'postal_code', 'address',
      'latitude', 'longitude', 'produccion_value', 'is_active',
    ]) {
      expect(columnas, `${c} debe seguir siendo legible`).toContain(c)
    }
  })

  // Solo se cierra la LECTURA: la administración sigue escribiendo notas desde
  // el formulario.
  it('no toca INSERT, UPDATE ni DELETE', () => {
    expect(SQL).not.toMatch(/revoke (insert|update|delete)/)
  })
})

describe('search_suppliers deja de exponer notes', () => {
  // Es obligatorio: la función es SECURITY INVOKER, así que tras el revoke
  // fallaría con «permission denied for column notes» para todo el mundo.
  it('ya no selecciona notes', () => {
    // Se acota al cuerpo de search_suppliers: `admin_supplier_notes`, más
    // abajo en el mismo fichero, sí lee `s.notes` y debe hacerlo.
    const definicion =
      SQL.match(/create or replace function public\.search_suppliers[\s\S]*?\$function\$;/)?.[0] ?? ''
    expect(definicion.length).toBeGreaterThan(500)
    expect(definicion).not.toContain('s.notes')
    expect(definicion).not.toMatch(/notes text/)
  })

  it('sigue siendo SECURITY INVOKER: no se convierte en definer para esquivar el problema', () => {
    const definicion = SQL.match(/create or replace function public\.search_suppliers[\s\S]*?\$function\$;/)?.[0] ?? ''
    expect(definicion).not.toContain('security definer')
  })

  it('conserva búsqueda secundaria, orden y desempate de la 031', () => {
    expect(SQL).toContain('p_secondary_search')
    expect(SQL).toContain('p_sort')
    expect(SQL).toContain('s.id asc')
    expect(SQL).toContain('count(*) over() as total_count')
  })
})

describe('admin_supplier_notes', () => {
  it('valida platform_admin DENTRO de la función', () => {
    const definicion = SQL.match(/create or replace function public\.admin_supplier_notes[\s\S]*?\$function\$;/)?.[0] ?? ''
    expect(definicion).toContain('public.is_platform_admin()')
    expect(definicion).toContain('security definer')
    expect(definicion).toContain('set search_path = public')
  })

  it('solo devuelve id y notes, no es una puerta a la tabla', () => {
    const definicion = SQL.match(/create or replace function public\.admin_supplier_notes[\s\S]*?\$function\$;/)?.[0] ?? ''
    expect(definicion).toContain('returns table (id uuid, notes text)')
  })

  it('revoca a PUBLIC y a anon con la firma completa', () => {
    expect(SQL).toContain('revoke all on function public.admin_supplier_notes(uuid[]) from public;')
    expect(SQL).toContain('revoke all on function public.admin_supplier_notes(uuid[]) from anon;')
  })

  it('concede solo a authenticated y service_role', () => {
    expect(SQL).toContain('grant execute on function public.admin_supplier_notes(uuid[]) to authenticated, service_role;')
  })
})

describe('ninguna función nueva queda ejecutable por anon', () => {
  it('todos los grants excluyen anon', () => {
    const grants = SQL.match(/grant execute on function[^;]+;/g) ?? []
    expect(grants.length).toBeGreaterThan(0)
    for (const g of grants) {
      expect(g).not.toMatch(/\bto\b[^;]*\banon\b/)
    }
  })
})

describe('la migración no toca datos ni policies', () => {
  it('sin DML', () => {
    expect(SQL).not.toContain('insert into')
    expect(SQL).not.toContain('delete from')
    expect(SQL).not.toMatch(/\bupdate public\./)
  })

  it('sin cambios de policies ni de columnas', () => {
    expect(SQL).not.toContain('create policy')
    expect(SQL).not.toContain('drop policy')
    expect(SQL).not.toContain('alter table')
    expect(SQL).not.toContain('drop column')
  })

  // Este hotfix NO es 3.5: no clasifica campos comerciales ni introduce planes.
  it('no introduce planes ni membresías', () => {
    for (const t of ['plans', 'plan_id', 'membership', 'has_api', 'has_history', 'max_users']) {
      expect(SQL).not.toContain(t)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Y la exportación sigue respetando la separación
// ═══════════════════════════════════════════════════════════════════════════

function proveedor(over: Partial<Supplier> = {}): Supplier {
  return {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name: 'Agro Lleida SL', email: null, phone: null, website: null, tax_id: null,
    country: 'España', region: 'Lleida', city: 'Balaguer', postal_code: null, address: null,
    latitude: 41.79, longitude: 0.81, category: null, market_id: null,
    family: null, subfamily: null, produccion: null, produccion_value: null,
    produccion_unit: null, medida: null, notes: 'SECRETO INTERNO', is_active: true,
    created_at: '2026-07-05T11:02:43.146Z', updated_at: '2026-07-23T10:47:43.794Z',
    ...over,
  }
}

describe('exportación', () => {
  // Incluso si el objeto llegara con notas —no llega: la RPC las pone a null—,
  // la audiencia de cliente no tiene columna donde escribirlas.
  it('el cliente no exporta notes aunque el objeto las traiga', () => {
    const columnas = exportColumnsFor('client')
    expect(columnas.map((c) => c.key)).not.toContain('notes')

    const { rows } = buildExportRows([proveedor()], columnas)
    expect(JSON.stringify(rows)).not.toContain('SECRETO INTERNO')
  })

  it('administración sí las exporta cuando las tiene', () => {
    const columnas = exportColumnsFor('admin')
    expect(columnas.map((c) => c.key)).toContain('notes')

    const { rows } = buildExportRows([proveedor()], columnas)
    expect(JSON.stringify(rows)).toContain('SECRETO INTERNO')
  })

  it('sin notas cargadas, la columna de administración queda vacía', () => {
    const columnas = exportColumnsFor('admin')
    const { rows } = buildExportRows([proveedor({ notes: null })], columnas)
    const celda = rows[0][columnas.findIndex((c) => c.key === 'notes')]
    expect(celda.v).toBe('')
  })
})
