'use client'

export const TrustedSources = () => {
  const logos = ['EUROSTAT', 'MERCASA', 'POOLRED', 'MAPA', 'MINISTERIO', 'LONJAS LOCALES']

  return (
    <div className="w-full bg-white border-y border-slate-100 py-10 overflow-hidden relative">
      <div className="absolute inset-0 bg-noise opacity-50 mix-blend-multiply pointer-events-none" />
      <div className="container mx-auto px-4 mb-8 text-center relative z-10">
        <p className="text-sm font-display font-bold text-slate-400 uppercase tracking-widest">
          Datos agregados de fuentes oficiales y operadores
        </p>
      </div>

      {/* Marquee Effect */}
      <div className="relative flex overflow-x-hidden group mask-gradient-x">
        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-white to-transparent z-20" />
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-white to-transparent z-20" />

        <div className="animate-marquee whitespace-nowrap flex items-center gap-24 px-8">
          {logos.map((logo, i) => (
            <span
              key={i}
              className="text-xl font-display font-bold text-slate-300 uppercase tracking-widest hover:text-mira-primary transition-colors cursor-default select-none"
            >
              {logo}
            </span>
          ))}
          {logos.map((logo, i) => (
            <span
              key={`dup-${i}`}
              className="text-xl font-display font-bold text-slate-300 uppercase tracking-widest hover:text-mira-primary transition-colors cursor-default select-none"
            >
              {logo}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
