export type CouponRow = {
  id: string
  code: string
  description: string | null
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  min_subtotal: number | null
  max_discount_cap: number | null
  applies_to: 'all' | 'category' | 'product' | 'collection'
  starts_at: string | null
  expires_at: string | null
  usage_limit_total: number | null
  usage_limit_per_customer: number | null
  used_count: number
  active: boolean
}

export type ReviewRow = {
  id: string
  product_id: string
  customer_name: string
  customer_phone: string | null
  rating: number
  comment: string | null
  verified_purchase: boolean
  order_id: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}