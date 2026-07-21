import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Sparkles, ChevronRight, ChevronLeft, Search, Target, Lightbulb,
  MessageCircle, Tag, TrendingUp, Shield, Copy,
} from 'lucide-react'
import { affiliateApi, getAffiliateBrandRef } from '@/lib/api-affiliate'
import { affiliateAppCache } from '@/lib/affiliate-app-cache'
import { buildAffiliateCatalogUrl } from '@/lib/affiliate-tracking'
import { resolveAffiliateCopyTemplate } from '@/lib/affiliates/copy-template'
import type { AppContext } from '@/pages/affiliate/types'
import type { AffiliateProductCatalogItem, AffiliateProductGuide } from '@/lib/affiliates/types'

const money = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function PanelSkeleton() {
  return (
    <div className="space-y-3 pb-2">
      <div className="affiliate-skel h-10 w-full" />
      <div className="grid grid-cols-2 gap-2.5">
        <div className="affiliate-skel h-44" />
        <div className="affiliate-skel h-44" />
        <div className="affiliate-skel h-44" />
        <div className="affiliate-skel h-44" />
      </div>
    </div>
  )
}

type Props = { ctx: AppContext }

export function AffiliateProductsPanel({ ctx }: Props) {
  const snap = affiliateAppCache.get()
  const [products, setProducts] = useState<AffiliateProductCatalogItem[]>(snap.products || [])
  const [loading, setLoading] = useState(snap.products == null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<AffiliateProductCatalogItem | null>(null)
  const [guide, setGuide] = useState<AffiliateProductGuide | null>(null)
  const [guideLoading, setGuideLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    affiliateAppCache.prefetchAll({ region: ctx.affiliate?.region })
      .then(() => {
        if (cancelled) return
        const list = affiliateAppCache.get().products
        if (list) setProducts(list)
      })
      .catch(() => {
        if (!cancelled && !affiliateAppCache.get().products) {
          ctx.showToast('Erro ao carregar catálogo', 'err')
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ctx.affiliate?.region, ctx.showToast, ctx.cacheVersion])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) =>
      p.name.toLowerCase().includes(q)
      || String(p.category || '').toLowerCase().includes(q)
    )
  }, [products, search])

  const storeOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const storeSlug = String(ctx.brand?.slug || getAffiliateBrandRef() || '').trim()
  const primaryDomain = String(ctx.brand?.primary_domain || '').trim() || null
  const catalogLink = ctx.affiliate?.code
    ? buildAffiliateCatalogUrl({
        origin: storeOrigin,
        primaryDomain,
        storeSlug,
        code: ctx.affiliate.code,
        couponCode: ctx.affiliate.coupon_code,
      })
    : ''

  async function openProduct(p: AffiliateProductCatalogItem) {
    setSelected(p)
    setGuide(null)
    if (!p.has_guide) return
    setGuideLoading(true)
    try {
      const res = await affiliateApi.productGuide(p.id)
      setGuide(res.guide)
    } catch {
      ctx.showToast('Guia indisponível para este produto', 'err')
    } finally {
      setGuideLoading(false)
    }
  }

  async function copyPitch(text: string) {
    try {
      const resolved = resolveAffiliateCopyTemplate(text, {
        nome_afiliado: ctx.affiliate?.display_name,
        cupom: ctx.affiliate?.coupon_code,
        codigo: ctx.affiliate?.code,
        marca: ctx.brand?.name,
        link_catalogo: catalogLink,
      })
      await navigator.clipboard.writeText(resolved)
      ctx.showToast('Texto copiado!')
    } catch {
      ctx.showToast('Não foi possível copiar', 'err')
    }
  }

  if (loading && !products.length) return <PanelSkeleton />

  if (selected) {
    const price = selected.promo_price && selected.promo_price < selected.price
      ? selected.promo_price
      : selected.price

    return (
      <div className="space-y-4 pb-2">
        <button
          type="button"
          onClick={() => { setSelected(null); setGuide(null) }}
          className="flex items-center gap-1 text-xs font-bold text-[#8e8e93] active:opacity-70"
        >
          <ChevronLeft size={14} /> Catálogo
        </button>

        <div className="affiliate-prod-hero affiliate-card overflow-hidden">
          {selected.image_url && (
            <img src={selected.image_url} alt="" className="affiliate-prod-hero__img" />
          )}
          <div className="affiliate-prod-hero__body">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#8e8e93]">{selected.category || 'Produto'}</p>
            <h2 className="text-lg font-extrabold text-[#1c1c1e] tracking-tight leading-tight">{selected.name}</h2>
            <p className="text-xl font-black mt-1" style={{ color: ctx.primary }}>{money(price)}</p>
          </div>
        </div>

        {!selected.has_guide && (
          <div className="affiliate-card p-5 text-center">
            <Sparkles size={24} className="mx-auto mb-2 opacity-35" style={{ color: ctx.primary }} />
            <p className="text-sm font-bold text-[#1c1c1e]">Guia em preparação</p>
            <p className="text-xs text-[#8e8e93] mt-1">A marca vai gerar o material de estudo com IA em breve</p>
          </div>
        )}

        {guideLoading && (
          <div className="space-y-2">
            <div className="affiliate-skel h-16 w-full" />
            <div className="affiliate-skel h-24 w-full" />
            <div className="affiliate-skel h-24 w-full" />
          </div>
        )}

        {guide && !guideLoading && (
          <div className="space-y-3">
            <div
              className="affiliate-card p-4"
              style={{ background: `linear-gradient(135deg, ${ctx.primary}10, ${ctx.secondary}08)` }}
            >
              <div className="flex items-start gap-2">
                <Sparkles size={18} style={{ color: ctx.primary }} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-extrabold text-sm text-[#1c1c1e]">{guide.headline}</p>
                  <p className="text-xs text-[#636366] mt-1.5 leading-relaxed">{guide.summary}</p>
                </div>
              </div>
            </div>

            <GuideBlock icon={TrendingUp} title="Pontos fortes" accent={ctx.primary}>
              <ul className="affiliate-prod-list">
                {guide.strong_points.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </GuideBlock>

            <GuideBlock icon={Target} title="Público ideal" accent={ctx.primary}>
              <p className="text-xs text-[#636366] leading-relaxed">{guide.ideal_audience}</p>
            </GuideBlock>

            <GuideBlock icon={MessageCircle} title="Como vender" accent={ctx.primary}>
              <ol className="affiliate-prod-list affiliate-prod-list--ordered">
                {guide.how_to_sell.map((item, i) => <li key={item}><span className="affiliate-prod-step">{i + 1}</span>{item}</li>)}
              </ol>
            </GuideBlock>

            {guide.objections.length > 0 && (
              <GuideBlock icon={Shield} title="Objeções e respostas" accent={ctx.primary}>
                <div className="space-y-2">
                  {guide.objections.map((o) => (
                    <div key={o.objection} className="affiliate-prod-objection">
                      <p className="text-xs font-bold text-[#1c1c1e]">{o.objection}</p>
                      <p className="text-[11px] text-[#636366] mt-1">{o.response}</p>
                    </div>
                  ))}
                </div>
              </GuideBlock>
            )}

            <GuideBlock icon={Lightbulb} title="Dicas rápidas" accent={ctx.primary}>
              <ul className="affiliate-prod-list">
                {guide.tips.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </GuideBlock>

            {guide.pitch_ideas.length > 0 && (
              <GuideBlock icon={Copy} title="Ideias de mensagem" accent={ctx.primary}>
                <div className="space-y-2">
                  {guide.pitch_ideas.map((pitch) => (
                    <div key={pitch} className="affiliate-prod-pitch">
                      <p className="text-[11px] text-[#636366] leading-relaxed">{pitch}</p>
                      <button
                        type="button"
                        onClick={() => copyPitch(pitch)}
                        className="text-[10px] font-bold mt-2 flex items-center gap-1"
                        style={{ color: ctx.primary }}
                      >
                        <Copy size={11} /> Copiar
                      </button>
                    </div>
                  ))}
                </div>
              </GuideBlock>
            )}

            {guide.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-0.5">
                {guide.keywords.map((kw) => (
                  <span key={kw} className="affiliate-prod-keyword">
                    <Tag size={10} /> {kw}
                  </span>
                ))}
              </div>
            )}

            {guide.commission_angle && (
              <div className="affiliate-card p-3.5 border-l-4" style={{ borderColor: ctx.primary }}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#8e8e93] mb-1">Ângulo de conversão</p>
                <p className="text-xs text-[#636366] leading-relaxed">{guide.commission_angle}</p>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3 pb-2">
      <div className="affiliate-prod-search">
        <Search size={15} className="text-[#8e8e93]" />
        <input
          type="search"
          placeholder="Buscar produto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-14 text-[#8e8e93]">
          <p className="text-sm font-semibold text-[#1c1c1e]">Nenhum produto no catálogo</p>
          <p className="text-xs mt-1">A marca ainda não publicou produtos ativos</p>
        </div>
      ) : (
        <div className="affiliate-prod-grid">
          {filtered.map((p) => {
            const price = p.promo_price && p.promo_price < p.price ? p.promo_price : p.price
            return (
              <button
                key={p.id}
                type="button"
                className="affiliate-prod-card text-left"
                onClick={() => openProduct(p)}
              >
                <div className="affiliate-prod-card__media">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} />
                  ) : (
                    <div className="affiliate-prod-card__placeholder">{p.name[0]}</div>
                  )}
                  {p.has_guide && (
                    <span className="affiliate-prod-card__badge">
                      <Sparkles size={10} /> Guia IA
                    </span>
                  )}
                </div>
                <div className="affiliate-prod-card__body">
                  <p className="affiliate-prod-card__name">{p.name}</p>
                  <p className="affiliate-prod-card__price" style={{ color: ctx.primary }}>{money(price)}</p>
                  <span className="affiliate-prod-card__cta">
                    {p.has_guide ? 'Estudar e vender' : 'Ver produto'}
                    <ChevronRight size={12} />
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function GuideBlock({
  icon: Icon,
  title,
  accent,
  children,
}: {
  icon: typeof Sparkles
  title: string
  accent: string
  children: ReactNode
}) {
  return (
    <div className="affiliate-card p-4">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="affiliate-prod-guide-icon" style={{ backgroundColor: `${accent}14`, color: accent }}>
          <Icon size={14} />
        </span>
        <p className="text-xs font-extrabold text-[#1c1c1e] uppercase tracking-wide">{title}</p>
      </div>
      {children}
    </div>
  )
}