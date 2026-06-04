'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TrendingUp } from 'lucide-react'
import { motion } from 'framer-motion'
import { MiraLogo } from './MiraLogo'
import { Button } from './Button'
import { DataAnchor } from './DataAnchor'
import { createClient } from '@/lib/supabase/client'

export const LoginPage = () => {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      setLoading(false)
      setError('Email o contraseña incorrectos. Inténtalo de nuevo.')
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .single()

    const destination = profile?.role === 'platform_admin' ? '/admin/dashboard' : '/app/dashboard'
    router.push(destination)
    router.refresh()
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
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 items-center">

          {/* Login Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-8 md:p-10 rounded-3xl border border-slate-200 shadow-2xl shadow-slate-200/50 w-full max-w-md mx-auto"
          >
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-heading font-bold text-slate-900 mb-3">
                Inicia sesión en tu cuenta
              </h1>
              <p className="text-sm text-slate-500 font-body">
                Accede a tus mercados, alertas e informes personalizados
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
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
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Contraseña
                  </label>
                  <a
                    href="/recuperar-password"
                    className="text-xs font-bold text-mira-primary hover:text-mira-secondary transition-colors"
                  >
                    ¿Has olvidado tu contraseña?
                  </a>
                </div>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-mira-primary focus:ring-2 focus:ring-mira-primary/20 outline-none transition-all text-sm text-slate-900"
                />
              </div>

              {error && (
                <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full mt-6" size="lg" disabled={loading}>
                {loading ? 'Iniciando sesión…' : 'Iniciar sesión'}
              </Button>
            </form>

            <div className="mt-8 text-center">
              <p className="text-sm text-slate-600">
                ¿No tienes cuenta?{' '}
                <a
                  href="/registro"
                  className="font-bold text-mira-primary hover:text-mira-secondary transition-colors"
                >
                  Empieza tu prueba gratuita
                </a>
              </p>
            </div>
          </motion.div>

          {/* Decorative Area */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="hidden md:flex flex-col items-center justify-center relative"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-mira-primary/10 to-mira-cyan/10 rounded-full blur-3xl -z-10" />
            <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-200 shadow-xl w-full max-w-sm relative">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-mira-primary/10 flex items-center justify-center text-mira-primary">
                    <TrendingUp size={20} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Inteligencia Activa
                    </span>
                    <span className="text-sm font-bold text-slate-800">Mercado Porcino</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded">
                  +2.4%
                </div>
              </div>
              <div className="h-24 w-full relative mb-4">
                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="loginChartGradient" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#8F2E6D" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#8F2E6D" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0,80 C30,70 60,90 90,60 C120,30 150,50 180,40 C210,30 240,50 270,20 C300,-10 330,20 360,10"
                    fill="none"
                    stroke="#8F2E6D"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M0,80 C30,70 60,90 90,60 C120,30 150,50 180,40 C210,30 240,50 270,20 C300,-10 330,20 360,10 V100 H0 Z"
                    fill="url(#loginChartGradient)"
                  />
                  <circle cx="360" cy="10" r="4" fill="#8F2E6D" stroke="white" strokeWidth="2" />
                </svg>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">Predicción IA a 30 días</span>
                <span className="text-xs font-bold text-mira-primary">Alta Confianza (92%)</span>
              </div>
            </div>
            <div className="mt-8 text-center max-w-xs">
              <p className="text-sm font-body text-slate-500 italic">
                &ldquo;La información es la materia prima más valiosa de tu negocio.&rdquo;
              </p>
            </div>
          </motion.div>
        </div>
      </main>

      <DataAnchor isFloating={true} />
    </div>
  )
}
