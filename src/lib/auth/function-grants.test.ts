// Privilegios de ejecución de las funciones de autorización (migración 029).
//
// ADVERTENCIA, la misma que en los demás `sql-semantics`: esto NO consulta la
// base de datos. Lee el TEXTO de las migraciones y comprueba que cada función
// de autorización nueva declara sus `revoke` y su `grant`. Es un test de
// contrato sobre el SQL versionado, no una verificación de la ACL real.
//
// ── Por qué existe ──────────────────────────────────────────────────────────
//
// Las migraciones 027 y 028 terminaban con `revoke all … from public`, y eso
// NO retiró el privilegio a `anon`: el proyecto tiene un
// `alter default privileges … grant execute on functions to anon,
// authenticated, service_role`, y ese grant es DIRECTO a `anon`, no heredado de
// `PUBLIC`. Ambas funciones quedaron ejecutables por usuarios anónimos.
//
// Mientras ese default privilege siga vigente, cada función nueva nacerá con el
// mismo problema. Este test hace que se note al escribir la migración, no meses
// después auditando permisos a mano.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function readMigrations(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), 'utf8') }))
}

/** Todo el SQL versionado concatenado, en minúsculas y con espacios normalizados. */
function allSql(): string {
  return readMigrations()
    .map((m) => m.sql)
    .join('\n')
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * Funciones de autorización creadas por 027 y 028, con su FIRMA COMPLETA.
 *
 * La firma completa no es cosmética: sin los tipos, PostgreSQL no resuelve la
 * función y una futura sobrecarga rompería el `revoke` en silencio.
 */
const AUTHZ_FUNCTIONS = [
  'public.org_module_enabled(uuid, text)',
  'public.market_enabled_for_user(uuid)',
] as const

describe('029 — privilegios de las funciones de autorización', () => {
  const sql = allSql()

  for (const fn of AUTHZ_FUNCTIONS) {
    const firma = fn.toLowerCase()

    describe(fn, () => {
      it('revoca a PUBLIC con la firma completa', () => {
        expect(sql).toContain(`revoke all on function ${firma} from public;`)
      })

      // El punto central del hotfix: revocar de PUBLIC no basta.
      it('revoca a anon EXPRESAMENTE con la firma completa', () => {
        expect(sql).toContain(`revoke all on function ${firma} from anon;`)
      })

      it('concede EXECUTE a authenticated', () => {
        expect(sql).toMatch(
          new RegExp(
            `grant execute on function ${firma.replace(/[.()]/g, '\\$&')} to [^;]*authenticated`,
          ),
        )
      })

      it('NUNCA concede EXECUTE a anon', () => {
        const grants = sql.match(
          new RegExp(`grant execute on function ${firma.replace(/[.()]/g, '\\$&')} to [^;]+;`, 'g'),
        )
        expect(grants, `no se encontró ningún grant para ${fn}`).toBeTruthy()
        for (const grant of grants ?? []) {
          expect(grant).not.toContain('anon')
        }
      })
    })
  }

  it('la migración 029 existe y usa firmas completas, nunca el nombre a secas', () => {
    const m029 = readMigrations().find((m) => m.name.includes('_029_'))
    expect(m029, 'falta la migración 029').toBeTruthy()

    const cuerpo = m029!.sql.toLowerCase()
    // Un `revoke … on function public.org_module_enabled from anon` sin tipos
    // sería sintácticamente inválido en Postgres y, peor, ambiguo con una
    // sobrecarga futura.
    expect(cuerpo).not.toMatch(/on function public\.org_module_enabled\s+from/)
    expect(cuerpo).not.toMatch(/on function public\.market_enabled_for_user\s+from/)
  })

  it('029 no altera lógica: sin create function, policy, table ni DML', () => {
    const m029 = readMigrations().find((m) => m.name.includes('_029_'))!
    // Se quitan los comentarios antes de mirar: el fichero los usa para
    // explicar el problema y menciona esas palabras en prosa.
    const ejecutable = m029.sql
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n')
      .toLowerCase()

    for (const prohibido of [
      'create or replace function',
      'create policy',
      'drop policy',
      'create table',
      'alter table',
      'insert into',
      'update ',
      'delete from',
    ]) {
      expect(ejecutable, `029 no debe contener «${prohibido}»`).not.toContain(prohibido)
    }
  })
})

describe('regresión — toda función de autorización futura debe revocar a anon', () => {
  // Si alguien añade una función `security definer` de autorización en una
  // migración nueva y olvida el `revoke … from anon`, nacerá ejecutable por
  // usuarios anónimos por culpa del default privilege del esquema. Este test
  // lo detecta en el momento de escribirla.
  it('las funciones de autorización conocidas declaran su revoke a anon', () => {
    const sql = allSql()
    const sinRevoke = AUTHZ_FUNCTIONS.filter(
      (fn) => !sql.includes(`revoke all on function ${fn.toLowerCase()} from anon;`),
    )
    expect(sinRevoke).toEqual([])
  })

  it('ninguna migración concede EXECUTE a anon sobre una función', () => {
    for (const { name, sql } of readMigrations()) {
      const ejecutable = sql
        .split('\n')
        .filter((l) => !l.trimStart().startsWith('--'))
        .join('\n')
        .toLowerCase()
        .replace(/\s+/g, ' ')

      const grants = ejecutable.match(/grant execute on function [^;]+;/g) ?? []
      for (const grant of grants) {
        expect(grant, `${name} concede EXECUTE a anon`).not.toMatch(/\bto\b[^;]*\banon\b/)
      }
    }
  })
})
