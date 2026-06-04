export type UserRole = 'platform_admin' | 'client_owner' | 'client_member'

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired'

export type PlanSlug = 'starter' | 'business' | 'enterprise'

export interface Profile {
  id: string
  role: UserRole
  first_name: string | null
  last_name: string | null
  phone: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Organization {
  id: string
  name: string
  cif_nif: string | null
  type: 'fisica' | 'juridica' | null
  sector: string | null
  annual_revenue_range: string | null
  employee_count_range: string | null
  address: string | null
  city: string | null
  country: string
  phone: string | null
  email: string | null
  website: string | null
  plan_id: string | null
  subscription_status: SubscriptionStatus
  subscription_start: string | null
  subscription_end: string | null
  created_at: string
  updated_at: string
}

export interface Plan {
  id: string
  name: string
  slug: PlanSlug
  price_monthly: number | null
  price_annual: number | null
  max_users: number | null
  max_rfqs_month: number | null
  has_ai: boolean
  has_api: boolean
  has_history: boolean
  is_active: boolean
}
