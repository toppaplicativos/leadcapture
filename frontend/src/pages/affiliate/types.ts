export type AppContext = {
  brand: {
    id?: string
    slug?: string
    name?: string
    logo_url?: string
    primary_color?: string
    secondary_color?: string
    slogan?: string
    primary_domain?: string | null
  }
  affiliate: {
    id?: string
    code?: string
    coupon_code?: string
    display_name?: string
    phone?: string
    document?: string
    pix_key?: string
    region?: string
    city?: string
    bio?: string
    avatar_url?: string
    email?: string
    social_instagram?: string
    social_whatsapp?: string
    status?: string
  } | null
  program: {
    min_withdrawal?: number
    payment_days?: number
    default_commission_pct?: number
    default_commission_mode?: string
    default_commission_value?: number
    commission_rules?: string | null
    share_title?: string | null
    share_description?: string | null
    share_image_url?: string | null
    promotion_tone?: string | null
  }
  commission?: {
    mode?: string
    value?: number
    label?: string
    description?: string
    rules?: string | null
    source?: 'affiliate' | 'program'
  } | null
  refresh: () => void | Promise<void>
  cacheVersion: number
  primary: string
  secondary: string
  showToast: (msg: string, type?: 'ok' | 'err') => void
}
