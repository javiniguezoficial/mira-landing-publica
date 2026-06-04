// Fase 1 — Dashboard admin con datos mock
// CRUD real se implementa en Fase 5

export default function AdminDashboard() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-slate-900">Panel de administración</h1>
        <p className="text-slate-500 font-body text-sm mt-1">Vista global de la plataforma MIRA</p>
      </div>

      {/* KPI Cards — mock */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[
          { label: 'Clientes activos', value: '24', change: '+3 este mes', up: true },
          { label: 'MRR', value: '1.240 €', change: '+180 €', up: true },
          { label: 'RFQs abiertas', value: '8', change: '2 nuevas', up: true },
          { label: 'Usuarios totales', value: '67', change: '+5', up: true },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm"
          >
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              {kpi.label}
            </p>
            <p className="text-3xl font-display font-bold text-slate-900 mb-1">{kpi.value}</p>
            <p className="text-xs font-bold text-green-600">{kpi.change}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <p className="text-slate-400 font-body text-sm">
          Los módulos de gestión (clientes, mercados, precios, usuarios) se implementan en Fase 5.
        </p>
      </div>
    </div>
  )
}
