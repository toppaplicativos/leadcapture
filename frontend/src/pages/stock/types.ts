export type ViewKey =
  | 'overview'
  | 'products'
  | 'movements'
  | 'expedition'
  | 'alerts'
  | 'reports'
  | 'clients'

export type ShowToast = (t: string, tp?: 'success' | 'error') => void

export interface InventoryProduct {
  product_id?: string
  id?: string
  product_name?: string
  name?: string
  product_image?: string
  image_url?: string
  imageUrl?: string
  image?: string
  product_unit?: string
  unit?: string
  product_type?: string
  product_price?: number
  price?: number
  product_sku?: string
  sku?: string
  cost_price?: number
  stock_available?: number
  stock_current?: number
  stock_reserved?: number
  stock_min?: number
  status?: string
  promo_price?: number
  promoPrice?: number
  description?: string
  category?: string
  active?: boolean
  is_active?: boolean
  features?: string[] | string
}

export interface Movement {
  product_id?: string
  product_name?: string
  quantity?: number
  type?: string
  source?: string
  reason?: string
  created_at?: string
}

export interface Expedition {
  order_id?: string
  expedition_date?: string
  items_count?: number
  total_units?: number
}

export interface AlertItem {
  product_id?: string
  product_name?: string
  alert_type?: string
  stock_available?: number
  stock_min?: number
}

export interface Category {
  id: string
  name: string
}

export interface PendingOrder {
  id: string
  customer_name?: string
  customer_phone?: string
  status_pedido?: string
  total?: number
  valor_total?: number
  created_at?: string
  items_count?: number
  already_expedited?: boolean
}
