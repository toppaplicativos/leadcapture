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

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Sparkles, Loader2, Search, X, ArrowRight, Download, RefreshCw,
  ImageIcon, ChevronLeft, Wrench, Tag, Star, Zap, Send, CheckCircle2,
  Images, LayoutGrid, Eye, Type as TypeIcon, Palette as PaletteIcon, Megaphone,
  ChevronDown, Wand2, Rocket, Quote, BookOpen, Gift, Heart, Award,
  type LucideIcon,
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
  /** lucide-react component name. Looked up in SECTION_ICON_MAP. */
  iconName: string
  description: string
  formats: string[]
}

/**
 * Map of lucide icon names → components for everything we render.
 * Keep this small and explicit — never `import * as Icons` from lucide.
 */
const SECTION_ICON_MAP: Record<string, LucideIcon> = {
  Tag,
  Rocket,
  Quote,
  BookOpen,
  Gift,
  Heart,
  Award,
  Star,
  Sparkles,
}

function sectionIcon(iconName?: string): LucideIcon {
  return (iconName && SECTION_ICON_MAP[iconName]) || Sparkles
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

/** Returned by POST /api/ai/creatives/auto-compose/preview. The modal
 *  uses this shape to render every editable field. */
interface PreviewPayload {
  product: {
    id: string
    name: string
    description?: string | null
    price?: number | null
    promo_price?: number | null
    image_url?: string | null
    unit?: string | null
  }
  section: {
    id: string
    label: string
    iconName: string
    description: string
    formats: string[]
    style: string
    scene: string
    lighting: string
    textPosition: 'top' | 'center' | 'bottom'
    textStyle: 'bold' | 'minimal' | 'elegant'
    ctaPool: string[]
  }
  brand: {
    name: string | null
    primary_color: string | null
    secondary_color: string | null
  } | null
  defaults: {
    style: string
    scene: string
    lighting: string
    textOverlay: { headline: string; subheadline: string; cta: string; position: 'top' | 'center' | 'bottom'; style: 'bold' | 'minimal' | 'elegant' }
    formats: ('1:1' | '9:16' | '4:5' | '16:9')[]
    aspectRatio: '1:1' | '9:16' | '4:5' | '16:9'
    variations: number
    quality: 'fast' | 'high'
    targetAudience?: string
    predominantColors?: string
  }
  copySuggestions: Array<{ headline: string; subheadline: string }>
  ctaSuggestions: string[]
  styleOptions: Array<{ id: string; label: string; description: string }>
  formatOptions: Array<{ id: '1:1' | '9:16' | '4:5' | '16:9'; label: string; description: string }>
}

/** State of the configuration modal — what the user has edited. */
interface CreativeConfig {
  objective: string
  formats: ('1:1' | '9:16' | '4:5' | '16:9')[]
  variations: number
  quality: 'fast' | 'high'
  style: string
  headline: string
  subheadline: string
  cta: string
  textPosition: 'top' | 'center' | 'bottom'
  textStyle: 'bold' | 'minimal' | 'elegant'
  tone: string
  targetAudience: string
  embedTextInImage: boolean
}

const OBJECTIVE_OPTIONS = [
  'Vender agora',
  'Gerar interesse',
  'Lançar produto',
  'Recuperar cliente',
  'Anunciar desconto',
  'Valorizar marca',
]

const TEXT_POSITION_OPTIONS: Array<{ id: 'top' | 'center' | 'bottom'; label: string }> = [
  { id: 'top', label: 'Topo' },
  { id: 'center', label: 'Centro' },
  { id: 'bottom', label: 'Rodapé' },
]

const TEXT_STYLE_OPTIONS: Array<{ id: 'bold' | 'minimal' | 'elegant'; label: string }> = [
  { id: 'bold', label: 'Bold' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'elegant', label: 'Elegante' },
]

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
type Tab = 'create' | 'gallery'

export function CriativosPage() {
  const [tab, setTab] = useState<Tab>('create')
  const [sections, setSections] = useState<Section[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loadingMeta, setLoadingMeta] = useState(true)

  /* Active step state. Null = the home grid with sections + suggestions. */
  const [pickerOpen, setPickerOpen] = useState<{ sectionId: string } | null>(null)
  /* After a product is picked, we fetch a preview and open the configuration
   * modal. Only after the user confirms there do we trigger generation. */
  const [configuring, setConfiguring] = useState<{
    sectionId: string
    sectionLabel: string
    productId: string
    productName: string
    preview: PreviewPayload | null
    loadingPreview: boolean
    error: string | null
  } | null>(null)
  const [generating, setGenerating] = useState<{
    sectionId: string
    productId: string
    productName: string
    sectionLabel: string
  } | null>(null)
  const [generatedAssets, setGeneratedAssets] = useState<GeneratedAsset[] | null>(null)
  const [generationError, setGenerationError] = useState<string | null>(null)
  /* Bumped each time a generation completes so the Gallery tab refetches
   * when the user switches over. */
  const [galleryRefreshKey, setGalleryRefreshKey] = useState(0)

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
    /* Suggestions also go through the modal — keeps a single flow and lets
     * the user tweak before burning a generation. */
    openConfigure(s.sectionId, s.sectionLabel, s.productId, s.productName)
  }

  /* Product picker → opens the configuration modal (NOT direct generation). */
  function onProductPicked(p: Product) {
    if (!pickerOpen) return
    const section = sections.find((s) => s.id === pickerOpen.sectionId)
    setPickerOpen(null)
    openConfigure(pickerOpen.sectionId, section?.label || '', p.id, p.name)
  }

  /* Open modal: kick off preview fetch + render the form skeleton instantly. */
  async function openConfigure(sectionId: string, sectionLabel: string, productId: string, productName: string) {
    setConfiguring({ sectionId, sectionLabel, productId, productName, preview: null, loadingPreview: true, error: null })
    try {
      const r = await fetch('/api/ai/creatives/auto-compose/preview', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ productId, sectionId }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Falha ao preparar configuração')
      setConfiguring((prev) => prev ? { ...prev, preview: data, loadingPreview: false } : prev)
    } catch (err: any) {
      setConfiguring((prev) => prev ? { ...prev, error: err?.message || 'Erro', loadingPreview: false } : prev)
    }
  }

  function closeConfigure() {
    setConfiguring(null)
  }

  /** Called when the user clicks "Gerar criativos" inside the modal. */
  async function runConfiguredGenerate(config: CreativeConfig) {
    if (!configuring) return
    const { sectionId, productId, productName, sectionLabel } = configuring
    setConfiguring(null)
    setGenerating({ sectionId, productId, productName, sectionLabel })
    setGeneratedAssets(null)
    setGenerationError(null)
    try {
      const r = await fetch('/api/ai/creatives/auto-compose', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          productId,
          sectionId,
          overrides: config,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Falha ao gerar criativo')
      setGeneratedAssets(data.assets || [])
      setGalleryRefreshKey((k) => k + 1)
    } catch (err: any) {
      setGenerationError(err?.message || 'Erro inesperado')
    }
  }

  function backToHome() {
    setGenerating(null)
    setGeneratedAssets(null)
    setGenerationError(null)
  }

  /** "Gerar novas variações" reabre o modal com o mesmo produto+seção
   *  pra o usuário poder ajustar copy/estilo antes de regenerar. */
  function regenerate() {
    if (!generating) return
    const { sectionId, sectionLabel, productId, productName } = generating
    setGenerating(null)
    setGeneratedAssets(null)
    setGenerationError(null)
    openConfigure(sectionId, sectionLabel, productId, productName)
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

  /* ── Render: home (with tabs) ─────────────────────────────────── */
  return (
    <div className="space-y-5">
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

      {/* Tab switcher */}
      <div role="tablist" aria-label="Modo da página" className="inline-flex p-1 rounded-full bg-gray-100">
        <TabButton active={tab === 'create'} onClick={() => setTab('create')} icon={Sparkles} label="Criar" />
        <TabButton active={tab === 'gallery'} onClick={() => setTab('gallery')} icon={Images} label="Galeria" />
      </div>

      {tab === 'create' ? (
        <>
          {/* ── Suggestions row ─ */}
          {suggestions.length > 0 && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 mb-2 inline-flex items-center gap-1.5">
                <Sparkles size={11} strokeWidth={2.5} />
                Sugestões pra hoje
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
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 mb-2 inline-flex items-center gap-1.5">
              <PaletteIcon size={11} strokeWidth={2.5} />
              Tipo de criativo
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
        </>
      ) : (
        <GalleryView refreshKey={galleryRefreshKey} sections={sections} />
      )}

      {/* ── Product picker modal ─ */}
      {pickerOpen && (
        <ProductPickerModal
          sectionLabel={sections.find((s) => s.id === pickerOpen.sectionId)?.label || ''}
          onClose={() => setPickerOpen(null)}
          onPick={onProductPicked}
        />
      )}

      {/* ── Configure creative modal — opens after product is picked ─ */}
      {configuring && (
        <ConfigureCreativeModal
          sectionLabel={configuring.sectionLabel}
          productName={configuring.productName}
          preview={configuring.preview}
          loading={configuring.loadingPreview}
          error={configuring.error}
          onClose={closeConfigure}
          onGenerate={runConfiguredGenerate}
        />
      )}
    </div>
  )
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-semibold transition ${
        active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
      }`}
    >
      <Icon size={13} strokeWidth={2} />
      {label}
    </button>
  )
}

/* ══════════════════════════════════════════════════════════════════
 * Section card — one of the 7 presets in the grid
 * ══════════════════════════════════════════════════════════════════ */
function SectionCard({ section, onClick }: { section: Section; onClick: () => void }) {
  const tint = SECTION_TINT[section.id] || SECTION_TINT.featured
  const Icon = sectionIcon(section.iconName)
  return (
    <button
      onClick={onClick}
      className={`group text-left p-5 rounded-2xl ring-1 ${tint.ring} ${tint.bg} hover:shadow-sm hover:scale-[1.01] active:scale-[0.99] transition-all`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className={`w-9 h-9 grid place-items-center rounded-xl bg-white ring-1 ${tint.ring} ${tint.text}`}>
          <Icon size={18} strokeWidth={1.75} />
        </span>
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

/* ══════════════════════════════════════════════════════════════════
 * ConfigureCreativeModal — pre-flight settings before image generation
 *
 * Pre-populated by GET /auto-compose/preview, every field editable.
 * The user reviews objective/format/copy/style/voice and can switch
 * between SVG-overlay text (Gemini) and embedded-text mode (Grok
 * Imagine) before kicking off the actual run.
 * ══════════════════════════════════════════════════════════════════ */

function ConfigureCreativeModal({
  sectionLabel, productName, preview, loading, error, onClose, onGenerate,
}: {
  sectionLabel: string
  productName: string
  preview: PreviewPayload | null
  loading: boolean
  error: string | null
  onClose: () => void
  onGenerate: (config: CreativeConfig) => void
}) {
  /* Form state. Initialised from `preview.defaults` once it arrives.
   * We use a separate state object instead of editing preview directly
   * so cancelling the modal doesn't mutate the cached preview. */
  const [config, setConfig] = useState<CreativeConfig | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  /* Hydrate form when preview lands. */
  useEffect(() => {
    if (!preview || config) return
    const d = preview.defaults
    setConfig({
      objective: '',
      formats: d.formats?.length ? d.formats : [d.aspectRatio],
      variations: d.variations || 2,
      quality: d.quality || 'high',
      style: d.style || preview.section.style,
      headline: d.textOverlay.headline || '',
      subheadline: d.textOverlay.subheadline || '',
      cta: d.textOverlay.cta || preview.ctaSuggestions[0] || '',
      textPosition: d.textOverlay.position || preview.section.textPosition,
      textStyle: d.textOverlay.style || preview.section.textStyle,
      tone: '',
      targetAudience: d.targetAudience || '',
      embedTextInImage: false,
    })
  }, [preview, config])

  /* Compute the cost estimate live as user toggles formats / variations. */
  const estimate = useMemo(() => {
    if (!config) return { jobs: 0, seconds: 0 }
    const jobs = Math.max(1, config.formats.length) * Math.max(1, config.variations)
    const perJob = config.quality === 'fast' ? 4 : 7
    return { jobs, seconds: jobs * perJob }
  }, [config])

  function update<K extends keyof CreativeConfig>(key: K, value: CreativeConfig[K]) {
    setConfig((c) => c ? { ...c, [key]: value } : c)
  }

  function toggleFormat(id: '1:1' | '9:16' | '4:5' | '16:9') {
    if (!config) return
    const has = config.formats.includes(id)
    /* Always keep at least one format selected. */
    if (has && config.formats.length <= 1) return
    update('formats', has ? config.formats.filter((f) => f !== id) : [...config.formats, id])
  }

  function applyCopySuggestion(s: { headline: string; subheadline: string }) {
    if (!config) return
    setConfig({ ...config, headline: s.headline, subheadline: s.subheadline })
  }

  function submit() {
    if (!config || !preview) return
    onGenerate(config)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-end sm:place-items-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-2xl max-h-[95vh] sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gray-900 grid place-items-center text-white shrink-0">
              <Wand2 size={16} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">
                Configurar · {sectionLabel}
              </p>
              <h2 className="text-[16px] font-bold text-gray-900 truncate">{productName}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="w-8 h-8 grid place-items-center rounded-full hover:bg-gray-100 transition shrink-0"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && !preview ? (
            <div className="grid place-items-center py-16">
              <Loader2 size={20} className="animate-spin text-gray-400" />
              <p className="text-[12px] text-gray-500 mt-3">Carregando sugestões da marca…</p>
            </div>
          ) : error ? (
            <div className="p-6">
              <div className="rounded-2xl bg-red-50 border border-red-200 p-4">
                <p className="text-[13px] font-semibold text-red-700">Não foi possível preparar</p>
                <p className="text-[11px] text-red-600 mt-1">{error}</p>
              </div>
            </div>
          ) : config && preview ? (
            <div className="p-5 space-y-5">
              {/* Objective */}
              <Field
                label="Objetivo"
                hint="O que você quer que esse criativo provoque no cliente."
                icon={Megaphone}
              >
                <div className="flex flex-wrap gap-1.5">
                  {OBJECTIVE_OPTIONS.map((o) => (
                    <ChipBtn key={o} active={config.objective === o} onClick={() => update('objective', config.objective === o ? '' : o)}>
                      {o}
                    </ChipBtn>
                  ))}
                </div>
                <input
                  type="text"
                  value={config.objective}
                  onChange={(e) => update('objective', e.target.value)}
                  placeholder="Ou descreva em poucas palavras…"
                  className="mt-2 w-full h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
                />
              </Field>

              {/* Formats */}
              <Field
                label="Formatos"
                hint="Selecione um ou mais. Cada formato gera as variações configuradas abaixo."
                icon={LayoutGrid}
              >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {preview.formatOptions.map((f) => {
                    const active = config.formats.includes(f.id)
                    return (
                      <button
                        key={f.id}
                        onClick={() => toggleFormat(f.id)}
                        aria-pressed={active}
                        className={`p-3 rounded-2xl border text-left transition ${
                          active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                        }`}
                      >
                        <p className="text-[10px] font-mono font-bold tracking-wider opacity-70">{f.id}</p>
                        <p className="text-[13px] font-bold mt-0.5">{f.label}</p>
                        <p className={`text-[10px] mt-1 leading-tight ${active ? 'text-white/70' : 'text-gray-500'}`}>
                          {f.description}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </Field>

              {/* Variations */}
              <Field
                label="Variações por formato"
                hint={`Cada variação é uma imagem diferente. Total: ${estimate.jobs} imagem${estimate.jobs !== 1 ? 's' : ''}.`}
                icon={Sparkles}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={4}
                    value={config.variations}
                    onChange={(e) => update('variations', Number(e.target.value))}
                    className="flex-1 accent-gray-900"
                  />
                  <span className="w-8 text-center text-[14px] font-bold tabular-nums">{config.variations}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  {(['fast', 'high'] as const).map((q) => (
                    <ChipBtn key={q} active={config.quality === q} onClick={() => update('quality', q)} icon={q === 'fast' ? Zap : Sparkles}>
                      {q === 'fast' ? 'Rápido' : 'Alta qualidade'}
                    </ChipBtn>
                  ))}
                </div>
              </Field>

              {/* Copy section */}
              <div className="pt-3 border-t border-gray-100 space-y-4">
                <div className="flex items-center gap-2">
                  <TypeIcon size={14} className="text-gray-500" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-500">Texto do criativo</p>
                </div>

                {/* Copy suggestions */}
                {preview.copySuggestions.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                      Sugestões prontas (clique para usar)
                    </p>
                    <div className="grid gap-1.5">
                      {preview.copySuggestions.map((s, i) => {
                        const isActive = config.headline === s.headline && config.subheadline === s.subheadline
                        return (
                          <button
                            key={i}
                            onClick={() => applyCopySuggestion(s)}
                            className={`text-left p-3 rounded-xl border transition ${
                              isActive ? 'border-gray-900 bg-gray-50' : 'border-gray-200 bg-white hover:border-gray-400'
                            }`}
                          >
                            <p className="text-[12px] font-bold text-gray-900 whitespace-pre-line">{s.headline}</p>
                            {s.subheadline && (
                              <p className="text-[11px] text-gray-500 mt-0.5">{s.subheadline}</p>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                <Field label="Headline">
                  <textarea
                    value={config.headline}
                    onChange={(e) => update('headline', e.target.value)}
                    rows={2}
                    placeholder="Frase principal do criativo"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 resize-none"
                  />
                </Field>

                <Field label="Sub-headline">
                  <input
                    type="text"
                    value={config.subheadline}
                    onChange={(e) => update('subheadline', e.target.value)}
                    placeholder="Linha de apoio"
                    className="w-full h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
                  />
                </Field>

                <Field label="Botão (CTA)">
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {preview.ctaSuggestions.map((c) => (
                      <ChipBtn key={c} active={config.cta === c} onClick={() => update('cta', c)}>
                        {c}
                      </ChipBtn>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={config.cta}
                    onChange={(e) => update('cta', e.target.value)}
                    placeholder="Ou digite o seu"
                    className="w-full h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
                  />
                </Field>

                {/* Embed text in image toggle */}
                <Field
                  label="Como o texto aparece"
                  hint="Como o texto vai parar na imagem."
                >
                  <div className="grid sm:grid-cols-2 gap-2">
                    <button
                      onClick={() => update('embedTextInImage', false)}
                      aria-pressed={!config.embedTextInImage}
                      className={`text-left p-3 rounded-2xl border transition ${
                        !config.embedTextInImage ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                      }`}
                    >
                      <p className="text-[12px] font-bold">Sobreposto (SVG)</p>
                      <p className={`text-[10px] mt-1 leading-tight ${!config.embedTextInImage ? 'text-white/70' : 'text-gray-500'}`}>
                        IA gera o cenário, texto desenhado por cima. Sempre legível, ideal pra Gemini.
                      </p>
                    </button>
                    <button
                      onClick={() => update('embedTextInImage', true)}
                      aria-pressed={config.embedTextInImage}
                      className={`text-left p-3 rounded-2xl border transition ${
                        config.embedTextInImage ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                      }`}
                    >
                      <p className="text-[12px] font-bold">IA desenha na imagem</p>
                      <p className={`text-[10px] mt-1 leading-tight ${config.embedTextInImage ? 'text-white/70' : 'text-gray-500'}`}>
                        Tipografia integrada à cena. Melhor com Grok Imagine, mais rica visualmente.
                      </p>
                    </button>
                  </div>
                </Field>
              </div>

              {/* Advanced */}
              <div className="pt-3 border-t border-gray-100">
                <button
                  onClick={() => setShowAdvanced((s) => !s)}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-700 hover:text-gray-900"
                >
                  <ChevronDown size={14} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                  Configurações avançadas
                </button>

                {showAdvanced && (
                  <div className="mt-4 space-y-4">
                    {/* Style */}
                    <Field label="Estilo visual" icon={PaletteIcon}>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {preview.styleOptions.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => update('style', s.id)}
                            aria-pressed={config.style === s.id}
                            className={`text-left p-3 rounded-2xl border transition ${
                              config.style === s.id ? 'border-gray-900 bg-gray-50' : 'border-gray-200 bg-white hover:border-gray-400'
                            }`}
                          >
                            <p className="text-[13px] font-bold text-gray-900">{s.label}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{s.description}</p>
                          </button>
                        ))}
                      </div>
                    </Field>

                    {/* Text position + style */}
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Posição do texto">
                        <div className="flex flex-wrap gap-1.5">
                          {TEXT_POSITION_OPTIONS.map((p) => (
                            <ChipBtn key={p.id} active={config.textPosition === p.id} onClick={() => update('textPosition', p.id)}>
                              {p.label}
                            </ChipBtn>
                          ))}
                        </div>
                      </Field>

                      <Field label="Estilo do texto">
                        <div className="flex flex-wrap gap-1.5">
                          {TEXT_STYLE_OPTIONS.map((p) => (
                            <ChipBtn key={p.id} active={config.textStyle === p.id} onClick={() => update('textStyle', p.id)}>
                              {p.label}
                            </ChipBtn>
                          ))}
                        </div>
                      </Field>
                    </div>

                    <Field label="Tom de voz">
                      <input
                        type="text"
                        value={config.tone}
                        onChange={(e) => update('tone', e.target.value)}
                        placeholder="ex: premium e direto, divertido, popular"
                        className="w-full h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
                      />
                    </Field>

                    <Field label="Audiência alvo">
                      <input
                        type="text"
                        value={config.targetAudience}
                        onChange={(e) => update('targetAudience', e.target.value)}
                        placeholder="ex: donas de casa do bairro, restaurantes pequenos"
                        className="w-full h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
                      />
                    </Field>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <footer className="border-t border-gray-100 px-5 py-3 flex items-center gap-3 shrink-0 bg-white">
          <div className="flex-1 min-w-0">
            {config && (
              <p className="text-[11px] text-gray-500">
                Vai gerar <strong className="text-gray-900">{estimate.jobs}</strong> imagem{estimate.jobs !== 1 ? 's' : ''}
                {' '}·{' '}~{estimate.seconds}s
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="h-10 px-3.5 rounded-xl text-[12px] font-semibold text-gray-600 hover:bg-gray-100 transition"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!config || loading}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-gray-900 text-white text-[13px] font-semibold hover:bg-gray-800 active:scale-[0.98] transition disabled:opacity-40"
          >
            <Wand2 size={14} strokeWidth={2} />
            Gerar criativos
          </button>
        </footer>
      </div>
    </div>
  )
}

function Field({ label, hint, icon: Icon, children }: { label: string; hint?: string; icon?: any; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        {Icon && <Icon size={13} className="text-gray-500" />}
        <label className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">{label}</label>
      </div>
      {hint && <p className="text-[11px] text-gray-500 mb-2 leading-relaxed">{hint}</p>}
      {children}
    </div>
  )
}

function ChipBtn({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon?: LucideIcon; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1 h-7 px-3 rounded-full text-[11px] font-semibold transition ${
        active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {Icon && <Icon size={11} strokeWidth={2} />}
      {children}
    </button>
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

/* ══════════════════════════════════════════════════════════════════
 * GalleryView — every asset generated for this brand, with filters
 *
 * Reuses /api/ai/creatives/studio/gallery (existing endpoint). The
 * endpoint already scopes by brand via x-brand-id header. We do extra
 * client-side filtering by section tag (`section:promo`, etc) since
 * the auto-compose tags assets that way.
 * ══════════════════════════════════════════════════════════════════ */

interface GalleryAsset {
  id: string
  fileUrl?: string
  prompt?: string
  createdAt?: string
  metadata?: any
}

function GalleryView({ refreshKey, sections }: { refreshKey: number; sections: Section[] }) {
  const [assets, setAssets] = useState<GalleryAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<string>('all')
  const [previewAsset, setPreviewAsset] = useState<GalleryAsset | null>(null)
  const [layoutDense, setLayoutDense] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch('/api/ai/creatives/studio/gallery?limit=200', { headers: getHeaders() })
      .then((r) => r.json())
      .then((d) => {
        const list: GalleryAsset[] = d.assets || d.data || []
        /* Sort newest first — backend usually does this but be defensive. */
        list.sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
          return tb - ta
        })
        setAssets(list)
      })
      .catch(() => setAssets([]))
      .finally(() => setLoading(false))
  }, [refreshKey])

  /* Tag-based filter. Uploads (source != gemini) and references aren't shown
   * — only generated outputs. */
  const filtered = useMemo(() => {
    return assets.filter((a) => {
      const md = a.metadata || {}
      const studio = md.studio || {}
      const tags: string[] = Array.isArray(studio.tags) ? studio.tags : []
      /* Skip uploads — they're sources, not outputs. */
      const isUpload = String(md.source || '').includes('upload') || studio.imageType === 'product' || studio.imageType === 'reference' || studio.imageType === 'background'
      if (isUpload) return false
      if (activeSection === 'all') return true
      return tags.includes(`section:${activeSection}`)
    })
  }, [assets, activeSection])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Section filter chips */}
        <button
          onClick={() => setActiveSection('all')}
          className={`h-8 px-3 rounded-full text-[11px] font-semibold transition ${
            activeSection === 'all' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'
          }`}
        >
          Todos
        </button>
        {sections.map((s) => {
          const Icon = sectionIcon(s.iconName)
          return (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-semibold transition ${
                activeSection === s.id ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'
              }`}
            >
              <Icon size={11} strokeWidth={2} />
              {s.label}
            </button>
          )
        })}
        <span className="ml-auto inline-flex items-center gap-1.5">
          <button
            onClick={() => setLayoutDense(false)}
            className={`w-8 h-8 grid place-items-center rounded-full transition ${
              !layoutDense ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 ring-1 ring-gray-200'
            }`}
            aria-label="Grade confortável"
            title="Confortável"
          >
            <LayoutGrid size={13} />
          </button>
          <button
            onClick={() => setLayoutDense(true)}
            className={`w-8 h-8 grid place-items-center rounded-full transition ${
              layoutDense ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 ring-1 ring-gray-200'
            }`}
            aria-label="Grade densa"
            title="Densa"
          >
            <Images size={13} />
          </button>
        </span>
      </div>

      {loading ? (
        <div className={`grid gap-2 ${layoutDense ? 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}`}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-2xl skeleton" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <GalleryEmpty hasAny={assets.length > 0} />
      ) : (
        <>
          <p className="text-[11px] text-gray-500 tabular-nums">
            {filtered.length} criativo{filtered.length > 1 ? 's' : ''} {activeSection !== 'all' ? `em ${sections.find((s) => s.id === activeSection)?.label}` : 'no total'}
          </p>
          <div className={`grid gap-2 ${layoutDense ? 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}`}>
            {filtered.map((a) => (
              <GalleryThumb key={a.id} asset={a} onOpen={() => setPreviewAsset(a)} />
            ))}
          </div>
        </>
      )}

      {previewAsset && <GalleryPreview asset={previewAsset} onClose={() => setPreviewAsset(null)} />}
    </div>
  )
}

function GalleryThumb({ asset, onOpen }: { asset: GalleryAsset; onOpen: () => void }) {
  const tags: string[] = Array.isArray(asset.metadata?.studio?.tags) ? asset.metadata.studio.tags : []
  const sectionTag = tags.find((t) => t.startsWith('section:'))?.split(':')[1]
  const tint = sectionTag ? SECTION_TINT[sectionTag] : null
  return (
    <button
      onClick={onOpen}
      className="group relative rounded-2xl overflow-hidden bg-gray-100 aspect-square hover:ring-2 hover:ring-gray-900 transition"
    >
      {asset.fileUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={asset.fileUrl} alt="criativo" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      ) : (
        <div className="w-full h-full grid place-items-center"><ImageIcon size={24} className="text-gray-300" /></div>
      )}
      {tint && sectionTag && (() => {
        const TagIcon = sectionIconForId(sectionTag)
        return (
          <span className={`absolute top-1.5 left-1.5 inline-flex items-center justify-center w-6 h-6 rounded-full ${tint.bg} ring-1 ${tint.ring} ${tint.text}`}>
            <TagIcon size={11} strokeWidth={2} />
          </span>
        )
      })()}
      <span className="absolute inset-0 grid place-items-center bg-black/0 group-hover:bg-black/30 transition-colors">
        <Eye size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
      </span>
    </button>
  )
}

/** Lookup table: section id → lucide icon component. Mirrors the
 *  iconName field returned by the /sections endpoint, but we keep it
 *  client-side too because gallery thumbs cache the section tag from
 *  asset metadata and may render before the sections list arrives. */
const SECTION_ID_ICON: Record<string, LucideIcon> = {
  'promo': Tag,
  'launch': Rocket,
  'social-proof': Quote,
  'educational': BookOpen,
  'date': Gift,
  'winback': Heart,
  'featured': Award,
}
function sectionIconForId(id: string): LucideIcon {
  return SECTION_ID_ICON[id] || Sparkles
}

function GalleryEmpty({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 grid place-items-center mx-auto mb-3">
        <Images size={22} className="text-gray-400" strokeWidth={1.5} />
      </div>
      <p className="text-[14px] font-semibold text-gray-900">
        {hasAny ? 'Nenhum criativo nessa seção ainda' : 'Sua galeria está vazia'}
      </p>
      <p className="text-[12px] text-gray-500 mt-1 max-w-sm mx-auto">
        {hasAny
          ? 'Tente outro filtro ou volte pra Criar e gere um novo criativo dessa seção.'
          : 'Volte pra aba Criar, escolha uma seção e selecione um produto. As imagens geradas vão aparecer aqui.'}
      </p>
    </div>
  )
}

function GalleryPreview({ asset, onClose }: { asset: GalleryAsset; onClose: () => void }) {
  const url = asset.fileUrl || ''
  const tags: string[] = Array.isArray(asset.metadata?.studio?.tags) ? asset.metadata.studio.tags : []
  const productTag = tags.find((t) => t.startsWith('product:'))?.split(':')[1]
  const sectionTag = tags.find((t) => t.startsWith('section:'))?.split(':')[1]
  const SectionTagIcon = sectionTag ? sectionIconForId(sectionTag) : Sparkles
  const created = asset.createdAt ? new Date(asset.createdAt).toLocaleString('pt-BR') : ''

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col sm:flex-row overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 bg-gray-100 grid place-items-center min-h-[300px] sm:min-h-0">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="criativo" className="max-w-full max-h-[80vh] object-contain" />
          ) : (
            <ImageIcon size={48} className="text-gray-300" />
          )}
        </div>
        <aside className="sm:w-[280px] sm:shrink-0 flex flex-col">
          <header className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">Criativo</p>
              <p className="text-[14px] font-bold text-gray-900 mt-0.5 inline-flex items-center gap-1.5">
                <SectionTagIcon size={13} strokeWidth={2} className="text-gray-700" />
                {sectionTag || 'Sem seção'}
              </p>
            </div>
            <button onClick={onClose} aria-label="Fechar" className="w-8 h-8 grid place-items-center rounded-full hover:bg-gray-100 transition">
              <X size={15} strokeWidth={2} />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-5 space-y-3 text-[12px]">
            {productTag && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Produto</p>
                <p className="text-gray-700 font-mono break-all">{productTag}</p>
              </div>
            )}
            {created && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Gerado em</p>
                <p className="text-gray-700">{created}</p>
              </div>
            )}
            {asset.prompt && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Prompt</p>
                <p className="text-gray-600 leading-relaxed line-clamp-6">{asset.prompt}</p>
              </div>
            )}
          </div>
          <footer className="px-5 py-4 border-t border-gray-100 flex items-center gap-2">
            <a
              href={url}
              download
              target="_blank"
              rel="noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl bg-gray-900 text-white text-[13px] font-semibold hover:bg-gray-800 active:scale-[0.98] transition"
            >
              <Download size={14} strokeWidth={2} />
              Baixar PNG
            </a>
            <button
              aria-label="Enviar"
              disabled
              className="h-10 w-10 grid place-items-center rounded-xl bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 transition disabled:opacity-50"
              title="Enviar para campanha (em breve)"
            >
              <Send size={14} strokeWidth={2} />
            </button>
          </footer>
        </aside>
      </div>
    </div>
  )
}
