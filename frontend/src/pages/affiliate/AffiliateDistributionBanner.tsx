import { useEffect, useState } from 'react'
import { ChevronRight, Wifi, WifiOff } from 'lucide-react'
import { affiliateApi } from '@/lib/api-affiliate'
import type { AppContext } from '@/pages/affiliate/types'

type DistributionStatus = {
  can_receive: boolean
  distribution_status: string
  whatsapp_status: string
  blockers: string[]
  checklist: Array<{ key: string; label: string; ok: boolean; action?: string | null }>
  program_name?: string | null
  connected_instance_name?: string | null
  stats?: { assigned_active: number; alerts_unread: number; queued_for_brand: number }
}

function isWhatsappConnected(status?: string | null) {
  return status === 'connected'
}

/**
 * Card só quando o WhatsApp NÃO está conectado.
 * Com WA ok, o status fica no ícone do header (sem card no Início).
 */
export function AffiliateDistributionBanner({
  ctx,
  onConnectWhatsApp,
  onViewOpportunities,
}: {
  ctx: AppContext
  onConnectWhatsApp?: () => void
  onViewOpportunities?: () => void
}) {
  const [data, setData] = useState<DistributionStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    affiliateApi.distributionStatus()
      .then((r) => { if (!cancelled) setData(r) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ctx.cacheVersion])

  useEffect(() => {
    const onFocus = () => {
      affiliateApi.distributionStatus()
        .then((r) => setData(r))
        .catch(() => undefined)
    }
    window.addEventListener('focus', onFocus)
    const t = window.setInterval(onFocus, 45_000)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.clearInterval(t)
    }
  }, [])

  // Loading silencioso — status no header
  if (loading || !data) return null

  const waOk = isWhatsappConnected(data.whatsapp_status)
  // Conectado: sem card (ícone no header)
  if (waOk || data.can_receive) return null

  const paused = data.distribution_status === 'paused'
  const accent = paused ? '#d97706' : '#ef4444'

  return (
    <div
      className="affiliate-card p-4 border-l-4"
      style={{ borderLeftColor: accent }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl grid place-items-center shrink-0"
          style={{ backgroundColor: `${accent}18` }}
        >
          <WifiOff size={20} style={{ color: accent }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#1c1c1e]">
            {paused
              ? 'Recebimento automático pausado'
              : 'Complete o cadastro para liberar oportunidades'}
          </p>
          <p className="text-xs text-[#8e8e93] mt-1 leading-relaxed">
            {paused
              ? 'A sessão sincronizada está offline (opcional). Com o número cadastrado você continua assumindo contatos e atendendo manualmente. A sessão online só volta automação.'
              : (data.blockers?.[0]
                || 'Cadastre o número de WhatsApp que você usa (pode ter mais de um). Sessão online é opcional e serve só para automação.')}
          </p>

          <ul className="mt-3 space-y-1">
            {data.checklist.filter((c) => !c.ok).slice(0, 3).map((c) => (
              <li key={c.key} className="text-[11px] text-[#636366] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#c7c7cc]" />
                {c.action || c.label}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2 mt-3">
            {onConnectWhatsApp && (
              <button
                type="button"
                onClick={onConnectWhatsApp}
                className="inline-flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-lg text-white active:scale-[0.98]"
                style={{ backgroundColor: ctx.primary }}
              >
                <Wifi size={14} /> Conectar WhatsApp
              </button>
            )}
            {onViewOpportunities && (
              <button
                type="button"
                onClick={onViewOpportunities}
                className="inline-flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-lg bg-[#f2f2f7] text-[#1c1c1e] active:scale-[0.98]"
              >
                Ver contatos <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
