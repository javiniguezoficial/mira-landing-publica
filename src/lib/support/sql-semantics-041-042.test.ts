// Semántica SQL del estado de lectura de las respuestas de soporte (041/042).
//
// ADVERTENCIA, la de siempre: esto NO consulta la base de datos. Lee el TEXTO
// del SQL versionado y comprueba que las migraciones declaran lo que la
// aplicación da por hecho.
//
// El comportamiento REAL se verificó contra la base de producción antes de
// escribir esto, con `do $$ … raise exception` para forzar el rollback:
//
//   · guardar la MISMA respuesta        → `admin_responded_at` no se mueve;
//   · cambiar la respuesta              → se sella y vuelve a estar sin leer;
//   · la RPC de un usuario              → marca 1 fila propia y deja SIN LEER
//                                          la de otro usuario;
//   · marcar como leído                 → `updated_at` queda INTACTO.
//
// Estos tests existen para que un cambio futuro del SQL no rompa en silencio
// ninguna de esas cuatro propiedades.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function migracion(prefijo: string): string {
  const nombre = readdirSync(MIGRATIONS_DIR).find((f) => f.includes(prefijo))
  if (!nombre) throw new Error(`Falta la migración ${prefijo}`)
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

const SQL_041 = ejecutable(migracion('_041_'))
const SQL_042 = ejecutable(migracion('_042_'))

// ═══════════════════════════════════════════════════════════════════════════
// Columnas
// ═══════════════════════════════════════════════════════════════════════════

describe('041 — las dos marcas de tiempo', () => {
  it('añade `admin_responded_at` y `response_seen_at`', () => {
    expect(SQL_041).toContain('add column if not exists admin_responded_at timestamptz')
    expect(SQL_041).toContain('add column if not exists response_seen_at timestamptz')
  })

  it('son NULLABLE: un ticket sin responder no tiene ninguna de las dos', () => {
    expect(SQL_041).not.toMatch(/admin_responded_at timestamptz not null/)
    expect(SQL_041).not.toMatch(/response_seen_at timestamptz not null/)
  })

  it('no toca ninguna columna existente', () => {
    expect(SQL_041).not.toContain('drop column')
    expect(SQL_041).not.toContain('alter column')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Trigger
// ═══════════════════════════════════════════════════════════════════════════

describe('trigger de estado de respuesta', () => {
  it('se dispara BEFORE UPDATE sobre support_tickets', () => {
    expect(SQL_041).toContain('before update on public.support_tickets')
    expect(SQL_041).toContain('create trigger support_tickets_response_state')
  })

  it('el nombre ordena DESPUÉS de `set_updated_at_support_tickets`', () => {
    // PostgreSQL dispara los BEFORE por orden alfabético. Este trigger tiene
    // que poder deshacer el `updated_at` que aquel acaba de poner.
    expect('support_tickets_response_state' > 'set_updated_at_support_tickets').toBe(true)
  })

  it('solo sella cuando la respuesta CAMBIA de verdad', () => {
    // `is distinct from` trata NULL como un valor más: guardar el mismo texto
    // no entra en la rama y no vuelve a marcar la respuesta como nueva.
    expect(SQL_042).toContain('if new.admin_response is distinct from old.admin_response then')
    expect(SQL_042).toContain('new.admin_responded_at := now()')
  })

  it('una respuesta en blanco NO cuenta como respuesta', () => {
    expect(SQL_042).toContain("coalesce(btrim(new.admin_response), '') <> ''")
    // Al retirarla se limpian las dos marcas: nada que leer, ninguna fecha.
    expect(SQL_042).toContain('new.admin_responded_at := null')
  })

  it('042 — una respuesta nueva vuelve a dejarla SIN LEER', () => {
    // Es lo que permite que «sin leer» sea una sola columna.
    expect(SQL_042).toMatch(/new\.admin_responded_at := now\(\); new\.response_seen_at := null/)
  })

  it('marcar como leído NO mueve `updated_at`', () => {
    // Esa fecha se le enseña al usuario y al administrador. Leer no es
    // actualizar.
    expect(SQL_042).toContain('new.updated_at := old.updated_at')
    // Y solo cuando LO ÚNICO que cambia es la marca de lectura.
    for (const col of ['admin_response', 'status', 'priority', 'subject', 'message']) {
      expect(SQL_042, col).toContain(`new.${col} is not distinct from old.${col}`)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Seguridad de la escritura
// ═══════════════════════════════════════════════════════════════════════════

describe('el cliente NO gana superficie de escritura', () => {
  it('ninguna de las dos migraciones crea una policy UPDATE', () => {
    for (const sql of [SQL_041, SQL_042]) {
      expect(sql).not.toContain('for update')
      expect(sql).not.toContain('create policy')
    }
  })

  it('la RPC no acepta parámetros: no hay identificador que manipular', () => {
    expect(SQL_041).toContain('function public.mark_my_support_responses_seen() returns integer')
    expect(SQL_042).toContain('function public.mark_my_support_responses_seen() returns integer')
  })

  it('el conjunto de filas lo decide auth.uid(), no quien llama', () => {
    expect(SQL_042).toContain('v_uid uuid := auth.uid()')
    expect(SQL_042).toContain('where t.user_id = v_uid')
  })

  it('sin sesión no marca nada, y no es un error', () => {
    expect(SQL_042).toMatch(/if v_uid is null then return 0/)
  })

  it('solo escribe UNA columna', () => {
    // Se acota al SET: `user_id` aparece —y debe aparecer— en el WHERE, que es
    // justamente lo que restringe las filas a las de quien llama.
    const sentencia = SQL_042.slice(
      SQL_042.indexOf('update public.support_tickets t'),
      SQL_042.indexOf('get diagnostics'),
    )
    const set = sentencia.slice(sentencia.indexOf(' set '), sentencia.indexOf(' where '))

    expect(set).toContain('response_seen_at = now()')
    for (const col of ['admin_response', 'status', 'priority', 'user_id', 'organization_id', 'subject']) {
      expect(set, col).not.toContain(`${col} =`)
    }
    // Una sola asignación: no hay comas en el SET.
    expect(set).not.toContain(',')
  })

  it('la RPC es security definer con search_path fijo', () => {
    expect(SQL_041).toContain('security definer set search_path = public')
  })

  it('se concede EXECUTE solo a `authenticated`, nunca a `anon`', () => {
    expect(SQL_041).toContain('revoke all on function public.mark_my_support_responses_seen() from public, anon')
    expect(SQL_041).toContain('grant execute on function public.mark_my_support_responses_seen() to authenticated')
  })

  it('la función de trigger NO es invocable por nadie por RPC', () => {
    expect(SQL_041).toContain(
      'revoke all on function public.handle_support_response_state() from public, anon, authenticated',
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Respuestas anteriores a la migración
// ═══════════════════════════════════════════════════════════════════════════

describe('backfill — lo histórico se considera LEÍDO', () => {
  it('rellena las dos marcas con `updated_at`', () => {
    expect(SQL_041).toContain('set admin_responded_at = coalesce(admin_responded_at, updated_at)')
    expect(SQL_041).toContain('response_seen_at = coalesce(response_seen_at, updated_at)')
    // Con las dos iguales, `response_seen_at` NO es null → cuenta como leída.
    // Nadie se encuentra mañana un aviso por respuestas de hace meses.
  })

  it('solo toca tickets que YA tienen respuesta', () => {
    expect(SQL_041).toContain("where admin_response is not null and btrim(admin_response) <> ''")
  })

  it('es idempotente: no repisa lo ya relleno', () => {
    expect(SQL_041).toContain('(admin_responded_at is null or response_seen_at is null)')
  })

  it('NO mueve la «Última actualización» de los tickets históricos', () => {
    // Sin desactivar el trigger, esta migración habría movido `updated_at` de
    // todos los tickets respondidos a la fecha del despliegue.
    expect(SQL_041).toContain('disable trigger set_updated_at_support_tickets')
    expect(SQL_041).toContain('enable trigger set_updated_at_support_tickets')
  })

  it('no borra ni reescribe ningún dato existente', () => {
    expect(SQL_041).not.toContain('delete from')
    expect(SQL_041).not.toContain('truncate')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Índice
// ═══════════════════════════════════════════════════════════════════════════

describe('índice del recuento', () => {
  it('es PARCIAL sobre las que están sin leer', () => {
    // El recuento corre en cada navegación del portal. Los tickets sin
    // responder —la mayoría con el tiempo— ni entran en el índice.
    expect(SQL_042).toContain(
      'where admin_responded_at is not null and response_seen_at is null',
    )
  })

  it('va por `user_id`, que es como se consulta', () => {
    expect(SQL_042).toContain('on public.support_tickets (user_id)')
  })
})
