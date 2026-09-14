// El cableado del alta pública robusta · tests de FUENTE, al estilo de la casa.
//
// La suite corre en Node sin jsdom, así que los contratos entre callback,
// login y onboarding se fijan leyendo el código, igual que los `*-semantics`
// del resto del repo. No son comprobaciones de estilo: cada una corresponde a
// un modo de fallo real del caso del 14-09 (flow state caducado → cuenta sin
// organización) o a una regresión que lo reintroduciría.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = process.cwd()

function codigo(...ruta: string[]): string {
  return readFileSync(join(RAIZ, 'src', ...ruta), 'utf8')
    .split('\n')
    .filter((l) => {
      const t = l.trimStart()
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')
}

const CALLBACK = () => codigo('app', 'auth', 'callback', 'route.ts')
const LOGIN = () => codigo('components', 'landing', 'LoginPage.tsx')
const LOGIN_PAGE = () => codigo('app', '(public)', 'login', 'page.tsx')
const ONBOARDING = () => codigo('lib', 'actions', 'onboarding.ts')

describe('callback · flow state caducado deja de ser un error genérico', () => {
  it('el destino del fallo lo decide el mapeo por código, no un literal fijo', () => {
    const s = CALLBACK()
    expect(s).toContain("from '@/lib/auth/signup-recovery'")
    expect(s).toMatch(/redirigirAErrorSinFragmento\(\s*callbackFailureRedirect\(/)
  })

  it('llegar sin código sigue siendo el error genérico: ahí no hubo confirmación', () => {
    expect(CALLBACK()).toContain("redirigirAErrorSinFragmento('/login?error=auth')")
  })

  it('ambas salidas de error cortan el fragmento (el token no viaja a la pantalla)', () => {
    // Todas las salidas de fallo pasan por el helper que añade `#`.
    expect(CALLBACK()).not.toMatch(/redirigirA\(\s*callbackFailureRedirect/)
  })

  it('el camino feliz sigue completando el alta en el propio callback', () => {
    expect(CALLBACK()).toContain('await completeOrganizationSignup()')
  })
})

describe('login · el primer login completa el alta pendiente', () => {
  it('detecta el alta pendiente por metadata y llama a la acción idempotente', () => {
    const s = LOGIN()
    expect(s).toContain('needsOnboardingCompletion(user?.user_metadata)')
    expect(s).toContain('await completeOrganizationSignup()')
  })

  it('la completa ANTES de redirigir al dashboard', () => {
    const s = LOGIN()
    expect(s.indexOf('completeOrganizationSignup')).toBeLessThan(s.indexOf('router.push(destination)'))
  })

  it('el gancho va envuelto en try/catch: nada puede congelar el botón', () => {
    // El QA del 14-09: la Server Action moría en vuelo (el middleware
    // interceptaba el POST) y el rechazo sin manejar dejaba «Iniciando
    // sesión…» para siempre. Ahora el tramo posterior al signIn navega
    // SIEMPRE, con o sin excepción.
    const s = LOGIN()
    expect(s).toMatch(/try\s*\{[\s\S]*?completeOrganizationSignup\(\)[\s\S]*?\}\s*catch/)
    // Y el destino por defecto existe antes del try: la navegación no depende
    // de que el bloque termine bien.
    expect(s).toMatch(/let destination = '\/app\/dashboard'[\s\S]*try/)
  })

  it('el middleware deja pasar los POST de Server Action en /login y /registro', () => {
    const mw = codigo('lib', 'supabase', 'middleware.ts')
    expect(mw).toContain("isAuthRoute && user && request.method === 'GET'")
  })

  it('un fallo del alta no bloquea el acceso: se registra y se sigue', () => {
    // La cuenta es válida con o sin organización; el reintento llega solo en
    // el siguiente login. Bloquear aquí dejaría a la persona fuera por un
    // fallo transitorio del alta.
    expect(LOGIN()).toMatch(/resultado\.error[\s\S]{0,200}console\.error/)
    expect(LOGIN()).not.toMatch(/resultado\.error[\s\S]{0,120}return/)
  })

  it('la página de login traduce los parámetros con la lista cerrada', () => {
    const s = LOGIN_PAGE()
    expect(s).toContain('loginNoticeFor(')
    expect(s).toContain('notice={')
  })

  it('la pantalla pinta el aviso cuando existe', () => {
    expect(LOGIN()).toContain('{notice && (')
    expect(LOGIN()).toContain('notice.text')
  })
})

describe('onboarding · idempotencia y marca de completado', () => {
  it('sale por la rama «ya es miembro» antes de intentar crear nada', () => {
    const s = ONBOARDING()
    expect(s.indexOf('yaMiembro')).toBeLessThan(s.indexOf("rpc('create_organization_with_owner'"))
  })

  it('marca la metadata al completar Y al descubrir que ya estaba completo', () => {
    const s = ONBOARDING()
    expect((s.match(/marcarOnboardingCompletado\(supabase\)/g) ?? []).length).toBe(2)
    expect(s).toContain('ONBOARDING_COMPLETED_KEY')
  })

  it('la marca es mejor-esfuerzo: su fallo se registra, nunca rompe el alta', () => {
    expect(ONBOARDING()).toMatch(/marcarOnboardingCompletado[\s\S]*?console\.error/)
  })

  it('la garantía dura vive en SQL, no en la interfaz', () => {
    // El comentario del propio módulo lo documenta y la 052 lo implementa:
    // la RPC devuelve la organización existente y el advisory lock serializa
    // callback + login concurrentes. Aquí se fija que la acción sigue
    // delegando en esa RPC y no inserta organizaciones por su cuenta.
    const s = ONBOARDING()
    expect(s).toContain("rpc('create_organization_with_owner'")
    expect(s).not.toMatch(/from\('organizations'\)[\s\S]{0,80}\.insert/)
    expect(s).not.toMatch(/from\('organization_members'\)[\s\S]{0,80}\.insert/)
  })
})
