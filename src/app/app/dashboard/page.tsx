// Fase 1 — Dashboard cliente con datos mock
// Conexión real a Supabase se añade en Fase 2

export default function AppDashboard() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 font-body text-sm mt-1">
          Bienvenido a MIRA Pricing
        </p>
      </div>

      {/* KPI Cards — mock */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[
          { label: 'Mercados seguidos', value: '12', change: '+2', up: true },
          { label: 'RFQs activas', value: '3', change: '1 nueva', up: true },
          { label: 'Alertas pendientes', value: '5', change: '-1', up: false },
          { label: 'Proveedores', value: '28', change: '+3', up: true },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm"
          >
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              {kpi.label}
            </p>
            <p className="text-3xl font-display font-bold text-slate-900 mb-1">{kpi.value}</p>
            <p
              className={`text-xs font-bold ${
                kpi.up ? 'text-green-600' : 'text-slate-400'
              }`}
            >
              {kpi.change}
            </p>
          </div>
        ))}
      </div>

      {/* Placeholder — módulos futuros */}
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <p className="text-slate-400 font-body text-sm">
          Los módulos de mercados, RFQs y proveedores se implementan en las siguientes fases.
        </p>
      </div>
    </div>
  )
}
