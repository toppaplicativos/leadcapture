import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, MessageSquare, Megaphone, ShoppingCart,
  Package, Palette, Search, RefreshCw, LogOut, Menu, X, Loader2,
  Plus, Phone, Mail, Clock, ArrowRight, BarChart3, Zap, Eye,
  ChevronLeft, ChevronRight, Send, Pause, Ban, Bot, Bell, Trash2,
  Wand2, Truck, Globe, Settings, Volume2, FileText, Link2, Receipt, Sparkles,
  CreditCard, QrCode, Banknote, User, BadgeCheck, Headphones, Brain,
  Boxes, Store, Laptop, CheckCircle2, Copy, Info, AlertTriangle, Star,
  Camera, Ticket, Percent, MessageSquareQuote, ThumbsUp, ThumbsDown, Film, ShoppingBag,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { adminApi, inventoryApi } from '@/lib/api-admin'
import { useConfirm } from '@/components/ConfirmModal'
import { AICampaignWizardModal } from '@/components/AICampaignWizardModal'
import { BrandSkillsPage } from '@/pages/BrandSkillsPage'
import { WhatsAppHealthBanner } from '@/components/WhatsAppHealthBanner'
import {
  getHeaders, clearAdminAuth, money, num, dt, dtFull,
  toBrandSlug, pickStockBrandSlug, buildStockAppUrl,
} from '@/lib/admin/helpers'
import type { ShowToast } from '@/lib/admin/types'
import { Skeleton, KpiCard, EmptyState } from '@/components/admin/primitives'
import { MediaPickerModal } from '@/components/gallery/MediaPickerModal'
import type { GalleryItem } from '@/lib/gallery/types'
import { useProductsBridgeOptional } from '@/lib/agent/ProductsBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'

export function ProductsView({
  showToast,
  embedded = false,
}: {
  showToast: (t: string, tp?: 'ok' | 'err') => void
  embedded?: boolean
}) {
  const [products, setProducts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [editProduct, setEditProduct] = useState<any>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [subTab, setSubTab] = useState<'products' | 'collections' | 'attributes'>('products')
  const { confirm } = useConfirm()
  const productsBridge = useProductsBridgeOptional()
  const publishSnapshot = productsBridge?.publishSnapshot
  const registerHandlers = productsBridge?.registerHandlers
  const { openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const pendingSelectId = useRef<string | null>(null)

  function load() {
    setLoading(true)
    Promise.all([
      fetch('/api/products', { headers: getHeaders() }).then(r => r.json()).catch(() => ({ products: [] })),
      fetch('/api/categories', { headers: getHeaders() }).then(r => r.json()).catch(() => ({ categories: [] })),
    ]).then(([p, c]) => {
      setProducts(p.products || [])
      setCategories(c.categories || [])
      setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  function openCreate() { setEditProduct(null); setShowCreate(true) }
  function openEdit(p: any) { setEditProduct(p); setShowCreate(true) }

  useEffect(() => {
    if (!registerHandlers || !isDesktop) return
    return registerHandlers({
      search: (q) => setSearch(q),
      selectProduct: (id) => {
        const found = products.find((p) => String(p.id) === String(id))
        if (found) {
          pendingSelectId.current = null
          openEdit(found)
        } else {
          pendingSelectId.current = id
        }
      },
      createNew: openCreate,
      openFull: () => { if (isDesktop) openCanvas('/produtos') },
      refresh: () => load(),
    })
  }, [registerHandlers, isDesktop, products, openCanvas])

  useEffect(() => {
    if (!isDesktop || !pendingSelectId.current) return
    const found = products.find((p) => String(p.id) === String(pendingSelectId.current))
    if (found) {
      openEdit(found)
      pendingSelectId.current = null
    }
  }, [products, isDesktop])

  useEffect(() => {
    if (!publishSnapshot || !isDesktop) return
    publishSnapshot({
      total: products.length,
      active: products.filter((p) => p.active !== false && p.is_active !== false).length,
      drafts: products.filter((p) => p?.metadata?.is_draft).length,
      search,
      loading,
      selectedId: editProduct?.id ? String(editProduct.id) : null,
      selectedName: editProduct?.name || '',
    })
  }, [publishSnapshot, isDesktop, products, loading, search, editProduct?.id, editProduct?.name])

  const filtered = useMemo(() => {
    let list = products
    if (catFilter) list = list.filter(p => p.category === catFilter)
    if (search) { const q = search.toLowerCase(); list = list.filter(p => (p.name || '').toLowerCase().includes(q)) }
    return list
  }, [products, catFilter, search])

  const isProductDraft = (p: any) => Boolean(p?.metadata?.is_draft)

  const metrics = useMemo(() => {
    const total = products.length
    const active = products.filter(p => p.active !== false && p.is_active !== false).length
    const drafts = products.filter(isProductDraft).length
    const withImage = products.filter(p => p.imageUrl || p.image).length
    const avgPrice = total > 0 ? products.reduce((s, p) => s + (Number(p.price) || 0), 0) / total : 0
    const catCounts: Record<string, number> = {}
    products.forEach(p => { if (p.category) catCounts[p.category] = (catCounts[p.category] || 0) + 1 })
    return { total, active, drafts, withImage, avgPrice, catCounts }
  }, [products])

  async function deleteProduct(id: string) {
    const product = products.find(p => p.id === id)
    const ok = await confirm({
      title: 'Remover produto?',
      message: product?.name
        ? <span>O produto <b>{product.name}</b> sera removido do catalogo. Pedidos antigos sao mantidos.</span>
        : 'O produto sera removido do catalogo. Pedidos antigos sao mantidos.',
      confirmLabel: 'Remover',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (!ok) return
    await fetch(`/api/products/${id}`, { method: 'DELETE', headers: getHeaders() }).catch(() => {})
    load()
    showToast('Produto removido')
  }

  if (loading) return <Skeleton rows={6} />

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-5'}>
      {embedded ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] text-gray-500 tabular-nums">
            {metrics.total} produtos · {metrics.active} ativos · {metrics.drafts} rascunhos
          </p>
          {subTab === 'products' && (
            <button
              type="button"
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-900 text-white text-[11px] font-bold hover:bg-gray-800 transition-all shrink-0"
            >
              <Plus size={13} /> Novo
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Catálogo</h2>
            <p className="text-[13px] text-gray-400 mt-0.5">{metrics.total} produtos · {metrics.active} ativos · {metrics.drafts} rascunhos</p>
          </div>
          {subTab === 'products' && (
            <button onClick={openCreate}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 transition-all shadow-sm">
              <Plus size={14} /> Novo Produto
            </button>
          )}
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 p-0.5 rounded-xl w-fit">
        {([
          { key: 'products', label: 'Produtos' },
          { key: 'collections', label: 'Coleções' },
          { key: 'attributes', label: 'Atributos' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-[12px] font-semibold transition ${
              subTab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}>{t.label}</button>
        ))}
      </div>

      {subTab === 'collections' ? (
        <CollectionsManager products={products} showToast={showToast} />
      ) : subTab === 'attributes' ? (
        <AttributeDefinitionsManager showToast={showToast} />
      ) : (<>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <KpiCard label="Total" value={String(metrics.total)} icon={Package} bg="bg-blue-50" color="text-blue-500" accent="text-blue-600" />
        <KpiCard label="Ativos" value={String(metrics.active)} icon={Eye} bg="bg-emerald-50" color="text-emerald-500" accent="text-emerald-600" />
        <KpiCard label="Com Imagem" value={String(metrics.withImage)} icon={Eye} bg="bg-violet-50" color="text-violet-500" accent="text-violet-600" />
        <KpiCard label="Preco Medio" value={money(metrics.avgPrice)} icon={BarChart3} bg="bg-amber-50" color="text-amber-500" accent="text-amber-600" />
      </div>

      {/* Category filter chips */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setCatFilter('')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition ${!catFilter ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
            Todos ({metrics.total})
          </button>
          {categories.map((c: any) => (
            <button key={c.id} onClick={() => setCatFilter(catFilter === c.name ? '' : c.name)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition ${catFilter === c.name ? 'ring-1 ring-blue-300 text-blue-700 bg-blue-50' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
              {c.color && <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: c.color }} />}
              {c.name} {metrics.catCounts[c.name] ? <span className="text-[9px] opacity-60">({metrics.catCounts[c.name]})</span> : null}
            </button>
          ))}
        </div>
      )}

      {/* Search + View toggle */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar produto..."
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 placeholder:text-gray-300" />
        </div>
        <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg">
          <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition ${viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'}`}>
            <Package size={14} />
          </button>
          <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition ${viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'}`}>
            <BarChart3 size={14} />
          </button>
        </div>
      </div>

      {/* Grid view */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((p: any) => (
            <div key={p.id} className="bg-white rounded-2xl border border-border-light overflow-hidden group hover:shadow-md transition-all cursor-pointer"
              onClick={() => openEdit(p)}>
              <div className="aspect-square bg-gray-100 relative overflow-hidden">
                {(p.imageUrl || p.image) ? (
                  <img src={p.imageUrl || p.image} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    onError={(e) => { e.currentTarget.style.display = 'none'; const fb = e.currentTarget.nextElementSibling as HTMLElement; if (fb) fb.style.display = 'flex' }} />
                ) : null}
                <div className="w-full h-full flex items-center justify-center" style={{ display: (p.imageUrl || p.image) ? 'none' : 'flex' }}><Package size={32} className="text-gray-300" /></div>
                {isProductDraft(p) ? (
                  <div className="absolute top-2 left-2 bg-amber-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">RASCUNHO</div>
                ) : p.active === false ? (
                  <div className="absolute top-2 left-2 bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">INATIVO</div>
                ) : null}
                <button onClick={e => { e.stopPropagation(); deleteProduct(p.id) }}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all shadow-sm"
                  title="Excluir produto">
                  <Trash2 size={13} className="text-gray-400 hover:text-red-500" />
                </button>
              </div>
              <div className="p-3">
                <p className="text-xs font-bold text-gray-900 truncate">{p.name}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{p.category || '—'} · {p.unit || 'un'}</p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm font-extrabold text-gray-900">{money(p.price)}</p>
                  {Number(p.promoPrice) > 0 && <p className="text-[10px] font-bold text-emerald-600">{money(p.promoPrice)}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List view */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-2xl border border-border-light overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Produto</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Categoria</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Preco</th>
                <th className="text-center px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden md:table-cell">Status</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p: any) => (
                <tr key={p.id} className="border-b border-gray-100 last:border-0 hover:bg-blue-50/30 transition cursor-pointer"
                  onClick={() => openEdit(p)}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {(p.imageUrl || p.image)
                        ? <img src={p.imageUrl || p.image} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0"
                            onError={(e) => { e.currentTarget.style.display = 'none'; const fb = e.currentTarget.nextElementSibling as HTMLElement; if (fb) fb.style.display = 'grid' }} />
                        : null}
                      <div className="w-9 h-9 rounded-lg bg-gray-100 grid place-items-center shrink-0" style={{ display: (p.imageUrl || p.image) ? 'none' : 'grid' }}><Package size={14} className="text-gray-300" /></div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate max-w-[200px]">{p.name}</p>
                        <p className="text-[10px] text-gray-400">{p.unit || 'un'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 hidden sm:table-cell">{p.category || '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <p className="font-bold text-gray-900">{money(p.price)}</p>
                    {Number(p.promoPrice) > 0 && <p className="text-[10px] text-emerald-600 font-semibold">{money(p.promoPrice)}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-center hidden md:table-cell">
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                      p?.metadata?.is_draft ? 'bg-amber-50 text-amber-700' :
                      p.active !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                    }`}>
                      {p?.metadata?.is_draft ? 'Rascunho' : p.active !== false ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <button onClick={e => { e.stopPropagation(); deleteProduct(p.id) }} className="p-1.5 rounded-lg hover:bg-red-50 transition">
                      <Trash2 size={13} className="text-gray-400 hover:text-red-500" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length === 0 && <EmptyState icon={Package} text="Nenhum produto encontrado" />}

      </>)}

      {/* ── Product Editor Modal ── */}
      {showCreate && (
        <ProductEditorModal
          product={editProduct}
          categories={categories}
          onClose={() => { setShowCreate(false); setEditProduct(null) }}
          onSaved={() => { setShowCreate(false); setEditProduct(null); load() }}
          onDelete={async (id: string) => { await deleteProduct(id); setShowCreate(false); setEditProduct(null) }}
          showToast={showToast}
        />
      )}
    </div>
  )
}

/* ── Product Editor Modal ── */
export function ProductEditorModal({ product, categories: categoriesProp, onClose, onSaved, onDelete, showToast }: {
  product: any; categories: any[]; onClose: () => void; onSaved: () => void; onDelete?: (id: string) => void; showToast: (t: string, tp?: 'ok' | 'err') => void
}) {
  const isEdit = !!product?.id
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [name, setName] = useState(product?.name || '')
  const [description, setDescription] = useState(product?.description || '')
  const [category, setCategory] = useState(product?.category || '')
  /* Local mutable copy so newly-created categories appear immediately without parent re-render */
  const [categories, setCategories] = useState<any[]>(categoriesProp || [])
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const { confirm } = useConfirm()

  /* Re-pull categories whenever modal opens to pick up changes from other places */
  useEffect(() => {
    fetch('/api/categories', { headers: getHeaders() })
      .then(r => r.json())
      .then(d => setCategories(d.categories || []))
      .catch(() => {})
  }, [])

  async function createCategoryInline(rawName: string) {
    const newName = (rawName || '').trim()
    if (!newName) return
    setCreatingCategory(true)
    try {
      const r = await fetch('/api/categories', {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ name: newName }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Erro ${r.status}`)
      const created = d.category
      if (created) {
        setCategories(prev => {
          if (prev.some((c: any) => c.id === created.id)) return prev
          return [...prev, created]
        })
        setCategory(created.name)
        showToast('Categoria criada!')
        setNewCategoryName('')
        setShowNewCategoryInput(false)
      }
    } catch (e: any) {
      showToast(e.message || 'Erro ao criar categoria', 'err')
    } finally {
      setCreatingCategory(false)
    }
  }
  const [price, setPrice] = useState(product?.price != null ? String(product.price) : '')
  const [promoPrice, setPromoPrice] = useState(product?.promoPrice != null ? String(product.promoPrice) : '')
  const [features, setFeatures] = useState((product?.features || []).join(', '))
  const [active, setActive] = useState(product?.active !== false)
  const [imageUrl, setImageUrl] = useState(product?.imageUrl || product?.image || '')
  const [uploading, setUploading] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  /* OfferEntity Fase 0+3 — type, subtitle, CTA */
  const [offerType, setOfferType] = useState<string>(product?.type || 'physical_product')
  const [subtitle, setSubtitle] = useState<string>(product?.subtitle || '')
  const [ctaType, setCtaType] = useState<string>(product?.cta_type || 'buy')
  /* Inventory (Fase 12) — empty string = ilimitado (untracked) */
  const [stockQty, setStockQty] = useState<string>(
    product?.stock_quantity == null ? '' : String(product.stock_quantity)
  )
  const [stockThreshold, setStockThreshold] = useState<string>(
    product?.stock_threshold_low != null ? String(product.stock_threshold_low) : '5'
  )
  /* Dynamic attributes (Fase 2) — driven by attribute_definitions */
  const [attrDefs, setAttrDefs] = useState<AttributeDef[]>([])
  const [attrValues, setAttrValues] = useState<Record<string, any>>(product?.attributes || {})
  /* Inline form for adding a free attribute (Bug 1 fix: replaced blocking prompt()) */
  const [showNewAttrForm, setShowNewAttrForm] = useState(false)
  const [newAttrKey, setNewAttrKey] = useState('')
  const [newAttrValue, setNewAttrValue] = useState('')
  /* Inline form for adding a variant attribute (per variant index) */
  const [variantAttrDraft, setVariantAttrDraft] = useState<Record<number, { key: string; value: string } | null>>({})
  /* SEO (Fase 6) */
  const [seoValues, setSeoValues] = useState<Record<string, any>>(product?.seo || {})
  /* Bundle items (Fase 11) — only meaningful when type='bundle' */
  const [bundleItems, setBundleItems] = useState<Array<{ product_id: string; quantity: number; note?: string }>>(
    Array.isArray(product?.bundle_items) ? product!.bundle_items! : []
  )

  function addBundleItem(productId: string) {
    if (!productId) return
    setBundleItems(prev => {
      if (prev.some(it => it.product_id === productId)) return prev
      return [...prev, { product_id: productId, quantity: 1 }]
    })
  }
  function updateBundleItem(idx: number, patch: any) {
    setBundleItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }
  function removeBundleItem(idx: number) {
    setBundleItems(prev => prev.filter((_, i) => i !== idx))
  }

  /* Configurator (Fase 4) */
  const [configurator, setConfigurator] = useState<{
    enabled: boolean
    groups: Array<{ id: string; name: string; required: boolean; min_select: number; max_select: number; options: Array<{ id: string; name: string; price_delta: number; is_active?: boolean }> }>
  }>({
    enabled: Boolean(product?.configurator?.enabled),
    groups: Array.isArray(product?.configurator?.groups)
      ? product!.configurator!.groups!.map((g: any) => ({
          id: String(g.id || ''),
          name: String(g.name || ''),
          required: Boolean(g.required),
          min_select: Number(g.min_select ?? 0),
          max_select: Number(g.max_select ?? 1),
          options: Array.isArray(g.options) ? g.options.map((o: any) => ({
            id: String(o.id || ''),
            name: String(o.name || ''),
            price_delta: Number(o.price_delta || 0),
            is_active: o.is_active !== false,
          })) : [],
        }))
      : [],
  })

  function slugifyId(label: string): string {
    return String(label || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40) || `g_${Date.now()}`
  }

  function addConfigGroup() {
    /* Add empty group with placeholder name — user edits inline. Avoids blocking prompt()
     * that was freezing the modal renderer for >30s in some browsers/contexts. */
    const placeholder = 'Novo grupo'
    setConfigurator(c => ({
      ...c, enabled: true,
      groups: [...c.groups, {
        id: slugifyId(`${placeholder}-${c.groups.length + 1}`),
        name: placeholder,
        required: true, min_select: 1, max_select: 1, options: [],
      }],
    }))
  }
  function updateGroup(idx: number, patch: any) {
    setConfigurator(c => ({ ...c, groups: c.groups.map((g, i) => i === idx ? { ...g, ...patch } : g) }))
  }
  function removeGroup(idx: number) {
    setConfigurator(c => ({ ...c, groups: c.groups.filter((_, i) => i !== idx) }))
  }
  function addOption(groupIdx: number) {
    /* Add empty option with placeholder — user edits inline (same fix as addConfigGroup). */
    setConfigurator(c => ({
      ...c,
      groups: c.groups.map((g, i) => i !== groupIdx ? g : {
        ...g,
        options: [...g.options, {
          id: slugifyId(`opcao-${g.options.length + 1}`),
          name: 'Nova opção',
          price_delta: 0,
          is_active: true,
        }],
      }),
    }))
  }
  function updateOption(groupIdx: number, optIdx: number, patch: any) {
    setConfigurator(c => ({
      ...c,
      groups: c.groups.map((g, i) => i !== groupIdx ? g : {
        ...g,
        options: g.options.map((o, oi) => oi !== optIdx ? o : { ...o, ...patch }),
      }),
    }))
  }
  function removeOption(groupIdx: number, optIdx: number) {
    setConfigurator(c => ({
      ...c,
      groups: c.groups.map((g, i) => i !== groupIdx ? g : {
        ...g, options: g.options.filter((_, oi) => oi !== optIdx),
      }),
    }))
  }
  /* Product relations (Fase 6) — picker of related products */
  const [relatedIds, setRelatedIds] = useState<string[]>([])
  const [allProducts, setAllProducts] = useState<any[]>([])
  const [relationsLoaded, setRelationsLoaded] = useState(false)
  useEffect(() => {
    /* Load every product in the brand once for the relation picker */
    fetch('/api/products', { headers: getHeaders() })
      .then(r => r.json())
      .then(d => setAllProducts((d.products || []).filter((p: any) => p.id !== product?.id)))
      .catch(() => {})
    if (product?.id) {
      fetch(`/api/products/${product.id}/relations`, { headers: getHeaders() })
        .then(r => r.json())
        .then(d => {
          setRelatedIds((d.relations || []).map((r: any) => r.related_product_id))
          setRelationsLoaded(true)
        })
        .catch(() => setRelationsLoaded(true))
    } else {
      setRelationsLoaded(true)
    }
  }, [product?.id])
  /* Service config (Fase 5) — only shown when type is service/appointment */
  const [serviceConfig, setServiceConfig] = useState<{
    duration_minutes?: number
    buffer_minutes?: number
    max_per_slot?: number
    weekday_hours?: Array<{ weekday: number; start: string; end: string }>
    requires_address?: boolean
    advance_notice_hours?: number
    max_advance_days?: number
  }>(product?.service_config || { duration_minutes: 60, buffer_minutes: 0, max_per_slot: 1, weekday_hours: [], advance_notice_hours: 1, max_advance_days: 30 })
  useEffect(() => {
    fetch('/api/attribute-definitions', { headers: getHeaders() })
      .then(r => r.json())
      .then(d => setAttrDefs(d.definitions || []))
      .catch(() => {})
  }, [])
  /* Variants (Fase 1) — loaded async after edit modal opens for existing product */
  const [variants, setVariants] = useState<Array<{
    id?: string
    name?: string
    sku?: string
    attributes?: Record<string, string>
    price?: string
    promo_price?: string
    stock_quantity?: string
    is_active?: boolean
  }>>([])
  const [variantsLoaded, setVariantsLoaded] = useState(false)
  const [savingVariants, setSavingVariants] = useState(false)

  useEffect(() => {
    if (!product?.id) { setVariantsLoaded(true); return }
    fetch(`/api/products/${product.id}/variants`, { headers: getHeaders() })
      .then(r => r.json())
      .then(d => {
        const raw = Array.isArray(d.variants) ? d.variants : []
        setVariants(raw.map((v: any) => ({
          id: v.id,
          name: v.name || '',
          sku: v.sku || '',
          attributes: v.attributes || {},
          price: v.price != null ? String(v.price) : '',
          promo_price: v.promo_price != null ? String(v.promo_price) : '',
          stock_quantity: v.stock_quantity != null ? String(v.stock_quantity) : '',
          is_active: v.is_active !== false,
        })))
        setVariantsLoaded(true)
      })
      .catch(() => setVariantsLoaded(true))
  }, [product?.id])

  function addVariant() {
    setVariants(v => [...v, { name: '', sku: '', attributes: {}, price: '', promo_price: '', stock_quantity: '', is_active: true }])
  }
  function updateVariant(idx: number, patch: any) {
    setVariants(v => v.map((row, i) => i === idx ? { ...row, ...patch } : row))
  }
  function removeVariant(idx: number) {
    setVariants(v => v.filter((_, i) => i !== idx))
  }
  function updateVariantAttr(idx: number, key: string, value: string) {
    setVariants(v => v.map((row, i) => {
      if (i !== idx) return row
      const next = { ...(row.attributes || {}) }
      if (value) next[key] = value
      else delete next[key]
      return { ...row, attributes: next }
    }))
  }

  // Normalized unit system: parse "500g" → qty=500, baseUnit="g"
  const UNITS = [
    { value: 'kg', label: 'Quilograma (kg)' },
    { value: 'g', label: 'Grama (g)' },
    { value: 'un', label: 'Unidade (un)' },
    { value: 'L', label: 'Litro (L)' },
    { value: 'ml', label: 'Mililitro (ml)' },
    { value: 'cx', label: 'Caixa (cx)' },
    { value: 'pct', label: 'Pacote (pct)' },
    { value: 'par', label: 'Par' },
    { value: 'm', label: 'Metro (m)' },
  ]

  function parseUnit(raw: string): { qty: string; baseUnit: string } {
    const s = (raw || 'unidade').trim().toLowerCase()
    // Match patterns like "500g", "1kg", "10kg", "250ml", "1L"
    const m = s.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|un|cx|pct|m|par)$/i)
    if (m) return { qty: m[1], baseUnit: m[2].toLowerCase() === 'l' ? 'L' : m[2].toLowerCase() }
    // Already a base unit
    const found = UNITS.find(u => u.value.toLowerCase() === s || u.label.toLowerCase().includes(s))
    if (found) return { qty: '1', baseUnit: found.value }
    return { qty: '1', baseUnit: 'un' }
  }

  const parsed = parseUnit(product?.unit || 'unidade')
  const [unitQty, setUnitQty] = useState(parsed.qty)
  const [baseUnit, setBaseUnit] = useState(parsed.baseUnit)

  async function uploadImage(file: File) {
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await fetch('/api/media/upload', { method: 'POST', headers: { 'Authorization': getHeaders()['Authorization'] }, body: fd })
      const d = await r.json()
      if (d.file?.url) setImageUrl(d.file.url)
    } catch {}
    setUploading(false)
  }

  function collectPublishErrors(): Record<string, string> {
    const errors: Record<string, string> = {}
    if (!name.trim()) errors.name = 'Nome é obrigatório'
    if (!category.trim()) errors.category = 'Categoria é obrigatória'
    if (!price || isNaN(parseFloat(price))) errors.price = 'Preço válido é obrigatório'
    else if (parseFloat(price) < 0) errors.price = 'Preço não pode ser negativo'
    return errors
  }

  function buildProductBody(saveAsDraft: boolean) {
    const qtyNum = parseFloat(unitQty) || 1
    const composedUnit = qtyNum === 1 ? baseUnit : `${qtyNum}${baseUnit}`
    return {
      name: name.trim(),
      description: description.trim(),
      category: category.trim() || null,
      price: price ? parseFloat(price) : 0,
      promoPrice: promoPrice ? parseFloat(promoPrice) : null,
      unit: composedUnit,
      features: features.split(',').map((f: string) => f.trim()).filter(Boolean),
      active: saveAsDraft ? false : active,
      imageUrl: imageUrl || null,
      save_as_draft: saveAsDraft,
      type: offerType,
      subtitle: subtitle.trim() || null,
      cta_type: ctaType,
      attributes: attrValues,
      service_config: (offerType === 'service' || offerType === 'appointment') ? serviceConfig : null,
      seo: seoValues,
      configurator: configurator.enabled && configurator.groups.length > 0 ? configurator : { enabled: false, groups: [] },
      bundle_items: offerType === 'bundle' ? bundleItems : [],
      stock_quantity: stockQty === '' ? null : Math.max(0, parseInt(stockQty, 10) || 0),
      stock_threshold_low: Math.max(0, parseInt(stockThreshold || '5', 10) || 5),
    }
  }

  async function persistRelationsAndVariants(savedId: string) {
    if (savedId && relationsLoaded) {
      try {
        await fetch(`/api/products/${savedId}/relations`, {
          method: 'PUT', headers: getHeaders(),
          body: JSON.stringify({
            relations: relatedIds.map((rid, idx) => ({ related_product_id: rid, type: 'related', position: idx })),
          }),
        })
      } catch { /* non-blocking */ }
    }
    if (savedId && variantsLoaded) {
      setSavingVariants(true)
      const payload = variants.map((v, idx) => ({
        id: v.id,
        name: (v.name || '').trim() || null,
        sku: (v.sku || '').trim() || null,
        attributes: v.attributes || {},
        price: v.price ? Number(v.price) : null,
        promo_price: v.promo_price ? Number(v.promo_price) : null,
        stock_quantity: v.stock_quantity !== '' ? Number(v.stock_quantity) : null,
        position: idx,
        is_active: v.is_active !== false,
      }))
      try {
        await fetch(`/api/products/${savedId}/variants`, {
          method: 'PUT', headers: getHeaders(),
          body: JSON.stringify({ variants: payload }),
        })
      } catch { /* non-blocking */ }
      setSavingVariants(false)
    }
  }

  async function save(mode: 'publish' | 'draft' = 'publish') {
    const saveAsDraft = mode === 'draft'
    setFieldErrors({})

    if (saveAsDraft) {
      if (!name.trim() && !description.trim()) {
        const err = { name: 'Informe ao menos o nome ou a descrição' }
        setFieldErrors(err)
        showToast('Informe ao menos o nome ou a descrição para salvar o rascunho', 'err')
        return
      }
    } else {
      const errors = collectPublishErrors()
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors)
        showToast(Object.values(errors).join(' · '), 'err')
        return
      }
    }

    setSaving(true)
    try {
      const body = buildProductBody(saveAsDraft)
      const url = isEdit ? `/api/products/${product.id}` : '/api/products'
      const method = isEdit ? 'PUT' : 'POST'
      const r = await fetch(url, { method, headers: getHeaders(), body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        if (d.fields && typeof d.fields === 'object') setFieldErrors(d.fields)
        throw new Error(d.error || `Erro ${r.status} ao salvar produto`)
      }

      const savedId = d.product?.id || d.id || product?.id
      await persistRelationsAndVariants(savedId)

      if (d.draft || saveAsDraft) {
        const missing = Array.isArray(d.missing_fields) ? d.missing_fields : []
        const hint = missing.length
          ? ` Falta: ${missing.map((f: string) => ({ name: 'nome', category: 'categoria', price: 'preço' }[f] || f)).join(', ')}.`
          : ''
        showToast(`Salvo como rascunho.${hint}`)
      } else {
        showToast(isEdit ? 'Produto publicado!' : 'Produto criado!')
      }
      onSaved()
    } catch (e: any) {
      showToast(e.message || 'Erro ao salvar produto', 'err')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900'
  const labelCls = 'text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block'

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-base text-gray-900">{isEdit ? 'Editar Produto' : 'Novo Produto'}</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition"><X size={18} className="text-gray-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Image */}
          <div className="flex items-center justify-between mb-1">
            <span className={labelCls + ' mb-0'}>Imagem</span>
            <button
              type="button"
              onClick={() => setGalleryOpen(true)}
              className="text-[11px] font-semibold text-gray-700 hover:text-gray-900"
            >
              Escolher da galeria
            </button>
          </div>
          <div className={`rounded-xl border-2 border-dashed overflow-hidden transition ${imageUrl ? 'border-blue-300' : 'border-gray-200'}`}>
            {imageUrl ? (
              <div className="relative group" style={{ aspectRatio: '16/10' }}>
                <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <label className="px-3 py-1.5 bg-white/90 rounded-lg text-[11px] font-bold text-gray-700 cursor-pointer">
                    Trocar <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f) }} />
                  </label>
                  <button onClick={() => setImageUrl('')} className="px-3 py-1.5 bg-red-500/90 rounded-lg text-[11px] font-bold text-white">Remover</button>
                </div>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center py-8 cursor-pointer hover:bg-blue-50/30 transition">
                {uploading ? <Loader2 size={24} className="text-blue-400 animate-spin" /> : <Package size={28} className="text-gray-300" />}
                <p className="text-xs text-gray-400 mt-1">{uploading ? 'Enviando...' : 'Clique para adicionar imagem'}</p>
                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f) }} />
              </label>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className={labelCls}>Nome *</label>
              <input type="text" value={name} onChange={e => { setName(e.target.value); if (fieldErrors.name) setFieldErrors(prev => ({ ...prev, name: '' })) }}
                placeholder="Nome do produto" className={`${inputCls}${fieldErrors.name ? ' border-red-300 ring-1 ring-red-100' : ''}`} />
              {fieldErrors.name && <p className="text-[11px] text-red-600 mt-1">{fieldErrors.name}</p>}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={labelCls + ' !mb-0'}>Categoria *</label>
                <button type="button" onClick={() => setShowNewCategoryInput(s => !s)} disabled={creatingCategory}
                  className="text-[10px] font-bold text-violet-600 hover:text-violet-700 px-1.5 py-0.5 rounded hover:bg-violet-50 flex items-center gap-0.5 disabled:opacity-50">
                  <Plus size={10} strokeWidth={2.5} /> {creatingCategory ? '...' : (showNewCategoryInput ? 'Cancelar' : 'Nova')}
                </button>
              </div>
              {showNewCategoryInput ? (
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    autoFocus
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); createCategoryInline(newCategoryName) }
                      if (e.key === 'Escape') { setShowNewCategoryInput(false); setNewCategoryName('') }
                    }}
                    placeholder="Nome da categoria"
                    className={inputCls}
                  />
                  <button type="button" disabled={creatingCategory || !newCategoryName.trim()}
                    onClick={() => createCategoryInline(newCategoryName)}
                    className="px-3 py-1.5 rounded-xl bg-violet-600 text-white text-[11px] font-bold hover:bg-violet-700 disabled:opacity-50">
                    OK
                  </button>
                </div>
              ) : (
                <select value={category} onChange={e => { setCategory(e.target.value); if (fieldErrors.category) setFieldErrors(prev => ({ ...prev, category: '' })) }}
                  className={`${inputCls}${fieldErrors.category ? ' border-red-300 ring-1 ring-red-100' : ''}`}>
                  <option value="">Selecione...</option>
                  {categories.map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              )}
              {fieldErrors.category && <p className="text-[11px] text-red-600 mt-1">{fieldErrors.category}</p>}
            </div>
            <div>
              <label className={labelCls}>Unidade de medida</label>
              <div className="flex gap-2">
                <input type="number" step="any" min="0.01" value={unitQty} onChange={e => setUnitQty(e.target.value)}
                  placeholder="1" className={inputCls + ' !w-20 text-center'} />
                <select value={baseUnit} onChange={e => setBaseUnit(e.target.value)} className={inputCls}>
                  {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>
              <p className="text-[9px] text-gray-400 mt-1">
                Resultado: <span className="font-semibold text-gray-600">{parseFloat(unitQty) === 1 ? baseUnit : `${unitQty}${baseUnit}`}</span>
              </p>
            </div>
            <div>
              <label className={labelCls}>Preco (R$) *</label>
              <input type="number" step="0.01" value={price} onChange={e => { setPrice(e.target.value); if (fieldErrors.price) setFieldErrors(prev => ({ ...prev, price: '' })) }}
                placeholder="0.00" className={`${inputCls}${fieldErrors.price ? ' border-red-300 ring-1 ring-red-100' : ''}`} />
              {fieldErrors.price && <p className="text-[11px] text-red-600 mt-1">{fieldErrors.price}</p>}
            </div>
            <div>
              <label className={labelCls}>Preco Promocional</label>
              <input type="number" step="0.01" value={promoPrice} onChange={e => setPromoPrice(e.target.value)} placeholder="Opcional" className={inputCls} />
            </div>
          </div>

          {/* ── Estoque (Fase 12) ── Vazio = ilimitado (não rastrear) */}
          <div className="bg-violet-50/40 border border-violet-100 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <Package size={14} className="text-violet-600" strokeWidth={2.5} />
              <span className="text-[11px] font-bold text-violet-900 uppercase tracking-wider">Estoque</span>
              <span className="text-[10px] text-violet-700/70 font-normal">deixe vazio para não rastrear</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Quantidade disponível</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={stockQty}
                  onChange={e => setStockQty(e.target.value)}
                  placeholder="ilimitado"
                  className={inputCls}
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  {stockQty === '' ? 'Não rastreado — sempre disponível' :
                    parseInt(stockQty, 10) <= 0 ? 'Esgotado — botão de compra desabilitado no catálogo' :
                    parseInt(stockQty, 10) <= parseInt(stockThreshold || '5', 10) ? `Estoque baixo (≤ ${stockThreshold} alerta)` :
                    'Em estoque'}
                </p>
              </div>
              <div>
                <label className={labelCls}>Alerta de baixo (≤)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={stockThreshold}
                  onChange={e => setStockThreshold(e.target.value)}
                  placeholder="5"
                  className={inputCls}
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Quando o estoque cair pra ≤ {stockThreshold || '5'}, marca como baixo.
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className={labelCls}>Descricao</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              placeholder="Descreva o produto..." className={inputCls + ' resize-none'} />
          </div>

          <div>
            <label className={labelCls}>Caracteristicas (virgula)</label>
            <input type="text" value={features} onChange={e => setFeatures(e.target.value)}
              placeholder="Fresco, Selecionado, Tipo A" className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Subtitulo (opcional)</label>
            <input type="text" value={subtitle} onChange={e => setSubtitle(e.target.value)}
              placeholder="Frase curta abaixo do nome (ex: feito a mao)" className={inputCls} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Tipo de oferta</label>
              <select value={offerType} onChange={e => setOfferType(e.target.value)} className={inputCls}>
                <option value="physical_product">Produto físico</option>
                <option value="digital_product">Produto digital</option>
                <option value="service">Serviço</option>
                <option value="food">Alimento</option>
                <option value="vehicle">Veículo</option>
                <option value="real_estate">Imóvel</option>
                <option value="subscription">Assinatura</option>
                <option value="consortium">Consórcio</option>
                <option value="custom_quote">Orçamento sob medida</option>
                <option value="appointment">Agendamento</option>
                <option value="course">Curso</option>
                <option value="event">Evento</option>
                <option value="bundle">Kit / Combo</option>
              </select>
              <p className="text-[10px] text-gray-400 mt-1">Define como o agente IA conversa sobre este item.</p>
            </div>
            <div>
              <label className={labelCls}>Ação no catálogo (CTA)</label>
              <select value={ctaType} onChange={e => setCtaType(e.target.value)} className={inputCls}>
                <option value="buy">Comprar (carrinho)</option>
                <option value="quote">Solicitar orçamento</option>
                <option value="whatsapp">Conversar no WhatsApp</option>
                <option value="schedule">Agendar atendimento</option>
                <option value="visit">Solicitar visita</option>
                <option value="simulate">Simular</option>
                <option value="subscribe">Assinar</option>
              </select>
              <p className="text-[10px] text-gray-400 mt-1">Define o botão exibido na página pública do produto.</p>
            </div>
          </div>

          {/* ── Atributos do produto (Fase 2 — sempre disponível) ──
            * Estrutura híbrida: campos automáticos vêm dos attribute_definitions da brand (opcional, viram
            * filtros no catálogo público), MAS o vendedor sempre pode adicionar atributos livres direto
            * neste produto, sem precisar definir schema antes. */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Atributos do produto</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Material, peso, voltagem, sabor, cor... Aparecem na ficha técnica do produto.
                </p>
              </div>
              <button type="button"
                onClick={() => setShowNewAttrForm(s => !s)}
                className="text-[11px] font-bold text-violet-600 hover:text-violet-700 px-2 py-1 rounded hover:bg-violet-50 flex items-center gap-1">
                <Plus size={11} strokeWidth={2.5} /> {showNewAttrForm ? 'Cancelar' : 'Atributo'}
              </button>
            </div>

            {showNewAttrForm && (
              <div className="mb-3 flex gap-2 items-center bg-violet-50/40 border border-violet-100 rounded-xl p-2">
                <input
                  type="text"
                  autoFocus
                  value={newAttrKey}
                  onChange={e => setNewAttrKey(e.target.value)}
                  placeholder="Nome (ex: Material)"
                  className={inputCls}
                />
                <input
                  type="text"
                  value={newAttrValue}
                  onChange={e => setNewAttrValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newAttrKey.trim() && newAttrValue.trim()) {
                      e.preventDefault()
                      const k = newAttrKey.trim().toLowerCase().replace(/[^a-z0-9_]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
                      if (k) {
                        setAttrValues(prev => ({ ...prev, [k]: newAttrValue.trim() }))
                        setNewAttrKey(''); setNewAttrValue(''); setShowNewAttrForm(false)
                      }
                    }
                  }}
                  placeholder="Valor (ex: Algodão)"
                  className={inputCls}
                />
                <button type="button" disabled={!newAttrKey.trim() || !newAttrValue.trim()}
                  onClick={() => {
                    const k = newAttrKey.trim().toLowerCase().replace(/[^a-z0-9_]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
                    if (!k) return
                    setAttrValues(prev => ({ ...prev, [k]: newAttrValue.trim() }))
                    setNewAttrKey(''); setNewAttrValue(''); setShowNewAttrForm(false)
                  }}
                  className="px-3 py-1.5 rounded-xl bg-violet-600 text-white text-[11px] font-bold hover:bg-violet-700 disabled:opacity-50">
                  Adicionar
                </button>
              </div>
            )}

            {/* Inputs auto-gerados das definições da brand (se houver) */}
            {attrDefs.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                {attrDefs.map((def) => {
                  const v = attrValues[def.key]
                  const set = (val: any) => setAttrValues((prev) => {
                    const next = { ...prev }
                    if (val == null || val === '' || (Array.isArray(val) && val.length === 0)) delete next[def.key]
                    else next[def.key] = val
                    return next
                  })
                  return (
                    <div key={def.id} className={def.type === 'textarea' ? 'sm:col-span-2' : ''}>
                      <label className={labelCls}>
                        {def.label}{def.required ? ' *' : ''}
                      </label>
                      {def.type === 'text' && (
                        <input type="text" value={v || ''} onChange={e => set(e.target.value)} className={inputCls} />
                      )}
                      {def.type === 'textarea' && (
                        <textarea value={v || ''} onChange={e => set(e.target.value)} rows={2}
                          className={inputCls + ' resize-none'} />
                      )}
                      {def.type === 'number' && (
                        <input type="number" step="any" value={v ?? ''} onChange={e => set(e.target.value === '' ? null : Number(e.target.value))} className={inputCls} />
                      )}
                      {def.type === 'date' && (
                        <input type="date" value={v || ''} onChange={e => set(e.target.value)} className={inputCls} />
                      )}
                      {def.type === 'color' && (
                        <div className="flex items-center gap-2">
                          <input type="color" value={v || '#000000'} onChange={e => set(e.target.value)}
                            className="w-12 h-10 border border-gray-200 rounded-lg cursor-pointer" />
                          <input type="text" value={v || ''} onChange={e => set(e.target.value)}
                            placeholder="#000000" className={inputCls + ' font-mono'} />
                        </div>
                      )}
                      {def.type === 'boolean' && (
                        <button type="button" onClick={() => set(!v)}
                          className={`relative w-11 h-6 rounded-full transition ${v ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${v ? 'translate-x-5' : ''}`} />
                        </button>
                      )}
                      {def.type === 'select' && (
                        <select value={v || ''} onChange={e => set(e.target.value)} className={inputCls}>
                          <option value="">— sem valor —</option>
                          {def.options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      )}
                      {def.type === 'multi_select' && (
                        <div className="flex flex-wrap gap-1.5">
                          {def.options.map((opt: string) => {
                            const arr: string[] = Array.isArray(v) ? v : []
                            const selected = arr.includes(opt)
                            return (
                              <button key={opt} type="button"
                                onClick={() => set(selected ? arr.filter(x => x !== opt) : [...arr, opt])}
                                className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition ${
                                  selected ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                                }`}>
                                {opt}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Atributos livres (chaves que NÃO estão nas definições da brand) */}
            {(() => {
              const definedKeys = new Set(attrDefs.map(d => d.key))
              const freeEntries = Object.entries(attrValues).filter(([k]) => !definedKeys.has(k))
              if (freeEntries.length === 0) {
                if (attrDefs.length === 0) {
                  return (
                    <p className="text-[11px] text-gray-400 italic">
                      Nenhum atributo ainda. Clique em "+ Atributo" para adicionar (ex: Material: Algodão).
                    </p>
                  )
                }
                return null
              }
              return (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Atributos livres</p>
                  {freeEntries.map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
                      <span className="text-[11px] font-semibold text-gray-700 min-w-[100px]">{k}:</span>
                      <input type="text" value={String(v ?? '')}
                        onChange={e => setAttrValues(prev => ({ ...prev, [k]: e.target.value }))}
                        className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-200" />
                      <button type="button"
                        onClick={() => setAttrValues(prev => {
                          const next = { ...prev }
                          delete next[k]
                          return next
                        })}
                        className="p-1 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 transition">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                  {attrDefs.length === 0 && (
                    <p className="text-[10px] text-gray-400 mt-1.5">
                      Dica: se quiser que estes atributos virem <strong>filtros no catálogo público</strong>,
                      defina-os em <em>Catálogo → Atributos</em>.
                    </p>
                  )}
                </div>
              )
            })()}
          </div>

          {/* ── Service config (Fase 5) — only when type is service/appointment ── */}
          {(offerType === 'service' || offerType === 'appointment') && (
            <div className="border-t border-gray-100 pt-4">
              <div className="mb-2">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Configuração de serviço</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Duração, horários de atendimento e capacidade.</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelCls}>Duração (min)</label>
                  <input type="number" min={5} step={5} value={serviceConfig.duration_minutes ?? 60}
                    onChange={e => setServiceConfig({ ...serviceConfig, duration_minutes: Number(e.target.value) || 60 })}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Buffer (min)</label>
                  <input type="number" min={0} step={5} value={serviceConfig.buffer_minutes ?? 0}
                    onChange={e => setServiceConfig({ ...serviceConfig, buffer_minutes: Number(e.target.value) || 0 })}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Capacidade</label>
                  <input type="number" min={1} step={1} value={serviceConfig.max_per_slot ?? 1}
                    onChange={e => setServiceConfig({ ...serviceConfig, max_per_slot: Number(e.target.value) || 1 })}
                    className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <label className={labelCls}>Antecedência mínima (h)</label>
                  <input type="number" min={0} step={1} value={serviceConfig.advance_notice_hours ?? 1}
                    onChange={e => setServiceConfig({ ...serviceConfig, advance_notice_hours: Number(e.target.value) || 0 })}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Janela futura máx. (dias)</label>
                  <input type="number" min={1} step={1} value={serviceConfig.max_advance_days ?? 30}
                    onChange={e => setServiceConfig({ ...serviceConfig, max_advance_days: Number(e.target.value) || 30 })}
                    className={inputCls} />
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label className={labelCls}>Horários por dia da semana</label>
                  <button type="button"
                    onClick={() => setServiceConfig({
                      ...serviceConfig,
                      weekday_hours: [...(serviceConfig.weekday_hours || []), { weekday: 1, start: '09:00', end: '18:00' }],
                    })}
                    className="text-[11px] font-bold text-violet-600 hover:text-violet-700 px-2 py-1 rounded hover:bg-violet-50">
                    + horário
                  </button>
                </div>
                {(serviceConfig.weekday_hours || []).length === 0 ? (
                  <p className="text-[11px] text-gray-400 italic">Sem horários — o produto não será agendável.</p>
                ) : (
                  <div className="space-y-1.5">
                    {(serviceConfig.weekday_hours || []).map((h: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                        <select value={h.weekday}
                          onChange={e => {
                            const next = [...(serviceConfig.weekday_hours || [])]
                            next[idx] = { ...next[idx], weekday: Number(e.target.value) }
                            setServiceConfig({ ...serviceConfig, weekday_hours: next })
                          }}
                          className="px-2 py-1 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-violet-200">
                          {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((d, i) => <option key={i} value={i}>{d}</option>)}
                        </select>
                        <input type="time" value={h.start}
                          onChange={e => {
                            const next = [...(serviceConfig.weekday_hours || [])]
                            next[idx] = { ...next[idx], start: e.target.value }
                            setServiceConfig({ ...serviceConfig, weekday_hours: next })
                          }}
                          className="px-2 py-1 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-violet-200" />
                        <span className="text-xs text-gray-400">—</span>
                        <input type="time" value={h.end}
                          onChange={e => {
                            const next = [...(serviceConfig.weekday_hours || [])]
                            next[idx] = { ...next[idx], end: e.target.value }
                            setServiceConfig({ ...serviceConfig, weekday_hours: next })
                          }}
                          className="px-2 py-1 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-violet-200" />
                        <button type="button"
                          onClick={() => {
                            const next = (serviceConfig.weekday_hours || []).filter((_, i) => i !== idx)
                            setServiceConfig({ ...serviceConfig, weekday_hours: next })
                          }}
                          className="ml-auto p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3 mt-3">
                <span className="text-xs font-medium text-gray-600">Solicitar endereço do cliente</span>
                <button type="button" onClick={() => setServiceConfig({ ...serviceConfig, requires_address: !serviceConfig.requires_address })}
                  className={`relative w-10 h-5 rounded-full transition ${serviceConfig.requires_address ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${serviceConfig.requires_address ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            </div>
          )}

          {/* ── Bundle / Kit (Fase 11) — only when type=bundle ── */}
          {offerType === 'bundle' && (
            <div className="border-t border-gray-100 pt-4">
              <div className="mb-2">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Composição do kit</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Produtos que vão neste kit. O preço final é o da unidade (configurado acima), não a soma dos itens.</p>
              </div>
              {bundleItems.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic py-2 mb-2">Sem itens. Selecione produtos abaixo pra adicionar.</p>
              ) : (
                <div className="space-y-1.5 mb-3">
                  {bundleItems.map((it, idx) => {
                    const p = allProducts.find((x: any) => x.id === it.product_id) || (product?.id === it.product_id ? product : null)
                    const name = p?.name || `Produto ${it.product_id.slice(0, 8)}…`
                    return (
                      <div key={it.product_id} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                        <span className="flex-1 text-xs text-gray-700 truncate">{name}</span>
                        <input type="number" min={1} value={it.quantity}
                          onChange={e => updateBundleItem(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                          className="w-16 px-2 py-1 border border-gray-200 rounded text-xs text-center bg-white focus:outline-none focus:ring-2 focus:ring-violet-200" />
                        <span className="text-[10px] text-gray-400">un</span>
                        <button type="button" onClick={() => removeBundleItem(idx)}
                          className="p-1 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 transition">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              <select value="" onChange={e => { if (e.target.value) addBundleItem(e.target.value); e.target.value = '' }}
                className={inputCls}>
                <option value="">+ Adicionar produto ao kit</option>
                {allProducts
                  .filter((p: any) => !bundleItems.some(bi => bi.product_id === p.id))
                  .filter((p: any) => p.type !== 'bundle')  /* não permitir nested bundles */
                  .map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
              </select>
            </div>
          )}

          {/* ── Configurador (Fase 4) ── */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Configurador</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Use para produtos com opções: pizza (tamanho + sabores), carro (motor + pacote), serviço sob medida.</p>
              </div>
              <button type="button" onClick={() => setConfigurator(c => ({ ...c, enabled: !c.enabled }))}
                className={`relative w-10 h-5 rounded-full transition ${configurator.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${configurator.enabled ? 'translate-x-5' : ''}`} />
              </button>
            </div>
            {configurator.enabled && (
              <>
                {configurator.groups.length === 0 ? (
                  <p className="text-[11px] text-gray-400 italic py-2">Sem grupos. Adicione "Tamanho", "Sabores", "Extras" etc.</p>
                ) : (
                  <div className="space-y-2">
                    {configurator.groups.map((g, gi) => (
                      <div key={gi} className="border border-gray-200 rounded-xl p-3 bg-gray-50/50">
                        <div className="flex items-center gap-2 mb-2">
                          <input type="text" value={g.name}
                            onChange={e => updateGroup(gi, { name: e.target.value })}
                            placeholder="Nome do grupo"
                            className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-violet-200" />
                          <button type="button" onClick={() => removeGroup(gi)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition">
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 mb-2">
                          <label className="flex items-center gap-1.5 text-[10px] text-gray-600">
                            <input type="checkbox" checked={g.required}
                              onChange={e => updateGroup(gi, { required: e.target.checked, min_select: e.target.checked ? Math.max(1, g.min_select) : 0 })} />
                            Obrigatório
                          </label>
                          <div>
                            <label className="block text-[9px] text-gray-400 uppercase font-bold tracking-wider">Mín</label>
                            <input type="number" min={0} value={g.min_select}
                              onChange={e => updateGroup(gi, { min_select: Number(e.target.value) || 0 })}
                              className="w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white" />
                          </div>
                          <div>
                            <label className="block text-[9px] text-gray-400 uppercase font-bold tracking-wider">Máx</label>
                            <input type="number" min={1} value={g.max_select}
                              onChange={e => updateGroup(gi, { max_select: Number(e.target.value) || 1 })}
                              className="w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white" />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          {g.options.map((o, oi) => (
                            <div key={oi} className="flex items-center gap-1.5 bg-white rounded-lg p-1.5">
                              <input type="text" value={o.name}
                                onChange={e => updateOption(gi, oi, { name: e.target.value })}
                                placeholder="Nome da opção"
                                className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-violet-200" />
                              <input type="number" step="0.01" value={o.price_delta}
                                onChange={e => updateOption(gi, oi, { price_delta: Number(e.target.value) || 0 })}
                                placeholder="+R$"
                                className="w-20 px-2 py-1 border border-gray-200 rounded text-xs text-right focus:outline-none focus:ring-2 focus:ring-violet-200" />
                              <button type="button" onClick={() => removeOption(gi, oi)}
                                className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition">
                                <Trash2 size={11} />
                              </button>
                            </div>
                          ))}
                          <button type="button" onClick={() => addOption(gi)}
                            className="text-[11px] font-bold text-violet-600 hover:text-violet-700 px-2 py-1 rounded hover:bg-violet-50 flex items-center gap-1">
                            <Plus size={11} strokeWidth={2.5} /> Adicionar opção
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button type="button" onClick={addConfigGroup}
                  className="mt-2 text-[12px] font-bold text-violet-600 hover:text-violet-700 px-3 py-1.5 rounded-lg hover:bg-violet-50 flex items-center gap-1">
                  <Plus size={12} strokeWidth={2.5} /> Adicionar grupo
                </button>
              </>
            )}
          </div>

          {/* ── Variantes (Fase 1) ── */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Variações</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Ex: 500g/1kg, P/M/G, Casal/Queen/King. Sobrescrevem preço e estoque do produto.</p>
              </div>
              <button type="button" onClick={addVariant}
                className="text-[11px] font-bold text-violet-600 hover:text-violet-700 px-2.5 py-1.5 rounded-lg hover:bg-violet-50 transition flex items-center gap-1">
                <Plus size={12} strokeWidth={2.5} /> Adicionar
              </button>
            </div>
            {variants.length === 0 ? (
              <p className="text-[11px] text-gray-400 italic py-2">Sem variações. O produto será vendido em uma única opção.</p>
            ) : (
              <div className="space-y-2">
                {variants.map((v, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-xl p-3 space-y-2 relative">
                    <button type="button" onClick={() => removeVariant(idx)}
                      aria-label="Remover variação"
                      className="absolute top-2 right-2 w-6 h-6 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 grid place-items-center transition">
                      <Trash2 size={12} />
                    </button>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input type="text" value={v.name || ''}
                        onChange={e => updateVariant(idx, { name: e.target.value })}
                        placeholder="Nome (ex: 1kg, Tamanho M)"
                        className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-200" />
                      <input type="text" value={v.sku || ''}
                        onChange={e => updateVariant(idx, { sku: e.target.value })}
                        placeholder="SKU (opcional)"
                        className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-200" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <input type="number" step="0.01" value={v.price || ''}
                        onChange={e => updateVariant(idx, { price: e.target.value })}
                        placeholder="Preço"
                        className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-200" />
                      <input type="number" step="0.01" value={v.promo_price || ''}
                        onChange={e => updateVariant(idx, { promo_price: e.target.value })}
                        placeholder="Promo"
                        className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-200" />
                      <input type="number" step="1" value={v.stock_quantity || ''}
                        onChange={e => updateVariant(idx, { stock_quantity: e.target.value })}
                        placeholder="Estoque"
                        className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-200" />
                    </div>
                    <div className="flex gap-2 flex-wrap items-center">
                      {Object.entries(v.attributes || {}).map(([k, val]) => (
                        <span key={k} className="bg-white border border-gray-200 rounded-full px-2 py-0.5 text-[10px] text-gray-700 flex items-center gap-1">
                          {k}: {val}
                          <button type="button" onClick={() => updateVariantAttr(idx, k, '')}
                            className="text-gray-400 hover:text-red-500">×</button>
                        </span>
                      ))}
                      {variantAttrDraft[idx] ? (
                        <span className="inline-flex items-center gap-1 bg-violet-50 border border-violet-200 rounded-full px-1.5 py-0.5">
                          <input
                            type="text"
                            autoFocus
                            value={variantAttrDraft[idx]?.key || ''}
                            onChange={e => setVariantAttrDraft(d => ({ ...d, [idx]: { ...(d[idx] || { key: '', value: '' }), key: e.target.value } }))}
                            placeholder="cor"
                            className="text-[10px] bg-transparent border-b border-violet-300 focus:outline-none w-14"
                          />
                          <span className="text-[10px] text-gray-400">:</span>
                          <input
                            type="text"
                            value={variantAttrDraft[idx]?.value || ''}
                            onChange={e => setVariantAttrDraft(d => ({ ...d, [idx]: { ...(d[idx] || { key: '', value: '' }), value: e.target.value } }))}
                            onKeyDown={e => {
                              const draft = variantAttrDraft[idx]
                              if (e.key === 'Enter' && draft?.key.trim() && draft?.value.trim()) {
                                e.preventDefault()
                                updateVariantAttr(idx, draft.key.trim().toLowerCase(), draft.value.trim())
                                setVariantAttrDraft(d => ({ ...d, [idx]: null }))
                              }
                              if (e.key === 'Escape') setVariantAttrDraft(d => ({ ...d, [idx]: null }))
                            }}
                            placeholder="azul"
                            className="text-[10px] bg-transparent border-b border-violet-300 focus:outline-none w-16"
                          />
                          <button type="button"
                            onClick={() => {
                              const draft = variantAttrDraft[idx]
                              if (!draft?.key.trim() || !draft?.value.trim()) return
                              updateVariantAttr(idx, draft.key.trim().toLowerCase(), draft.value.trim())
                              setVariantAttrDraft(d => ({ ...d, [idx]: null }))
                            }}
                            className="text-violet-600 text-[10px] font-bold px-1 hover:text-violet-700">OK</button>
                          <button type="button"
                            onClick={() => setVariantAttrDraft(d => ({ ...d, [idx]: null }))}
                            className="text-gray-400 text-[10px] px-1 hover:text-red-500">×</button>
                        </span>
                      ) : (
                        <button type="button"
                          onClick={() => setVariantAttrDraft(d => ({ ...d, [idx]: { key: '', value: '' } }))}
                          className="text-[10px] font-bold text-violet-600 hover:text-violet-700 px-2 py-0.5 rounded-full hover:bg-violet-50">
                          + atributo
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Produtos relacionados (Fase 6) ── */}
          {allProducts.length > 0 && (
            <div className="border-t border-gray-100 pt-4">
              <div className="mb-2">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Produtos relacionados</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Aparecem como "Você também pode gostar" no catálogo público.</p>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1 border border-gray-200 rounded-xl p-2 bg-white">
                {allProducts.map((p: any) => {
                  const selected = relatedIds.includes(p.id)
                  return (
                    <button key={p.id} type="button"
                      onClick={() => setRelatedIds(prev => selected ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition ${
                        selected ? 'bg-violet-50 ring-1 ring-violet-300' : 'hover:bg-gray-50'
                      }`}>
                      <span className={`w-4 h-4 rounded border grid place-items-center shrink-0 ${
                        selected ? 'bg-violet-600 border-violet-600' : 'border-gray-300'
                      }`}>
                        {selected && <CheckCircle2 size={10} className="text-white" />}
                      </span>
                      <span className="flex-1 text-xs text-gray-700 truncate">{p.name}</span>
                      <span className="text-[10px] text-gray-400 tabular-nums">{money(Number(p.price || 0))}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-[10px] text-gray-400 mt-1">{relatedIds.length} selecionado(s)</p>
            </div>
          )}

          {/* ── SEO (Fase 6) ── */}
          <div className="border-t border-gray-100 pt-4">
            <div className="mb-2">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">SEO</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Como o produto aparece em buscas e quando compartilhado.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Título (meta)</label>
                <input type="text" value={(seoValues.meta_title as string) || ''}
                  onChange={e => setSeoValues({ ...seoValues, meta_title: e.target.value })}
                  placeholder={`Padrão: ${name || 'nome do produto'}`}
                  className={inputCls} maxLength={70} />
                <p className="text-[9px] text-gray-400 mt-0.5">{((seoValues.meta_title as string) || '').length}/70</p>
              </div>
              <div>
                <label className={labelCls}>Descrição (meta)</label>
                <input type="text" value={(seoValues.meta_description as string) || ''}
                  onChange={e => setSeoValues({ ...seoValues, meta_description: e.target.value })}
                  placeholder="Resumo curto para Google/WhatsApp"
                  className={inputCls} maxLength={160} />
                <p className="text-[9px] text-gray-400 mt-0.5">{((seoValues.meta_description as string) || '').length}/160</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
            <span className="text-xs font-medium text-gray-600">Produto ativo</span>
            <button type="button" onClick={() => setActive(!active)}
              className={`relative w-10 h-5 rounded-full transition ${active ? 'bg-emerald-500' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${active ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 transition">Cancelar</button>
            {isEdit && onDelete && (
              <button onClick={async () => {
                const ok = await confirm({
                  title: 'Excluir produto permanentemente?',
                  message: (
                    <>
                      {name ? <span>O produto <b>{name}</b> sera excluido do catalogo.</span> : 'O produto sera excluido do catalogo.'}{' '}
                      <span className="text-gray-400">Pedidos antigos sao mantidos no historico.</span>
                    </>
                  ),
                  confirmLabel: 'Excluir',
                  cancelLabel: 'Cancelar',
                  variant: 'danger',
                })
                if (ok) onDelete(product.id)
              }}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-red-500 text-xs font-semibold hover:bg-red-50 transition">
                <Trash2 size={13} /> Excluir
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => save('draft')} disabled={saving}
              className="px-4 py-2.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold hover:bg-amber-100 disabled:opacity-50 transition">
              {saving ? 'Salvando...' : 'Salvar rascunho'}
            </button>
            <button onClick={() => save('publish')} disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 disabled:opacity-50 transition-all shadow-sm">
              {saving ? 'Salvando...' : isEdit ? 'Publicar' : 'Criar produto'}
            </button>
          </div>
        </div>
      </div>

      <MediaPickerModal
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        accept={['image']}
        folder="produtos"
        title="Escolher imagem do produto"
        useContext="product"
        contextId={product?.id}
        onSelect={(item: GalleryItem) => {
          setImageUrl(item.url)
          setGalleryOpen(false)
        }}
      />
    </div>
  )
}

/* ══════════════════════════════════════════════
   COLLECTIONS MANAGER (Fase 1)
   ══════════════════════════════════════════════ */
function CollectionsManager({
  products,
  showToast,
}: {
  products: any[]
  showToast: (t: string, tp?: 'ok' | 'err') => void
}) {
  const [collections, setCollections] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<any | null>(null)
  const [newName, setNewName] = useState('')
  const { confirm } = useConfirm()

  function load() {
    setLoading(true)
    fetch('/api/collections', { headers: getHeaders() })
      .then(r => r.json())
      .then(d => { setCollections(d.collections || []); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function createCollection() {
    if (!newName.trim()) return
    try {
      const r = await fetch('/api/collections', {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ name: newName.trim(), type: 'manual', product_ids: [] }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      setNewName('')
      showToast('Coleção criada!')
      load()
      setEditing(d.collection)
    } catch (e: any) { showToast(e.message, 'err') }
  }

  async function saveCollection(c: any) {
    try {
      const r = await fetch(`/api/collections/${c.id}`, {
        method: 'PATCH', headers: getHeaders(),
        body: JSON.stringify({
          name: c.name,
          description: c.description,
          product_ids: c.product_ids || [],
          is_active: c.is_active !== false,
          position: c.position || 0,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast('Coleção atualizada!')
      load()
      setEditing(null)
    } catch (e: any) { showToast(e.message, 'err') }
  }

  async function deleteCollection(id: string) {
    const coll = collections.find(c => c.id === id)
    const ok = await confirm({
      title: 'Remover colecao?',
      message: coll?.name
        ? <span>A colecao <b>{coll.name}</b> sera removida. <span className="text-gray-400">Os produtos dela continuam no catalogo.</span></span>
        : <>A colecao sera removida. <span className="text-gray-400">Os produtos dela continuam no catalogo.</span></>,
      confirmLabel: 'Remover',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (!ok) return
    await fetch(`/api/collections/${id}`, { method: 'DELETE', headers: getHeaders() }).catch(() => {})
    showToast('Coleção removida')
    load()
  }

  function toggleProduct(c: any, productId: string) {
    const current = Array.isArray(c.product_ids) ? c.product_ids : []
    const next = current.includes(productId)
      ? current.filter((x: string) => x !== productId)
      : [...current, productId]
    setEditing({ ...c, product_ids: next })
  }

  if (loading) return <Skeleton rows={4} />

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-border-light p-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Criar nova coleção</p>
        <div className="flex gap-2">
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Ex: Mais vendidos, Promoções, Premium"
            onKeyDown={e => e.key === 'Enter' && createCollection()}
            className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
          <button onClick={createCollection} disabled={!newName.trim()}
            className="px-4 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-50 transition">
            Criar
          </button>
        </div>
      </div>

      {collections.length === 0 && (
        <EmptyState icon={Boxes} text="Nenhuma coleção ainda. Crie uma para agrupar produtos." />
      )}

      <div className="space-y-2">
        {collections.map((c: any) => {
          const isEditing = editing?.id === c.id
          const current = isEditing ? editing : c
          const count = (current.product_ids || []).length
          return (
            <div key={c.id} className="bg-white border border-border-light rounded-2xl overflow-hidden">
              <div className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-gray-900 truncate">{c.name}</p>
                    {!c.is_active && <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">Inativa</span>}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">{count} produto(s) · slug: {c.slug}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditing(isEditing ? null : c)}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-violet-600 hover:bg-violet-50 transition">
                    {isEditing ? 'Cancelar' : 'Editar'}
                  </button>
                  <button onClick={() => deleteCollection(c.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {isEditing && (
                <div className="border-t border-gray-100 p-4 space-y-3 bg-gray-50/50">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input type="text" value={current.name}
                      onChange={e => setEditing({ ...current, name: e.target.value })}
                      placeholder="Nome"
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
                    <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-200">
                      <span className="text-xs text-gray-600">Coleção ativa</span>
                      <button type="button"
                        onClick={() => setEditing({ ...current, is_active: !current.is_active })}
                        className={`relative w-9 h-5 rounded-full transition ${current.is_active !== false ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${current.is_active !== false ? 'translate-x-4' : ''}`} />
                      </button>
                    </div>
                  </div>
                  <textarea value={current.description || ''}
                    onChange={e => setEditing({ ...current, description: e.target.value })}
                    rows={2} placeholder="Descrição (opcional)"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none" />

                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Produtos incluídos</p>
                    <div className="max-h-72 overflow-y-auto space-y-1 border border-gray-200 rounded-xl p-2 bg-white">
                      {products.length === 0 ? (
                        <p className="text-[11px] text-gray-400 italic text-center py-4">Sem produtos no catálogo.</p>
                      ) : products.map((p: any) => {
                        const selected = (current.product_ids || []).includes(p.id)
                        return (
                          <button key={p.id} type="button"
                            onClick={() => toggleProduct(current, p.id)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition ${
                              selected ? 'bg-violet-50 ring-1 ring-violet-300' : 'hover:bg-gray-50'
                            }`}>
                            <span className={`w-4 h-4 rounded border grid place-items-center shrink-0 ${
                              selected ? 'bg-violet-600 border-violet-600' : 'border-gray-300'
                            }`}>
                              {selected && <CheckCircle2 size={10} className="text-white" />}
                            </span>
                            <span className="flex-1 text-xs text-gray-700 truncate">{p.name}</span>
                            <span className="text-[10px] text-gray-400 tabular-nums">{money(Number(p.price || 0))}</span>
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">{(current.product_ids || []).length} selecionado(s)</p>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => setEditing(null)}
                      className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 transition">
                      Cancelar
                    </button>
                    <button onClick={() => saveCollection(current)}
                      className="px-5 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 transition shadow-sm">
                      Salvar coleção
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   ATTRIBUTE DEFINITIONS MANAGER (Fase 2)
   ══════════════════════════════════════════════ */
type AttrType = 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'multi_select' | 'color' | 'date'

interface AttributeDef {
  id: string
  key: string
  label: string
  type: AttrType
  options: string[]
  required: boolean
  is_filter: boolean
  position: number
}

const ATTR_TYPE_LABELS: Record<AttrType, string> = {
  text: 'Texto curto',
  textarea: 'Texto longo',
  number: 'Número',
  boolean: 'Sim / Não',
  select: 'Lista (1 opção)',
  multi_select: 'Lista (várias opções)',
  color: 'Cor',
  date: 'Data',
}

function AttributeDefinitionsManager({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [defs, setDefs] = useState<AttributeDef[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AttributeDef | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newType, setNewType] = useState<AttrType>('text')
  const { confirm } = useConfirm()

  function load() {
    setLoading(true)
    fetch('/api/attribute-definitions', { headers: getHeaders() })
      .then(r => r.json())
      .then(d => { setDefs(d.definitions || []); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function createDef() {
    if (!newLabel.trim()) return
    try {
      const r = await fetch('/api/attribute-definitions', {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ label: newLabel.trim(), type: newType, is_filter: true }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      setNewLabel('')
      setNewType('text')
      showToast('Atributo criado!')
      load()
    } catch (e: any) { showToast(e.message, 'err') }
  }

  async function saveDef(def: AttributeDef) {
    try {
      const r = await fetch(`/api/attribute-definitions/${def.id}`, {
        method: 'PATCH', headers: getHeaders(),
        body: JSON.stringify({
          label: def.label,
          type: def.type,
          options: def.options,
          required: def.required,
          is_filter: def.is_filter,
          position: def.position,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast('Atributo atualizado!')
      setEditing(null)
      load()
    } catch (e: any) { showToast(e.message, 'err') }
  }

  async function deleteDef(id: string) {
    const def = defs.find(d => d.id === id)
    const ok = await confirm({
      title: 'Excluir atributo?',
      message: (
        <>
          {def?.label ? <span>O atributo <b>{def.label}</b> sera excluido.</span> : 'O atributo sera excluido.'}{' '}
          <span className="text-gray-400">Produtos que o usam mantem o valor, mas perdem a estrutura.</span>
        </>
      ),
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (!ok) return
    await fetch(`/api/attribute-definitions/${id}`, { method: 'DELETE', headers: getHeaders() }).catch(() => {})
    showToast('Atributo removido')
    load()
  }

  if (loading) return <Skeleton rows={4} />

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-border-light p-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Criar novo atributo</p>
        <p className="text-[10px] text-gray-400 mb-3">Atributos viram inputs no formulário de produto e filtros no catálogo público.</p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
          <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
            placeholder="Ex: Cor, Tamanho, Peso, Sabor, Material..."
            onKeyDown={e => e.key === 'Enter' && createDef()}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
          <select value={newType} onChange={e => setNewType(e.target.value as AttrType)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200">
            {Object.entries(ATTR_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button onClick={createDef} disabled={!newLabel.trim()}
            className="px-4 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-50 transition">
            Criar
          </button>
        </div>
      </div>

      {defs.length === 0 ? (
        <EmptyState icon={FileText} text="Nenhum atributo definido ainda." />
      ) : (
        <div className="space-y-2">
          {defs.map(def => {
            const isEditing = editing?.id === def.id
            const current = isEditing ? editing : def
            const isList = current.type === 'select' || current.type === 'multi_select'
            return (
              <div key={def.id} className="bg-white border border-border-light rounded-2xl overflow-hidden">
                <div className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-900 truncate">{def.label}</p>
                      <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{ATTR_TYPE_LABELS[def.type]}</span>
                      {def.required && <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">obrigatório</span>}
                      {!def.is_filter && <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">oculto do filtro</span>}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 font-mono">key: {def.key}</p>
                    {isList && def.options.length > 0 && (
                      <p className="text-[11px] text-gray-500 mt-0.5">opções: {def.options.join(', ')}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditing(isEditing ? null : def)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-violet-600 hover:bg-violet-50 transition">
                      {isEditing ? 'Cancelar' : 'Editar'}
                    </button>
                    <button onClick={() => deleteDef(def.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div className="border-t border-gray-100 p-4 space-y-3 bg-gray-50/50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Nome exibido</label>
                        <input type="text" value={current.label}
                          onChange={e => setEditing({ ...current, label: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Tipo</label>
                        <select value={current.type}
                          onChange={e => setEditing({ ...current, type: e.target.value as AttrType })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-200">
                          {Object.entries(ATTR_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                      </div>
                    </div>

                    {(current.type === 'select' || current.type === 'multi_select') && (
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Opções (separadas por vírgula)</label>
                        <input type="text" value={current.options.join(', ')}
                          onChange={e => setEditing({ ...current, options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                          placeholder="Ex: Pequeno, Médio, Grande"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button type="button"
                        onClick={() => setEditing({ ...current, required: !current.required })}
                        className={`flex items-center justify-between rounded-lg px-3 py-2 border ${current.required ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'} text-xs`}>
                        <span className={current.required ? 'text-amber-700 font-semibold' : 'text-gray-600'}>Obrigatório</span>
                        <span className={`w-9 h-5 rounded-full relative transition ${current.required ? 'bg-amber-500' : 'bg-gray-300'}`}>
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${current.required ? 'translate-x-4' : ''}`} />
                        </span>
                      </button>
                      <button type="button"
                        onClick={() => setEditing({ ...current, is_filter: !current.is_filter })}
                        className={`flex items-center justify-between rounded-lg px-3 py-2 border ${current.is_filter ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-white'} text-xs`}>
                        <span className={current.is_filter ? 'text-emerald-700 font-semibold' : 'text-gray-600'}>Mostrar como filtro</span>
                        <span className={`w-9 h-5 rounded-full relative transition ${current.is_filter ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${current.is_filter ? 'translate-x-4' : ''}`} />
                        </span>
                      </button>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button onClick={() => setEditing(null)}
                        className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 transition">
                        Cancelar
                      </button>
                      <button onClick={() => saveDef(current)}
                        className="px-5 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 transition shadow-sm">
                        Salvar atributo
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   DESIGN REDIRECT
   ══════════════════════════════════════════════ */
/* ══════════════════════════════════════════════
   MESSAGES VIEW (Sessions)
   ══════════════════════════════════════════════ */
