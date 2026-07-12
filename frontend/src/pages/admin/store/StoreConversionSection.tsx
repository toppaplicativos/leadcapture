import type { ReactNode } from 'react'
import { Sparkles, Megaphone, ShieldCheck } from 'lucide-react'
import type { StoreConversionSettings } from '@/lib/store-conversion'
import type { StoreAnnouncementBar } from '@/lib/store-conversion'

function SettingRow({
  label,
  sub,
  children,
}: {
  label: string
  sub?: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border-light last:border-0">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-gray-900">{label}</p>
        {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
        value ? 'bg-emerald-500' : 'bg-gray-300'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          value ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

export function StoreConversionSection({
  conversion,
  announcement,
  onConversionChange,
  onAnnouncementChange,
}: {
  conversion: StoreConversionSettings
  announcement: StoreAnnouncementBar
  onConversionChange: (next: StoreConversionSettings) => void
  onAnnouncementChange: (next: StoreAnnouncementBar) => void
}) {
  function patchConv(partial: Partial<StoreConversionSettings>) {
    onConversionChange({ ...conversion, ...partial })
  }

  function patchBar(partial: Partial<StoreAnnouncementBar>) {
    onAnnouncementChange({ ...announcement, ...partial })
  }

  return (
    <div className="space-y-4">
      <section className="bg-white border border-border-light rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0 bg-gray-100 text-gray-700">
            <Megaphone size={16} strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="text-[15px] font-bold tracking-tight text-gray-900">Barra de anúncio</h3>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Faixa no topo do catálogo (frete, cupom, prazo). Vazio = texto automático da loja.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border-light divide-y divide-border-light">
          <SettingRow label="Exibir barra" sub="Topo do catálogo público">
            <Toggle value={announcement.enabled} onChange={(v) => patchBar({ enabled: v })} />
          </SettingRow>
          <SettingRow label="Pode fechar" sub="Cliente esconde na sessão">
            <Toggle
              value={announcement.dismissible}
              onChange={(v) => patchBar({ dismissible: v })}
            />
          </SettingRow>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-600 mb-1.5">
            Texto da barra
          </label>
          <input
            type="text"
            maxLength={160}
            value={announcement.text}
            onChange={(e) => patchBar({ text: e.target.value })}
            placeholder="Ex: Frete grátis acima de R$ 150 · Entrega em 48h"
            className="w-full h-11 px-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-600 mb-1.5">
            Link (opcional)
          </label>
          <input
            type="url"
            value={announcement.link_url || ''}
            onChange={(e) => patchBar({ link_url: e.target.value || null })}
            placeholder="https://..."
            className="w-full h-11 px-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900"
          />
        </div>
      </section>

      <section className="bg-white border border-border-light rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0 bg-gray-100 text-gray-700">
            <Sparkles size={16} strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="text-[15px] font-bold tracking-tight text-gray-900">
              Conversão da vitrine
            </h3>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Padrões de lojas Shopify de alta conversão — ligue o que faz sentido para a marca.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border-light divide-y divide-border-light">
          <SettingRow label="Faixa de confiança" sub="Frete e pagamento sob o hero (sem WhatsApp)">
            <Toggle
              value={conversion.trust_strip.enabled}
              onChange={(v) =>
                patchConv({ trust_strip: { ...conversion.trust_strip, enabled: v } })
              }
            />
          </SettingRow>
          <SettingRow label="Mais vendidos" sub="Seção em destaque na home">
            <Toggle
              value={conversion.show_best_sellers}
              onChange={(v) => patchConv({ show_best_sellers: v })}
            />
          </SettingRow>
          <SettingRow label="Badges nos produtos" sub="Oferta, mais vendido, estoque baixo">
            <Toggle
              value={conversion.show_product_badges}
              onChange={(v) => patchConv({ show_product_badges: v })}
            />
          </SettingRow>
          <SettingRow label="Trust no produto" sub="Frete/troca/pagamento perto do preço">
            <Toggle
              value={conversion.show_pdp_trust}
              onChange={(v) => patchConv({ show_pdp_trust: v })}
            />
          </SettingRow>
          <SettingRow label="Barra fixa de compra" sub="Sticky ATC no mobile">
            <Toggle value={conversion.sticky_atc} onChange={(v) => patchConv({ sticky_atc: v })} />
          </SettingRow>
          <SettingRow label="Carrinho lateral" sub="Drawer ao tocar no ícone / adicionar">
            <Toggle
              value={conversion.cart_drawer}
              onChange={(v) => patchConv({ cart_drawer: v })}
            />
          </SettingRow>
          <SettingRow label="Upsell no carrinho" sub="Sugere 1 produto complementar">
            <Toggle
              value={conversion.cart_upsell}
              onChange={(v) => patchConv({ cart_upsell: v })}
            />
          </SettingRow>
          <SettingRow label="Urgência de estoque" sub="Badge “últimas unidades”">
            <Toggle
              value={conversion.urgency_low_stock}
              onChange={(v) => patchConv({ urgency_low_stock: v })}
            />
          </SettingRow>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1.5">
              Título “Mais vendidos”
            </label>
            <input
              type="text"
              maxLength={60}
              value={conversion.best_sellers_title}
              onChange={(e) => patchConv({ best_sellers_title: e.target.value })}
              className="w-full h-11 px-3 rounded-xl border border-border bg-white text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1.5">
              Qtd. em destaque
            </label>
            <select
              value={conversion.best_sellers_limit}
              onChange={(e) => patchConv({ best_sellers_limit: Number(e.target.value) })}
              className="w-full h-11 px-3 rounded-xl border border-border bg-white text-sm"
            >
              {[4, 6, 8, 10, 12].map((n) => (
                <option key={n} value={n}>
                  {n} produtos
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="bg-white border border-border-light rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0 bg-gray-100 text-gray-700">
            <ShieldCheck size={16} strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="text-[15px] font-bold tracking-tight text-gray-900">
              Countdown de oferta
            </h3>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Opcional e honesto — só use se a promo tiver data real de término.
            </p>
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-600 mb-1.5">
            Rótulo
          </label>
          <input
            type="text"
            maxLength={80}
            value={conversion.promo_label}
            onChange={(e) => patchConv({ promo_label: e.target.value })}
            className="w-full h-11 px-3 rounded-xl border border-border bg-white text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-600 mb-1.5">
            Termina em (data/hora local)
          </label>
          <input
            type="datetime-local"
            value={
              conversion.promo_ends_at
                ? (() => {
                    try {
                      const d = new Date(conversion.promo_ends_at)
                      if (Number.isNaN(d.getTime())) return ''
                      const pad = (n: number) => String(n).padStart(2, '0')
                      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
                    } catch {
                      return ''
                    }
                  })()
                : ''
            }
            onChange={(e) => {
              const v = e.target.value
              if (!v) {
                patchConv({ promo_ends_at: null })
                return
              }
              const d = new Date(v)
              patchConv({ promo_ends_at: Number.isNaN(d.getTime()) ? null : d.toISOString() })
            }}
            className="w-full h-11 px-3 rounded-xl border border-border bg-white text-sm"
          />
          {conversion.promo_ends_at && (
            <button
              type="button"
              className="mt-2 text-[12px] font-semibold text-gray-600 hover:text-gray-900"
              onClick={() => patchConv({ promo_ends_at: null })}
            >
              Remover countdown
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
