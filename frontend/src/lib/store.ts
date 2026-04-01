import { create } from 'zustand'
import { storeSlug } from './store-context'

/* ── Cart ── */
const cartKey = `sf_cart_${storeSlug}`

function readCart(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(cartKey) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeCart(cart: Record<string, number>) {
  localStorage.setItem(cartKey, JSON.stringify(cart))
}

interface CartState {
  items: Record<string, number>
  totalItems: () => number
  addItem: (productId: string, qty?: number) => void
  removeItem: (productId: string) => void
  updateQty: (productId: string, delta: number) => void
  clear: () => void
}

export const useCartStore = create<CartState>((set, get) => ({
  items: readCart(),

  totalItems: () =>
    Object.values(get().items).reduce((sum, qty) => sum + qty, 0),

  addItem: (productId, qty = 1) =>
    set((state) => {
      const current = state.items[productId] || 0
      const next = Math.max(1, current + Math.max(1, qty))
      const updated = { ...state.items, [productId]: next }
      writeCart(updated)
      return { items: updated }
    }),

  removeItem: (productId) =>
    set((state) => {
      const { [productId]: _, ...rest } = state.items
      writeCart(rest)
      return { items: rest }
    }),

  updateQty: (productId, delta) =>
    set((state) => {
      const current = state.items[productId] || 1
      const next = Math.max(1, current + delta)
      const updated = { ...state.items, [productId]: next }
      writeCart(updated)
      return { items: updated }
    }),

  clear: () => {
    writeCart({})
    set({ items: {} })
  },
}))

/* ── Customer ── */
const customerKey = `sf_customer_${storeSlug}`

export interface CustomerProfile {
  name?: string
  responsible_name?: string
  email?: string
  phone?: string
  address?: string
  establishment?: string
  establishment_name?: string
  customer_id?: string
}

export function getCustomer(): CustomerProfile {
  try {
    const parsed = JSON.parse(localStorage.getItem(customerKey) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function setCustomer(profile: CustomerProfile) {
  localStorage.setItem(customerKey, JSON.stringify(profile))
}
