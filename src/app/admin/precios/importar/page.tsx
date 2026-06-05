import { Download, FileSpreadsheet, AlertCircle } from 'lucide-react'
import { ImportPriceForm } from '@/components/admin/prices/ImportPriceForm'

export default function ImportarPreciosPage() {
  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-slate-900">Importar precios</h1>
        <p className="text-slate-500 font-body text-sm mt-1">
          Carga masiva de registros de precio desde archivo CSV o XLSX
        </p>
      </div>

      {/* Plantilla */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <FileSpreadsheet size={18} className="text-mira-primary" />
          <h2 className="text-sm font-bold text-slate-900">Plantilla de importación</h2>
        </div>

        <p className="text-xs text-slate-500 mb-4">
          Descarga la plantilla con las columnas correctas y datos de ejemplo. No modifiques los nombres de las columnas.
        </p>

        <div className="flex gap-3 mb-6">
          <a
            href="/api/admin/price-template?format=csv"
            download
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Download size={14} />
            Descargar CSV
          </a>
          <a
            href="/api/admin/price-template?format=xlsx"
            download
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Download size={14} />
            Descargar XLSX
          </a>
        </div>

        {/* Instrucciones */}
        <div className="bg-slate-50 rounded-lg p-4 space-y-1.5">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertCircle size={13} className="text-slate-400" />
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Instrucciones</p>
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
                className={`text-xs px-2 py-0.5 rounded font-mono ${
                  c.endsWith('*')
                    ? 'bg-mira-primary/10 text-mira-primary font-bold'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {c.replace(' *', '')}
                {c.endsWith('*') && <span className="text-mira-primary ml-0.5">*</span>}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-2"><span className="text-mira-primary font-bold">*</span> Obligatorio</p>
        </div>
      </div>

      {/* Upload */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-sm font-bold text-slate-900 mb-4">Subir archivo</h2>
        <ImportPriceForm />
      </div>
    </div>
  )
}
