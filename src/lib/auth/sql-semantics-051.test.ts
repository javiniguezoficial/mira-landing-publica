// Semántica de la migración 051 · el histórico sobrevive a la cuenta.
//
// La regla de producto que este fichero protege: eliminar un usuario libera su
// identidad —correo incluido— y el histórico de negocio se conserva
// desvinculado. Antes de la 051, `support_tickets.user_id` era CASCADE (borrar
// la cuenta destruía la conversación) y `rfqs.created_by` era NO ACTION y NOT
// NULL (la base rechazaba el borrado). Eran las DOS únicas excepciones al
// patrón SET NULL del resto del esquema, y las dos obligaban a la aplicación a
// bloquear la eliminación.
//
// ADVERTENCIA, la de siempre: esto NO consulta la base; lee el TEXTO del SQL
// versionado. La verificación real está en el informe del bloque: md5 del SQL
// ejecutable idéntico repo/remoto, FKs comprobadas en `pg_constraint` y un
// ciclo completo crear → histórico → eliminar → correo libre → recrear
// ejecutado contra el proyecto remoto con fixtures y limpieza.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function nombreDe(fragmento: string): string {
  const f = readdirSync(MIGRATIONS_DIR).find((x) => x.includes(fragmento))
  if (!f) throw new Error(`Falta la migración ${fragmento}`)
  return f
}

function sqlEjecutable(nombreFichero: string): string {
  return readFileSync(join(MIGRATIONS_DIR, nombreFichero), 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

const sql = () => sqlEjecutable(nombreDe('_051_'))

describe('051 · lo que cambia', () => {
  it('lleva el `version` real con el que quedó registrada en remoto', () => {
    expect(nombreDe('_051_')).toBe('20260914161010_051_user_deletion_preserves_history.sql')
  })

  it('support_tickets.user_id pasa de CASCADE a SET NULL, y admite NULL', () => {
    const s = sql()
    expect(s).toContain('alter table public.support_tickets alter column user_id drop not null')
    expect(s).toContain('alter table public.support_tickets drop constraint support_tickets_user_id_fkey')
    expect(s).toContain(
      'add constraint support_tickets_user_id_fkey foreign key (user_id) references public.profiles(id) on delete set null',
    )
  })

  it('rfqs.created_by pasa de NO ACTION NOT NULL a SET NULL nullable', () => {
    const s = sql()
    expect(s).toContain('alter table public.rfqs alter column created_by drop not null')
    expect(s).toContain('alter table public.rfqs drop constraint rfqs_created_by_fkey')
    expect(s).toContain(
      'add constraint rfqs_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null',
    )
  })

  it('documenta la semántica nueva en ambas columnas', () => {
    const s = sql()
    expect(s).toContain('comment on column public.support_tickets.user_id')
    expect(s).toContain('comment on column public.rfqs.created_by')
  })
})

describe('051 · lo que NO toca', () => {
  it('ni policies, ni RLS, ni funciones, ni triggers, ni datos', () => {
    const s = sql()
    expect(s).not.toMatch(/create policy|alter policy|drop policy/)
    expect(s).not.toMatch(/row level security/)
    expect(s).not.toMatch(/create (or replace )?function/)
    expect(s).not.toMatch(/create trigger|drop trigger/)
    expect(s).not.toMatch(/\bupdate\b|\bdelete from\b|\binsert into\b/)
  })

  it('no toca ninguna otra tabla', () => {
    const alters = sql().match(/alter table public\.(\w+)/g) ?? []
    const tablas = new Set(alters.map((a) => a.replace('alter table public.', '')))
    expect([...tablas].sort()).toEqual(['rfqs', 'support_tickets'])
  })

  it('las cascadas de DATO DE CUENTA no se mencionan: siguen en CASCADE', () => {
    // `organization_members` y `user_market_favorites` deben seguir
    // desapareciendo con la cuenta: no son histórico.
    const s = sql()
    expect(s).not.toContain('organization_members')
    expect(s).not.toContain('user_market_favorites')
    expect(s).not.toMatch(/alter table public\.profiles/)
  })
})

describe('051 · corrige encima, no reescribe', () => {
  it('las migraciones que crearon las FK originales siguen intactas', () => {
    const todas = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql') && !f.includes('_051_'))
    const textoCompleto = todas
      .map((f) => sqlEjecutable(f))
      .join('\n')

    // La versión CASCADE de tickets y la NO ACTION de rfqs deben seguir
    // existiendo en el histórico de migraciones: si desaparecieran, alguien
    // habría editado una migración aplicada.
    expect(textoCompleto).toMatch(/user_id[^,)]*references public\.profiles\(id\) on delete cascade/)
    expect(textoCompleto).toMatch(/created_by[^,)]*references (public\.)?profiles\(id\)(?! on delete set null)/)
  })
})
