/**
 * Hub de Atendimento do afiliado:
 * - Copiloto IA (texto / print) com treinamento da marca
 * - Links de produtos para conversão
 * - Atalhos operacionais (fila, automático, WhatsApp)
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  Bot, Check, ChevronRight, ClipboardPaste, Copy, ImagePlus, Link2, Loader2,
  MessageCircle, Package, Radio, Search, Send, Sparkles, Target, Trash2, Truck, X,
} from 'lucide-react'
import { affiliateApi, getAffiliateBrandRef } from '@/lib/api-affiliate'
import { FreightSimulator } from '@/components/freight/FreightSimulator'
import { affiliateAppCache } from '@/lib/affiliate-app-cache'
import {
  buildAffiliateCatalogUrl,
  buildAffiliateProductUrl,
  buildAffiliateShortUrl,
} from '@/lib/affiliate-tracking'
import { resolveProductSlug } from '@/lib/affiliates/link-hub'
import { normalizeUploadUrl } from '@/lib/media-url'
import type { AppContext } from '@/pages/affiliate/types'
import type { AffiliateProductCatalogItem } from '@/lib/affiliates/types'

const money = (v: number | string | undefined) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type AssistProduct = {
  id: string
  name: string
  slug?: string | null
  price: number
  promo_price?: number | null
  image_url?: string | null
  category?: string | null
  unit?: string | null
  has_guide?: boolean
  reason?: string | null
}

type ChatTurn =
  | { id: string; role: 'user'; text: string; hasImage?: boolean; at: number }
  | {
      id: string
      role: 'assistant'
      reply: string
      summary?: string
      notes?: string
      products: AssistProduct[]
      trainingUsed?: boolean
      knowledgeUsed?: boolean
      at: number
    }

type Props = {
  ctx: AppContext
  onNavigate: (tab: string) => void
}

function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const match = result.match(/^data:([^;]+);base64,(.+)$/)
      if (!match) {
        reject(new Error('Não foi possível ler a imagem'))
        return
      }
      resolve({ mimeType: match[1] || file.type || 'image/jpeg', base64: match[2] })
    }
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo'))
    reader.readAsDataURL(file)
  })
}

function compressImageIfNeeded(file: File, maxEdge = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < 900_000) return Promise.resolve(file)
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx2d = canvas.getContext('2d')
      if (!ctx2d) {
        resolve(file)
        return
      }
      ctx2d.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file)
            return
          }
          resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg') || 'print.jpg', { type: 'image/jpeg' }))
        },
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }
    img.src = url
  })
}

export function AffiliateAttendanceHub({ ctx, onNavigate }: Props) {
  const [conversation, setConversation] = useState('')
  const [instruction, setInstruction] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imagePayload, setImagePayload] = useState<{ base64: string; mimeType: string } | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const [products, setProducts] = useState<AffiliateProductCatalogItem[]>(
    () => affiliateAppCache.get().products || [],
  )
  const [productsLoading, setProductsLoading] = useState(!affiliateAppCache.get().products)
  const [productSearch, setProductSearch] = useState('')
  const [digest, setDigest] = useState<{ inbox: number; followup_due: number; waiting?: number } | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const threadEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const storeOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const storeSlug = String(ctx.brand?.slug || getAffiliateBrandRef() || '').trim()
  const code = String(ctx.affiliate?.code || '').trim()
  const coupon = String(ctx.affiliate?.coupon_code || '').trim()
  const primaryDomain = String(ctx.brand?.primary_domain || '').trim() || null

  const catalogUrl = code
    ? buildAffiliateCatalogUrl({
        origin: storeOrigin,
        primaryDomain,
        storeSlug,
        code,
        couponCode: coupon,
      })
    : ''
  const shortUrl = code
    ? buildAffiliateShortUrl({ origin: storeOrigin, primaryDomain, code })
    : ''

  useEffect(() => {
    let cancelled = false
    setProductsLoading(true)
    affiliateAppCache
      .prefetchAll({ region: ctx.affiliate?.region })
      .then(() => {
        if (cancelled) return
        const list = affiliateAppCache.get().products
        if (list) setProducts(list)
      })
      .catch(() => {
        if (!cancelled && !affiliateAppCache.get().products) {
          ctx.showToast('Não foi possível carregar produtos', 'err')
        }
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [ctx.affiliate?.region, ctx.cacheVersion, ctx.showToast])

  useEffect(() => {
    let cancelled = false
    affiliateApi
      .attendanceDigest()
      .then((r) => {
        if (cancelled) return
        setDigest({
          inbox: Number(r.inbox || 0),
          followup_due: Number(r.followup_due || 0),
        })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [ctx.cacheVersion])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns, generating])

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    if (!q) return products.slice(0, 12)
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q)
          || String(p.category || '').toLowerCase().includes(q),
      )
      .slice(0, 16)
  }, [products, productSearch])

  const productUrl = useCallback(
    (p: { id: string; name: string; slug?: string | null }) => {
      if (!code) return ''
      const slug = resolveProductSlug({ slug: p.slug, name: p.name, id: p.id })
      return buildAffiliateProductUrl({
        origin: storeOrigin,
        primaryDomain,
        storeSlug,
        code,
        productSlug: slug,
        couponCode: coupon,
      })
    },
    [code, coupon, primaryDomain, storeOrigin, storeSlug],
  )

  async function copyText(text: string, toast = 'Copiado!', id?: string) {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      ctx.showToast(toast)
      if (id) {
        setCopiedId(id)
        window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1600)
      }
    } catch {
      ctx.showToast('Não foi possível copiar', 'err')
    }
  }

  function clearImage() {
    setImagePreview(null)
    setImagePayload(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function onPickImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) {
      ctx.showToast('Envie JPG, PNG ou WEBP', 'err')
      return
    }
    try {
      const compact = await compressImageIfNeeded(file)
      const payload = await readFileAsBase64(compact)
      setImagePayload(payload)
      setImagePreview(`data:${payload.mimeType};base64,${payload.base64}`)
      setError(null)
    } catch (err) {
      ctx.showToast(err instanceof Error ? err.message : 'Falha ao carregar imagem', 'err')
    }
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      if (!text?.trim()) {
        ctx.showToast('Área de transferência vazia', 'err')
        return
      }
      setConversation((prev) => (prev.trim() ? `${prev.trim()}\n\n${text.trim()}` : text.trim()))
      textareaRef.current?.focus()
      ctx.showToast('Texto colado')
    } catch {
      ctx.showToast('Permita acesso à área de transferência ou cole com Ctrl+V', 'err')
    }
  }

  async function generate() {
    const text = conversation.trim()
    if (!text && !imagePayload) {
      setError('Cole a pergunta do cliente ou envie um print da conversa')
      return
    }
    setGenerating(true)
    setError(null)
    const userId = `u-${Date.now()}`
    setTurns((prev) => [
      ...prev,
      {
        id: userId,
        role: 'user',
        text: text || (imagePayload ? 'Print da conversa' : ''),
        hasImage: Boolean(imagePayload),
        at: Date.now(),
      },
    ])

    try {
      const res = await affiliateApi.attendanceAssist({
        conversation: text || undefined,
        instruction: instruction.trim() || undefined,
        image: imagePayload || undefined,
      })
      setTurns((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          reply: res.reply,
          summary: res.customer_question_summary || undefined,
          notes: res.notes_for_affiliate || undefined,
          products: Array.isArray(res.products) ? res.products : [],
          trainingUsed: Boolean(res.training_used || res.knowledge_used),
          knowledgeUsed: Boolean(res.knowledge_used),
          at: Date.now(),
        },
      ])
      setConversation('')
      setInstruction('')
      clearImage()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao gerar resposta'
      setError(msg)
      ctx.showToast(msg, 'err')
    } finally {
      setGenerating(false)
    }
  }

  function clearThread() {
    setTurns([])
    setError(null)
  }

  const brandName = ctx.brand?.name || 'sua marca'

  return (
    <div className="affiliate-attendance pb-2">
      {/* Intro */}
      <header className="affiliate-attendance__intro affiliate-card">
        <div
          className="affiliate-attendance__intro-icon"
          style={{ backgroundColor: `${ctx.primary}14`, color: ctx.primary }}
        >
          <MessageCircle size={20} strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="affiliate-attendance__title">Atendimento</h2>
          <p className="affiliate-attendance__sub">
            Respostas com o treinamento de <strong>{brandName}</strong> · links prontos para converter
          </p>
        </div>
      </header>

      {/* Atalhos operacionais */}
      <section className="affiliate-attendance__shortcuts" aria-label="Atalhos de atendimento">
        <button type="button" className="affiliate-attendance__shortcut" onClick={() => onNavigate('oportunidades')}>
          <Target size={16} style={{ color: ctx.primary }} />
          <span>
            <strong>Fila</strong>
            <small>
              {digest
                ? `${digest.inbox} na fila${digest.followup_due ? ` · ${digest.followup_due} follow-up` : ''}`
                : 'Oportunidades'}
            </small>
          </span>
          <ChevronRight size={14} className="text-[#c7c7cc]" />
        </button>
        <button type="button" className="affiliate-attendance__shortcut" onClick={() => onNavigate('ao-vivo')}>
          <Radio size={16} style={{ color: ctx.primary }} />
          <span>
            <strong>Automático</strong>
            <small>Assistente e alcance</small>
          </span>
          <ChevronRight size={14} className="text-[#c7c7cc]" />
        </button>
        <button type="button" className="affiliate-attendance__shortcut" onClick={() => onNavigate('mensagens')}>
          <MessageCircle size={16} style={{ color: ctx.primary }} />
          <span>
            <strong>Mensagens</strong>
            <small>Inbox WhatsApp</small>
          </span>
          <ChevronRight size={14} className="text-[#c7c7cc]" />
        </button>
      </section>

      {/* Copiloto */}
      <section className="affiliate-attendance__copilot affiliate-card" aria-label="Copiloto de resposta">
        <div className="affiliate-attendance__copilot-head">
          <div className="affiliate-attendance__copilot-badge" style={{ backgroundColor: `${ctx.primary}12`, color: ctx.primary }}>
            <Bot size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <h3>Copiloto de resposta</h3>
            <p>Cole a conversa ou envie um print — a IA responde com o treinamento da marca</p>
          </div>
          {turns.length > 0 && (
            <button type="button" className="affiliate-attendance__icon-btn" onClick={clearThread} aria-label="Limpar conversa">
              <Trash2 size={15} />
            </button>
          )}
        </div>

        <div className="affiliate-attendance__thread" role="log" aria-live="polite" aria-relevant="additions">
          {turns.length === 0 && !generating && (
            <div className="affiliate-attendance__empty">
              <Sparkles size={22} style={{ color: ctx.primary }} />
              <p>
                Cliente perguntou algo que você não sabe? Cole o trecho ou mande o print.
                Devolvemos a resposta pronta e produtos para fechar.
              </p>
            </div>
          )}

          {turns.map((t) => {
            if (t.role === 'user') {
              return (
                <div key={t.id} className="affiliate-attendance__bubble affiliate-attendance__bubble--user">
                  {t.hasImage && (
                    <span className="affiliate-attendance__chip">
                      <ImagePlus size={12} /> Print
                    </span>
                  )}
                  <p>{t.text}</p>
                </div>
              )
            }
            return (
              <div key={t.id} className="affiliate-attendance__bubble affiliate-attendance__bubble--ai">
                <div className="affiliate-attendance__ai-meta">
                  <Bot size={13} style={{ color: ctx.primary }} />
                  <span>Resposta sugerida</span>
                  {t.trainingUsed && <span className="affiliate-attendance__tag">Treinamento</span>}
                </div>
                {t.summary && (
                  <p className="affiliate-attendance__summary">{t.summary}</p>
                )}
                <p className="affiliate-attendance__reply">{t.reply}</p>
                <div className="affiliate-attendance__reply-actions">
                  <button
                    type="button"
                    className="affiliate-attendance__action-btn"
                    style={{ backgroundColor: ctx.primary }}
                    onClick={() => copyText(t.reply, 'Resposta copiada!', t.id)}
                  >
                    {copiedId === t.id ? <Check size={14} /> : <Copy size={14} />}
                    {copiedId === t.id ? 'Copiado' : 'Copiar resposta'}
                  </button>
                </div>
                {t.notes && (
                  <p className="affiliate-attendance__notes">
                    <strong>Pra você:</strong> {t.notes}
                  </p>
                )}
                {t.products.length > 0 && (
                  <div className="affiliate-attendance__suggest-products">
                    <p className="affiliate-attendance__suggest-label">
                      <Package size={12} /> Produtos para converter
                    </p>
                    <ul>
                      {t.products.map((p) => {
                        const url = productUrl(p)
                        const price =
                          p.promo_price != null && p.promo_price < p.price
                            ? p.promo_price
                            : p.price
                        return (
                          <li key={p.id}>
                            <div className="affiliate-attendance__product-row">
                              {p.image_url ? (
                                <img src={normalizeUploadUrl(p.image_url) || p.image_url} alt="" />
                              ) : (
                                <span className="affiliate-attendance__product-ph">
                                  <Package size={14} />
                                </span>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="affiliate-attendance__product-name">{p.name}</p>
                                <p className="affiliate-attendance__product-price">
                                  {money(price)}
                                  {p.reason ? ` · ${p.reason}` : ''}
                                </p>
                              </div>
                              <button
                                type="button"
                                className="affiliate-attendance__mini-btn"
                                disabled={!url}
                                onClick={() => copyText(url, 'Link do produto copiado!')}
                              >
                                <Link2 size={13} />
                              </button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )
          })}

          {generating && (
            <div className="affiliate-attendance__bubble affiliate-attendance__bubble--ai affiliate-attendance__bubble--loading">
              <Loader2 size={16} className="animate-spin" style={{ color: ctx.primary }} />
              <span>Analisando e gerando resposta com o treinamento da marca…</span>
            </div>
          )}
          <div ref={threadEndRef} />
        </div>

        {error && (
          <div className="affiliate-attendance__error" role="alert">
            {error}
          </div>
        )}

        {imagePreview && (
          <div className="affiliate-attendance__preview">
            <img src={imagePreview} alt="Print da conversa" />
            <button type="button" onClick={clearImage} aria-label="Remover imagem">
              <X size={14} />
            </button>
          </div>
        )}

        <label className="sr-only" htmlFor="aff-attendance-conversation">
          Conversa ou pergunta do cliente
        </label>
        <textarea
          id="aff-attendance-conversation"
          ref={textareaRef}
          className="affiliate-attendance__textarea"
          rows={4}
          placeholder="Cole a conversa ou a pergunta do cliente…"
          value={conversation}
          onChange={(e) => setConversation(e.target.value)}
          disabled={generating}
        />

        <details className="affiliate-attendance__details">
          <summary>Instrução opcional (tom, produto, cidade…)</summary>
          <input
            type="text"
            className="affiliate-attendance__instruction"
            placeholder="Ex.: foque no frete grátis, tom mais formal"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={generating}
          />
        </details>

        <div className="affiliate-attendance__composer-bar">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={onPickImage}
          />
          <button
            type="button"
            className="affiliate-attendance__tool-btn"
            onClick={() => fileRef.current?.click()}
            disabled={generating}
          >
            <ImagePlus size={16} />
            Print
          </button>
          <button
            type="button"
            className="affiliate-attendance__tool-btn"
            onClick={() => void pasteFromClipboard()}
            disabled={generating}
          >
            <ClipboardPaste size={16} />
            Colar
          </button>
          <button
            type="button"
            className="affiliate-attendance__send"
            style={{ backgroundColor: ctx.primary }}
            onClick={() => void generate()}
            disabled={generating || (!conversation.trim() && !imagePayload)}
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Gerar resposta
          </button>
        </div>
      </section>

      {/* Gerador de frete — CEP real + faixas da loja */}
      <section className="space-y-2" aria-label="Simulador de frete">
        <div className="affiliate-attendance__section-head">
          <h3>
            <Truck size={15} style={{ color: ctx.primary }} />
            Frete para o cliente
          </h3>
        </div>
        <FreightSimulator
          surface="affiliate"
          accent={ctx.primary || '#171717'}
          showToast={(msg, tp) => ctx.showToast(msg, tp === 'err' ? 'err' : 'ok')}
          onLookupCep={async (cep) => {
            const res = await affiliateApi.freightLookupCep(cep)
            return { place: res.place }
          }}
          onQuote={async (payload) => {
            const res = await affiliateApi.freightQuote(payload)
            return { quote: res.quote, configured: res.configured, store_id: res.store_id }
          }}
        />
      </section>

      {/* Links de conversão */}
      <section className="affiliate-attendance__links" aria-label="Links de conversão">
        <div className="affiliate-attendance__section-head">
          <h3>
            <Link2 size={15} style={{ color: ctx.primary }} />
            Links para conversão
          </h3>
          <button type="button" className="affiliate-attendance__text-link" onClick={() => onNavigate('links')}>
            Central de links
          </button>
        </div>

        <div className="affiliate-attendance__quick-links">
          <article className="affiliate-card affiliate-attendance__quick-card">
            <p className="affiliate-attendance__quick-label">Catálogo</p>
            <p className="affiliate-attendance__quick-url">{catalogUrl || '—'}</p>
            <button
              type="button"
              className="affiliate-attendance__action-btn affiliate-attendance__action-btn--ghost"
              disabled={!catalogUrl}
              onClick={() => copyText(catalogUrl, 'Link do catálogo copiado!')}
            >
              <Copy size={13} /> Copiar
            </button>
          </article>
          <article className="affiliate-card affiliate-attendance__quick-card">
            <p className="affiliate-attendance__quick-label">Link curto</p>
            <p className="affiliate-attendance__quick-url">{shortUrl || '—'}</p>
            <button
              type="button"
              className="affiliate-attendance__action-btn affiliate-attendance__action-btn--ghost"
              disabled={!shortUrl}
              onClick={() => copyText(shortUrl, 'Link curto copiado!')}
            >
              <Copy size={13} /> Copiar
            </button>
          </article>
          {coupon && (
            <article className="affiliate-card affiliate-attendance__quick-card">
              <p className="affiliate-attendance__quick-label">Cupom</p>
              <p className="affiliate-attendance__quick-url affiliate-attendance__quick-url--code">{coupon}</p>
              <button
                type="button"
                className="affiliate-attendance__action-btn affiliate-attendance__action-btn--ghost"
                onClick={() => copyText(coupon, 'Cupom copiado!')}
              >
                <Copy size={13} /> Copiar
              </button>
            </article>
          )}
        </div>

        <div className="affiliate-attendance__product-search">
          <Search size={15} className="text-[#8e8e93]" />
          <input
            type="search"
            placeholder="Buscar produto para copiar link…"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            aria-label="Buscar produto"
          />
        </div>

        {productsLoading && !products.length ? (
          <div className="space-y-2">
            <div className="affiliate-skel h-14 w-full" />
            <div className="affiliate-skel h-14 w-full" />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="affiliate-card p-4 text-center">
            <Package size={22} className="mx-auto text-[#c7c7cc]" />
            <p className="mt-2 text-sm font-semibold text-[#1c1c1e]">Nenhum produto</p>
            <p className="mt-1 text-xs text-[#8e8e93]">
              Quando a marca publicar o catálogo, os links de conversão aparecem aqui.
            </p>
          </div>
        ) : (
          <ul className="affiliate-attendance__product-list">
            {filteredProducts.map((p) => {
              const url = productUrl(p)
              const price =
                p.promo_price != null && p.promo_price < p.price ? p.promo_price : p.price
              return (
                <li key={p.id} className="affiliate-card affiliate-attendance__product-item">
                  {p.image_url ? (
                    <img src={normalizeUploadUrl(p.image_url) || p.image_url} alt="" />
                  ) : (
                    <span className="affiliate-attendance__product-ph">
                      <Package size={16} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="affiliate-attendance__product-name">{p.name}</p>
                    <p className="affiliate-attendance__product-price">
                      {money(price)}
                      {p.category ? ` · ${p.category}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="affiliate-attendance__mini-btn affiliate-attendance__mini-btn--wide"
                    style={{ color: ctx.primary, borderColor: `${ctx.primary}33` }}
                    disabled={!url}
                    onClick={() => copyText(url, 'Link do produto copiado!')}
                  >
                    <Link2 size={13} />
                    Link
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
