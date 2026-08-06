// Semántica SQL de la auditoría y del último administrador (039).
//
// ADVERTENCIA, la de siempre: esto NO consulta la base de datos. Lee el TEXTO
// del SQL versionado y comprueba que la migración declara lo que la aplicación
// da por hecho. La verificación real está en el informe del bloque.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ADMIN_AUDIT_ACTIONS } from '@/lib/audit/actions'

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

const SQL = ejecutable(migracion('_039_'))

// ═══════════════════════════════════════════════════════════════════════════
// Auditoría
// ═══════════════════════════════════════════════════════════════════════════

describe('registro de auditoría', () => {
  it('crea la tabla', () => {
    expect(SQL).toContain('create table if not exists public.admin_audit_log')
  })

  it('guarda actor, objetivo, organización y los dos estados', () => {
    for (const col of [
      'actor_id',
      'target_user_id',
      'target_organization_id',
      'before_state',
      'after_state',
      'created_at',
    ]) {
      expect(SQL, col).toContain(col)
    }
  })

  it('el actor es obligatorio: una acción sin responsable no se registra', () => {
    expect(SQL).toContain('actor_id uuid not null')
  })

  // Un registro de auditoría tiene que sobrevivir al borrado de aquello que
  // describe. Con una FK a `profiles`, borrar una cuenta arrastraría las filas
  // que explican qué se hizo con ella.
  it('NO tiene claves foráneas', () => {
    expect(SQL).not.toContain('references public.profiles')
    expect(SQL).not.toContain('references public.organizations')
    expect(SQL).not.toContain('on delete cascade')
  })

  it('la lista de acciones es cerrada y coincide con la del código', () => {
    expect(SQL).toContain('check (action in (')
    for (const accion of ADMIN_AUDIT_ACTIONS) {
      expect(SQL, accion).toContain(`'${accion}'`)
    }
  })

  it('marca las filas de prueba con `is_qa`', () => {
    expect(SQL).toContain('is_qa boolean not null default false')
  })

  it('no guarda secretos ni datos personales innecesarios', () => {
    for (const prohibido of ['password', 'token', 'secret', 'email']) {
      expect(SQL, prohibido).not.toContain(prohibido)
    }
  })

  it('indexa las tres consultas previstas', () => {
    expect(SQL).toContain('idx_admin_audit_created')
    expect(SQL).toContain('idx_admin_audit_target_user')
    expect(SQL).toContain('idx_admin_audit_target_org')
  })
})

describe('RLS de la auditoría', () => {
  it('la tabla tiene RLS activa', () => {
    expect(SQL).toContain('alter table public.admin_audit_log enable row level security')
  })

  it('solo un administrador de plataforma la lee', () => {
    expect(SQL).toContain('create policy audit_admin_select on public.admin_audit_log for select using (public.is_platform_admin())')
  })

  // Nadie puede atribuir una acción a otra persona, ni siquiera un
  // administrador.
  it('al insertar, el actor tiene que ser quien llama', () => {
    expect(SQL).toContain('actor_id = auth.uid()')
  })

  // Con RLS activa, lo que ninguna policy permite está prohibido. Un registro
  // de auditoría que se puede reescribir no es auditoría.
  it('NO hay policy de UPDATE ni de DELETE: el registro es de solo añadir', () => {
    expect(SQL).not.toContain('for update')
    expect(SQL).not.toContain('for delete')
  })

  it('anon queda fuera de forma expresa', () => {
    expect(SQL).toContain('revoke all on table public.admin_audit_log from anon')
    expect(SQL).toContain('revoke all on table public.admin_audit_log from public')
  })

  it('solo se conceden select e insert a authenticated', () => {
    expect(SQL).toContain('grant select, insert on table public.admin_audit_log to authenticated')
    expect(SQL).not.toContain('grant all on table public.admin_audit_log to authenticated')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Último administrador de plataforma
// ═══════════════════════════════════════════════════════════════════════════

describe('protección del último administrador', () => {
  it('existe la función y su trigger', () => {
    expect(SQL).toContain('create or replace function public.protect_last_platform_admin()')
    expect(SQL).toContain('create trigger profiles_protect_last_admin')
  })

  it('se dispara ANTES del update sobre profiles', () => {
    expect(SQL).toContain('before update on public.profiles')
  })

  // Es un INVARIANTE, no autorización: se aplica a todo el mundo, incluido
  // `service_role`. Igual que las reglas de propietario de 023.
  it('no comprueba quién llama: es un invariante para todos', () => {
    const desde = SQL.indexOf('function public.protect_last_platform_admin')
    const cuerpo = SQL.slice(desde, SQL.indexOf('$$;', desde))
    expect(cuerpo).not.toContain('is_platform_admin()')
    expect(cuerpo).not.toContain('auth.uid()')
    expect(cuerpo).not.toContain('service_role')
  })

  it('solo actúa cuando se deja de ser administrador ACTIVO', () => {
    expect(SQL).toContain("old.role = 'platform_admin'")
    expect(SQL).toContain("old.status = 'active'")
    expect(SQL).toContain("new.role is distinct from 'platform_admin'")
    expect(SQL).toContain("new.status is distinct from 'active'")
  })

  it('deja pasar si queda algún otro administrador activo', () => {
    expect(SQL).toContain('p.id <> old.id')
    expect(SQL).toContain('if not exists (')
  })

  it('fija el search_path', () => {
    expect(SQL).toContain('set search_path = public')
  })

  // Las filas de `profiles` se borran en cascada al eliminar la cuenta en
  // `auth.users`: bloquear eso convertiría un borrado de cuenta en un error
  // incomprensible.
  it('NO cubre DELETE, a propósito', () => {
    expect(SQL).not.toContain('before delete on public.profiles')
    expect(SQL).not.toContain('before insert or update or delete on public.profiles')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Lo que la migración NO hace
// ═══════════════════════════════════════════════════════════════════════════

describe('la migración no toca datos ni reglas existentes', () => {
  it('no escribe ni borra ningún perfil, membership u organización', () => {
    expect(SQL).not.toMatch(/update\s+public\.profiles\s+set/)
    expect(SQL).not.toMatch(/update\s+public\.organization_members\s+set/)
    expect(SQL).not.toMatch(/update\s+public\.organizations\s+set/)
    expect(SQL).not.toMatch(/delete\s+from\s+public\./)
    expect(SQL).not.toMatch(/insert\s+into\s+public\.(profiles|organization_members|organizations)/)
    expect(SQL).not.toContain('truncate')
  })

  // La autoridad sobre memberships y perfiles sigue siendo la que ya estaba.
  // Duplicarla haría que las dos copias divergieran.
  it('no redefine los triggers de 021 ni de 023', () => {
    expect(SQL).not.toContain('enforce_membership_rules')
    expect(SQL).not.toContain('prevent_privileged_profile_change')
  })

  it('no cambia ninguna policy fuera de la tabla nueva', () => {
    const policies = SQL.match(/create policy \w+/g) ?? []
    expect(policies).toHaveLength(2)
    for (const p of policies) {
      expect(p).toMatch(/audit_admin_(select|insert)/)
    }
  })

  it('no toca precios, proveedores ni nada de Market Intelligence', () => {
    for (const tabla of ['product_price_records', 'suppliers', 'market_import', 'market_price_deletion']) {
      expect(SQL, tabla).not.toContain(tabla)
    }
  })

  it('no toca planes ni suscripciones', () => {
    for (const campo of ['plan_id', 'subscription_status', 'stripe']) {
      expect(SQL, campo).not.toContain(campo)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 040 — La función de trigger no es una RPC
// ═══════════════════════════════════════════════════════════════════════════
//
// 039 revocó de `public` y `anon`, pero el esquema tiene un
// `alter default privileges … grant execute … to authenticated`, así que la
// función quedó publicada en /rest/v1/rpc. No es explotable —una función de
// trigger llamada como RPC falla con 0A000 antes de ejecutar nada— pero las
// otras cinco funciones de trigger del esquema no están expuestas.
//
// Se lee aparte porque 039 ya está aplicada: la forma correcta de cambiar algo
// desplegado es una migración nueva, no editar la anterior.

const SQL_040 = ejecutable(migracion('_040_'))

describe('040 — permisos de la función de trigger', () => {
  it('retira EXECUTE también de authenticated, que era el que faltaba', () => {
    expect(SQL_040).toContain(
      'revoke all on function public.protect_last_platform_admin() from authenticated',
    )
  })

  it('repite los dos revokes de 039: el estado deseado queda entero', () => {
    expect(SQL_040).toContain('from public')
    expect(SQL_040).toContain('from anon')
  })

  it('no concede EXECUTE a nadie: una función de trigger no se llama por RPC', () => {
    expect(SQL_040).not.toContain('grant execute')
  })

  it('no toca datos, tablas, policies ni el cuerpo de la función', () => {
    expect(SQL_040).not.toContain('create or replace function')
    expect(SQL_040).not.toContain('alter table')
    expect(SQL_040).not.toContain('create policy')
    expect(SQL_040).not.toMatch(/insert\s+into|update\s+public\.|delete\s+from/)
  })
})
