---
name: project-context
description: Estado actual del proyecto MIRA Platform — stack, fases, decisiones clave
metadata:
  type: project
---

Proyecto MIRA Pricing — plataforma SaaS B2B de inteligencia de mercado agroalimentario.

**Stack decidido:**
- Framework: Next.js 15 App Router + TypeScript
- Estilos: Tailwind CSS v4 con tokens MIRA (globals.css)
- Backend/Auth/DB: Supabase (no Stripe por ahora)
- Despliegue: Coolify con Docker (output: standalone)

**Estado actual (Fase 0 completada):**
- Landing migrada de Vite → Next.js, visualmente idéntica
- Rutas públicas en español: /, /login, /registro, /sobre-nosotros, /enterprise, /aviso-legal, /politica-privacidad, /politica-cookies, /terminos-condiciones
- /signup redirige a /registro (permanent redirect en next.config.ts)
- Stubs de /app/dashboard y /admin/dashboard creados
- Build limpio — 15 páginas generadas

**Why:** Migración necesaria para soportar auth real, rutas verdaderas y SSR.
**How to apply:** El archivo src/App.tsx original está excluido del tsconfig pero no borrado. Al revisar diseño siempre usar los componentes en src/components/landing/.
