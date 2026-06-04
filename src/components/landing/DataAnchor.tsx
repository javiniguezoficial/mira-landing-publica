'use client'
import { useState, useEffect } from 'react'
import { X, TrendingUp, TrendingDown, ChevronRight } from 'lucide-react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface DataAnchorProps {
  isFloating?: boolean
}

export const DataAnchor = ({ isFloating = false }: DataAnchorProps) => {
  const { scrollY } = useScroll()
  const [isAnchored, setIsAnchored] = useState(false)
  const [activeMarket, setActiveMarket] = useState('pollo')
  const [isClosed, setIsClosed] = useState(false)
  const pathname = usePathname()

  const scale = useTransform(scrollY, [0, 300], [1, 0.9])
  const opacity = useTransform(scrollY, [0, 100], [1, 1])

  useEffect(() => {
    const handleScroll = () => setIsAnchored(window.scrollY > 400)
    window.addEventListener('scroll', handleScroll)
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const isHomePage = pathname === '/'
  const showFloating = isFloating && (!isHomePage || isAnchored)

  if (isFloating && !showFloating) return null

  if (isFloating && isClosed) {
    return (
      <button
        onClick={() => setIsClosed(false)}
        className="fixed bottom-6 right-0 bg-slate-900 text-white p-3 rounded-l-xl shadow-2xl z-[100] hover:bg-mira-primary transition-colors flex items-center gap-2 group"
      >
        <TrendingUp size={16} className="group-hover:scale-110 transition-transform" />
        <span className="text-xs font-bold uppercase tracking-wider hidden group-hover:block">
          Mercados
        </span>
      </button>
    )
  }

  const markets = {
    pollo: {
      name: 'Pollo vivo',
      category: 'BLANCO',
      source: 'LONJA EBRO',
      price: '1.25 €',
      trend: '+1.2%',
      trendType: 'up',
      vol: '450 T',
      status: 'ALCISTA',
    },
    mantequilla: {
      name: 'Mantequilla',
      category: '82% MG',
      source: 'EEX',
      price: '6.450 €',
      trend: '+25 €',
      trendType: 'up',
      vol: '120 T',
      status: 'ALCISTA',
    },
    porcino: {
      name: 'Porcino vivo',
      category: 'SELECTO',
      source: 'MERCOLLEIDA',
      price: '1.85 €',
      trend: '+0.05 €',
      trendType: 'up',
      vol: '8.500 T',
      status: 'ALCISTA',
    },
    trigo: {
      name: 'Trigo blando',
      category: 'PIENSO',
      source: 'LONJA BCN',
      price: '215 €',
      trend: '-2.5%',
      trendType: 'down',
      vol: '12.000 T',
      status: 'BAJISTA',
    },
  }

  const current = markets[activeMarket as keyof typeof markets]

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
            <button
              onClick={() => setIsClosed(true)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="p-5">
        {/* Interactive Tabs */}
        <div className="flex gap-1 mb-4 bg-slate-50 p-1 rounded-lg border border-slate-100">
          {Object.entries(markets).map(([key]) => (
            <button
              key={key}
              onClick={() => setActiveMarket(key)}
              className={cn(
                'flex-1 text-[9px] font-bold uppercase tracking-wider py-1.5 rounded transition-all',
                activeMarket === key
                  ? 'bg-white text-mira-primary shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'
              )}
            >
              {key === 'mantequilla'
                ? 'Mant.'
                : key === 'porcino'
                ? 'Porc.'
                : key === 'trigo'
                ? 'Trigo'
                : 'Pollo'}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
              Commodity
            </span>
            <span className="text-sm font-bold text-slate-900 flex items-center gap-2">
              {current.name}
              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-slate-500 font-mono">
                {current.category}
              </span>
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
              Fuente
            </span>
            <span className="text-xs font-bold text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-100">
              {current.source}
            </span>
          </div>
        </div>

        <div className="flex items-baseline gap-3 mb-4">
          <span className="text-4xl font-mono font-bold text-slate-900 tracking-tighter">
            {current.price}
          </span>
          <div className="flex flex-col items-start">
            <span
              className={cn(
                'text-xs font-bold flex items-center',
                current.trendType === 'up' ? 'text-green-600' : 'text-red-600'
              )}
            >
              {current.trendType === 'up' ? (
                <TrendingUp size={12} className="mr-1" />
              ) : (
                <TrendingDown size={12} className="mr-1" />
              )}
              {current.trend}
            </span>
            <span className="text-[10px] text-slate-400">vs semana ant.</span>
          </div>
        </div>

        {/* Mini Chart Visualization */}
        <div className="h-16 w-full relative mb-4 border-b border-slate-100">
          <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
            <defs>
              <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#8F2E6D" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#8F2E6D" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d={
                current.trendType === 'up'
                  ? 'M0,50 C20,45 40,55 60,40 C80,25 100,35 120,30 C140,20 160,35 180,15 C200,10 220,12 240,5'
                  : 'M0,10 C20,15 40,5 60,20 C80,35 100,25 120,30 C140,40 160,25 180,45 C200,50 220,48 240,55'
              }
              fill="none"
              stroke="#8F2E6D"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle
              cx="240"
              cy={current.trendType === 'up' ? 5 : 55}
              r="2.5"
              fill="#8F2E6D"
              stroke="white"
              strokeWidth="1.5"
            />
          </svg>
          <div className="absolute inset-0 w-full h-full pointer-events-none">
            <div className="border-b border-slate-50 w-full absolute top-1/4" />
            <div className="border-b border-slate-50 w-full absolute top-2/4" />
            <div className="border-b border-slate-50 w-full absolute top-3/4" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50 p-2 rounded border border-slate-100">
            <span className="text-[9px] font-bold text-slate-400 uppercase block">
              Vol. Semanal
            </span>
            <span className="text-xs font-mono font-bold text-slate-700">{current.vol}</span>
          </div>
          <div className="bg-slate-50 p-2 rounded border border-slate-100">
            <span className="text-[9px] font-bold text-slate-400 uppercase block">Tendencia</span>
            <span
              className={cn(
                'text-xs font-mono font-bold',
                current.trendType === 'up' ? 'text-green-600' : 'text-red-600'
              )}
            >
              {current.status}
            </span>
          </div>
        </div>

        {((!isFloating && isAnchored) || isFloating) ? (
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
  )
}
