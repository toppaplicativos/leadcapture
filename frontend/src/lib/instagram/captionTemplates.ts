import { instagramApi } from '@/lib/instagram/pageApi'

export type CaptionTemplate = {
  id: string
  label: string
  category: 'promo' | 'lancamento' | 'social' | 'cta' | 'custom'
  body: string
  custom?: boolean
}

export const BUILTIN_CAPTION_TEMPLATES: CaptionTemplate[] = [
  {
    id: 'promo-desconto',
    label: 'Promoção',
    category: 'promo',
    body: '🔥 Oferta especial por tempo limitado!\n\nAproveite condições exclusivas e garanta o seu antes que acabe.\n\n👉 Chama no direct ou acesse o link na bio.',
  },
  {
    id: 'lancamento',
    label: 'Lançamento',
    category: 'lancamento',
    body: '✨ Novidade no ar!\n\nApresentamos algo feito com muito carinho para você.\n\nComenta QUERO que a gente te conta todos os detalhes.',
  },
  {
    id: 'depoimento',
    label: 'Depoimento',
    category: 'social',
    body: '💬 O que nossos clientes estão dizendo:\n\n"Experiência incrível do começo ao fim!"\n\nObrigado pela confiança — vocês fazem tudo valer a pena.',
  },
  {
    id: 'cta-whatsapp',
    label: 'CTA WhatsApp',
    category: 'cta',
    body: '📲 Fale com a gente agora!\n\nTire dúvidas, peça orçamento ou faça seu pedido em poucos cliques.\n\nToque no link da bio ou manda um OI no direct.',
  },
  {
    id: 'bastidores',
    label: 'Bastidores',
    category: 'social',
    body: '🎬 Nos bastidores de hoje\n\nUm pouco do processo, do cuidado e do trabalho que vai até você.\n\nSalva esse post para não perder!',
  },
  {
    id: 'educativo',
    label: 'Dica / Educativo',
    category: 'social',
    body: '💡 Dica rápida para você\n\n[Insira sua dica aqui]\n\nCompartilha com quem precisa ver isso.',
  },
]

export async function fetchServerCaptionTemplates(): Promise<CaptionTemplate[]> {
  try {
    const res = await instagramApi('/caption-templates')
    if (!res.success) return []
    return (res.templates || []).map((t: any) => ({
      id: String(t.id),
      label: String(t.label || 'Template'),
      category: 'custom' as const,
      body: String(t.body || ''),
      custom: true,
    }))
  } catch {
    return []
  }
}

export async function saveServerCaptionTemplate(label: string, body: string): Promise<CaptionTemplate | null> {
  const res = await instagramApi('/caption-templates', {
    method: 'POST',
    body: JSON.stringify({ label, body }),
  })
  if (!res.success || !res.template) return null
  return {
    id: String(res.template.id),
    label: String(res.template.label),
    category: 'custom',
    body: String(res.template.body),
    custom: true,
  }
}

export async function deleteServerCaptionTemplate(id: string): Promise<boolean> {
  const res = await instagramApi(`/caption-templates/${encodeURIComponent(id)}`, { method: 'DELETE' })
  return Boolean(res.success)
}

export function allCaptionTemplates(custom: CaptionTemplate[]): CaptionTemplate[] {
  return [...custom, ...BUILTIN_CAPTION_TEMPLATES]
}

export function applyTemplateVars(body: string, vars: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}