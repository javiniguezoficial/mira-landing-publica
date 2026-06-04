'use client'
import { useState, useEffect } from 'react'
import { X, TrendingUp, TrendingDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from './Button'
import { DataAnchor } from './DataAnchor'

export const Hero = () => {
  const [isDemoOpen, setIsDemoOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsDemoOpen(false)
    }
    if (isDemoOpen) window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isDemoOpen])

  return (
    <section className="relative pt-32 pb-24 md:pt-48 md:pb-40 overflow-hidden bg-slate-50">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-mesh-gradient opacity-60 pointer-events-none" />
      <div className="absolute inset-0 bg-noise opacity-40 mix-blend-overlay pointer-events-none" />
      <div className="absolute inset-0 bg-agri-pattern pointer-events-none" />

      {/* Market Curve Background */}
      <svg
        className="absolute bottom-0 left-0 w-full h-[85%] pointer-events-none opacity-[0.06]"
        preserveAspectRatio="none"
        viewBox="0 0 1440 600"
      >
        <path
          d="M0,600 C320,400 480,550 720,350 C960,150 1100,300 1440,100 V600 H0 Z"
          fill="url(#heroCurveGradient)"
        />
        <path
          d="M0,600 C280,500 520,580 760,400 C1000,220 1240,320 1440,180 V600 H0 Z"
          fill="url(#heroCurveGradient)"
          opacity="0.4"
        />
        <defs>
          <linearGradient id="heroCurveGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#8F2E6D" stopOpacity="1" />
            <stop offset="100%" stopColor="#8F2E6D" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">

          {/* Text Content */}
          <div className="lg:col-span-6 space-y-10">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            >
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/80 backdrop-blur-md border border-slate-200 text-mira-primary text-xs font-display font-bold tracking-wide uppercase mb-8 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-mira-primary animate-pulse" />
                Inteligencia de Mercado Alimentario
              </span>
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-heading font-bold text-slate-900 tracking-tight leading-[1.1] mb-8">
                Detecta discrepancias entre el mercado y{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-mira-primary to-mira-secondary">
                  tu precio real
                </span>
                .
              </h1>
              <p className="text-lg md:text-xl font-body text-slate-600 leading-relaxed max-w-xl">
                Monitorea tendencias en mercados{' '}
                <strong>agrícolas, ganaderos e industriales</strong>. Compara tus precios de
                adquisición con fuentes oficiales y optimiza tu estrategia de compras.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex flex-col sm:flex-row gap-5"
            >
              <Button
                href="/registro"
                size="lg"
                className="w-full sm:w-auto px-10 text-lg shadow-xl shadow-mira-primary/20"
              >
                Empezar prueba gratuita
              </Button>
            </motion.div>

            <div className="pt-8 border-t border-slate-200/60 flex items-center gap-6">
              <div className="flex -space-x-3">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-10 h-10 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 shadow-sm"
                  >
                    {String.fromCharCode(64 + i)}
                  </div>
                ))}
              </div>
              <div className="text-sm font-body text-slate-500">
                <p className="font-bold text-slate-700">Confianza de líderes del sector</p>
                <p>Más de 200 empresas alimentarias</p>
              </div>
            </div>
          </div>

          {/* Dynamic Data Visualization */}
          <div className="lg:col-span-6 relative h-[600px] hidden lg:block">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-to-tr from-mira-secondary/10 to-mira-cyan/10 rounded-full blur-3xl -z-10" />

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="absolute top-10 right-0 z-20 w-full flex justify-end"
            >
              <DataAnchor />
            </motion.div>

            {/* Floating Elements */}
            <motion.div
              animate={{ y: [0, -12, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute top-24 left-4 glass-card p-4 rounded-xl border border-slate-200 shadow-lg max-w-[200px] z-10"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600">
                  <TrendingUp size={14} />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                    Mantequilla
                  </span>
                  <span className="text-xs font-bold text-slate-800">6.450 €/Ton</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded w-fit">
                +25 €
              </div>
            </motion.div>

            <motion.div
              animate={{ y: [0, 15, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              className="absolute bottom-32 left-12 glass-card p-4 rounded-xl border border-slate-200 shadow-lg max-w-[200px] z-10"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-lg bg-rose-100 flex items-center justify-center text-rose-600">
                  <TrendingUp size={14} />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                    Porcino vivo
                  </span>
                  <span className="text-xs font-bold text-slate-800">1.85 €/kg</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded w-fit">
                +0.05 €
              </div>
            </motion.div>

            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
              className="absolute bottom-16 right-24 glass-card p-4 rounded-xl border border-slate-200 shadow-lg max-w-[200px] z-10"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600">
                  <TrendingDown size={14} />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                    Trigo blando
                  </span>
                  <span className="text-xs font-bold text-slate-800">215 €/Ton</span>
                </div>
              </div>
              <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-400 w-[40%]" />
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Demo Video Modal */}
      <AnimatePresence>
        {isDemoOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"
              onClick={() => setIsDemoOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="relative w-full max-w-5xl bg-slate-900 rounded-3xl shadow-2xl overflow-hidden aspect-video border border-slate-700/50"
            >
              <button
                onClick={() => setIsDemoOpen(false)}
                className="absolute top-4 right-4 md:top-6 md:right-6 z-10 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center backdrop-blur-md transition-all border border-white/10 hover:scale-105"
              >
                <X size={20} />
              </button>
              <div className="w-full h-full bg-slate-800 flex items-center justify-center relative">
                <div className="absolute inset-0 bg-gradient-to-tr from-mira-primary/20 to-mira-cyan/20 opacity-50" />
                <iframe
                  className="w-full h-full relative z-10"
                  src="https://www.youtube.com/embed/u_5wLvlRhc0?si=4MPm6ZHdmcOOlEGN?autoplay=1&mute=1"
                  title="MIRA Demo Video"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  )
}
