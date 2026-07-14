/**
 * Customer-facing logistics card for catalog order tracking.
 * Shows payment confirmation, PIN, live map and tracking link.
 */
import { useEffect, useState } from 'react'
import { Bike, CheckCircle2, Clock, ExternalLink, MapPin, Navigation, Shield } from 'lucide-react'
import type { OrderLogistics } from '@/lib/api'
import { MobCourierRouteMap } from '@/components/mob/MobCourierRouteMap'
import { STATUS_LABELS } from '@/lib/api-mob'

const MOB_STATUS_PT: Record<string, string> = {
  ...STATUS_LABELS,
  payment_approved: 'Pagamento confirmado',
  preparing: 'Preparando pedido',
  ready_for_dispatch: 'Pronto para envio',
  awaiting_courier: 'Aguardando entregador',
  accepted_by_courier: 'Entregador a caminho',
  en_route: 'Saiu para entrega',
  delivered: 'Entregue',
}

type Props = {
  logistics: OrderLogistics
  pollMs?: number
  onRefresh?: () => void
}

export function OrderLogisticsCard({ logistics, pollMs = 12_000, onRefresh }: Props) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!logistics.delivery_id || logistics.status === 'delivered' || logistics.status === 'cancelled') {
      return
    }
    const t = window.setInterval(() => {
      setTick((n) => n + 1)
      onRefresh?.()
    }, pollMs)
    return () => window.clearInterval(t)
  }, [logistics.delivery_id, logistics.status, pollMs, onRefresh])

  if (!logistics?.enabled && !logistics?.delivery_id) return null

  const statusLabel =
    MOB_STATUS_PT[String(logistics.status || '')] || logistics.status || 'Aguardando logística'

  return (
    <div className="store-order-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="store-section-title text-[1rem]">Entrega em tempo real</p>
          <p className="text-[12px] text-gray-500 mt-0.5">
            Atualiza automaticamente{tick > 0 ? ` · ${tick}×` : ''}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-brand-soft text-brand">
          <Bike size={12} />
          {statusLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div
          className={`rounded-xl p-3 ring-1 ${
            logistics.payment_confirmed
              ? 'bg-emerald-50 ring-emerald-100'
              : 'bg-amber-50 ring-amber-100'
          }`}
        >
          <p className="text-[11px] font-semibold text-gray-600 flex items-center gap-1">
            {logistics.payment_confirmed ? (
              <CheckCircle2 size={12} className="text-emerald-600" />
            ) : (
              <Clock size={12} className="text-amber-600" />
            )}
            Pagamento
          </p>
          <p className="text-[13px] font-bold text-gray-900 mt-0.5">
            {logistics.payment_confirmed ? 'Confirmado' : 'Pendente'}
          </p>
        </div>
        <div className="rounded-xl bg-gray-50 p-3 ring-1 ring-black/[0.03]">
          <p className="text-[11px] font-semibold text-gray-600 flex items-center gap-1">
            <Clock size={12} /> ETA
          </p>
          <p className="text-[13px] font-bold text-gray-900 mt-0.5 tabular-nums">
            {logistics.eta_minutes != null ? `~${logistics.eta_minutes} min` : '—'}
          </p>
        </div>
      </div>

      {logistics.delivery_pin && (
        <div className="rounded-xl bg-gray-900 text-white px-4 py-3">
          <p className="text-[11px] font-semibold text-white/60 flex items-center gap-1">
            <Shield size={12} /> Código de confirmação (informe ao entregador)
          </p>
          <p className="text-2xl font-bold tracking-[0.25em] tabular-nums mt-1">
            {logistics.delivery_pin}
          </p>
        </div>
      )}

      {logistics.courier && (
        <div className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5">
          <div className="w-10 h-10 rounded-full bg-gray-100 grid place-items-center overflow-hidden">
            {logistics.courier.photo_url ? (
              <img src={logistics.courier.photo_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <Bike size={18} className="text-gray-500" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              {logistics.courier.first_name || 'Entregador'}
            </p>
            <p className="text-[11px] text-gray-500">
              {logistics.courier.vehicle_type || 'Em rota'} · contato protegido pela loja
            </p>
          </div>
        </div>
      )}

      {logistics.dropoff?.address && (
        <p className="text-[12px] text-gray-600 flex items-start gap-1.5">
          <MapPin size={14} className="shrink-0 mt-0.5 text-gray-400" />
          {logistics.dropoff.address}
        </p>
      )}

      {logistics.show_map !== false &&
        (logistics.location ||
          (logistics.dropoff?.lat != null && logistics.dropoff?.lng != null)) && (
          <MobCourierRouteMap
            height={200}
            me={
              logistics.location
                ? { lat: Number(logistics.location.lat), lng: Number(logistics.location.lng) }
                : null
            }
            dropoff={
              logistics.dropoff?.lat != null && logistics.dropoff?.lng != null
                ? {
                    lat: Number(logistics.dropoff.lat),
                    lng: Number(logistics.dropoff.lng),
                    label: 'Seu endereço',
                  }
                : null
            }
            pickup={
              logistics.pickup?.lat != null && logistics.pickup?.lng != null
                ? {
                    lat: Number(logistics.pickup.lat),
                    lng: Number(logistics.pickup.lng),
                    label: 'Loja',
                  }
                : null
            }
          />
        )}

      {logistics.tracking_url && (
        <a
          href={logistics.tracking_url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 h-11 rounded-xl bg-gray-900 text-white text-[13px] font-semibold"
        >
          <Navigation size={15} />
          Abrir rastreio completo
          <ExternalLink size={13} className="opacity-70" />
        </a>
      )}
    </div>
  )
}
