import { FileSpreadsheet, AlertCircle, History } from 'lucide-react'
import { PriceImportWizard } from '@/components/admin/prices/PriceImportWizard'
import { listImportBatches } from '@/lib/actions/market-imports'
import { isoWeekOf, IMPORT_PERIOD_LABELS } from '@/lib/imports/period'
import {
  ALL_IMPORT_COLUMNS,
  REQUIRED_IMPORT_COLUMNS,
  type ImportBatchStatus,
} from '@/lib/imports/types'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { MiraTable, MiraTr, MiraTd } from '@/components/mira/MiraTable'

export const dynamic = 'force-dynamic'

const ESTADO_BATCH: Record<ImportBatchStatus, { label: string; className: string }> = {
  ready:                 { label: 'Pendiente',         className: 'bg-blue-50 text-blue-700' },
  invalid:               { label: 'Sin filas válidas', className: 'bg-red-50 text-red-700' },
  completed:             { label: 'Completada',        className: 'bg-emerald-50 text-emerald-700' },
  completed_with_errors: { label: 'Con incidencias',   className: 'bg-amber-50 text-amber-700' },
  cancelled:             { label: 'Descartada',        className: 'bg-slate-100 text-slate-500' },
}

const REQUERIDAS = new Set<string>(REQUIRED_IMPORT_COLUMNS)

export default async function ImportarPreciosPage() {
  const historial = await listImportBatches(10)

  // La semana y el mes actuales se calculan en SERVIDOR. El asistente es un
  // componente cliente, y dejarle hacer `new Date()` abriría un desajuste de
  // hidratación entre el reloj del servidor y el del navegador justo en el
  // cambio de día.
  const hoy = new Date()
  const { year: isoYear, week: isoWeek } = isoWeekOf(hoy)

  return (
    <div className="w-full max-w-5xl space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader
        icon={FileSpreadsheet}
        title="Importación de precios"
        subtitle="Carga masiva por semana, mes o año desde un archivo CSV"
      />

      <PriceImportWizard
        currentYear={isoYear}
        currentWeek={isoWeek}
        currentMonth={hoy.getMonth() + 1}
      />

      {/* Formato del archivo */}
      <section className="mira-card rounded-2xl p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <AlertCircle size={15} className="text-mira-magenta" />
          <h2 className="text-sm font-black text-mira-ink">Formato del archivo</h2>
        </div>

        <div className="mb-2 flex flex-wrap gap-1.5">
          {ALL_IMPORT_COLUMNS.map((c) => (
            <span
              key={c}
              className={
                REQUERIDAS.has(c)
                  ? 'rounded bg-mira-magenta-soft px-2 py-0.5 font-mono text-xs font-bold text-mira-magenta'
                  : 'rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-500'
              }
            >
              {c}
              {REQUERIDAS.has(c) && <span className="ml-0.5">*</span>}
            </span>
          ))}
        </div>
        <p className="mb-4 text-[10px] text-slate-400">
          <span className="font-bold text-mira-magenta">*</span> Obligatoria
        </p>

        <div className="space-y-1.5 rounded-xl bg-mira-canvas/60 p-4">
          {[
            'Los nombres de las columnas deben coincidir exactamente. No se aceptan variantes.',
            'Fechas en AAAA-MM-DD o DD/MM/AAAA. El primer número es SIEMPRE el día: 01/02/2024 es el 1 de febrero.',
            'Precios con punto o con coma decimal, con separador de miles y con símbolo: «285,00 €», «1.285,50» y «1,285.50 USD» valen.',
            'Un separador suelto seguido de tres cifras («1.285») se rechaza por ambiguo: escribe 1285 o 1.285,00.',
            'Monedas admitidas: EUR (€), USD ($) y GBP (£). Se guarda siempre el código ISO; los precios no se convierten nunca.',
            'La unidad admite «€/100 Kg», «EUR/100 kg» o solo «100 kg». La moneda se separa y se guarda aparte.',
            'Si la moneda de la columna, la de la unidad y la del precio no coinciden, la fila se rechaza: no se elige una en silencio.',
            'La unidad debe coincidir con la configurada en la ficha de la referencia. Mezclar «kg» y «100 kg» multiplicaría la serie por cien.',
            'market_slug y product_slug deben existir ya en MIRA. La importación nunca crea mercados ni productos.',
            'La lonja del archivo MANDA: una misma referencia puede tener precio en España, Alemania y Europa el mismo día. Si no la indicas, se hereda la de la ficha del producto.',
            'Si no hay lonja ni en el archivo ni en la ficha, la fila se rechaza: sin ella no se pueden distinguir dos precios del mismo día.',
            'La lonja del producto NO se modifica al importar.',
            'Todas las fechas deben caer dentro del periodo que selecciones arriba.',
            'Un precio ya existente para el mismo producto, fecha, moneda, unidad y LONJA se marca como duplicado y NO se sobrescribe.',
          ].map((t, i) => (
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
          <h2 className="text-sm font-black text-mira-ink">Importaciones recientes</h2>
        </div>

        {historial.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">
            Todavía no se ha importado ningún archivo.
          </p>
        ) : (
          <MiraTable headers={['Archivo', 'Periodo', 'Estado', 'Filas', 'Importadas', 'Fecha', 'Usuario']}>
            {historial.map((b) => {
              const estado = ESTADO_BATCH[b.status]
              return (
                <MiraTr key={b.id}>
                  <MiraTd>
                    <span className="font-mono text-xs text-slate-600">{b.filename}</span>
                  </MiraTd>
                  <MiraTd>
                    <span className="text-xs text-slate-500">
                      {IMPORT_PERIOD_LABELS[b.periodType]} · {b.periodLabel}
                    </span>
                  </MiraTd>
                  <MiraTd>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${estado.className}`}>
                      {estado.label}
                    </span>
                  </MiraTd>
                  <MiraTd>{b.totalRows}</MiraTd>
                  <MiraTd>
                    <span className="font-bold text-emerald-700">{b.importedRows}</span>
                    {(b.invalidRows > 0 || b.duplicateRows > 0) && (
                      <span className="ml-1 text-[10px] text-slate-400">
                        ({b.invalidRows} inv · {b.duplicateRows} dup)
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
                </MiraTr>
              )
            })}
          </MiraTable>
        )}
      </section>
    </div>
  )
}
