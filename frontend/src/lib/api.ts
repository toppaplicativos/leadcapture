import { storeSlug } from './store-context'

const API_BASE = `/api/storefront/public/stores/${encodeURIComponent(storeSlug)}`

export interface Product {
  id: string
  name: string
  slug?: string
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
  items: { product_id: string; quantity: number }[]
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
