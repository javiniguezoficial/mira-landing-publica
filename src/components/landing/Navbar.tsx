'use client'
import { useState, useEffect } from 'react'
import { Menu, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { MiraLogo } from './MiraLogo'
import { Button } from './Button'

export const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-500',
        isScrolled
          ? 'bg-white/90 backdrop-blur-xl border-b border-slate-200 py-3 shadow-sm'
          : 'bg-transparent py-6'
      )}
    >
      <div className="container mx-auto px-4 md:px-6 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="flex items-center gap-3">
          <MiraLogo className="w-10 h-10" />
          <span className="text-2xl font-display font-bold tracking-tight text-mira-primary">mira</span>
        </a>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          {['Mercados', 'Soluciones', 'Precios'].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="text-sm font-body font-semibold text-slate-600 hover:text-mira-primary transition-colors relative group"
            >
              {item}
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-mira-primary transition-all duration-300 group-hover:w-full" />
            </a>
          ))}
        </nav>

        {/* Actions */}
        <div className="hidden md:flex items-center gap-4">
          <a
            href="/login"
            className="text-sm font-body font-semibold text-slate-600 hover:text-mira-primary transition-colors"
          >
            Iniciar sesión
          </a>
          <Button variant="primary" size="sm" href="/registro">
            Empezar prueba gratuita
          </Button>
        </div>

        {/* Mobile Toggle */}
        <button
          className="md:hidden p-2 text-slate-600 hover:text-mira-primary transition-colors"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="absolute top-full left-0 right-0 bg-white/95 backdrop-blur-xl border-b border-slate-200 p-4 shadow-lg md:hidden overflow-hidden"
          >
            <nav className="flex flex-col gap-4">
              {['Mercados', 'Soluciones', 'Precios'].map((item) => (
                <a
                  key={item}
                  href={`#${item.toLowerCase()}`}
                  className="text-lg font-display font-bold text-slate-800 hover:text-mira-primary"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {item}
                </a>
              ))}
              <hr className="border-slate-100" />
              <a
                href="/login"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-left text-base font-body font-semibold text-slate-600 hover:text-mira-primary"
              >
                Iniciar sesión
              </a>
              <Button
                href="/registro"
                className="w-full"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Empezar prueba gratuita
              </Button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
