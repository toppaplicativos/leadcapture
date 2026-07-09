import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, ChevronRight, Loader2, Wifi, WifiOff } from 'lucide-react'
import { affiliateApi } from '@/lib/api-affiliate'
import type { AppContext } from '@/pages/affiliate/types'

type DistributionStatus = {
  can_receive: boolean
  distribution_status: string
  whatsapp_status: string
  blockers: string[]
  checklist: Array<{ key: string; label: string; ok: boolean; action?: string | null }>
  program_name?: string | null
  stats?: { assigned_active: number; alerts_unread: number; queued_for_brand: number }
}

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

  if (loading) {
    return (
      <div className="affiliate-card p-4 flex items-center gap-2 text-[#8e8e93]">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-xs font-medium">Verificando aptidão para receber oportunidades…</span>
      </div>
    )
  }

  if (!data) return null

  const active = data.can_receive
  const paused = data.distribution_status === 'paused'
  const accent = active ? '#059669' : paused ? '#d97706' : '#ef4444'

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
          {active ? (
            <CheckCircle2 size={20} style={{ color: accent }} />
          ) : data.whatsapp_status === 'disconnected' || data.whatsapp_status === 'none' ? (
            <WifiOff size={20} style={{ color: accent }} />
          ) : (
            <AlertCircle size={20} style={{ color: accent }} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#1c1c1e]">
            {active
              ? 'Pronto para receber oportunidades'
              : paused
                ? 'Recebimento pausado'
                : 'Complete seu perfil para receber leads'}
          </p>
          <p className="text-xs text-[#8e8e93] mt-1 leading-relaxed">
            {active
              ? `A organização distribui prospects qualificados para seu WhatsApp${data.program_name ? ` (${data.program_name})` : ''}.`
              : data.blockers[0] || 'Conecte o WhatsApp e conclua o onboarding do programa.'}
          </p>

          {!!data.stats?.assigned_active && (
            <p className="text-xs font-semibold mt-2" style={{ color: ctx.primary }}>
              {data.stats.assigned_active} oportunidade(s) ativa(s)
              {data.stats.alerts_unread ? ` · ${data.stats.alerts_unread} alerta(s)` : ''}
            </p>
          )}

          {!active && (
            <ul className="mt-3 space-y-1">
              {data.checklist.filter((c) => !c.ok).slice(0, 3).map((c) => (
                <li key={c.key} className="text-[11px] text-[#636366] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#c7c7cc]" />
                  {c.action || c.label}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2 mt-3">
            {!active && (data.whatsapp_status === 'disconnected' || data.whatsapp_status === 'none') && onConnectWhatsApp && (
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