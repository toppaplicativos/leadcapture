import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Loader2,
  Upload,
  Palette,
  ShoppingCart,
  Globe,
  ExternalLink,
  MessageCircle,
  Truck,
  CreditCard,
  Ticket,
  Grid3x3,
  ImageIcon,
} from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { WhatsAppIcon } from '@/components/icons'
import { StorePreviewPane } from './StorePreviewPane'
import { useStoreStudio, getStoreStudioHeaders, type StoreStudioTab } from './useStoreStudio'
import type { StorePageScope } from '@/lib/store-marketing'

const TABS: { id: StoreStudioTab; label: string; icon: typeof Palette }[] = [
  { id: 'identity', label: 'Identidade', icon: Palette },
  { id: 'whatsapp', label: 'Contato & WhatsApp', icon: MessageCircle },
  { id: 'checkout', label: 'Checkout', icon: ShoppingCart },
  { id: 'status', label: 'Status & links', icon: Globe },
]

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

function SectionHeader({ Icon, title }: { Icon: typeof Palette; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0 bg-gray-100 text-gray-700">
        <Icon size={16} strokeWidth={1.75} />
      </div>
      <h3 className="text-[15px] font-bold tracking-tight text-gray-900">{title}</h3>
    </div>
  )
}

type AdminCategory = {
  id: string
  name: string
  color?: string
  coverImage?: string
}

function StoreCategoryCoversEditor() {
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadingId, setUploadingId] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch('/api/categories', { headers: getStoreStudioHeaders() })
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []))
      .catch(() => setCategories([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  async function uploadCover(categoryId: string, file: File) {
    setUploadingId(categoryId)
    try {
      const fd = new FormData()
      fd.append('image', file)
      const headers = getStoreStudioHeaders()
      delete headers['Content-Type']
      const r = await fetch(`/api/categories/${categoryId}/cover`, {
        method: 'POST',
        headers,
        body: fd,
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Falha no upload')
      setCategories((prev) =>
        prev.map((c) =>
          c.id === categoryId ? { ...c, coverImage: d.coverImage || d.category?.coverImage || c.coverImage } : c,
        ),
      )
    } catch {
      /* silent — user can retry */
    } finally {
      setUploadingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-gray-500 py-4">
        <Loader2 size={14} className="animate-spin" />
        Carregando categorias…
      </div>
    )
  }

  if (categories.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-gray-50 px-4 py-5 text-center">
        <p className="text-[13px] font-medium text-gray-700">Nenhuma categoria cadastrada</p>
        <p className="text-[11px] text-gray-500 mt-1">
          Crie categorias em <strong>Produtos</strong> para ativar o carrossel na vitrine.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {categories.map((cat) => (
        <div
          key={cat.id}
          className="flex items-center gap-3 p-3 rounded-xl border border-border-light bg-gray-50/60"
        >
          <label className="relative shrink-0 cursor-pointer group">
            <span
              className={`block w-14 h-14 overflow-hidden border-2 border-white shadow-sm grid place-items-center bg-gray-100 ${
                cat.coverImage ? 'rounded-2xl' : 'rounded-full'
              }`}
              style={!cat.coverImage && cat.color ? { background: `${cat.color}18` } : undefined}
            >
              {uploadingId === cat.id ? (
                <Loader2 size={18} className="animate-spin text-gray-400" />
              ) : cat.coverImage ? (
                <img src={cat.coverImage} alt="" className="w-full h-full object-cover" />
              ) : (
                <ImageIcon size={18} className="text-gray-400" strokeWidth={1.5} />
              )}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) uploadCover(cat.id, file)
                e.target.value = ''
              }}
            />
          </label>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-gray-900 truncate">{cat.name}</p>
            <p className="text-[11px] text-gray-500">Clique na capa para enviar imagem</p>
          </div>
        </div>
      ))}
    </div>
  )
}

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

export function StoreStudioPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = (TABS.some((t) => t.id === searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'identity') as StoreStudioTab

  const studio = useStoreStudio()

  const setTab = (next: StoreStudioTab) => {
    setSearchParams(next === 'identity' ? {} : { tab: next }, { replace: true })
  }

  const waDigits = studio.whatsappPhone.replace(/\D/g, '')
  const waPreviewUrl = useMemo(() => {
    if (!waDigits) return null
    const msg = studio.whatsappMarketing.prefilled_message.trim()
    const base = `https://wa.me/${waDigits}`
    return msg ? `${base}?text=${encodeURIComponent(msg)}` : base
  }, [waDigits, studio.whatsappMarketing.prefilled_message])

  if (studio.loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="pb-10">
      <header className="flex items-start justify-between gap-3 flex-wrap mb-6">
        <div>
          <h2 className="text-[26px] font-bold tracking-tight text-gray-900">Loja</h2>
          <p className="text-[13px] text-gray-500 mt-0.5">
            Identidade, WhatsApp, checkout e vitrine do catálogo público
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {studio.slug && (
            <a
              href={`/catalogo/${studio.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl border border-border bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              <Globe size={15} strokeWidth={1.75} />
              Ver catálogo
              <ExternalLink size={12} strokeWidth={1.75} className="text-gray-400" />
            </a>
          )}
          <Button onClick={studio.save} loading={studio.saving}>
            {studio.saving ? 'Salvando' : 'Salvar alterações'}
          </Button>
        </div>
      </header>

      {(studio.error || studio.success) && (
        <div
          role="status"
          className={`mb-4 px-4 py-2.5 rounded-xl text-sm font-medium ${
            studio.error
              ? 'bg-red-50 text-red-700 border border-red-100'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
          }`}
        >
          {studio.error || studio.success}
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,38%)] lg:gap-6 lg:items-start">
        <div className="min-w-0 space-y-4">
          <nav className="settings-tabs" aria-label="Seções da loja">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`settings-tabs__item ${tab === t.id ? 'is-active' : ''}`}
              >
                {t.id === 'whatsapp' ? (
                  <span className="inline-flex items-center gap-1.5">
                    <WhatsAppIcon size={14} className="brand-icon--wa" />
                    {t.label}
                  </span>
                ) : (
                  t.label
                )}
              </button>
            ))}
          </nav>

          {tab === 'identity' && (
            <section className="bg-white border border-border-light rounded-2xl p-5 space-y-5">
              <SectionHeader Icon={Palette} title="Identidade visual" />

              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1.5 tracking-wide">
                  Logo da loja · 1:1, recomendado 500×500px
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-border bg-gray-50 flex items-center justify-center overflow-hidden shrink-0 relative group">
                    {studio.logoUrl ? (
                      <img src={studio.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                    ) : (
                      <Upload size={18} strokeWidth={1.5} className="text-gray-400" />
                    )}
                    <label className="absolute inset-0 cursor-pointer opacity-0 group-hover:opacity-100 bg-black/40 flex items-center justify-center transition-opacity rounded-2xl">
                      <Upload size={16} strokeWidth={1.75} className="text-white" />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const url = await studio.uploadFile(file)
                          if (url) studio.setLogoUrl(url)
                        }}
                      />
                    </label>
                  </div>
                  <div className="flex-1">
                    <Input
                      type="url"
                      value={studio.logoUrl}
                      onChange={(e) => studio.setLogoUrl(e.target.value)}
                      placeholder="URL ou clique no quadrado para upload"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Nome da loja"
                  value={studio.brandName}
                  onChange={(e) => studio.setBrandName(e.target.value)}
                  placeholder="Ex: Minha Loja"
                />
                <Input
                  label="Slogan / subtítulo"
                  value={studio.slogan}
                  onChange={(e) => studio.setSlogan(e.target.value)}
                  placeholder="Ex: Qualidade que você pode confiar"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1.5 tracking-wide">
                  Descrição / sobre nós
                </label>
                <textarea
                  value={studio.description}
                  onChange={(e) => studio.setDescription(e.target.value)}
                  rows={2}
                  placeholder="Conte um pouco sobre sua loja…"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {(['primary', 'secondary'] as const).map((kind) => {
                  const value = kind === 'primary' ? studio.primaryColor : studio.secondaryColor
                  const set = kind === 'primary' ? studio.setPrimaryColor : studio.setSecondaryColor
                  const label = kind === 'primary' ? 'Cor primária' : 'Cor secundária'
                  return (
                    <div key={kind}>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1.5 tracking-wide">
                        {label}
                      </label>
                      <div className="flex items-center gap-3 h-11 px-3 rounded-xl border border-border bg-white">
                        <input
                          type="color"
                          value={value}
                          onChange={(e) => set(e.target.value)}
                          aria-label={`Selecionar ${label.toLowerCase()}`}
                          className="w-7 h-7 rounded-lg cursor-pointer border-0 p-0 bg-transparent"
                        />
                        <span className="text-[13px] font-mono text-gray-700 tabular-nums">{value}</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1.5 tracking-wide">
                  Imagem de capa · 820×312px
                </label>
                <div
                  className="relative rounded-2xl overflow-hidden border-2 border-dashed border-border bg-gray-50 group"
                  style={{ aspectRatio: '820/312' }}
                >
                  {studio.coverImage ? (
                    <img src={studio.coverImage} alt="Capa" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                      <Upload size={24} strokeWidth={1.5} />
                      <p className="text-[11px] mt-1.5">820 × 312 px</p>
                    </div>
                  )}
                  <label className="absolute inset-0 cursor-pointer opacity-0 group-hover:opacity-100 bg-black/40 flex items-center justify-center transition-opacity">
                    <span className="bg-white/95 rounded-full px-3.5 py-1.5 text-[12px] font-medium text-gray-800">
                      Trocar imagem
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const url = await studio.uploadFile(file)
                        if (url) studio.setCoverImage(url)
                      }}
                    />
                  </label>
                </div>
                <Input
                  type="url"
                  value={studio.coverImage}
                  onChange={(e) => studio.setCoverImage(e.target.value)}
                  placeholder="Ou cole uma URL"
                  className="mt-2"
                />
              </div>

              <div className="border-t border-border-light pt-5 space-y-4">
                <SectionHeader Icon={Grid3x3} title="Carrossel de categorias" />
                <p className="text-[12px] text-gray-500 -mt-2">
                  Aparece na loja só quando há categorias cadastradas em Produtos. Defina a capa de cada uma abaixo.
                </p>

                <div className="rounded-xl border border-border-light divide-y divide-border-light">
                  <SettingRow
                    label="Exibir carrossel na vitrine"
                    sub="Substitui os chips de categoria no catálogo"
                  >
                    <Toggle
                      value={studio.storeDesign.categories_carousel.enabled}
                      onChange={(v) =>
                        studio.setStoreDesign({
                          ...studio.storeDesign,
                          categories_carousel: {
                            ...studio.storeDesign.categories_carousel,
                            enabled: v,
                          },
                        })
                      }
                    />
                  </SettingRow>
                  <SettingRow label="Formato das capas" sub="Redondo ou quadrado com cantos arredondados">
                    <div className="flex gap-2">
                      {(['rounded', 'round'] as const).map((shape) => (
                        <button
                          key={shape}
                          type="button"
                          onClick={() =>
                            studio.setStoreDesign({
                              ...studio.storeDesign,
                              categories_carousel: {
                                ...studio.storeDesign.categories_carousel,
                                shape,
                              },
                            })
                          }
                          className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition ${
                            studio.storeDesign.categories_carousel.shape === shape
                              ? 'bg-gray-900 text-white border-gray-900'
                              : 'bg-white text-gray-600 border-border hover:bg-gray-50'
                          }`}
                        >
                          {shape === 'round' ? 'Redondo' : 'Arredondado'}
                        </button>
                      ))}
                    </div>
                  </SettingRow>
                </div>

                <StoreCategoryCoversEditor />
              </div>
            </section>
          )}

          {tab === 'whatsapp' && (
            <section className="bg-white border border-border-light rounded-2xl p-5 space-y-4">
              <SectionHeader Icon={MessageCircle} title="Contato & WhatsApp" />

              <Input
                label="WhatsApp da loja (com DDD)"
                type="tel"
                inputMode="tel"
                value={studio.whatsappPhone}
                onChange={(e) => studio.setWhatsappPhone(e.target.value.replace(/\D/g, ''))}
                placeholder="11999999999"
                hint="Apenas números, com DDD. Usado no botão flutuante e no chip do catálogo."
              />

              {!waDigits && (
                <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  Informe o número para ativar os botões de WhatsApp na loja.
                </p>
              )}

              <div className="rounded-xl border border-border-light divide-y divide-border-light">
                <SettingRow
                  label="Ativar WhatsApp na loja"
                  sub="Controla chip no topo e botão flutuante"
                >
                  <Toggle
                    value={studio.whatsappMarketing.enabled}
                    onChange={(v) =>
                      studio.setWhatsappMarketing({ ...studio.whatsappMarketing, enabled: v })
                    }
                  />
                </SettingRow>
                <SettingRow label="Chip no topo do catálogo" sub="Exibido abaixo do nome da loja">
                  <Toggle
                    value={studio.whatsappMarketing.show_in_hero}
                    onChange={(v) =>
                      studio.setWhatsappMarketing({ ...studio.whatsappMarketing, show_in_hero: v })
                    }
                  />
                </SettingRow>
                <SettingRow label="Botão flutuante" sub="Fixo no canto da tela (recomendado no mobile)">
                  <Toggle
                    value={studio.whatsappMarketing.show_fab}
                    onChange={(v) =>
                      studio.setWhatsappMarketing({ ...studio.whatsappMarketing, show_fab: v })
                    }
                  />
                </SettingRow>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1.5">
                    Posição do botão flutuante
                  </label>
                  <select
                    value={studio.whatsappMarketing.fab_position}
                    onChange={(e) =>
                      studio.setWhatsappMarketing({
                        ...studio.whatsappMarketing,
                        fab_position: e.target.value as 'bottom-right' | 'bottom-left',
                      })
                    }
                    className="w-full h-11 px-3 rounded-xl border border-border bg-white text-sm"
                  >
                    <option value="bottom-right">Inferior direito</option>
                    <option value="bottom-left">Inferior esquerdo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1.5">
                    Exibir em
                  </label>
                  <select
                    value={studio.whatsappMarketing.show_on_pages}
                    onChange={(e) =>
                      studio.setWhatsappMarketing({
                        ...studio.whatsappMarketing,
                        show_on_pages: e.target.value as StorePageScope,
                      })
                    }
                    className="w-full h-11 px-3 rounded-xl border border-border bg-white text-sm"
                  >
                    <option value="all">Todas as páginas</option>
                    <option value="home_only">Só página inicial</option>
                    <option value="product_only">Só página de produto</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1.5">
                  Mensagem pré-preenchida
                </label>
                <textarea
                  value={studio.whatsappMarketing.prefilled_message}
                  onChange={(e) =>
                    studio.setWhatsappMarketing({
                      ...studio.whatsappMarketing,
                      prefilled_message: e.target.value,
                    })
                  }
                  rows={2}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm resize-none focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition"
                />
              </div>

              {waPreviewUrl && (
                <a
                  href={waPreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-[13px] font-medium text-emerald-700 hover:text-emerald-900"
                >
                  <WhatsAppIcon size={16} />
                  Testar link do WhatsApp
                  <ExternalLink size={12} />
                </a>
              )}
            </section>
          )}

          {tab === 'checkout' && (
            <section className="bg-white border border-border-light rounded-2xl p-5 space-y-4">
              <SectionHeader Icon={ShoppingCart} title="Checkout" />
              <div className="rounded-xl border border-border-light">
                <SettingRow label="Coletar e-mail do cliente" sub="Campo no formulário de pedido">
                  <Toggle value={studio.collectEmail} onChange={studio.setCollectEmail} />
                </SettingRow>
                <SettingRow label="Coletar endereço de entrega" sub="Campo de endereço no pedido">
                  <Toggle value={studio.collectAddress} onChange={studio.setCollectAddress} />
                </SettingRow>
              </div>
            </section>
          )}

          {tab === 'status' && (
            <div className="space-y-4">
              <section className="bg-white border border-border-light rounded-2xl p-5 space-y-4">
                <SectionHeader Icon={Globe} title="Status da loja" />
                <p className="text-[13px] text-gray-500 -mt-1">
                  Controla o badge Aberto/Fechado no catálogo.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(['aberto', 'fechado'] as const).map((s) => {
                    const isActive = studio.storeStatus === s
                    const isOpen = s === 'aberto'
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => studio.setStoreStatus(s)}
                        aria-pressed={isActive}
                        className={`flex items-center justify-center gap-2 h-12 rounded-xl text-[13px] font-medium transition active:scale-[0.98] ${
                          isActive
                            ? isOpen
                              ? 'bg-emerald-600 text-white'
                              : 'bg-red-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isActive ? 'bg-white' : isOpen ? 'bg-emerald-500' : 'bg-red-500'
                          }`}
                        />
                        {isOpen ? 'Aberto' : 'Fechado'}
                      </button>
                    )
                  })}
                </div>
              </section>

              <section className="bg-white border border-border-light rounded-2xl p-5 space-y-3">
                <SectionHeader Icon={Globe} title="Configurações relacionadas" />
                <p className="text-[12px] text-gray-500">
                  Frete, domínio, pagamentos e cupons continuam nas seções dedicadas.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { to: '/frete', icon: Truck, label: 'Frete & entrega' },
                    { to: '/dominio', icon: Globe, label: 'Domínio customizado' },
                    { to: '/pagamentos', icon: CreditCard, label: 'Pagamentos' },
                    { to: '/cupons', icon: Ticket, label: 'Cupons' },
                  ].map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className="flex items-center gap-2.5 h-11 px-3 rounded-xl border border-border bg-gray-50 text-[13px] font-medium text-gray-800 hover:bg-gray-100 transition"
                    >
                      <item.icon size={15} strokeWidth={1.75} className="text-gray-500 shrink-0" />
                      {item.label}
                    </Link>
                  ))}
                </div>
              </section>
            </div>
          )}

          <div className="flex justify-end pt-2 lg:hidden">
            <Button onClick={studio.save} loading={studio.saving} size="lg">
              {studio.saving ? 'Salvando' : 'Salvar alterações'}
            </Button>
          </div>
        </div>

        <aside className="hidden lg:block sticky top-4 mt-0">
          <StorePreviewPane slug={studio.slug} />
        </aside>
      </div>

      <div className="lg:hidden mt-6">
        <StorePreviewPane slug={studio.slug} />
      </div>
    </div>
  )
}