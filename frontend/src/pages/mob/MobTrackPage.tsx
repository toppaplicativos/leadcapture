import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Bike, Clock, MapPin, Phone, Package, Loader2 } from 'lucide-react'
import { mobApi, STATUS_LABELS, money } from '@/lib/api-mob'
import { Badge } from '@/components/ui'

export function MobTrackPage() {
  const { token: paramToken } = useParams()
  const [tokenInput, setTokenInput] = useState('')
  const token = paramToken || ''
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(!!token)

  useEffect(() => {
    document.title = 'Acompanhar corrida · Lead Capture Mob'
  }, [])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
    setError('')

    const load = () => {
      mobApi.track(token)
        .then((d) => { if (!cancelled) setData(d) })
        .catch((e: Error) => { if (!cancelled) setError(e.message) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }
    load()
    const t = window.setInterval(load, 15_000)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
  }, [token])

  if (!token) {
    return (
      <div className="min-h-dvh bg-[var(--ds-canvas)] flex items-center justify-center px-5">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-border p-6 shadow-card">
          <h1 className="text-lg font-bold text-gray-900">Acompanhar corrida</h1>
          <p className="text-sm text-gray-500 mt-1 mb-4">Cole o código do link que você recebeu.</p>
          <input
            className="w-full h-11 px-3 rounded-xl border border-border text-sm"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Código do rastreio"
          />
          <a
            href={tokenInput ? `/rastreio/${encodeURIComponent(tokenInput.trim())}` : undefined}
            className="mt-3 flex h-11 items-center justify-center rounded-xl bg-gray-900 text-white text-sm font-semibold"
          >
            Ver status
          </a>
        </div>
      </div>
    )
  }

  if (loading && !data) {
    return (
      <div className="min-h-dvh grid place-items-center bg-[var(--ds-canvas)]">
        <Loader2 className="animate-spin text-gray-400" size={28} />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="min-h-dvh grid place-items-center bg-[var(--ds-canvas)] px-5">
        <p className="text-sm text-red-600 text-center">{error}</p>
      </div>
    )
  }

  const d = data?.delivery
  const org = data?.organization
  const courier = data?.courier

  return (
    <div className="min-h-dvh bg-[var(--ds-canvas)] pb-10">
      <header className="bg-white border-b border-border px-5 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          {org?.logo_url ? (
            <img src={org.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gray-900 text-white grid place-items-center">
              <Package size={18} />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{org?.name}</p>
            <p className="text-xs text-gray-500">
              {d?.order_id ? `Pedido ${String(d.order_id).slice(0, 8)}` : 'Corrida'}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-5 pt-5 space-y-4">
        <div className="bg-white rounded-2xl border border-border p-5 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Status</p>
              <p className="text-xl font-bold text-gray-900 tracking-tight">
                {STATUS_LABELS[d?.status] || d?.status}
              </p>
            </div>
            <Badge variant={d?.status === 'delivered' ? 'success' : d?.status === 'cancelled' ? 'danger' : 'info'}>
              ao vivo
            </Badge>
          </div>
          {d?.eta_minutes != null && d?.status !== 'delivered' && (
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
              <Clock size={16} className="text-gray-400" />
              Previsão ~{d.eta_minutes} min
            </div>
          )}
          {d?.dropoff_address && (
            <div className="mt-2 flex items-start gap-2 text-sm text-gray-600">
              <MapPin size={16} className="text-gray-400 shrink-0 mt-0.5" />
              <span>{d.dropoff_address}</span>
            </div>
          )}
          {d?.delivery_fee != null && (
            <p className="mt-3 text-sm text-gray-500">
              Frete: <span className="font-semibold text-gray-800 tabular-nums">{money(d.delivery_fee)}</span>
            </p>
          )}
          {d?.delivery_pin && (
            <div className="mt-4 rounded-xl bg-gray-900 text-white px-4 py-3">
              <p className="text-[11px] font-semibold text-white/60">Código de confirmação</p>
              <p className="text-2xl font-bold tracking-[0.2em] tabular-nums">{d.delivery_pin}</p>
            </div>
          )}
        </div>

        {courier && (
          <div className="bg-white rounded-2xl border border-border p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gray-100 grid place-items-center text-gray-600">
              {courier.photo_url ? (
                <img src={courier.photo_url} alt="" className="w-11 h-11 rounded-full object-cover" />
              ) : (
                <Bike size={20} />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{courier.first_name}</p>
              <p className="text-xs text-gray-500">
                {courier.vehicle_type ? `Entregador · ${courier.vehicle_type}` : 'Entregador'}
              </p>
            </div>
          </div>
        )}

        {data?.show_map && data?.location && (
          <div className="bg-white rounded-2xl border border-border p-4">
            <p className="text-xs font-semibold text-gray-500 mb-1">Localização do entregador</p>
            <p className="text-sm text-gray-800 tabular-nums">
              {Number(data.location.lat).toFixed(5)}, {Number(data.location.lng).toFixed(5)}
            </p>
            {data.location.updated_at && (
              <p className="text-[11px] text-gray-400 mt-1">
                Atualizado {new Date(data.location.updated_at).toLocaleTimeString('pt-BR')}
              </p>
            )}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-border p-5">
          <p className="text-sm font-bold text-gray-900 mb-3">Linha do tempo</p>
          <ol className="space-y-3">
            {(data?.timeline || []).slice().reverse().map((ev: any, i: number) => (
              <li key={i} className="flex gap-3">
                <div className="w-2 h-2 rounded-full bg-gray-900 mt-1.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {STATUS_LABELS[ev.status] || ev.status}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {ev.at ? new Date(ev.at).toLocaleString('pt-BR') : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {org?.contact_phone && (
          <a
            href={`https://wa.me/${String(org.contact_phone).replace(/\D/g, '')}`}
            className="flex items-center justify-center gap-2 h-12 rounded-xl bg-emerald-600 text-white text-sm font-semibold"
          >
            <Phone size={16} /> Contato com a loja
          </a>
        )}
      </main>
    </div>
  )
}
