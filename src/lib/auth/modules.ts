// Módulos contratados por organización (Fase 1.4).
//
// Módulo puro: sin Next, sin Supabase. Es la ÚNICA fuente de verdad en
// TypeScript sobre qué módulos existen, cómo se leen y qué se muestra cuando
// uno está apagado. Su espejo en SQL es `org_module_enabled(uuid, text)` y el
// CHECK `organizations_modules_valid` de la migración 027.
//
// ── El módulo NO es un permiso personal ─────────────────────────────────────
//
// Son dos ejes distintos y deben seguir siéndolo:
//
//   · `can_buy` / `can_sell`  → qué puede hacer ESTA PERSONA.
//   · `modules`               → qué tiene contratado ESTA EMPRESA.
//
// Mezclarlos produciría el mensaje equivocado: a un comprador con capacidad
// plena cuya empresa no tiene el módulo hay que decirle que el módulo está
// deshabilitado para su organización, no que le faltan permisos. Y al revés.

/** Los módulos que existen. Ampliar esta lista exige también una migración. */
export const ORGANIZATION_MODULE_NAMES = ['markets', 'quotes'] as const

export type OrganizationModuleName = (typeof ORGANIZATION_MODULE_NAMES)[number]

/** Estado de los módulos de una organización, ya normalizado. */
export type OrganizationModules = Record<OrganizationModuleName, boolean>

/**
 * Ambos activos.
 *
 * Es el mismo valor que el DEFAULT de la columna en 027, y por eso ninguna
 * organización existente pierde acceso al aplicar la migración. También es el
 * valor con el que se responde cuando NO hay organización de la que hablar
 * —por ejemplo un `platform_admin` sin pertenencia—: sin cliente al que
 * aplicarle una configuración comercial, no hay nada que restringir.
 */
export const DEFAULT_ORGANIZATION_MODULES: OrganizationModules = {
  markets: true,
  quotes: true,
}

export function isOrganizationModuleName(value: unknown): value is OrganizationModuleName {
  return ORGANIZATION_MODULE_NAMES.some((name) => name === value)
}

/**
 * Normaliza el `modules` que llega de la base de datos.
 *
 * FAIL-OPEN DELIBERADO, y solo aquí. Cuando el valor es irreconocible —columna
 * ausente porque la migración todavía no ha corrido, `null`, un array, un
 * string— se devuelven los DEFAULTS, es decir, todo activo.
 *
 * Puede parecer contradictorio con el fail-closed del resto de `auth/`, así que
 * conviene ser explícito sobre por qué es correcto:
 *
 *   · esto NO es una decisión de seguridad. La autoridad sobre las cotizaciones
 *     es RLS, y allí `org_module_enabled()` es fail-closed sin excepciones: un
 *     jsonb roto deniega. Aunque este parser dijera «activo», la base de datos
 *     seguiría devolviendo cero filas y rechazando cada escritura;
 *   · un módulo es una configuración COMERCIAL, no un permiso. El daño de
 *     apagar por error un módulo a un cliente que sí lo tiene contratado es
 *     peor que el de mostrarle una pantalla cuyos datos RLS va a vaciar;
 *   · durante el despliegue hay una ventana en la que el código nuevo corre
 *     contra el esquema viejo. Fail-closed ahí dejaría a TODOS los clientes sin
 *     Cotizaciones ni Market Intelligence hasta que la migración terminara.
 *
 * Las claves se leen una a una: cualquier clave adicional se descarta, y un
 * valor que no sea booleano estricto cae al default de ese módulo.
 */
export function parseOrganizationModules(raw: unknown): OrganizationModules {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_ORGANIZATION_MODULES }
  }

  const source = raw as Record<string, unknown>
  const parsed = {} as OrganizationModules

  for (const name of ORGANIZATION_MODULE_NAMES) {
    const value = source[name]
    parsed[name] = typeof value === 'boolean' ? value : DEFAULT_ORGANIZATION_MODULES[name]
  }

  return parsed
}

/**
 * ¿Está activo este módulo?
 *
 * Espejo de `org_module_enabled()`: un nombre desconocido devuelve `false`, y
 * unos módulos ausentes también. Aquí sí es fail-closed, porque a diferencia
 * del parser esto ya es una comprobación, no una lectura.
 */
export function isOrganizationModuleEnabled(
  modules: OrganizationModules | null | undefined,
  name: string,
): boolean {
  if (!modules || !isOrganizationModuleName(name)) return false
  return modules[name] === true
}

/** Normaliza lo que llega de un formulario administrativo antes de persistirlo. */
export function buildOrganizationModules(input: {
  markets: unknown
  quotes: unknown
}): OrganizationModules {
  return {
    markets: input.markets === true,
    quotes: input.quotes === true,
  }
}

// ── Textos ──────────────────────────────────────────────────────────────────
//
// Viven aquí, junto al modelo, para que administración y área de cliente no
// puedan describir el mismo estado de dos formas distintas.
//
// «Market Intelligence» se escribe literalmente y no se traduce: es el nombre
// comercial del módulo en la interfaz.

export const ORGANIZATION_MODULE_LABELS: Record<OrganizationModuleName, string> = {
  markets: 'Market Intelligence',
  quotes: 'Cotizaciones',
}

export const ORGANIZATION_MODULE_DESCRIPTIONS: Record<OrganizationModuleName, string> = {
  markets:
    'Acceso a los mercados, precios de referencia y su evolución histórica.',
  quotes:
    'Creación y seguimiento de solicitudes de cotización (RFQ) a proveedores.',
}

export interface ModuleDisabledCopy {
  title: string
  description: string
}

/**
 * Qué se le dice a la persona cuando el módulo está apagado.
 *
 * El texto habla siempre de la ORGANIZACIÓN y remite al administrador de la
 * plataforma. Nunca sugiere que sea un problema de permisos de esa persona: no
 * lo es, y hacérselo creer la mandaría a pedirle a su propio owner algo que su
 * owner tampoco puede darle.
 */
export const MODULE_DISABLED_COPY: Record<OrganizationModuleName, ModuleDisabledCopy> = {
  markets: {
    title: 'Market Intelligence no disponible',
    description:
      'El módulo de Market Intelligence está deshabilitado para tu organización. ' +
      'Contacta con el administrador de la plataforma para solicitar su activación.',
  },
  quotes: {
    title: 'Cotizaciones no disponibles',
    description:
      'El módulo de Cotizaciones está deshabilitado para tu organización. ' +
      'Contacta con el administrador de la plataforma para solicitar su activación.',
  },
}
