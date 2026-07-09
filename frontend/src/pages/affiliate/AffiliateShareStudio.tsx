import { useEffect, useMemo, useState } from 'react'
import {
  X, Copy, Share2, Sparkles, Loader2, Download, ChevronLeft,
  MessageCircle, Search, Check,
} from 'lucide-react'
import { InstagramIcon } from '@/components/icons'
import { affiliateApi, getAffiliateBrandRef } from '@/lib/api-affiliate'
import {
  buildAffiliateCatalogUrl,
  buildAffiliateProductUrl,
  buildAffiliateShortUrl,
} from '@/lib/affiliate-tracking'
import {
  SHARE_DESTINATIONS,
  getShareDestination,
  type ShareDestinationId,
  type ShareKitId,
} from '@/lib/affiliates/share-destinations'
import {
  buildInstantSharePack,
  mergeSharePack,
  type SharePackContent,
} from '@/lib/affiliates/share-kits'
import type { AppContext } from '@/pages/affiliate/types'

type ProductRef = {
  id: string
  name: string
  slug?: string | null
  image_url?: string | null
  price?: number
  promo_price?: number | null
}

type MaterialRef = {
  id: string
  title: string
  media_url?: string | null
  type?: string
}

type Props = {
  ctx: AppContext
  kit: ShareKitId
  onClose?: () => void
  title?: string
  product?: ProductRef | null
  material?: MaterialRef | null
  initialDestination?: ShareDestinationId
  compact?: boolean
}

const money = (v: number | string | undefined) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function buildShareContext(
  ctx: AppContext,
  storeOrigin: string,
  storeSlug: string,
  product?: ProductRef | null,
  material?: MaterialRef | null,
) {
  const code = String(ctx.affiliate?.code || '').trim()
  const coupon = String(ctx.affiliate?.coupon_code || '').trim()
  const brandRef = storeSlug || getAffiliateBrandRef() || ''
  const catalogUrl = code
    ? buildAffiliateCatalogUrl({ origin: storeOrigin, storeSlug, code, couponCode: coupon })
    : ''
  const shortUrl = code ? buildAffiliateShortUrl({ origin: storeOrigin, code }) : ''
  const programUrl = brandRef ? `${storeOrigin}/central-afiliado/${encodeURIComponent(brandRef)}` : ''
  const productUrl = product && code
    ? buildAffiliateProductUrl({
      origin: storeOrigin,
      storeSlug,
      code,
      productSlug: String(product.slug || product.id),
      couponCode: coupon,
    })
    : catalogUrl

  const price = product ? money(product.promo_price ?? product.price) : ''

  return {
    nome_afiliado: ctx.affiliate?.display_name || '',
    cupom: coupon,
    codigo: code,
    marca: ctx.brand?.name || '',
    link_catalogo: product ? productUrl : catalogUrl,
    link_curto: shortUrl,
    link_programa: programUrl,
    comissao: ctx.commission?.label || '',
    produto: product?.name || '',
    preco: price,
    material: material?.title || '',
    slogan: (ctx.brand as { slogan?: string })?.slogan || '',
    tom: (ctx.program as { promotion_tone?: string })?.promotion_tone || '',
  }
}

function resolvePackImage(
  kit: ShareKitId,
  ctx: AppContext,
  product?: ProductRef | null,
  material?: MaterialRef | null,
): string | null {
  if (material?.media_url) return material.media_url
  if (product?.image_url) return product.image_url
  if (kit === 'program') {
    return (ctx.program as { share_image_url?: string })?.share_image_url
      || ctx.brand?.logo_url
      || null
  }
  return (ctx.program as { share_image_url?: string })?.share_image_url
    || ctx.brand?.logo_url
    || null
}

export function AffiliateShareStudio({
  ctx,
  kit,
  onClose,
  title,
  product,
  material,
  initialDestination = 'whatsapp_dm',
  compact = false,
}: Props) {
  const [destination, setDestination] = useState<ShareDestinationId>(initialDestination)
  const [pack, setPack] = useState<SharePackContent | null>(null)
  const [refining, setRefining] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const storeOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const storeSlug = String(ctx.brand?.slug || getAffiliateBrandRef() || '').trim()

  const shareCtx = useMemo(
    () => buildShareContext(ctx, storeOrigin, storeSlug, product, material),
    [ctx, storeOrigin, storeSlug, product, material],
  )

  const imageUrl = useMemo(
    () => resolvePackImage(kit, ctx, product, material),
    [kit, ctx, product, material],
  )

  const dest = getShareDestination(destination)
  const channelDestinations = SHARE_DESTINATIONS.filter(
    (d) => !compact || d.channel === 'whatsapp' || d.channel === 'instagram',
  )

  useEffect(() => {
    const instant = buildInstantSharePack({
      kit,
      destination,
      ctx: shareCtx,
      imageUrl,
    })
    setPack(instant)
  }, [kit, destination, shareCtx, imageUrl])

  async function refineWithAi() {
    setRefining(true)
    try {
      const res = await affiliateApi.generateSharePack({
        kit,
        destination,
        product_id: product?.id,
        material_id: material?.id,
      })
      const ai = res.pack
      if (!pack) return
      setPack(mergeSharePack(pack, {
        seo_title: ai.seo_title || pack.seo_title,
        headline: ai.headline || pack.headline,
        subtitle: ai.subtitle || pack.subtitle,
        body: ai.body || pack.body,
        hashtags: ai.hashtags?.length ? ai.hashtags : pack.hashtags,
        cta: ai.cta || pack.cta,
        full_text: ai.full_text || pack.full_text,
        char_count: (ai.full_text || pack.full_text).length,
      }))
      ctx.showToast('Kit refinado com IA!')
    } catch (e: unknown) {
      ctx.showToast(e instanceof Error ? e.message : 'Erro ao refinar', 'err')
    } finally {
      setRefining(false)
    }
  }

  async function copyValue(text: string, field: string, label = 'Copiado!') {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
      ctx.showToast(label)
    } catch {
      ctx.showToast('Não foi possível copiar', 'err')
    }
  }

  function shareWhatsApp(text?: string) {
    const msg = text || pack?.full_text || ''
    if (!msg) return
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  function downloadImage() {
    if (!imageUrl) return
    const a = document.createElement('a')
    a.href = imageUrl
    a.download = `${kit}-share.jpg`
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const panelTitle = title
    || (kit === 'product' && product?.name)
    || (kit === 'material' && material?.title)
    || (kit === 'program' ? 'Convite ao programa' : 'Kit de divulgação')

  const charPct = pack ? Math.min(100, (pack.char_count / pack.max_chars) * 100) : 0
  const charWarn = charPct > 92

  return (
    <div className={`affiliate-share${compact ? ' affiliate-share--compact' : ''}`}>
      {onClose && (
        <button type="button" onClick={onClose} className="affiliate-share__back">
          <ChevronLeft size={14} /> Voltar
        </button>
      )}

      <div className="affiliate-share__head affiliate-card">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8e8e93]">Kit pronto</p>
          <h2 className="font-extrabold text-sm text-[#1c1c1e] truncate">{panelTitle}</h2>
          {(ctx.program as { promotion_tone?: string })?.promotion_tone && (
            <p className="text-[10px] text-[#8e8e93] mt-0.5 truncate">
              Tom: {(ctx.program as { promotion_tone?: string }).promotion_tone}
            </p>
          )}
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="affiliate-share__close" aria-label="Fechar">
            <X size={18} />
          </button>
        )}
      </div>

      <div className="affiliate-share__dest-scroll" role="tablist" aria-label="Destino">
        {channelDestinations.map((d) => {
          const Icon = d.icon
          const on = destination === d.id
          return (
            <button
              key={d.id}
              type="button"
              role="tab"
              aria-selected={on}
              className={`affiliate-share__dest-pill${on ? ' affiliate-share__dest-pill--on' : ''}`}
              style={on ? { backgroundColor: `${ctx.primary}18`, color: ctx.primary, borderColor: `${ctx.primary}40` } : undefined}
              onClick={() => setDestination(d.id)}
            >
              <Icon size={13} />
              <span>{d.shortLabel}</span>
            </button>
          )
        })}
      </div>

      <p className="affiliate-share__dest-hint">{dest.hint}</p>

      {pack && (
        <>
          <div className="affiliate-share__preview affiliate-card">
            {imageUrl && dest.imageAspect !== 'none' && (
              <div
                className={`affiliate-share__preview-media affiliate-share__preview-media--${dest.imageAspect.replace(':', '-')}`}
              >
                <img src={imageUrl} alt="" />
                <span className="affiliate-share__aspect-badge">{dest.imageAspect}</span>
              </div>
            )}

            {destination === 'seo_link' && pack.seo_title && (
              <div className="affiliate-share__seo-card">
                <p className="affiliate-share__seo-domain">{storeOrigin.replace(/^https?:\/\//, '')}</p>
                <p className="affiliate-share__seo-title">{pack.seo_title}</p>
                <p className="affiliate-share__seo-desc">{pack.subtitle || pack.body}</p>
              </div>
            )}

            <div className="affiliate-share__preview-text">
              {pack.headline && <p className="affiliate-share__preview-headline">{pack.headline}</p>}
              {pack.subtitle && <p className="affiliate-share__preview-sub">{pack.subtitle}</p>}
              {pack.body && <p className="affiliate-share__preview-body">{pack.body}</p>}
              {pack.cta && <p className="affiliate-share__preview-cta" style={{ color: ctx.primary }}>{pack.cta}</p>}
              {pack.hashtags.length > 0 && (
                <p className="affiliate-share__preview-tags">{pack.hashtags.join(' ')}</p>
              )}
            </div>

            <div className="affiliate-share__char-bar">
              <div
                className={`affiliate-share__char-fill${charWarn ? ' affiliate-share__char-fill--warn' : ''}`}
                style={{ width: `${charPct}%`, backgroundColor: charWarn ? '#f59e0b' : ctx.primary }}
              />
              <span className="affiliate-share__char-label">{pack.char_count}/{pack.max_chars}</span>
            </div>
          </div>

          <div className="affiliate-share__fields">
            {dest.fields.includes('seo_title') && pack.seo_title && (
              <FieldRow
                label="Título SEO"
                value={pack.seo_title}
                fieldKey="seo"
                copied={copiedField}
                onCopy={copyValue}
                primary={ctx.primary}
              />
            )}
            {pack.headline && (
              <FieldRow label="Título" value={pack.headline} fieldKey="headline" copied={copiedField} onCopy={copyValue} primary={ctx.primary} />
            )}
            {pack.subtitle && (
              <FieldRow label="Subtítulo" value={pack.subtitle} fieldKey="subtitle" copied={copiedField} onCopy={copyValue} primary={ctx.primary} />
            )}
            {pack.body && (
              <FieldRow label="Texto" value={pack.body} fieldKey="body" copied={copiedField} onCopy={copyValue} primary={ctx.primary} multiline />
            )}
            {pack.hashtags.length > 0 && (
              <FieldRow
                label="Hashtags"
                value={pack.hashtags.join(' ')}
                fieldKey="tags"
                copied={copiedField}
                onCopy={copyValue}
                primary={ctx.primary}
              />
            )}
          </div>

          <div className="affiliate-share__actions">
            <button
              type="button"
              className="affiliate-share__action affiliate-share__action--primary"
              style={{ backgroundColor: ctx.primary }}
              onClick={() => copyValue(pack.full_text, 'all', 'Kit completo copiado!')}
            >
              {copiedField === 'all' ? <Check size={14} /> : <Copy size={14} />}
              Copiar tudo
            </button>
            <button type="button" className="affiliate-share__action text-emerald-600" onClick={() => shareWhatsApp()}>
              <MessageCircle size={14} /> WhatsApp
            </button>
            {(destination.startsWith('instagram') || destination === 'seo_link') && (
              <button
                type="button"
                className="affiliate-share__action"
                style={{ color: ctx.primary }}
                onClick={() => copyValue(pack.full_text, 'ig', 'Legenda copiada!')}
              >
                <InstagramIcon size={14} /> Copiar legenda
              </button>
            )}
            {destination === 'seo_link' && (
              <button
                type="button"
                className="affiliate-share__action"
                style={{ color: ctx.primary }}
                onClick={() => copyValue(`${pack.seo_title}\n${pack.subtitle}\n${shareCtx.link_programa || shareCtx.link_catalogo}`, 'seo', 'SEO copiado!')}
              >
                <Search size={14} /> Copiar SEO
              </button>
            )}
            {imageUrl && (
              <button type="button" className="affiliate-share__action text-[#636366]" onClick={downloadImage}>
                <Download size={14} /> Imagem
              </button>
            )}
            <button
              type="button"
              className="affiliate-share__action affiliate-share__action--ai"
              onClick={refineWithAi}
              disabled={refining}
            >
              {refining ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {refining ? 'Refinando…' : 'Refinar com IA'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function FieldRow({
  label,
  value,
  fieldKey,
  copied,
  onCopy,
  primary,
  multiline,
}: {
  label: string
  value: string
  fieldKey: string
  copied: string | null
  onCopy: (text: string, field: string, label?: string) => void
  primary: string
  multiline?: boolean
}) {
  return (
    <div className="affiliate-share__field affiliate-card">
      <div className="affiliate-share__field-head">
        <span className="affiliate-share__field-label">{label}</span>
        <button
          type="button"
          className="affiliate-share__field-copy"
          style={{ color: primary }}
          onClick={() => onCopy(value, fieldKey, `${label} copiado!`)}
        >
          {copied === fieldKey ? <Check size={11} /> : <Copy size={11} />}
          {copied === fieldKey ? 'Ok' : 'Copiar'}
        </button>
      </div>
      <p className={`affiliate-share__field-value${multiline ? ' affiliate-share__field-value--multi' : ''}`}>{value}</p>
    </div>
  )
}