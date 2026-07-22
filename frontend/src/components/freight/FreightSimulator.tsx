/**
 * Simulador de frete — product register (Operations Console).
 * Admin (Frete) e Atendimento afiliado. Primitives: Button, Input, Card.
 */
import { useId, useState } from 'react'
import { Check, Copy, MapPin, Navigation, Search, Truck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardBody } from '@/components/ui/Card'
import { cn } from '@/lib/cn'

export type FreightQuoteResult = {
  ok: boolean
  error?: string
  distance_km?: number | null
  fee?: number | null
  free_shipping?: boolean
  tier?: { id?: string; label?: string } | null
  eta_minutes?: number | null
  eta_text?: string | null
  within_radius?: boolean
  max_radius_km?: number | null
  origin?: { label?: string; city?: string; cep?: string | null } | null
  destination?: { label?: string; city?: string; cep?: string | null; source?: string } | null
  provider?: string | null
  copy?: string | null
  policy_text?: string | null
}

type Props = {
  /** Accent da marca (afiliado) ou ink do sistema */
  accent?: string
  surface?: 'admin' | 'affiliate'
  onQuote: (input: {
    cep?: string
    address?: string
    city?: string
    state?: string
    cart_total?: number
  }) => Promise<{ quote: FreightQuoteResult; configured?: boolean; store_id?: string | null }>
  onLookupCep?: (cep: string) => Promise<{ place: any } | null>
  showCartTotal?: boolean
  showToast?: (msg: string, type?: 'ok' | 'err') => void
}

const money = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function FreightSimulator({
  accent = '#171717',
  surface = 'admin',
  onQuote,
  onLookupCep,
  showCartTotal = true,
  showToast,
}: Props) {
  const baseId = useId()
  const [cep, setCep] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [cartTotal, setCartTotal] = useState('')
  const [loading, setLoading] = useState(false)
  const [lookupBusy, setLookupBusy] = useState(false)
  const [quote, setQuote] = useState<FreightQuoteResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function lookupCep() {
    const digits = cep.replace(/\D/g, '')
    if (digits.length !== 8 || !onLookupCep) return
    setLookupBusy(true)
    setError(null)
    try {
      const res = await onLookupCep(digits)
      const p = res?.place
      if (!p) {
        setError('CEP não encontrado')
        return
      }
      if (p.street) setAddress(String(p.street))
      if (p.city) setCity(String(p.city))
      if (p.state) setState(String(p.state))
      showToast?.(`CEP ${digits} · ${p.city || 'localizado'}`)
    } catch (e: any) {
      setError(e?.message || 'Falha ao consultar CEP')
    } finally {
      setLookupBusy(false)
    }
  }

  async function runQuote() {
    const digits = cep.replace(/\D/g, '')
    if (digits.length < 8 && !address.trim() && !city.trim()) {
      setError('Informe um CEP (8 dígitos) ou cidade/endereço')
      return
    }
    setLoading(true)
    setError(null)
    setQuote(null)
    try {
      const res = await onQuote({
        cep: digits.length === 8 ? digits : undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        cart_total: cartTotal ? Number(cartTotal) : undefined,
      })
      setQuote(res.quote)
      if (res.configured === false) {
        setError('A organização ainda não concluiu a política de frete desta loja.')
      } else if (!res.quote?.ok) {
        setError(res.quote?.error || 'Não foi possível calcular')
      }
    } catch (e: any) {
      setError(e?.message || 'Falha ao calcular frete')
    } finally {
      setLoading(false)
    }
  }

  async function copyReply() {
    const text = quote?.copy || quote?.error || ''
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      showToast?.('Resposta copiada')
    } catch {
      showToast?.('Não foi possível copiar', 'err')
    }
  }

  const body = (
    <>
      <div className="flex items-start gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
          style={{ backgroundColor: `${accent}14`, color: accent }}
          aria-hidden
        >
          <Truck size={18} strokeWidth={2.1} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold tracking-tight text-gray-900">Simular frete</h3>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Input
          id={`${baseId}-cep`}
          label="CEP do cliente"
          inputMode="numeric"
          value={cep}
          onChange={(e) => setCep(e.target.value.replace(/\D/g, '').slice(0, 8))}
          onBlur={() => {
            if (cep.replace(/\D/g, '').length === 8) void lookupCep()
          }}
          placeholder="00000000"
          iconLeft={<MapPin size={15} />}
          autoComplete="postal-code"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => void lookupCep()}
          disabled={lookupBusy || cep.replace(/\D/g, '').length !== 8}
          loading={lookupBusy}
          iconLeft={!lookupBusy ? <Search size={14} /> : undefined}
          className="w-full sm:w-auto"
        >
          Buscar CEP
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Input
            id={`${baseId}-address`}
            label="Endereço / localidade"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Rua, bairro ou referência"
          />
        </div>
        <Input
          id={`${baseId}-city`}
          label="Cidade"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Cidade"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          id={`${baseId}-state`}
          label="UF"
          value={state}
          onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
          placeholder="MG"
          maxLength={2}
        />
        {showCartTotal ? (
          <Input
            id={`${baseId}-cart`}
            label="Valor do pedido (R$)"
            hint="Usado para frete grátis, se configurado"
            type="number"
            step="0.01"
            value={cartTotal}
            onChange={(e) => setCartTotal(e.target.value)}
            placeholder="Opcional"
          />
        ) : null}
      </div>

      <Button
        type="button"
        fullWidth
        loading={loading}
        onClick={() => void runQuote()}
        iconLeft={!loading ? <Navigation size={16} /> : undefined}
        className={cn(surface === 'affiliate' && 'border-0')}
        style={surface === 'affiliate' ? { backgroundColor: accent } : undefined}
        variant={surface === 'affiliate' ? 'primary' : 'primary'}
      >
        Calcular frete
      </Button>

      {error && !quote?.ok ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800"
        >
          {error}
        </div>
      ) : null}

      {quote?.ok ? (
        <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[12px] font-semibold text-emerald-900">Resultado</p>
              <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-gray-950">
                {quote.free_shipping ? 'Grátis' : money(Number(quote.fee || 0))}
              </p>
              <p className="mt-0.5 text-xs text-gray-600">
                {[
                  quote.distance_km != null ? `≈ ${quote.distance_km} km` : null,
                  quote.tier?.label || null,
                  quote.eta_text || (quote.eta_minutes != null ? `${quote.eta_minutes} min` : null),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-emerald-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <Check size={18} strokeWidth={2.4} aria-hidden />
            </span>
          </div>

          {quote.destination?.label ? (
            <p className="text-[11px] leading-relaxed text-gray-600">
              <span className="font-semibold text-gray-800">Destino:</span> {quote.destination.label}
              {quote.provider ? (
                <span className="text-gray-400"> · fonte {quote.provider}</span>
              ) : null}
            </p>
          ) : null}

          {quote.copy ? (
            <div className="rounded-xl border border-border bg-white px-3 py-2.5">
              <p className="text-[12px] leading-relaxed text-gray-800">{quote.copy}</p>
              <Button
                type="button"
                size="sm"
                className="mt-2"
                onClick={() => void copyReply()}
                iconLeft={<Copy size={13} />}
              >
                Copiar resposta
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {quote && !quote.ok && quote.copy ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
          <p className="text-[12px] leading-relaxed text-amber-950">{quote.copy}</p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-2"
            onClick={() => void copyReply()}
            iconLeft={<Copy size={13} />}
          >
            Copiar resposta
          </Button>
        </div>
      ) : null}
    </>
  )

  if (surface === 'affiliate') {
    return <div className="affiliate-card space-y-4 p-4">{body}</div>
  }

  return (
    <Card flat>
      <CardBody className="space-y-4">{body}</CardBody>
    </Card>
  )
}
