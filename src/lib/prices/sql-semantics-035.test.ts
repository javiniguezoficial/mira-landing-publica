// Semántica SQL del borrado administrado de precios (migración 035).
//
// ADVERTENCIA, la de siempre: esto NO consulta la base de datos. Lee el TEXTO
// del SQL versionado y comprueba que la migración declara lo que la aplicación
// da por hecho. La verificación real está en el informe del bloque.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DELETION_BATCH_STATUSES, DELETION_MODES } from './deletion'

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

const SQL = ejecutable(migracion('_035_'))

/**
 * 036 redefine `apply_price_deletion` para añadir el guard de copias.
 *
 * Se lee aparte porque 035 ya está aplicada: la forma correcta de cambiar una
 * función desplegada es una migración nueva, no editar la anterior.
 */
const SQL_036 = ejecutable(migracion('_036_'))

// ═══════════════════════════════════════════════════════════════════════════
// La copia de seguridad
// ═══════════════════════════════════════════════════════════════════════════

describe('auditoría', () => {
  it('guarda el precio ENTERO antes de borrarlo', () => {
    expect(SQL).toContain('original_data jsonb not null')
    expect(SQL).toContain("check (jsonb_typeof(original_data) = 'object')")
  })

  // Si hubiera FK a `product_price_records`, borrar el precio arrastraría o
  // anularía la copia: justo lo contrario de lo que se busca.
  it('NO hay clave foránea al precio ni al lote de importación', () => {
    expect(SQL).not.toMatch(/original_price_id\s+uuid\s+not null\s+references/)
    expect(SQL).not.toMatch(/source_import_batch_id\s+uuid\s+references/)
  })

  it('el mismo precio no puede estar dos veces en el mismo lote', () => {
    expect(SQL).toContain('unique (deletion_batch_id, original_price_id)')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Los cerrojos
// ═══════════════════════════════════════════════════════════════════════════

describe('constraints de seguridad', () => {
  // Un modo `filters` con el objeto vacío borraría TODOS los precios mientras
  // la interfaz dice «borrado filtrado».
  it('un borrado filtrado no puede quedarse sin filtros', () => {
    expect(SQL).toContain("mode <> 'filters' or (filters <> '{}'::jsonb)")
  })

  it('un borrado de importación exige el lote de origen', () => {
    expect(SQL).toContain("mode <> 'import' or source_import_batch_id is not null")
  })

  it('un lote cerrado tiene fecha de cierre', () => {
    expect(SQL).toContain("(status in ('completed', 'completed_with_errors')) = (completed_at is not null)")
  })

  it('una fila borrada tiene fecha de borrado', () => {
    expect(SQL).toContain("(status = 'deleted') = (deleted_at is not null)")
  })
})

describe('modos y estados', () => {
  it('coinciden con los de TypeScript', () => {
    for (const m of DELETION_MODES) expect(SQL, `modo «${m}»`).toContain(`'${m}'`)
    for (const s of DELETION_BATCH_STATUSES) expect(SQL, `estado «${s}»`).toContain(`'${s}'`)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// La RPC
// ═══════════════════════════════════════════════════════════════════════════

describe('apply_price_deletion', () => {
  it('comprueba platform_admin por su cuenta, y antes de borrar', () => {
    expect(SQL).toContain('security definer')
    expect(SQL).toContain('set search_path = public')

    const permiso = SQL.indexOf('if not public.is_platform_admin() then')
    const borrado = SQL.indexOf('delete from public.product_price_records')
    expect(permiso).toBeGreaterThan(-1)
    expect(permiso).toBeLessThan(borrado)
  })

  it('bloquea el lote y solo aplica desde «ready»', () => {
    expect(SQL).toContain('for update')
    expect(SQL).toContain("if v_batch.status <> 'ready' then")
  })

  // Lo esencial: se borra por la LISTA GUARDADA, no volviendo a ejecutar los
  // filtros. Si se reejecutaran, un precio importado entre la vista previa y la
  // confirmación se borraría sin que nadie lo hubiera visto.
  it('borra por los identificadores guardados, no por los filtros', () => {
    expect(SQL).toContain('select original_price_id from public.market_price_deletion_rows')
    expect(SQL).toContain('where p.id in (select original_price_id from objetivo)')
  })

  it('solo toca las filas pendientes de este lote', () => {
    expect(SQL).toContain("and status = 'pending'")
    expect(SQL).toContain('where deletion_batch_id = p_batch_id')
  })

  // El orden importa: `import_batch_id` es `on delete set null`, así que borrar
  // el lote primero desengancharía los precios.
  it('en modo import borra los precios ANTES que el lote', () => {
    const precios = SQL.indexOf('delete from public.product_price_records')
    const filas = SQL.indexOf('delete from public.market_import_rows')
    const lote = SQL.indexOf('delete from public.market_import_batches')
    expect(precios).toBeLessThan(filas)
    expect(filas).toBeLessThan(lote)
  })

  it('nada de SQL dinámico', () => {
    expect(SQL).not.toMatch(/\bexecute\s+(format|'|")/)
    expect(SQL).not.toContain('format(')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// RLS y grants
// ═══════════════════════════════════════════════════════════════════════════

describe('seguridad', () => {
  it('las dos tablas tienen RLS y policy solo de administración', () => {
    for (const t of ['market_price_deletion_batches', 'market_price_deletion_rows']) {
      expect(SQL).toContain(`alter table public.${t} enable row level security`)
      expect(SQL).toContain(`create policy admin_all_price_deletion`)
    }
    expect(SQL).toContain('for all using (is_platform_admin()) with check (is_platform_admin())')
  })

  it('se revoca de PUBLIC y expresamente de anon', () => {
    expect(SQL).toContain('revoke all on function public.apply_price_deletion(uuid) from public')
    expect(SQL).toContain('revoke all on function public.apply_price_deletion(uuid) from anon')
    expect(SQL).toContain('grant execute on function public.apply_price_deletion(uuid) to authenticated, service_role')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 036 — el borrado aborta si las copias no cuadran
// ═══════════════════════════════════════════════════════════════════════════

describe('guard de copias (036)', () => {
  // Sin esto, una vista previa que hubiera guardado 600 de 608 copias habría
  // borrado esas 600 tan tranquila: las 8 restantes se quedarían sin copia y el
  // lote seguiría diciendo 608.
  it('compara el número de copias con lo declarado', () => {
    expect(SQL_036).toContain('select count(*) into v_copias')
    expect(SQL_036).toContain('if v_copias <> v_batch.total_rows then')
    expect(SQL_036).toContain('copias de seguridad incompletas')
  })

  it('exige que cada copia traiga los campos que reconstruyen el precio', () => {
    for (const campo of ['id', 'product_id', 'recorded_at', 'price', 'currency', 'unit']) {
      expect(SQL_036, `falta la comprobación de «${campo}»`).toContain(`original_data ? '${campo}'`)
    }
    expect(SQL_036).toContain('sin los campos necesarios')
  })

  // Es lo único que importa del guard: que corte ANTES de tocar nada.
  it('los dos cortes van antes del primer DELETE', () => {
    const conteo = SQL_036.indexOf('copias de seguridad incompletas')
    const campos = SQL_036.indexOf('sin los campos necesarios')
    const borrado = SQL_036.indexOf('delete from public.product_price_records')
    expect(conteo).toBeGreaterThan(-1)
    expect(conteo).toBeLessThan(borrado)
    expect(campos).toBeLessThan(borrado)
  })

  it('mantiene las garantías de 035', () => {
    expect(SQL_036).toContain('security definer')
    expect(SQL_036).toContain('set search_path = public')
    expect(SQL_036).toContain('if not public.is_platform_admin() then')
    expect(SQL_036).toContain('for update')
    expect(SQL_036).toContain("if v_batch.status <> 'ready' then")
    expect(SQL_036).toContain('revoke all on function public.apply_price_deletion(uuid) from anon')
  })

  // 036 solo reemplaza la función: no puede tocar tablas ni datos.
  it('no crea tablas ni borra datos por sí misma', () => {
    expect(SQL_036).not.toContain('create table')
    expect(SQL_036).not.toContain('drop table')
    expect(SQL_036).not.toMatch(/^\s*delete\s+from/m)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Alcance
// ═══════════════════════════════════════════════════════════════════════════

describe('lo que la migración NO hace', () => {
  // La migración crea la maquinaria; el vaciado lo ejecuta la aplicación con
  // su auditoría. Una migración que borrase datos se ejecutaría sola en
  // cualquier entorno donde se aplicara.
  it('no borra ni modifica ningún precio por sí misma', () => {
    const cuerpo = SQL.slice(0, SQL.indexOf('create or replace function'))
    expect(cuerpo).not.toMatch(/delete\s+from\s+public\.product_price_records/)
    expect(cuerpo).not.toMatch(/update\s+public\.product_price_records/)
  })

  it('no toca productos, mercados ni proveedores', () => {
    expect(SQL).not.toMatch(/alter table public\.(products|markets|suppliers)\b/)
    expect(SQL).not.toMatch(/delete\s+from\s+public\.(products|markets|suppliers)\b/)
  })

  it('no toca la actualización masiva de proveedores', () => {
    expect(SQL).not.toContain('supplier_update_')
    expect(SQL).not.toContain('apply_supplier_update')
  })
})
