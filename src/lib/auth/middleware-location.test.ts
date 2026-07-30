// El middleware de Next.js solo se carga desde `src/middleware.ts` cuando el
// proyecto usa el directorio `src/`. Estuvo en la raíz: compilaba, pasaba el
// lint y NUNCA se ejecutaba, así que /admin/* y /app/* quedaron sin ninguna
// comprobación de sesión ni de rol.
//
// Es un fallo invisible para el compilador y para los tests de comportamiento:
// el archivo es correcto, solo está en el sitio equivocado. Por eso su
// ubicación se fija aquí explícitamente.

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const raizProyecto = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

describe('ubicación del middleware', () => {
  it('existe en src/middleware.ts, que es donde Next lo carga', () => {
    expect(existsSync(resolve(raizProyecto, 'src/middleware.ts'))).toBe(true)
  })

  it('NO existe en la raíz, donde Next lo ignora en silencio', () => {
    expect(existsSync(resolve(raizProyecto, 'middleware.ts'))).toBe(false)
    expect(existsSync(resolve(raizProyecto, 'middleware.js'))).toBe(false)
  })

  it('el proyecto usa el directorio src/, que es lo que fuerza esa ubicación', () => {
    expect(existsSync(resolve(raizProyecto, 'src/app'))).toBe(true)
  })

  it('su matcher cubre /admin y /app', () => {
    const fuente = readFileSync(resolve(raizProyecto, 'src/middleware.ts'), 'utf8')
    // El matcher es una exclusión: cubre todo salvo estáticos e imágenes.
    expect(fuente).toContain('matcher')
    expect(fuente).toContain('_next/static')
    // Ninguna exclusión debe mencionar /admin ni /app.
    expect(fuente).not.toMatch(/\(\?!.*admin/)
    expect(fuente).not.toMatch(/\(\?!.*\bapp\b/)
  })
})

describe('el layout de /admin comprueba el rol en servidor', () => {
  const layout = readFileSync(resolve(raizProyecto, 'src/app/admin/layout.tsx'), 'utf8')

  it('invoca el guard central', () => {
    expect(layout).toContain('requirePlatformAdmin')
    expect(layout).toContain("from '@/lib/auth/guards'")
  })

  it('lo hace ANTES de renderizar AdminShell', () => {
    const posicionGuard = layout.indexOf('await requirePlatformAdmin')
    const posicionRender = layout.indexOf('<AdminShell>')
    expect(posicionGuard).toBeGreaterThan(-1)
    expect(posicionRender).toBeGreaterThan(-1)
    expect(posicionGuard).toBeLessThan(posicionRender)
  })

  it('es un Server Component: nada de "use client"', () => {
    expect(layout).not.toContain("'use client'")
    expect(layout).not.toContain('"use client"')
  })

  it('es asíncrono, para poder esperar al guard', () => {
    expect(layout).toMatch(/export default async function/)
  })
})

describe('los Route Handlers de /api/admin no dependen del layout', () => {
  const rutas = [
    // `price-template` se retiró con el importador antiguo (2.5): servía una
    // plantilla desfasada —sin `lonja`, con `source_name`— que ya no enlazaba
    // ninguna página. La sustituye `import-template`.
    'src/app/api/admin/supplier-template/route.ts',
    // 2.5 — las cuatro rutas de la importación masiva. Dos devuelven CSV y dos
    // JSON, pero todas exponen datos administrativos y necesitan su guard.
    'src/app/api/admin/import-template/route.ts',
    'src/app/api/admin/import-errors/route.ts',
    'src/app/api/admin/import-rows/route.ts',
    'src/app/api/admin/import-batch/route.ts',
  ]

  it('cada uno lleva su propio guard', () => {
    for (const ruta of rutas) {
      const fuente = readFileSync(resolve(raizProyecto, ruta), 'utf8')
      expect(fuente).toContain('authorizePlatformAdminApi')
    }
  })

  it('responden JSON con estado, nunca redirigen', () => {
    for (const ruta of rutas) {
      const fuente = readFileSync(resolve(raizProyecto, ruta), 'utf8')
      expect(fuente).toContain('authorizationHttpStatus')
      expect(fuente).toContain('NextResponse.json')
      expect(fuente).not.toContain('redirect(')
    }
  })
})
