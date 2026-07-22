/**
 * Frete & Entrega — configurador operacional + simulador CEP real.
 * Product register (Impeccable): primitives Button / Input / Select / Textarea / Card.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Boxes, Clock, Laptop, MapPin, MessageSquare, Phone, Plus, Store, Trash2, Truck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getHeaders } from '@/lib/admin/helpers'
import { Skeleton } from '@/components/admin/primitives'
import { FreightSimulator } from '@/components/freight/FreightSimulator'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Card, CardBody, CardHeader, CardTitle, CardSubtitle } from '@/components/ui/Card'
import { cn } from '@/lib/cn'

type FreightTier = {
  id: string
  label: string
  mode: 'fixed' | 'per_km' | 'km_range'
  from_km: number
  to_km: number | null
  fixed_fee?: number | null
  base_fee?: number | null
  price_per_km?: number | null
  eta_minutes?: number | null
}

type Origin = {
  cep: string
  address: string
  city: string
  state: string
}

const DEFAULT_TIERS: FreightTier[] = [
  { id: 'short', label: 'Curta distância', mode: 'fixed', from_km: 0, to_km: 5, fixed_fee: 12, eta_minutes: 60 },
  { id: 'medium', label: 'Média distância', mode: 'per_km', from_km: 5, to_km: 15, base_fee: 10, price_per_km: 2.5, eta_minutes: 120 },
  { id: 'long', label: 'Longa distância', mode: 'per_km', from_km: 15, to_km: 40, base_fee: 15, price_per_km: 3.2, eta_minutes: 180 },
]

function newTier(): FreightTier {
  return {
    id: `tier_${Date.now().toString(36)}`,
    label: 'Nova faixa',
    mode: 'fixed',
    from_km: 0,
    to_km: 10,
    fixed_fee: 15,
    eta_minutes: 90,
  }
}

export function FreteView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const navigate = useNavigate()
  const [storeId, setStoreId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [shippingMode, setShippingMode] = useState('delivery')
  const [fee, setFee] = useState('')
  const [radius, setRadius] = useState('40')
  const [freeAbove, setFreeAbove] = useState('')
  const [eta, setEta] = useState('120')
  const [deliveryText, setDeliveryText] = useState('')
  const [freteTexto, setFreteTexto] = useState('')
  const [expeditionPhone, setExpeditionPhone] = useState('')
  const [cepProvider, setCepProvider] = useState<'auto' | 'brasilapi' | 'viacep'>('auto')
  const [origin, setOrigin] = useState<Origin>({ cep: '', address: '', city: '', state: '' })
  const [tiers, setTiers] = useState<FreightTier[]>(DEFAULT_TIERS)

  useEffect(() => {
    setLoading(true)
    fetch('/api/storefront/stores', { headers: getHeaders() })
      .then((r) => r.json())
      .then(async (d) => {
        const stores = d.stores || []
        if (!stores.length) {
          setLoading(false)
          return
        }
        setStoreId(stores[0].id)
        const r2 = await fetch(`/api/storefront/stores/${stores[0].id}`, { headers: getHeaders() })
        const d2 = await r2.json()
        const lg = d2.store?.settings?.logistics || {}
        setFee(lg.delivery_fee != null ? String(lg.delivery_fee) : '')
        setRadius(lg.delivery_radius_km != null ? String(lg.delivery_radius_km) : '40')
        setFreeAbove(lg.free_shipping_above != null ? String(lg.free_shipping_above) : '')
        setEta(lg.default_eta_minutes != null ? String(lg.default_eta_minutes) : '120')
        setDeliveryText(lg.delivery_time_text || '')
        setFreteTexto(lg.frete_texto || '')
        setExpeditionPhone(lg.expedition_phone || '')
        setShippingMode(lg.shipping_mode || 'delivery')
        setCepProvider(lg.cep_provider === 'brasilapi' || lg.cep_provider === 'viacep' ? lg.cep_provider : 'auto')
        const o = lg.origin || {}
        setOrigin({
          cep: o.cep ? String(o.cep).replace(/\D/g, '') : '',
          address: o.address || '',
          city: o.city || '',
          state: o.state || '',
        })
        if (Array.isArray(lg.tiers) && lg.tiers.length) {
          setTiers(
            lg.tiers.map((t: any, i: number) => ({
              id: String(t.id || `tier_${i}`),
              label: String(t.label || `Faixa ${i + 1}`),
              mode: t.mode === 'per_km' ? 'per_km' : 'fixed',
              from_km: Number(t.from_km) || 0,
              to_km: t.to_km == null || t.to_km === '' ? null : Number(t.to_km),
              fixed_fee: t.fixed_fee != null ? Number(t.fixed_fee) : null,
              base_fee: t.base_fee != null ? Number(t.base_fee) : null,
              price_per_km: t.price_per_km != null ? Number(t.price_per_km) : null,
              eta_minutes: t.eta_minutes != null ? Number(t.eta_minutes) : null,
            })),
          )
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function save() {
    if (!storeId) return
    setSaving(true)
    try {
      const normalizedTiers = tiers.map((t) => ({
        ...t,
        from_km: Number(t.from_km) || 0,
        to_km: t.to_km == null || t.to_km === ('' as any) || Number.isNaN(Number(t.to_km))
          ? null
          : Number(t.to_km),
        fixed_fee: t.fixed_fee != null && t.fixed_fee !== ('' as any) ? Number(t.fixed_fee) : null,
        base_fee: t.base_fee != null && t.base_fee !== ('' as any) ? Number(t.base_fee) : null,
        price_per_km: t.price_per_km != null && t.price_per_km !== ('' as any) ? Number(t.price_per_km) : null,
        eta_minutes: t.eta_minutes != null && t.eta_minutes !== ('' as any) ? Number(t.eta_minutes) : null,
      }))
      // Raio nunca menor que o teto das faixas (evita "máx. 30" com faixa até 40+)
      const tierCeilings = normalizedTiers
        .map((t) => t.to_km)
        .filter((n): n is number => n != null && Number.isFinite(n))
      const maxTierKm = tierCeilings.length ? Math.max(...tierCeilings) : null
      const hasOpenTier = normalizedTiers.some((t) => t.to_km == null)
      let radiusNum = radius ? parseFloat(radius) : null
      if (radiusNum != null && Number.isNaN(radiusNum)) radiusNum = null
      if (!hasOpenTier && maxTierKm != null) {
        radiusNum = radiusNum == null ? maxTierKm : Math.max(radiusNum, maxTierKm)
      }
      if (radiusNum != null) setRadius(String(radiusNum))

      const res = await fetch(`/api/storefront/stores/${storeId}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({
          settings: {
            logistics: {
              delivery_fee: fee ? parseFloat(fee) : null,
              delivery_radius_km: radiusNum,
              free_shipping_above: freeAbove ? parseFloat(freeAbove) : null,
              default_eta_minutes: eta ? parseInt(eta, 10) : null,
              delivery_time_text: deliveryText || null,
              frete_texto: freteTexto || null,
              expedition_phone: expeditionPhone ? expeditionPhone.replace(/\D/g, '') : null,
              shipping_mode: shippingMode,
              cep_provider: cepProvider,
              origin: {
                cep: origin.cep.replace(/\D/g, '') || null,
                address: origin.address || null,
                city: origin.city || null,
                state: origin.state || null,
                lat: null,
                lng: null,
              },
              tiers: normalizedTiers,
            },
          },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar')
      // Confirma o que o backend devolveu (evita UI “salva” com valor antigo)
      const savedLg = data?.store?.settings?.logistics
      if (savedLg) {
        if (savedLg.delivery_radius_km != null) setRadius(String(savedLg.delivery_radius_km))
        if (Array.isArray(savedLg.tiers) && savedLg.tiers.length) {
          setTiers(
            savedLg.tiers.map((t: any, i: number) => ({
              id: String(t.id || `tier_${i}`),
              label: String(t.label || `Faixa ${i + 1}`),
              mode: t.mode === 'per_km' ? 'per_km' : 'fixed',
              from_km: Number(t.from_km) || 0,
              to_km: t.to_km == null || t.to_km === '' ? null : Number(t.to_km),
              fixed_fee: t.fixed_fee != null ? Number(t.fixed_fee) : null,
              base_fee: t.base_fee != null ? Number(t.base_fee) : null,
              price_per_km: t.price_per_km != null ? Number(t.price_per_km) : null,
              eta_minutes: t.eta_minutes != null ? Number(t.eta_minutes) : null,
            })),
          )
        }
      }
      showToast(
        radiusNum != null
          ? `Frete salvo · raio efetivo até ${radiusNum} km`
          : 'Configurações de frete salvas',
      )
    } catch (e: any) {
      showToast(e.message || 'Erro ao salvar', 'err')
    }
    setSaving(false)
  }

  function updateTier(id: string, patch: Partial<FreightTier>) {
    setTiers((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  if (loading) return <Skeleton rows={8} />

  const hasFreeShipping = freeAbove && Number(freeAbove) > 0

  const modes = [
    { key: 'delivery', label: 'Entrega', desc: 'Leva ao endereço', Icon: Truck },
    { key: 'pickup', label: 'Retirada', desc: 'Cliente retira', Icon: Store },
    { key: 'both', label: 'Ambos', desc: 'Entrega + retirada', Icon: Boxes },
    { key: 'none', label: 'Sem frete', desc: 'Só digital', Icon: Laptop },
  ] as { key: string; label: string; desc: string; Icon: LucideIcon }[]

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-950">Frete & Entrega</h2>
          <p className="mt-0.5 text-[13px] text-gray-500">
            Origem, faixas por km e simulador com CEP real para responder o cliente.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate('/entregas')}>
            Lead Capture Mob
          </Button>
          <Button type="button" loading={saving} onClick={() => void save()}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </div>

      <Card flat>
        <CardHeader>
          <CardTitle>Modo de entrega</CardTitle>
        </CardHeader>
        <CardBody className="pt-0">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Modo de entrega">
            {modes.map((m) => {
              const on = shippingMode === m.key
              return (
                <button
                  key={m.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setShippingMode(m.key)}
                  className={cn(
                    'rounded-xl border p-3 text-left transition-[background,border,color] duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2',
                    on
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-border bg-white hover:border-gray-300',
                  )}
                >
                  <m.Icon size={18} strokeWidth={1.75} className={on ? 'text-white' : 'text-gray-500'} />
                  <p className={cn('mt-1.5 text-xs font-bold', on ? 'text-white' : 'text-gray-800')}>{m.label}</p>
                  <p className={cn('text-[10px]', on ? 'text-white/70' : 'text-gray-400')}>{m.desc}</p>
                </button>
              )
            })}
          </div>
        </CardBody>
      </Card>

      <Card flat>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <MapPin size={16} className="text-gray-700" aria-hidden />
          <div>
            <CardTitle>Origem da loja</CardTitle>
            <CardSubtitle>Ponto de partida do cálculo de km. Use o CEP real da expedição.</CardSubtitle>
          </div>
        </CardHeader>
        <CardBody className="grid gap-3 pt-0 sm:grid-cols-4">
          <Input
            label="CEP origem"
            value={origin.cep}
            onChange={(e) => setOrigin((o) => ({ ...o, cep: e.target.value.replace(/\D/g, '').slice(0, 8) }))}
            placeholder="00000000"
            inputMode="numeric"
          />
          <div className="sm:col-span-2">
            <Input
              label="Endereço"
              value={origin.address}
              onChange={(e) => setOrigin((o) => ({ ...o, address: e.target.value }))}
              placeholder="Rua e número"
            />
          </div>
          <Input
            label="UF"
            value={origin.state}
            onChange={(e) => setOrigin((o) => ({ ...o, state: e.target.value.toUpperCase().slice(0, 2) }))}
            placeholder="MG"
            maxLength={2}
          />
          <div className="sm:col-span-2">
            <Input
              label="Cidade"
              value={origin.city}
              onChange={(e) => setOrigin((o) => ({ ...o, city: e.target.value }))}
              placeholder="Cidade da loja"
            />
          </div>
          <div className="sm:col-span-2">
            <Select
              label="Fonte de CEP"
              value={cepProvider}
              onChange={(e) => setCepProvider(e.target.value as 'auto' | 'brasilapi' | 'viacep')}
            >
              <option value="auto">Automático (BrasilAPI → ViaCEP)</option>
              <option value="brasilapi">BrasilAPI (com coordenadas)</option>
              <option value="viacep">ViaCEP</option>
            </Select>
          </div>
        </CardBody>
      </Card>

      <Card flat>
        <CardHeader>
          <CardTitle>Política geral</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 pt-0">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Input
              label="Taxa legada (fallback R$)"
              type="number"
              step="0.01"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="0,00"
            />
            <div className="relative">
              <Input
                label="Frete grátis acima de (R$)"
                type="number"
                step="0.01"
                value={freeAbove}
                onChange={(e) => setFreeAbove(e.target.value)}
                placeholder="Desativado"
              />
              {hasFreeShipping ? (
                <span className="pointer-events-none absolute right-3 top-[34px] text-[10px] font-bold text-emerald-600">
                  ATIVO
                </span>
              ) : null}
            </div>
            <Input
              label="Raio máximo (km)"
              type="number"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              placeholder="40"
              hint="Deve cobrir o teto das faixas (ao salvar, sobe automaticamente se estiver menor)"
            />
            <Input
              label="ETA padrão (min)"
              type="number"
              value={eta}
              onChange={(e) => setEta(e.target.value)}
              placeholder="120"
            />
          </div>
          <Input
            label="Texto de prazo (catálogo)"
            type="text"
            value={deliveryText}
            onChange={(e) => setDeliveryText(e.target.value)}
            placeholder="Ex.: Entrega em até 2 horas para BH e região"
          />
          <Textarea
            label="Política completa (texto)"
            value={freteTexto}
            onChange={(e) => setFreteTexto(e.target.value)}
            rows={3}
            placeholder="Regras gerais exibidas no catálogo e checkout…"
            className="min-h-[88px] resize-none"
          />
        </CardBody>
      </Card>

      <Card flat>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Faixas de distância</CardTitle>
            <CardSubtitle>Curta / média / longa — valor fixo na faixa ou base + R$/km.</CardSubtitle>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            iconLeft={<Plus size={14} />}
            onClick={() => setTiers((t) => [...t, newTier()])}
          >
            Faixa
          </Button>
        </CardHeader>
        <CardBody className="space-y-3 pt-0">
          <ul className="space-y-3">
            {tiers.map((t) => (
              <li key={t.id} className="rounded-xl border border-border bg-gray-50/80 p-3.5">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <Input
                    value={t.label}
                    onChange={(e) => updateTier(t.id, { label: e.target.value })}
                    className="font-semibold"
                    aria-label="Nome da faixa"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-11 w-11 shrink-0 px-0 text-gray-400 hover:text-red-600"
                    onClick={() => setTiers((list) => list.filter((x) => x.id !== t.id))}
                    aria-label="Remover faixa"
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
                  <Input
                    label="De (km)"
                    type="number"
                    step="0.1"
                    value={t.from_km}
                    onChange={(e) => updateTier(t.id, { from_km: Number(e.target.value) || 0 })}
                  />
                  <Input
                    label="Até (km)"
                    type="number"
                    step="0.1"
                    value={t.to_km ?? ''}
                    onChange={(e) =>
                      updateTier(t.id, {
                        to_km: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    placeholder="∞"
                  />
                  <Select
                    label="Modo"
                    value={t.mode === 'per_km' ? 'per_km' : 'fixed'}
                    onChange={(e) => updateTier(t.id, { mode: e.target.value as 'fixed' | 'per_km' })}
                  >
                    <option value="fixed">Fixo na faixa</option>
                    <option value="per_km">Base + R$/km</option>
                  </Select>
                  {t.mode === 'per_km' ? (
                    <>
                      <Input
                        label="Base (R$)"
                        type="number"
                        step="0.01"
                        value={t.base_fee ?? ''}
                        onChange={(e) =>
                          updateTier(t.id, { base_fee: e.target.value === '' ? null : Number(e.target.value) })
                        }
                      />
                      <Input
                        label="R$ / km"
                        type="number"
                        step="0.01"
                        value={t.price_per_km ?? ''}
                        onChange={(e) =>
                          updateTier(t.id, {
                            price_per_km: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                      />
                    </>
                  ) : (
                    <Input
                      label="Valor fixo (R$)"
                      type="number"
                      step="0.01"
                      value={t.fixed_fee ?? ''}
                      onChange={(e) =>
                        updateTier(t.id, { fixed_fee: e.target.value === '' ? null : Number(e.target.value) })
                      }
                    />
                  )}
                  <Input
                    label="ETA (min)"
                    type="number"
                    value={t.eta_minutes ?? ''}
                    onChange={(e) =>
                      updateTier(t.id, { eta_minutes: e.target.value === '' ? null : Number(e.target.value) })
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card flat>
        <CardBody className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <MessageSquare size={15} aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">WhatsApp da expedição</p>
              <p className="text-[11px] text-gray-500">Notificações de novos pedidos</p>
            </div>
          </div>
          <Input
            type="tel"
            value={expeditionPhone}
            onChange={(e) => setExpeditionPhone(e.target.value)}
            placeholder="5531999999999"
            iconLeft={<Phone size={15} />}
            aria-label="WhatsApp da expedição"
          />
        </CardBody>
      </Card>

      {storeId ? (
        <FreightSimulator
          surface="admin"
          accent="#171717"
          showToast={showToast}
          onLookupCep={async (cep) => {
            const r = await fetch(`/api/storefront/freight/cep/${encodeURIComponent(cep)}`, {
              headers: getHeaders(),
            })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d.error || 'CEP não encontrado')
            return { place: d.place }
          }}
          onQuote={async (payload) => {
            const r = await fetch(`/api/storefront/stores/${storeId}/freight/quote`, {
              method: 'POST',
              headers: getHeaders(),
              body: JSON.stringify(payload),
            })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d.error || 'Falha ao calcular')
            return { quote: d.quote }
          }}
        />
      ) : null}

      <p className="flex items-center gap-1.5 text-[11px] text-gray-400">
        <Clock size={12} aria-hidden /> Salve as faixas antes de simular se acabou de editar.
      </p>
    </div>
  )
}
