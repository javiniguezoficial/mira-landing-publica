// Cliente Supabase con service role — SOLO SERVIDOR.
//
// ⚠️  ESTE FICHERO NUNCA DEBE IMPORTARSE DESDE UN COMPONENTE CLIENTE.
//
// Extrae el cliente privilegiado que vivía dentro de `actions/users.ts` desde
// 6B.1, para que exista UN solo sitio donde se lee la clave y una sola
// explicación de cuándo se puede usar.
//
// ── Por qué no llega al navegador ───────────────────────────────────────────
//
// `SUPABASE_SERVICE_ROLE_KEY` NO lleva el prefijo `NEXT_PUBLIC_`, y Next.js solo
// incrusta en el bundle del cliente las variables que lo llevan. Cualquier
// componente marcado con `'use client'` que intentara importar este módulo
// fallaría al compilar, porque la variable valdría `undefined` en ese contexto.
//
// Deliberadamente NO se marca este fichero con `'use server'`: eso convertiría
// cada export en una Server Action invocable desde el navegador, que es
// exactamente lo contrario de lo que se busca. Se importa desde ficheros que sí
// son `'use server'`, y son ellos quienes autorizan antes de llamar.
//
// ── Cuándo se puede usar ────────────────────────────────────────────────────
//
// El service role IGNORA RLS por completo. Reglas, heredadas de 6B.1:
//
//   · NO forma parte de `AuthContext`;
//   · NO lo devuelve ningún guard;
//   · NO se usa NUNCA para decidir si alguien es administrador — esa decisión
//     la toma `requirePlatformAdmin()` con el cliente normal, sujeto a RLS;
//   · se crea DESPUÉS de autorizar, dentro de la función que lo necesita;
//   · se limita a lo que el cliente normal no puede hacer por diseño.
//
// Usos vigentes:
//
//   1. leer los correos de `auth.users` para el listado de usuarios (6B.1)
//      — tras `requirePlatformAdmin`;
//   2. dar de alta en Auth a la persona propietaria de un cliente nuevo (6C)
//      — tras `requirePlatformAdmin`;
//   3. resolver los correos del EQUIPO PROPIO en el portal de cliente
//      (`queries/team.ts`, Bloque 1) — tras comprobar pertenencia activa y
//      `canManageTeam`.
//
// El tercero es el único que NO exige `platform_admin`, y por eso lleva una
// condición extra: los identificadores que se consultan no vienen de la
// petición, sino de una consulta previa hecha con el cliente NORMAL y por tanto
// ya filtrada por RLS a la organización de quien pregunta. El cliente
// privilegiado se limita a traducir esos identificadores a correos; no amplía en
// ningún caso el conjunto de personas visibles.

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseAdminClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  )
}
