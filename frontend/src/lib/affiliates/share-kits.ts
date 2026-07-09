import { resolveAffiliateCopyTemplate, type AffiliateCopyContext } from '@/lib/affiliates/copy-template'
import {
  getShareDestination,
  type ShareDestinationId,
  type ShareKitId,
} from '@/lib/affiliates/share-destinations'

export type SharePackInput = {
  kit: ShareKitId
  destination: ShareDestinationId
  ctx: AffiliateCopyContext & {
    comissao?: string
    produto?: string
    preco?: string
    material?: string
    link_curto?: string
    link_programa?: string
    slogan?: string
    tom?: string
  }
  imageUrl?: string | null
}

export type SharePackContent = {
  destination: ShareDestinationId
  kit: ShareKitId
  seo_title: string
  headline: string
  subtitle: string
  body: string
  hashtags: string[]
  cta: string
  image_url: string | null
  image_aspect: string
  full_text: string
  char_count: number
  max_chars: number
}

function slugHashtags(marca: string, extra: string[] = []): string[] {
  const base = marca
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
  const tags = [
    base ? `#${base}` : '',
    '#indicacao',
    '#cupom',
    ...extra.filter(Boolean),
  ].filter(Boolean)
  return [...new Set(tags)].slice(0, 8)
}

function clamp(text: string, max: number): string {
  const t = String(text || '').trim()
  if (t.length <= max) return t
  return t.slice(0, max - 1).trimEnd() + '…'
}

function assembleFullText(parts: {
  headline?: string
  subtitle?: string
  body?: string
  hashtags?: string[]
  cta?: string
  link?: string
}, destination: ShareDestinationId): string {
  const dest = getShareDestination(destination)
  const lines: string[] = []

  if (parts.headline) lines.push(parts.headline)
  if (parts.subtitle) lines.push(parts.subtitle)
  if (parts.body) lines.push(parts.body)
  if (parts.cta) lines.push(parts.cta)
  if (parts.link && !String(parts.body || '').includes(parts.link)) lines.push(parts.link)

  if (dest.fields.includes('hashtags') && parts.hashtags?.length) {
    lines.push(parts.hashtags.join(' '))
  }

  return clamp(lines.filter(Boolean).join('\n\n'), dest.maxChars)
}

const KIT_TEMPLATES: Record<ShareKitId, Record<ShareDestinationId, {
  seo_title?: string
  headline?: string
  subtitle?: string
  body?: string
  cta?: string
  extraTags?: string[]
}>> = {
  catalog: {
    whatsapp_dm: {
      headline: 'Oi! Separei ofertas da {{marca}} pra você',
      body: 'Use meu cupom *{{cupom}}* no checkout.\nCatálogo: {{link_catalogo}}',
      cta: 'Qualquer dúvida, me chama! — {{nome_afiliado}}',
    },
    whatsapp_status: {
      headline: '{{marca}} com desconto',
      body: 'Cupom {{cupom}} · link na bio ou me chama',
      cta: '{{link_catalogo}}',
    },
    whatsapp_broadcast: {
      headline: 'Novidade na {{marca}}',
      subtitle: 'Indicação exclusiva para quem está na minha lista',
      body: 'Acesse o catálogo, escolha o que precisa e aplique o cupom no final.',
      cta: 'Cupom: {{cupom}}\n{{link_catalogo}}',
    },
    instagram_feed: {
      headline: 'Minha indicação: {{marca}}',
      subtitle: '{{slogan}}',
      body: 'Se você ainda não conhece, vale muito a pena. Cupom de parceiro: {{cupom}}\nLink: {{link_catalogo}}',
      cta: 'Salva esse post e usa quando for comprar.',
      extraTags: ['#comprasonline', '#dica'],
    },
    instagram_story: {
      headline: 'Cupom {{cupom}} na {{marca}}',
      body: 'Arrasta pra cima ou responde "QUERO"',
      cta: '{{link_catalogo}}',
    },
    instagram_reels: {
      headline: 'POV: você descobriu a {{marca}} com desconto',
      subtitle: 'Comenta QUERO que eu te mando o link',
      body: 'Cupom {{cupom}} no catálogo oficial.',
      cta: '{{link_catalogo}}',
      extraTags: ['#reels', '#desconto'],
    },
    instagram_bio: {
      headline: '{{marca}} · cupom {{cupom}}',
      cta: '{{link_catalogo}}',
    },
    seo_link: {
      seo_title: '{{marca}} — Indicação com cupom {{cupom}}',
      subtitle: 'Catálogo oficial com desconto de parceiro',
      body: 'Acesse o catálogo da {{marca}}, escolha seus produtos e use o cupom {{cupom}} no checkout. Indicação de {{nome_afiliado}}.',
    },
  },
  product: {
    whatsapp_dm: {
      headline: '{{produto}} — {{marca}}',
      body: '{{preco}}\nCupom: *{{cupom}}*\n{{link_catalogo}}',
      cta: 'Posso te ajudar a escolher o tamanho/modelo?',
    },
    whatsapp_status: {
      headline: 'Destaque: {{produto}}',
      body: 'Cupom {{cupom}}',
      cta: '{{link_catalogo}}',
    },
    whatsapp_broadcast: {
      headline: 'Oferta da semana: {{produto}}',
      subtitle: '{{marca}}',
      body: '{{preco}} com cupom de parceiro.',
      cta: '{{cupom}} · {{link_catalogo}}',
    },
    instagram_feed: {
      headline: '{{produto}}',
      subtitle: '{{marca}}',
      body: '{{preco}}\nCupom: {{cupom}}\nLink: {{link_catalogo}}',
      cta: 'Comenta se quiser mais detalhes.',
      extraTags: ['#produto', '#oferta'],
    },
    instagram_story: {
      headline: '{{produto}}',
      body: 'Cupom {{cupom}}',
      cta: 'Link no destaque',
    },
    instagram_reels: {
      headline: 'Esse {{produto}} vale cada centavo',
      body: 'Cupom {{cupom}} no link',
      cta: '{{link_catalogo}}',
    },
    instagram_bio: {
      headline: '{{produto}} · {{cupom}}',
      cta: '{{link_catalogo}}',
    },
    seo_link: {
      seo_title: '{{produto}} · {{marca}}',
      subtitle: 'Cupom {{cupom}} — indicação {{nome_afiliado}}',
      body: 'Confira {{produto}} no catálogo da {{marca}}. Use o cupom {{cupom}} e finalize pelo link oficial.',
    },
  },
  coupon: {
    whatsapp_dm: {
      headline: 'Tenho cupom da {{marca}} pra você',
      body: 'Código: *{{cupom}}*\nVálido no catálogo: {{link_catalogo}}',
      cta: 'Me avisa se usar — quero saber se ajudou!',
    },
    whatsapp_status: {
      headline: 'Cupom ativo: {{cupom}}',
      body: '{{marca}}',
      cta: '{{link_catalogo}}',
    },
    whatsapp_broadcast: {
      headline: 'Cupom liberado — {{marca}}',
      body: 'Quem da lista usa primeiro: {{cupom}}',
      cta: '{{link_catalogo}}',
    },
    instagram_feed: {
      headline: 'Cupom de parceiro {{cupom}}',
      subtitle: '{{marca}}',
      body: 'Aplica no checkout pelo link oficial.',
      cta: '{{link_catalogo}}',
      extraTags: ['#cupom', '#desconto'],
    },
    instagram_story: {
      headline: '{{cupom}}',
      body: '{{marca}}',
      cta: 'Responde QUERO',
    },
    instagram_reels: {
      headline: 'Quem ainda não usou {{cupom}}?',
      body: '{{marca}} · link na bio',
      cta: '{{link_catalogo}}',
    },
    instagram_bio: {
      headline: 'Cupom {{cupom}}',
      cta: '{{link_catalogo}}',
    },
    seo_link: {
      seo_title: 'Cupom {{cupom}} — {{marca}}',
      subtitle: 'Desconto de indicação oficial',
      body: 'Use o cupom {{cupom}} no catálogo da {{marca}}: {{link_catalogo}}',
    },
  },
  program: {
    whatsapp_dm: {
      headline: 'Quer ganhar comissão com a {{marca}}?',
      body: 'Programa de afiliados aberto. Cadastro rápido, material pronto e comissão em cada venda.',
      cta: 'Entra aqui: {{link_programa}}',
    },
    whatsapp_status: {
      headline: 'Vagas — programa {{marca}}',
      body: 'Ganhe comissão indicando',
      cta: '{{link_programa}}',
    },
    whatsapp_broadcast: {
      headline: 'Convite: seja parceiro {{marca}}',
      subtitle: 'Comissão + materiais prontos',
      body: 'Ideal pra quem já fala com clientes no WhatsApp ou Instagram.',
      cta: '{{link_programa}}',
    },
    instagram_feed: {
      headline: 'Programa de afiliados {{marca}}',
      subtitle: 'Material pronto · comissão por venda',
      body: 'Se você curte vender com autenticidade, esse programa é pra você.',
      cta: 'Link na bio: {{link_programa}}',
      extraTags: ['#afiliados', '#rendaextra'],
    },
    instagram_story: {
      headline: 'Quer ser parceiro {{marca}}?',
      body: 'Comissão em cada venda',
      cta: '{{link_programa}}',
    },
    instagram_reels: {
      headline: 'Como ganhar indicando {{marca}}',
      body: 'Programa aberto — link na descrição',
      cta: '{{link_programa}}',
    },
    instagram_bio: {
      headline: 'Parceiro {{marca}}',
      cta: '{{link_programa}}',
    },
    seo_link: {
      seo_title: 'Programa de Afiliados — {{marca}}',
      subtitle: 'Cadastre-se e ganhe comissão',
      body: 'Seja parceiro da {{marca}}. Materiais prontos, app exclusivo e comissão em cada venda indicada.',
    },
  },
  material: {
    whatsapp_dm: {
      headline: '{{material}} — {{marca}}',
      body: 'Arte oficial da marca + cupom {{cupom}}',
      cta: '{{link_catalogo}}',
    },
    whatsapp_status: {
      headline: '{{marca}}',
      body: '{{material}}',
      cta: 'Cupom {{cupom}}',
    },
    whatsapp_broadcast: {
      headline: 'Material novo: {{material}}',
      subtitle: '{{marca}}',
      body: 'Cupom {{cupom}} no catálogo.',
      cta: '{{link_catalogo}}',
    },
    instagram_feed: {
      headline: '{{material}}',
      subtitle: '{{marca}}',
      body: 'Cupom de parceiro: {{cupom}}\n{{link_catalogo}}',
      cta: 'Salva e compartilha com quem precisa.',
      extraTags: ['#parceiro'],
    },
    instagram_story: {
      headline: '{{marca}}',
      body: '{{material}} · {{cupom}}',
      cta: 'Link na bio',
    },
    instagram_reels: {
      headline: '{{material}}',
      body: '{{marca}} · cupom {{cupom}}',
      cta: '{{link_catalogo}}',
    },
    instagram_bio: {
      headline: '{{marca}} · {{cupom}}',
      cta: '{{link_catalogo}}',
    },
    seo_link: {
      seo_title: '{{material}} — {{marca}}',
      subtitle: 'Cupom {{cupom}}',
      body: 'Material oficial da {{marca}}. Use {{cupom}} em {{link_catalogo}}.',
    },
  },
}

export function buildInstantSharePack(input: SharePackInput): SharePackContent {
  const dest = getShareDestination(input.destination)
  const tpl = KIT_TEMPLATES[input.kit]?.[input.destination]
    || KIT_TEMPLATES.catalog[input.destination]

  const resolve = (text?: string) => resolveAffiliateCopyTemplate(String(text || ''), input.ctx)

  const seo_title = clamp(resolve(tpl.seo_title || `${input.ctx.marca || 'Marca'} — Indicação`), 70)
  const headline = clamp(resolve(tpl.headline || ''), dest.maxChars)
  const subtitle = clamp(resolve(tpl.subtitle || input.ctx.slogan || ''), 120)
  const body = clamp(resolve(tpl.body || ''), dest.maxChars)
  const cta = clamp(resolve(tpl.cta || ''), 160)
  const hashtags = slugHashtags(String(input.ctx.marca || ''), tpl.extraTags || [])

  const link = input.ctx.link_catalogo || input.ctx.link_programa || input.ctx.link_curto || ''
  const full_text = assembleFullText({ headline, subtitle, body, hashtags, cta, link }, input.destination)

  return {
    destination: input.destination,
    kit: input.kit,
    seo_title,
    headline,
    subtitle,
    body,
    hashtags,
    cta,
    image_url: input.imageUrl || null,
    image_aspect: dest.imageAspect,
    full_text,
    char_count: full_text.length,
    max_chars: dest.maxChars,
  }
}

export function mergeSharePack(base: SharePackContent, patch: Partial<SharePackContent>): SharePackContent {
  const dest = getShareDestination(base.destination)
  const merged = { ...base, ...patch }
  merged.full_text = assembleFullText({
    headline: merged.headline,
    subtitle: merged.subtitle,
    body: merged.body,
    hashtags: merged.hashtags,
    cta: merged.cta,
    link: merged.body.includes('http') ? '' : undefined,
  }, base.destination)
  merged.char_count = merged.full_text.length
  merged.max_chars = dest.maxChars
  return merged
}