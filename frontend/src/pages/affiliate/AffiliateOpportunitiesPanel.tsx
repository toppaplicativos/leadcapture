import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Briefcase, ChevronDown, Copy, Flame, Loader2, MessageCircle,
  Phone, Sparkles, Target, UserPlus, Users,
} from 'lucide-react'
import { affiliateApi } from '@/lib/api-affiliate'
import type { AppContext } from '@/pages/affiliate/types'

type Segment = 'all' | 'contact' | 'prospect' | 'lead' | 'hot' | 'followup' | 'lost'

type Opportunity = {
  id: string
  ref_type: 'affiliate_lead' | 'assignment'
  ref_id: string
  name: string
  phone?: string | null
  pipeline_type: 'contact' | 'prospect' | 'lead'
  commercial_status: string
  temperature: 'cold' | 'warm' | 'hot'
  source: string
  source_label: string
  city?: string | null
  region?: string | null
  product_name?: string | null
  message?: string | null
  last_interaction_at?: string | null
  next_followup_at?: string | null
  next_action?: string | null
  received_at: string
  followup_due?: boolean
}

type Stats = {
  received_today?: number
  received_week?: number
  total_open?: number
  contacts?: number
  prospects?: number
  leads?: number
  hot?: number
  followup_due?: number
  lost?: number
  converted_total?: number
  from_own_links?: number
  from_organization?: number
}

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'contact', label: 'Contatos' },
  { key: 'prospect', label: 'Prospects' },
  { key: 'lead', label: 'Leads' },
  { key: 'hot', label: 'Quentes' },
  { key: 'followup', label: 'Follow-up' },
  { key: 'lost', label: 'Perdidos' },
]

const PIPELINE_LABEL = {
  contact: 'Contato',
  prospect: 'Prospect',
  lead: 'Lead',
} as const

const TEMP_STYLE = {
  hot: { bg: '#fef2f2', color: '#dc2626', label: 'Quente' },
  warm: { bg: '#fff7ed', color: '#ea580c', label: 'Morno' },
  cold: { bg: '#f3f4f6', color: '#6b7280', label: 'Frio' },
} as const

function dt(v?: string | null) {
  try {
    return new Date(v!).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function waLink(phone?: string | null, text?: string) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return null
  const n = digits.startsWith('55') ? digits : `55${digits}`
  const qs = text ? `?text=${encodeURIComponent(text)}` : ''
  return `https://wa.me/${n}${qs}`
}

export function AffiliateOpportunitiesPanel({ ctx }: { ctx: AppContext }) {
  const [segment, setSegment] = useState<Segment>('all')
  const [items, setItems] = useState<Opportunity[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await affiliateApi.opportunities(segment, 1, 80)
      setItems(r.opportunities || [])
      setStats(r.stats || null)
    } catch {
      ctx.showToast('Erro ao carregar contatos', 'err')
    } finally {
      setLoading(false)
    }
  }, [ctx.showToast, segment])

  useEffect(() => {
    void load()
  }, [load, ctx.cacheVersion])

  const greeting = useMemo(() => {
    const brand = ctx.brand?.name || 'a marca'
    const name = ctx.affiliate?.display_name || ctx.affiliate?.code || 'parceiro'
    return `${name}, aqui chegam contatos, prospects e leads que ${brand} envia ao seu programa — e os gerados pelos seus links.`
  }, [ctx.affiliate, ctx.brand?.name])

  async function updateLeadStatus(refId: string, status: string) {
    setSavingId(refId)
    try {
      await affiliateApi.updateLead(refId, { status })
      ctx.showToast('Status atualizado')
      void load()
    } catch (e: unknown) {
      ctx.showToast(e instanceof Error ? e.message : 'Erro ao salvar', 'err')
    } finally {
      setSavingId(null)
    }
  }

  async function convertAssignment(refId: string) {
    setSavingId(refId)
    try {
      await affiliateApi.convertDistributionAssignment(refId, { notes: 'Convertido pelo afiliado' })
      ctx.showToast('Marcado como convertido — agora é cliente', 'ok')
      void load()
    } catch {
      ctx.showToast('Erro ao registrar conversão', 'err')
    } finally {
      setSavingId(null)
    }
  }

  function copyPhone(phone?: string | null) {
    const digits = String(phone || '').replace(/\D/g, '')
    if (!digits) return ctx.showToast('Sem telefone', 'err')
    navigator.clipboard.writeText(digits).then(
      () => ctx.showToast('Telefone copiado'),
      () => ctx.showToast('Não foi possível copiar', 'err'),
    )
  }

  if (loading && !items.length) {
    return (
      <div className="space-y-3 pb-2">
        <div className="affiliate-skel h-20 w-full" />
        <div className="grid grid-cols-3 gap-2">
          <div className="affiliate-skel h-16" />
          <div className="affiliate-skel h-16" />
          <div className="affiliate-skel h-16" />
        </div>
        <div className="affiliate-skel h-24 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-3 pb-4 min-w-0">
      <div className="affiliate-card p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ backgroundColor: `${ctx.primary}14` }}>
            <Target size={18} style={{ color: ctx.primary }} />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm text-[#1c1c1e]">Contatos do programa</p>
            <p className="text-xs text-[#636366] mt-1 leading-relaxed">{greeting}</p>
            <p className="text-[10px] text-[#8e8e93] mt-2 leading-relaxed">
              A marca envia contatos, prospects e leads para você. Contato → Prospect → Lead → Cliente.
              Quem já comprou está em <strong>Clientes</strong>.
            </p>
          </div>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="affiliate-card affiliate-kpi p-3">
            <p className="affiliate-kpi__label">Hoje</p>
            <p className="affiliate-kpi__value text-lg">{stats.received_today ?? 0}</p>
            <p className="text-[10px] text-[#8e8e93]">recebidos</p>
          </div>
          <div className="affiliate-card affiliate-kpi p-3">
            <p className="affiliate-kpi__label">Abertos</p>
            <p className="affiliate-kpi__value text-lg">{stats.total_open ?? 0}</p>
            <p className="text-[10px] text-[#8e8e93]">{stats.leads ?? 0} leads · {stats.hot ?? 0} quentes</p>
          </div>
          <div className="affiliate-card affiliate-kpi p-3">
            <p className="affiliate-kpi__label">Follow-up</p>
            <p className="affiliate-kpi__value text-lg" style={{ color: stats.followup_due ? '#dc2626' : undefined }}>
              {stats.followup_due ?? 0}
            </p>
            <p className="text-[10px] text-[#8e8e93]">vencidos</p>
          </div>
          <div className="affiliate-card affiliate-kpi p-3">
            <p className="affiliate-kpi__label">Convertidos</p>
            <p className="affiliate-kpi__value text-lg" style={{ color: '#059669' }}>{stats.converted_total ?? 0}</p>
            <p className="text-[10px] text-[#8e8e93]">viraram cliente</p>
          </div>
        </div>
      )}

      <div className="affiliate-hub__channel-pills flex flex-wrap gap-1.5 px-0.5">
        {SEGMENTS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className={`affiliate-hub__channel-pill${segment === opt.key ? ' affiliate-hub__channel-pill--on' : ''}`}
            style={segment === opt.key ? { backgroundColor: `${ctx.primary}18`, color: ctx.primary } : undefined}
            onClick={() => setSegment(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="affiliate-card p-8 text-center">
          <Sparkles size={28} className="mx-auto text-[#c7c7cc] mb-3" />
          <p className="font-bold text-sm text-[#1c1c1e]">Nenhum contato neste filtro</p>
          <p className="text-xs text-[#8e8e93] mt-2 leading-relaxed max-w-xs mx-auto">
            Quando a marca distribuir prospects ou quando alguém entrar pelos seus links, eles aparecem aqui até virarem cliente.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item) => {
            const expanded = expandedId === item.id
            const busy = savingId === item.ref_id
            const temp = TEMP_STYLE[item.temperature]
            const link = waLink(item.phone, `Olá ${item.name}, tudo bem? Posso te ajudar?`)
            const TypeIcon = item.pipeline_type === 'lead' ? Flame : item.pipeline_type === 'prospect' ? Briefcase : Users

            return (
              <li key={item.id} className="affiliate-card overflow-hidden">
                <button
                  type="button"
                  className="w-full text-left p-4 flex items-start gap-3 active:bg-black/[0.02]"
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                >
                  <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0 mt-0.5" style={{ backgroundColor: `${ctx.primary}10` }}>
                    <TypeIcon size={16} style={{ color: ctx.primary }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-sm text-[#1c1c1e] truncate">{item.name}</p>
                      <span className="text-[10px] font-bold uppercase tracking-wide shrink-0 px-2 py-0.5 rounded-full" style={{ backgroundColor: temp.bg, color: temp.color }}>
                        {PIPELINE_LABEL[item.pipeline_type]}
                      </span>
                    </div>
                    <p className="text-xs text-[#636366] mt-0.5">
                      {item.source_label}
                      {item.product_name ? ` · ${item.product_name}` : ''}
                      {item.city ? ` · ${item.city}` : ''}
                    </p>
                    <p className="text-[11px] text-[#8e8e93] mt-1">
                      {item.commercial_status}
                      {item.followup_due ? ' · follow-up vencido' : ''}
                    </p>
                  </div>
                  <ChevronDown size={16} className={`text-[#c7c7cc] shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>

                {expanded && (
                  <div className="px-4 pb-4 pt-0 border-t border-black/[0.04] space-y-3">
                    <div className="pt-3 grid grid-cols-2 gap-2 text-[11px]">
                      <div className="bg-[#f9f9fb] rounded-xl p-2.5">
                        <p className="text-[#8e8e93] font-semibold uppercase text-[9px]">Temperatura</p>
                        <p className="font-bold text-[#1c1c1e] mt-0.5">{temp.label}</p>
                      </div>
                      <div className="bg-[#f9f9fb] rounded-xl p-2.5">
                        <p className="text-[#8e8e93] font-semibold uppercase text-[9px]">Próxima ação</p>
                        <p className="font-bold text-[#1c1c1e] mt-0.5 leading-snug">{item.next_action || 'Acompanhar'}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {item.phone && (
                        <>
                          <button
                            type="button"
                            className="affiliate-hub__channel-pill affiliate-hub__channel-pill--on text-[11px]"
                            style={{ backgroundColor: '#dcfce7', color: '#15803d' }}
                            onClick={() => link && window.open(link, '_blank', 'noopener')}
                          >
                            <MessageCircle size={12} className="inline mr-1" />
                            WhatsApp
                          </button>
                          <button type="button" className="affiliate-hub__channel-pill text-[11px]" onClick={() => copyPhone(item.phone)}>
                            <Copy size={12} className="inline mr-1" />
                            Copiar tel.
                          </button>
                        </>
                      )}
                      {!item.phone && (
                        <span className="text-[11px] text-[#8e8e93] flex items-center gap-1">
                          <Phone size={12} /> Sem telefone
                        </span>
                      )}
                    </div>

                    {item.message && (
                      <p className="text-xs text-[#636366] bg-[#f9f9fb] rounded-xl p-3 leading-relaxed whitespace-pre-wrap">{item.message}</p>
                    )}

                    <p className="text-[10px] text-[#8e8e93]">
                      Recebido {dt(item.received_at)}
                      {item.last_interaction_at ? ` · última interação ${dt(item.last_interaction_at)}` : ''}
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {item.ref_type === 'affiliate_lead' && (
                        <>
                          <button type="button" disabled={busy} className="text-[11px] font-bold px-3 py-2 rounded-lg border border-[#e5e5ea] active:opacity-70" onClick={() => updateLeadStatus(item.ref_id, 'contacted')}>
                            Marcar contatado
                          </button>
                          <button type="button" disabled={busy} className="text-[11px] font-bold px-3 py-2 rounded-lg border border-[#e5e5ea] active:opacity-70" onClick={() => updateLeadStatus(item.ref_id, 'negotiating')}>
                            Lead quente
                          </button>
                          <button type="button" disabled={busy} className="text-[11px] font-bold px-3 py-2 rounded-lg active:opacity-70" style={{ color: '#059669' }} onClick={() => updateLeadStatus(item.ref_id, 'converted')}>
                            <UserPlus size={12} className="inline mr-1" />
                            Converter em cliente
                          </button>
                        </>
                      )}
                      {item.ref_type === 'assignment' && (
                        <button type="button" disabled={busy} className="text-[11px] font-bold px-3 py-2 rounded-lg active:opacity-70" style={{ color: '#059669' }} onClick={() => convertAssignment(item.ref_id)}>
                          {busy ? <Loader2 size={12} className="inline animate-spin mr-1" /> : <UserPlus size={12} className="inline mr-1" />}
                          Converter em cliente
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}