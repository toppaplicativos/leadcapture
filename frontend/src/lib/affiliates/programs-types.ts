export type ProgramStatus = 'draft' | 'active' | 'inactive' | 'closed'
export type ParticipationStatus =
  | 'not_applied' | 'pending' | 'rejected' | 'onboarding' | 'active' | 'suspended' | 'completed'

export type AffiliateProgram = {
  id: string
  slug: string
  name: string
  description?: string | null
  status: ProgramStatus
  commission_mode: string
  commission_value: number
  commission_rules?: string | null
  eligibility_rules?: string | null
  terms_html?: string | null
  policies_html?: string | null
  orientation_html?: string | null
  cover_image_url?: string | null
  accept_applications?: boolean
  auto_approve_applications?: boolean
  is_default?: boolean
  is_marketplace_visible?: boolean
}

export type AffiliateProgramOffer = {
  id: string
  program_id: string
  product_id?: string | null
  product_name?: string | null
  offer_type: string
  title: string
  description?: string | null
}

export type AffiliateProgramStep = {
  id: string
  program_id: string
  slug: string
  title: string
  description?: string | null
  step_type: string
  sort_order: number
  is_required: boolean
  locked?: boolean
  progress?: { status: string }
  trainings?: AffiliateProgramTraining[]
}

export type AffiliateProgramTraining = {
  id: string
  program_id: string
  step_id?: string | null
  title: string
  description?: string | null
  content_type: string
  content_html?: string | null
  media_url?: string | null
  is_required: boolean
  sort_order: number
  progress?: { status: string }
}

export type MarketplaceOpportunity = AffiliateProgram & {
  offers: AffiliateProgramOffer[]
  participation_status: ParticipationStatus
  can_apply: boolean
  can_continue: boolean
  resources_unlocked: boolean
  enrollment?: { id: string; status: string } | null
  application?: { id: string; status: string } | null
}