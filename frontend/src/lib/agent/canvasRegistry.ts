import type { AgentTurn } from './types'

/** Skills / rotas que exigem Canvas lateral (nunca substituem o chat). */
export const CANVAS_SKILLS = new Set([
  'flow.builder',
  'creative.generate',
  'creative.edit',
  'video.create',
  'video.edit',
  'gallery.open',
  'agent.configure',
  'campaign.builder',
  'automation.create',
  'dashboard.show',
  'design.edit',
])

export const CANVAS_ROUTES: Record<string, string> = {
  'flow.builder': '/fluxos',
  'creative.generate': '/criativos',
  'creative.edit': '/criativos',
  'video.create': '/video-studio',
  'video.edit': '/video-studio',
  'gallery.open': '/galeria',
  'agent.configure': '/agente',
  'campaign.builder': '/campanhas',
  'automation.create': '/automacoes',
  'dashboard.show': '/dashboard',
  'design.edit': '/design',
}

export function skillNeedsCanvas(skillId?: string): boolean {
  if (!skillId) return false
  return CANVAS_SKILLS.has(skillId)
}

export function canvasRouteForSkill(skillId?: string): string | null {
  if (!skillId) return null
  return CANVAS_ROUTES[skillId] || null
}

export function turnNeedsCanvas(turn?: AgentTurn | null): boolean {
  if (!turn) return false
  if (turn.presentation === 'canvas') return true
  if (turn.presentation === 'inline') return false
  return skillNeedsCanvas(turn.skill)
}

export function turnShowsInline(turn?: AgentTurn | null): boolean {
  if (!turn?.components?.length) return false
  if (turn.presentation === 'canvas') return false
  if (turn.presentation === 'inline') return true
  return !skillNeedsCanvas(turn.skill)
}