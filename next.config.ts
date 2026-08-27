import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',

  // ── Tamaño de cuerpo de las Server Actions ────────────────────────────────
  //
  // Next corta el cuerpo de TODA Server Action en 1 MB por defecto, antes de
  // decodificarlo. La importación de precios manda el CSV como argumento de
  // `validateImportFile`, así que ese tope se aplicaba al fichero: cualquier
  // archivo por encima de 1 MB moría en el transporte y el usuario veía la
  // pantalla genérica de Next con un digest acabado en `@E394` —el código con
  // el que Next marca «Body exceeded 1 MB limit»—. Nuestro propio guard de
  // 10 MB nunca llegaba a ejecutarse.
  //
  // 12 MB, y no 10, porque el tope mide la petición ENTERA, no el fichero:
  // sobre los 10 MB que admite la regla de negocio van las fronteras
  // multipart/form-data y los campos del formulario (periodo, año, semana).
  // Con el tope justo en 10 MB, un fichero de 10 MB seguiría rebotando.
  //
  // Es un tope GLOBAL: afecta a todas las Server Actions de la app, no solo al
  // importador. Por eso se sube a lo justo para cubrir el caso real y no más.
  //
  // El límite FUNCIONAL de MIRA sigue siendo 10 MB y vive en
  // `MAX_IMPORT_FILE_BYTES` (src/lib/imports/types.ts). Este valor es solo
  // transporte: la regla de negocio no se toca desde aquí.
  //
  // ── Y un SEGUNDO tope, el del middleware ──────────────────────────────────
  //
  // Subir solo `bodySizeLimit` no bastaba. Hay middleware activo en toda la app
  // («/((?!_next/static|…))»), y para poder inspeccionar la petición Next clona
  // el cuerpo con un tope propio de 10 MB. Al superarlo NO falla: TRUNCA el
  // cuerpo y deja un `console.warn` en el log del servidor.
  //
  //   Request body exceeded 10MB for /… Only the first 10MB will be available
  //
  // Es peor que un error: el multipart llegaría cortado a la mitad y el fichero
  // se decodificaría incompleto, con filas perdidas y sin que nadie lo sepa. Y
  // como nuestra regla funcional son justo 10 MB, un CSV de 10 MB —permitido—
  // se pasaba de ese tope por el sobrecoste del multipart y caía ahí.
  //
  // Los dos van al mismo valor a propósito: el techo efectivo es el MENOR de
  // los dos, y dejarlos desalineados es cómo se vuelve a un límite invisible.
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
    },
    middlewareClientMaxBodySize: '12mb',
  },

  // Needed for framer-motion with Next.js App Router
  transpilePackages: ['framer-motion'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'entornodev.com',
      },
      {
        protocol: 'https',
        hostname: 'grainy-gradients.vercel.app',
      },
    ],
  },
  // Redirect /signup → /registro (compatibility)
  async redirects() {
    return [
      {
        source: '/signup',
        destination: '/registro',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
