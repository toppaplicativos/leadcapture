/**
 * CriativosPage — assistant-style creative generator.
 *
 * Replaces the prior "fill 30 fields then click Generate" page with a
 * three-step flow:
 *   1. User picks a section (Promo, Launch, Social proof, Educational,
 *      Date, Win-back, Featured) — or accepts a proactive suggestion.
 *   2. User picks a product from their catalog (visual grid, search).
 *   3. Backend auto-composes the prompt from product + section + brand kit
 *      and returns generated images.
 *
 * The old, fully-manual `BrandImageGeneratorPage` is preserved at
 * `/criativos/avancado` for power users.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Sparkles, Loader2, Search, X, ArrowRight, Download, RefreshCw,
  ImageIcon, ChevronLeft, Wrench, Tag, Star, Zap, Send, CheckCircle2,
} from 'lucide-react'

/* ── Auth helpers (matches the rest of the admin app) ─────────────── */
function getHeaders(json = true): Record<string, string> {
  const h: Record<string, string> = {}
  if (json) h['Content-Type'] = 'application/json'
  const token = localStorage.getItem('lead-system-token')
  if (token) h.Authorization = `Bearer ${token}`
  const brandId = localStorage.getItem('lead-system:active-brand-id')
  if (brandId) h['x-brand-id'] = brandId
  return h
}

/* Cents/Reais formatter — products may store price as either. */
function brl(value: number | string | null | undefined): string {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return 'R$ 0,00'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/* ── Types ────────────────────────────────────────────────────────── */
interface Section {
  id: string
  label: string
  emoji: string
  description: string
  formats: string[]
}

interface Product {
  id: string
  name: string
  description?: string
  category?: string
  price?: number
  promoPrice?: number | null
  unit?: string
  features?: string[] | string
  imageUrl?: string
  image?: string
  active?: boolean
  is_active?: boolean
}

interface Suggestion {
  productId: string
  productName: string
  productImage: string | null
  sectionId: string
  sectionLabel: string
  reason: string
  badge?: string
}

interface GeneratedAsset {
  id: string
  fileUrl?: string
  prompt?: string
  metadata?: any
}

/* Map section id → accent color for the small chip / hero card. Kept
 * in the frontend so we don't need a /theme call. */
const SECTION_TINT: Record<string, { bg: string; ring: string; text: string; icon: any }> = {
  'promo': { bg: 'bg-rose-50', ring: 'ring-rose-200', text: 'text-rose-700', icon: Tag },
  'launch': { bg: 'bg-violet-50', ring: 'ring-violet-200', text: 'text-violet-700', icon: Zap },
  'social-proof': { bg: 'bg-emerald-50', ring: 'ring-emerald-200', text: 'text-emerald-700', icon: Star },
  'educational': { bg: 'bg-sky-50', ring: 'ring-sky-200', text: 'text-sky-700', icon: ImageIcon },
  'date': { bg: 'bg-amber-50', ring: 'ring-amber-200', text: 'text-amber-700', icon: Sparkles },
  'winback': { bg: 'bg-fuchsia-50', ring: 'ring-fuchsia-200', text: 'text-fuchsia-700', icon: RefreshCw },
  'featured': { bg: 'bg-gray-100', ring: 'ring-gray-200', text: 'text-gray-800', icon: Star },
}

/* ══════════════════════════════════════════════════════════════════
 * Page
 * ══════════════════════════════════════════════════════════════════ */
export function CriativosPage() {
  const [sections, setSections] = useState<Section[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loadingMeta, setLoadingMeta] = useState(true)

  /* Active step state. Null = the home grid with sections + suggestions. */
  const [pickerOpen, setPickerOpen] = useState<{ sectionId: string } | null>(null)
  const [generating, setGenerating] = useState<{
    sectionId: string
    productId: string
    productName: string
    sectionLabel: string
  } | null>(null)
  const [generatedAssets, setGeneratedAssets] = useState<GeneratedAsset[] | null>(null)
  const [generationError, setGenerationError] = useState<string | null>(null)

  /* Initial fetch: sections + suggestions in parallel. */
  useEffect(() => {
    let alive = true
    Promise.all([
      fetch('/api/ai/creatives/sections', { headers: getHeaders() }).then((r) => r.json()).catch(() => ({})),
      fetch('/api/ai/creatives/suggestions', { headers: getHeaders() }).then((r) => r.json()).catch(() => ({})),
    ]).then(([s, g]) => {
      if (!alive) return
      setSections(s.sections || [])
      setSuggestions(g.suggestions || [])
      setLoadingMeta(false)
    })
    return () => {
      alive = false
    }
  }, [])

  /* User clicked a section card OR accepted a suggestion. */
  function startFromSection(sectionId: string) {
    setPickerOpen({ sectionId })
  }
  function startFromSuggestion(s: Suggestion) {
    runAutoCompose(s.sectionId, s.productId, s.productName, s.sectionLabel)
  }

  /* Product picker → kicks off generation. */
  function onProductPicked(p: Product) {
    if (!pickerOpen) return
    const section = sections.find((s) => s.id === pickerOpen.sectionId)
    setPickerOpen(null)
    runAutoCompose(pickerOpen.sectionId, p.id, p.name, section?.label || '')
  }

  async function runAutoCompose(
    sectionId: string,
    productId: string,
    productName: string,
    sectionLabel: string,
  ) {
    setGenerating({ sectionId, productId, productName, sectionLabel })
    setGeneratedAssets(null)
    setGenerationError(null)
    try {
      const r = await fetch('/api/ai/creatives/auto-compose', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ productId, sectionId, variations: 2 }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Falha ao gerar criativo')
      setGeneratedAssets(data.assets || [])
    } catch (err: any) {
      setGenerationError(err?.message || 'Erro inesperado')
    }
  }

  function backToHome() {
    setGenerating(null)
    setGeneratedAssets(null)
    setGenerationError(null)
  }

  function regenerate() {
    if (!generating) return
    runAutoCompose(generating.sectionId, generating.productId, generating.productName, generating.sectionLabel)
  }

  /* ── Render: result screen ────────────────────────────────────── */
  if (generating) {
    return (
      <ResultScreen
        sectionLabel={generating.sectionLabel}
        productName={generating.productName}
        loading={!generatedAssets && !generationError}
        error={generationError}
        assets={generatedAssets}
        onBack={backToHome}
        onRegenerate={regenerate}
      />
    )
  }

  /* ── Render: home grid ────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Criativos</h2>
          <p className="text-[13px] text-gray-500 mt-0.5">
            Escolha um tipo de post — a IA monta tudo a partir do seu catálogo.
          </p>
        </div>
        <Link
          to="/criativos/avancado"
          className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full bg-white text-gray-700 text-[12px] font-semibold ring-1 ring-gray-200 hover:bg-gray-50 transition"
        >
          <Wrench size={13} strokeWidth={1.75} />
          Modo avançado
        </Link>
      </header>

      {/* ── Suggestions row ─ */}
      {suggestions.length > 0 && (
        <section>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 mb-2">
            ⚡ Sugestões pra hoje
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {suggestions.map((s) => (
              <SuggestionCard key={`${s.productId}-${s.sectionId}`} suggestion={s} onClick={() => startFromSuggestion(s)} />
            ))}
          </div>
        </section>
      )}

      {/* ── Sections grid ─ */}
      <section>
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 mb-2">
          🎨 Tipo de criativo
        </p>
        {loadingMeta ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-32 rounded-2xl skeleton" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {sections.map((s) => (
              <SectionCard key={s.id} section={s} onClick={() => startFromSection(s.id)} />
            ))}
          </div>
        )}
      </section>

      {/* ── Product picker modal ─ */}
      {pickerOpen && (
        <ProductPickerModal
          sectionLabel={sections.find((s) => s.id === pickerOpen.sectionId)?.label || ''}
          onClose={() => setPickerOpen(null)}
          onPick={onProductPicked}
        />
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
 * Section card — one of the 7 presets in the grid
 * ══════════════════════════════════════════════════════════════════ */
function SectionCard({ section, onClick }: { section: Section; onClick: () => void }) {
  const tint = SECTION_TINT[section.id] || SECTION_TINT.featured
  return (
    <button
      onClick={onClick}
      className={`group text-left p-5 rounded-2xl ring-1 ${tint.ring} ${tint.bg} hover:shadow-sm hover:scale-[1.01] active:scale-[0.99] transition-all`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-[24px] leading-none">{section.emoji}</span>
        <span className={`text-[10px] font-mono font-semibold ${tint.text} opacity-50`}>
          {section.formats.length} formato{section.formats.length > 1 ? 's' : ''}
        </span>
      </div>
      <p className={`text-[14px] font-bold ${tint.text} tracking-tight`}>{section.label}</p>
      <p className="text-[11px] text-gray-600 mt-1 leading-relaxed line-clamp-2">{section.description}</p>
    </button>
  )
}

/* ══════════════════════════════════════════════════════════════════
 * Suggestion card — proactive recommendations from /suggestions
 * ══════════════════════════════════════════════════════════════════ */
function SuggestionCard({ suggestion, onClick }: { suggestion: Suggestion; onClick: () => void }) {
  const tint = SECTION_TINT[suggestion.sectionId] || SECTION_TINT.featured
  const Icon = tint.icon
  return (
    <button
      onClick={onClick}
      className="group text-left p-3 rounded-2xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all flex items-center gap-3"
    >
      <div className="w-14 h-14 rounded-xl bg-gray-100 overflow-hidden shrink-0 grid place-items-center">
        {suggestion.productImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={suggestion.productImage} alt={suggestion.productName} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon size={20} className="text-gray-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase ${tint.bg} ${tint.text}`}>
            <Icon size={9} strokeWidth={2.5} />
            {suggestion.badge || suggestion.sectionLabel}
          </span>
        </div>
        <p className="text-[13px] font-semibold text-gray-900 truncate">{suggestion.productName}</p>
        <p className="text-[11px] text-gray-500 truncate">{suggestion.reason}</p>
      </div>
      <ArrowRight size={14} className="text-gray-300 group-hover:text-gray-700 group-hover:translate-x-0.5 transition shrink-0" />
    </button>
  )
}

/* ══════════════════════════════════════════════════════════════════
 * Product picker — visual grid of catalog products
 * ══════════════════════════════════════════════════════════════════ */
function ProductPickerModal({
  sectionLabel, onClose, onPick,
}: {
  sectionLabel: string
  onClose: () => void
  onPick: (p: Product) => void
}) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'promo' | 'with-image'>('all')

  useEffect(() => {
    setLoading(true)
    fetch('/api/products?limit=200', { headers: getHeaders() })
      .then((r) => r.json())
      .then((d) => {
        const list = d.products || d.data || d || []
        /* Only active products with at least an image — no point trying to
         * generate from a product that has no visual reference. */
        const active = list.filter((p: Product) => (p.active ?? p.is_active ?? true))
        setProducts(active)
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((p) => {
      if (filter === 'promo' && !(p.promoPrice && p.price && p.promoPrice < p.price)) return false
      if (filter === 'with-image' && !(p.imageUrl || p.image)) return false
      if (!q) return true
      return (p.name || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q)
    })
  }, [products, search, filter])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm grid place-items-end sm:place-items-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-3xl max-h-[92vh] sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">
              {sectionLabel}
            </p>
            <h2 className="text-[18px] font-bold text-gray-900 mt-0.5">Escolha o produto</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="w-8 h-8 grid place-items-center rounded-full hover:bg-gray-100 transition"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </header>

        <div className="px-5 py-3 border-b border-gray-100 space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto…"
              className="w-full pl-9 pr-3 h-10 rounded-full bg-gray-100 text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:bg-white transition"
              autoFocus
            />
          </div>
          <div className="flex items-center gap-1.5">
            {(['all', 'promo', 'with-image'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`h-7 px-3 rounded-full text-[11px] font-semibold transition ${
                  filter === k
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {k === 'all' ? 'Todos' : k === 'promo' ? 'Com promo' : 'Com foto'}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-gray-400 tabular-nums">
              {filtered.length} de {products.length}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-2xl skeleton" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="grid place-items-center py-14 text-center">
              <ImageIcon size={28} className="text-gray-300 mb-2" />
              <p className="text-[13px] text-gray-600">Nenhum produto encontrado</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Tente outro filtro ou busca</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {filtered.map((p) => (
                <ProductGridItem key={p.id} product={p} onClick={() => onPick(p)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ProductGridItem({ product, onClick }: { product: Product; onClick: () => void }) {
  const img = product.imageUrl || product.image
  const hasPromo = product.promoPrice && product.price && product.promoPrice < product.price
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-2xl overflow-hidden bg-white border border-gray-200 hover:border-gray-900 hover:shadow-md transition-all"
    >
      <div className="aspect-square bg-gray-100 grid place-items-center overflow-hidden relative">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <ImageIcon size={28} className="text-gray-300" />
        )}
        {hasPromo && (
          <span className="absolute top-2 left-2 inline-flex items-center px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold uppercase tracking-wider">
            Promo
          </span>
        )}
      </div>
      <div className="p-2.5">
        <p className="text-[12px] font-semibold text-gray-900 truncate">{product.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {hasPromo ? (
            <>
              <span className="text-[11px] text-gray-400 line-through">{brl(product.price!)}</span>
              <span className="text-[12px] font-bold text-rose-600">{brl(product.promoPrice!)}</span>
            </>
          ) : (
            <span className="text-[12px] font-bold text-gray-700">{brl(product.price)}</span>
          )}
        </div>
      </div>
    </button>
  )
}

/* ══════════════════════════════════════════════════════════════════
 * Result screen — generated images + actions
 * ══════════════════════════════════════════════════════════════════ */
function ResultScreen({
  sectionLabel, productName, loading, error, assets, onBack, onRegenerate,
}: {
  sectionLabel: string
  productName: string
  loading: boolean
  error: string | null
  assets: GeneratedAsset[] | null
  onBack: () => void
  onRegenerate: () => void
}) {
  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label="Voltar"
            className="w-9 h-9 grid place-items-center rounded-full bg-white ring-1 ring-gray-200 text-gray-700 hover:bg-gray-50 transition"
          >
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">
              {sectionLabel}
            </p>
            <h2 className="text-[20px] font-bold text-gray-900 tracking-tight">{productName}</h2>
          </div>
        </div>
        {!loading && (
          <button
            onClick={onRegenerate}
            disabled={loading}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-white text-gray-700 text-[12px] font-semibold ring-1 ring-gray-200 hover:bg-gray-50 transition disabled:opacity-40"
          >
            <RefreshCw size={13} strokeWidth={2} />
            Gerar novas variações
          </button>
        )}
      </header>

      {loading && <GeneratingState />}

      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-5">
          <p className="text-[13px] font-semibold text-red-700">Não foi possível gerar</p>
          <p className="text-[11px] text-red-600 mt-1">{error}</p>
          <button
            onClick={onRegenerate}
            className="mt-3 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-red-600 text-white text-[12px] font-semibold hover:bg-red-700 transition"
          >
            <RefreshCw size={13} strokeWidth={2} />
            Tentar novamente
          </button>
        </div>
      )}

      {!loading && !error && assets && assets.length > 0 && (
        <div>
          <p className="text-[11px] text-gray-500 mb-2 inline-flex items-center gap-1.5">
            <CheckCircle2 size={12} strokeWidth={2.5} className="text-emerald-500" />
            {assets.length} criativo{assets.length > 1 ? 's' : ''} gerado{assets.length > 1 ? 's' : ''} a partir do seu catálogo e marca
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {assets.map((a) => (
              <AssetCard key={a.id} asset={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function GeneratingState() {
  return (
    <div className="rounded-3xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-10 text-center">
      <div className="inline-flex items-center gap-2 mb-3 px-3 py-1.5 rounded-full bg-gray-900 text-white text-[11px] font-semibold">
        <Sparkles size={12} strokeWidth={2.5} className="animate-pulse" />
        Compondo do catálogo
      </div>
      <p className="text-[15px] font-semibold text-gray-900 mb-1">A IA está montando suas peças</p>
      <p className="text-[12px] text-gray-500 max-w-sm mx-auto leading-relaxed">
        Aplicando logo, cores da marca, dados do produto e estilo da seção. Costuma levar 15–30 segundos.
      </p>
      <div className="flex items-center justify-center mt-5">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    </div>
  )
}

function AssetCard({ asset }: { asset: GeneratedAsset }) {
  const url = asset.fileUrl ? (asset.fileUrl.startsWith('http') ? asset.fileUrl : asset.fileUrl) : ''
  return (
    <div className="rounded-2xl overflow-hidden bg-white border border-gray-200 group">
      <div className="aspect-square bg-gray-100 grid place-items-center overflow-hidden">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="criativo" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon size={28} className="text-gray-300" />
        )}
      </div>
      <div className="p-2.5 flex items-center gap-1.5">
        <a
          href={url}
          download
          target="_blank"
          rel="noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-xl bg-gray-900 text-white text-[12px] font-semibold hover:bg-gray-800 active:scale-[0.98] transition"
        >
          <Download size={13} strokeWidth={2} />
          Baixar
        </a>
        <button
          aria-label="Enviar"
          className="h-9 w-9 grid place-items-center rounded-xl bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 transition"
          title="Enviar para campanha (em breve)"
          disabled
        >
          <Send size={13} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
