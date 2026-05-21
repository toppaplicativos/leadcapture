import { useEffect, useState } from 'react'
import {
  Loader2, Upload, Palette, ShoppingCart, Globe, ExternalLink,
} from 'lucide-react'
import { Button, Input } from '@/components/ui'

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('lead-system-token')
  if (token) h['Authorization'] = `Bearer ${token}`
  const bid = localStorage.getItem('lead-system:active-brand-id')
  if (bid) h['x-brand-id'] = bid
  return h
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

function SectionHeader({ Icon, title, color }: { Icon: typeof Palette; title: string; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${color}`}>
        <Icon size={16} strokeWidth={1.75} />
      </div>
      <h3 className="text-[15px] font-bold tracking-tight text-gray-900">{title}</h3>
    </div>
  )
}

export function DesignPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [storeId, setStoreId] = useState('')
  const [brandId, setBrandId] = useState('')
  const [slug, setSlug] = useState('')
  const [currentBrand, setCurrentBrand] = useState<Record<string, any>>({})

  // Brand identity
  const [brandName, setBrandName] = useState('')
  const [slogan, setSlogan] = useState('')
  const [description, setDescription] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#111827')
  const [secondaryColor, setSecondaryColor] = useState('#3b82f6')
  const [coverImage, setCoverImage] = useState('')
  const [whatsappPhone, setWhatsappPhone] = useState('')

  // Checkout
  const [collectEmail, setCollectEmail] = useState(true)
  const [collectAddress, setCollectAddress] = useState(true)

  // Status
  const [storeStatus, setStoreStatus] = useState<'aberto' | 'fechado'>('aberto')

  function flash(msg: string, type: 'ok' | 'err' = 'ok') {
    if (type === 'err') {
      setError(msg)
      setSuccess('')
    } else {
      setSuccess(msg)
      setError('')
    }
    setTimeout(() => { setError(''); setSuccess('') }, 3500)
  }

  useEffect(() => {
    setLoading(true)
    const headers = getHeaders()
    fetch('/api/storefront/stores', { headers })
      .then(r => r.json())
      .then(async d => {
        const stores = d.stores || []
        if (!stores.length) { setLoading(false); return }
        const store = stores[0]
        setStoreId(store.id)
        setSlug(store.slug || '')

        const r2 = await fetch(`/api/storefront/stores/${store.id}`, { headers })
        const d2 = await r2.json()
        const s = d2.store || {}
        const brand = s.brand || {}
        const settings = s.settings || {}
        const checkout = settings.checkout || {}

        setCurrentBrand(brand)
        setBrandId(brand.id || store.brand_id || '')
        setBrandName(brand.name || s.name || '')
        setSlogan(brand.slogan || '')
        setDescription(brand.description || '')
        setLogoUrl(brand.logo_url || s.theme?.logo_url || '')
        setPrimaryColor(brand.primary_color || s.theme?.primary_color || '#111827')
        setSecondaryColor(brand.secondary_color || s.theme?.secondary_color || '#3b82f6')
        setCoverImage(brand.cover_image || s.theme?.cover_image || '')
        setWhatsappPhone(String(brand.whatsapp_phone || '').replace(/\D/g, ''))
        setCollectEmail(checkout.collect_email !== false)
        setCollectAddress(checkout.collect_address !== false)
        setStoreStatus(brand.status === 'fechado' ? 'fechado' : 'aberto')
        setLoading(false)
      })
      .catch(err => {
        flash(err.message || 'Erro ao carregar configurações', 'err')
        setLoading(false)
      })
  }, [])

  async function uploadFile(file: File): Promise<string | null> {
    const fd = new FormData()
    fd.append('file', file)
    const headers: Record<string, string> = {}
    const token = localStorage.getItem('lead-system-token')
    if (token) headers['Authorization'] = `Bearer ${token}`
    try {
      const r = await fetch('/api/media/upload', { method: 'POST', headers, body: fd })
      const d = await r.json()
      return d.file?.url || null
    } catch {
      return null
    }
  }

  async function handleSave() {
    if (!storeId) return
    setSaving(true)
    try {
      const headers = getHeaders()
      if (brandId) {
        const br = await fetch(`/api/brands/${brandId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            name: brandName,
            slogan,
            logo_url: logoUrl,
            cover_image: coverImage,
            primary_color: primaryColor,
            secondary_color: secondaryColor,
            whatsapp_phone: whatsappPhone.replace(/\D/g, ''),
          }),
        })
        if (!br.ok) {
          const e = await br.json()
          throw new Error(e.error || 'Erro ao salvar marca')
        }
      }

      const sr = await fetch(`/api/storefront/stores/${storeId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          brand: {
            ...currentBrand,
            name: brandName,
            slogan,
            description,
            logo_url: logoUrl,
            primary_color: primaryColor,
            secondary_color: secondaryColor,
            cover_image: coverImage,
            status: storeStatus,
          },
          settings: {
            checkout: {
              collect_email: collectEmail,
              collect_address: collectAddress,
            },
          },
        }),
      })
      if (!sr.ok) {
        const e = await sr.json()
        throw new Error(e.error || 'Erro ao salvar loja')
      }
      flash('Configurações salvas. O catálogo foi atualizado.')
    } catch (e: any) {
      flash(e.message || 'Erro ao salvar', 'err')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[26px] font-bold tracking-tight text-gray-900">Design do catálogo</h2>
          <p className="text-[13px] text-gray-500 mt-0.5">Identidade, checkout e status do catálogo público</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {slug && (
            <a
              href={`/catalogo/${slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl border border-border bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              <Globe size={15} strokeWidth={1.75} />
              Visualizar catálogo
              <ExternalLink size={12} strokeWidth={1.75} className="text-gray-400" />
            </a>
          )}
          <Button onClick={handleSave} loading={saving}>
            {saving ? 'Salvando' : 'Salvar alterações'}
          </Button>
        </div>
      </header>

      {/* Toast inline */}
      {(error || success) && (
        <div
          role="status"
          className={`px-4 py-2.5 rounded-xl text-sm font-medium ${
            error ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
          }`}
        >
          {error || success}
        </div>
      )}

      {/* ── 1. Identidade visual ── */}
      <section className="bg-white border border-border-light rounded-2xl p-5 space-y-5">
        <SectionHeader Icon={Palette} title="Identidade visual" color="bg-gray-100 text-gray-700" />

        {/* Logo */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-600 mb-1.5 tracking-wide">
            Logo da loja · 1:1, recomendado 500×500px
          </label>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-border bg-gray-50 flex items-center justify-center overflow-hidden shrink-0 relative group">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="w-full h-full object-cover"
                  onError={e => {
                    ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                  }}
                />
              ) : (
                <Upload size={18} strokeWidth={1.5} className="text-gray-400" />
              )}
              <label className="absolute inset-0 cursor-pointer opacity-0 group-hover:opacity-100 bg-black/40 flex items-center justify-center transition-opacity rounded-2xl">
                <Upload size={16} strokeWidth={1.75} className="text-white" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const url = await uploadFile(file)
                    if (url) setLogoUrl(url)
                  }}
                />
              </label>
            </div>
            <div className="flex-1">
              <Input
                type="url"
                value={logoUrl}
                onChange={e => setLogoUrl(e.target.value)}
                placeholder="URL ou clique no quadrado para upload"
                hint="Formato quadrado 1:1. Clique no ícone para fazer upload."
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Nome da loja"
            type="text"
            value={brandName}
            onChange={e => setBrandName(e.target.value)}
            placeholder="Ex: Minha Loja"
          />
          <Input
            label="Slogan / subtítulo"
            type="text"
            value={slogan}
            onChange={e => setSlogan(e.target.value)}
            placeholder="Ex: Qualidade que você pode confiar"
          />
        </div>

        <Input
          label="WhatsApp da loja (com DDD)"
          type="tel"
          inputMode="tel"
          value={whatsappPhone}
          onChange={e => setWhatsappPhone(e.target.value.replace(/\D/g, ''))}
          placeholder="11999999999"
          hint="Usado para abrir conversa quando um produto tem CTA 'Conversar no WhatsApp'. Apenas números, com DDD."
        />

        <div>
          <label className="block text-[11px] font-semibold text-gray-600 mb-1.5 tracking-wide">
            Descrição / sobre nós
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="Conte um pouco sobre sua loja…"
            className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition"
          />
        </div>

        {/* Colors */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1.5 tracking-wide">
              Cor primária
            </label>
            <div className="flex items-center gap-3 h-11 px-3 rounded-xl border border-border bg-white">
              <input
                type="color"
                value={primaryColor}
                onChange={e => setPrimaryColor(e.target.value)}
                aria-label="Selecionar cor primária"
                className="w-7 h-7 rounded-lg cursor-pointer border-0 p-0 bg-transparent"
              />
              <span className="text-[13px] font-mono text-gray-700 tabular-nums">{primaryColor}</span>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1.5 tracking-wide">
              Cor secundária
            </label>
            <div className="flex items-center gap-3 h-11 px-3 rounded-xl border border-border bg-white">
              <input
                type="color"
                value={secondaryColor}
                onChange={e => setSecondaryColor(e.target.value)}
                aria-label="Selecionar cor secundária"
                className="w-7 h-7 rounded-lg cursor-pointer border-0 p-0 bg-transparent"
              />
              <span className="text-[13px] font-mono text-gray-700 tabular-nums">{secondaryColor}</span>
            </div>
          </div>
        </div>

        {/* Cover image */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-600 mb-1.5 tracking-wide">
            Imagem de capa · 820×312px (proporção Facebook)
          </label>
          <div
            className="relative rounded-2xl overflow-hidden border-2 border-dashed border-border bg-gray-50 group"
            style={{ aspectRatio: '820/312' }}
          >
            {coverImage ? (
              <img
                src={coverImage}
                alt="Capa"
                className="w-full h-full object-cover"
                onError={e => {
                  ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                }}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                <Upload size={24} strokeWidth={1.5} />
                <p className="text-[11px] mt-1.5 tabular-nums">820 × 312 px</p>
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
                onChange={async e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const url = await uploadFile(file)
                  if (url) setCoverImage(url)
                }}
              />
            </label>
          </div>
          <Input
            type="url"
            value={coverImage}
            onChange={e => setCoverImage(e.target.value)}
            placeholder="Ou cole uma URL diretamente"
            className="mt-2"
          />
        </div>
      </section>

      {/* ── 2. Checkout ── */}
      <section className="bg-white border border-border-light rounded-2xl p-5 space-y-4">
        <SectionHeader Icon={ShoppingCart} title="Checkout" color="bg-gray-100 text-gray-700" />
        <div className="space-y-1">
          {[
            {
              label: 'Coletar e-mail do cliente',
              sub: 'Campo de e-mail no formulário de pedido',
              value: collectEmail,
              onChange: setCollectEmail,
            },
            {
              label: 'Coletar endereço de entrega',
              sub: 'Campo de endereço no formulário de pedido',
              value: collectAddress,
              onChange: setCollectAddress,
            },
          ].map(({ label, sub, value, onChange }) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 py-3 border-b border-border-light last:border-0"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-gray-900">{label}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>
              </div>
              <Toggle value={value} onChange={onChange} />
            </div>
          ))}
        </div>
      </section>

      {/* ── 3. Status da loja ── */}
      <section className="bg-white border border-border-light rounded-2xl p-5 space-y-4">
        <SectionHeader Icon={Globe} title="Status da loja" color="bg-gray-100 text-gray-700" />
        <p className="text-[13px] text-gray-500 -mt-1">
          Controla o badge "Aberto/Fechado" exibido no catálogo.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(['aberto', 'fechado'] as const).map(s => {
            const isActive = storeStatus === s
            const isOpen = s === 'aberto'
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStoreStatus(s)}
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
                    isActive
                      ? 'bg-white'
                      : isOpen
                        ? 'bg-emerald-500'
                        : 'bg-red-500'
                  }`}
                />
                {isOpen ? 'Aberto' : 'Fechado'}
              </button>
            )
          })}
        </div>
      </section>

      {/* Bottom save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} loading={saving} size="lg">
          {saving ? 'Salvando' : 'Salvar alterações'}
        </Button>
      </div>
    </div>
  )
}
