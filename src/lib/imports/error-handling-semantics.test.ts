// Que un fallo previsible NO acabe en la pantalla genérica de Next.
//
// ── Por qué es un test de texto y no de render ──────────────────────────────
//
// La suite corre en Node, sin jsdom ni testing-library, y no se van a añadir
// dependencias para esto. Así que se comprueba sobre el FUENTE, igual que los
// `sql-semantics` de este mismo módulo.
//
// No es una comprobación de estilo: el fallo original era exactamente una
// propiedad del texto —una promesa esperada dentro de `startTransition` sin
// `try/catch`—. React no recoge esa promesa: escala al error boundary, se lleva
// la pantalla entera y el usuario ve «Application error: a server-side
// exception has occurred» con el formulario y el batch validado dentro.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = process.cwd()

const WIZARD = join(RAIZ, 'src', 'components', 'admin', 'prices', 'PriceImportWizard.tsx')
const BOUNDARY = join(RAIZ, 'src', 'app', 'admin', 'error.tsx')
const ACCIONES = join(RAIZ, 'src', 'lib', 'actions', 'market-imports.ts')

function fuente(ruta: string): string {
  return readFileSync(ruta, 'utf8')
}

/** Fuente sin comentarios: aquí la prosa explica el bug y daría falsos positivos. */
function codigo(ruta: string): string {
  return fuente(ruta)
    .split('\n')
    .filter((l) => {
      const t = l.trimStart()
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')
}

describe('el asistente de importación captura sus propios errores', () => {
  it('no deja ninguna transición sin envolver', () => {
    const src = codigo(WIZARD)

    const transiciones = src.match(/startTransition\(/g) ?? []
    const envueltas = src.match(/startTransition\(\(\) => conAviso\(/g) ?? []

    expect(transiciones.length).toBeGreaterThan(0)
    expect(envueltas.length).toBe(transiciones.length)
  })

  it('no vuelve a la forma que provocaba la pantalla genérica', () => {
    // `startTransition(async () => { await accionDeServidor() })` es el patrón
    // exacto que rompía: la promesa rechazada no la recoge nadie.
    expect(codigo(WIZARD)).not.toMatch(/startTransition\(\s*async/)
  })

  it('el envoltorio es un try/catch de verdad y saneando el error', () => {
    const src = codigo(WIZARD)

    expect(src).toMatch(/async function conAviso\([\s\S]*?try\s*\{[\s\S]*?\}\s*catch/)
    expect(src).toContain('setError(toSafeImportError(e))')
    expect(src).toContain("from '@/lib/imports/errors'")
  })

  it('conserva el formulario: el error es estado, no una redirección', () => {
    const src = codigo(WIZARD)

    // Ni se reinicia el asistente ni se navega a ningún sitio al fallar.
    expect(src).not.toMatch(/catch[\s\S]{0,120}(reiniciar\(\)|router\.(push|replace))/)
    expect(src).toContain('role="alert"')
  })

  it('solo enseña la referencia técnica cuando existe', () => {
    expect(codigo(WIZARD)).toContain('{error.reference && (')
  })
})

describe('la Server Action de confirmación no devuelve texto de PostgreSQL', () => {
  it('elige el mensaje por SQLSTATE', () => {
    const src = codigo(ACCIONES)

    expect(src).toContain('safeCommitErrorMessage(error.code, error.message)')
    expect(src).toContain("from '@/lib/imports/errors'")
  })

  it('ya no reenvía error.message tal cual a la interfaz', () => {
    expect(codigo(ACCIONES)).not.toMatch(/return\s*\{\s*error:\s*error\.message/)
  })
})

describe('error boundary del panel de administración', () => {
  it('existe', () => {
    expect(existsSync(BOUNDARY)).toBe(true)
  })

  it('es un componente de cliente con la firma que Next espera', () => {
    const src = fuente(BOUNDARY)

    expect(src.trimStart().startsWith("'use client'")).toBe(true)
    expect(src).toMatch(/reset:\s*\(\)\s*=>\s*void/)
    expect(src).toMatch(/export default function/)
  })

  it('deja reintentar y volver al panel', () => {
    const src = codigo(BOUNDARY)

    expect(src).toContain('onClick={reset}')
    expect(src).toMatch(/href="\/admin"/)
  })

  it('no enseña nada interno del error', () => {
    const src = codigo(BOUNDARY)

    // El mensaje y el stack se quedan en los logs; a pantalla, solo el digest
    // y por el validador que comprueba su forma.
    expect(src).not.toContain('{error.message}')
    expect(src).not.toContain('{error.stack}')
    expect(src).not.toContain('{error.digest}')
    expect(src).toContain('safeErrorReference(error)')
  })

  it('dice que no se ha modificado ningún dato', () => {
    expect(fuente(BOUNDARY)).toMatch(/Ningún dato se ha modificado/i)
  })
})
