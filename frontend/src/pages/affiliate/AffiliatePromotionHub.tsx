import { useEffect, useMemo, useState } from 'react'
import {
  Megaphone, Copy, Share2, Link2, Ticket, MessageCircle,
  ChevronRight, ChevronLeft, Sparkles, Image, Lightbulb, Wand2,
} from 'lucide-react'
import { InstagramIcon } from '@/components/icons'
import { affiliateApi, getAffiliateBrandRef } from '@/lib/api-affiliate'
import { affiliateAppCache } from '@/lib/affiliate-app-cache'
import { buildAffiliateCatalogUrl } from '@/lib/affiliate-tracking'
import { resolveAffiliateCopyTemplate } from '@/lib/affiliates/copy-template'
import { PROMOTION_PLAYBOOK, PROMOTION_TECHNIQUES, type PromotionTechnique } from '@/lib/affiliates/promotion-hub'
import { AffiliateMaterialStudio } from '@/pages/affiliate/AffiliateMaterialStudio'
import { AffiliateShareStudio } from '@/pages/affiliate/AffiliateShareStudio'
import { SHARE_KITS, type ShareKitId } from '@/lib/affiliates/share-destinations'
import type { AppContext } from '@/pages/affiliate/types'

type HubSection = 'overview' | 'kits' | 'techniques' | 'gallery'
type ChannelFilter = '' | 'instagram' | 'whatsapp'

function PanelSkeleton() {
  return (
    <div className="space-y-3 pb-2">
      <div className="affiliate-skel h-28 w-full" />
      <div className="affiliate-skel h-16 w-full" />
      <div className="grid grid-cols-2 gap-2">
        <div className="affiliate-skel h-24" />
        <div className="affiliate-skel h-24" />
      </div>
      <div className="affiliate-skel h-36 w-full" />
    </div>
  )
}

type Props = { ctx: AppContext }

export function AffiliatePromotionHub({ ctx }: Props) {
  const snap = affiliateAppCache.get()
  const [materials, setMaterials] = useState<any[]>(snap.materials || [])
  const [loading, setLoading] = useState(snap.materials == null)
  const [section, setSection] = useState<HubSection>('overview')
  const [channel, setChannel] = useState<ChannelFilter>('')
  const [technique, setTechnique] = useState<PromotionTechnique | null>(null)
  const [activeMaterial, setActiveMaterial] = useState<any | null>(null)
  const [activeKit, setActiveKit] = useState<ShareKitId | null>(null)
  const [programId, setProgramId] = useState('')
  const [enrollments, setEnrollments] = useState<any[]>([])

  const storeOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const storeSlug = String(ctx.brand?.slug || getAffiliateBrandRef() || '').trim()
  const primaryDomain = String(ctx.brand?.primary_domain || '').trim() || null
  const copyCtx = useMemo(() => ({
    nome_afiliado: ctx.affiliate?.display_name || '',
    cupom: ctx.affiliate?.coupon_code || '',
    codigo: ctx.affiliate?.code || '',
    marca: ctx.brand?.name || '',
    link_catalogo: ctx.affiliate?.code
      ? buildAffiliateCatalogUrl({
          origin: storeOrigin,
          primaryDomain,
          storeSlug,
          code: ctx.affiliate.code,
          couponCode: ctx.affiliate.coupon_code,
        })
      : '',
  }), [ctx, storeOrigin, storeSlug, primaryDomain])

  useEffect(() => {
    affiliateApi.programEnrollments()
      .then((r) => setEnrollments(r.enrollments || []))
      .catch(() => {})
  }, [ctx.cacheVersion])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    affiliateApi.materials(ctx.affiliate?.region, programId || undefined)
      .then((r) => { if (!cancelled) setMaterials(r.materials || []) })
      .catch(() => { if (!cancelled) ctx.showToast('Erro ao carregar hub', 'err') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ctx.affiliate?.region, programId, ctx.showToast, ctx.cacheVersion])

  const filteredMaterials = channel
    ? materials.filter((m) => m.channel === channel || m.channel === 'geral')
    : materials

  const filteredTechniques = channel
    ? PROMOTION_TECHNIQUES.filter((t) => t.channel === channel || t.channel === 'geral')
    : PROMOTION_TECHNIQUES

  async function copyText(text: string, label = 'Copiado!') {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      ctx.showToast(label)
    } catch {
      ctx.showToast('Não foi possível copiar', 'err')
    }
  }

  function shareWhatsApp(text?: string) {
    const msg = text || resolveAffiliateCopyTemplate(
      'Confira {{marca}} com meu cupom {{cupom}}: {{link_catalogo}}',
      copyCtx,
    )
    if (!msg) return
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  if (loading && !materials.length && affiliateAppCache.get().materials == null) return <PanelSkeleton />

  if (activeKit) {
    return (
      <AffiliateShareStudio
        ctx={ctx}
        kit={activeKit}
        onClose={() => setActiveKit(null)}
        initialDestination={activeKit === 'program' ? 'seo_link' : 'whatsapp_dm'}
      />
    )
  }

  if (activeMaterial) {
    return (
      <AffiliateMaterialStudio
        material={activeMaterial}
        ctx={ctx}
        onClose={() => setActiveMaterial(null)}
      />
    )
  }

  if (technique) {
    const example = resolveAffiliateCopyTemplate(technique.example, copyCtx)
    return (
      <div className="affiliate-hub pb-2">
        <button
          type="button"
          onClick={() => setTechnique(null)}
          className="affiliate-hub__back"
        >
          <ChevronLeft size={14} /> Técnicas
        </button>
        <div className="affiliate-hub__tech-detail affiliate-card">
          <div className="affiliate-hub__tech-detail-head">
            <span className="affiliate-hub__tech-icon" style={{ backgroundColor: `${ctx.primary}14`, color: ctx.primary }}>
              <technique.icon size={20} />
            </span>
            <div>
              <span className="affiliate-hub__tech-tag">{technique.tag}</span>
              <h2 className="affiliate-hub__tech-title">{technique.title}</h2>
            </div>
          </div>
          <p className="affiliate-hub__tech-summary">{technique.summary}</p>
          <ol className="affiliate-hub__tech-steps">
            {technique.steps.map((step, i) => (
              <li key={step}>
                <span className="affiliate-hub__step-num">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <div className="affiliate-hub__example">
            <p className="affiliate-hub__example-label">Exemplo pronto</p>
            <p className="affiliate-hub__example-text">{example}</p>
            <div className="flex gap-2 mt-3">
              <button type="button" className="affiliate-hub__pill-btn" style={{ color: ctx.primary }} onClick={() => copyText(example)}>
                <Copy size={12} /> Copiar
              </button>
              <button type="button" className="affiliate-hub__pill-btn text-emerald-600" onClick={() => shareWhatsApp(example)}>
                <Share2 size={12} /> WhatsApp
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="affiliate-hub pb-2">
      {/* Hero — arsenal + atalhos */}
      <div
        className="affiliate-hub__hero affiliate-card"
        style={{ background: `linear-gradient(145deg, ${ctx.primary}, ${ctx.secondary})` }}
      >
        <div className="affiliate-hub__hero-top">
          <Megaphone size={18} className="text-white/80" />
          <span className="affiliate-hub__hero-badge">{materials.length} materiais</span>
        </div>
        <h2 className="affiliate-hub__hero-title">Hub de divulgação</h2>
        <p className="affiliate-hub__hero-sub">Ferramentas, técnicas e galeria oficial da marca</p>
        <div className="affiliate-hub__quick-row">
          <button type="button" className="affiliate-hub__quick" onClick={() => copyText(copyCtx.link_catalogo, 'Link copiado!')}>
            <Link2 size={15} />
            <span>Link</span>
          </button>
          <button type="button" className="affiliate-hub__quick" onClick={() => copyText(copyCtx.cupom || '', 'Cupom copiado!')}>
            <Ticket size={15} />
            <span>Cupom</span>
          </button>
          <button type="button" className="affiliate-hub__quick" onClick={() => shareWhatsApp()}>
            <MessageCircle size={15} />
            <span>WhatsApp</span>
          </button>
          <button
            type="button"
            className="affiliate-hub__quick"
            onClick={() => copyText(
              resolveAffiliateCopyTemplate('Indicação {{marca}} · {{link_catalogo}} · cupom {{cupom}}', copyCtx),
              'Legenda copiada!',
            )}
          >
            <InstagramIcon size={15} />
            <span>Story</span>
          </button>
        </div>
      </div>

      {/* Navegação interna do hub */}
      <div className="affiliate-segment affiliate-hub__nav" role="tablist" aria-label="Seções do hub">
        {([
          { id: 'overview' as const, label: 'Visão geral', icon: Sparkles },
          { id: 'kits' as const, label: 'Kits prontos', icon: Megaphone },
          { id: 'techniques' as const, label: 'Técnicas', icon: Wand2 },
          { id: 'gallery' as const, label: 'Galeria', icon: Image },
        ]).map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            className={`affiliate-segment__btn affiliate-hub__nav-btn${section === s.id ? ' affiliate-segment__btn--active' : ''}`}
            onClick={() => setSection(s.id)}
          >
            <s.icon size={13} className="inline mr-1 opacity-70" />
            {s.label}
          </button>
        ))}
      </div>

      {enrollments.length > 1 && (
        <div className="affiliate-hub__channel-row">
          <span className="text-[10px] font-bold text-[#8e8e93] uppercase tracking-wider">Programa</span>
          <div className="affiliate-hub__channel-pills">
            <button
              type="button"
              className={`affiliate-hub__channel-pill${!programId ? ' affiliate-hub__channel-pill--on' : ''}`}
              style={!programId ? { backgroundColor: `${ctx.primary}18`, color: ctx.primary } : undefined}
              onClick={() => setProgramId('')}
            >
              Geral
            </button>
            {enrollments.map((en) => (
              <button
                key={en.program_id}
                type="button"
                className={`affiliate-hub__channel-pill${programId === en.program_id ? ' affiliate-hub__channel-pill--on' : ''}`}
                style={programId === en.program_id ? { backgroundColor: `${ctx.primary}18`, color: ctx.primary } : undefined}
                onClick={() => setProgramId(en.program_id)}
              >
                {en.program_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filtro canal */}
      <div className="affiliate-hub__channel-row">
        <span className="text-[10px] font-bold text-[#8e8e93] uppercase tracking-wider">Canal</span>
        <div className="affiliate-hub__channel-pills">
          {([
            { id: '' as ChannelFilter, label: 'Todos' },
            { id: 'instagram' as ChannelFilter, label: 'Instagram' },
            { id: 'whatsapp' as ChannelFilter, label: 'WhatsApp' },
          ]).map((c) => (
            <button
              key={c.id || 'all'}
              type="button"
              className={`affiliate-hub__channel-pill${channel === c.id ? ' affiliate-hub__channel-pill--on' : ''}`}
              style={channel === c.id ? { backgroundColor: `${ctx.primary}18`, color: ctx.primary } : undefined}
              onClick={() => setChannel(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {(section === 'overview' || section === 'kits') && (
        <>
          <div className="affiliate-hub__section-head">
            <Megaphone size={14} style={{ color: ctx.primary }} />
            <p>Kits prontos por destino</p>
          </div>
          <div className="affiliate-hub__kit-grid">
            {SHARE_KITS.filter((k) => k.id !== 'material').map((k) => (
              <button
                key={k.id}
                type="button"
                className="affiliate-hub__kit-card affiliate-card"
                onClick={() => setActiveKit(k.id)}
              >
                <span className="affiliate-hub__kit-icon" style={{ backgroundColor: `${ctx.primary}12`, color: ctx.primary }}>
                  <k.icon size={18} />
                </span>
                <p className="affiliate-hub__kit-title">{k.label}</p>
                <p className="affiliate-hub__kit-desc">{k.desc}</p>
                <span className="affiliate-hub__kit-cta" style={{ color: ctx.primary }}>
                  Abrir kit <ChevronRight size={12} className="inline" />
                </span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-[#8e8e93] px-1 leading-relaxed">
            Cada kit gera título, subtítulo, legenda, hashtags e imagem no formato certo para WhatsApp, Instagram e preview de link.
          </p>
        </>
      )}

      {(section === 'overview' || section === 'techniques') && (
        <>
          <div className="affiliate-hub__section-head">
            <Wand2 size={14} style={{ color: ctx.primary }} />
            <p>Técnicas que convertem</p>
          </div>
          <div className="affiliate-hub__tech-grid">
            {filteredTechniques.map((t) => (
              <button
                key={t.id}
                type="button"
                className="affiliate-hub__tech-card"
                onClick={() => setTechnique(t)}
              >
                <span className="affiliate-hub__tech-icon" style={{ backgroundColor: `${ctx.primary}12`, color: ctx.primary }}>
                  <t.icon size={16} />
                </span>
                <span className="affiliate-hub__tech-tag">{t.tag}</span>
                <p className="affiliate-hub__tech-card-title">{t.title}</p>
                <p className="affiliate-hub__tech-card-desc">{t.summary}</p>
                <ChevronRight size={14} className="affiliate-hub__tech-arrow text-[#c7c7cc]" />
              </button>
            ))}
          </div>
        </>
      )}

      {section === 'overview' && (
        <>
          <div className="affiliate-hub__section-head">
            <Lightbulb size={14} style={{ color: ctx.primary }} />
            <p>Playbook rápido</p>
          </div>
          <div className="affiliate-hub__playbook">
            {PROMOTION_PLAYBOOK.map((tip) => (
              <div key={tip.id} className="affiliate-hub__playbook-item affiliate-card">
                <tip.icon size={16} style={{ color: ctx.primary }} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-xs text-[#1c1c1e]">{tip.title}</p>
                  <p className="text-[11px] text-[#636366] mt-1 leading-relaxed">{tip.body}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {(section === 'overview' || section === 'gallery') && (
        <>
          <div className="affiliate-hub__section-head">
            <Image size={14} style={{ color: ctx.primary }} />
            <p>Galeria da marca {filteredMaterials.length ? `· ${filteredMaterials.length}` : ''}</p>
          </div>

          {filteredMaterials.length === 0 ? (
            <div className="affiliate-hub__empty affiliate-card">
              <Image size={22} className="opacity-30 mx-auto mb-2" />
              <p className="text-sm font-semibold text-[#1c1c1e]">Galeria em atualização</p>
              <p className="text-xs text-[#8e8e93] mt-1">Use as técnicas acima com seu link e cupom enquanto a marca publica artes</p>
            </div>
          ) : (
            <>
              <div className="affiliate-mat-grid">
                {filteredMaterials.slice(0, 6).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setActiveMaterial(m)}
                    className="affiliate-mat-item affiliate-card overflow-hidden text-left w-full"
                  >
                    {m.media_url && (
                      m.type === 'video' ? (
                        <video src={m.media_url} className="affiliate-mat-item__media" muted playsInline />
                      ) : (
                        <img src={m.media_url} alt={m.title} className="affiliate-mat-item__media" />
                      )
                    )}
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-1">
                        <p className="font-bold text-xs text-[#1c1c1e] leading-tight">{m.title}</p>
                        <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-[#f2f2f7] text-[#8e8e93] shrink-0">
                          {m.category || m.type}
                        </span>
                      </div>
                      <p className="text-[10px] text-[#8e8e93] mt-2 flex items-center gap-1">
                        <Sparkles size={11} style={{ color: ctx.primary }} />
                        Gerar legenda e compartilhar
                      </p>
                    </div>
                  </button>
                ))}
              </div>
              {filteredMaterials.length > 6 && (
                <p className="text-[11px] text-center text-[#8e8e93] px-2">
                  +{filteredMaterials.length - 6} na página <strong>Materiais</strong> (menu Mais)
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}