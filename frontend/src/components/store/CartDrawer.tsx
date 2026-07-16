import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react'
import { useCartStore } from '@/lib/store'
import { money, storeUrl } from '@/lib/store-context'
import { productPath } from '@/lib/product-url'
import type { Product } from '@/lib/api'

export function CartDrawer({
  products = [],
  catalogSlug,
  enableUpsell = true,
}: {
  products?: Product[]
  catalogSlug?: string
  enableUpsell?: boolean
}) {
  const items = useCartStore((s) => s.items)
  const open = useCartStore((s) => s.drawerOpen)
  const closeDrawer = useCartStore((s) => s.closeDrawer)
  const updateQty = useCartStore((s) => s.updateQty)
  const removeItem = useCartStore((s) => s.removeItem)
  const addItem = useCartStore((s) => s.addItem)
  const closeRef = useRef<HTMLButtonElement>(null)

  const productMap = useMemo(() => {
    const m = new Map<string, Product>()
    for (const p of products) m.set(String(p.id), p)
    return m
  }, [products])

  const lines = useMemo(() => {
    return Object.entries(items)
      .filter(([, it]) => it && it.quantity > 0)
      .map(([key, it]) => {
        const p = productMap.get(String(it.productId))
        const unit =
          typeof it.unitPrice === 'number' && it.unitPrice > 0
            ? it.unitPrice
            : Number(p?.price || 0)
        return {
          key,
          it,
          product: p,
          unit,
          lineTotal: unit * it.quantity,
          name: p?.name || 'Produto',
          image: p?.image || p?.images?.[0] || '',
          variantLabel: it.variantName || it.configuratorSummary || '',
        }
      })
  }, [items, productMap])

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0)
  const cartIds = new Set(lines.map((l) => String(l.it.productId)))
  const itemCount = lines.reduce((n, l) => n + l.it.quantity, 0)

  const upsell = useMemo(() => {
    if (!enableUpsell || lines.length === 0) return null
    const candidates = products.filter((p) => {
      if (cartIds.has(String(p.id))) return false
      const status = p.stock_status || 'unlimited'
      const qty = p.stock_quantity == null ? null : Number(p.stock_quantity)
      const mode = p.metadata?.availability_mode || 'standard'
      const now = Date.now()
      const starts = p.metadata?.preorder_starts_at ? new Date(p.metadata.preorder_starts_at).getTime() : null
      const ends = p.metadata?.preorder_ends_at ? new Date(p.metadata.preorder_ends_at).getTime() : null
      const preorderOpen = mode === 'preorder' && (!starts || starts <= now) && (!ends || ends >= now)
      if (!preorderOpen && (mode !== 'standard' || status === 'out_of_stock' || (qty !== null && qty <= 0))) return false
      return true
    })
    if (candidates.length === 0) return null
    const firstCat = lines[0]?.product?.category || lines[0]?.product?.category_name
    const sameCat = firstCat
      ? candidates.filter((p) => (p.category || p.category_name) === firstCat)
      : []
    const pool = sameCat.length ? sameCat : candidates
    return (
      pool.sort((a, b) => Number(b.reviews_count || 0) - Number(a.reviews_count || 0))[0] || null
    )
  }, [enableUpsell, lines, products, cartIds])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Foco no fechar para teclado / leitores
    window.setTimeout(() => closeRef.current?.focus(), 30)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, closeDrawer])

  if (!open || typeof document === 'undefined') return null

  const node = (
    <div className="store-cart-drawer" role="dialog" aria-modal="true" aria-labelledby="store-cart-title">
      <button
        type="button"
        className="store-cart-drawer__backdrop"
        aria-label="Fechar carrinho"
        onClick={closeDrawer}
      />
      <aside className="store-cart-drawer__panel">
        <header className="store-cart-drawer__head">
          <div className="flex items-center gap-2 min-w-0">
            <ShoppingBag size={18} strokeWidth={1.75} aria-hidden />
            <h2 id="store-cart-title" className="text-[15px] font-bold text-gray-900 tracking-tight">
              Seu carrinho
            </h2>
            {itemCount > 0 && (
              <span className="text-[11px] font-semibold text-gray-500 tabular-nums bg-gray-100 px-2 py-0.5 rounded-full">
                {itemCount}
              </span>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            className="store-cart-drawer__close"
            onClick={closeDrawer}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </header>

        <div className="store-cart-drawer__body">
          {lines.length === 0 ? (
            <div className="store-cart-drawer__empty">
              <div className="store-cart-drawer__empty-icon" aria-hidden>
                <ShoppingBag size={22} strokeWidth={1.5} />
              </div>
              <p className="font-semibold text-gray-900">Carrinho vazio</p>
              <p className="text-[13px] text-gray-500 mt-1 max-w-[16rem] mx-auto leading-relaxed">
                Adicione produtos do catálogo para finalizar o pedido.
              </p>
              <button type="button" className="store-account__btn-primary mt-5" onClick={closeDrawer}>
                Continuar comprando
              </button>
            </div>
          ) : (
            <ul className="store-cart-drawer__lines">
              {lines.map((l) => (
                <li key={l.key} className="store-cart-drawer__line">
                  <div className="store-cart-drawer__thumb">
                    {l.image ? (
                      <img src={l.image} alt="" loading="lazy" />
                    ) : (
                      <span className="bg-gray-100 w-full h-full block" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    {catalogSlug && l.product ? (
                      <Link
                        to={productPath(l.product, catalogSlug)}
                        onClick={closeDrawer}
                        className="text-[13px] font-semibold text-gray-900 line-clamp-2 hover:underline"
                      >
                        {l.name}
                      </Link>
                    ) : (
                      <p className="text-[13px] font-semibold text-gray-900 line-clamp-2">{l.name}</p>
                    )}
                    {l.variantLabel && (
                      <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">{l.variantLabel}</p>
                    )}
                    <p className="text-[13px] font-bold text-gray-900 tabular-nums mt-1">
                      {money(l.lineTotal)}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="store-qty-stepper store-qty-stepper--sm">
                        <button
                          type="button"
                          aria-label="Diminuir quantidade"
                          onClick={() => updateQty(l.key, -1)}
                          className="store-qty-stepper__btn"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="store-qty-stepper__value tabular-nums">{l.it.quantity}</span>
                        <button
                          type="button"
                          aria-label="Aumentar quantidade"
                          onClick={() => updateQty(l.key, 1)}
                          className="store-qty-stepper__btn"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <button
                        type="button"
                        className="text-gray-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition"
                        aria-label={`Remover ${l.name}`}
                        onClick={() => removeItem(l.key)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {upsell && lines.length > 0 && (
            <div className="store-cart-drawer__upsell">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2.5">
                Complete o pedido
              </p>
              <div className="flex gap-3 items-center">
                <div className="store-cart-drawer__thumb shrink-0 !w-14 !h-14">
                  {upsell.image || upsell.images?.[0] ? (
                    <img src={upsell.image || upsell.images?.[0]} alt="" loading="lazy" />
                  ) : (
                    <span className="bg-gray-100 w-full h-full block" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-gray-900 line-clamp-2">{upsell.name}</p>
                  <p className="text-[13px] font-bold tabular-nums mt-0.5">{money(upsell.price)}</p>
                </div>
                <button
                  type="button"
                  className="shrink-0 h-10 px-3.5 rounded-xl bg-gray-900 text-white text-[12px] font-semibold hover:bg-gray-800 active:scale-[0.98] transition"
                  onClick={() => addItem(upsell.id, 1, { openDrawer: true })}
                >
                  + Add
                </button>
              </div>
            </div>
          )}
        </div>

        {lines.length > 0 && (
          <footer className="store-cart-drawer__foot">
            <div className="flex justify-between items-baseline mb-3">
              <span className="text-[13px] text-gray-600">Subtotal</span>
              <span className="text-[17px] font-bold text-gray-900 tabular-nums">{money(subtotal)}</span>
            </div>
            <Link
              to={storeUrl('checkout', catalogSlug)}
              onClick={closeDrawer}
              className="store-account__btn-primary w-full"
            >
              Finalizar pedido
            </Link>
            <button type="button" className="store-account__btn-ghost w-full mt-2" onClick={closeDrawer}>
              Continuar comprando
            </button>
          </footer>
        )}
      </aside>
    </div>
  )

  return createPortal(node, document.body)
}
