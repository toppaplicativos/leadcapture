import type { CSSProperties } from 'react'

export type StorePageScope = 'all' | 'home_only' | 'product_only'

/** Formato visual do botão flutuante. */
export type WaBtnShape = 'circle' | 'rounded' | 'pill'
/** Tamanho do botão. */
export type WaBtnSize = 'sm' | 'md' | 'lg'
/** Preset de cor (custom libera color pickers). */
export type WaBtnColorPreset = 'whatsapp' | 'brand' | 'dark' | 'soft' | 'outline' | 'custom'
/** Efeitos de atenção. */
export type WaBtnEffect = 'none' | 'shadow' | 'pulse' | 'glow'
/** Conteúdo: só ícone, ícone+texto ou só texto. */
export type WaBtnContent = 'icon' | 'icon_text' | 'text'

export type StoreWhatsAppButtonDesign = {
  shape: WaBtnShape
  size: WaBtnSize
  color_preset: WaBtnColorPreset
  bg_color: string
  text_color: string
  border_color: string
  effect: WaBtnEffect
  content: WaBtnContent
  label: string
}

export type StoreMarketingWhatsApp = {
  enabled: boolean
  show_in_hero: boolean
  show_fab: boolean
  fab_position: 'bottom-right' | 'bottom-left'
  prefilled_message: string
  show_on_pages: StorePageScope
  button: StoreWhatsAppButtonDesign
  /** @deprecated legado — migrado em normalize */
  button_style?: string
  fab_size?: string
  fab_show_label?: boolean
}

export type PublicStoreMarketing = {
  whatsapp?: Partial<StoreMarketingWhatsApp> | null
  announcement_bar?: {
    enabled?: boolean
    text?: string
    link_url?: string | null
    dismissible?: boolean
  } | null
  trust_strip?: {
    enabled?: boolean
    items?: Array<{ id?: string; label?: string }>
  } | null
  conversion?: {
    show_best_sellers?: boolean
    best_sellers_title?: string
    best_sellers_limit?: number
    show_product_badges?: boolean
    sticky_atc?: boolean
    show_pdp_trust?: boolean
    cart_drawer?: boolean
    cart_upsell?: boolean
    urgency_low_stock?: boolean
    promo_ends_at?: string | null
    promo_label?: string
  } | null
  /** Card "Instalar app" no catálogo (whitelabel) — copy e toggles da marca */
  pwa_install?: {
    enabled?: boolean
    title?: string
    subtitle?: string
    benefit_1?: string
    benefit_2?: string
    benefit_3?: string
    benefit_4?: string
    cta_label?: string
    dismiss_label?: string
  } | null
}

export const WA_GREEN = '#25D366'
export const WA_GREEN_DARK = '#128C7E'
export const WA_SOFT_BG = '#ECFDF5'
export const WA_SOFT_TEXT = '#047857'

export const DEFAULT_BUTTON_DESIGN: StoreWhatsAppButtonDesign = {
  shape: 'circle',
  size: 'md',
  color_preset: 'whatsapp',
  bg_color: WA_GREEN,
  text_color: '#FFFFFF',
  border_color: WA_GREEN,
  effect: 'shadow',
  content: 'icon',
  label: 'Chamar no WhatsApp',
}

export const DEFAULT_WHATSAPP_MARKETING: StoreMarketingWhatsApp = {
  enabled: false,
  /** Chip no card da capa gera redundância com FAB — desligado por padrão. */
  show_in_hero: false,
  show_fab: true,
  fab_position: 'bottom-right',
  prefilled_message: 'Olá! Vim pelo catálogo e gostaria de mais informações.',
  show_on_pages: 'all',
  button: { ...DEFAULT_BUTTON_DESIGN },
}

export const WA_SHAPE_OPTIONS: { id: WaBtnShape; label: string; hint: string }[] = [
  { id: 'circle', label: 'Círculo', hint: 'FAB clássico' },
  { id: 'rounded', label: 'Arredondado', hint: 'Cantos suaves' },
  { id: 'pill', label: 'Pílula', hint: 'Alongado' },
]

export const WA_SIZE_OPTIONS: { id: WaBtnSize; label: string }[] = [
  { id: 'sm', label: 'Pequeno' },
  { id: 'md', label: 'Médio' },
  { id: 'lg', label: 'Grande' },
]

export const WA_COLOR_OPTIONS: { id: WaBtnColorPreset; label: string; swatch: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp', swatch: WA_GREEN },
  { id: 'brand', label: 'Marca', swatch: 'var(--brand-primary, #111827)' },
  { id: 'dark', label: 'Escuro', swatch: '#0f172a' },
  { id: 'soft', label: 'Suave', swatch: WA_SOFT_BG },
  { id: 'outline', label: 'Contorno', swatch: '#ffffff' },
  { id: 'custom', label: 'Personalizado', swatch: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' },
]

export const WA_EFFECT_OPTIONS: { id: WaBtnEffect; label: string; hint: string }[] = [
  { id: 'none', label: 'Nenhum', hint: 'Sem sombra extra' },
  { id: 'shadow', label: 'Sombra', hint: 'Elevação suave' },
  { id: 'pulse', label: 'Pulso', hint: 'Animação de atenção' },
  { id: 'glow', label: 'Brilho', hint: 'Halo colorido' },
]

export const WA_CONTENT_OPTIONS: { id: WaBtnContent; label: string; hint: string }[] = [
  { id: 'icon', label: 'Só ícone', hint: 'Compacto' },
  { id: 'icon_text', label: 'Ícone + texto', hint: 'Mais claro' },
  { id: 'text', label: 'Só texto', hint: 'Sem ícone' },
]

function isHexColor(v: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(String(v || '').trim())
}

function safeColor(v: string | undefined | null, fallback: string): string {
  const s = String(v || '').trim()
  if (isHexColor(s)) return s
  return fallback
}

/** Migra presets legados (button_style) para o novo modelo. */
function migrateLegacyButton(src: Partial<StoreMarketingWhatsApp>): Partial<StoreWhatsAppButtonDesign> {
  const legacy = String(src.button_style || '').trim()
  if (!legacy) {
    const size = src.fab_size === 'lg' ? 'lg' : src.fab_size === 'sm' ? 'sm' : undefined
    const content =
      src.fab_show_label === false ? 'icon' : src.fab_show_label === true ? 'icon_text' : undefined
    return {
      ...(size ? { size } : {}),
      ...(content ? { content } : {}),
    }
  }

  const base: Partial<StoreWhatsAppButtonDesign> = {
    size: src.fab_size === 'lg' ? 'lg' : 'md',
    content: src.fab_show_label === false ? 'icon' : 'icon_text',
    shape: src.fab_show_label === false ? 'circle' : 'pill',
  }

  switch (legacy) {
    case 'soft':
      return { ...base, color_preset: 'soft', effect: 'shadow' }
    case 'outline':
      return { ...base, color_preset: 'outline', effect: 'shadow' }
    case 'brand':
      return { ...base, color_preset: 'brand', effect: 'shadow' }
    case 'gradient':
      return { ...base, color_preset: 'whatsapp', effect: 'glow' }
    case 'dark':
      return { ...base, color_preset: 'dark', effect: 'shadow' }
    case 'pulse':
      return { ...base, color_preset: 'whatsapp', effect: 'pulse', shape: 'circle', content: 'icon' }
    case 'classic':
    default:
      return { ...base, color_preset: 'whatsapp', effect: 'shadow' }
  }
}

export function normalizeButtonDesign(
  input?: Partial<StoreWhatsAppButtonDesign> | null,
  legacyParent?: Partial<StoreMarketingWhatsApp> | null,
): StoreWhatsAppButtonDesign {
  const migrated = legacyParent ? migrateLegacyButton(legacyParent) : {}
  const src = { ...migrated, ...(input || {}) }

  const shape = (['circle', 'rounded', 'pill'] as const).includes(src.shape as WaBtnShape)
    ? (src.shape as WaBtnShape)
    : DEFAULT_BUTTON_DESIGN.shape
  const size = (['sm', 'md', 'lg'] as const).includes(src.size as WaBtnSize)
    ? (src.size as WaBtnSize)
    : DEFAULT_BUTTON_DESIGN.size
  const color_preset = (
    ['whatsapp', 'brand', 'dark', 'soft', 'outline', 'custom'] as const
  ).includes(src.color_preset as WaBtnColorPreset)
    ? (src.color_preset as WaBtnColorPreset)
    : DEFAULT_BUTTON_DESIGN.color_preset
  const effect = (['none', 'shadow', 'pulse', 'glow'] as const).includes(src.effect as WaBtnEffect)
    ? (src.effect as WaBtnEffect)
    : DEFAULT_BUTTON_DESIGN.effect
  let content = (['icon', 'icon_text', 'text'] as const).includes(src.content as WaBtnContent)
    ? (src.content as WaBtnContent)
    : DEFAULT_BUTTON_DESIGN.content

  // Círculo força só ícone (nativo / FAB)
  if (shape === 'circle' && content === 'text') content = 'icon'
  if (shape === 'circle' && content === 'icon_text') content = 'icon'

  const label = String(src.label || DEFAULT_BUTTON_DESIGN.label).trim().slice(0, 40)
    || DEFAULT_BUTTON_DESIGN.label

  return {
    shape,
    size,
    color_preset,
    bg_color: safeColor(src.bg_color, DEFAULT_BUTTON_DESIGN.bg_color),
    text_color: safeColor(src.text_color, DEFAULT_BUTTON_DESIGN.text_color),
    border_color: safeColor(src.border_color, DEFAULT_BUTTON_DESIGN.border_color),
    effect,
    content,
    label,
  }
}

export function normalizeWhatsAppMarketing(
  input?: Partial<StoreMarketingWhatsApp> | null,
): StoreMarketingWhatsApp {
  const src = input || {}
  return {
    enabled: src.enabled === true,
    // Default false: WhatsApp fica no FAB, não no card de identidade
    show_in_hero: src.show_in_hero === true,
    // Default true — CTA principal no mobile
    show_fab: src.show_fab === undefined ? true : src.show_fab === true,
    fab_position: src.fab_position === 'bottom-left' ? 'bottom-left' : 'bottom-right',
    prefilled_message: String(src.prefilled_message || DEFAULT_WHATSAPP_MARKETING.prefilled_message).trim(),
    show_on_pages: (['all', 'home_only', 'product_only'] as const).includes(src.show_on_pages as StorePageScope)
      ? (src.show_on_pages as StorePageScope)
      : 'all',
    button: normalizeButtonDesign(src.button, src),
  }
}

export type ResolvedButtonVisual = {
  className: string
  style: CSSProperties
  showIcon: boolean
  showLabel: boolean
  label: string
  iconSize: number
  /** Cores resolvidas (para chip / prévia). */
  bg: string
  color: string
  border: string
}

/** Resolve cores + classes a partir do design — única fonte de verdade. */
export function resolveButtonVisual(
  design: StoreWhatsAppButtonDesign,
  opts?: { brandPrimary?: string; variant?: 'fab' | 'chip' | 'preview' },
): ResolvedButtonVisual {
  const variant = opts?.variant || 'fab'
  const brand = String(opts?.brandPrimary || '').trim() || 'var(--brand-primary, #111827)'

  let bg = WA_GREEN
  let color = '#FFFFFF'
  let border = 'transparent'

  switch (design.color_preset) {
    case 'brand':
      bg = brand
      color = '#FFFFFF'
      border = 'transparent'
      break
    case 'dark':
      bg = '#0f172a'
      color = '#FFFFFF'
      border = 'transparent'
      break
    case 'soft':
      bg = WA_SOFT_BG
      color = WA_SOFT_TEXT
      border = '#A7F3D0'
      break
    case 'outline':
      bg = '#FFFFFF'
      color = WA_GREEN_DARK
      border = WA_GREEN
      break
    case 'custom':
      bg = design.bg_color
      color = design.text_color
      border = design.border_color
      break
    case 'whatsapp':
    default:
      bg = WA_GREEN
      color = '#FFFFFF'
      border = 'transparent'
      break
  }

  const sizeMap = {
    sm: { padX: 10, padY: 10, icon: 18, font: 12, minH: 44 },
    md: { padX: 12, padY: 12, icon: 22, font: 13, minH: 52 },
    lg: { padX: 14, padY: 14, icon: 26, font: 14, minH: 60 },
  } as const
  const s = sizeMap[design.size] || sizeMap.md

  const showIcon = design.content !== 'text'
  const showLabel = design.content !== 'icon' && design.shape !== 'circle'

  const radius =
    design.shape === 'circle' ? '9999px' : design.shape === 'pill' ? '9999px' : '14px'

  const isCircle = design.shape === 'circle' || (!showLabel && design.shape !== 'rounded')
  const width = isCircle && !showLabel ? `${s.minH}px` : undefined
  const height = `${s.minH}px`

  let boxShadow = 'none'
  if (design.effect === 'shadow') {
    boxShadow = `0 8px 24px color-mix(in srgb, ${bg} 38%, transparent), 0 2px 6px rgba(15,23,42,0.12)`
  } else if (design.effect === 'glow') {
    boxShadow = `0 0 0 4px color-mix(in srgb, ${bg} 22%, transparent), 0 10px 28px color-mix(in srgb, ${bg} 40%, transparent)`
  } else if (design.effect === 'pulse') {
    boxShadow = `0 8px 22px color-mix(in srgb, ${bg} 32%, transparent)`
  }

  const classes = [
    'store-wa-btn',
    variant === 'fab' ? 'store-wa-btn--fab' : '',
    variant === 'chip' ? 'store-wa-btn--chip' : '',
    variant === 'preview' ? 'store-wa-btn--preview' : '',
    design.effect === 'pulse' ? 'store-wa-btn--pulse' : '',
    showLabel ? 'store-wa-btn--with-label' : 'store-wa-btn--icon-only',
    `store-wa-btn--${design.shape}`,
    `store-wa-btn--size-${design.size}`,
  ]
    .filter(Boolean)
    .join(' ')

  const style: CSSProperties = {
    background: bg,
    color,
    borderColor: border === 'transparent' ? 'transparent' : border,
    borderWidth: border === 'transparent' ? 0 : variant === 'chip' ? 1.5 : 2,
    borderStyle: 'solid',
    borderRadius: radius,
    boxShadow: variant === 'chip' && design.effect === 'none' ? 'none' : boxShadow,
    minHeight: variant === 'chip' ? undefined : height,
    width: (variant === 'fab' || variant === 'preview') && isCircle && !showLabel ? width : undefined,
    height: (variant === 'fab' || variant === 'preview') && isCircle && !showLabel ? height : undefined,
    paddingLeft: showLabel ? s.padX + 4 : isCircle ? 0 : s.padX,
    paddingRight: showLabel ? s.padX + 6 : isCircle ? 0 : s.padX,
    paddingTop: showLabel ? 10 : 0,
    paddingBottom: showLabel ? 10 : 0,
    fontSize: s.font,
    // CSS vars for pulse ring color
    ['--wa-btn-bg' as string]: bg,
    ['--wa-btn-fg' as string]: color,
  }

  return {
    className: classes,
    style,
    showIcon,
    showLabel,
    label: design.label,
    iconSize: variant === 'chip' ? 12 : s.icon,
    bg,
    color,
    border,
  }
}

export type ResolvedPublicWhatsApp = {
  phone: string
  showInHero: boolean
  showFab: boolean
  fabPosition: 'bottom-right' | 'bottom-left'
  prefilledMessage: string
  button: StoreWhatsAppButtonDesign
}

/**
 * Resolve WhatsApp público.
 * Chip no card da capa fica off por padrão (evita frete/WA duplicados).
 * FAB flutuante é o CTA principal.
 */
export function resolvePublicWhatsApp(
  marketing: PublicStoreMarketing | undefined | null,
  phone: string | undefined | null,
  page: 'home' | 'product' | 'checkout' | 'other' = 'home',
): ResolvedPublicWhatsApp | null {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return null

  const hasMarketingBlock = Boolean(marketing?.whatsapp)
  const wa = normalizeWhatsAppMarketing(marketing?.whatsapp)

  const enabled = hasMarketingBlock ? wa.enabled : true
  if (!enabled) return null

  const scope = wa.show_on_pages
  const pageAllowed =
    scope === 'all' ||
    (scope === 'home_only' && page === 'home') ||
    (scope === 'product_only' && page === 'product')
  if (!pageAllowed) return null

  // Sem bloco marketing: só FAB (sem chip no card)
  const showInHero = hasMarketingBlock ? wa.show_in_hero : false
  const showFab = hasMarketingBlock ? wa.show_fab : true
  if (!showInHero && !showFab) return null

  return {
    phone: digits,
    showInHero,
    showFab,
    fabPosition: wa.fab_position,
    prefilledMessage: wa.prefilled_message,
    button: wa.button,
  }
}

export function buildWhatsAppUrl(phone: string, message?: string): string {
  const digits = String(phone || '').replace(/\D/g, '')
  const base = `https://wa.me/${digits}`
  const text = String(message || '').trim()
  if (!text) return base
  return `${base}?text=${encodeURIComponent(text)}`
}

export type StoreMarketingPage = 'home' | 'product' | 'checkout' | 'other'
