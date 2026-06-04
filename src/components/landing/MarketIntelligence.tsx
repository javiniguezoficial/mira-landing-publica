'use client'
import { useState } from 'react'
import { TrendingUp, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

export const MarketIntelligence = () => {
  const [activeTab, setActiveTab] = useState('Agrícola')

  const tabs = [
    {
      id: 'Agrícola',
      icon: '🌾',
      label: 'Cereales, Aceite, Frutas',
      families: ['Aceite', 'Animal procesado', 'Arroz', 'Cereales', 'Cultivos', 'Frutas', 'Fruto seco', 'Grasas', 'Hortalizas', 'Legumbres', 'Vino'],
    },
    {
      id: 'Ganadero',
      icon: '🐄',
      label: 'Porcino, Avícola, Lácteo',
      families: ['Avícola', 'Bovino', 'Conejo', 'Gallina', 'Lácteo', 'Ovino', 'Pavo', 'Porcino'],
    },
    {
      id: 'Industrial',
      icon: '🏭',
      label: 'Cartón, Plástico, Transporte',
      families: ['Carburantes', 'Cartón', 'Electricidad', 'Gas', 'Metales', 'Papel', 'Petróleo', 'Plástico'],
    },
    {
      id: 'Económico',
      icon: '📈',
      label: 'IPC, Tipos de Interés',
      families: ['IPC', 'Tipos de Interés', 'Inflación', 'PIB', 'Divisas'],
    },
  ]

  const activeTabData = tabs.find((t) => t.id === activeTab) || tabs[0]

  return (
    <section id="mercados" className="py-32 bg-white relative overflow-hidden border-t border-slate-100">
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-multiply pointer-events-none" />
      <svg className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-[0.03]" preserveAspectRatio="none" viewBox="0 0 1440 800">
        <path d="M-100,600 C200,500 400,700 800,400 C1100,100 1300,200 1540,100" fill="none" stroke="#8F2E6D" strokeWidth="2" />
      </svg>

      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="max-w-3xl mx-auto text-center mb-20">
          <span className="text-mira-primary font-bold tracking-wider uppercase text-xs mb-4 block">
            Cobertura Integral
          </span>
          <h2 className="text-4xl md:text-5xl font-heading font-bold text-slate-900 mb-6">
            Tu sector, monitorizado en{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-mira-primary to-mira-secondary">
              tiempo real
            </span>
            .
          </h2>
          <p className="text-xl font-body text-slate-600">
            Centralizamos datos de lonjas, boletines oficiales y mercados de futuros en un único
            dashboard.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Tabs Sidebar */}
          <div className="lg:col-span-4 space-y-3">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full text-left px-6 py-4 rounded-xl transition-all duration-200 flex items-center gap-4 group border',
                  activeTab === tab.id
                    ? 'bg-slate-50 border-mira-primary/30 shadow-sm'
                    : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-200'
                )}
              >
                <span className="text-2xl filter drop-shadow-sm group-hover:scale-110 transition-transform">
                  {tab.icon}
                </span>
                <div>
                  <span
                    className={cn(
                      'font-display font-bold text-lg block',
                      activeTab === tab.id ? 'text-mira-primary' : 'text-slate-700'
                    )}
                  >
                    {tab.id}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">{tab.label}</span>
                </div>
                {activeTab === tab.id && (
                  <div className="ml-auto text-mira-primary">
                    <ChevronRight size={20} />
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Dynamic Content Area */}
          <div className="lg:col-span-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.3 }}
                className="bg-white rounded-xl border border-slate-200 shadow-xl shadow-slate-200/40 p-8 h-full min-h-[500px] flex flex-col relative overflow-hidden"
              >
                <div className="flex items-center justify-between mb-6 relative z-10 border-b border-slate-100 pb-6">
                  <div>
                    <h3 className="text-2xl font-heading font-bold text-slate-900 mb-1">
                      {activeTab} Market Overview
                    </h3>
                    <p className="text-slate-500 text-xs font-body font-bold uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      Datos oficiales actualizados
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {['Semana', 'Mes', 'Año'].map((filter, i) => (
                      <button
                        key={filter}
                        className={cn(
                          'px-4 py-1.5 text-xs font-bold rounded border transition-colors',
                          i === 1
                            ? 'bg-slate-800 text-white border-slate-800'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        )}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Familias / Categorías */}
                <div className="flex flex-wrap gap-2 mb-8 relative z-10">
                  {activeTabData.families.map((family) => (
                    <div
                      key={family}
                      className="px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-white hover:border-mira-primary/30 hover:text-mira-primary hover:shadow-sm transition-all cursor-default flex items-center gap-1.5"
                    >
                      <span className="w-1 h-1 rounded-full bg-slate-300" />
                      {family}
                    </div>
                  ))}
                </div>

                {/* Análisis de Discrepancias callout */}
                <div className="mb-8 p-4 bg-slate-50 rounded-lg border border-slate-200 flex items-start gap-4">
                  <div className="p-2 bg-white rounded border border-slate-200 text-mira-primary shadow-sm">
                    <TrendingUp size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 mb-1">
                      Análisis de Discrepancias
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed max-w-lg">
                      La línea sólida representa el precio medio de mercado (Poolred/Lonja). La
                      línea punteada es tu precio medio de adquisición.{' '}
                      <span className="font-bold text-slate-800">
                        Detecta sobrecostes al instante.
                      </span>
                    </p>
                  </div>
                </div>

                {/* Chart Visualization */}
                <div className="flex-1 w-full relative mb-6 min-h-[250px] bg-slate-50/50 rounded-lg border border-slate-100 p-4">
                  <div className="absolute inset-4 grid grid-cols-6 grid-rows-5 border-l border-b border-slate-200">
                    {[...Array(30)].map((_, i) => (
                      <div key={i} className="border-t border-r border-slate-100" />
                    ))}
                  </div>

                  <svg
                    className="absolute inset-4 w-[calc(100%-32px)] h-[calc(100%-32px)] overflow-visible"
                    preserveAspectRatio="none"
                    viewBox="0 0 600 250"
                  >
                    <defs>
                      <linearGradient id="marketGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#8F2E6D" stopOpacity="0.1" />
                        <stop offset="100%" stopColor="#8F2E6D" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0,200 C50,190 100,210 150,150 C200,90 250,130 300,110 C350,90 400,60 450,80 C500,100 550,40 600,50"
                      fill="url(#marketGradient)"
                      stroke="#8F2E6D"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M0,210 C50,200 100,220 150,170 C200,110 250,150 300,130 C350,110 400,80 450,100 C500,120 550,60 600,70"
                      fill="none"
                      stroke="#64748b"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="300" cy="110" r="3" fill="#8F2E6D" stroke="white" strokeWidth="1.5" />
                    <circle cx="450" cy="80" r="3" fill="#8F2E6D" stroke="white" strokeWidth="1.5" />
                    <circle cx="600" cy="50" r="4" fill="#8F2E6D" stroke="white" strokeWidth="2" />
                    <g transform="translate(420, 20)">
                      <rect x="0" y="0" width="110" height="46" rx="4" fill="#0f172a" />
                      <text x="55" y="16" textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="bold" letterSpacing="0.5">
                        PRECIO MERCADO
                      </text>
                      <text x="55" y="34" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold" fontFamily="monospace">
                        3.45 €/kg
                      </text>
                      <path d="M55,46 L50,51 L60,51 Z" fill="#0f172a" />
                    </g>
                  </svg>

                  <div className="absolute left-0 bottom-0 w-full flex justify-between px-4 pb-1 text-[10px] text-slate-400 font-mono">
                    <span>ENE</span>
                    <span>FEB</span>
                    <span>MAR</span>
                    <span>ABR</span>
                    <span>MAY</span>
                    <span>JUN</span>
                    <span>JUL</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 border-t border-slate-100 pt-6">
                  {[
                    { label: 'Precio Mercado', value: '3.45 €', change: '+1.2%', alert: false },
                    { label: 'Tu Precio', value: '3.52 €', change: '+2.1%', alert: false },
                    { label: 'Diferencial', value: '-0.07 €', change: 'Alerta', alert: true },
                  ].map((stat, i) => (
                    <div key={i} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        {stat.label}
                      </p>
                      <div className="flex items-end gap-2">
                        <span className="text-xl font-display font-bold text-slate-900">
                          {stat.value}
                        </span>
                        <span
                          className={cn(
                            'text-[10px] font-bold px-1.5 py-0.5 rounded',
                            stat.alert ? 'text-rose-600 bg-rose-100' : 'text-slate-500 bg-slate-200'
                          )}
                        >
                          {stat.change}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  )
}
