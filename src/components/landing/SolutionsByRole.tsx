'use client'

export const SolutionsByRole = () => {
  const roles = [
    {
      title: 'Compras',
      desc: 'Optimiza el momento de compra y negocia mejor con proveedores.',
      icon: '🛒',
    },
    {
      title: 'Finanzas / CEO',
      desc: 'Anticipa el impacto en márgenes y ajusta presupuestos con precisión.',
      icon: '💼',
    },
    {
      title: 'Auditoría',
      desc: 'Justifica precios de transferencia con datos de mercado oficiales.',
      icon: '📊',
    },
  ]

  return (
    <section id="soluciones" className="py-28 bg-white border-y border-slate-100 relative overflow-hidden">
      <div className="absolute inset-0 bg-agri-pattern pointer-events-none" />
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {roles.map((role, i) => (
            <div
              key={i}
              className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 hover:shadow-xl hover:border-mira-primary/20 transition-all duration-300 group"
            >
              <div className="w-14 h-14 bg-slate-50 rounded-lg flex items-center justify-center text-2xl mb-6 group-hover:scale-105 transition-transform border border-slate-100 group-hover:bg-white group-hover:shadow-md">
                {role.icon}
              </div>
              <h3 className="text-xl font-heading font-bold text-slate-900 mb-3 group-hover:text-mira-primary transition-colors">
                {role.title}
              </h3>
              <p className="text-slate-600 font-body text-sm leading-relaxed">{role.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
