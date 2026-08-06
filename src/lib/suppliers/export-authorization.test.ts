// Restricción de la exportación de proveedores (039).
//
// ADVERTENCIA: esto NO ejecuta el endpoint. Lee el CÓDIGO FUENTE y fija las
// dos capas de protección que el cliente pidió. La comprobación real —llamar a
// la URL como Ana y recibir 403— está en la verificación funcional del bloque.
//
// ── Qué se decidió ──────────────────────────────────────────────────────────
//
// La descarga XLSX queda SOLO para `platform_admin`:
//
//   owner de organización   no        comprador   no
//   admin de organización   no        vendedor    no
//   miembro                 no        platform_admin  SÍ
//
// Ver y BUSCAR proveedores sigue abierto: el cliente solo pidió restringir la
// descarga.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function fuente(...ruta: string[]): string {
  return readFileSync(join(process.cwd(), 'src', ...ruta), 'utf8')
}

/** El archivo sin comentarios: «esto ya no está» debe mirar el código. */
function sinComentarios(texto: string): string {
  return texto
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const RUTA = fuente('app', 'api', 'admin', 'suppliers-export', 'route.ts')
const ACCION = fuente('lib', 'actions', 'supplier-bulk.ts')
const TOOLBAR = fuente('components', 'app', 'suppliers', 'SupplierResultsToolbar.tsx')
const LISTA_CLIENTE = fuente('components', 'app', 'suppliers', 'SupplierListClient.tsx')
const TABLA_ADMIN = fuente('components', 'admin', 'suppliers', 'AdminSupplierTable.tsx')

// ═══════════════════════════════════════════════════════════════════════════
// Capa 1 — el endpoint HTTP
// ═══════════════════════════════════════════════════════════════════════════

describe('1. el Route Handler exige platform_admin', () => {
  it('llama al guard de API', () => {
    expect(RUTA).toContain('authorizePlatformAdminApi()')
  })

  // Que el botón esté oculto no protege nada: esta URL se escribe a mano.
  it('responde con el estado de autorización, no con un fichero', () => {
    expect(RUTA).toContain('authorizationHttpStatus(auth.error.code)')
    expect(RUTA).toContain('authorizationApiMessage(auth.error.code)')
  })

  // Si la comprobación fuera después, una petición sin permiso ya habría
  // recorrido la tabla de proveedores antes de que se le dijera que no.
  it('comprueba ANTES de leer un solo parámetro o tocar la base', () => {
    // Sobre el código, no sobre la prosa: los comentarios de la ruta explican
    // el diseño y nombran esas mismas expresiones más arriba.
    const codigo = sinComentarios(RUTA)
    const posGuard = codigo.indexOf('authorizePlatformAdminApi()')
    const posParams = codigo.indexOf('request.nextUrl.searchParams')
    const posDatos = codigo.indexOf('collectSuppliersForExport(')
    expect(posGuard).toBeGreaterThan(-1)
    expect(posGuard).toBeLessThan(posParams)
    expect(posGuard).toBeLessThan(posDatos)
  })

  it('no queda ninguna salida que devuelva el fichero sin pasar por el guard', () => {
    const codigo = sinComentarios(RUTA)
    const posGuard = codigo.indexOf('authorizePlatformAdminApi()')
    expect(codigo.indexOf('new NextResponse(new Uint8Array')).toBeGreaterThan(posGuard)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Capa 2 — la Server Action
// ═══════════════════════════════════════════════════════════════════════════

describe('2. la Server Action exige platform_admin por su cuenta', () => {
  // En Next.js toda función exportada de un archivo `'use server'` es un
  // endpoint invocable directamente. Proteger solo el Route Handler dejaría
  // `collectSuppliersForExport` accesible por su propio identificador.
  it('`resolveExportContext` deniega a quien no es administrador', () => {
    const codigo = sinComentarios(ACCION)
    expect(codigo).toContain('evaluatePlatformAdmin(context) !== null')
    expect(codigo).toContain("throw new AuthorizationError('FORBIDDEN'")
  })

  // La audiencia se deduce del contexto real; si el navegador pudiera decir
  // «soy admin», la exportación incluiría las notas internas.
  it('la audiencia NO llega como parámetro', () => {
    expect(ACCION).not.toMatch(/audience\s*:\s*ExportAudience\s*\)/)
    expect(ACCION).toContain('async function resolveExportContext(): Promise<ExportContext>')
  })

  it('ya no existe la rama que servía a un cliente con columnas reducidas', () => {
    const codigo = sinComentarios(ACCION)
    expect(codigo).not.toContain("audience: esAdmin ? 'admin' : 'client'")
    expect(codigo).not.toContain('onlyActive: !esAdmin')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Capa 3 — la interfaz (comodidad, no barrera)
// ═══════════════════════════════════════════════════════════════════════════

describe('3. el botón solo se pinta donde corresponde', () => {
  it('la barra de resultados recibe el permiso como prop', () => {
    expect(TOOLBAR).toContain('canExport?: boolean')
  })

  // Si alguien añade una superficie nueva y se olvida del prop, no aparece un
  // botón de descarga sin querer.
  it('por defecto NO se ofrece la exportación', () => {
    expect(TOOLBAR).toContain('canExport = false')
  })

  it('las DOS exportaciones —filtrada y de selección— dependen del permiso', () => {
    const codigo = sinComentarios(TOOLBAR)
    expect(codigo).toContain("{canExport && (")
    // Una por el botón general y otra por el de la barra de selección.
    expect((codigo.match(/canExport && \(/g) ?? []).length).toBe(2)
  })

  it('la administración sí exporta', () => {
    expect(TABLA_ADMIN).toContain('canExport')
  })

  it('el área de cliente NO exporta, y está escrito de forma explícita', () => {
    expect(LISTA_CLIENTE).toContain('canExport={false}')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Lo que NO se ha restringido
// ═══════════════════════════════════════════════════════════════════════════

describe('ver y buscar proveedores sigue abierto', () => {
  it('la lista del cliente sigue montando la barra de resultados', () => {
    expect(LISTA_CLIENTE).toContain('<SupplierResultsToolbar')
  })

  // El cliente pidió restringir la DESCARGA. Búsqueda secundaria y ordenación
  // no se tocan.
  it('la búsqueda secundaria y la ordenación no dependen del permiso', () => {
    const codigo = sinComentarios(TOOLBAR)
    const posBusqueda = codigo.indexOf('function buscar')
    const posOrden = codigo.indexOf('function ordenar')
    expect(posBusqueda).toBeGreaterThan(-1)
    expect(posOrden).toBeGreaterThan(-1)
    expect(codigo.slice(posBusqueda, posOrden)).not.toContain('canExport')
  })
})
