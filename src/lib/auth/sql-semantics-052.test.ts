// Semántica de la migración 052 · candado de concurrencia del alta de empresa.
//
// ADVERTENCIA, la de siempre: esto NO consulta la base; lee el TEXTO del SQL
// versionado. La verificación contra el remoto está en el informe del bloque
// (md5 idéntico, `prosecdef`, y el candado presente en `pg_get_functiondef`).

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function nombreDe(fragmento: string): string {
  const f = readdirSync(MIGRATIONS_DIR).find((x) => x.includes(fragmento))
  if (!f) throw new Error(`Falta la migración ${fragmento}`)
  return f
}

function sqlEjecutable(fragmento: string): string {
  return readFileSync(join(MIGRATIONS_DIR, nombreDe(fragmento)), 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

const sql = () => sqlEjecutable('_052_')

describe('052 · el candado', () => {
  it('lleva el `version` real con el que quedó registrada en remoto', () => {
    expect(nombreDe('_052_')).toBe('20260914171302_052_org_signup_concurrency_lock.sql')
  })

  it('toma un advisory lock POR PROPIETARIO antes de comprobar pertenencia', () => {
    const s = sql()
    const candado = s.indexOf('pg_advisory_xact_lock')
    const comprobacion = s.indexOf('select om.organization_id into v_existente')

    expect(candado).toBeGreaterThan(-1)
    expect(comprobacion).toBeGreaterThan(-1)
    // El orden ES el arreglo: candado primero, lectura después. Al revés, dos
    // transacciones podrían leer «sin organización» a la vez y crear dos.
    expect(candado).toBeLessThan(comprobacion)
    // Clave derivada del propietario: altas de usuarios distintos no se frenan.
    expect(s).toContain("hashtextextended('org_signup:' || v_owner::text, 0)")
  })

  it('la idempotencia secuencial sigue: ya miembro → devuelve la existente', () => {
    const s = sql()
    expect(s).toContain('if v_existente is not null then return v_existente; end if;')
  })
})

describe('052 · lo que preserva intacto', () => {
  it('firma, security definer y search_path', () => {
    const s = sql()
    expect(s).toContain('create or replace function public.create_organization_with_owner(')
    expect(s).toContain('returns uuid')
    expect(s).toContain('security definer')
    expect(s).toContain('set search_path = public')
  })

  it('las reglas de autorización de la 026', () => {
    const s = sql()
    expect(s).toContain('if v_uid is null then')
    expect(s).toContain('no puedes crear una organización para otra persona')
    expect(s).toContain("errcode = '42501'")
  })

  it('las validaciones de negocio: nombre, perfil comercial y plan activo', () => {
    const s = sql()
    expect(s).toContain('el nombre de la empresa es obligatorio')
    expect(s).toContain("not in ('buyer', 'seller', 'buyer_seller')")
    expect(s).toContain('is_active = true')
  })

  it('un solo INSERT de organización y un solo owner', () => {
    const s = sql()
    expect((s.match(/insert into public\.organizations/g) ?? []).length).toBe(1)
    expect((s.match(/insert into public\.organization_members/g) ?? []).length).toBe(1)
    expect(s).toContain("'owner', 'client_owner', 'active'")
  })

  it('permisos re-declarados, sin `anon`', () => {
    const s = sql()
    expect(s).toContain('revoke execute on function public.create_organization_with_owner')
    expect(s).toMatch(/from public, anon/)
    expect(s).toMatch(/to authenticated, service_role/)
  })

  it('no toca nada más: ni policies, ni tablas, ni timeout', () => {
    const s = sql()
    expect(s).not.toMatch(/create policy|alter policy|drop policy/)
    expect(s).not.toMatch(/alter table/)
    expect(s).not.toMatch(/statement_timeout/)
    expect((s.match(/create or replace function/g) ?? []).length).toBe(1)
  })
})

describe('052 · corrige encima, no reescribe', () => {
  it('la 026, que creó la RPC, sigue intacta y SIN candado', () => {
    const s026 = sqlEjecutable('_026_')
    expect(s026).toContain('create or replace function public.create_organization_with_owner')
    expect(s026).not.toContain('pg_advisory_xact_lock')
  })
})
