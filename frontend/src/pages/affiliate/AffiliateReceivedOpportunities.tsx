import { useEffect, useState } from 'react'
import { Briefcase, Bell, Loader2, MessageCircle, Phone, MapPin } from 'lucide-react'
import { affiliateApi } from '@/lib/api-affiliate'
import type { AppContext } from '@/pages/affiliate/types'

const STAGE_LABEL: Record<string, string> = {
  assigned_to_affiliate: 'Atribuído a você',
  initial_message_sent: 'Mensagem inicial enviada',
  awaiting_response: 'Aguardando resposta',
  engaged: 'Em conversa',
  needs_human_attention: 'Intervenção recomendada',
  proposal_sent: 'Proposta enviada',
  converted_to_customer: 'Convertido',
  lost: 'Perdido',
  post_sale: 'Pós-venda',
  recurrence_active: 'Recorrência',
}

function waLink(phone?: string | null) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return null
  const n = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${n}`
}

function dt(v?: string | null) {
  try {
    return new Date(v!).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function AffiliateReceivedOpportunities({ ctx }: { ctx: AppContext }) {
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      affiliateApi.distributionAssignments(),
      affiliateApi.distributionAlerts(),
    ])
      .then(([a, b]) => {
        if (cancelled) return
        setAssignments(a.assignments || [])
        setAlerts(b.alerts || [])
      })
      .catch(() => {
        if (!cancelled) ctx.showToast('Erro ao carregar oportunidades recebidas', 'err')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ctx.cacheVersion, ctx.showToast])

  async function markRead(alertId: string) {
    try {
      await affiliateApi.markDistributionAlertRead(alertId)
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, is_read: true } : a)))
    } catch {
      /* ignore */
    }
  }

  async function markConverted(assignmentId: string) {
    try {
      await affiliateApi.convertDistributionAssignment(assignmentId, { notes: 'Convertido pelo afiliado' })
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId))
      ctx.showToast('Oportunidade marcada como convertida', 'ok')
    } catch {
      ctx.showToast('Erro ao registrar conversão', 'err')
    }
  }

  if (loading) {
    return (
      <div className="affiliate-card p-6 flex justify-center">
        <Loader2 size={22} className="animate-spin text-[#c7c7cc]" />
      </div>
    )
  }

  const unread = alerts.filter((a) => !a.is_read)

  return (
    <div className="space-y-4 pb-2">
      <div className="affiliate-card p-4">
        <div className="flex items-center gap-2 mb-1">
          <Briefcase size={18} style={{ color: ctx.primary }} />
          <p className="text-sm font-bold text-[#1c1c1e]">Oportunidades da organização</p>
        </div>
        <p className="text-xs text-[#8e8e93] leading-relaxed">
          Prospects captados pela organização e entregues ao seu WhatsApp. Você acompanha alertas e intervém quando necessário.
        </p>
      </div>

      {unread.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8e8e93] px-1">Alertas</p>
          {unread.slice(0, 5).map((alert) => (
            <button
              key={alert.id}
              type="button"
              onClick={() => markRead(alert.id)}
              className="affiliate-card p-3 w-full text-left active:scale-[0.99] transition"
            >
              <div className="flex items-start gap-2">
                <Bell size={16} className="text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-[#1c1c1e]">{alert.title}</p>
                  {alert.body && <p className="text-xs text-[#8e8e93] mt-0.5">{alert.body}</p>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {!assignments.length ? (
        <div className="affiliate-card p-8 text-center">
          <Briefcase size={32} className="mx-auto text-[#c7c7cc] mb-3" />
          <p className="text-sm font-semibold text-[#1c1c1e]">Nenhuma oportunidade ainda</p>
          <p className="text-xs text-[#8e8e93] mt-1 max-w-xs mx-auto">
            Conecte seu WhatsApp e fique ativo no programa. Quando a organização captar prospects, eles aparecem aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {assignments.map((item) => {
            const wa = waLink(item.prospect_phone)
            const stage = STAGE_LABEL[item.current_stage] || item.current_stage
            return (
              <div key={item.id} className="affiliate-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-[#1c1c1e] truncate">
                      {item.prospect_name || 'Prospect'}
                    </p>
                    <p className="text-xs text-[#8e8e93] mt-0.5">{dt(item.assigned_at)}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 shrink-0">
                    {stage}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mt-3 text-[11px] text-[#636366]">
                  {item.prospect_phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone size={12} /> {item.prospect_phone}
                    </span>
                  )}
                  {(item.prospect_city || item.prospect_region) && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={12} /> {[item.prospect_city, item.prospect_region].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-[#ecfdf5] text-emerald-700"
                    >
                      <MessageCircle size={14} /> Abrir no WhatsApp
                    </a>
                  )}
                  {item.conversion_status !== 'converted' && item.current_stage !== 'converted_to_customer' && (
                    <button
                      type="button"
                      onClick={() => void markConverted(item.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-[#f0f9ff] text-sky-700"
                    >
                      Marcar convertido
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}