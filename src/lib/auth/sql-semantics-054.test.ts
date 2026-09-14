// Semántica de la migración 054 · El registro público se activa solo.
//
// La regla de producto que fija: un alta de landing correcta —correo
// confirmado, empresa validada, plan del catálogo— queda OPERATIVA de
// inmediato. Sin aprobación administrativa. El alta administrativa conserva su
// comportamiento de siempre.
//
// Lo que se corrige de raíz: `organizations.status = 'pending'` era la única
// puerta cerrada. Ni el plan, ni el trial, ni la membresía. `trial` nunca
// significó «sin acceso».
//
// Y lo que NO era evidente: cambiar solo la RPC habría roto el registro entero,
// porque el ARRANQUE de `enforce_membership_rules` exigía que la organización
// estuviera `pending` para dejar que su propietario se insertara. Por eso la
// 054 toca tres funciones. Ese acoplamiento es lo que más vigilan estos tests.
//
// ADVERTENCIA, la de siempre: esto NO consulta la base; lee el TEXTO del SQL
// versionado. El md5 repo==remoto y el ensayo en vivo (32 comprobaciones con
// rollback, incluido el flujo completo de alta bajo el rol `authenticated`)
// están en el informe de la sesión.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { resolveInitialStatus, resolveOwnerCapabilities } from './signup'

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

const sql = () => sqlEjecutable('_054_')

describe('054 · el alta de landing nace operativa', () => {
  it('lleva el `version` real con el que quedó registrada en remoto', () => {
    expect(nombreDe('_054_')).toBe('20260914192658_054_self_service_activation.sql')
  })

  it('la rama NO administrativa activa, y solo cae a pending sin correo confirmado', () => {
    const s = sql()
    expect(s).toContain(
      "v_status := case when coalesce(v_confirmado, false) then 'active' else 'pending' end",
    )
    expect(s).toContain('select (u.email_confirmed_at is not null) into v_confirmado from auth.users u')
    // La línea que cerraba la puerta ya no existe en la rama de landing.
    expect(s).not.toContain("v_status := 'pending'; v_source := 'landing'")
  })

  it('concede el plan solicitado y NO inventa un aprobador', () => {
    const s = sql()
    // plan_id y requested_plan_id reciben los dos el plan validado contra el
    // catálogo activo; el aprobador solo se sella en el alta administrativa.
    expect(s).toContain('v_plan_id, v_plan_id, case when v_es_admin then v_uid else null end')
    expect(s).toContain('case when v_es_admin then now() else null end')
    expect(s).toContain('where slug = p_plan_slug and is_active = true')
  })

  it('arranca el trial: subscription_status trial y subscription_start sellado', () => {
    const s = sql()
    expect(s).toContain(
      'status, commercial_profile, signup_source, subscription_status, subscription_start',
    )
    expect(s).toContain("v_status, p_commercial_profile, v_source, 'trial', case when v_es_admin then null else now() end")
  })

  it('el trial no es una puerta: nada condiciona el acceso a la suscripción', () => {
    const s = sql()
    expect(s).not.toMatch(/subscription_status\s*=\s*'active'/)
    // `subscription_end` aparece ÚNICAMENTE como columna protegida —las dos
    // mitades de una comparación—, nunca como condición de acceso ni como
    // caducidad que alguien pudiera confundir con una puerta.
    expect((s.match(/subscription_end/g) ?? []).length).toBe(2)
    expect(s).toContain('and new.subscription_end is not distinct from old.subscription_end')
  })
})

describe('054 · el arranque del propietario se ata a la TRANSACCIÓN', () => {
  it('la condición central es la igualdad de xid, no un estado', () => {
    const s = sql()
    expect(s).toContain("and o.signup_source = 'landing' and o.xmin = pg_current_xact_id()::xid")
  })

  it('sigue exigiendo que la organización no tenga ya miembros', () => {
    const s = sql()
    expect(s).toContain(
      'select not exists ( select 1 from public.organization_members om where om.organization_id = new.organization_id )',
    )
  })

  it('la condición vieja, basada en el estado, ha desaparecido', () => {
    const s = sql()
    // Era exactamente esta pareja la que hacía reclamable una organización
    // `pending` y sin miembros: el estado se puede esperar fuera, una
    // transacción en curso no.
    expect(s).not.toContain("and o.status = 'pending' and o.signup_source = 'landing'")
  })

  it('una organización abandonada no puede reclamarla nadie, ni activa ni pendiente', () => {
    const s = sql()
    // El arranque no menciona `o.status` en ninguna de sus dos formas: no hay
    // estado que esperar para reclamar una empresa ajena sin miembros.
    const arranque = s.slice(
      s.indexOf("if tg_op = 'insert' and new.org_role = 'owner' and new.user_id = v_uid then"),
      s.indexOf('into v_arranque'),
    )
    expect(arranque).not.toContain('o.status')
    expect(arranque).toContain('pg_current_xact_id()')
  })

  it('quien no arranca sigue sin poder crearse propietario', () => {
    const s = sql()
    expect(s).toContain('if not v_admin_plataforma and not v_arranque then')
    expect(s).toContain('no se puede crear ni ascender a propietario desde la gestión de equipo')
  })
})

describe('054 · la matriz de capacidades (053) sigue intacta', () => {
  it('las dos expresiones simétricas siguen en la RPC', () => {
    const s = sql()
    expect(s).toContain("v_can_buy := p_commercial_profile in ('buyer', 'buyer_seller')")
    expect(s).toContain("v_can_sell := p_commercial_profile in ('seller', 'buyer_seller')")
    expect(s).not.toContain("v_can_sell := p_commercial_profile = 'seller'")
  })

  it('buyer → compra sí, vende no', () => {
    expect(resolveOwnerCapabilities('buyer')).toEqual({ canBuy: true, canSell: false })
  })

  it('seller → compra no, vende sí', () => {
    expect(resolveOwnerCapabilities('seller')).toEqual({ canBuy: false, canSell: true })
  })

  it('buyer_seller → compra Y vende', () => {
    expect(resolveOwnerCapabilities('buyer_seller')).toEqual({ canBuy: true, canSell: true })
  })

  it('el techo del trigger no se ha tocado: sin perfil no hay capacidad', () => {
    const s = sql()
    expect(s).toContain('la organización no tiene perfil comprador: no se puede conceder can_buy')
    expect(s).toContain('la organización no tiene perfil vendedor: no se puede conceder can_sell')
  })
})

describe('054 · lo que NO puede romperse', () => {
  it('el candado de concurrencia de la 052 sigue, y sigue ANTES de la comprobación', () => {
    const s = sql()
    const candado = s.indexOf('pg_advisory_xact_lock')
    expect(candado).toBeGreaterThan(-1)
    expect(s).toContain("hashtextextended('org_signup:' || v_owner::text, 0)")
    expect(candado).toBeLessThan(s.indexOf('select om.organization_id into v_existente'))
  })

  it('idempotencia: si ya pertenece a una organización, devuelve la suya', () => {
    expect(sql()).toContain('if v_existente is not null then return v_existente; end if;')
  })

  it('la RPC no tiene manejadores de excepción (romperían el arranque por xmin)', () => {
    const s = sql()
    // Un `begin … exception` dentro de la RPC metería el insert en una
    // SUBtransacción y su xmin dejaría de coincidir con el de la transacción.
    expect(s).not.toContain('exception when')
  })

  it('autorización, validaciones y seguridad, intactas', () => {
    const s = sql()
    expect(s).toContain('debes iniciar sesión para crear una organización')
    expect(s).toContain('no puedes crear una organización para otra persona')
    expect(s).toContain('el nombre de la empresa es obligatorio')
    expect(s).toContain('el tipo comercial no es válido')
    expect((s.match(/security definer/g) ?? []).length).toBe(3)
    expect((s.match(/set search_path = public/g) ?? []).length).toBe(3)
  })

  it('permisos re-declarados: la RPC sin `anon`, los triggers sin nadie', () => {
    const s = sql()
    expect(s).toMatch(
      /revoke execute on function public\.create_organization_with_owner[\s\S]*from public, anon/,
    )
    expect(s).toMatch(/to authenticated, service_role/)
    expect(s).toContain(
      'revoke all on function public.enforce_membership_rules() from public, anon, authenticated',
    )
    expect(s).toContain(
      'revoke all on function public.protect_organization_columns() from public, anon, authenticated',
    )
  })

  it('tres funciones, ninguna tabla, ninguna policy, ningún índice', () => {
    const s = sql()
    expect((s.match(/create or replace function/g) ?? []).length).toBe(3)
    expect(s).not.toMatch(/alter table|create policy|drop policy|create index|drop index|drop function/)
  })
})

describe('054 · el alta administrativa no cambia', () => {
  it('sigue naciendo pending salvo que se pida otra cosa, y solo pending o active', () => {
    const s = sql()
    expect(s).toContain("v_status := coalesce(p_status, 'pending')")
    expect(s).toContain("if v_status not in ('pending', 'active') then")
    expect(s).toContain('el estado indicado no es válido')
    expect(s).toContain("v_source := 'admin'")
  })

  it('sigue sellando quién aprobó el plan', () => {
    expect(sql()).toContain('case when v_es_admin then v_uid else null end')
  })

  it('el espejo TypeScript dice lo mismo que el SQL', () => {
    // Landing: activa con el correo confirmado, pending sin él.
    expect(resolveInitialStatus(false)).toBe('active')
    expect(resolveInitialStatus(false, null, false)).toBe('pending')
    // Administración: pending por defecto, active si lo pide explícitamente.
    expect(resolveInitialStatus(true)).toBe('pending')
    expect(resolveInitialStatus(true, 'active')).toBe('active')
    // El usuario nunca decide el estado.
    expect(resolveInitialStatus(false, 'suspended')).toBe('active')
    expect(resolveInitialStatus(true, 'suspended')).toBe('pending')
  })
})

describe('054 · activar ya no exige un aprobador humano en autoservicio', () => {
  it('el plan se sigue exigiendo SIEMPRE para activar', () => {
    const s = sql()
    expect(s).toContain("if tg_op = 'update' and new.status = 'active' and old.status is distinct from 'active' then if new.plan_id is null then")
    expect(s).toContain('para activar la organización hay que confirmar antes el plan asignado')
  })

  it('el aprobador solo se exige fuera del autoservicio', () => {
    expect(sql()).toContain(
      "if new.plan_approved_by is null and coalesce(new.signup_source, '') <> 'landing' then",
    )
  })

  it('`signup_source` pasa a ser columna protegida, porque la regla se apoya en ella', () => {
    const s = sql()
    expect(s).toContain('and new.signup_source is not distinct from old.signup_source')
    expect(s).toContain('el origen del alta')
  })

  it('cambiar columnas de plataforma sigue siendo cosa de admin o service_role', () => {
    const s = sql()
    expect(s).toContain("if v_jwt_role = 'service_role' or public.is_platform_admin() then return new; end if;")
    expect(s).toContain('solo un administrador de plataforma puede cambiar el plan')
  })
})

describe('054 · el backfill, acotado y con red', () => {
  it('se acota por características estructurales, nunca por nombre', () => {
    const s = sql()
    const condiciones =
      "where o.signup_source = 'landing' and o.status = 'pending' and o.plan_id is null and o.requested_plan_id is not null"
    // Aparece dos veces: en el recuento de la guarda y en el UPDATE.
    expect((s.match(new RegExp(condiciones.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length).toBe(2)
    expect(s).toContain("and om.org_role = 'owner' and om.status = 'active'")
    expect(s).not.toContain('entornodev')
    expect(s).not.toContain('mahou')
    expect(s).not.toMatch(/where o\.name|and o\.name|o\.cif_nif/)
  })

  it('si el conjunto creciera, aborta en lugar de tocar filas a ciegas', () => {
    const s = sql()
    expect(s).toContain('if v_n > 1 then')
    expect(s).toContain('backfill 054 abortado')
  })

  it('deja la fila exactamente como la habría dejado el flujo nuevo', () => {
    const s = sql()
    expect(s).toContain(
      "set status = 'active', plan_id = o.requested_plan_id, subscription_status = 'trial', subscription_start = coalesce(o.subscription_start, now())",
    )
  })

  it('no rellena el aprobador, no toca membresías y no crea organizaciones', () => {
    const s = sql()
    const backfill = s.slice(s.indexOf('backfill 054 abortado'))
    expect(backfill).not.toContain('plan_approved_by')
    expect(backfill).not.toContain('plan_approved_at')
    expect(backfill).not.toContain('update public.organization_members')
    expect(backfill).not.toContain('insert into public.organizations')
  })

  it('no puede alcanzar a una organización creada desde administración', () => {
    // La condición `signup_source = 'landing'` es lo único que hace falta para
    // que MAHOU y cualquier alta administrativa pendiente queden fuera.
    expect(sql()).toContain("o.signup_source = 'landing'")
  })
})

describe('054 · corrige encima, no reescribe', () => {
  it('la 026, la 052 y la 053 conservan su texto histórico', () => {
    // La 026 nació con el arranque atado al estado y con el bug de can_sell; la
    // 052 copió el cuerpo fiel a propósito; la 053 arregló las capacidades pero
    // dejó `pending`. Que las tres sigan diciendo lo que decían es la prueba de
    // que nadie editó una migración aplicada.
    expect(sqlEjecutable('_026_')).toContain("and o.status = 'pending' and o.signup_source = 'landing'")
    expect(sqlEjecutable('_052_')).toContain("v_status := 'pending'; v_source := 'landing'")
    expect(sqlEjecutable('_053_')).toContain("v_status := 'pending'; v_source := 'landing'")
    expect(sqlEjecutable('_053_')).toContain("v_can_sell := p_commercial_profile in ('seller', 'buyer_seller')")
  })

  it('la 054 es la última de la serie', () => {
    const versiones = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
    expect(versiones[versiones.length - 1]).toBe('20260914192658_054_self_service_activation.sql')
  })
})
