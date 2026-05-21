import { create } from 'zustand'
import { storeSlug } from './store-context'

/* ── Cart ── */
const cartKey = `sf_cart_${storeSlug}`

/**
 * Variant-aware cart item.
 * Key in the items map is either `productId` (no variant) or `productId::variantId`,
 * so the same product with different variants occupies distinct rows.
 */
export interface CartConfiguratorSelection {
  group_id: string
  option_ids: string[]
}

export interface CartItem {
  productId: string
  variantId?: string | null
  variantName?: string | null
  variantAttributes?: Record<string, any> | null
  /** Selections for a configurable product (pizza/carro/sob medida). */
  configuratorSelections?: CartConfiguratorSelection[] | null
  /** Human-readable summary like "Tamanho: Média | Sabores: Calabresa, Mussarela" */
  configuratorSummary?: string | null
  unitPrice?: number | null /* effective price including variant override + configurator delta */
  quantity: number
}

export function cartItemKey(productId: string, variantId?: string | null, configuratorSelections?: CartConfiguratorSelection[] | null): string {
  let key = variantId ? `${productId}::${variantId}` : productId
  if (Array.isArray(configuratorSelections) && configuratorSelections.length > 0) {
    /* Stable signature so the same configuration aggregates into one line */
    const sig = configuratorSelections
      .map((s) => `${s.group_id}=${[...(s.option_ids || [])].sort().join(',')}`)
      .sort()
      .join(';')
    key += `::cfg=${sig}`
  }
  return key
}

function readCart(): Record<string, CartItem> {
  try {
    const raw = JSON.parse(localStorage.getItem(cartKey) || '{}')
    if (!raw || typeof raw !== 'object') return {}
    /* Migration: legacy shape was Record<string, number>. Convert on the fly. */
    const out: Record<string, CartItem> = {}
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === 'number') {
        out[key] = { productId: key, quantity: Math.max(1, value) }
      } else if (value && typeof value === 'object' && 'productId' in (value as any)) {
        const v = value as CartItem
        out[key] = {
          productId: String(v.productId),
          variantId: v.variantId || null,
          variantName: v.variantName || null,
          variantAttributes: v.variantAttributes || null,
          configuratorSelections: Array.isArray(v.configuratorSelections) ? v.configuratorSelections : null,
          configuratorSummary: v.configuratorSummary || null,
          unitPrice: typeof v.unitPrice === 'number' ? v.unitPrice : null,
          quantity: Math.max(1, Number(v.quantity) || 1),
        }
      }
    }
    return out
  } catch {
    return {}
  }
}

function writeCart(cart: Record<string, CartItem>) {
  localStorage.setItem(cartKey, JSON.stringify(cart))
}

export interface AddItemPayload {
  productId: string
  variantId?: string | null
  variantName?: string | null
  variantAttributes?: Record<string, any> | null
  configuratorSelections?: CartConfiguratorSelection[] | null
  configuratorSummary?: string | null
  unitPrice?: number | null
  quantity?: number
}

interface CartState {
  items: Record<string, CartItem>
  totalItems: () => number
  /** Add an item. Supports legacy (productId, qty) and the new payload form. */
  addItem: (payloadOrId: string | AddItemPayload, qty?: number) => void
  removeItem: (key: string) => void
  updateQty: (key: string, delta: number) => void
  clear: () => void
}

export const useCartStore = create<CartState>((set, get) => ({
  items: readCart(),

  totalItems: () =>
    Object.values(get().items).reduce((sum, item) => sum + (item?.quantity || 0), 0),

  addItem: (payloadOrId, qty = 1) =>
    set((state) => {
      /* Normalize legacy call signature: addItem('product-123', 2) */
      const payload: AddItemPayload = typeof payloadOrId === 'string'
        ? { productId: payloadOrId, quantity: qty }
        : { ...payloadOrId, quantity: payloadOrId.quantity ?? qty }

      const key = cartItemKey(payload.productId, payload.variantId, payload.configuratorSelections)
      const current = state.items[key]
      const nextQty = Math.max(1, (current?.quantity || 0) + Math.max(1, payload.quantity || 1))
      const updated: Record<string, CartItem> = {
        ...state.items,
        [key]: {
          productId: payload.productId,
          variantId: payload.variantId || null,
          variantName: payload.variantName ?? current?.variantName ?? null,
          variantAttributes: payload.variantAttributes ?? current?.variantAttributes ?? null,
          configuratorSelections: payload.configuratorSelections ?? current?.configuratorSelections ?? null,
          configuratorSummary: payload.configuratorSummary ?? current?.configuratorSummary ?? null,
          unitPrice: payload.unitPrice ?? current?.unitPrice ?? null,
          quantity: nextQty,
        },
      }
      writeCart(updated)
      return { items: updated }
    }),

  removeItem: (key) =>
    set((state) => {
      const { [key]: _, ...rest } = state.items
      writeCart(rest)
      return { items: rest }
    }),

  updateQty: (key, delta) =>
    set((state) => {
      const current = state.items[key]
      if (!current) return state
      const nextQty = Math.max(1, current.quantity + delta)
      const updated = { ...state.items, [key]: { ...current, quantity: nextQty } }
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
