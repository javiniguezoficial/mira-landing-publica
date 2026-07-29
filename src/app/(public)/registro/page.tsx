import { SignupPage } from '@/components/landing/SignupPage'

export const metadata = {
  title: 'Crear cuenta — Mira Pricing',
}

/**
 * El plan llega por query string desde la landing. Aquí solo se transporta: la
 * validación real la hace `create_organization_with_owner()` contra los planes
 * activos, así que un slug inventado no crea ninguna empresa.
 */
export default async function Registro({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>
}) {
  const { plan } = await searchParams
  return <SignupPage planSlug={plan?.trim() || 'starter'} />
}
