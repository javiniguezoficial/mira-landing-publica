'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TrendingUp } from 'lucide-react'
import { motion } from 'framer-motion'
import { MiraLogo } from './MiraLogo'
import { Button } from './Button'
import { DataAnchor } from './DataAnchor'
import { createClient } from '@/lib/supabase/client'

export const SignupPage = () => {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [terms, setTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!terms) {
      setError('Debes aceptar los términos y condiciones para continuar.')
      return
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }

    setLoading(true)

    const parts = nombre.trim().split(' ')
    const first_name = parts[0] ?? ''
    const last_name = parts.slice(1).join(' ') || null

    const supabase = createClient()
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { first_name, last_name, company: empresa || null },
      },
    })

    setLoading(false)

    if (signUpError) {
      if (signUpError.message.includes('already registered')) {
        setError('Este email ya tiene una cuenta. Prueba a iniciar sesión.')
      } else {
        setError(signUpError.message)
      }
      return
    }

    setSuccess(true)
    setTimeout(() => router.push('/app/dashboard'), 2000)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full bg-agri-pattern opacity-30 pointer-events-none" />
      <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-mira-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-mira-cyan/5 rounded-full blur-3xl pointer-events-none" />

      {/* Simple Header */}
      <header className="relative z-10 py-6 px-6 md:px-10 flex items-center justify-between">
        <a href="/" className="flex items-center gap-3 group">
          <MiraLogo className="w-10 h-10 group-hover:scale-105 transition-transform" />
          <span className="text-2xl font-display font-bold tracking-tight text-mira-primary">mira</span>
        </a>
        <a
          href="/"
          className="text-sm font-bold text-slate-500 hover:text-mira-primary transition-colors flex items-center gap-2"
        >
          Volver al inicio
        </a>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-12 items-center">

          {/* Signup Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-8 md:p-10 rounded-3xl border border-slate-200 shadow-2xl shadow-slate-200/50 w-full max-w-md mx-auto md:mx-0 md:ml-auto"
          >
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-heading font-bold text-slate-900 mb-3">
                Empieza tu prueba gratuita
              </h1>
              <p className="text-sm text-slate-500 font-body">
                Accede a inteligencia de mercado en minutos
              </p>
            </div>

            {success ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="py-8 text-center"
              >
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-heading font-bold text-slate-900 mb-2">¡Cuenta creada!</h3>
                <p className="text-sm text-slate-500">Redirigiendo a tu panel…</p>
              </motion.div>
            ) : (
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Nombre
                </label>
                <input
                  type="text"
                  placeholder="Tu nombre completo"
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-mira-primary focus:ring-2 focus:ring-mira-primary/20 outline-none transition-all text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="tu@empresa.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-mira-primary focus:ring-2 focus:ring-mira-primary/20 outline-none transition-all text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Contraseña
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-mira-primary focus:ring-2 focus:ring-mira-primary/20 outline-none transition-all text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Empresa{' '}
                  <span className="text-slate-400 font-normal normal-case">(opcional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Nombre de tu empresa"
                  value={empresa}
                  onChange={e => setEmpresa(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-mira-primary focus:ring-2 focus:ring-mira-primary/20 outline-none transition-all text-sm text-slate-900"
                />
              </div>
              <div className="flex items-start gap-3 pt-2">
                <input
                  type="checkbox"
                  id="terms"
                  checked={terms}
                  onChange={e => setTerms(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-slate-300 text-mira-primary focus:ring-mira-primary"
                />
                <label htmlFor="terms" className="text-xs text-slate-600 leading-relaxed">
                  Acepto los{' '}
                  <a
                    href="/terminos-condiciones"
                    className="font-bold text-mira-primary hover:underline"
                  >
                    términos y condiciones
                  </a>{' '}
                  y la{' '}
                  <a
                    href="/politica-privacidad"
                    className="font-bold text-mira-primary hover:underline"
                  >
                    política de privacidad
                  </a>
                  .
                </label>
              </div>

              {error && (
                <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
                  {error}
                </div>
              )}

              <div className="pt-2">
                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? 'Creando cuenta…' : 'Crear cuenta y empezar prueba'}
                </Button>
                <p className="text-[11px] text-slate-500 text-center mt-3 font-medium">
                  14 días de prueba gratuita · Sin tarjeta de crédito
                </p>
              </div>
            </form>
            )}

            <div className="mt-8 text-center pt-6 border-t border-slate-100">
              <p className="text-sm text-slate-600">
                ¿Ya tienes cuenta?{' '}
                <a
                  href="/login"
                  className="font-bold text-mira-primary hover:text-mira-secondary transition-colors"
                >
                  Iniciar sesión
                </a>
              </p>
            </div>
          </motion.div>

          {/* Value Proposition */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="hidden md:flex flex-col justify-center max-w-md"
          >
            <h2 className="text-2xl font-heading font-bold text-slate-900 mb-8">
              Inteligencia de mercado en tiempo real
            </h2>
            <div className="space-y-6 mb-10">
              {[
                {
                  icon: <TrendingUp size={20} />,
                  title: 'Monitoriza precios de mercado',
                  desc: 'Accede a datos actualizados de lonjas y mercados de referencia en un solo lugar.',
                },
                {
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                      <line x1="12" y1="22.08" x2="12" y2="12" />
                    </svg>
                  ),
                  title: 'Detecta discrepancias con tus costes',
                  desc: 'Compara tus precios de compra con la media del mercado para evitar sobrecostes.',
                },
                {
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                  ),
                  title: 'Recibe alertas y predicciones de IA',
                  desc: 'Anticípate a las tendencias con modelos predictivos de alta confianza.',
                },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-mira-primary shrink-0">
                    {item.icon}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 mb-1">{item.title}</h3>
                    <p className="text-sm text-slate-600">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-white/80 backdrop-blur-md p-5 rounded-2xl border border-slate-200 shadow-xl relative">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600">
                    <TrendingUp size={16} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Agrícola
                    </span>
                    <span className="text-sm font-bold text-slate-800">Mercado Trigo Blando</span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm font-mono font-bold text-slate-900">245 €/Ton</span>
                  <span className="text-[10px] font-bold text-green-600">+1.2%</span>
                </div>
              </div>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-orange-400 w-[70%]" />
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      <DataAnchor isFloating={true} />
    </div>
  )
}
