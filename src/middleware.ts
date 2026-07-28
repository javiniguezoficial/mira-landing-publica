// UBICACIÓN CRÍTICA: este archivo DEBE vivir en `src/middleware.ts`.
//
// Next.js busca el middleware en la raíz del proyecto O en `src/`, pero cuando
// existe el directorio `src/` la única ubicación válida es `src/middleware.ts`.
// Estuvo en la raíz junto a `package.json`, donde Next lo IGNORA en silencio:
// compilaba, pasaba el lint y nunca se ejecutaba, así que `/admin/*` y `/app/*`
// quedaban sin ninguna comprobación de sesión ni de rol.
//
// Para verificar que se carga: `.next/server/middleware-manifest.json` debe
// contener una entrada; si aparece vacío, el middleware NO está activo.

import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Ejecutar middleware en todas las rutas excepto:
     * - _next/static (archivos estáticos)
     * - _next/image (optimización de imágenes)
     * - favicon.ico y otros assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
