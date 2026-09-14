// Semántica de la migración 053 · «Compro y vendo» también vende.
//
// El bug, desde la 026: `v_can_sell := p_commercial_profile = 'seller'` dejaba
// a un registro `buyer_seller` con Comprar ✓ y Vender ✗ — la mitad de lo que
// pidió. La regla de producto correcta, verificada además EN VIVO contra la
// función desplegada (tres altas con rollback):
//
//   buyer        → compra=t · vende=f
//   seller       → compra=f · vende=t
//   buyer_seller → compra=t · vende=t
//
// ADVERTENCIA, la de siempre: esto NO consulta la base; lee el TEXTO del SQL
// versionado. md5 repo==remoto y la matriz en vivo están en el informe.

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

const sql = () => sqlEjecutable('_053_')

// La misma lógica que la RPC, en TypeScript, para poder FIJAR la matriz como
// tabla de verdad y no solo como texto.
function capacidades(perfil: string): { canBuy: boolean; canSell: boolean } {
  return {
    canBuy: ['buyer', 'buyer_seller'].includes(perfil),
    canSell: ['seller', 'buyer_seller'].includes(perfil),
  }
}

describe('053 · la matriz de capacidades', () => {
  it('lleva el `version` real con el que quedó registrada en remoto', () => {
    expect(nombreDe('_053_')).toBe('20260914172054_053_buyer_seller_can_sell.sql')
  })

  it('las dos expresiones, ya simétricas', () => {
    const s = sql()
    expect(s).toContain("v_can_buy := p_commercial_profile in ('buyer', 'buyer_seller')")
    expect(s).toContain("v_can_sell := p_commercial_profile in ('seller', 'buyer_seller')")
    // La expresión del bug no puede volver:
    expect(s).not.toContain("v_can_sell := p_commercial_profile = 'seller'")
  })

  it('buyer → compra sí, vende no', () => {
    expect(capacidades('buyer')).toEqual({ canBuy: true, canSell: false })
  })

  it('seller → compra no, vende sí', () => {
    expect(capacidades('seller')).toEqual({ canBuy: false, canSell: true })
  })

  it('buyer_seller → compra Y vende (el caso del bug)', () => {
    expect(capacidades('buyer_seller')).toEqual({ canBuy: true, canSell: true })
  })
})

describe('053 · conserva la 052 y todo lo demás', () => {
  it('el advisory lock de la 052 sigue, y sigue ANTES de la comprobación', () => {
    const s = sql()
    const candado = s.indexOf('pg_advisory_xact_lock')
    expect(candado).toBeGreaterThan(-1)
    expect(s).toContain("hashtextextended('org_signup:' || v_owner::text, 0)")
    expect(candado).toBeLessThan(s.indexOf('select om.organization_id into v_existente'))
  })

  it('idempotencia, autorización, validaciones y seguridad, intactas', () => {
    const s = sql()
    expect(s).toContain('if v_existente is not null then return v_existente; end if;')
    expect(s).toContain("errcode = '42501'")
    expect(s).toContain('el nombre de la empresa es obligatorio')
    expect(s).toContain('is_active = true')
    expect(s).toContain('security definer')
    expect(s).toContain('set search_path = public')
  })

  it('permisos re-declarados, sin `anon`', () => {
    const s = sql()
    expect(s).toMatch(/revoke execute on function public\.create_organization_with_owner[\s\S]*from public, anon/)
    expect(s).toMatch(/to authenticated, service_role/)
  })

  it('una sola función, ninguna otra cosa', () => {
    const s = sql()
    expect((s.match(/create or replace function/g) ?? []).length).toBe(1)
    expect(s).not.toMatch(/alter table|create policy|drop policy|statement_timeout|create index|drop index/)
  })
})

describe('053 · corrige encima, no reescribe', () => {
  it('la 026 y la 052 conservan sus versiones históricas', () => {
    // La 026 nació con el bug y la 052 lo copió fiel a propósito (su cometido
    // era el candado, no las capacidades). Que ambas sigan diciendo lo que
    // decían es la prueba de que nadie editó migraciones aplicadas.
    expect(sqlEjecutable('_026_')).toContain("v_can_sell := p_commercial_profile = 'seller'")
    expect(sqlEjecutable('_052_')).toContain("v_can_sell := p_commercial_profile = 'seller'")
  })
})
