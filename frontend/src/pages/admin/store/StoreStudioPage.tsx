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
  Users,
  Sparkles,
  ChevronDown,
  Smartphone,
} from 'lucide-react'
import {
  DEFAULT_STORE_PWA_INSTALL,
  resolveStorePwaTitle,
} from '@/lib/store-pwa-install'
import { Button, Input } from '@/components/ui'
import { WhatsAppIcon } from '@/components/icons'
import { StorePreviewPane } from './StorePreviewPane'
import { useStoreStudio, getStoreStudioHeaders, type StoreStudioTab } from './useStoreStudio'
import type { StorePageScope } from '@/lib/store-marketing'
import { WhatsAppButtonStyleSection } from './WhatsAppButtonStyleSection'
import { StoreClientTypesSection } from './StoreClientTypesSection'
import { StoreConversionSection } from './StoreConversionSection'

const TABS: { id: StoreStudioTab; label: string; icon: typeof Palette }[] = [
  { id: 'identity', label: 'Identidade', icon: Palette },
  { id: 'whatsapp', label: 'Contato & WhatsApp', icon: MessageCircle },
  { id: 'conversion', label: 'Conversão', icon: Sparkles },
  { id: 'checkout', label: 'Checkout', icon: ShoppingCart },
  { id: 'clients', label: 'Tipos de cliente', icon: Users },
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
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {categories.map((cat) => (
        <div
          key={cat.id}
          className="flex items-center gap-3 p-3 rounded-xl border border-border-light bg-white hover:border-gray-300 transition"
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
            Identidade, WhatsApp, conversão, checkout e vitrine do catálogo
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
                {t.label}
              </button>
            ))}
          </nav>

          {tab === 'identity' && (
            <div className="space-y-4">
            <section className="bg-white border border-border-light rounded-2xl p-5 space-y-5">
              <div>
                <SectionHeader Icon={Palette} title="Marca e apresentação" />
                <p className="mt-2 text-[12px] text-gray-500">Defina como sua loja será reconhecida no catálogo e no compartilhamento.</p>
              </div>

              <div>
                <p className="mb-3 text-[11px] font-semibold text-gray-800">Informações da marca</p>
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
              </div>

              <div className="border-t border-border-light pt-5">
                <p className="text-[11px] font-semibold text-gray-800">Imagens da loja</p>
                <p className="mt-0.5 text-[10px] text-gray-500">Logo e capa ficam juntas porque formam a assinatura visual da vitrine.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-3">
                <label className="cursor-pointer rounded-2xl border border-border-light bg-gray-50 p-3 hover:border-gray-300 transition">
                  <span className="mb-2 block text-[10px] font-semibold text-gray-600">Logo · quadrada</span>
                  <span className="mx-auto flex aspect-square w-full max-w-[104px] items-center justify-center overflow-hidden rounded-2xl border border-dashed border-gray-300 bg-white">
                    {studio.logoUrl ? <img src={studio.logoUrl} alt="Logo" className="h-full w-full object-cover" /> : <Upload size={20} className="text-gray-400" />}
                  </span>
                  <span className="mt-2 block text-center text-[10px] font-semibold text-gray-700">{studio.logoUrl ? 'Trocar logo' : 'Enviar logo'}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const url = await studio.uploadFile(file)
                    if (url) studio.setLogoUrl(url)
                    e.target.value = ''
                  }} />
                </label>

                <label className="cursor-pointer rounded-2xl border border-border-light bg-gray-50 p-3 hover:border-gray-300 transition">
                  <span className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-gray-600">Capa da vitrine</span>
                    <span className="text-[9px] text-gray-400">820 × 312 px</span>
                  </span>
                  <span className="flex w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-gray-300 bg-white" style={{ aspectRatio: '820/312' }}>
                    {studio.coverImage ? <img src={studio.coverImage} alt="Capa" className="h-full w-full object-cover" /> : <Upload size={22} className="text-gray-400" />}
                  </span>
                  <span className="mt-2 block text-center text-[10px] font-semibold text-gray-700">{studio.coverImage ? 'Trocar capa' : 'Enviar capa'}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const url = await studio.uploadFile(file)
                    if (url) studio.setCoverImage(url)
                    e.target.value = ''
                  }} />
                </label>
              </div>

              {/* Preview do link do catálogo — afiliado → cliente (≠ programa de afiliados) */}
              <div className="border-t border-border-light pt-5 space-y-3">
                <div>
                  <p className="text-[11px] font-semibold text-gray-800">Compartilhamento do catálogo</p>
                  <p className="mt-0.5 text-[10px] text-gray-500 leading-relaxed">
                    Título, descrição e imagem que o WhatsApp mostra quando o <strong>afiliado compartilha o catálogo</strong> com o cliente.
                    Não confundir com a capa do <em>programa de afiliados</em> (que atrai novos parceiros).
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_200px] gap-3">
                  <div className="space-y-3">
                    <Input
                      label="Título do preview"
                      value={studio.catalogShareTitle}
                      onChange={(e) => studio.setCatalogShareTitle(e.target.value)}
                      placeholder={`Ex: Catálogo ${studio.brandName || 'da loja'}`}
                    />
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1.5 tracking-wide">
                        Descrição do preview
                      </label>
                      <textarea
                        value={studio.catalogShareDescription}
                        onChange={(e) => studio.setCatalogShareDescription(e.target.value)}
                        rows={2}
                        maxLength={160}
                        placeholder="Ex: Alho fresco e temperos com entrega. Use o cupom do afiliado no checkout."
                        className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition"
                      />
                      <p className="mt-1 text-[10px] text-gray-400">{studio.catalogShareDescription.length}/160</p>
                    </div>
                  </div>
                  <label className="cursor-pointer rounded-2xl border border-border-light bg-gray-50 p-3 hover:border-gray-300 transition self-start">
                    <span className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-gray-600">Imagem do link</span>
                      <span className="text-[9px] text-gray-400">1200×630</span>
                    </span>
                    <span
                      className="flex w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-gray-300 bg-white"
                      style={{ aspectRatio: '1.91/1' }}
                    >
                      {studio.catalogShareImage
                        ? <img src={studio.catalogShareImage} alt="Preview catálogo" className="h-full w-full object-cover" />
                        : <ImageIcon size={22} className="text-gray-400" />}
                    </span>
                    <span className="mt-2 block text-center text-[10px] font-semibold text-gray-700">
                      {studio.catalogShareImage ? 'Trocar imagem' : 'Enviar imagem'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const url = await studio.uploadFile(file)
                        if (url) studio.setCatalogShareImage(url)
                        e.target.value = ''
                      }}
                    />
                    {studio.catalogShareImage && (
                      <button
                        type="button"
                        className="mt-1.5 w-full text-center text-[10px] font-semibold text-red-500"
                        onClick={(e) => {
                          e.preventDefault()
                          studio.setCatalogShareImage('')
                        }}
                      >
                        Remover
                      </button>
                    )}
                  </label>
                </div>
              </div>

              {/* Card instalar app (PWA) — whitelabel da marca */}
              <div className="border-t border-border-light pt-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Smartphone size={14} className="text-gray-600" strokeWidth={1.75} />
                      <p className="text-[11px] font-semibold text-gray-800">App na tela inicial</p>
                    </div>
                    <p className="mt-0.5 text-[10px] text-gray-500 leading-relaxed">
                      Card que convida o cliente a instalar o catálogo no celular.
                      Em domínio próprio (whitelabel) usa <strong>sempre a identidade da sua marca</strong> — nunca o visual LeadCapture.
                    </p>
                  </div>
                  <Toggle
                    value={studio.pwaInstall.enabled}
                    onChange={(v) => studio.setPwaInstall({ ...studio.pwaInstall, enabled: v })}
                  />
                </div>

                {studio.pwaInstall.enabled && (
                  <div className="space-y-3 rounded-2xl border border-border-light bg-gray-50/80 p-3.5">
                    <Input
                      label="Título do card"
                      value={studio.pwaInstall.title}
                      onChange={(e) => studio.setPwaInstall({ ...studio.pwaInstall, title: e.target.value })}
                      placeholder={`Instalar ${studio.brandName || 'sua loja'}`}
                    />
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1.5 tracking-wide">
                        Texto de apoio
                      </label>
                      <textarea
                        value={studio.pwaInstall.subtitle}
                        onChange={(e) => studio.setPwaInstall({ ...studio.pwaInstall, subtitle: e.target.value })}
                        rows={2}
                        maxLength={180}
                        placeholder={DEFAULT_STORE_PWA_INSTALL.subtitle}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {([
                        ['benefit_1', 'Benefício 1'],
                        ['benefit_2', 'Benefício 2'],
                        ['benefit_3', 'Benefício 3'],
                        ['benefit_4', 'Benefício 4'],
                      ] as const).map(([key, label]) => (
                        <Input
                          key={key}
                          label={label}
                          value={studio.pwaInstall[key]}
                          onChange={(e) =>
                            studio.setPwaInstall({ ...studio.pwaInstall, [key]: e.target.value })
                          }
                          placeholder={DEFAULT_STORE_PWA_INSTALL[key]}
                        />
                      ))}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input
                        label="Botão principal"
                        value={studio.pwaInstall.cta_label}
                        onChange={(e) =>
                          studio.setPwaInstall({ ...studio.pwaInstall, cta_label: e.target.value })
                        }
                        placeholder={DEFAULT_STORE_PWA_INSTALL.cta_label}
                      />
                      <Input
                        label="Botão recusar"
                        value={studio.pwaInstall.dismiss_label}
                        onChange={(e) =>
                          studio.setPwaInstall({ ...studio.pwaInstall, dismiss_label: e.target.value })
                        }
                        placeholder={DEFAULT_STORE_PWA_INSTALL.dismiss_label}
                      />
                    </div>

                    {/* Mini preview do card com cores da marca */}
                    <div className="pt-1">
                      <p className="mb-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                        Preview no celular
                      </p>
                      <div className="max-w-[280px] rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
                        <div
                          className="h-1 w-full"
                          style={{
                            background: `linear-gradient(90deg, ${studio.primaryColor}, ${studio.secondaryColor})`,
                          }}
                        />
                        <div className="p-4 text-center">
                          {studio.logoUrl ? (
                            <img
                              src={studio.logoUrl}
                              alt=""
                              className="mx-auto mb-2 h-12 w-12 rounded-xl object-cover"
                            />
                          ) : (
                            <div
                              className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl text-sm font-bold text-white"
                              style={{ background: studio.primaryColor }}
                            >
                              {(studio.brandName || 'L').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <p className="text-[13px] font-semibold text-gray-900">
                            {resolveStorePwaTitle(studio.pwaInstall, studio.brandName || 'Loja')}
                          </p>
                          <p className="mt-1 text-[11px] text-gray-500 leading-snug">
                            {studio.pwaInstall.subtitle || DEFAULT_STORE_PWA_INSTALL.subtitle}
                          </p>
                          <div
                            className="mt-3 rounded-xl py-2 text-[12px] font-semibold text-white"
                            style={{ background: studio.primaryColor }}
                          >
                            {studio.pwaInstall.cta_label || DEFAULT_STORE_PWA_INSTALL.cta_label}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-border-light pt-5">
                <p className="mb-3 text-[11px] font-semibold text-gray-800">Paleta da marca</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(['primary', 'secondary'] as const).map((kind) => {
                    const value = kind === 'primary' ? studio.primaryColor : studio.secondaryColor
                    const set = kind === 'primary' ? studio.setPrimaryColor : studio.setSecondaryColor
                    const label = kind === 'primary' ? 'Cor primária' : 'Cor secundária'
                    return (
                      <label key={kind} className="rounded-xl border border-border bg-white p-3">
                        <span className="mb-2 block text-[10px] font-semibold text-gray-600">{label}</span>
                        <span className="flex items-center gap-3">
                          <input type="color" value={value} onChange={(e) => set(e.target.value)} aria-label={`Selecionar ${label.toLowerCase()}`} className="w-8 h-8 rounded-lg cursor-pointer border-0 p-0 bg-transparent" />
                          <span className="text-[12px] font-mono text-gray-700 tabular-nums">{value}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>

            </section>

              <section className="bg-white border border-border-light rounded-2xl p-5 space-y-4">
                <div>
                  <SectionHeader Icon={Grid3x3} title="Categorias da vitrine" />
                  <p className="text-[12px] text-gray-500 mt-2">
                  Aparece na loja só quando há categorias cadastradas em Produtos. Defina a capa de cada uma abaixo.
                  </p>
                </div>

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
              </section>
            </div>
          )}

          {tab === 'whatsapp' && (
            <div className="space-y-4">
              <section className="bg-white border border-border-light rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#25D366]/10"><WhatsAppIcon size={19} className="brand-icon--wa" /></span>
                    <div><h3 className="text-[15px] font-bold text-gray-900">WhatsApp da loja</h3><p className="text-[11px] text-gray-500">Canal de contato exibido no catálogo</p></div>
                  </div>
                  <Toggle
                    value={studio.whatsappMarketing.enabled}
                    onChange={(v) =>
                      studio.setWhatsappMarketing({
                        ...studio.whatsappMarketing,
                        enabled: v,
                        // Ao ativar, garante FAB; nunca chip no card da capa
                        show_fab: v ? true : studio.whatsappMarketing.show_fab,
                        show_in_hero: false,
                      })
                    }
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2 sm:items-end">
                  <Input label="Número com DDD" type="tel" inputMode="tel" value={studio.whatsappPhone} onChange={(e) => studio.setWhatsappPhone(e.target.value.replace(/\D/g, ''))} placeholder="11999999999" hint="Somente números, incluindo o DDD." />
                  {waPreviewUrl && <a href={waPreviewUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-3 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"><ExternalLink size={13} /> Testar contato</a>}
                </div>
                {!waDigits && <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">Informe o número para ativar o contato na loja.</p>}
              </section>

              {studio.whatsappMarketing.enabled && <>
              <section className="bg-white border border-border-light rounded-2xl p-4 sm:p-5 space-y-4">
                <div><h3 className="text-[14px] font-bold text-gray-900">Comportamento do botão</h3><p className="mt-0.5 text-[11px] text-gray-500">Defina onde e como o atalho aparecerá.</p></div>
                <SettingRow label="Exibir botão flutuante" sub="Fixo acima da navegação inferior da loja">
                  <Toggle value={studio.whatsappMarketing.show_fab} onChange={(v) => studio.setWhatsappMarketing({ ...studio.whatsappMarketing, show_fab: v, show_in_hero: false })} />
                </SettingRow>
                {studio.whatsappMarketing.show_fab && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-[11px] font-semibold text-gray-600">Posição
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
                  </label>
                  <label className="text-[11px] font-semibold text-gray-600">Páginas
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
                  </label>
                </div>}
              </section>

              <section className="bg-white border border-border-light rounded-2xl p-4 sm:p-5">
                <label className="block text-[12px] font-semibold text-gray-800 mb-1.5">Mensagem inicial</label>
                <p className="mb-2 text-[10px] text-gray-500">Texto que será preenchido ao abrir a conversa.</p>
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
              </section>

              <details className="group rounded-2xl border border-border-light bg-white overflow-hidden">
                <summary className="min-h-14 cursor-pointer list-none px-4 sm:px-5 flex items-center justify-between gap-3">
                  <span><strong className="block text-[13px] text-gray-900">Aparência do botão</strong><span className="block text-[10px] text-gray-500">Formato, tamanho, cor e efeitos</span></span>
                  <ChevronDown size={16} className="text-gray-400 transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-border-light p-3 sm:p-4"><WhatsAppButtonStyleSection
                design={studio.whatsappMarketing.button}
                onChange={(button) =>
                  studio.setWhatsappMarketing({ ...studio.whatsappMarketing, button })
                }
                brandPrimary={studio.primaryColor}
                phoneDigits={waDigits}
                prefilledMessage={studio.whatsappMarketing.prefilled_message}
                fabPosition={studio.whatsappMarketing.fab_position}
                /></div>
              </details>

              <p className="px-1 text-[10px] leading-relaxed text-gray-500">Em links de afiliados, o contato é direcionado automaticamente para a sessão disponível. No acesso direto, utiliza o número configurado acima.</p>
              </>}
            </div>
          )}

          {tab === 'conversion' && (
            <StoreConversionSection
              conversion={studio.conversion}
              announcement={studio.announcementBar}
              onConversionChange={studio.setConversion}
              onAnnouncementChange={studio.setAnnouncementBar}
            />
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

          {tab === 'clients' && (
            <StoreClientTypesSection onToast={(msg, type) => studio.flash(msg, type === 'err' ? 'err' : 'ok')} />
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
