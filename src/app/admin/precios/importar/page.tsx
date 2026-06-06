import { Download, FileSpreadsheet, AlertCircle } from 'lucide-react'
import { ImportPriceForm } from '@/components/admin/prices/ImportPriceForm'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { miraBtn } from '@/lib/miraButtons'

export default function ImportarPreciosPage() {
  return (
    <div className="w-full max-w-4xl space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader
        icon={FileSpreadsheet}
        title="Importar precios"
        subtitle="Carga masiva de registros de precio desde archivo CSV o XLSX"
      />

      {/* Plantilla */}
      <div className="mira-card rounded-2xl p-6">
        <div className="mb-4 flex items-center gap-2">
          <FileSpreadsheet size={18} className="text-mira-magenta" />
          <h2 className="text-sm font-black text-mira-ink">Plantilla de importación</h2>
        </div>

        <p className="mb-4 text-xs text-slate-500">
          Descarga la plantilla con las columnas correctas y datos de ejemplo. No modifiques los nombres de las columnas.
        </p>

        <div className="mb-6 flex gap-3">
          <a href="/api/admin/price-template?format=csv" download className={miraBtn.ghost}>
            <Download size={14} />
            Descargar CSV
          </a>
          <a href="/api/admin/price-template?format=xlsx" download className={miraBtn.ghost}>
            <Download size={14} />
            Descargar XLSX
          </a>
        </div>

        {/* Instrucciones */}
        <div className="space-y-1.5 rounded-xl bg-mira-canvas/60 p-4">
          <div className="mb-2 flex items-center gap-1.5">
            <AlertCircle size={13} className="text-slate-400" />
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Instrucciones</p>
          </div>
          {[
            'No cambies los nombres de las columnas.',
            'Usa formato de fecha YYYY-MM-DD (ej: 2026-06-01).',
            'Usa punto decimal, no coma (ej: 1.25, no 1,25).',
            'currency por defecto EUR si se deja vacío.',
            'country por defecto ES si se deja vacío.',
            'market_slug y product_slug deben coincidir exactamente con los existentes en MIRA.',
            'Las filas con errores no se importarán — el resto sí.',
            'Los duplicados (mismo producto + fecha + país + unidad) no se insertarán.',
          ].map((t, i) => (
            <p key={i} className="text-xs text-slate-500 flex items-start gap-2">
              <span className="text-slate-300 shrink-0">·</span>
              {t}
            </p>
          ))}
        </div>

        {/* Columnas */}
        <div className="mt-4">
          <p className="text-xs font-bold text-slate-600 mb-2">Columnas del archivo</p>
          <div className="flex flex-wrap gap-1.5">
            {['market_slug *','product_slug *','recorded_at *','price *','unit *','currency','country','region','min_price','max_price','avg_price','volume','source_name','notes'].map(c => (
              <span
                key={c}
                className={`rounded px-2 py-0.5 font-mono text-xs ${
                  c.endsWith('*')
                    ? 'bg-mira-magenta-soft font-bold text-mira-magenta'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {c.replace(' *', '')}
                {c.endsWith('*') && <span className="ml-0.5 text-mira-magenta">*</span>}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-400"><span className="font-bold text-mira-magenta">*</span> Obligatorio</p>
        </div>
      </div>

      {/* Upload */}
      <div className="mira-card rounded-2xl p-6">
        <h2 className="mb-4 text-sm font-black text-mira-ink">Subir archivo</h2>
        <ImportPriceForm />
      </div>
    </div>
  )
}
