import type { PublicClientType } from '@/lib/api'

export type ExperienceLevel = 'prospect' | 'first' | 'returning' | 'loyal' | 'vip'

export type CustomerExperience = {
  level: ExperienceLevel
  /** Rótulo de jornada (comportamento). */
  journeyLabel: string
  /** Tipo declarado no cadastro. */
  declaredType: string | null
  /** Tipo sugerido a partir da experiência + catálogo da loja. */
  suggestedType: string | null
  /** Tipo efetivo a exibir (declarado ou sugerido). */
  displayType: string | null
  orderCount: number
  totalSpent: number
}

const JOURNEY: Record<ExperienceLevel, string> = {
  prospect: 'Explorando a loja',
  first: 'Primeira compra',
  returning: 'Cliente recorrente',
  loyal: 'Cliente frequente',
  vip: 'Cliente VIP',
}

/** Palavras-chave para casar tipos cadastrados com o nível de experiência. */
const TYPE_HINTS: Record<ExperienceLevel, string[]> = {
  prospect: ['novo', 'prospect', 'lead', 'visitante'],
  first: ['novo', 'primeira', 'iniciante', 'site'],
  returning: ['recorrente', 'regular', 'ativo', 'cliente'],
  loyal: ['frequente', 'fiel', 'assinante', 'parceiro'],
  vip: ['vip', 'premium', 'gold', 'especial', 'atacado', 'revenda'],
}

function scoreTypeName(name: string, level: ExperienceLevel): number {
  const n = name.toLowerCase()
  let score = 0
  for (const hint of TYPE_HINTS[level]) {
    if (n.includes(hint)) score += 2
  }
  return score
}

/**
 * Posiciona o cliente pela experiência de pedidos + tipo declarado no cadastro.
 * Usa os tipos cadastrados no studio/config quando possível.
 */
export function resolveCustomerExperience(
  orders: Array<{ total?: number | string | null }>,
  opts?: {
    declaredType?: string | null
    registeredTypes?: PublicClientType[] | null
  },
): CustomerExperience {
  const list = Array.isArray(orders) ? orders : []
  const orderCount = list.length
  const totalSpent = list.reduce((sum, o) => sum + Number(o.total || 0), 0)

  let level: ExperienceLevel
  if (orderCount === 0) level = 'prospect'
  else if (orderCount === 1) level = 'first'
  else if (orderCount < 5 && totalSpent < 1500) level = 'returning'
  else if (orderCount >= 10 || totalSpent >= 2500) level = 'vip'
  else level = 'loyal'

  const declared = String(opts?.declaredType || '').trim() || null
  const types = opts?.registeredTypes || []

  let suggestedType: string | null = null
  if (types.length > 0) {
    let best: { name: string; score: number } | null = null
    for (const t of types) {
      const name = String(t.name || '').trim()
      if (!name) continue
      const score = scoreTypeName(name, level)
      if (!best || score > best.score) best = { name, score }
    }
    // Só sugere se houver match razoável; senão usa o primeiro tipo para prospect
    if (best && best.score > 0) suggestedType = best.name
    else if (level === 'prospect' && types[0]?.name) suggestedType = String(types[0].name)
  }

  return {
    level,
    journeyLabel: JOURNEY[level],
    declaredType: declared,
    suggestedType,
    displayType: declared || suggestedType,
    orderCount,
    totalSpent,
  }
}
