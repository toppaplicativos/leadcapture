import { storeSlug } from './store-context'

const API_BASE = `/api/storefront/public/stores/${encodeURIComponent(storeSlug)}`

export type OfferCta =
  | 'buy'
  | 'quote'
  | 'whatsapp'
  | 'schedule'
  | 'visit'
  | 'simulate'
  | 'subscribe'
  | 'custom'

export interface Product {
  id: string
  name: string
  slug?: string
  subtitle?: string
  description?: string
  price: number
  compare_at_price?: number
  image?: string
  images?: string[]
  images_json?: string
  category?: string
  category_name?: string
  sku?: string
  weight?: string
  weight_unit?: string
  unit?: string
  stock?: number | string
  /* OfferEntity (Fase 0+3) */
  type?: string
  cta_type?: OfferCta
  attributes?: Record<string, any>
  seo?: Record<string, any>
  media?: Record<string, any>
  pipeline_id?: string | null
  /* Product relations (Fase 6) — IDs of related storefront products */
  related_product_ids?: string[]
  /* Bundle items (Fase 11) — items already translated to storefront IDs */
  bundle_items?: Array<{ product_id: string; quantity: number; optional?: boolean; note?: string }>

  /* Service config (Fase 5) */
  service_config?: {
    duration_minutes?: number
    buffer_minutes?: number
    max_per_slot?: number
    weekday_hours?: Array<{ weekday: number; start: string; end: string }>
    requires_address?: boolean
    advance_notice_hours?: number
    max_advance_days?: number
  }
  /* Configurator (Fase 4) */
  configurator?: {
    enabled?: boolean
    groups?: Array<{
      id: string
      name: string
      required?: boolean
      min_select?: number
      max_select?: number
      options: Array<{
        id: string
        name: string
        price_delta?: number
        description?: string
        is_active?: boolean
      }>
    }>
  }
  /* Inventory (Fase 12) — null = ilimitado; status drives badges + CTA gating */
  stock_quantity?: number | null
  stock_status?: 'in_stock' | 'low_stock' | 'out_of_stock' | 'unlimited'
  stock_threshold_low?: number
}

export interface ConfiguratorSelection {
  group_id: string
  option_ids: string[]
}

export interface StoreData {
  store: {
    name: string
    brand?: {
      name?: string
      slogan?: string
      description?: string
      logo_url?: string
      primary_color?: string
      secondary_color?: string
      address?: string
      whatsapp_phone?: string
    }
    theme?: {
      logo_url?: string
      primary_color?: string
      secondary_color?: string
    }
    profile?: {
      address?: string
      delivery_fee?: number
      delivery_radius_km?: number
      status?: string
      cover_image?: string
    }
  }
  all_products: Product[]
}

export interface Order {
  order_number: string
  status: string
  total: number
  payment_method?: string
  created_at?: string
  customer_phone?: string
  customer_id?: string
  items?: OrderItem[]
}

export interface OrderItem {
  name: string
  quantity: number
  unit_price: number
}

export interface TimelineEvent {
  event_type: string
  status_after?: string
  created_at?: string
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  const data = await res.json()
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Erro na requisição')
  }
  return data
}

export function fetchCatalog(): Promise<StoreData & { success: boolean }> {
  return apiFetch(`${API_BASE}/catalog`)
}

export function fetchProduct(productSlug: string): Promise<{ success: boolean; product: Product }> {
  return apiFetch(`${API_BASE}/products/${encodeURIComponent(productSlug)}`)
}

export function createOrder(payload: {
  items: {
    product_id: string
    quantity: number
    variant_id?: string
    variant_name?: string
    variant_attributes?: Record<string, any>
    configurator_selections?: ConfiguratorSelection[]
  }[]
  customer: {
    name: string
    phone: string
    email: string
    address?: { text?: string; establishment_name?: string }
  }
  payment_method: string
  notes?: string
}): Promise<{ success: boolean; order: Order; checkout_url?: string }> {
  return apiFetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function trackOrder(
  orderNumber: string,
  phone: string,
): Promise<{ success: boolean; order: Order; timeline: TimelineEvent[] }> {
  return apiFetch(
    `${API_BASE}/orders/track?order_number=${encodeURIComponent(orderNumber)}&phone=${encodeURIComponent(phone)}`,
  )
}

export function fetchOrderHistory(params: {
  email?: string
  customer_name?: string
  phone?: string
}): Promise<{ success: boolean; orders: Order[] }> {
  const q = new URLSearchParams()
  if (params.email) q.set('email', params.email)
  if (params.customer_name) q.set('customer_name', params.customer_name)
  if (params.phone) q.set('phone', params.phone)
  return apiFetch(`${API_BASE}/orders/history?${q.toString()}`)
}

export interface LeadCapturePayload {
  name: string
  phone?: string
  email?: string
  message?: string
  product_id?: string
  product_name?: string
  cta_type?: OfferCta
}

export function captureLead(payload: LeadCapturePayload): Promise<{
  success: boolean
  lead: { id: string | number; status: string; cta_type: string }
}> {
  return apiFetch(`${API_BASE}/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export interface ServiceSlot {
  start: string
  end: string
  label: string
  capacity: number
  available: number
}

export function fetchAvailability(productId: string, dateYYYYMMDD: string): Promise<{
  success: boolean
  date: string
  slots: ServiceSlot[]
  reason?: string
}> {
  const q = new URLSearchParams({ product_id: productId, date: dateYYYYMMDD })
  return apiFetch(`${API_BASE}/availability?${q.toString()}`)
}

export interface BookingPayload {
  product_id: string
  start_at: string
  end_at: string
  name: string
  phone?: string
  email?: string
  message?: string
  address?: string
}

export function createBooking(payload: BookingPayload): Promise<{
  success: boolean
  booking: { customer_id: string | number; product_id: string; start_at: string; end_at: string; status: string }
}> {
  return apiFetch(`${API_BASE}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
