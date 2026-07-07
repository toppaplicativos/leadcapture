/** Skills em que o composer pode oferecer ação primária de IA. */
export const CAMPAIGN_SKILLS = new Set([
  'campaigns.list',
  'campaigns.create',
  'campaigns.confirm',
  'campaign.builder',
])

export const PRODUCT_SKILLS = new Set([
  'catalog.products',
  'catalog.products.table',
  'catalog.products.create',
])

export const CREATIVE_SKILLS = new Set([
  'creative.generate',
  'creative.edit',
])

export const SKILL_TRAINER_SKILLS = new Set([
  'skills.list',
  'skills.create',
])

export const LEADS_SKILLS = new Set([
  'crm.leads.table',
  'crm.leads.list',
  'crm.leads.search',
  'crm.lead.find',
  'crm.lead.detail',
])

export const CLIENTS_SKILLS = new Set([
  'crm.clients.table',
  'crm.clients.list',
])

export const ORDERS_SKILLS = new Set([
  'catalog.orders',
])

export const DASHBOARD_SKILLS = new Set([
  'dashboard.overview',
  'dashboard.show',
])

export const SKILLS_MODULE_SKILLS = new Set([
  'skills.list',
])

export const PROSPECT_SKILLS = new Set([
  'lead.prospect',
  'crm.leads.search',
])

export const INSTAGRAM_SKILLS = new Set([
  'instagram.open',
  'instagram.post.create',
  'instagram.post.confirm',
  'instagram.analyze',
  'instagram.messages',
])

export function isCampaignSkill(skill?: string) {
  return !!skill && CAMPAIGN_SKILLS.has(skill)
}

export function isProductSkill(skill?: string) {
  return !!skill && PRODUCT_SKILLS.has(skill)
}

export function isCreativeSkill(skill?: string) {
  return !!skill && CREATIVE_SKILLS.has(skill)
}

export function isSkillTrainerSkill(skill?: string) {
  return !!skill && SKILL_TRAINER_SKILLS.has(skill)
}

export function isLeadsSkill(skill?: string) {
  return !!skill && LEADS_SKILLS.has(skill)
}

export function isClientsSkill(skill?: string) {
  return !!skill && CLIENTS_SKILLS.has(skill)
}

export function isOrdersSkill(skill?: string) {
  return !!skill && ORDERS_SKILLS.has(skill)
}

export function isDashboardSkill(skill?: string) {
  return !!skill && DASHBOARD_SKILLS.has(skill)
}

export function isSkillsModuleSkill(skill?: string) {
  return !!skill && SKILLS_MODULE_SKILLS.has(skill)
}

export function isProspectSkill(skill?: string) {
  return !!skill && PROSPECT_SKILLS.has(skill)
}

export function isInstagramSkill(skill?: string) {
  return !!skill && INSTAGRAM_SKILLS.has(skill)
}