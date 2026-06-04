'use client'
import { Navbar } from './Navbar'
import { Footer } from './Footer'
import { DataAnchor } from './DataAnchor'

interface LegalLayoutProps {
  title: string
  children: React.ReactNode
}

export const LegalLayout = ({ title, children }: LegalLayoutProps) => {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-mira-primary/20 selection:text-mira-primary flex flex-col">
      <Navbar />
      <main className="flex-1 pt-32 pb-24 md:pt-40 md:pb-32 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-agri-pattern opacity-30 pointer-events-none" />
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-mira-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-mira-cyan/5 rounded-full blur-3xl pointer-events-none" />
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="max-w-4xl mx-auto bg-white p-8 md:p-12 lg:p-16 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50">
            <h1 className="text-4xl md:text-5xl font-heading font-bold text-slate-900 tracking-tight mb-8">
              {title}
            </h1>
            <div className="prose prose-slate max-w-none font-body text-slate-600 space-y-8">
              {children}
            </div>
          </div>
        </div>
      </main>
      <Footer />
      <DataAnchor isFloating={true} />
    </div>
  )
}
