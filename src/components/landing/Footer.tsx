'use client'
import { Facebook, Instagram, Linkedin, Youtube } from 'lucide-react'
import { MiraLogo } from './MiraLogo'

export const Footer = () => {
  return (
    <footer className="bg-slate-50 border-t border-slate-200 pt-20 pb-10 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full bg-mesh-gradient opacity-30 pointer-events-none" />

      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-10 mb-16">
          <div className="col-span-2 lg:col-span-2">
            <a href="/" className="flex items-center gap-3 mb-6">
              <MiraLogo className="h-8 w-auto" />
              <span className="text-2xl font-display font-bold text-slate-900">mira</span>
            </a>
            <p className="text-slate-600 text-sm font-body leading-relaxed max-w-xs mb-8">
              Plataforma de inteligencia de mercado para optimizar decisiones de compra con datos
              oficiales y predictivos.
            </p>
          </div>

          <div>
            <h4 className="font-display font-bold text-slate-900 mb-6">Información</h4>
            <ul className="space-y-3 text-sm font-body text-slate-600">
              <li>
                <a href="/sobre-nosotros" className="hover:text-mira-primary transition-colors">
                  Sobre nosotros
                </a>
              </li>
              <li>
                <a href="/enterprise" className="hover:text-mira-primary transition-colors">
                  Contactar con ventas
                </a>
              </li>
              <li>
                <a href="/login" className="hover:text-mira-primary transition-colors">
                  Iniciar sesión
                </a>
              </li>
              <li>
                <a href="/registro" className="hover:text-mira-primary transition-colors">
                  Prueba gratuita
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-bold text-slate-900 mb-6">Legal</h4>
            <ul className="space-y-3 text-sm font-body text-slate-600">
              <li>
                <a href="/aviso-legal" className="hover:text-mira-primary transition-colors">
                  Aviso legal
                </a>
              </li>
              <li>
                <a href="/politica-privacidad" className="hover:text-mira-primary transition-colors">
                  Política de privacidad
                </a>
              </li>
              <li>
                <a href="/terminos-condiciones" className="hover:text-mira-primary transition-colors">
                  Términos y condiciones
                </a>
              </li>
              <li>
                <a href="/politica-cookies" className="hover:text-mira-primary transition-colors">
                  Política de cookies
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-bold text-slate-900 mb-6">Redes sociales</h4>
            <ul className="space-y-3 text-sm font-body text-slate-600">
              <li>
                <a href="#" className="flex items-center gap-2 hover:text-mira-primary transition-colors">
                  <Facebook size={16} /> Facebook
                </a>
              </li>
              <li>
                <a href="#" className="flex items-center gap-2 hover:text-mira-primary transition-colors">
                  <Instagram size={16} /> Instagram
                </a>
              </li>
              <li>
                <a href="#" className="flex items-center gap-2 hover:text-mira-primary transition-colors">
                  <Linkedin size={16} /> LinkedIn
                </a>
              </li>
              <li>
                <a href="#" className="flex items-center gap-2 hover:text-mira-primary transition-colors">
                  <Youtube size={16} /> YouTube
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-200/60 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-body text-slate-500">
          <p>&copy; {new Date().getFullYear()} MIRA pricing. Todos los derechos reservados.</p>
          <div className="flex gap-6">
            <span>Hecho en Europa</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
