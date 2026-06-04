'use client'
import { motion } from 'framer-motion'
import { Button } from './Button'

export const AIPrediction = () => {
  return (
    <section className="py-32 bg-[#050608] text-white overflow-hidden relative border-t border-white/5">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(143,46,109,0.12),transparent_60%)] pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <svg className="absolute top-1/2 left-0 w-full h-[500px] -translate-y-1/2 opacity-20 mix-blend-screen" viewBox="0 0 1440 500" preserveAspectRatio="none">
          <path d="M0,250 C300,200 600,300 900,100 C1200,-100 1300,100 1440,50" fill="none" stroke="url(#techGradient)" strokeWidth="2" />
          <defs>
            <linearGradient id="techGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#8F2E6D" stopOpacity="0" />
              <stop offset="50%" stopColor="#CB6CE6" stopOpacity="1" />
              <stop offset="100%" stopColor="#5CE1E6" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-mira-primary/10 rounded-full blur-[120px] mix-blend-screen" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-mira-secondary/10 rounded-full blur-[120px] mix-blend-screen" />
      </div>
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay" />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-mira-accent text-[10px] font-bold tracking-widest uppercase mb-8 backdrop-blur-md shadow-[0_0_15px_rgba(203,108,230,0.15)]">
              <span className="w-2 h-2 rounded-full bg-mira-accent animate-pulse shadow-[0_0_10px_currentColor]" />
              MIRA AI Engine
            </div>
            <h2 className="text-4xl md:text-6xl font-heading font-bold mb-6 leading-tight">
              No reacciones al mercado.{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-mira-accent to-mira-cyan">
                Anticípate.
              </span>
            </h2>
            <p className="text-slate-400 text-lg font-body leading-relaxed mb-10 max-w-lg">
              Nuestros algoritmos analizan <strong>+20 variables</strong> históricas, estacionales y
              macroeconómicas para proyectar tendencias de precios a 6 y 12 meses con intervalos de
              confianza.
            </p>

            <ul className="space-y-6 mb-12">
              {[
                { text: 'Forecasting a 12 meses vista', icon: '📅' },
                { text: 'Detección de anomalías en tiempo real', icon: '⚡' },
                { text: 'Correlación con variables macroeconómicas', icon: '🌍' },
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-4 text-slate-300 font-body group">
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-mira-accent/50 group-hover:bg-mira-accent/10 transition-all duration-300">
                    <span className="text-lg">{item.icon}</span>
                  </div>
                  <span className="font-medium group-hover:text-white transition-colors">
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>

            <Button
              variant="secondary"
              size="lg"
              className="shadow-lg shadow-mira-secondary/20 hover:shadow-mira-secondary/40 border border-white/10"
            >
              Ver cómo funciona la IA
            </Button>
          </div>

          {/* AI Chart Visualization */}
          <div className="relative">
            <div className="glass-card-dark rounded-xl p-1 shadow-2xl border-white/10 relative overflow-hidden group hover:border-white/20 transition-colors duration-500">
              <div className="bg-[#13151A] rounded-lg p-8 relative overflow-hidden">
                <div className="absolute -inset-1 bg-gradient-to-r from-mira-accent to-mira-cyan opacity-0 group-hover:opacity-10 blur-2xl transition-opacity duration-500 -z-10" />

                <div className="flex justify-between items-center mb-10">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-mira-accent" />
                      <h4 className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                        Proyección Trigo Duro
                      </h4>
                    </div>
                    <div className="flex items-baseline gap-3">
                      <span className="text-4xl font-mono font-bold text-white tracking-tighter">
                        320.50 €
                      </span>
                      <span className="text-mira-mint text-xs font-bold bg-mira-mint/10 px-2 py-0.5 rounded border border-mira-mint/20">
                        +5.2% (Est.)
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="px-3 py-1 rounded bg-slate-800/50 border border-white/10 text-slate-300 text-[10px] font-bold mb-1 inline-block">
                      CONFIDENCE SCORE
                    </div>
                    <div className="text-mira-accent font-mono font-bold text-xl">92.4%</div>
                  </div>
                </div>

                {/* Chart Area */}
                <div className="h-64 w-full relative">
                  <div className="absolute inset-0 grid grid-cols-6 grid-rows-4 border-l border-b border-white/5">
                    {[...Array(24)].map((_, i) => (
                      <div key={i} className="border-t border-r border-white/5" />
                    ))}
                  </div>

                  <svg
                    className="absolute inset-0 w-full h-full overflow-visible"
                    preserveAspectRatio="none"
                    viewBox="0 0 400 200"
                  >
                    <defs>
                      <linearGradient id="predictionGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#CB6CE6" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#CB6CE6" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0,120 C40,115 80,125 120,100 C160,75 200,90 240,80"
                      fill="none"
                      stroke="#5CE1E6"
                      strokeWidth="2"
                      strokeLinecap="round"
                      className="drop-shadow-[0_0_8px_rgba(92,225,230,0.5)]"
                    />
                    <path
                      d="M240,80 C280,70 320,50 360,40 C380,35 400,30 400,30"
                      fill="none"
                      stroke="#CB6CE6"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                      strokeLinecap="round"
                      className="drop-shadow-[0_0_8px_rgba(203,108,230,0.5)]"
                    />
                    <path
                      d="M240,80 C280,60 320,30 360,20 C380,15 400,10 400,10 V60 C380,65 360,70 320,90 C280,110 240,80 240,80 Z"
                      fill="url(#predictionGradient)"
                      opacity="0.5"
                    />
                    <circle cx="240" cy="80" r="4" fill="#1A1A2E" stroke="#5CE1E6" strokeWidth="2" />
                    <circle cx="240" cy="80" r="8" fill="#5CE1E6" opacity="0.2" className="animate-pulse" />
                  </svg>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="absolute top-10 right-10 bg-mira-charcoal/90 backdrop-blur border border-white/10 p-3 rounded-lg shadow-xl"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full bg-mira-accent" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase">
                        Oportunidad de compra
                      </span>
                    </div>
                    <p className="text-sm font-bold text-white">Q3 2026</p>
                  </motion.div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
