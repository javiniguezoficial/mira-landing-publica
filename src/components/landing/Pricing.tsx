'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

export const Pricing = () => {
  const [isAnnual, setIsAnnual] = useState(true)

  return (
    <section id="precios" className="py-32 bg-slate-50 border-y border-slate-200 relative overflow-hidden">
      <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-mira-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-mira-cyan/5 rounded-full blur-3xl pointer-events-none" />

      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <h2 className="text-4xl md:text-5xl font-heading font-bold text-slate-900 mb-6">
            Inteligencia de mercado accesible.
          </h2>
          <p className="text-xl text-slate-600 font-body mb-10">
            Sin costes de implementación. Sin consultoría opaca. Acceso inmediato.
          </p>

          {/* Toggle mensual/anual */}
          <div className="inline-flex items-center p-1.5 bg-white border border-slate-200 rounded-full shadow-sm">
            <button
              onClick={() => setIsAnnual(false)}
              className={cn(
                'px-8 py-3 rounded-full text-sm font-bold transition-all duration-300',
                !isAnnual ? 'bg-mira-primary text-white shadow-md' : 'text-slate-500 hover:text-slate-900'
              )}
            >
              Mensual
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              className={cn(
                'px-8 py-3 rounded-full text-sm font-bold transition-all duration-300 flex items-center gap-2',
                isAnnual ? 'bg-mira-primary text-white shadow-md' : 'text-slate-500 hover:text-slate-900'
              )}
            >
              Anual{' '}
              <span
                className={cn(
                  'text-[10px] px-2 py-0.5 rounded-full font-bold',
                  isAnnual ? 'bg-white/20 text-white' : 'bg-mira-mint text-emerald-800'
                )}
              >
                -15%
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto items-start">
          {/* Starter */}
          <div className="bg-white p-10 rounded-3xl border border-slate-200 shadow-sm hover:shadow-lg transition-shadow duration-300">
            <h3 className="text-2xl font-heading font-bold text-slate-900 mb-2">Starter</h3>
            <p className="text-sm text-slate-500 mb-8 font-medium">Para exploradores</p>
            <div className="mb-8">
              <span className="text-5xl font-display font-bold text-slate-900">0€</span>
            </div>
            <Button href="/registro" variant="outline" className="w-full mb-10 border-slate-300">
              Crear cuenta gratis
            </Button>
            <ul className="space-y-4 text-sm text-slate-600 font-body">
              <li className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-slate-300" />
                Disposición de todos los mercados
              </li>
              <li className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-slate-300" />
                Actualización mensual
              </li>
              <li className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-slate-300" />
                Acceso a noticias e insights
              </li>
            </ul>
          </div>

          {/* Business — destacado */}
          <div className="bg-white p-10 rounded-3xl border-2 border-mira-primary shadow-2xl shadow-mira-primary/10 relative transform md:-translate-y-6 z-10">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-mira-primary text-white px-6 py-2 rounded-full text-xs font-bold tracking-wide uppercase shadow-lg">
              Mejor Valor
            </div>
            <h3 className="text-2xl font-heading font-bold text-slate-900 mb-2">Business</h3>
            <p className="text-sm text-slate-500 mb-8 font-medium">
              Para profesionales de compras y PYMES
            </p>
            <div className="mb-8 flex items-baseline gap-1">
              <span className="text-6xl font-display font-bold text-slate-900">
                {isAnnual ? '51€' : '60€'}
              </span>
              <span className="text-slate-500 font-medium">/mes</span>
            </div>
            <p className="text-xs text-slate-400 mb-8 font-medium flex items-center gap-2 min-h-[24px]">
              {isAnnual && (
                <span className="bg-mira-mint/20 text-emerald-700 px-2 py-0.5 rounded font-bold">
                  15% descuento anual
                </span>
              )}
            </p>
            <Button
              href="/registro"
              variant="primary"
              size="lg"
              className="w-full mb-10 shadow-xl shadow-mira-primary/30"
            >
              Empezar prueba gratuita
            </Button>
            <ul className="space-y-5 text-sm text-slate-700 font-body font-medium">
              {[
                'Todo lo incluido en Starter',
                'Histórico ilimitado',
                'Informes personalizados',
                'Predicciones de IA',
                'Alertas ilimitadas',
              ].map((feat, i) => (
                <li key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-mira-primary/10 text-mira-primary flex items-center justify-center text-xs font-bold">
                    ✓
                  </div>
                  {i === 0 || i === 3 ? <strong>{feat}</strong> : feat}
                </li>
              ))}
            </ul>
          </div>

          {/* Enterprise */}
          <div className="bg-white p-10 rounded-3xl border border-slate-200 shadow-sm hover:shadow-lg transition-shadow duration-300">
            <h3 className="text-2xl font-heading font-bold text-slate-900 mb-2">Enterprise</h3>
            <p className="text-sm text-slate-500 mb-8 font-medium">Para grandes corporaciones</p>
            <div className="mb-8">
              <span className="text-3xl font-display font-bold text-slate-900">
                Precio personalizado
              </span>
            </div>
            <Button
              href="/enterprise"
              variant="ghost"
              className="w-full mb-10 border border-slate-200 hover:border-mira-primary hover:bg-white"
            >
              Contactar con ventas
            </Button>
            <ul className="space-y-4 text-sm text-slate-600 font-body">
              {['Todo lo incluido en Business', 'API Access', 'Multi-usuario', 'Account manager dedicado'].map(
                (feat, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-slate-300" />
                    {feat}
                  </li>
                )
              )}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
