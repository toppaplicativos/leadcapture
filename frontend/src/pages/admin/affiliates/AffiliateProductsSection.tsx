import { useState } from 'react'
import { Sparkles, Loader2, RefreshCw, Package } from 'lucide-react'
import { getHeaders } from '@/lib/admin/helpers'
import type { AffiliateProductCatalogItem } from '@/lib/affiliates/types'

const money = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type Props = {
  products: AffiliateProductCatalogItem[]
  onRefresh: () => void
  showToast: (t: string, tp?: 'ok' | 'err') => void
  saving: boolean
  setSaving: (v: boolean) => void
}

export function AffiliateProductsSection({ products, onRefresh, showToast, saving, setSaving }: Props) {
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const brandId = localStorage.getItem('lead-system:active-brand-id') || ''

  async function generateGuide(productId: string, force = false) {
    setGeneratingId(productId)
    setSaving(true)
    try {
      const r = await fetch(`/api/affiliates/products/${productId}/generate-guide`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ brand_id: brandId, force }),
      })
      const d = await r.json()
      if (!r.ok) {
        const detail = [d.error, d.reason, d.message].filter(Boolean).join(' — ')
        throw new Error(detail || `Erro ${r.status}`)
      }
      showToast(force ? 'Guia regenerado com IA!' : 'Guia gerado e publicado para afiliados!')
      onRefresh()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha na geração IA'
      showToast(msg.length > 120 ? `${msg.slice(0, 117)}…` : msg, 'err')
    } finally {
      setGeneratingId(null)
      setSaving(false)
    }
  }

  const withGuide = products.filter((p) => p.has_guide).length

  return (
    <div className="affiliates-page__section">
      <div className="affiliates-prod-admin__header">
        <div>
          <h3 className="affiliates-page__form-title">Catálogo para afiliados</h3>
          <p className="affiliates-page__field-hint">
            {withGuide} de {products.length} produtos com guia IA · gera uma vez e fica hospedado para estudo
          </p>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="affiliates-mat__empty">
          <Package size={28} className="opacity-30" />
          <p>Nenhum produto ativo no catálogo</p>
          <p className="text-xs text-gray-400">Ative produtos em Produtos para disponibilizar aqui</p>
        </div>
      ) : (
        <div className="affiliates-prod-admin__list">
          {products.map((p) => {
            const busy = generatingId === p.id
            const price = p.promo_price && p.promo_price < p.price ? p.promo_price : p.price
            return (
              <article key={p.id} className="affiliates-prod-admin__row affiliate-card">
                <div className="affiliates-prod-admin__thumb">
                  {p.image_url ? (
                    <img src={p.image_url} alt="" />
                  ) : (
                    <span>{p.name[0]}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm text-[#1c1c1e] truncate">{p.name}</p>
                  <p className="text-xs text-gray-500">{money(price)}{p.category ? ` · ${p.category}` : ''}</p>
                  <p className="text-[10px] font-bold mt-1 uppercase tracking-wide"
                    style={{ color: p.has_guide ? '#059669' : '#9ca3af' }}
                  >
                    {p.has_guide ? 'Guia IA publicado' : p.guide_status === 'failed' ? 'Falha na geração' : 'Sem guia'}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    type="button"
                    className="affiliates-page__btn affiliates-page__btn--primary affiliates-page__btn--sm"
                    disabled={saving}
                    onClick={() => generateGuide(p.id, !!p.has_guide)}
                  >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    {p.has_guide ? 'Regenerar IA' : 'Gerar com IA'}
                  </button>
                  {p.has_guide && (
                    <button
                      type="button"
                      className="affiliates-page__btn affiliates-page__btn--ghost affiliates-page__btn--sm"
                      disabled={saving}
                      onClick={() => generateGuide(p.id, true)}
                    >
                      <RefreshCw size={12} /> Atualizar
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}