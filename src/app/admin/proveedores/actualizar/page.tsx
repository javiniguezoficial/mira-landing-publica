import Link from 'next/link'
import { ArrowLeft, FileSpreadsheet, AlertCircle, History, KeyRound } from 'lucide-react'
import { SupplierUpdateWizard } from '@/components/admin/suppliers/SupplierUpdateWizard'
import { listSupplierUpdateBatches } from '@/lib/actions/supplier-updates'
import {
  BATCH_STATUS_LABELS,
  CLEAR_TOKEN,
  ID_HEADER,
  IGNORED_HEADERS,
  UPDATABLE_FIELDS,
  type UpdateBatchStatus,
} from '@/lib/suppliers/bulk-update/types'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { MiraTable, MiraTr, MiraTd } from '@/components/mira/MiraTable'
import { miraBtn } from '@/lib/miraButtons'

export const dynamic = 'force-dynamic'

// El acceso lo corta `AdminLayout` con `requirePlatformAdmin`, antes de
// renderizar nada. Aquí no se repite: sería una comprobación menos que revisar
// el día que cambie la política, y las acciones y RLS vuelven a cortarlo por su
// cuenta en cada operación.

const ESTILO_BATCH: Record<UpdateBatchStatus, string> = {
  ready: 'bg-blue-50 text-blue-700',
  no_changes: 'bg-slate-100 text-slate-500',
  invalid: 'bg-red-50 text-red-700',
  completed: 'bg-emerald-50 text-emerald-700',
  completed_with_errors: 'bg-amber-50 text-amber-700',
  cancelled: 'bg-slate-100 text-slate-500',
}

const REGLAS = [
  'Cada fila se identifica ÚNICAMENTE por su ID interno. No se busca por nombre, por NIF ni por correo, y no hay coincidencias aproximadas.',
  'Un ID que no exista NO crea un proveedor: la fila se marca como inválida.',
  'Un ID repetido dentro del archivo bloquea todas sus filas. Ninguna se aplica.',
  'Una celda vacía significa «no tocar este campo». Nunca borra nada.',
  `Para vaciar un campo, escribe ${CLEAR_TOKEN} en la celda. Solo funciona en campos que admiten estar vacíos.`,
  'La taxonomía se indica por identificador y debe encadenar: mercado › categoría › familia › subfamilia. Los niveles inferiores no se limpian solos.',
  'Las fórmulas no se evalúan: una celda con fórmula marca la fila como inválida. Pega los valores antes de subir.',
  'El orden de las columnas da igual; los nombres, no.',
]

export default async function ActualizarProveedoresPage() {
  const historial = await listSupplierUpdateBatches(10)

  return (
    <div className="w-full max-w-5xl space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader
        icon={FileSpreadsheet}
        title="Actualización masiva de proveedores"
        subtitle="Edita una exportación y devuélvela para actualizar los proveedores existentes"
        actions={
          <Link href="/admin/proveedores" className={miraBtn.ghost}>
            <ArrowLeft size={14} /> Volver a proveedores
          </Link>
        }
      />

      {/* El aviso que hay que leer antes de nada. */}
      <section className="rounded-2xl border border-mira-magenta/20 bg-mira-magenta-soft/30 p-5">
        <div className="mb-2 flex items-center gap-2">
          <KeyRound size={15} className="text-mira-magenta" />
          <h2 className="text-sm font-black text-mira-ink">Conserva la columna «{ID_HEADER}»</h2>
        </div>
        <p className="text-xs leading-relaxed text-slate-600">
          Parte de una <span className="font-bold">exportación administrativa</span> de proveedores
          —la que descargas desde el listado— o de la plantilla. Edita las celdas que quieras y sube
          el archivo. Si borras o alteras la columna del identificador, ninguna fila se podrá aplicar:
          es lo único que dice a qué proveedor pertenece cada línea, y este bloque no lo adivina.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          Esta pantalla <span className="font-bold">nunca crea proveedores</span>. Para dar de alta
          nuevos, usa{' '}
          <Link href="/admin/proveedores/importar" className="font-semibold text-mira-magenta hover:underline">
            Importar proveedores
          </Link>.
        </p>
      </section>

      <SupplierUpdateWizard />

      {/* Formato */}
      <section className="mira-card rounded-2xl p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <AlertCircle size={15} className="text-mira-magenta" />
          <h2 className="text-sm font-black text-mira-ink">Columnas y reglas</h2>
        </div>

        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          Obligatoria
        </p>
        <div className="mb-4">
          <span className="rounded bg-mira-magenta-soft px-2 py-0.5 font-mono text-xs font-bold text-mira-magenta">
            {ID_HEADER}
          </span>
        </div>

        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          Actualizables ({UPDATABLE_FIELDS.length})
        </p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {UPDATABLE_FIELDS.map((f) => (
            <span key={f.field} className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
              {f.header}
              {!f.clearable && <span className="ml-1 text-[10px] text-slate-400">(no vaciable)</span>}
            </span>
          ))}
        </div>

        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          Se ignoran si vienen en el archivo
        </p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {IGNORED_HEADERS.map((h) => (
            <span key={h} className="rounded bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-400 line-through">
              {h}
            </span>
          ))}
        </div>
        <p className="mb-4 text-[11px] leading-relaxed text-slate-400">
          «Clasificación» es una columna derivada de la exportación: muestra el camino completo de la
          taxonomía ya montado. Para cambiar la clasificación usa las columnas de identificador
          («Mercado ID», «Categoría ID»…), que no admiten interpretación.
        </p>

        <div className="space-y-1.5 rounded-xl bg-mira-canvas/60 p-4">
          {REGLAS.map((t, i) => (
            <p key={i} className="flex items-start gap-2 text-xs text-slate-500">
              <span className="shrink-0 text-slate-300">·</span>
              {t}
            </p>
          ))}
        </div>
      </section>

      {/* Historial */}
      <section className="mira-card overflow-hidden rounded-2xl">
        <div className="flex items-center gap-2 border-b border-mira-line px-5 py-3.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-mira-magenta-soft">
            <History size={14} className="text-mira-magenta" />
          </div>
          <h2 className="text-sm font-black text-mira-ink">Actualizaciones recientes</h2>
        </div>

        {historial.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">
            Todavía no se ha ejecutado ninguna actualización masiva.
          </p>
        ) : (
          <MiraTable headers={['Archivo', 'Estado', 'Filas', 'Actualizadas', 'Fecha', 'Usuario', 'Informe']}>
            {historial.map((b) => (
              <MiraTr key={b.id}>
                <MiraTd>
                  <span className="font-mono text-xs text-slate-600">{b.filename}</span>
                </MiraTd>
                <MiraTd>
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${ESTILO_BATCH[b.status]}`}>
                    {BATCH_STATUS_LABELS[b.status]}
                  </span>
                </MiraTd>
                <MiraTd>{b.totalRows}</MiraTd>
                <MiraTd>
                  <span className="font-bold text-emerald-700">{b.updatedRows}</span>
                  {(b.invalidRows > 0 || b.duplicateRows > 0 || b.failedRows > 0) && (
                    <span className="ml-1 text-[10px] text-slate-400">
                      ({b.invalidRows} inv · {b.duplicateRows} dup · {b.failedRows} fall)
                    </span>
                  )}
                </MiraTd>
                <MiraTd>
                  <span className="text-xs text-slate-500">
                    {new Date(b.createdAt).toLocaleDateString('es-ES', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </span>
                </MiraTd>
                <MiraTd>
                  <span className="text-xs text-slate-500">{b.createdByName ?? '—'}</span>
                </MiraTd>
                <MiraTd>
                  <a
                    href={`/api/admin/supplier-update-report?batchId=${encodeURIComponent(b.id)}`}
                    download
                    className="text-xs font-semibold text-mira-magenta hover:underline"
                  >
                    Descargar
                  </a>
                </MiraTd>
              </MiraTr>
            ))}
          </MiraTable>
        )}
      </section>
    </div>
  )
}
