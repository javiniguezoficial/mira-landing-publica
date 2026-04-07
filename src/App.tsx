/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Menu, X, ChevronRight, User, Play, TrendingUp, TrendingDown, ArrowRight, Facebook, Instagram, Linkedin, Youtube, Mail, Phone } from 'lucide-react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for merging tailwind classes
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const MiraLogo = ({ className }: { className?: string }) => (
  <img 
    src="https://entornodev.com/descargas/Logo-Mira-Header.webp" 
    alt="MIRA Intelligence" 
    className={cn("object-contain", className)} 
  />
);

const Button = React.forwardRef<HTMLButtonElement | HTMLAnchorElement, any>(
  ({ className, variant = 'primary', size = 'md', href, ...props }, ref) => {
    const variants = {
      primary: 'bg-mira-primary text-white hover:bg-mira-secondary shadow-lg shadow-mira-primary/20 hover:shadow-mira-secondary/30 rounded-lg',
      secondary: 'bg-gradient-to-r from-mira-secondary to-mira-accent text-white hover:opacity-90 shadow-md rounded-lg',
      outline: 'border border-slate-300 bg-white/50 backdrop-blur-sm hover:bg-white text-slate-900 rounded-lg',
      ghost: 'bg-transparent hover:bg-slate-100/50 text-slate-600 hover:text-mira-primary rounded-lg',
    };
    const sizes = {
      sm: 'h-8 px-3 text-xs',
      md: 'h-10 px-5 text-sm',
      lg: 'h-12 px-8 text-base',
    };
    const classes = cn(
      'inline-flex items-center justify-center font-bold tracking-wide transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira-primary disabled:pointer-events-none disabled:opacity-50 active:scale-95',
      variants[variant as keyof typeof variants],
      sizes[size as keyof typeof sizes],
      className
    );

    if (href) {
      return (
        <a ref={ref as any} href={href} className={classes} {...props} />
      );
    }
    return (
      <button
        ref={ref as any}
        className={classes}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

const Navbar = ({ onLoginClick, onSignupClick, onHomeClick }: { onLoginClick?: () => void, onSignupClick?: () => void, onHomeClick?: () => void }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-500',
        isScrolled ? 'bg-white/90 backdrop-blur-xl border-b border-slate-200 py-3 shadow-sm' : 'bg-transparent py-6'
      )}
    >
      <div className="container mx-auto px-4 md:px-6 flex items-center justify-between">
        {/* Logo */}
        <button onClick={onHomeClick} className="flex items-center gap-3">
          <MiraLogo className="w-10 h-10" />
          <span className="text-2xl font-display font-bold tracking-tight text-mira-primary">mira</span>
        </button>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          {['Mercados', 'Soluciones', 'Precios'].map((item) => (
            <a key={item} href={`#${item.toLowerCase()}`} className="text-sm font-body font-semibold text-slate-600 hover:text-mira-primary transition-colors relative group">
              {item}
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-mira-primary transition-all duration-300 group-hover:w-full" />
            </a>
          ))}
        </nav>

        {/* Actions */}
        <div className="hidden md:flex items-center gap-4">
          <a href="#contacto" onClick={onLoginClick as any} className="text-sm font-body font-semibold text-slate-600 hover:text-mira-primary transition-colors">
            Iniciar sesión
          </a>
          <Button variant="primary" size="sm" href="#contacto" onClick={onSignupClick as any}>
            Empezar prueba gratuita
          </Button>
        </div>

        {/* Mobile Toggle */}
        <button className="md:hidden p-2 text-slate-600 hover:text-mira-primary transition-colors" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
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
              <a href="#contacto" onClick={(e) => { setIsMobileMenuOpen(false); onLoginClick?.(e as any); }} className="text-left text-base font-body font-semibold text-slate-600 hover:text-mira-primary">
                Iniciar sesión
              </a>
              <Button href="#contacto" className="w-full" onClick={(e: any) => { setIsMobileMenuOpen(false); onSignupClick?.(e); }}>Empezar prueba gratuita</Button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

const Footer = ({ 
  onHomeClick, 
  onAvisoLegalClick, 
  onPoliticaCookiesClick, 
  onTerminosClick, 
  onPoliticaPrivacidadClick,
  onSobreNosotrosClick,
  onContactarVentasClick,
  onLoginClick,
  onSignupClick
}: { 
  onHomeClick?: () => void, 
  onAvisoLegalClick?: () => void, 
  onPoliticaCookiesClick?: () => void, 
  onTerminosClick?: () => void, 
  onPoliticaPrivacidadClick?: () => void,
  onSobreNosotrosClick?: () => void,
  onContactarVentasClick?: () => void,
  onLoginClick?: () => void,
  onSignupClick?: () => void
}) => {
  return (
    <footer className="bg-slate-50 border-t border-slate-200 pt-20 pb-10 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full bg-mesh-gradient opacity-30 pointer-events-none" />
      
      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-10 mb-16">
          <div className="col-span-2 lg:col-span-2">
            <button onClick={onHomeClick} className="flex items-center gap-3 mb-6">
              <MiraLogo className="h-8 w-auto" />
              <span className="text-2xl font-display font-bold text-slate-900">mira</span>
            </button>
            <p className="text-slate-600 text-sm font-body leading-relaxed max-w-xs mb-8">
              Plataforma de inteligencia de mercado para optimizar decisiones de compra con datos oficiales y predictivos.
            </p>
          </div>
          
          <div>
            <h4 className="font-display font-bold text-slate-900 mb-6">Información</h4>
            <ul className="space-y-3 text-sm font-body text-slate-600">
              <li><button onClick={onSobreNosotrosClick} className="hover:text-mira-primary transition-colors">Sobre nosotros</button></li>
              <li><button onClick={onContactarVentasClick} className="hover:text-mira-primary transition-colors">Contactar con ventas</button></li>
              <li><a href="#contacto" onClick={onLoginClick as any} className="hover:text-mira-primary transition-colors">Iniciar sesión</a></li>
              <li><a href="#contacto" onClick={onSignupClick as any} className="hover:text-mira-primary transition-colors">Prueba gratuita</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-bold text-slate-900 mb-6">Legal</h4>
            <ul className="space-y-3 text-sm font-body text-slate-600">
              <li><button onClick={onAvisoLegalClick} className="hover:text-mira-primary transition-colors">Aviso legal</button></li>
              <li><button onClick={onPoliticaPrivacidadClick} className="hover:text-mira-primary transition-colors">Política de privacidad</button></li>
              <li><button onClick={onTerminosClick} className="hover:text-mira-primary transition-colors">Términos y condiciones</button></li>
              <li><button onClick={onPoliticaCookiesClick} className="hover:text-mira-primary transition-colors">Política de cookies</button></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-bold text-slate-900 mb-6">Redes sociales</h4>
            <ul className="space-y-3 text-sm font-body text-slate-600">
              <li><a href="#" className="flex items-center gap-2 hover:text-mira-primary transition-colors"><Facebook size={16} /> Facebook</a></li>
              <li><a href="#" className="flex items-center gap-2 hover:text-mira-primary transition-colors"><Instagram size={16} /> Instagram</a></li>
              <li><a href="#" className="flex items-center gap-2 hover:text-mira-primary transition-colors"><Linkedin size={16} /> LinkedIn</a></li>
              <li><a href="#" className="flex items-center gap-2 hover:text-mira-primary transition-colors"><Youtube size={16} /> YouTube</a></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-slate-200/60 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-body text-slate-500">
          <p>&copy; {new Date().getFullYear()} MIRA Intelligence. Todos los derechos reservados.</p>
          <div className="flex gap-6">
            <span>Hecho en Europa</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

// --- New Components for Hero ---

const DataAnchor = ({ isFloating = false, currentPage = 'home' }: { isFloating?: boolean, currentPage?: string }) => {
  const { scrollY } = useScroll();
  const [isAnchored, setIsAnchored] = useState(false);
  const [activeMarket, setActiveMarket] = useState('pollo');
  const [isClosed, setIsClosed] = useState(false);
  
  // Transform values based on scroll position
  const scale = useTransform(scrollY, [0, 300], [1, 0.9]);
  const opacity = useTransform(scrollY, [0, 100], [1, 1]);

  useEffect(() => {
    const handleScroll = () => {
      setIsAnchored(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    // Initial check
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const showFloating = isFloating && (currentPage !== 'home' || isAnchored);

  if (isFloating && !showFloating) return null;

  if (isFloating && isClosed) {
    return (
      <button 
        onClick={() => setIsClosed(false)}
        className="fixed bottom-6 right-0 bg-slate-900 text-white p-3 rounded-l-xl shadow-2xl z-[100] hover:bg-mira-primary transition-colors flex items-center gap-2 group"
      >
        <TrendingUp size={16} className="group-hover:scale-110 transition-transform" />
        <span className="text-xs font-bold uppercase tracking-wider hidden group-hover:block">Mercados</span>
      </button>
    );
  }

  const markets = {
    pollo: { name: 'Pollo vivo', category: 'BLANCO', source: 'LONJA EBRO', price: '1.25 €', trend: '+1.2%', trendType: 'up', vol: '450 T', status: 'ALCISTA' },
    mantequilla: { name: 'Mantequilla', category: '82% MG', source: 'EEX', price: '6.450 €', trend: '+25 €', trendType: 'up', vol: '120 T', status: 'ALCISTA' },
    porcino: { name: 'Porcino vivo', category: 'SELECTO', source: 'MERCOLLEIDA', price: '1.85 €', trend: '+0.05 €', trendType: 'up', vol: '8.500 T', status: 'ALCISTA' },
    trigo: { name: 'Trigo blando', category: 'PIENSO', source: 'LONJA BCN', price: '215 €', trend: '-2.5%', trendType: 'down', vol: '12.000 T', status: 'BAJISTA' }
  };

  const current = markets[activeMarket as keyof typeof markets];

  return (
    <motion.div
      style={!isFloating ? { scale, opacity } : {}}
      className={cn(
        'bg-white rounded-xl overflow-hidden w-full max-w-sm transition-all duration-500 ease-spring border border-slate-200 shadow-2xl',
        isFloating 
          ? 'fixed bottom-6 right-6 w-80 ring-1 ring-slate-900/5 z-[100]' 
          : 'relative hover:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] hover:scale-[1.01] z-40'
      )}
    >
      {/* Terminal Header */}
      <div className="bg-slate-900 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
           <div className="flex gap-1.5">
             <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
             <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
             <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
           </div>
           <span className="text-[10px] font-mono text-slate-400 ml-2">MIRA_TERMINAL_V2.0</span>
        </div>
        <div className="flex items-center gap-3">
           <div className="flex items-center gap-1.5">
             <span className="text-[10px] font-mono text-slate-500 mr-2">09 MAR 2026</span>
             <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
             <span className="text-[10px] font-bold text-green-500 uppercase">LIVE</span>
           </div>
           {isFloating && (
             <button onClick={() => setIsClosed(true)} className="text-slate-400 hover:text-white transition-colors">
               <X size={14} />
             </button>
           )}
        </div>
      </div>

      <div className="p-5">
        {/* Interactive Tabs */}
        <div className="flex gap-1 mb-4 bg-slate-50 p-1 rounded-lg border border-slate-100">
          {Object.entries(markets).map(([key, data]) => (
            <button
              key={key}
              onClick={() => setActiveMarket(key)}
              className={cn(
                "flex-1 text-[9px] font-bold uppercase tracking-wider py-1.5 rounded transition-all",
                activeMarket === key 
                  ? "bg-white text-mira-primary shadow-sm border border-slate-200" 
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-100/50"
              )}
            >
              {key === 'mantequilla' ? 'Mant.' : key === 'porcino' ? 'Porc.' : key === 'trigo' ? 'Trigo' : 'Pollo'}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4">
            <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Commodity</span>
                <span className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    {current.name}
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-slate-500 font-mono">{current.category}</span>
                </span>
            </div>
            <div className="text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Fuente</span>
                <span className="text-xs font-bold text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-100">{current.source}</span>
            </div>
        </div>
        
        <div className="flex items-baseline gap-3 mb-4">
            <span className="text-4xl font-mono font-bold text-slate-900 tracking-tighter">{current.price}</span>
            <div className="flex flex-col items-start">
                <span className={cn("text-xs font-bold flex items-center", current.trendType === 'up' ? "text-green-600" : "text-red-600")}>
                {current.trendType === 'up' ? <TrendingUp size={12} className="mr-1" /> : <TrendingDown size={12} className="mr-1" />} {current.trend}
                </span>
                <span className="text-[10px] text-slate-400">vs semana ant.</span>
            </div>
        </div>
        
        {/* Mini Chart Visualization (SVG Line) */}
        <div className="h-16 w-full relative mb-4 border-b border-slate-100">
            <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
            <defs>
                <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#8F2E6D" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#8F2E6D" stopOpacity="0" />
                </linearGradient>
            </defs>
            <path 
                d={current.trendType === 'up' 
                  ? "M0,50 C20,45 40,55 60,40 C80,25 100,35 120,30 C140,20 160,35 180,15 C200,10 220,12 240,5"
                  : "M0,10 C20,15 40,5 60,20 C80,35 100,25 120,30 C140,40 160,25 180,45 C200,50 220,48 240,55"
                } 
                fill="none" 
                stroke="#8F2E6D" 
                strokeWidth="1.5" 
                strokeLinecap="round"
            />
            <circle cx="240" cy={current.trendType === 'up' ? 5 : 55} r="2.5" fill="#8F2E6D" stroke="white" strokeWidth="1.5" />
            </svg>
            
            {/* Grid lines */}
            <div className="absolute inset-0 w-full h-full pointer-events-none">
                <div className="border-b border-slate-50 w-full absolute top-1/4" />
                <div className="border-b border-slate-50 w-full absolute top-2/4" />
                <div className="border-b border-slate-50 w-full absolute top-3/4" />
            </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase block">Vol. Semanal</span>
                <span className="text-xs font-mono font-bold text-slate-700">{current.vol}</span>
            </div>
            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase block">Tendencia</span>
                <span className={cn("text-xs font-mono font-bold", current.trendType === 'up' ? "text-green-600" : "text-red-600")}>{current.status}</span>
            </div>
        </div>

        {(!isFloating && isAnchored) || (isFloating) ? (
            <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="pt-3 mt-3 border-t border-slate-100"
            >
            <button className="text-[10px] font-bold text-slate-500 hover:text-mira-primary flex items-center justify-between w-full group transition-colors uppercase tracking-wide">
                Ver análisis completo
                <ChevronRight size={12} />
            </button>
            </motion.div>
        ) : null}
      </div>
    </motion.div>
  );
};

const TrustedSources = () => {
  return (
    <div className="w-full bg-white border-y border-slate-100 py-10 overflow-hidden relative">
      <div className="absolute inset-0 bg-noise opacity-50 mix-blend-multiply pointer-events-none" />
      <div className="container mx-auto px-4 mb-8 text-center relative z-10">
        <p className="text-sm font-display font-bold text-slate-400 uppercase tracking-widest">Datos agregados de fuentes oficiales y operadores</p>
      </div>
      
      {/* Marquee Effect */}
      <div className="relative flex overflow-x-hidden group mask-gradient-x">
         {/* Gradient Masks for Fade Effect */}
        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-white to-transparent z-20" />
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-white to-transparent z-20" />

        <div className="animate-marquee whitespace-nowrap flex items-center gap-24 px-8">
          {/* Placeholders for logos */}
          {['EUROSTAT', 'MERCASA', 'POOLRED', 'MAPA', 'MINISTERIO', 'LONJAS LOCALES'].map((logo, i) => (
            <span key={i} className="text-xl font-display font-bold text-slate-300 uppercase tracking-widest hover:text-mira-primary transition-colors cursor-default select-none">
              {logo}
            </span>
          ))}
          {/* Duplicate for seamless loop */}
          {['EUROSTAT', 'MERCASA', 'POOLRED', 'MAPA', 'MINISTERIO', 'LONJAS LOCALES'].map((logo, i) => (
            <span key={`dup-${i}`} className="text-xl font-display font-bold text-slate-300 uppercase tracking-widest hover:text-mira-primary transition-colors cursor-default select-none">
              {logo}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

const Hero = ({ onSignupClick }: { onSignupClick?: () => void }) => {
  const [isDemoOpen, setIsDemoOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsDemoOpen(false);
    };
    if (isDemoOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDemoOpen]);

  return (
    <section className="relative pt-32 pb-24 md:pt-48 md:pb-40 overflow-hidden bg-slate-50">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-mesh-gradient opacity-60 pointer-events-none" />
      <div className="absolute inset-0 bg-noise opacity-40 mix-blend-overlay pointer-events-none" />
      <div className="absolute inset-0 bg-agri-pattern pointer-events-none" />
      
      {/* Market Curve Background - Organic & Elegant */}
      <svg className="absolute bottom-0 left-0 w-full h-[85%] pointer-events-none opacity-[0.06]" preserveAspectRatio="none" viewBox="0 0 1440 600">
        <path d="M0,600 C320,400 480,550 720,350 C960,150 1100,300 1440,100 V600 H0 Z" fill="url(#heroCurveGradient)" />
        <path d="M0,600 C280,500 520,580 760,400 C1000,220 1240,320 1440,180 V600 H0 Z" fill="url(#heroCurveGradient)" opacity="0.4" />
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
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/80 backdrop-blur-md border border-slate-200 text-mira-primary text-xs font-display font-bold tracking-wide uppercase mb-8 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-mira-primary animate-pulse" />
                Inteligencia de Mercado Alimentario
              </span>
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-heading font-bold text-slate-900 tracking-tight leading-[1.1] mb-8">
                Detecta discrepancias entre el mercado y <span className="text-transparent bg-clip-text bg-gradient-to-r from-mira-primary to-mira-secondary">
                  tu precio real
                </span>.
              </h1>
              <p className="text-lg md:text-xl font-body text-slate-600 leading-relaxed max-w-xl">
                Monitorea tendencias en mercados <strong>agrícolas, ganaderos e industriales</strong>. Compara tus precios de adquisición con fuentes oficiales y optimiza tu estrategia de compras.
              </p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex flex-col sm:flex-row gap-5"
            >
              <Button href="#contacto" size="lg" className="w-full sm:w-auto px-10 text-lg shadow-xl shadow-mira-primary/20" onClick={onSignupClick as any}>
                Empezar prueba gratuita
              </Button>
            </motion.div>

            <div className="pt-8 border-t border-slate-200/60 flex items-center gap-6">
              <div className="flex -space-x-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 shadow-sm">
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
             {/* Abstract decorative elements behind the card */}
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-to-tr from-mira-secondary/10 to-mira-cyan/10 rounded-full blur-3xl -z-10" />
             
             <motion.div
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               transition={{ duration: 0.8, delay: 0.3 }}
               className="absolute top-10 right-0 z-20 w-full flex justify-end"
             >
               <DataAnchor />
             </motion.div>
             
             {/* Floating Elements simulating market data */}
             <motion.div 
               animate={{ y: [0, -12, 0] }}
               transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
               className="absolute top-24 left-4 glass-card p-4 rounded-xl border border-slate-200 shadow-lg max-w-[200px] z-10"
             >
               <div className="flex items-center gap-3 mb-2">
                 <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600">
                    <TrendingUp size={14} />
                 </div>
                 <div>
                   <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Mantequilla</span>
                   <span className="text-xs font-bold text-slate-800">6.450 €/Ton</span>
                 </div>
               </div>
               <div className="flex items-center gap-2 text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded w-fit">
                 +25 €
               </div>
             </motion.div>

             <motion.div 
               animate={{ y: [0, 15, 0] }}
               transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
               className="absolute bottom-32 left-12 glass-card p-4 rounded-xl border border-slate-200 shadow-lg max-w-[200px] z-10"
             >
               <div className="flex items-center gap-3 mb-2">
                 <div className="w-7 h-7 rounded-lg bg-rose-100 flex items-center justify-center text-rose-600">
                    <TrendingUp size={14} />
                 </div>
                 <div>
                   <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Porcino vivo</span>
                   <span className="text-xs font-bold text-slate-800">1.85 €/kg</span>
                 </div>
               </div>
               <div className="flex items-center gap-2 text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded w-fit">
                 +0.05 €
               </div>
             </motion.div>

             <motion.div 
               animate={{ y: [0, -10, 0] }}
               transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 2 }}
               className="absolute bottom-16 right-24 glass-card p-4 rounded-xl border border-slate-200 shadow-lg max-w-[200px] z-10"
             >
               <div className="flex items-center gap-3 mb-2">
                 <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600">
                    <TrendingDown size={14} />
                 </div>
                 <div>
                   <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Trigo blando</span>
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
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="relative w-full max-w-5xl bg-slate-900 rounded-3xl shadow-2xl overflow-hidden aspect-video border border-slate-700/50"
            >
              <button 
                onClick={() => setIsDemoOpen(false)}
                className="absolute top-4 right-4 md:top-6 md:right-6 z-10 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center backdrop-blur-md transition-all border border-white/10 hover:scale-105"
              >
                <X size={20} />
              </button>
              
              {/* Placeholder Video Area */}
              <div className="w-full h-full bg-slate-800 flex items-center justify-center relative">
                <div className="absolute inset-0 bg-gradient-to-tr from-mira-primary/20 to-mira-cyan/20 opacity-50" />
                <iframe
                  className="w-full h-full relative z-10"
                  src="https://www.youtube.com/embed/u_5wLvlRhc0?si=4MPm6ZHdmcOOlEGN?autoplay=1&mute=1"
                  title="MIRA Demo Video Placeholder"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
};

// ... (previous code remains the same)

const MarketIntelligence = () => {
  const [activeTab, setActiveTab] = useState('Agrícola');
  
  const tabs = [
    { 
      id: 'Agrícola', 
      icon: '🌾', 
      label: 'Cereales, Aceite, Frutas',
      families: ['Aceite', 'Animal procesado', 'Arroz', 'Cereales', 'Cultivos', 'Frutas', 'Fruto seco', 'Grasas', 'Hortalizas', 'Legumbres', 'Vino']
    },
    { 
      id: 'Ganadero', 
      icon: '🐄', 
      label: 'Porcino, Avícola, Lácteo',
      families: ['Avícola', 'Bovino', 'Conejo', 'Gallina', 'Lácteo', 'Ovino', 'Pavo', 'Porcino']
    },
    { 
      id: 'Industrial', 
      icon: '🏭', 
      label: 'Cartón, Plástico, Transporte',
      families: ['Carburantes', 'Cartón', 'Electricidad', 'Gas', 'Metales', 'Papel', 'Petróleo', 'Plástico']
    },
    { 
      id: 'Económico', 
      icon: '📈', 
      label: 'IPC, Tipos de Interés',
      families: ['IPC', 'Tipos de Interés', 'Inflación', 'PIB', 'Divisas']
    },
  ];

  const activeTabData = tabs.find(t => t.id === activeTab) || tabs[0];

  return (
    <section id="mercados" className="py-32 bg-white relative overflow-hidden border-t border-slate-100">
       {/* Subtle Grid Background */}
       <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-multiply pointer-events-none" />
       {/* Continuity Curve */}
       <svg className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-[0.03]" preserveAspectRatio="none" viewBox="0 0 1440 800">
          <path d="M-100,600 C200,500 400,700 800,400 C1100,100 1300,200 1540,100" fill="none" stroke="#8F2E6D" strokeWidth="2" />
       </svg>
       
      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="max-w-3xl mx-auto text-center mb-20">
          <span className="text-mira-primary font-bold tracking-wider uppercase text-xs mb-4 block">Cobertura Integral</span>
          <h2 className="text-4xl md:text-5xl font-heading font-bold text-slate-900 mb-6">Tu sector, monitorizado en <span className="text-transparent bg-clip-text bg-gradient-to-r from-mira-primary to-mira-secondary">tiempo real</span>.</h2>
          <p className="text-xl font-body text-slate-600">Centralizamos datos de lonjas, boletines oficiales y mercados de futuros en un único dashboard.</p>
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
                <span className="text-2xl filter drop-shadow-sm group-hover:scale-110 transition-transform">{tab.icon}</span>
                <div>
                  <span className={cn(
                    'font-display font-bold text-lg block',
                    activeTab === tab.id ? 'text-mira-primary' : 'text-slate-700'
                  )}>
                    {tab.id}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">{tab.label || 'Monitorización'}</span>
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
                    <h3 className="text-2xl font-heading font-bold text-slate-900 mb-1">{activeTab} Market Overview</h3>
                    <p className="text-slate-500 text-xs font-body font-bold uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      Datos oficiales actualizados
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {['Semana', 'Mes', 'Año'].map((filter, i) => (
                      <button key={filter} className={cn(
                        "px-4 py-1.5 text-xs font-bold rounded border transition-colors",
                        i === 1 ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      )}>
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

                {/* Microcopy for comparison */}
                <div className="mb-8 p-4 bg-slate-50 rounded-lg border border-slate-200 flex items-start gap-4">
                  <div className="p-2 bg-white rounded border border-slate-200 text-mira-primary shadow-sm">
                    <TrendingUp size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 mb-1">Análisis de Discrepancias</p>
                    <p className="text-xs text-slate-600 leading-relaxed max-w-lg">
                      La línea sólida representa el precio medio de mercado (Poolred/Lonja). La línea punteada es tu precio medio de adquisición. <span className="font-bold text-slate-800">Detecta sobrecostes al instante.</span>
                    </p>
                  </div>
                </div>

                {/* Realistic Chart Visualization */}
                <div className="flex-1 w-full relative mb-6 min-h-[250px] bg-slate-50/50 rounded-lg border border-slate-100 p-4">
                  {/* Grid Lines */}
                  <div className="absolute inset-4 grid grid-cols-6 grid-rows-5 border-l border-b border-slate-200">
                    {[...Array(30)].map((_, i) => (
                      <div key={i} className="border-t border-r border-slate-100" />
                    ))}
                  </div>
                  
                  {/* Chart SVG */}
                  <svg className="absolute inset-4 w-[calc(100%-32px)] h-[calc(100%-32px)] overflow-visible" preserveAspectRatio="none" viewBox="0 0 600 250">
                    <defs>
                      <linearGradient id="marketGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#8F2E6D" stopOpacity="0.1" />
                        <stop offset="100%" stopColor="#8F2E6D" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    
                    {/* Market Price Line (Solid) */}
                    <path
                      d="M0,200 C50,190 100,210 150,150 C200,90 250,130 300,110 C350,90 400,60 450,80 C500,100 550,40 600,50"
                      fill="url(#marketGradient)"
                      stroke="#8F2E6D"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    
                    {/* User Price Line (Dashed) */}
                    <path
                      d="M0,210 C50,200 100,220 150,170 C200,110 250,150 300,130 C350,110 400,80 450,100 C500,120 550,60 600,70"
                      fill="none"
                      stroke="#64748b"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    
                    {/* Data Points */}
                    <circle cx="300" cy="110" r="3" fill="#8F2E6D" stroke="white" strokeWidth="1.5" />
                    <circle cx="450" cy="80" r="3" fill="#8F2E6D" stroke="white" strokeWidth="1.5" />
                    <circle cx="600" cy="50" r="4" fill="#8F2E6D" stroke="white" strokeWidth="2" />
                    
                    {/* Tooltip Simulation */}
                    <g transform="translate(420, 20)">
                      <rect x="0" y="0" width="110" height="46" rx="4" fill="#0f172a" className="shadow-xl" />
                      <text x="55" y="16" textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="bold" letterSpacing="0.5">PRECIO MERCADO</text>
                      <text x="55" y="34" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold" fontFamily="monospace">3.45 €/kg</text>
                      <path d="M55,46 L50,51 L60,51 Z" fill="#0f172a" />
                    </g>
                  </svg>
                  
                  {/* Axis Labels */}
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
                    { label: 'Precio Mercado', value: '3.45 €', change: '+1.2%', positive: false },
                    { label: 'Tu Precio', value: '3.52 €', change: '+2.1%', positive: false },
                    { label: 'Diferencial', value: '-0.07 €', change: 'Alerta', positive: false, alert: true },
                  ].map((stat, i) => (
                    <div key={i} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{stat.label}</p>
                      <div className="flex items-end gap-2">
                        <span className="text-xl font-display font-bold text-slate-900">{stat.value}</span>
                        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", stat.alert ? "text-rose-600 bg-rose-100" : "text-slate-500 bg-slate-200")}>
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
  );
};

const SolutionsByRole = () => {
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
  ];

  return (
    <section id="soluciones" className="py-28 bg-white border-y border-slate-100 relative overflow-hidden">
      <div className="absolute inset-0 bg-agri-pattern pointer-events-none" />
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {roles.map((role, i) => (
            <div key={i} className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 hover:shadow-xl hover:border-mira-primary/20 transition-all duration-300 group">
              <div className="w-14 h-14 bg-slate-50 rounded-lg flex items-center justify-center text-2xl mb-6 group-hover:scale-105 transition-transform border border-slate-100 group-hover:bg-white group-hover:shadow-md">
                {role.icon}
              </div>
              <h3 className="text-xl font-heading font-bold text-slate-900 mb-3 group-hover:text-mira-primary transition-colors">{role.title}</h3>
              <p className="text-slate-600 font-body text-sm leading-relaxed">{role.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const AIPrediction = () => {
  return (
    <section className="py-32 bg-[#050608] text-white overflow-hidden relative border-t border-white/5">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(143,46,109,0.12),transparent_60%)] pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
         {/* Tech Curve */}
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
      
      {/* Subtle Grid */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay" />
      <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '60px 60px' }}></div>

      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-mira-accent text-[10px] font-bold tracking-widest uppercase mb-8 backdrop-blur-md shadow-[0_0_15px_rgba(203,108,230,0.15)]">
              <span className="w-2 h-2 rounded-full bg-mira-accent animate-pulse shadow-[0_0_10px_currentColor]" />
              MIRA AI Engine
            </div>
            <h2 className="text-4xl md:text-6xl font-heading font-bold mb-6 leading-tight">
              No reacciones al mercado. <span className="text-transparent bg-clip-text bg-gradient-to-r from-mira-accent to-mira-cyan">Anticípate.</span>
            </h2>
            <p className="text-slate-400 text-lg font-body leading-relaxed mb-10 max-w-lg">
              Nuestros algoritmos analizan <strong>+20 variables</strong> históricas, estacionales y macroeconómicas para proyectar tendencias de precios a 6 y 12 meses con intervalos de confianza.
            </p>
            
            <ul className="space-y-6 mb-12">
              {[
                { text: 'Forecasting a 12 meses vista', icon: '📅' },
                { text: 'Detección de anomalías en tiempo real', icon: '⚡' },
                { text: 'Correlación con variables macroeconómicas', icon: '🌍' }
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-4 text-slate-300 font-body group">
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-mira-accent/50 group-hover:bg-mira-accent/10 transition-all duration-300">
                    <span className="text-lg">{item.icon}</span>
                  </div>
                  <span className="font-medium group-hover:text-white transition-colors">{item.text}</span>
                </li>
              ))}
            </ul>

            <Button variant="secondary" size="lg" className="shadow-lg shadow-mira-secondary/20 hover:shadow-mira-secondary/40 border border-white/10">
              Ver cómo funciona la IA
            </Button>
          </div>

          {/* AI Chart Visualization */}
          <div className="relative">
            <div className="glass-card-dark rounded-xl p-1 shadow-2xl border-white/10 relative overflow-hidden group hover:border-white/20 transition-colors duration-500">
              <div className="bg-[#13151A] rounded-lg p-8 relative overflow-hidden">
                {/* Glow effect on hover */}
                <div className="absolute -inset-1 bg-gradient-to-r from-mira-accent to-mira-cyan opacity-0 group-hover:opacity-10 blur-2xl transition-opacity duration-500 -z-10" />

                <div className="flex justify-between items-center mb-10">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-mira-accent" />
                        <h4 className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Proyección Trigo Duro</h4>
                    </div>
                    <div className="flex items-baseline gap-3">
                      <span className="text-4xl font-mono font-bold text-white tracking-tighter">320.50 €</span>
                      <span className="text-mira-mint text-xs font-bold bg-mira-mint/10 px-2 py-0.5 rounded border border-mira-mint/20">+5.2% (Est.)</span>
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
                  {/* Grid */}
                  <div className="absolute inset-0 grid grid-cols-6 grid-rows-4 border-l border-b border-white/5">
                    {[...Array(24)].map((_, i) => (
                      <div key={i} className="border-t border-r border-white/5" />
                    ))}
                  </div>

                  <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 400 200">
                    <defs>
                      <linearGradient id="predictionGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#CB6CE6" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#CB6CE6" stopOpacity="0" />
                      </linearGradient>
                      <mask id="confidenceMask">
                        <path d="M0,100 C50,90 100,110 150,80 C200,60 250,70 300,50 C350,30 400,20 V180 C350,160 300,140 250,150 C200,160 150,140 100,150 C50,160 0,140 Z" fill="white" />
                      </mask>
                    </defs>
                    
                    {/* Historical Line */}
                    <path
                      d="M0,120 C40,115 80,125 120,100 C160,75 200,90 240,80"
                      fill="none"
                      stroke="#5CE1E6"
                      strokeWidth="2"
                      strokeLinecap="round"
                      className="drop-shadow-[0_0_8px_rgba(92,225,230,0.5)]"
                    />
                    
                    {/* Prediction Line (Dashed) */}
                    <path
                      d="M240,80 C280,70 320,50 360,40 C380,35 400,30 400,30"
                      fill="none"
                      stroke="#CB6CE6"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                      strokeLinecap="round"
                      className="drop-shadow-[0_0_8px_rgba(203,108,230,0.5)]"
                    />
                    
                    {/* Confidence Interval Area */}
                    <path
                      d="M240,80 C280,60 320,30 360,20 C380,15 400,10 400,10 V60 C380,65 360,70 320,90 C280,110 240,80 240,80 Z"
                      fill="url(#predictionGradient)"
                      opacity="0.5"
                    />

                    {/* Current Point */}
                    <circle cx="240" cy="80" r="4" fill="#1A1A2E" stroke="#5CE1E6" strokeWidth="2" />
                    <circle cx="240" cy="80" r="8" fill="#5CE1E6" opacity="0.2" className="animate-pulse" />
                  </svg>
                  
                  {/* Floating Badge */}
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="absolute top-10 right-10 bg-mira-charcoal/90 backdrop-blur border border-white/10 p-3 rounded-lg shadow-xl"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full bg-mira-accent" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Oportunidad de compra</span>
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
  );
};

// ... (previous code remains the same)

const NewsInsights = () => {
  const articles = [
    {
      category: 'Agrícola',
      title: 'El precio del aceite de oliva vuelve a tensionar el mercado europeo',
      date: 'Hace 2 horas',
      desc: 'Análisis de las últimas cotizaciones en Poolred y su impacto en la cadena de suministro.',
      image: 'bg-gradient-to-br from-amber-50 to-orange-100', 
    },
    {
      category: 'Ganadero',
      title: 'El porcino vivo sube un 4% impulsado por la demanda asiática',
      date: 'Hace 5 horas',
      desc: 'Mercolleida registra nuevos máximos históricos ante la reactivación de las exportaciones.',
      image: 'bg-gradient-to-br from-rose-50 to-pink-100',
    },
    {
      category: 'Industrial',
      title: 'La electricidad industrial marca nuevos máximos en Europa',
      date: 'Ayer',
      desc: 'Cómo la volatilidad del gas está afectando a los costes de producción en el sector primario.',
      image: 'bg-gradient-to-br from-blue-50 to-indigo-100',
    },
    {
      category: 'Agrícola',
      title: 'Tendencias en cereales: presión sobre trigo y maíz para 2026',
      date: 'Hace 2 días',
      desc: 'Proyecciones de cosecha y análisis de stocks mundiales según el último informe del USDA.',
      image: 'bg-gradient-to-br from-emerald-50 to-teal-100',
    },
  ];

  return (
    <section id="insights" className="py-32 bg-slate-50 relative border-t border-slate-200">
      {/* Subtle Background Pattern */}
      <div className="absolute inset-0 bg-agri-pattern pointer-events-none opacity-50" />
      
      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-16 gap-6">
          <div className="max-w-2xl">
            <span className="text-mira-primary font-bold tracking-wider uppercase text-xs mb-4 block">Market Insights</span>
            <h2 className="text-4xl md:text-5xl font-heading font-bold text-slate-900 mb-4 tracking-tight">Análisis de mercado y tendencias.</h2>
            <p className="text-lg text-slate-600 font-body leading-relaxed">Informes semanales, alertas de volatilidad y proyecciones curadas por nuestros analistas expertos.</p>
          </div>
          <Button variant="outline" className="hidden md:flex gap-2 text-slate-700 hover:text-mira-primary hover:border-mira-primary/30 bg-white shadow-sm">
            Ver todos los análisis <ArrowRight size={16} />
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {articles.map((article, i) => (
            <div key={i} className="group cursor-pointer bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-xl hover:border-mira-primary/20 transition-all duration-300 flex flex-col h-full">
              {/* Image Placeholder */}
              <div className={cn("h-48 w-full relative overflow-hidden", article.image)}>
                 <div className="absolute inset-0 bg-noise opacity-20 mix-blend-overlay" />
                 <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                 
                 {/* Category Badge Floating */}
                 <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-md shadow-sm border border-white/20">
                    <span className="text-[10px] font-bold text-mira-primary uppercase tracking-wider">{article.category}</span>
                 </div>
              </div>
              
              {/* Content */}
              <div className="p-6 flex flex-col flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{article.date}</span>
                </div>
                
                <h3 className="text-lg font-heading font-bold text-slate-900 leading-snug mb-3 group-hover:text-mira-primary transition-colors duration-300 line-clamp-3">
                  {article.title}
                </h3>
                
                <p className="text-sm text-slate-600 font-body leading-relaxed mb-6 line-clamp-2 flex-1">
                  {article.desc}
                </p>
                
                <div className="pt-4 border-t border-slate-100 mt-auto">
                    <span className="text-xs font-bold text-mira-primary flex items-center gap-1.5 group-hover:gap-2 transition-all">
                        Leer análisis <ChevronRight size={14} />
                    </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <Button variant="outline" className="w-full mt-10 md:hidden bg-white shadow-sm">
          Ver todos los análisis
        </Button>
      </div>
    </section>
  );
};

const Pricing = ({ onSignupClick, onEnterpriseClick }: { onSignupClick?: () => void, onEnterpriseClick?: () => void }) => {
  const [isAnnual, setIsAnnual] = useState(true);

  return (
    <section id="precios" className="py-32 bg-slate-50 border-y border-slate-200 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-mira-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-mira-cyan/5 rounded-full blur-3xl pointer-events-none" />

      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <h2 className="text-4xl md:text-5xl font-heading font-bold text-slate-900 mb-6">Inteligencia de mercado accesible.</h2>
          <p className="text-xl text-slate-600 font-body mb-10">Sin costes de implementación. Sin consultoría opaca. Acceso inmediato.</p>
          
          {/* Toggle */}
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
              Anual <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold", isAnnual ? "bg-white/20 text-white" : "bg-mira-mint text-emerald-800")}>-15%</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto items-start">
          {/* Free Plan */}
          <div className="bg-white p-10 rounded-3xl border border-slate-200 shadow-sm hover:shadow-lg transition-shadow duration-300">
            <h3 className="text-2xl font-heading font-bold text-slate-900 mb-2">Starter</h3>
            <p className="text-sm text-slate-500 mb-8 font-medium">Para exploradores</p>
            <div className="mb-8">
              <span className="text-5xl font-display font-bold text-slate-900">0€</span>
            </div>
            <Button href="#contacto" variant="outline" className="w-full mb-10 border-slate-300" onClick={onSignupClick as any}>Crear cuenta gratis</Button>
            <ul className="space-y-4 text-sm text-slate-600 font-body">
              <li className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-slate-300" /> Disposición de todos los mercados</li>
              <li className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-slate-300" /> Actualización mensual</li>
              <li className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-slate-300" /> Acceso a noticias e insights</li>
            </ul>
          </div>

          {/* Business Plan (Highlighted) */}
          <div className="bg-white p-10 rounded-3xl border-2 border-mira-primary shadow-2xl shadow-mira-primary/10 relative transform md:-translate-y-6 z-10">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-mira-primary text-white px-6 py-2 rounded-full text-xs font-bold tracking-wide uppercase shadow-lg">
              Mejor Valor
            </div>
            <h3 className="text-2xl font-heading font-bold text-slate-900 mb-2">Business</h3>
            <p className="text-sm text-slate-500 mb-8 font-medium">Para profesionales de compras y PYMES</p>
            <div className="mb-8 flex items-baseline gap-1">
              <span className="text-6xl font-display font-bold text-slate-900">{isAnnual ? '51€' : '60€'}</span>
              <span className="text-slate-500 font-medium">/mes</span>
            </div>
            <p className="text-xs text-slate-400 mb-8 font-medium flex items-center gap-2 min-h-[24px]">
              {isAnnual && (
                <span className="bg-mira-mint/20 text-emerald-700 px-2 py-0.5 rounded font-bold">15% descuento anual</span>
              )}
            </p>
            <Button href="#contacto" variant="primary" size="lg" className="w-full mb-10 shadow-xl shadow-mira-primary/30" onClick={onSignupClick as any}>Empezar prueba gratuita</Button>
            <ul className="space-y-5 text-sm text-slate-700 font-body font-medium">
              <li className="flex items-center gap-3"><div className="w-6 h-6 rounded-full bg-mira-primary/10 text-mira-primary flex items-center justify-center text-xs font-bold">✓</div> <strong>Todo lo incluido en Starter</strong></li>
              <li className="flex items-center gap-3"><div className="w-6 h-6 rounded-full bg-mira-primary/10 text-mira-primary flex items-center justify-center text-xs font-bold">✓</div> Histórico ilimitado</li>
              <li className="flex items-center gap-3"><div className="w-6 h-6 rounded-full bg-mira-primary/10 text-mira-primary flex items-center justify-center text-xs font-bold">✓</div> Informes personalizados</li>
              <li className="flex items-center gap-3"><div className="w-6 h-6 rounded-full bg-mira-primary/10 text-mira-primary flex items-center justify-center text-xs font-bold">✓</div> <strong>Predicciones de IA</strong></li>
              <li className="flex items-center gap-3"><div className="w-6 h-6 rounded-full bg-mira-primary/10 text-mira-primary flex items-center justify-center text-xs font-bold">✓</div> Alertas ilimitadas</li>
            </ul>
          </div>

          {/* Enterprise Plan */}
          <div className="bg-white p-10 rounded-3xl border border-slate-200 shadow-sm hover:shadow-lg transition-shadow duration-300">
            <h3 className="text-2xl font-heading font-bold text-slate-900 mb-2">Enterprise</h3>
            <p className="text-sm text-slate-500 mb-8 font-medium">Para grandes corporaciones</p>
            <div className="mb-8">
              <span className="text-3xl font-display font-bold text-slate-900">Precio personalizado</span>
            </div>
            <Button variant="ghost" className="w-full mb-10 border border-slate-200 hover:border-mira-primary hover:bg-white" onClick={onEnterpriseClick}>Contactar con ventas</Button>
            <ul className="space-y-4 text-sm text-slate-600 font-body">
              <li className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-slate-300" /> Todo lo incluido en Business</li>
              <li className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-slate-300" /> API Access</li>
              <li className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-slate-300" /> Multi-usuario</li>
              <li className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-slate-300" /> Account manager dedicado</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

const FAQContact = ({ onContactarVentasClick }: { onContactarVentasClick?: () => void }) => {
  return (
    <section className="py-32 bg-white">
      <div className="container mx-auto px-4 md:px-6 max-w-4xl">
        <div className="text-center mb-20">
          <h2 className="text-4xl font-heading font-bold text-slate-900 mb-6">¿Tienes dudas sobre la cobertura?</h2>
          <p className="text-xl text-slate-600 font-body">Resolvemos las preguntas más frecuentes.</p>
        </div>

        <div className="space-y-6 mb-20">
          {[
            { q: '¿Qué fuentes de datos utilizáis?', a: 'Agregamos datos de fuentes oficiales públicas (Eurostat, Ministerios), mercados de referencia (Poolred, Mercolleida) y lonjas locales.' },
            { q: '¿Puedo probar la plataforma antes de pagar?', a: 'Sí, ofrecemos una prueba gratuita de 14 días con acceso completo al plan Business.' },
            { q: '¿La predicción de IA está garantizada?', a: 'Nuestros modelos ofrecen un intervalo de confianza del 85%, basado en datos históricos y variables macroeconómicas.' },
          ].map((faq, i) => (
            <div key={i} className="border border-slate-200 rounded-2xl p-8 hover:border-mira-primary/30 hover:shadow-lg transition-all duration-300 bg-slate-50/50">
              <h4 className="font-heading font-bold text-slate-900 mb-3 text-lg">{faq.q}</h4>
              <p className="text-slate-600 font-body leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>

        <div id="contacto" className="bg-gradient-to-br from-slate-50 to-indigo-50/50 rounded-3xl p-10 md:p-16 text-center border border-slate-100 shadow-inner">
          <h3 className="text-3xl font-heading font-bold text-slate-900 mb-6">¿Prefieres hablar con un humano?</h3>
          <p className="text-slate-600 font-body mb-10 text-lg max-w-xl mx-auto">Nuestro equipo de soporte está disponible para resolver tus dudas específicas.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Button 
              className="bg-[#25D366] hover:bg-[#128C7E] text-white gap-3 w-full sm:w-auto px-8 py-4 shadow-lg shadow-green-200"
              onClick={() => window.open('https://wa.me/34654800807', '_blank')}
            >
              {/* WhatsApp Icon */}
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
              Escríbenos por WhatsApp
            </Button>
            <Button 
              variant="outline" 
              className="w-full sm:w-auto px-8 py-4"
              onClick={onContactarVentasClick}
            >
              Contactar con ventas
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

// ... (App component update)

const LoginPage = ({ onHomeClick, onSignupClick }: { onHomeClick: () => void, onSignupClick: () => void }) => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 left-0 w-full h-full bg-agri-pattern opacity-30 pointer-events-none" />
      <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-mira-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-mira-cyan/5 rounded-full blur-3xl pointer-events-none" />

      {/* Simple Header */}
      <header className="relative z-10 py-6 px-6 md:px-10 flex items-center justify-between">
        <button onClick={onHomeClick} className="flex items-center gap-3 group">
          <MiraLogo className="w-10 h-10 group-hover:scale-105 transition-transform" />
          <span className="text-2xl font-display font-bold tracking-tight text-mira-primary">mira</span>
        </button>
        <button onClick={onHomeClick} className="text-sm font-bold text-slate-500 hover:text-mira-primary transition-colors flex items-center gap-2">
          Volver al inicio
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          
          {/* Login Form Card */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-8 md:p-10 rounded-3xl border border-slate-200 shadow-2xl shadow-slate-200/50 w-full max-w-md mx-auto"
          >
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-heading font-bold text-slate-900 mb-3">Inicia sesión en tu cuenta</h1>
              <p className="text-sm text-slate-500 font-body">Accede a tus mercados, alertas e informes personalizados</p>
            </div>

            <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Email</label>
                <input 
                  type="email" 
                  placeholder="tu@empresa.com" 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-mira-primary focus:ring-2 focus:ring-mira-primary/20 outline-none transition-all text-sm text-slate-900"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Contraseña</label>
                  <a href="#" className="text-xs font-bold text-mira-primary hover:text-mira-secondary transition-colors">¿Has olvidado tu contraseña?</a>
                </div>
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-mira-primary focus:ring-2 focus:ring-mira-primary/20 outline-none transition-all text-sm text-slate-900"
                />
              </div>

              <Button type="submit" className="w-full mt-6" size="lg">
                Iniciar sesión
              </Button>
            </form>

            <div className="mt-8 text-center">
              <p className="text-sm text-slate-600">
                ¿No tienes cuenta? <a href="#contacto" onClick={onSignupClick as any} className="font-bold text-mira-primary hover:text-mira-secondary transition-colors">Empieza tu prueba gratuita</a>
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
            
            {/* Re-using a floating card style for decoration */}
            <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-200 shadow-xl w-full max-w-sm relative">
               <div className="flex items-center justify-between mb-6">
                 <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-xl bg-mira-primary/10 flex items-center justify-center text-mira-primary">
                      <TrendingUp size={20} />
                   </div>
                   <div>
                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Inteligencia Activa</span>
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
              <p className="text-sm font-body text-slate-500 italic">"La información es la materia prima más valiosa de tu negocio."</p>
            </div>
          </motion.div>

        </div>
      </main>
    </div>
  );
};

const SignupPage = ({ onHomeClick, onLoginClick }: { onHomeClick: () => void, onLoginClick: () => void }) => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 left-0 w-full h-full bg-agri-pattern opacity-30 pointer-events-none" />
      <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-mira-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-mira-cyan/5 rounded-full blur-3xl pointer-events-none" />

      {/* Simple Header */}
      <header className="relative z-10 py-6 px-6 md:px-10 flex items-center justify-between">
        <button onClick={onHomeClick} className="flex items-center gap-3 group">
          <MiraLogo className="w-10 h-10 group-hover:scale-105 transition-transform" />
          <span className="text-2xl font-display font-bold tracking-tight text-mira-primary">mira</span>
        </button>
        <button onClick={onHomeClick} className="text-sm font-bold text-slate-500 hover:text-mira-primary transition-colors flex items-center gap-2">
          Volver al inicio
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          
          {/* Signup Form Card */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-8 md:p-10 rounded-3xl border border-slate-200 shadow-2xl shadow-slate-200/50 w-full max-w-md mx-auto md:mx-0 md:ml-auto"
          >
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-heading font-bold text-slate-900 mb-3">Empieza tu prueba gratuita</h1>
              <p className="text-sm text-slate-500 font-body">Accede a inteligencia de mercado en minutos</p>
            </div>

            <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Nombre</label>
                <input 
                  type="text" 
                  placeholder="Tu nombre completo" 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-mira-primary focus:ring-2 focus:ring-mira-primary/20 outline-none transition-all text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Email</label>
                <input 
                  type="email" 
                  placeholder="tu@empresa.com" 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-mira-primary focus:ring-2 focus:ring-mira-primary/20 outline-none transition-all text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Contraseña</label>
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-mira-primary focus:ring-2 focus:ring-mira-primary/20 outline-none transition-all text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Empresa <span className="text-slate-400 font-normal normal-case">(opcional)</span></label>
                <input 
                  type="text" 
                  placeholder="Nombre de tu empresa" 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-mira-primary focus:ring-2 focus:ring-mira-primary/20 outline-none transition-all text-sm text-slate-900"
                />
              </div>

              <div className="flex items-start gap-3 pt-2">
                <input 
                  type="checkbox" 
                  id="terms"
                  className="mt-1 w-4 h-4 rounded border-slate-300 text-mira-primary focus:ring-mira-primary"
                />
                <label htmlFor="terms" className="text-xs text-slate-600 leading-relaxed">
                  Acepto los <a href="#" className="font-bold text-mira-primary hover:underline">términos y condiciones</a> y la política de privacidad.
                </label>
              </div>

              <div className="pt-2">
                <Button type="submit" className="w-full" size="lg">
                  Crear cuenta y empezar prueba
                </Button>
                <p className="text-[11px] text-slate-500 text-center mt-3 font-medium">
                  14 días de prueba gratuita · Sin tarjeta de crédito
                </p>
              </div>
            </form>

            <div className="mt-8 text-center pt-6 border-t border-slate-100">
              <p className="text-sm text-slate-600">
                ¿Ya tienes cuenta? <a href="#contacto" onClick={onLoginClick as any} className="font-bold text-mira-primary hover:text-mira-secondary transition-colors">Iniciar sesión</a>
              </p>
            </div>
          </motion.div>

          {/* Value Proposition Area */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="hidden md:flex flex-col justify-center max-w-md"
          >
            <h2 className="text-2xl font-heading font-bold text-slate-900 mb-8">Inteligencia de mercado en tiempo real</h2>
            
            <div className="space-y-6 mb-10">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-mira-primary shrink-0">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-1">Monitoriza precios de mercado</h3>
                  <p className="text-sm text-slate-600">Accede a datos actualizados de lonjas y mercados de referencia en un solo lugar.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-mira-primary shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-1">Detecta discrepancias con tus costes</h3>
                  <p className="text-sm text-slate-600">Compara tus precios de compra con la media del mercado para evitar sobrecostes.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-mira-primary shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-1">Recibe alertas y predicciones de IA</h3>
                  <p className="text-sm text-slate-600">Anticípate a las tendencias con modelos predictivos de alta confianza.</p>
                </div>
              </div>
            </div>

            {/* Visual Card Example */}
            <div className="bg-white/80 backdrop-blur-md p-5 rounded-2xl border border-slate-200 shadow-xl relative">
               <div className="flex items-center justify-between mb-4">
                 <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600">
                      <TrendingUp size={16} />
                   </div>
                   <div>
                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Agrícola</span>
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
    </div>
  );
};

const EnterprisePage = ({ onHomeClick, onLoginClick, onSignupClick, onAvisoLegalClick, onPoliticaCookiesClick, onTerminosClick, onPoliticaPrivacidadClick, onSobreNosotrosClick, onContactarVentasClick }: { onHomeClick: () => void, onLoginClick: () => void, onSignupClick: () => void, onAvisoLegalClick: () => void, onPoliticaCookiesClick: () => void, onTerminosClick: () => void, onPoliticaPrivacidadClick: () => void, onSobreNosotrosClick: () => void, onContactarVentasClick: () => void }) => {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-mira-primary/20 selection:text-mira-primary flex flex-col">
      <Navbar onLoginClick={onLoginClick} onSignupClick={onSignupClick} onHomeClick={onHomeClick} />
      
      <main className="flex-1 pt-32 pb-24 md:pt-40 md:pb-32 relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute top-0 left-0 w-full h-full bg-agri-pattern opacity-30 pointer-events-none" />
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-mira-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-mira-cyan/5 rounded-full blur-3xl pointer-events-none" />

        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-heading font-bold text-slate-900 tracking-tight mb-6">
              Habla con nuestro equipo
            </h1>
            <p className="text-lg md:text-xl font-body text-slate-600 leading-relaxed mb-6">
              Descubre cómo MIRA puede ayudarte a optimizar tus decisiones de compra con inteligencia de mercado avanzada.
            </p>
            <p className="text-base text-slate-500 font-body max-w-2xl mx-auto">
              Nuestro equipo te ayudará a entender cómo implementar MIRA en tu organización, conectar tus fuentes de datos y aprovechar nuestras predicciones de mercado.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 items-start max-w-6xl mx-auto">
            
            {/* Contact Options Card */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="lg:col-span-7 bg-white p-8 md:p-10 rounded-3xl border border-slate-200 shadow-2xl shadow-slate-200/50 flex flex-col justify-center"
            >
              <div className="space-y-8">
                <div className="text-center md:text-left mb-8">
                  <h3 className="text-2xl font-heading font-bold text-slate-900 mb-3">Contacto directo</h3>
                  <p className="text-slate-600 font-body text-sm">
                    Nuestro equipo te responderá lo antes posible para ayudarte con tu caso.
                  </p>
                </div>

                <div className="space-y-4">
                  <a 
                    href="https://wa.me/34654800807" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-3 w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-bold py-4 px-6 rounded-xl shadow-lg shadow-green-200 transition-all duration-300 hover:-translate-y-1"
                  >
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                    Hablar por WhatsApp
                  </a>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                    <a 
                      href="mailto:hola@miraintelligence.com" 
                      className="flex flex-col items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 p-6 rounded-xl transition-colors group"
                    >
                      <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-mira-primary group-hover:scale-110 transition-transform">
                        <Mail size={20} />
                      </div>
                      <span className="text-sm font-bold text-slate-700">hola@miraintelligence.com</span>
                    </a>

                    <a 
                      href="tel:+34654800807" 
                      className="flex flex-col items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 p-6 rounded-xl transition-colors group"
                    >
                      <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-mira-primary group-hover:scale-110 transition-transform">
                        <Phone size={20} />
                      </div>
                      <span className="text-sm font-bold text-slate-700">+34 654 800 807</span>
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Value Proposition Area */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="lg:col-span-5 flex flex-col justify-center"
            >
              <div className="space-y-8">
                <div className="flex items-start gap-5">
                  <div className="w-12 h-12 rounded-2xl bg-mira-primary/10 flex items-center justify-center text-mira-primary shrink-0">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-heading font-bold text-slate-900 mb-2">API Access</h3>
                    <p className="text-base text-slate-600 leading-relaxed">Integra MIRA directamente con tus sistemas internos (ERP, BI) para automatizar flujos de trabajo.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-5">
                  <div className="w-12 h-12 rounded-2xl bg-mira-primary/10 flex items-center justify-center text-mira-primary shrink-0">
                    <User size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-heading font-bold text-slate-900 mb-2">Multi-usuario</h3>
                    <p className="text-base text-slate-600 leading-relaxed">Gestiona equipos de compras y analistas desde una sola plataforma con roles y permisos personalizados.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-5">
                  <div className="w-12 h-12 rounded-2xl bg-mira-primary/10 flex items-center justify-center text-mira-primary shrink-0">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-heading font-bold text-slate-900 mb-2">Account manager dedicado</h3>
                    <p className="text-base text-slate-600 leading-relaxed">Soporte estratégico para grandes organizaciones, formación continua y análisis a medida.</p>
                  </div>
                </div>
              </div>
            </motion.div>

          </div>
        </div>
      </main>

      <Footer onHomeClick={onHomeClick} onAvisoLegalClick={onAvisoLegalClick} onPoliticaCookiesClick={onPoliticaCookiesClick} onTerminosClick={onTerminosClick} onPoliticaPrivacidadClick={onPoliticaPrivacidadClick} onSobreNosotrosClick={onSobreNosotrosClick} onContactarVentasClick={onContactarVentasClick} onLoginClick={onLoginClick} onSignupClick={onSignupClick} />
    </div>
  );
};

const AvisoLegalPage = ({ onHomeClick, onLoginClick, onSignupClick, onAvisoLegalClick, onPoliticaCookiesClick, onTerminosClick, onPoliticaPrivacidadClick, onSobreNosotrosClick, onContactarVentasClick }: { onHomeClick: () => void, onLoginClick: () => void, onSignupClick: () => void, onAvisoLegalClick: () => void, onPoliticaCookiesClick: () => void, onTerminosClick: () => void, onPoliticaPrivacidadClick: () => void, onSobreNosotrosClick: () => void, onContactarVentasClick: () => void }) => {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-mira-primary/20 selection:text-mira-primary flex flex-col">
      <Navbar onLoginClick={onLoginClick} onSignupClick={onSignupClick} onHomeClick={onHomeClick} />
      
      <main className="flex-1 pt-32 pb-24 md:pt-40 md:pb-32 relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute top-0 left-0 w-full h-full bg-agri-pattern opacity-30 pointer-events-none" />
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-mira-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-mira-cyan/5 rounded-full blur-3xl pointer-events-none" />

        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="max-w-4xl mx-auto bg-white p-8 md:p-12 lg:p-16 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50">
            <h1 className="text-4xl md:text-5xl font-heading font-bold text-slate-900 tracking-tight mb-8">
              Aviso Legal
            </h1>
            
            <div className="prose prose-slate max-w-none font-body text-slate-600 space-y-8">
              <p className="text-lg leading-relaxed">
                El presente aviso legal regula el uso del sitio web y establece las condiciones de acceso y utilización del mismo.
              </p>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Identificación del titular del sitio web</h2>
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <ul className="space-y-2">
                    <li><strong>Empresa:</strong> Food Market Solutions SLU</li>
                    <li><strong>CIF / VAT:</strong> B75740282</li>
                    <li><strong>Dirección:</strong> Calle Guadaira nº 23, 41410 Carmona, Sevilla, España</li>
                    <li><strong>Email:</strong> <a href="mailto:jrzjob@gmail.com" className="text-mira-primary hover:underline">jrzjob@gmail.com</a></li>
                    <li><strong>Teléfono:</strong> +34 674473201</li>
                  </ul>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Objeto del sitio web</h2>
                <p className="leading-relaxed">
                  La web ofrece una plataforma de inteligencia de mercado orientada al análisis de precios, tendencias y datos para sectores agrícolas, ganaderos e industriales.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Condiciones de uso</h2>
                <p className="leading-relaxed">
                  El acceso al sitio implica la aceptación de las condiciones de uso y el usuario se compromete a utilizar la web de forma lícita, respetando la legislación vigente y los derechos de terceros.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Propiedad intelectual</h2>
                <p className="leading-relaxed">
                  Todos los contenidos del sitio (textos, diseño, marca, gráficos, software, etc.) son propiedad del titular o se utilizan con licencia y están protegidos por la legislación vigente en materia de propiedad intelectual e industrial.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Responsabilidad</h2>
                <p className="leading-relaxed">
                  La empresa no se responsabiliza de posibles errores en los contenidos ni del uso indebido del sitio por parte de los usuarios. El titular se reserva el derecho a modificar, suspender o cancelar el servicio sin previo aviso.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Enlaces externos</h2>
                <p className="leading-relaxed">
                  El sitio puede incluir enlaces a terceros. La empresa no se responsabiliza del contenido, políticas de privacidad o prácticas de dichos sitios externos.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Legislación aplicable</h2>
                <p className="leading-relaxed">
                  La relación entre el usuario y el titular del sitio se regirá por la legislación española y cualquier controversia o conflicto se someterá a los juzgados y tribunales correspondientes.
                </p>
              </section>
            </div>
          </div>
        </div>
      </main>

      <Footer onHomeClick={onHomeClick} onAvisoLegalClick={onAvisoLegalClick} onPoliticaCookiesClick={onPoliticaCookiesClick} onTerminosClick={onTerminosClick} onPoliticaPrivacidadClick={onPoliticaPrivacidadClick} onSobreNosotrosClick={onSobreNosotrosClick} onContactarVentasClick={onContactarVentasClick} onLoginClick={onLoginClick} onSignupClick={onSignupClick} />
    </div>
  );
};

const PoliticaCookiesPage = ({ onHomeClick, onLoginClick, onSignupClick, onAvisoLegalClick, onPoliticaCookiesClick, onTerminosClick, onPoliticaPrivacidadClick, onSobreNosotrosClick, onContactarVentasClick }: { onHomeClick: () => void, onLoginClick: () => void, onSignupClick: () => void, onAvisoLegalClick: () => void, onPoliticaCookiesClick: () => void, onTerminosClick: () => void, onPoliticaPrivacidadClick: () => void, onSobreNosotrosClick: () => void, onContactarVentasClick: () => void }) => {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-mira-primary/20 selection:text-mira-primary flex flex-col">
      <Navbar onLoginClick={onLoginClick} onSignupClick={onSignupClick} onHomeClick={onHomeClick} />
      
      <main className="flex-1 pt-32 pb-24 md:pt-40 md:pb-32 relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute top-0 left-0 w-full h-full bg-agri-pattern opacity-30 pointer-events-none" />
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-mira-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-mira-cyan/5 rounded-full blur-3xl pointer-events-none" />

        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="max-w-4xl mx-auto bg-white p-8 md:p-12 lg:p-16 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50">
            <h1 className="text-4xl md:text-5xl font-heading font-bold text-slate-900 tracking-tight mb-8">
              Política de Cookies
            </h1>
            
            <div className="prose prose-slate max-w-none font-body text-slate-600 space-y-8">
              <p className="text-lg leading-relaxed">
                El sitio web utiliza cookies para mejorar la experiencia del usuario, analizar el uso de la web y ofrecer funcionalidades relacionadas con la plataforma.
              </p>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">¿Qué son las cookies?</h2>
                <p className="leading-relaxed">
                  Las cookies son pequeños archivos de texto que se almacenan en el dispositivo del usuario cuando visita un sitio web y que permiten recordar información sobre la visita, como preferencias o comportamiento de navegación.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Tipos de cookies utilizadas en este sitio web</h2>
                <p className="leading-relaxed mb-4">El sitio puede utilizar diferentes tipos de cookies, incluyendo:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong>Cookies técnicas:</strong> necesarias para el funcionamiento del sitio web y la plataforma.</li>
                  <li><strong>Cookies de análisis:</strong> para conocer cómo interactúan los usuarios con el sitio.</li>
                  <li><strong>Cookies de personalización:</strong> para recordar preferencias del usuario.</li>
                  <li><strong>Cookies de terceros:</strong> relacionadas con servicios de terceros que puedan integrarse en la plataforma.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Finalidad de las cookies</h2>
                <p className="leading-relaxed">
                  Las cookies permiten mejorar la experiencia de navegación, analizar el tráfico del sitio, optimizar el funcionamiento de la plataforma y ofrecer contenidos o funcionalidades más relevantes para el usuario.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Gestión y configuración de cookies</h2>
                <p className="leading-relaxed">
                  El usuario puede configurar o rechazar el uso de cookies a través de las opciones de su navegador y también puede eliminar las cookies almacenadas en cualquier momento.
                </p>
                <p className="leading-relaxed mt-4">
                  Cada navegador permite gestionar las cookies desde su configuración de privacidad.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Cookies de terceros</h2>
                <p className="leading-relaxed">
                  Este sitio web puede utilizar servicios de terceros que instalen cookies en el navegador del usuario para fines analíticos, técnicos o de mejora del servicio.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Actualizaciones de la política de cookies</h2>
                <p className="leading-relaxed">
                  Food Market Solutions SLU se reserva el derecho de modificar la presente Política de Cookies para adaptarla a cambios legislativos o técnicos.
                </p>
                <p className="leading-relaxed mt-4 font-medium">
                  Se recomienda revisar esta política periódicamente.
                </p>
              </section>
            </div>
          </div>
        </div>
      </main>

      <Footer onHomeClick={onHomeClick} onAvisoLegalClick={onAvisoLegalClick} onPoliticaCookiesClick={onPoliticaCookiesClick} onTerminosClick={onTerminosClick} onPoliticaPrivacidadClick={onPoliticaPrivacidadClick} onSobreNosotrosClick={onSobreNosotrosClick} onContactarVentasClick={onContactarVentasClick} onLoginClick={onLoginClick} onSignupClick={onSignupClick} />
    </div>
  );
};

const TerminosCondicionesPage = ({ onHomeClick, onLoginClick, onSignupClick, onAvisoLegalClick, onPoliticaCookiesClick, onTerminosClick, onPoliticaPrivacidadClick, onSobreNosotrosClick, onContactarVentasClick }: { onHomeClick: () => void, onLoginClick: () => void, onSignupClick: () => void, onAvisoLegalClick: () => void, onPoliticaCookiesClick: () => void, onTerminosClick: () => void, onPoliticaPrivacidadClick: () => void, onSobreNosotrosClick: () => void, onContactarVentasClick: () => void }) => {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-mira-primary/20 selection:text-mira-primary flex flex-col">
      <Navbar onLoginClick={onLoginClick} onSignupClick={onSignupClick} onHomeClick={onHomeClick} />
      
      <main className="flex-1 pt-32 pb-24 md:pt-40 md:pb-32 relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute top-0 left-0 w-full h-full bg-agri-pattern opacity-30 pointer-events-none" />
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-mira-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-mira-cyan/5 rounded-full blur-3xl pointer-events-none" />

        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="max-w-4xl mx-auto bg-white p-8 md:p-12 lg:p-16 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50">
            <h1 className="text-4xl md:text-5xl font-heading font-bold text-slate-900 tracking-tight mb-8">
              Términos y Condiciones
            </h1>
            
            <div className="prose prose-slate max-w-none font-body text-slate-600 space-y-8">
              <p className="text-lg leading-relaxed">
                Los presentes términos y condiciones regulan el acceso y uso de la plataforma MIRA, así como la relación entre el usuario y el titular del sitio web.
              </p>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Objeto</h2>
                <p className="leading-relaxed">
                  El presente documento establece las condiciones que regulan el acceso, navegación y uso de la plataforma MIRA, propiedad de Food Market Solutions SLU, así como los servicios ofrecidos a través de la misma.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Descripción del servicio</h2>
                <p className="leading-relaxed">
                  La plataforma MIRA proporciona herramientas de inteligencia de mercado orientadas al análisis de precios, tendencias, datos históricos y predicciones en distintos sectores como el agrícola, ganadero e industrial.
                </p>
                <p className="leading-relaxed mt-4">
                  Algunas funcionalidades pueden requerir la creación de una cuenta o la contratación de un plan de suscripción.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Registro de usuarios</h2>
                <p className="leading-relaxed">
                  Para acceder a determinadas funcionalidades de la plataforma puede ser necesario registrarse mediante la creación de una cuenta.
                </p>
                <p className="leading-relaxed mt-4">
                  El usuario se compromete a proporcionar información veraz y actualizada y a mantener la confidencialidad de sus credenciales de acceso.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Uso permitido de la plataforma</h2>
                <p className="leading-relaxed">
                  El usuario se compromete a utilizar la plataforma de forma lícita, respetando la legislación vigente y los derechos de terceros.
                </p>
                <p className="leading-relaxed mt-4">
                  Queda prohibido utilizar la plataforma para fines ilícitos, fraudulentos o que puedan dañar el funcionamiento del servicio.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Propiedad intelectual</h2>
                <p className="leading-relaxed">
                  Todos los contenidos, diseños, bases de datos, software, logotipos, marcas y demás elementos de la plataforma MIRA son propiedad de Food Market Solutions SLU o se utilizan con autorización, y están protegidos por la legislación de propiedad intelectual e industrial.
                </p>
                <p className="leading-relaxed mt-4">
                  Queda prohibida su reproducción, distribución o modificación sin autorización expresa.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Planes y suscripciones</h2>
                <p className="leading-relaxed">
                  La plataforma puede ofrecer diferentes planes de acceso con distintas funcionalidades.
                </p>
                <p className="leading-relaxed mt-4">
                  Las condiciones económicas y características de cada plan se mostrarán en la página de precios del sitio web.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Limitación de responsabilidad</h2>
                <p className="leading-relaxed">
                  Food Market Solutions SLU no garantiza la ausencia absoluta de errores en los datos mostrados en la plataforma ni se responsabiliza de decisiones empresariales tomadas en base a la información proporcionada por el sistema.
                </p>
                <p className="leading-relaxed mt-4">
                  La información ofrecida tiene carácter informativo y de apoyo a la toma de decisiones.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Modificación de los términos</h2>
                <p className="leading-relaxed">
                  Food Market Solutions SLU se reserva el derecho de modificar los presentes Términos y Condiciones para adaptarlos a cambios legislativos, técnicos o del propio servicio.
                </p>
                <p className="leading-relaxed mt-4 font-medium">
                  Se recomienda revisar periódicamente esta página.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Legislación aplicable</h2>
                <p className="leading-relaxed">
                  La relación entre el usuario y Food Market Solutions SLU se regirá por la legislación española y cualquier conflicto será sometido a los juzgados y tribunales correspondientes.
                </p>
              </section>
            </div>
          </div>
        </div>
      </main>

      <Footer onHomeClick={onHomeClick} onAvisoLegalClick={onAvisoLegalClick} onPoliticaCookiesClick={onPoliticaCookiesClick} onTerminosClick={onTerminosClick} onPoliticaPrivacidadClick={onPoliticaPrivacidadClick} onSobreNosotrosClick={onSobreNosotrosClick} onContactarVentasClick={onContactarVentasClick} onLoginClick={onLoginClick} onSignupClick={onSignupClick} />
    </div>
  );
};

const PoliticaPrivacidadPage = ({ onHomeClick, onLoginClick, onSignupClick, onAvisoLegalClick, onPoliticaCookiesClick, onTerminosClick, onPoliticaPrivacidadClick, onSobreNosotrosClick, onContactarVentasClick }: { onHomeClick: () => void, onLoginClick: () => void, onSignupClick: () => void, onAvisoLegalClick: () => void, onPoliticaCookiesClick: () => void, onTerminosClick: () => void, onPoliticaPrivacidadClick: () => void, onSobreNosotrosClick: () => void, onContactarVentasClick: () => void }) => {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-mira-primary/20 selection:text-mira-primary flex flex-col">
      <Navbar onLoginClick={onLoginClick} onSignupClick={onSignupClick} onHomeClick={onHomeClick} />
      
      <main className="flex-1 pt-32 pb-24 md:pt-40 md:pb-32 relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute top-0 left-0 w-full h-full bg-agri-pattern opacity-30 pointer-events-none" />
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-mira-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-mira-cyan/5 rounded-full blur-3xl pointer-events-none" />

        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="max-w-4xl mx-auto bg-white p-8 md:p-12 lg:p-16 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50">
            <h1 className="text-4xl md:text-5xl font-heading font-bold text-slate-900 tracking-tight mb-8">
              Política de Privacidad
            </h1>
            
            <div className="prose prose-slate max-w-none font-body text-slate-600 space-y-8">
              <p className="text-lg leading-relaxed">
                La presente Política de Privacidad describe cómo Food Market Solutions SLU recopila, utiliza y protege los datos personales de los usuarios que acceden o utilizan la plataforma MIRA.
              </p>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Responsable del tratamiento de los datos</h2>
                <p className="leading-relaxed mb-4">
                  El responsable del tratamiento de los datos personales recogidos a través del sitio web es Food Market Solutions SLU.
                </p>
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <ul className="space-y-2">
                    <li><strong>Empresa:</strong> Food Market Solutions SLU</li>
                    <li><strong>CIF:</strong> B75740282</li>
                    <li><strong>Dirección:</strong> Calle Guadaira nº 23, 41410 Carmona, Sevilla, España</li>
                    <li><strong>Email:</strong> <a href="mailto:jrzjob@gmail.com" className="text-mira-primary hover:underline">jrzjob@gmail.com</a></li>
                    <li><strong>Teléfono:</strong> +34 674473201</li>
                  </ul>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Datos personales que se recogen</h2>
                <p className="leading-relaxed mb-4">
                  El sitio web puede recopilar diferentes tipos de datos personales cuando los usuarios interactúan con la plataforma. Entre ellos:
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>Datos de identificación como nombre o empresa.</li>
                  <li>Datos de contacto como correo electrónico o teléfono.</li>
                  <li>Datos de navegación y uso del sitio web.</li>
                  <li>Información proporcionada voluntariamente a través de formularios o registro en la plataforma.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Finalidad del tratamiento de los datos</h2>
                <p className="leading-relaxed mb-4">
                  Los datos personales se utilizan para las siguientes finalidades:
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>Gestionar el acceso y uso de la plataforma MIRA.</li>
                  <li>Permitir el registro y administración de cuentas de usuario.</li>
                  <li>Responder consultas o solicitudes enviadas por los usuarios.</li>
                  <li>Enviar comunicaciones relacionadas con el servicio cuando sea necesario.</li>
                  <li>Mejorar el funcionamiento y rendimiento del sitio web.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Base legal para el tratamiento de datos</h2>
                <p className="leading-relaxed mb-4">
                  El tratamiento de datos personales se basa en:
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>El consentimiento del usuario al proporcionar sus datos.</li>
                  <li>La ejecución de un contrato o prestación de servicios cuando el usuario utiliza la plataforma.</li>
                  <li>El cumplimiento de obligaciones legales.</li>
                  <li>El interés legítimo del responsable para mejorar el servicio y garantizar la seguridad de la plataforma.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Conservación de los datos</h2>
                <p className="leading-relaxed">
                  Los datos personales se conservarán únicamente durante el tiempo necesario para cumplir con las finalidades para las que fueron recogidos y para atender posibles obligaciones legales.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Derechos de los usuarios</h2>
                <p className="leading-relaxed mb-4">
                  Los usuarios tienen derecho a:
                </p>
                <ul className="list-disc pl-5 space-y-2 mb-4">
                  <li>Acceder a sus datos personales.</li>
                  <li>Solicitar la rectificación de datos inexactos.</li>
                  <li>Solicitar la supresión de sus datos cuando ya no sean necesarios.</li>
                  <li>Solicitar la limitación del tratamiento.</li>
                  <li>Oponerse al tratamiento de sus datos.</li>
                  <li>Solicitar la portabilidad de sus datos.</li>
                </ul>
                <p className="leading-relaxed">
                  Para ejercer estos derechos el usuario puede contactar con el responsable del tratamiento a través del correo electrónico indicado.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Seguridad de los datos</h2>
                <p className="leading-relaxed">
                  Food Market Solutions SLU adopta medidas técnicas y organizativas adecuadas para proteger los datos personales y evitar su pérdida, uso indebido o acceso no autorizado.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Comunicación de datos a terceros</h2>
                <p className="leading-relaxed">
                  Los datos personales no serán cedidos a terceros salvo obligación legal o cuando sea necesario para la prestación de servicios relacionados con la plataforma.
                </p>
                <p className="leading-relaxed mt-4">
                  En caso de utilizar proveedores tecnológicos, estos actuarán como encargados del tratamiento cumpliendo la normativa de protección de datos.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Transferencias internacionales de datos</h2>
                <p className="leading-relaxed">
                  En caso de utilizar servicios tecnológicos ubicados fuera del Espacio Económico Europeo, se garantizará el cumplimiento de las garantías adecuadas exigidas por la normativa europea de protección de datos.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Cambios en la política de privacidad</h2>
                <p className="leading-relaxed">
                  Food Market Solutions SLU se reserva el derecho de modificar la presente Política de Privacidad para adaptarla a cambios legislativos o técnicos.
                </p>
                <p className="leading-relaxed mt-4 font-medium">
                  Se recomienda revisar esta página periódicamente.
                </p>
              </section>
            </div>
          </div>
        </div>
      </main>

      <Footer onHomeClick={onHomeClick} onAvisoLegalClick={onAvisoLegalClick} onPoliticaCookiesClick={onPoliticaCookiesClick} onTerminosClick={onTerminosClick} onPoliticaPrivacidadClick={onPoliticaPrivacidadClick} onSobreNosotrosClick={onSobreNosotrosClick} onContactarVentasClick={onContactarVentasClick} onLoginClick={onLoginClick} onSignupClick={onSignupClick} />
    </div>
  );
};

const SobreNosotrosPage = ({ onHomeClick, onLoginClick, onSignupClick, onAvisoLegalClick, onPoliticaCookiesClick, onTerminosClick, onPoliticaPrivacidadClick, onSobreNosotrosClick, onContactarVentasClick }: { onHomeClick: () => void, onLoginClick: () => void, onSignupClick: () => void, onAvisoLegalClick: () => void, onPoliticaCookiesClick: () => void, onTerminosClick: () => void, onPoliticaPrivacidadClick: () => void, onSobreNosotrosClick: () => void, onContactarVentasClick: () => void }) => {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-mira-primary/20 selection:text-mira-primary flex flex-col">
      <Navbar onLoginClick={onLoginClick} onSignupClick={onSignupClick} onHomeClick={onHomeClick} />
      
      <main className="flex-1 pt-32 pb-24 md:pt-40 md:pb-32 relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute top-0 left-0 w-full h-full bg-agri-pattern opacity-30 pointer-events-none" />
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-mira-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-mira-cyan/5 rounded-full blur-3xl pointer-events-none" />

        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="max-w-4xl mx-auto">
            {/* Section 1 - Hero */}
            <div className="text-center mb-20">
              <h1 className="text-5xl md:text-6xl font-heading font-bold text-slate-900 tracking-tight mb-6">
                Sobre MIRA
              </h1>
              <p className="text-xl md:text-2xl text-slate-600 font-body mb-8">
                Inteligencia de mercado para tomar mejores decisiones.
              </p>
              <p className="text-lg text-slate-600 font-body max-w-2xl mx-auto leading-relaxed">
                MIRA es una plataforma de inteligencia de mercado diseñada para ayudar a empresas a analizar precios, tendencias y datos de mercado en sectores agrícolas, ganaderos e industriales.
              </p>
            </div>

            <div className="space-y-16">
              {/* Section 2 - Qué es MIRA */}
              <section className="bg-white p-8 md:p-12 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50">
                <h2 className="text-3xl font-heading font-bold text-slate-900 mb-6">Una plataforma creada para entender los mercados</h2>
                <p className="text-lg text-slate-600 leading-relaxed mb-6">
                  MIRA centraliza datos de mercado, precios, tendencias históricas y predicciones mediante inteligencia artificial para ayudar a empresas a tomar decisiones estratégicas basadas en datos.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
                  <div className="bg-slate-50 p-4 rounded-xl text-center border border-slate-100">
                    <span className="block font-bold text-slate-900 mb-1">Datos</span>
                    <span className="text-sm text-slate-500">Oficiales</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl text-center border border-slate-100">
                    <span className="block font-bold text-slate-900 mb-1">Análisis</span>
                    <span className="text-sm text-slate-500">De mercado</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl text-center border border-slate-100">
                    <span className="block font-bold text-slate-900 mb-1">Tecnología</span>
                    <span className="text-sm text-slate-500">Avanzada</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl text-center border border-slate-100">
                    <span className="block font-bold text-slate-900 mb-1">Modelos</span>
                    <span className="text-sm text-slate-500">Predictivos</span>
                  </div>
                </div>
              </section>

              {/* Section 3 - Problema que resuelve */}
              <section className="bg-slate-50 p-8 md:p-12 rounded-3xl border border-slate-200">
                <h2 className="text-3xl font-heading font-bold text-slate-900 mb-6">El problema de la falta de información clara en los mercados</h2>
                <p className="text-lg text-slate-600 leading-relaxed mb-4">
                  Muchas empresas toman decisiones con información fragmentada, retrasada o poco fiable.
                </p>
                <p className="text-lg text-slate-600 leading-relaxed font-medium">
                  MIRA nace para resolver ese problema ofreciendo una plataforma clara, visual y basada en datos.
                </p>
              </section>

              {/* Section 4 - Qué ofrece la plataforma */}
              <section className="bg-white p-8 md:p-12 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50">
                <h2 className="text-3xl font-heading font-bold text-slate-900 mb-6">Qué puedes hacer con MIRA</h2>
                <ul className="space-y-4">
                  {[
                    "Analizar precios de mercados.",
                    "Consultar tendencias históricas.",
                    "Recibir alertas de mercado.",
                    "Obtener predicciones basadas en inteligencia artificial.",
                    "Acceder a insights y análisis del sector."
                  ].map((item, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-mira-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <div className="w-2 h-2 rounded-full bg-mira-primary" />
                      </div>
                      <span className="text-lg text-slate-600">{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Section 5 - Nuestra visión */}
              <section className="bg-slate-900 text-white p-8 md:p-12 rounded-3xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-mira-primary/20 rounded-full blur-3xl" />
                <div className="relative z-10">
                  <h2 className="text-3xl font-heading font-bold mb-6">Nuestra visión</h2>
                  <p className="text-lg text-slate-300 leading-relaxed mb-6">
                    El objetivo de la plataforma es convertirse en una referencia en inteligencia de mercado para sectores clave de la economía.
                  </p>
                  <p className="text-xl font-medium text-mira-primary">
                    Innovación, tecnología y datos.
                  </p>
                </div>
              </section>

              {/* Section 6 - Call to action */}
              <section className="text-center pt-8">
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button size="lg" className="w-full sm:w-auto text-base px-8" onClick={onSignupClick}>
                    Empezar prueba gratuita
                  </Button>
                  <Button variant="outline" size="lg" className="w-full sm:w-auto text-base px-8" onClick={onContactarVentasClick}>
                    Contactar con ventas
                  </Button>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>

      <Footer onHomeClick={onHomeClick} onAvisoLegalClick={onAvisoLegalClick} onPoliticaCookiesClick={onPoliticaCookiesClick} onTerminosClick={onTerminosClick} onPoliticaPrivacidadClick={onPoliticaPrivacidadClick} onSobreNosotrosClick={onSobreNosotrosClick} onContactarVentasClick={onContactarVentasClick} onLoginClick={onLoginClick} onSignupClick={onSignupClick} />
    </div>
  );
};

export default function App() {
  const [currentPage, setCurrentPage] = useState<'home' | 'login' | 'signup' | 'enterprise' | 'aviso-legal' | 'politica-cookies' | 'terminos-condiciones' | 'politica-privacidad' | 'sobre-nosotros'>('home');

  const handleContactRedirect = (e?: React.MouseEvent) => {
    if (currentPage !== 'home') {
      e?.preventDefault();
      setCurrentPage('home');
      setTimeout(() => {
        document.getElementById('contacto')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentPage]);

  if (currentPage === 'login') {
    return (
      <>
        <LoginPage onHomeClick={() => setCurrentPage('home')} onSignupClick={handleContactRedirect as any} />
        <DataAnchor isFloating={true} currentPage={currentPage} />
      </>
    );
  }

  if (currentPage === 'signup') {
    return (
      <>
        <SignupPage onHomeClick={() => setCurrentPage('home')} onLoginClick={handleContactRedirect as any} />
        <DataAnchor isFloating={true} currentPage={currentPage} />
      </>
    );
  }

  if (currentPage === 'enterprise') {
    return (
      <>
        <EnterprisePage onHomeClick={() => setCurrentPage('home')} onLoginClick={() => setCurrentPage('login')} onSignupClick={() => setCurrentPage('signup')} onAvisoLegalClick={() => setCurrentPage('aviso-legal')} onPoliticaCookiesClick={() => setCurrentPage('politica-cookies')} onTerminosClick={() => setCurrentPage('terminos-condiciones')} onPoliticaPrivacidadClick={() => setCurrentPage('politica-privacidad')} onSobreNosotrosClick={() => setCurrentPage('sobre-nosotros')} onContactarVentasClick={() => setCurrentPage('enterprise')} />
        <DataAnchor isFloating={true} currentPage={currentPage} />
      </>
    );
  }

  if (currentPage === 'aviso-legal') {
    return (
      <>
        <AvisoLegalPage onHomeClick={() => setCurrentPage('home')} onLoginClick={() => setCurrentPage('login')} onSignupClick={() => setCurrentPage('signup')} onAvisoLegalClick={() => setCurrentPage('aviso-legal')} onPoliticaCookiesClick={() => setCurrentPage('politica-cookies')} onTerminosClick={() => setCurrentPage('terminos-condiciones')} onPoliticaPrivacidadClick={() => setCurrentPage('politica-privacidad')} onSobreNosotrosClick={() => setCurrentPage('sobre-nosotros')} onContactarVentasClick={() => setCurrentPage('enterprise')} />
        <DataAnchor isFloating={true} currentPage={currentPage} />
      </>
    );
  }

  if (currentPage === 'politica-cookies') {
    return (
      <>
        <PoliticaCookiesPage onHomeClick={() => setCurrentPage('home')} onLoginClick={() => setCurrentPage('login')} onSignupClick={() => setCurrentPage('signup')} onAvisoLegalClick={() => setCurrentPage('aviso-legal')} onPoliticaCookiesClick={() => setCurrentPage('politica-cookies')} onTerminosClick={() => setCurrentPage('terminos-condiciones')} onPoliticaPrivacidadClick={() => setCurrentPage('politica-privacidad')} onSobreNosotrosClick={() => setCurrentPage('sobre-nosotros')} onContactarVentasClick={() => setCurrentPage('enterprise')} />
        <DataAnchor isFloating={true} currentPage={currentPage} />
      </>
    );
  }

  if (currentPage === 'terminos-condiciones') {
    return (
      <>
        <TerminosCondicionesPage onHomeClick={() => setCurrentPage('home')} onLoginClick={() => setCurrentPage('login')} onSignupClick={() => setCurrentPage('signup')} onAvisoLegalClick={() => setCurrentPage('aviso-legal')} onPoliticaCookiesClick={() => setCurrentPage('politica-cookies')} onTerminosClick={() => setCurrentPage('terminos-condiciones')} onPoliticaPrivacidadClick={() => setCurrentPage('politica-privacidad')} onSobreNosotrosClick={() => setCurrentPage('sobre-nosotros')} onContactarVentasClick={() => setCurrentPage('enterprise')} />
        <DataAnchor isFloating={true} currentPage={currentPage} />
      </>
    );
  }

  if (currentPage === 'politica-privacidad') {
    return (
      <>
        <PoliticaPrivacidadPage onHomeClick={() => setCurrentPage('home')} onLoginClick={() => setCurrentPage('login')} onSignupClick={() => setCurrentPage('signup')} onAvisoLegalClick={() => setCurrentPage('aviso-legal')} onPoliticaCookiesClick={() => setCurrentPage('politica-cookies')} onTerminosClick={() => setCurrentPage('terminos-condiciones')} onPoliticaPrivacidadClick={() => setCurrentPage('politica-privacidad')} onSobreNosotrosClick={() => setCurrentPage('sobre-nosotros')} onContactarVentasClick={() => setCurrentPage('enterprise')} />
        <DataAnchor isFloating={true} currentPage={currentPage} />
      </>
    );
  }

  if (currentPage === 'sobre-nosotros') {
    return (
      <>
        <SobreNosotrosPage onHomeClick={() => setCurrentPage('home')} onLoginClick={() => setCurrentPage('login')} onSignupClick={() => setCurrentPage('signup')} onAvisoLegalClick={() => setCurrentPage('aviso-legal')} onPoliticaCookiesClick={() => setCurrentPage('politica-cookies')} onTerminosClick={() => setCurrentPage('terminos-condiciones')} onPoliticaPrivacidadClick={() => setCurrentPage('politica-privacidad')} onSobreNosotrosClick={() => setCurrentPage('sobre-nosotros')} onContactarVentasClick={() => setCurrentPage('enterprise')} />
        <DataAnchor isFloating={true} currentPage={currentPage} />
      </>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-mira-primary/20 selection:text-mira-primary">
        <Navbar onLoginClick={handleContactRedirect as any} onSignupClick={handleContactRedirect as any} onHomeClick={() => setCurrentPage('home')} />
        <main>
          <Hero onSignupClick={handleContactRedirect as any} />
          <TrustedSources />
          <MarketIntelligence />
          <SolutionsByRole />
          <AIPrediction />
          {/* <NewsInsights /> */}
          <Pricing onSignupClick={handleContactRedirect as any} onEnterpriseClick={() => setCurrentPage('enterprise')} />
          <FAQContact onContactarVentasClick={() => setCurrentPage('enterprise')} />
        </main>
        <Footer onHomeClick={() => setCurrentPage('home')} onAvisoLegalClick={() => setCurrentPage('aviso-legal')} onPoliticaCookiesClick={() => setCurrentPage('politica-cookies')} onTerminosClick={() => setCurrentPage('terminos-condiciones')} onPoliticaPrivacidadClick={() => setCurrentPage('politica-privacidad')} onSobreNosotrosClick={() => setCurrentPage('sobre-nosotros')} onContactarVentasClick={() => setCurrentPage('enterprise')} onLoginClick={handleContactRedirect as any} onSignupClick={handleContactRedirect as any} />
      </div>
      <DataAnchor isFloating={true} currentPage={currentPage} />
    </>
  );
}




