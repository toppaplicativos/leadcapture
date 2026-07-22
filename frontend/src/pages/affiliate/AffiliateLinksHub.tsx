import { useEffect, useMemo, useState } from 'react'
import {
  Link2, Copy, Share2, QrCode, MousePointerClick, ShoppingBag,
  TrendingUp, Search, BarChart3, Package, ChevronRight, Ticket,
} from 'lucide-react'
import { affiliateApi, getAffiliateBrandRef } from '@/lib/api-affiliate'
import { affiliateAppCache } from '@/lib/affiliate-app-cache'
import {
  buildAffiliateCatalogUrl,
  buildAffiliateProductUrl,
  buildAffiliateShortUrl,
} from '@/lib/affiliate-tracking'
import { AffiliateShareStudio } from '@/pages/affiliate/AffiliateShareStudio'
import { resolveAffiliateCopyTemplate } from '@/lib/affiliates/copy-template'
import { formatConversionRate, resolveProductSlug } from '@/lib/affiliates/link-hub'
import type { AffiliateSharePack } from '@/lib/affiliates/share-pack'
import { sharePackOpenWhatsApp } from '@/lib/affiliates/share-pack'
import type { AppContext } from '@/pages/affiliate/types'
import type { AffiliateProductCatalogItem } from '@/lib/affiliates/types'
import { normalizeUploadUrl } from '@/lib/media-url'
import { WhatsAppIcon } from '@/components/icons'

type HubSection = 'links' | 'produtos' | 'analise'
type PeriodDays = 7 | 30 | 90

const money = (v: number | string | undefined) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type Props = { ctx: AppContext; active?: boolean }

export function AffiliateLinksHub({ ctx, active = true }: Props) {
  const [section, setSection] = useState<HubSection>('links')
  const [period, setPeriod] = useState<PeriodDays>(30)
  const [loading, setLoading] = useState(true)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [hub, setHub] = useState<any>(null)
  const [analytics, setAnalytics] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [productShareKit, setProductShareKit] = useState<AffiliateProductCatalogItem | null>(null)
  const [selectedProgramId, setSelectedProgramId] = useState<string>('')

  const storeOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const storeSlug = String(hub?.store_slug || ctx.brand?.slug || getAffiliateBrandRef() || '').trim()
  const code = String(hub?.code || ctx.affiliate?.code || '').trim()
  const coupon = String(hub?.coupon_code || ctx.affiliate?.coupon_code || '').trim()
  const primaryDomain = String(hub?.primary_domain || ctx.brand?.primary_domain || '').trim() || null

  const copyCtx = useMemo(() => ({
    nome_afiliado: ctx.affiliate?.display_name || '',
    cupom: coupon,
    codigo: code,
    marca: ctx.brand?.name || '',
    link_catalogo: code ? buildAffiliateCatalogUrl({ origin: storeOrigin, primaryDomain, storeSlug, code, couponCode: coupon }) : '',
  }), [ctx, storeOrigin, primaryDomain, storeSlug, code, coupon])

  const shortUrl = String(hub?.links?.short_url || '').trim()
    || (code ? buildAffiliateShortUrl({ origin: storeOrigin, primaryDomain, code }) : '')
  const catalogUrl = String(hub?.links?.catalog_url || '').trim()
    || copyCtx.link_catalogo

  useEffect(() => {
    if (!active) return
    let cancelled = false
    setLoading(true)
    affiliateApi.links(period, selectedProgramId || undefined)
      .then((d) => {
        if (cancelled) return
        setHub(d)
        if (!selectedProgramId && d.program_id) setSelectedProgramId(String(d.program_id))
      })
      .catch(() => { if (!cancelled) ctx.showToast('Erro ao carregar links', 'err') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [period, selectedProgramId, ctx.showToast, ctx.cacheVersion, active])

  useEffect(() => {
    if (section !== 'analise') return
    let cancelled = false
    setAnalyticsLoading(true)
    affiliateApi.linkAnalytics(period, selectedProgramId || undefined)
      .then((d) => { if (!cancelled) setAnalytics(d) })
      .catch(() => { if (!cancelled) ctx.showToast('Erro ao carregar análise', 'err') })
      .finally(() => { if (!cancelled) setAnalyticsLoading(false) })
    return () => { cancelled = true }
  }, [section, period, selectedProgramId, ctx.showToast, ctx.cacheVersion])

  const products: AffiliateProductCatalogItem[] = hub?.products || affiliateAppCache.get().products || []

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) =>
      p.name.toLowerCase().includes(q)
      || String(p.category || '').toLowerCase().includes(q),
    )
  }, [products, search])

  async function copyText(text: string, label = 'Copiado!') {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      ctx.showToast(label)
    } catch {
      ctx.showToast('Não foi possível copiar', 'err')
    }
  }

  function productUrl(p: AffiliateProductCatalogItem) {
    const slug = resolveProductSlug({ slug: (p as any).slug, name: p.name, id: p.id })
    return buildAffiliateProductUrl({ origin: storeOrigin, primaryDomain, storeSlug, code, productSlug: slug, couponCode: coupon })
  }

  function shareWhatsApp(text: string) {
    if (!text) return
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }

  function shareCatalogWhatsApp() {
    const pack = hub?.share?.catalog as AffiliateSharePack | undefined
    if (pack?.url) {
      sharePackOpenWhatsApp(pack, false)
      return
    }
    shareWhatsApp(resolveAffiliateCopyTemplate(
      'Separei o catálogo da {{marca}} pra você 👇\n\n{{link_catalogo}}',
      copyCtx,
    ))
  }

  function shareShortWhatsApp() {
    const pack = hub?.share?.short as AffiliateSharePack | undefined
    if (pack?.url) {
      sharePackOpenWhatsApp(pack, false)
      return
    }
    if (shortUrl) shareWhatsApp(`Catálogo da ${ctx.brand?.name || 'loja'} 👇\n\n${shortUrl}`)
  }

  async function shareProductWhatsApp(p: AffiliateProductCatalogItem) {
    try {
      const res = await affiliateApi.sharePack({ kind: 'product', product_id: p.id })
      if (res?.pack?.url) {
        sharePackOpenWhatsApp(res.pack, false)
        return
      }
    } catch {
      /* fallback */
    }
    const url = productUrl(p)
    shareWhatsApp(`Olha isso: *${p.name}* 👇\n\n${url}`)
  }

  if (productShareKit) {
    return (
      <AffiliateShareStudio
        ctx={ctx}
        kit="product"
        product={{
          id: productShareKit.id,
          name: productShareKit.name,
          slug: (productShareKit as { slug?: string }).slug,
          image_url: productShareKit.image_url,
          price: productShareKit.price,
          promo_price: productShareKit.promo_price,
        }}
        title={productShareKit.name}
        initialDestination="whatsapp_dm"
        onClose={() => setProductShareKit(null)}
      />
    )
  }

  if (loading && !hub) {
    return (
      <div className="space-y-3 pb-2">
        <div className="affiliate-skel h-24 w-full" />
        <div className="grid grid-cols-2 gap-2">
          <div className="affiliate-skel h-16" />
          <div className="affiliate-skel h-16" />
        </div>
        <div className="affiliate-skel h-36 w-full" />
      </div>
    )
  }

  const stats = hub?.stats || {}
  const maxSeries = Math.max(1, ...(analytics?.series || []).map((s: any) => Number(s.clicks || 0)))
  const enrollments: Array<{ program_id: string; program_name: string; status: string; resources_unlocked?: boolean }> =
    hub?.enrollments?.length ? hub.enrollments : []
  const showProgramPicker = enrollments.length > 1

  return (
    <div className="affiliate-links pb-2">
      {showProgramPicker && (
        <div className="affiliate-links__programs affiliate-card p-3 mb-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8e8e93] mb-2">Programa</p>
          <div className="affiliate-hub__channel-pills flex flex-wrap gap-1">
            {enrollments.map((en) => (
              <button
                key={en.program_id}
                type="button"
                className={`affiliate-hub__channel-pill${selectedProgramId === en.program_id ? ' affiliate-hub__channel-pill--on' : ''}`}
                style={selectedProgramId === en.program_id ? { backgroundColor: `${ctx.primary}18`, color: ctx.primary } : undefined}
                onClick={() => setSelectedProgramId(en.program_id)}
              >
                {en.program_name}
                {!en.resources_unlocked ? ' · pendente' : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {hub && hub.resources_unlocked === false && (
        <div className="affiliate-card p-3 mb-2 border border-amber-200 bg-amber-50/60 text-xs text-amber-800">
          Conclua o solicitado em <strong>{hub.program_name || 'este programa'}</strong> para liberar link e cupom exclusivos.
        </div>
      )}

      <div
        className="affiliate-links__hero affiliate-card"
        style={{ background: `linear-gradient(145deg, ${ctx.primary}, ${ctx.secondary})` }}
      >
        <div className="affiliate-links__hero-top">
          <Link2 size={18} className="text-white/85" />
          <span className="affiliate-links__hero-badge">{stats.period_days || period} dias</span>
        </div>
        <h2 className="affiliate-links__hero-title">Central de links</h2>
        <p className="affiliate-links__hero-sub">Rastreio de cliques, produtos e conversões em toda a jornada</p>
      </div>

      <div className="affiliate-links__kpi-grid">
        {[
          { label: 'Cliques', value: String(stats.clicks_period ?? 0), icon: MousePointerClick },
          { label: 'Vendas', value: String(stats.conversions_period ?? 0), icon: ShoppingBag },
          { label: 'Taxa', value: formatConversionRate(stats.conversion_rate), icon: TrendingUp },
          { label: 'Comissão', value: money(stats.commission_period), icon: BarChart3 },
        ].map((k) => (
          <div key={k.label} className="affiliate-card affiliate-links__kpi">
            <k.icon size={14} style={{ color: ctx.primary }} />
            <p className="affiliate-links__kpi-label">{k.label}</p>
            <p className="affiliate-links__kpi-value">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="affiliate-segment affiliate-links__nav" role="tablist" aria-label="Central de links">
        {([
          { id: 'links' as const, label: 'Meus links', icon: Link2 },
          { id: 'produtos' as const, label: 'Produtos', icon: Package },
          { id: 'analise' as const, label: 'Análise', icon: BarChart3 },
        ]).map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            className={`affiliate-segment__btn affiliate-links__nav-btn${section === s.id ? ' affiliate-segment__btn--active' : ''}`}
            onClick={() => setSection(s.id)}
          >
            <s.icon size={13} className="inline mr-1 opacity-70" />
            {s.label}
          </button>
        ))}
      </div>

      {section === 'links' && (
        <div className="affiliate-links__stack">
          <article className="affiliate-card affiliate-links__card">
            <div className="affiliate-links__card-head">
              <span className="affiliate-links__card-icon" style={{ backgroundColor: `${ctx.primary}14`, color: ctx.primary }}>
                <QrCode size={16} />
              </span>
              <div>
                <p className="affiliate-links__card-title">Link inteligente</p>
                <p className="affiliate-links__card-desc">Redireciona com rastreio automático · ideal para bio e stories</p>
              </div>
            </div>
            <p className="affiliate-links__url">{shortUrl || '—'}</p>
            <div className="affiliate-links__actions">
              <button type="button" className="affiliate-links__action" style={{ color: ctx.primary }} onClick={() => copyText(shortUrl, 'Link copiado!')}>
                <Copy size={12} /> Copiar
              </button>
              <button type="button" className="affiliate-links__action text-emerald-600" onClick={shareShortWhatsApp}>
                <WhatsAppIcon size={12} /> WhatsApp
              </button>
            </div>
            {hub?.share?.short?.title && (
              <div className="mt-2 rounded-lg border border-neutral-100 bg-neutral-50 p-2">
                {hub.share.short.image_url && (
                  <img src={hub.share.short.image_url} alt="" className="mb-1.5 h-16 w-full rounded-md object-cover" />
                )}
                <p className="text-[11px] font-bold text-neutral-900 line-clamp-1">{hub.share.short.title}</p>
                <p className="text-[10px] text-neutral-500 line-clamp-2">{hub.share.short.description}</p>
              </div>
            )}
          </article>

          <article className="affiliate-card affiliate-links__card">
            <div className="affiliate-links__card-head">
              <span className="affiliate-links__card-icon" style={{ backgroundColor: `${ctx.primary}14`, color: ctx.primary }}>
                <Link2 size={16} />
              </span>
              <div>
                <p className="affiliate-links__card-title">Catálogo completo</p>
                <p className="affiliate-links__card-desc">Cliente vê todos os produtos com seu cupom aplicado</p>
              </div>
            </div>
            <p className="affiliate-links__url">{catalogUrl || '—'}</p>
            <div className="affiliate-links__actions">
              <button type="button" className="affiliate-links__action" style={{ color: ctx.primary }} onClick={() => copyText(catalogUrl, 'Catálogo copiado!')}>
                <Copy size={12} /> Copiar
              </button>
              <button type="button" className="affiliate-links__action text-emerald-600" onClick={shareCatalogWhatsApp}>
                <WhatsAppIcon size={12} /> WhatsApp
              </button>
            </div>
            {hub?.share?.catalog?.title && (
              <div className="mt-2 rounded-lg border border-neutral-100 bg-neutral-50 p-2">
                {hub.share.catalog.image_url && (
                  <img src={hub.share.catalog.image_url} alt="" className="mb-1.5 h-16 w-full rounded-md object-cover" />
                )}
                <p className="text-[11px] font-bold text-neutral-900 line-clamp-1">{hub.share.catalog.title}</p>
                <p className="text-[10px] text-neutral-500 line-clamp-2">{hub.share.catalog.description}</p>
              </div>
            )}
          </article>

          <article className="affiliate-card affiliate-links__card affiliate-links__card--compact">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Ticket size={16} style={{ color: ctx.primary }} />
                <div>
                  <p className="affiliate-links__card-title">Cupom</p>
                  <p className="text-sm font-extrabold text-[#1c1c1e] tracking-wide">{coupon || '—'}</p>
                </div>
              </div>
              <button type="button" className="affiliate-links__action shrink-0" style={{ color: ctx.primary }} onClick={() => copyText(coupon, 'Cupom copiado!')}>
                <Copy size={12} /> Copiar
              </button>
            </div>
          </article>

          <div className="affiliate-card affiliate-links__funnel">
            <p className="affiliate-links__section-label">Funil do período</p>
            <div className="affiliate-links__funnel-row">
              <div><p className="affiliate-links__funnel-num">{stats.clicks_period ?? 0}</p><p className="affiliate-links__funnel-lbl">Cliques</p></div>
              <ChevronRight size={14} className="text-[#c7c7cc]" />
              <div><p className="affiliate-links__funnel-num">{stats.conversions_period ?? 0}</p><p className="affiliate-links__funnel-lbl">Vendas</p></div>
              <ChevronRight size={14} className="text-[#c7c7cc]" />
              <div><p className="affiliate-links__funnel-num">{money(stats.commission_period)}</p><p className="affiliate-links__funnel-lbl">Comissão</p></div>
            </div>
            <p className="text-[10px] text-[#8e8e93] mt-2 leading-relaxed">
              Cada clique com ?ref= registra origem. A venda herda o afiliado até o checkout.
            </p>
          </div>
        </div>
      )}

      {section === 'produtos' && (
        <div className="affiliate-links__stack">
          <div className="affiliate-links__search-wrap">
            <Search size={14} className="text-[#8e8e93]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto para link rastreado"
              className="affiliate-links__search"
            />
          </div>

          {filteredProducts.length === 0 ? (
            <div className="affiliate-card affiliate-links__empty">
              <Package size={22} className="opacity-30 mx-auto mb-2" />
              <p className="text-sm font-semibold text-[#1c1c1e]">Nenhum produto</p>
            </div>
          ) : (
            filteredProducts.map((p) => {
              const url = productUrl(p)
              const clicks = Number((p as any).clicks || 0)
              return (
                <article key={p.id} className="affiliate-card affiliate-links__product">
                  {p.image_url ? (
                    <img src={normalizeUploadUrl(p.image_url)} alt="" className="affiliate-links__product-img" />
                  ) : (
                    <div className="affiliate-links__product-img affiliate-links__product-img--ph" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-xs text-[#1c1c1e] leading-tight line-clamp-2">{p.name}</p>
                    <p className="text-[10px] text-[#8e8e93] mt-0.5">{money(p.promo_price ?? p.price)} · {clicks} cliques</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <button type="button" className="affiliate-links__action" style={{ color: ctx.primary }} onClick={() => copyText(url, 'Link do produto copiado!')}>
                        <Copy size={11} /> Link
                      </button>
                      <button type="button" className="affiliate-links__action text-emerald-600" onClick={() => void shareProductWhatsApp(p)}>
                        <WhatsAppIcon size={11} /> WhatsApp
                      </button>
                      <button type="button" className="affiliate-links__action text-neutral-600" onClick={() => setProductShareKit(p)}>
                        <Share2 size={11} /> Kit
                      </button>
                    </div>
                  </div>
                </article>
              )
            })
          )}
        </div>
      )}

      {section === 'analise' && (
        <div className="affiliate-links__stack">
          <div className="affiliate-links__period-row">
            {([7, 30, 90] as PeriodDays[]).map((d) => (
              <button
                key={d}
                type="button"
                className={`affiliate-links__period-pill${period === d ? ' affiliate-links__period-pill--on' : ''}`}
                style={period === d ? { backgroundColor: `${ctx.primary}18`, color: ctx.primary } : undefined}
                onClick={() => setPeriod(d)}
              >
                {d}d
              </button>
            ))}
          </div>

          {analyticsLoading && !analytics ? (
            <div className="affiliate-skel h-32 w-full" />
          ) : (
            <>
              <div className="affiliate-card affiliate-links__chart">
                <p className="affiliate-links__section-label">Cliques por dia</p>
                <div className="affiliate-links__bars">
                  {(analytics?.series || []).map((row: any) => (
                    <div key={row.day} className="affiliate-links__bar-col" title={`${row.day}: ${row.clicks}`}>
                      <div
                        className="affiliate-links__bar"
                        style={{
                          height: `${Math.max(8, (Number(row.clicks) / maxSeries) * 100)}%`,
                          backgroundColor: ctx.primary,
                        }}
                      />
                      <span className="affiliate-links__bar-label">{String(row.day || '').slice(5)}</span>
                    </div>
                  ))}
                  {!(analytics?.series || []).length && (
                    <p className="text-xs text-[#8e8e93] py-6 text-center w-full">Sem cliques no período</p>
                  )}
                </div>
              </div>

              <div className="affiliate-card affiliate-links__breakdown">
                <p className="affiliate-links__section-label">Por tipo de link</p>
                {(analytics?.by_type || []).map((row: any) => (
                  <div key={row.link_type} className="affiliate-links__breakdown-row">
                    <span className="text-xs font-semibold text-[#1c1c1e]">{row.label || row.link_type}</span>
                    <span className="text-xs font-bold text-[#636366]">{row.clicks}</span>
                  </div>
                ))}
                {!(analytics?.by_type || []).length && (
                  <p className="text-xs text-[#8e8e93]">Ainda sem dados segmentados</p>
                )}
              </div>

              <div className="affiliate-card affiliate-links__breakdown">
                <p className="affiliate-links__section-label">Top produtos (cliques)</p>
                {(analytics?.top_products || []).map((row: any) => (
                  <div key={`${row.product_id}-${row.product_slug}`} className="affiliate-links__breakdown-row">
                    <span className="text-xs font-semibold text-[#1c1c1e] truncate">{row.product_name || row.product_slug || 'Produto'}</span>
                    <span className="text-xs font-bold text-[#636366] shrink-0">{row.clicks}</span>
                  </div>
                ))}
                {!(analytics?.top_products || []).length && (
                  <p className="text-xs text-[#8e8e93]">Compartilhe links de produto para ver ranking</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
