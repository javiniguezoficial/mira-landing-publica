'use server'

import { revalidatePath } from 'next/cache'
import { requirePlatformAdmin } from '@/lib/auth/guards'

export interface OrganizationMarketOption {
  id: string
  name: string
  categoryName: string
  strategicMarketName: string | null
  countryScope: string
  disabled: boolean
}

export interface OrganizationMarketsResult {
  saved?: number
  error?: string
}

const MESSAGES = {
  organizacion: 'No se ha indicado la organización.',
  generico: 'No se han podido guardar los mercados. Inténtalo de nuevo.',
  noEncontrada: 'No se ha encontrado la organización indicada.',
} as const

/**
 * Catálogo completo de mercados con su estado para una organización (2.2).
 *
 * Solo `platform_admin`: se apoya en `requirePlatformAdmin`, y además la policy
 * `admin_all_markets` es la que le deja ver también los mercados que esta
 * organización tiene deshabilitados —`client_read_markets` ya no los
 * devolvería—. Sin ese bypass, la ficha de administración no podría mostrar
 * justamente lo que hay que reactivar.
 *
 * Una sola consulta con los dos niveles de jerarquía embebidos, y otra para el
 * conjunto de deshabilitados. Nada de una consulta por mercado.
 */
export async function getOrganizationMarketOptions(
  organizationId: string,
): Promise<OrganizationMarketOption[]> {
  const { supabase } = await requirePlatformAdmin()

  const [marketsResult, disabledResult] = await Promise.all([
    supabase
      .from('markets')
      .select(`
        id, name, country_scope,
        category:market_categories!inner(
          id, name,
          strategic_market:strategic_markets(id, name)
        )
      `)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('organization_disabled_markets')
      .select('market_id')
      .eq('organization_id', organizationId),
  ])

  const disabled = new Set((disabledResult.data ?? []).map((r) => r.market_id as string))

  return ((marketsResult.data ?? []) as unknown as Array<Record<string, unknown>>).map((m) => {
    const category = (Array.isArray(m.category) ? m.category[0] : m.category) as
      | { name: string; strategic_market?: { name: string } | { name: string }[] | null }
      | undefined
    const strategic = category?.strategic_market
    const strategicName = Array.isArray(strategic) ? strategic[0]?.name : strategic?.name

    return {
      id: m.id as string,
      name: m.name as string,
      countryScope: m.country_scope as string,
      categoryName: category?.name ?? '—',
      strategicMarketName: strategicName ?? null,
      disabled: disabled.has(m.id as string),
    }
  })
}

/**
 * Fija de una vez los mercados deshabilitados de una organización (2.2).
 *
 * ── Por qué se guarda el conjunto entero y no mercado a mercado ─────────────
 *
 * La ficha maneja 127 mercados. Una Server Action por casilla serían hasta 127
 * peticiones para un solo guardado, cada una con su propia comprobación de
 * permisos, y un estado intermedio incoherente si alguna fallara a mitad.
 *
 * Aquí llega el conjunto completo de identificadores a deshabilitar y se
 * calcula la diferencia contra lo que ya había: se insertan los que faltan y se
 * borran los que sobran. Los que no cambian NO se tocan, así que `disabled_at`
 * y `disabled_by` conservan cuándo y quién lo deshabilitó de verdad — que es lo
 * que se perdería con un «borrar todo y volver a insertar».
 *
 * ── Protección ──────────────────────────────────────────────────────────────
 *
 *   1. `requirePlatformAdmin('throw')` — sesión, rol y perfil ACTIVO.
 *   2. La organización se comprueba de verdad antes de escribir.
 *   3. La policy `admin_all_disabled_markets` exige `is_platform_admin()` en
 *      INSERT y DELETE. A diferencia de 027, aquí no hace falta ningún trigger:
 *      la tabla es nueva y NINGUNA policy da escritura a un owner, así que no
 *      existe la vía que allí hubo que cerrar.
 *   4. Cliente NORMAL, sujeto a RLS. No se usa `service_role`.
 */
export async function setOrganizationDisabledMarkets(
  organizationId: string,
  disabledMarketIds: string[],
): Promise<OrganizationMarketsResult> {
  const { supabase, userId } = await requirePlatformAdmin('throw')

  if (!organizationId?.trim()) return { error: MESSAGES.organizacion }

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('id', organizationId)
    .maybeSingle()

  if (!org) return { error: MESSAGES.noEncontrada }

  const deseados = new Set(
    (disabledMarketIds ?? []).filter((id): id is string => typeof id === 'string' && !!id.trim()),
  )

  const { data: actualesData, error: leerError } = await supabase
    .from('organization_disabled_markets')
    .select('market_id')
    .eq('organization_id', organizationId)

  if (leerError) {
    console.error(`[org-markets] lectura falló: ${leerError.code ?? '?'} ${leerError.message}`)
    return { error: MESSAGES.generico }
  }

  const actuales = new Set((actualesData ?? []).map((r) => r.market_id as string))

  const aInsertar = [...deseados].filter((id) => !actuales.has(id))
  const aBorrar = [...actuales].filter((id) => !deseados.has(id))

  if (aInsertar.length > 0) {
    const { error } = await supabase.from('organization_disabled_markets').insert(
      aInsertar.map((market_id) => ({
        organization_id: organizationId,
        market_id,
        disabled_by: userId,
      })),
    )
    if (error) {
      console.error(`[org-markets] alta falló: ${error.code ?? '?'} ${error.message}`)
      return { error: MESSAGES.generico }
    }
  }

  if (aBorrar.length > 0) {
    const { error } = await supabase
      .from('organization_disabled_markets')
      .delete()
      .eq('organization_id', organizationId)
      .in('market_id', aBorrar)
    if (error) {
      console.error(`[org-markets] baja falló: ${error.code ?? '?'} ${error.message}`)
      return { error: MESSAGES.generico }
    }
  }

  revalidatePath(`/admin/clientes/${organizationId}`)
  // Lo que ve el cliente en su propio panel cambia por completo.
  revalidatePath('/app', 'layout')

  return { saved: aInsertar.length + aBorrar.length }
}
