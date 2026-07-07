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
])

export const CREATIVE_SKILLS = new Set([
  'creative.generate',
  'creative.edit',
])

export const SKILL_TRAINER_SKILLS = new Set([
  'skills.list',
  'skills.create',
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