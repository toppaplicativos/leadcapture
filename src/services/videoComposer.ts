import { GeminiService } from './gemini'
import { aiRouter } from './aiRouter'
import { integrationService } from './integrations'
import { query } from '../config/database'

export interface ColorScheme {
  primary: string
  accent: string
  background: string
  text: string
  textSecondary: string
}

export interface SlideItem {
  title: string
  subtitle?: string
  body?: string
  imageUrl?: string
  highlightColor?: string
}

export interface BrandPromoProps {
  brandName: string
  tagline?: string
  logoUrl?: string
  colors: ColorScheme
  slides: SlideItem[]
  ctaText?: string
  ctaSubtext?: string
  fps?: number
}

export interface ProductShowcaseProps {
  brandName: string
  colors: ColorScheme
  products: Array<{
    name: string
    description?: string
    price?: string
    imageUrl?: string
    badge?: string
  }>
  ctaText?: string
  ctaSubtext?: string
  fps?: number
}

export interface StoryReelProps {
  brandName: string
  colors: ColorScheme
  slides: SlideItem[]
  ctaText?: string
  logoUrl?: string
  fps?: number
}

export type TemplateId = 'BrandPromo' | 'ProductShowcase' | 'StoryReel' | 'CinematicReveal' | 'KineticTypography' | 'NeonGlow'

export interface VideoCompositionSpec {
  template: TemplateId
  props: BrandPromoProps | ProductShowcaseProps | StoryReelProps
  durationInFrames: number
  fps: number
  width: number
  height: number
}

interface BrandContext {
  name: string
  tagline?: string
  logoUrl?: string
  primaryColor?: string
  accentColor?: string
  products?: Array<{ name: string; description?: string; price?: number; imageUrl?: string }>
}

async function fetchBrandContext(userId: string, brandId?: string): Promise<BrandContext> {
  try {
    const rows = await query<any>(
      `SELECT b.name, b.logo_url, b.primary_color, b.accent_color, b.tagline
       FROM brands b
       WHERE b.user_id = ? ${brandId ? 'AND b.id = ?' : ''}
       LIMIT 1`,
      brandId ? [userId, brandId] : [userId]
    )
    const brand = rows[0]
    if (!brand) return { name: 'Minha Marca' }

    let products: BrandContext['products'] = []
    if (brand.id || brandId) {
      const bId = brandId || brand.id
      const productRows = await query<any>(
        `SELECT name, description, price, image_url FROM products WHERE brand_id = ? AND active = 1 LIMIT 10`,
        [bId]
      )
      products = productRows.map((p: any) => ({
        name: p.name,
        description: p.description,
        price: p.price,
        imageUrl: p.image_url,
      }))
    }

    return {
      name: brand.name || 'Minha Marca',
      tagline: brand.tagline,
      logoUrl: brand.logo_url,
      primaryColor: brand.primary_color,
      accentColor: brand.accent_color,
      products,
    }
  } catch {
    return { name: 'Minha Marca' }
  }
}

function buildColorsFromBrand(brand: BrandContext): ColorScheme {
  const primary = brand.primaryColor || '#1a1a2e'
  const accent = brand.accentColor || '#e94560'

  // derive dark background from primary
  const isDark = isColorDark(primary)
  return {
    primary,
    accent,
    background: isDark ? darken(primary, 0.3) : '#16213e',
    text: '#ffffff',
    textSecondary: '#a0aec0',
  }
}

function isColorDark(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 < 128
}

function darken(hex: string, amount: number): string {
  const r = Math.max(0, Math.floor(parseInt(hex.slice(1, 3), 16) * (1 - amount)))
  const g = Math.max(0, Math.floor(parseInt(hex.slice(3, 5), 16) * (1 - amount)))
  const b = Math.max(0, Math.floor(parseInt(hex.slice(5, 7), 16) * (1 - amount)))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

const SYSTEM_PROMPT = `Você é um diretor criativo especializado em motion graphics e vídeos promocionais profissionais para marcas brasileiras.
Sua única saída é um JSON válido — sem explicações, sem markdown, sem texto fora do JSON.

══════════════════════════════════════════════════════════
TEMPLATES DISPONÍVEIS — ESCOLHA COM CRITÉRIO
══════════════════════════════════════════════════════════

1. BrandPromo [16:9 · 1920×1080 · 20-35s]
   Estrutura narrativa: Intro (logo + nome animados) → 2-4 slides de conteúdo → CTA impactante.
   Use para: apresentação institucional, serviços, diferenciais, "sobre a empresa".
   Cada slide tem title (curto, impactante), subtitle (complemento em destaque), body (frase de apoio opcional).
   O CTA fecha como chamada à ação com urgência.

2. ProductShowcase [16:9 · 1920×1080 · 15-30s]
   Estrutura: Intro da marca → 1-4 produtos com imagem, preço animado, badge → CTA de compra.
   Use para: e-commerce, promoções relâmpago, lançamento de produto, cardápio digital.
   Cada produto DEVE ter name, description concisa, price formatado ("R$ 99,90"), badge ("Novidade", "Promoção", "Mais Vendido").

3. StoryReel [9:16 · 1080×1920 · 12-20s]
   Estrutura: 3-4 slides rápidos com barra de progresso animada → CTA final vibrante.
   Use para: Instagram Stories, Reels, TikTok, WhatsApp Status.
   Cada slide é uma frase de impacto — curta, direta, máx 4 palavras no title.
   O CTA final é o fechamento da "história" com ação clara.

4. CinematicReveal [16:9 · 1920×1080 · 18-28s]
   Estrutura: Hero cinematográfico (título word-by-word com film grain + letterbox) → Linhas de texto reveladas → CTA dramático.
   Use para: lançamentos premium, marcas de luxo, eventos especiais, "big reveals".
   title é a frase principal de impacto máximo (máx 4 palavras). textLines são 3-4 frases ou valores revelados progressivamente.
   Cores: background próximo de #000, accent deve ser dramaticamente contrastante (violeta, dourado, vermelho vivo).

5. KineticTypography [16:9 · 1920×1080 · 14-22s]
   Estrutura: Intro com headline em destaque → Palavras cinematéticas voam de direções opostas → CTA explosivo.
   Use para: marcas jovens, tech, startups, agências criativas, produtos de lifestyle.
   words são 6-10 substantivos/verbos de impacto (1-2 palavras cada). accentWords são 2-3 palavras do array words para destacar com cor e barra animada.
   O CTA explode com letra por letra numa tela de cor sólida.

6. NeonGlow [16:9 · 1920×1080 · 14-22s]
   Estrutura: Intro neon com glow pulsante → Linhas de conteúdo tipo terminal → CTA neon dentro de moldura brilhante.
   Use para: academia/fitness, gaming, baladas/eventos, tech/startup, marcas jovens e urbanas.
   slides são linhas de terminal progressivas — max 8 palavras cada. 1-2 linhas com highlight:true (tamanho "large"), restantes "medium" ou "small".
   accentColor DEVE ser neon vivo: #00ffcc, #ff2d78, #00ff88, #7b2fff, #ff6b00.

══════════════════════════════════════════════════════════
REGRAS DE SELEÇÃO DE TEMPLATE
══════════════════════════════════════════════════════════
- "para Instagram/Stories/Reels/TikTok/WhatsApp" → StoryReel
- "produtos/promoção/preço/e-commerce/cardápio/vitrine" → ProductShowcase
- "luxo/premium/lançamento épico/cinema/apresentação especial" → CinematicReveal
- "academia/gaming/boate/evento/neon/tech/urbano" → NeonGlow
- "criativo/startup/agência/impacto/dinâmico/jovem" → KineticTypography
- default / institucional / serviços / restaurante / loja → BrandPromo

══════════════════════════════════════════════════════════
REGRAS ABSOLUTAS DE CONTEÚDO
══════════════════════════════════════════════════════════
COPYWRITING:
- Titles: máx 5 palavras, direto e provocativo (ex: "Sabor que transforma", "Poder real agora")
- Subtitles: complemento em 3-6 palavras (ex: "Feito para quem exige mais")
- Body: frase de apoio em 8-15 palavras
- CTA: verbo de ação + urgência ("Peça agora", "Garanta o seu", "Entre em contato")
- ctaSubtext: detalhe que reduz fricção ("Via WhatsApp", "Entrega hoje", "Frete grátis")
- Para NeonGlow e CinematicReveal: use letras maiúsculas estrategicamente para impacto

CORES — HARMONIA OBRIGATÓRIA:
- background: sempre escuro (#0a0a0a a #1e293b). NUNCA branco ou cinza claro.
- text: sempre #ffffff ou off-white claro
- primary: cor dominante da marca ou derivada do background
- accent: cor vibrante e contrastante — define a personalidade (não pode ser igual ao background)
- textSecondary: versão opaca do text (#a0aec0, #94a3b8, #64748b)
- Paletas recomendadas por segmento:
  - Fitness/Saúde: primary #1a0a2e, accent #ff2d78, background #0d0016
  - Tech/SaaS: primary #0f172a, accent #6366f1, background #020617
  - Food/Restaurante: primary #1a0a00, accent #f97316, background #0d0600
  - Beleza/Moda: primary #1a0018, accent #e879f9, background #0d0010
  - Esporte/Outdoor: primary #001a0f, accent #10b981, background #000d07

══════════════════════════════════════════════════════════
FORMATO DE SAÍDA — APENAS JSON PURO, SEM NADA MAIS
══════════════════════════════════════════════════════════

BrandPromo (TODOS os campos obrigatórios):
{
  "template": "BrandPromo",
  "props": {
    "brandName": "Nome Completo da Marca",
    "tagline": "Slogan impactante em até 6 palavras",
    "colors": { "primary": "#1a1a2e", "accent": "#e94560", "background": "#16213e", "text": "#ffffff", "textSecondary": "#a0aec0" },
    "slides": [
      { "title": "Título Slide 1", "subtitle": "Subtítulo chamativo", "body": "Texto de suporte com benefício claro." },
      { "title": "Título Slide 2", "subtitle": "Outro subtítulo", "body": "Segunda razão para confiar na marca." },
      { "title": "Diferenciais Únicos", "subtitle": "Acima da concorrência" }
    ],
    "ctaText": "Fale Agora",
    "ctaSubtext": "Pelo WhatsApp ou loja física"
  }
}

ProductShowcase (TODOS os campos obrigatórios):
{
  "template": "ProductShowcase",
  "props": {
    "brandName": "Nome da Marca",
    "colors": { "primary": "#1a1a2e", "accent": "#e94560", "background": "#16213e", "text": "#ffffff", "textSecondary": "#a0aec0" },
    "products": [
      { "name": "Nome do Produto", "description": "Benefício principal em uma frase.", "price": "R$ 99,90", "badge": "Mais Vendido" },
      { "name": "Segundo Produto", "description": "Por que é especial.", "price": "R$ 149,90", "badge": "Novidade" }
    ],
    "ctaText": "Compre Agora",
    "ctaSubtext": "Entrega para todo o Brasil"
  }
}

StoryReel (TODOS os campos obrigatórios):
{
  "template": "StoryReel",
  "props": {
    "brandName": "Nome",
    "colors": { "primary": "#1a1a2e", "accent": "#e94560", "background": "#16213e", "text": "#ffffff", "textSecondary": "#a0aec0" },
    "slides": [
      { "title": "Frase de impacto", "subtitle": "TAG" },
      { "title": "Segunda frase", "body": "Detalhe rápido em até 8 palavras." },
      { "title": "Terceira frase", "subtitle": "CHAMADA" }
    ],
    "ctaText": "Arrasta pra cima"
  }
}

CinematicReveal (TODOS os campos obrigatórios):
{
  "template": "CinematicReveal",
  "props": {
    "title": "TÍTULO PRINCIPAL",
    "subtitle": "Subtítulo elegante e provocativo",
    "tagline": "APRESENTA",
    "brandName": "Nome da Marca",
    "textLines": ["Linha revelada um", "Segunda linha forte", "Terceira mensagem"],
    "ctaText": "Descubra Mais",
    "colors": { "primary": "#1a0533", "accent": "#a855f7", "background": "#0a0012", "text": "#ffffff", "textSecondary": "#a78bfa" }
  }
}

KineticTypography (TODOS os campos obrigatórios):
{
  "template": "KineticTypography",
  "props": {
    "brandName": "Nome da Marca",
    "headline": "Frase Principal de Impacto",
    "words": ["Velocidade", "Precisão", "Resultado", "Confiança", "Inovação", "Crescimento", "Poder", "Sucesso"],
    "accentWords": ["Resultado", "Inovação", "Poder"],
    "ctaText": "FAÇA PARTE",
    "colors": { "primary": "#0f172a", "accent": "#f59e0b", "background": "#0f172a", "text": "#f8fafc", "textSecondary": "#94a3b8" }
  }
}

NeonGlow (TODOS os campos obrigatórios):
{
  "template": "NeonGlow",
  "props": {
    "brandName": "NOME DA MARCA",
    "title": "TÍTULO NEON",
    "slides": [
      { "line": "Linha principal de impacto", "highlight": true, "size": "large" },
      { "line": "Segundo ponto forte", "highlight": true, "size": "medium" },
      { "line": "Detalhe operacional", "highlight": false, "size": "medium" },
      { "line": "Chamada final", "highlight": false, "size": "small" }
    ],
    "ctaText": "ACESSE AGORA",
    "accentColor": "#00ffcc",
    "colors": { "primary": "#060612", "accent": "#00ffcc", "background": "#060612", "text": "#ffffff", "textSecondary": "#64748b" }
  }
}`

const geminiService = new GeminiService()

function parseJsonBlock(text: string): any {
  const cleaned = text.trim()
  const fenced = cleaned.match(/```json\s*([\s\S]*?)\s*```/i)
  const candidate = fenced?.[1] || cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned
  return JSON.parse(candidate)
}

function dimensionsForTemplate(template: TemplateId): { width: number; height: number } {
  if (template === 'StoryReel') return { width: 1080, height: 1920 }
  return { width: 1920, height: 1080 }
}

function templateLabel(template: TemplateId): string {
  const map: Record<TemplateId, string> = {
    BrandPromo: 'Propaganda da Marca',
    ProductShowcase: 'Vitrine de Produtos',
    StoryReel: 'Story / Reels',
    CinematicReveal: 'Reveal Cinematografico',
    KineticTypography: 'Tipografia Cinetica',
    NeonGlow: 'Neon Glow',
  }
  return map[template] || template
}

function durationForSpec(spec: VideoCompositionSpec): number {
  const fps = spec.fps
  if (spec.template === 'BrandPromo') {
    const p = spec.props as BrandPromoProps
    const slides = p.slides?.length ?? 2
    return (3 + slides * 7 + 4) * fps
  }
  if (spec.template === 'ProductShowcase') {
    const p = spec.props as ProductShowcaseProps
    const products = p.products?.length ?? 2
    return (2 + products * 6 + 3) * fps
  }
  if (spec.template === 'StoryReel') {
    const p = spec.props as StoryReelProps
    const slides = p.slides?.length ?? 3
    return (slides * 4 + 3) * fps
  }
  if (spec.template === 'CinematicReveal') {
    const p = spec.props as any
    const lines = p.textLines?.length ?? 0
    const cta = p.ctaText ? 4 : 0
    return Math.round((5 + lines * 2.5 + cta) * fps)
  }
  if (spec.template === 'KineticTypography') {
    const p = spec.props as any
    const words = p.words?.length ?? 6
    const cta = p.ctaText ? 3 : 0
    return Math.round((3 + words * 0.28 + 2 + cta) * fps)
  }
  if (spec.template === 'NeonGlow') {
    const p = spec.props as any
    const slides = p.slides?.length ?? 4
    const cta = p.ctaText ? 3 : 0
    return Math.round((4 + slides * 1.5 + cta) * fps)
  }
  return 900
}

export async function composeVideoSpec(
  userMessage: string,
  userId: string,
  brandId: string | undefined,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<VideoCompositionSpec> {
  const brand = await fetchBrandContext(userId, brandId)
  const colors = buildColorsFromBrand(brand)

  const brandContext = `
Dados da marca:
- Nome: ${brand.name}
- Slogan: ${brand.tagline || 'não definido'}
- Cor principal: ${brand.primaryColor || colors.primary}
- Cor de destaque: ${brand.accentColor || colors.accent}
- Produtos disponíveis: ${brand.products?.length ? brand.products.map(p => `${p.name} (R$ ${p.price ?? '?'})`).join(', ') : 'nenhum cadastrado'}
`

  const historyText = conversationHistory.slice(-6).map(m =>
    `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`
  ).join('\n')

  const userPrompt = `${historyText ? `Histórico da conversa:\n${historyText}\n\n` : ''}${brandContext}\n\nPedido atual do usuário: ${userMessage}\n\nGere a especificação JSON do vídeo.`

  const fullPrompt = `${SYSTEM_PROMPT}\n\n---\n\n${userPrompt}`
  const responseText = (
    await aiRouter.generateText(fullPrompt, { userId, brandId }, {
      functionKey: 'text.video.spec',
      temperature: 0.8,
    })
  ).text

  const parsed = parseJsonBlock(responseText)

  // inject brand colors if not explicitly set
  if (!parsed.props.colors) {
    parsed.props.colors = colors
  }
  if (!parsed.props.brandName) {
    parsed.props.brandName = brand.name
  }
  if (!parsed.props.logoUrl && brand.logoUrl) {
    parsed.props.logoUrl = brand.logoUrl
  }

  const template: TemplateId = parsed.template || 'BrandPromo'
  const dims = dimensionsForTemplate(template)
  const fps = 30

  const spec: VideoCompositionSpec = {
    template,
    props: parsed.props,
    fps,
    width: dims.width,
    height: dims.height,
    durationInFrames: 0,
  }
  spec.durationInFrames = durationForSpec(spec)

  return spec
}

const REFINE_SYSTEM_PROMPT = `Você é um editor de vídeo que modifica especificações JSON existentes.
Sua saída é APENAS o JSON modificado — sem explicações, sem markdown, sem texto fora do JSON.

REGRAS ABSOLUTAS:
1. Preserve TODOS os campos não mencionados pelo usuário exatamente como estão.
2. Aplique APENAS as mudanças solicitadas pelo usuário.
3. Mantenha o mesmo template salvo se o usuário explicitamente pedir mudança.
4. Mantenha as mesmas cores salvo se o usuário pedir ajuste de cores.
5. O JSON de saída deve ter exatamente a mesma estrutura do JSON de entrada.
6. Textos gerados devem seguir o mesmo estilo e qualidade do original.
7. Se o usuário pedir "mais slides" ou "adicionar produto", preserve os existentes e adicione os novos.
8. Se o usuário pedir "mudar texto" ou "outro título", substitua apenas o texto mencionado.

Responda SOMENTE com o JSON completo e válido da especificação modificada.`

export async function refineVideoSpec(
  userMessage: string,
  currentSpec: VideoCompositionSpec,
  userId: string,
  brandId: string | undefined,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<VideoCompositionSpec> {
  const historyText = conversationHistory.slice(-4).map(m =>
    `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`
  ).join('\n')

  const refineUserPrompt = `${historyText ? `Histórico recente:\n${historyText}\n\n` : ''}Especificação atual do vídeo:
${JSON.stringify(currentSpec, null, 2)}

Instrução do usuário: ${userMessage}

Aplique as modificações solicitadas e retorne o JSON completo atualizado.`

  const fullPrompt = `${REFINE_SYSTEM_PROMPT}\n\n---\n\n${refineUserPrompt}`

  const responseText = (
    await aiRouter.generateText(fullPrompt, { userId, brandId }, {
      functionKey: 'text.video.spec',
      temperature: 0.6,
    })
  ).text

  const parsed = parseJsonBlock(responseText)

  // Ensure critical fields are preserved if Gemini dropped them
  if (!parsed.template) parsed.template = currentSpec.template
  if (!parsed.props) parsed.props = currentSpec.props
  if (!parsed.props.colors) parsed.props.colors = currentSpec.props.colors
  if (!parsed.props.brandName && (currentSpec.props as any).brandName) {
    parsed.props.brandName = (currentSpec.props as any).brandName
  }

  const template: TemplateId = parsed.template
  const dims = dimensionsForTemplate(template)
  const fps = 30

  const spec: VideoCompositionSpec = {
    template,
    props: parsed.props,
    fps,
    width: dims.width,
    height: dims.height,
    durationInFrames: 0,
  }
  spec.durationInFrames = durationForSpec(spec)

  return spec
}
