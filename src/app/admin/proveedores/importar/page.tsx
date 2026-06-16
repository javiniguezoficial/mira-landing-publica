import Link from 'next/link'
import { ArrowLeft, Download, FileSpreadsheet, AlertCircle } from 'lucide-react'
import { ImportSupplierForm } from '@/components/admin/suppliers/ImportSupplierForm'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { miraBtn } from '@/lib/miraButtons'

const TEMPLATE_COLUMNS = [
  'nombre *', 'email', 'telefono', 'web', 'nif_cif', 'pais', 'provincia',
  'localidad', 'codigo_postal', 'direccion', 'latitud', 'longitud', 'categoria',
  'mercado', 'familia', 'subfamilia', 'produccion', 'medida', 'notas', 'activo',
]

export default function ImportarProveedoresPage() {
  return (
    <div className="w-full max-w-4xl space-y-6 p-4 md:p-6 xl:p-8">
      <div>
        <Link href="/admin/proveedores" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-mira-magenta">
          <ArrowLeft size={14} />
          Volver a proveedores
        </Link>
        <MiraPageHeader
          icon={FileSpreadsheet}
          title="Importar proveedores"
          subtitle="Carga masiva de proveedores desde archivo CSV o XLSX"
        />
      </div>

      {/* Plantilla */}
      <div className="mira-card rounded-2xl p-6">
        <div className="mb-4 flex items-center gap-2">
          <FileSpreadsheet size={18} className="text-mira-magenta" />
          <h2 className="text-sm font-black text-mira-ink">Plantilla de importación</h2>
        </div>

        <p className="mb-4 text-xs text-slate-500">
          Descarga la plantilla con las columnas correctas y datos de ejemplo. Solo <code className="font-mono text-mira-magenta">nombre</code> es obligatorio.
          No modifiques los nombres de las columnas.
        </p>

        <div className="mb-6 flex gap-3">
          <a href="/api/admin/supplier-template?format=csv" download className={miraBtn.ghost}>
            <Download size={14} />
            Descargar CSV
          </a>
          <a href="/api/admin/supplier-template?format=xlsx" download className={miraBtn.ghost}>
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
            'Solo «nombre» es obligatorio; el resto son opcionales.',
            'El CSV usa punto y coma (;) como separador, compatible con Excel en España.',
            'El campo «mercado» se resuelve por nombre contra los mercados de MIRA. Si no existe, se deja vacío y se avisa (no bloquea la importación).',
            '«activo» acepta: 1, 0, sí, si, no, true, false. Vacío = activo.',
            '«latitud» y «longitud» deben ser números válidos si se informan.',
            '«email» debe tener formato válido si se informa.',
            'Las filas con errores no se importan; el resto sí.',
            'Los duplicados (mismo nombre + provincia/localidad) se omiten y se reportan como aviso.',
            `Máximo 5.000 filas y 5 MB por archivo. Para importaciones superiores, divide el archivo en varios lotes.`,
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
            {TEMPLATE_COLUMNS.map(c => (
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
        <ImportSupplierForm />
      </div>
    </div>
  )
}
