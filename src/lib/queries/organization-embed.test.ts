// Guarda contra el embed ambiguo de PostgREST — regresión de 026.
//
// POR QUÉ ESTE TEST LEE CÓDIGO FUENTE
//
// El fallo que dejó a Ana en «No hemos podido comprobar tu acceso» no era de
// lógica: era una cadena de consulta. La migración 026 añadió
// `organizations.requested_plan_id`, con lo que `organizations` pasó a tener DOS
// claves ajenas hacia `plans`. A partir de ahí, `plan:plans(...)` es ambiguo y
// PostgREST responde:
//
//   PGRST201 — Could not embed because more than one relationship was found
//
// Ningún test de lógica pura lo detecta, y ningún tipo de TypeScript lo detecta,
// porque la cadena es un `string`. La única forma de impedir que vuelva a pasar
// es comprobar la cadena. El proyecto ya había sufrido exactamente lo mismo con
// `profiles`, que tiene dos FK desde `organization_members` (`user_id` e
// `invited_by`), y se arregló a mano sin dejar una guarda.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = process.cwd()

/** Ficheros que consultan `organizations` o `organization_members` con embeds. */
const FICHEROS = [
  'src/lib/queries/user-org.ts',
  'src/lib/queries/my-organization.ts',
  'src/lib/actions/organizations.ts',
  'src/lib/actions/users.ts',
]

/**
 * Devuelve el código sin comentarios.
 *
 * Los comentarios de estos ficheros CITAN la forma ambigua para explicar el
 * incidente, así que contarlos daría un falso positivo. Lo que importa es la
 * cadena que se envía a PostgREST, no lo que se escribe sobre ella.
 */
function leerCodigo(rel: string): string {
  return readFileSync(join(RAIZ, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
}

describe('embeds de PostgREST desambiguados', () => {
  it.each(FICHEROS)('%s no usa el embed ambiguo `plans(`', (rel) => {
    // `plans!organizations_plan_id_fkey(` no contiene la subcadena `plans(`,
    // así que cualquier coincidencia es un embed sin desambiguar.
    expect(leerCodigo(rel).match(/plans\(/g) ?? []).toEqual([])
  })

  it.each(FICHEROS)('%s no usa el embed ambiguo `profiles(`', (rel) => {
    // Mismo problema con `profiles`: `organization_members` tiene `user_id` e
    // `invited_by` apuntando a `profiles`.
    expect(leerCodigo(rel).match(/profiles\(/g) ?? []).toEqual([])
  })

  it('el embed de plan en la ruta de cliente apunta a plan_id, no a requested_plan_id', () => {
    // `requested_plan_id` es lo que el cliente PIDIÓ; `plan_id` es lo que se le
    // concedió. Enseñar el solicitado como si fuera el suyo sería mentir.
    const userOrg = leerCodigo('src/lib/queries/user-org.ts')
    expect(userOrg).toContain('plan:plans!organizations_plan_id_fkey(')
    expect(userOrg).not.toContain('requested_plan_id_fkey')

    const miOrg = leerCodigo('src/lib/queries/my-organization.ts')
    expect(miOrg).toContain('plan:plans!organizations_plan_id_fkey(')
    expect(miOrg).not.toContain('requested_plan_id_fkey')
  })

  it('un fallo al leer la organización con acceso activo se REGISTRA', () => {
    // Traducirlo a `invalid_context` sin dejar rastro fue lo que convirtió una
    // consulta rota en un aparente problema de permisos.
    for (const rel of ['src/lib/queries/user-org.ts', 'src/lib/queries/my-organization.ts']) {
      const fuente = leerCodigo(rel)
      expect(fuente).toContain('organización no legible con acceso activo')
      expect(fuente).toContain('console.error')
    }
  })
})
