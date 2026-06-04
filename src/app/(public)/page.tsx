import { Navbar } from '@/components/landing/Navbar'
import { Hero } from '@/components/landing/Hero'
import { TrustedSources } from '@/components/landing/TrustedSources'
import { MarketIntelligence } from '@/components/landing/MarketIntelligence'
import { SolutionsByRole } from '@/components/landing/SolutionsByRole'
import { AIPrediction } from '@/components/landing/AIPrediction'
import { Pricing } from '@/components/landing/Pricing'
import { FAQContact } from '@/components/landing/FAQContact'
import { Footer } from '@/components/landing/Footer'
import { DataAnchor } from '@/components/landing/DataAnchor'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-mira-primary/20 selection:text-mira-primary">
      <Navbar />
      <main>
        <Hero />
        <TrustedSources />
        <MarketIntelligence />
        <SolutionsByRole />
        <AIPrediction />
        <Pricing />
        <FAQContact />
      </main>
      <Footer />
      <DataAnchor isFloating={true} />
    </div>
  )
}
