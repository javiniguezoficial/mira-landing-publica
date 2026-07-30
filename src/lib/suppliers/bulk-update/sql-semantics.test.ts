// Semántica SQL y seguridad de la actualización masiva (migración 033).
//
// ADVERTENCIA, la de siempre: esto NO consulta la base de datos. Lee el TEXTO
// del SQL versionado y comprueba que la migración declara lo que la aplicación
// da por hecho. La verificación real, contra los 12.288 proveedores, está en el
// informe del bloque.
//
// Es la prueba que cierra el círculo de la allowlist: la lista de campos vive
// en TypeScript, en un CHECK de la tabla y en la asignación campo a campo de la
// función. Aquí se comprueba que las tres dicen exactamente lo mismo.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { UPDATABLE_FIELDS, UPDATE_BATCH_STATUSES, UPDATE_ROW_STATUSES } from './types'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function migracion033(): string {
  const nombre = readdirSync(MIGRATIONS_DIR).find((f) => f.includes('_033_'))
  if (!nombre) throw new Error('Falta la migración 033')
  return readFileSync(join(MIGRATIONS_DIR, nombre), 'utf8')
}

/** Quita comentarios y colapsa espacios: solo queda lo que ejecuta PostgreSQL. */
function ejecutable(texto: string): string {
  return texto
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

const SQL = ejecutable(migracion033())

/** El cuerpo del UPDATE sobre `suppliers`, aislado de todo lo demás. */
const ASIGNACIONES = (() => {
  const inicio = SQL.indexOf('update public.suppliers s set')
  const fin = SQL.indexOf('where s.id = v_fila.supplier_id', inicio)
  if (inicio < 0 || fin < 0) throw new Error('No se encuentra el UPDATE sobre suppliers')
  return SQL.slice(inicio, fin)
})()

// ═══════════════════════════════════════════════════════════════════════════
// La allowlist, en sus tres sitios
// ═══════════════════════════════════════════════════════════════════════════

describe('allowlist', () => {
  it('el CHECK de la tabla enumera exactamente los campos de TypeScript', () => {
    for (const spec of UPDATABLE_FIELDS) {
      expect(SQL, `«${spec.field}» falta en el CHECK`).toContain(`'${spec.field}'`)
    }
    // Y el CHECK existe de verdad, no es solo que el nombre aparezca por ahí.
    expect(SQL).toContain('supplier_update_rows_allowed_fields check')
    expect(SQL).toContain("= '{}'::jsonb")
  })

  it('cada campo permitido tiene su asignación escrita a mano', () => {
    for (const spec of UPDATABLE_FIELDS) {
      expect(
        ASIGNACIONES,
        `«${spec.field}» no se asigna en el UPDATE`,
      ).toContain(`${spec.field} = case when v_c ? '${spec.field}'`)
    }
  })

  // Si alguno de estos apareciera como destino de asignación, una actualización
  // masiva podría reescribir la fecha de alta o apuntar la fila a otro
  // proveedor.
  it('ningún campo prohibido se asigna', () => {
    for (const prohibido of [
      'id', 'created_at', 'updated_at',
      'category', 'family', 'subfamily', 'produccion', 'market_id',
    ]) {
      expect(
        ASIGNACIONES,
        `«${prohibido}» no puede asignarse`,
      ).not.toMatch(new RegExp(`(^|[\\s,])${prohibido} =`))
    }
  })

  // `updated_at` lo escribe el trigger `suppliers_updated_at`. Que lo pusiera
  // la función destruiría el único rastro fiable de cuándo se tocó cada
  // proveedor.
  it('`updated_at` se deja al trigger', () => {
    expect(ASIGNACIONES).not.toContain('updated_at')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Nada de SQL dinámico
// ═══════════════════════════════════════════════════════════════════════════

describe('construcción de la sentencia', () => {
  // El fichero lo edita una persona y sus cabeceras son texto libre. Si alguna
  // acabara concatenada en la sentencia, una columna llamada
  // `name = 'x'; drop table` sería ejecutable.
  it('no hay ejecución dinámica ni concatenación', () => {
    expect(SQL).not.toMatch(/\bexecute\s+(format|'|"|v_)/)
    expect(SQL).not.toContain('format(')
    expect(ASIGNACIONES).not.toContain('||')
  })

  it('la distinción entre «no tocar» y «vaciar» es explícita', () => {
    // `? 'campo'` pregunta si la CLAVE existe. Un `null` con la clave presente
    // vacía; una clave ausente deja el valor como está. Sin ese operador las
    // dos cosas serían indistinguibles.
    expect(ASIGNACIONES).toContain("v_c ? 'name'")
    expect(ASIGNACIONES).toContain('else s.name end')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Nunca crea proveedores
// ═══════════════════════════════════════════════════════════════════════════

describe('la frontera con el importador', () => {
  it('no hay ningún INSERT sobre `suppliers`', () => {
    expect(SQL).not.toMatch(/insert\s+into\s+public\.suppliers/)
  })

  it('no hay ningún UPSERT que pudiera crear una fila', () => {
    expect(ASIGNACIONES).not.toContain('on conflict')
  })

  it('la migración no modifica ningún proveedor existente', () => {
    // Cero DML sobre datos reales: solo DDL, RLS, policies y la función.
    expect(SQL).not.toMatch(/update\s+public\.suppliers\s+set(?!.*v_fila)/)
    expect(SQL).not.toMatch(/delete\s+from\s+public\.suppliers/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Autorización
// ═══════════════════════════════════════════════════════════════════════════

describe('autorización dentro de PostgreSQL', () => {
  // Sin esta comprobación, `security definer` convertiría la función en una
  // puerta trasera para escribir en `suppliers` desde cualquier sesión
  // autenticada.
  it('la función comprueba platform_admin por su cuenta, y lo primero', () => {
    expect(SQL).toContain('security definer')
    expect(SQL).toContain('if not public.is_platform_admin() then')

    const inicioFuncion = SQL.indexOf('create or replace function public.apply_supplier_update')
    const comprobacion = SQL.indexOf('if not public.is_platform_admin() then', inicioFuncion)
    const primerUpdate = SQL.indexOf('update public.suppliers', inicioFuncion)
    expect(comprobacion).toBeGreaterThan(-1)
    expect(comprobacion).toBeLessThan(primerUpdate)
  })

  it('la función fija su `search_path`', () => {
    expect(SQL).toContain('set search_path = public')
  })

  it('se revoca de PUBLIC y expresamente de anon', () => {
    expect(SQL).toContain('revoke all on function public.apply_supplier_update(uuid) from public')
    expect(SQL).toContain('revoke all on function public.apply_supplier_update(uuid) from anon')
    expect(SQL).toContain('grant execute on function public.apply_supplier_update(uuid) to authenticated, service_role')
  })

  it('las dos tablas tienen RLS y una policy solo para administración', () => {
    for (const tabla of ['supplier_update_batches', 'supplier_update_rows']) {
      expect(SQL).toContain(`alter table public.${tabla} enable row level security`)
      expect(SQL).toContain(`create policy admin_all_${tabla} on public.${tabla}`)
    }
    // `for all using (is_platform_admin()) with check (is_platform_admin())`:
    // sin policy para el resto de `authenticated`, RLS deniega por defecto.
    expect(SQL).toContain('for all using (is_platform_admin()) with check (is_platform_admin())')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Idempotencia
// ═══════════════════════════════════════════════════════════════════════════

describe('un batch no se aplica dos veces', () => {
  it('el batch se bloquea antes de leer su estado', () => {
    expect(SQL).toContain('for update')
    expect(SQL).toContain("if v_batch.status <> 'ready' then")
  })

  it('solo se recorren las filas válidas', () => {
    expect(SQL).toContain("and r.status = 'valid'")
  })

  it('el hash del fichero está indexado, no el nombre', () => {
    expect(SQL).toContain('idx_sub_file_hash on public.supplier_update_batches (file_hash)')
    expect(SQL).not.toMatch(/unique\s+index[^;]*filename/)
  })

  it('una fila no puede repetirse dentro del mismo batch', () => {
    expect(SQL).toContain('unique (batch_id, row_number)')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Estados
// ═══════════════════════════════════════════════════════════════════════════

describe('estados', () => {
  it('los del batch coinciden con los de TypeScript', () => {
    for (const estado of UPDATE_BATCH_STATUSES) {
      expect(SQL, `falta el estado de batch «${estado}»`).toContain(`'${estado}'`)
    }
  })

  it('los de fila coinciden con los de TypeScript', () => {
    for (const estado of UPDATE_ROW_STATUSES) {
      expect(SQL, `falta el estado de fila «${estado}»`).toContain(`'${estado}'`)
    }
  })

  it('una fila aplicada lleva fecha, y una no aplicada no', () => {
    expect(SQL).toContain("(status = 'updated') = (applied_at is not null)")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// La privacidad de 032 sigue intacta
// ═══════════════════════════════════════════════════════════════════════════

describe('no se toca lo que cerró 032', () => {
  it('no se redefine `search_suppliers` ni `admin_supplier_notes`', () => {
    expect(SQL).not.toContain('function public.search_suppliers')
    expect(SQL).not.toContain('function public.admin_supplier_notes')
  })

  it('no se vuelve a conceder SELECT sobre columnas de `suppliers`', () => {
    expect(SQL).not.toMatch(/grant\s+select[^;]*on public\.suppliers/)
  })

  it('las policies de `suppliers` no se tocan', () => {
    expect(SQL).not.toContain('policy admin_all_suppliers')
    expect(SQL).not.toContain('policy client_select_active_suppliers')
  })
})
