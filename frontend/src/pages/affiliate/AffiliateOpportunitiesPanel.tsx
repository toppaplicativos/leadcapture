import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, Briefcase, Check, ChevronDown, Copy, Flame, Loader2, MessageCircle,
  PencilLine, Phone, Send, Sparkles, Target, UserPlus, Users, X,
} from 'lucide-react'
import { affiliateApi } from '@/lib/api-affiliate'
import type { AppContext } from '@/pages/affiliate/types'
import { WhatsAppSendModal, type WaSendLead } from '@/components/WhatsAppSendModal'

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
  niche?: string | null
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
  const [selected, setSelected] = useState<Opportunity | null>(null)

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
            <p className="font-bold text-sm text-[#1c1c1e]">Fila assistida</p>
            <p className="text-xs text-[#636366] mt-1 leading-relaxed">{greeting}</p>
            <p className="text-[10px] text-[#8e8e93] mt-2 leading-relaxed">
              Escolha um contato, deixe a IA preparar a abordagem e avance cada etapa manualmente.
              Contato → Prospect → Lead → Cliente.
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
                      <button
                        type="button"
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl px-4 text-xs font-bold text-white active:scale-[.98]"
                        style={{ backgroundColor: ctx.primary }}
                        onClick={() => setSelected(item)}
                      >
                        <MessageCircle size={14} /> Enviar WhatsApp
                      </button>
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
      {selected && (() => {
        const queue = items.filter((entry) => String(entry.phone || '').replace(/\D/g, '').length >= 8)
        const initialIndex = Math.max(0, queue.findIndex((entry) => entry.id === selected.id))
        const leads: WaSendLead[] = queue.map((entry) => ({
          id: `${entry.ref_type}:${entry.ref_id}`,
          name: entry.name,
          trade_name: entry.name,
          phone: entry.phone || undefined,
          city: entry.city || undefined,
          state: entry.region || undefined,
          category: entry.niche || entry.product_name || undefined,
          status: entry.commercial_status,
          notes: entry.message || entry.next_action || undefined,
        }))
        return (
          <WhatsAppSendModal
            leads={leads}
            initialIndex={initialIndex}
            initialValueProposition={ctx.program?.share_description || ctx.brand?.slogan || ''}
            onClose={() => setSelected(null)}
            onAiPersonalize={async ({ lead, currentMessage, templateId }) => {
              const [refType, refId] = String(lead.id || '').split(':')
              const result = await affiliateApi.assistOpportunity(refType, refId, {
                intent: templateId,
                instruction: currentMessage.slice(0, 600),
              })
              return String(result.message || currentMessage)
            }}
            onSent={async (lead) => {
              const [refType, refId] = String(lead.id || '').split(':')
              try {
                await affiliateApi.progressOpportunity(refType, refId, { action: 'sent' })
                ctx.showToast('Contato marcado como contatado')
                void load()
              } catch (e) {
                ctx.showToast(e instanceof Error ? e.message : 'Não foi possível atualizar o contato', 'err')
              }
            }}
          />
        )
      })()}
    </div>
  )
}

type ManualStep = 'prepare' | 'review' | 'send' | 'progress'

function ManualOpportunityModal({ item, ctx, onClose, onChanged }: {
  item: Opportunity; ctx: AppContext; onClose: () => void; onChanged: () => void
}) {
  const [step, setStep] = useState<ManualStep>('prepare')
  const [intent, setIntent] = useState(item.followup_due ? 'follow_up' : 'primeiro_contato')
  const [instruction, setInstruction] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const digits = String(item.phone || '').replace(/\D/g, '')
  const phone = digits.startsWith('55') ? digits : `55${digits}`
  const steps: Array<{ key: ManualStep; label: string }> = [
    { key: 'prepare', label: 'Contexto' }, { key: 'review', label: 'Mensagem' },
    { key: 'send', label: 'Envio' }, { key: 'progress', label: 'Progresso' },
  ]

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  async function generate() {
    setLoading(true)
    try {
      const result = await affiliateApi.assistOpportunity(item.ref_type, item.ref_id, { intent, instruction })
      setMessage(String(result.message || ''))
      setStep('review')
    } catch (e) {
      ctx.showToast(e instanceof Error ? e.message : 'Não foi possível preparar a mensagem', 'err')
    } finally { setLoading(false) }
  }

  function openWhatsApp() {
    if (!digits || !message.trim()) return
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message.trim())}`, '_blank', 'noopener')
    setConfirmOpen(false)
    setStep('send')
  }

  async function progress(action: 'sent' | 'replied' | 'negotiating' | 'lost') {
    setSaving(true)
    try {
      await affiliateApi.progressOpportunity(item.ref_type, item.ref_id, { action, message })
      ctx.showToast(action === 'sent' ? 'Envio registrado. Follow-up programado.' : 'Etapa atualizada')
      onChanged()
    } catch (e) {
      ctx.showToast(e instanceof Error ? e.message : 'Erro ao atualizar contato', 'err')
    } finally { setSaving(false) }
  }

  const activeIndex = steps.findIndex((value) => value.key === step)
  return (
    <div className="fixed inset-0 z-[500] flex items-end justify-center bg-black/45 backdrop-blur-[2px] sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label={`Atendimento de ${item.name}`} onMouseDown={onClose}>
      <div className="relative flex max-h-[96dvh] w-full flex-col overflow-hidden rounded-t-[24px] bg-white shadow-2xl sm:max-h-[88vh] sm:max-w-2xl sm:rounded-[24px]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex justify-center py-2 sm:hidden"><span className="h-1 w-10 rounded-full bg-neutral-300" /></div>
        <header className="flex items-start gap-3 border-b border-neutral-200 px-4 pb-4 pt-2 sm:px-6 sm:pt-5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-neutral-100"><Target size={18} /></div>
          <div className="min-w-0 flex-1"><p className="truncate text-base font-bold tracking-[-.02em] text-neutral-950">{item.name}</p><p className="mt-1 truncate text-xs text-neutral-500">{item.niche || item.product_name || item.source_label}{item.city ? ` · ${item.city}` : ''}</p></div>
          <button type="button" aria-label="Fechar" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-2xl text-neutral-500 hover:bg-neutral-100"><X size={18}/></button>
        </header>

        <div className="border-b border-neutral-200 px-4 py-3 sm:px-6"><ol className="grid grid-cols-4 gap-1" aria-label="Etapas do atendimento">{steps.map((entry, index) => <li key={entry.key} className="min-w-0"><div className={`h-1 rounded-full ${index <= activeIndex ? 'bg-neutral-950' : 'bg-neutral-200'}`} /><p className={`mt-1.5 truncate text-[10px] font-semibold ${index === activeIndex ? 'text-neutral-950' : 'text-neutral-400'}`}>{index < activeIndex ? 'Concluído' : entry.label}</p></li>)}</ol></div>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {step === 'prepare' && <div className="space-y-5">
            <div><h3 className="text-lg font-bold tracking-[-.025em] text-neutral-950">Prepare a abordagem</h3><p className="mt-1 text-sm leading-relaxed text-neutral-600">A IA considera marca, nicho, origem e etapa atual. Você sempre revisa antes de abrir o WhatsApp.</p></div>
            <div className="grid gap-2 sm:grid-cols-3">{[['primeiro_contato','Primeiro contato'],['follow_up','Follow-up'],['retomar_interesse','Retomar interesse']].map(([value,label]) => <button key={value} type="button" onClick={() => setIntent(value)} className={`min-h-11 rounded-2xl border px-3 text-xs font-bold ${intent === value ? 'border-neutral-950 bg-neutral-950 text-white' : 'border-neutral-200 bg-white text-neutral-700'}`}>{label}</button>)}</div>
            <label className="block"><span className="mb-2 block text-xs font-semibold text-neutral-700">Orientação opcional para a IA</span><textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={4} maxLength={600} placeholder="Ex.: seja direto, mencione a entrega em BH e não fale de preço ainda." className="w-full resize-none rounded-[18px] border border-neutral-200 p-3.5 text-sm outline-none focus:border-neutral-950 focus:ring-4 focus:ring-neutral-950/5" /></label>
            <button type="button" disabled={loading || !digits} onClick={generate} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[18px] bg-neutral-950 px-4 text-sm font-bold text-white disabled:opacity-45">{loading ? <Loader2 size={16} className="animate-spin"/> : <Sparkles size={16}/>} {loading ? 'Raciocinando…' : 'Preparar mensagem com IA'}</button>
            {!digits && <p className="text-center text-xs font-medium text-red-600">Este contato não possui um WhatsApp válido.</p>}
          </div>}

          {step === 'review' && <div className="space-y-4">
            <div><h3 className="text-lg font-bold text-neutral-950">Revise antes de enviar</h3><p className="mt-1 text-sm text-neutral-600">Edite livremente. A IA sugere; a decisão e o tom final são seus.</p></div>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={9} className="w-full resize-none rounded-[18px] border border-neutral-200 p-4 text-sm leading-relaxed outline-none focus:border-neutral-950 focus:ring-4 focus:ring-neutral-950/5" />
            <div className="flex gap-2"><button type="button" onClick={generate} disabled={loading} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[18px] bg-neutral-100 px-3 text-xs font-bold text-neutral-800"><Sparkles size={14}/> Gerar outra</button><button type="button" onClick={() => setStep('prepare')} className="grid h-11 w-11 place-items-center rounded-[18px] bg-neutral-100" aria-label="Editar contexto"><PencilLine size={15}/></button></div>
            <button type="button" disabled={!message.trim()} onClick={() => setConfirmOpen(true)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[18px] bg-neutral-950 px-4 text-sm font-bold text-white disabled:opacity-45"><Send size={16}/> Continuar para o WhatsApp</button>
          </div>}

          {step === 'send' && <div className="space-y-5 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-[20px] bg-emerald-50 text-emerald-700"><MessageCircle size={24}/></div><div><h3 className="text-lg font-bold text-neutral-950">A mensagem foi aberta no WhatsApp</h3><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-neutral-600">Confirme somente depois de tocar em enviar no WhatsApp. Assim o histórico e o próximo follow-up ficam corretos.</p></div><button type="button" disabled={saving} onClick={() => progress('sent')} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[18px] bg-neutral-950 px-4 text-sm font-bold text-white">{saving ? <Loader2 size={16} className="animate-spin"/> : <Check size={16}/>} Já enviei a mensagem</button><button type="button" onClick={() => setStep('review')} className="min-h-11 w-full rounded-[18px] bg-neutral-100 px-4 text-sm font-bold text-neutral-700">Voltar e editar</button></div>}

          {step === 'progress' && <div className="space-y-4"><div><h3 className="text-lg font-bold text-neutral-950">Atualize a progressão</h3><p className="mt-1 text-sm text-neutral-600">Registre o que realmente aconteceu para manter a fila priorizada.</p></div>{[['replied','Respondeu','Mover para conversa ativa'],['negotiating','Em negociação','Há interesse, proposta ou pedido em construção'],['lost','Sem interesse','Encerrar esta oportunidade']].map(([action,title,desc]) => <button key={action} type="button" disabled={saving} onClick={() => progress(action as 'replied'|'negotiating'|'lost')} className="flex min-h-[64px] w-full items-center gap-3 rounded-[18px] border border-neutral-200 p-3 text-left hover:bg-neutral-50"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-neutral-100"><ArrowRight size={16}/></span><span className="min-w-0"><strong className="block text-sm text-neutral-950">{title}</strong><span className="mt-0.5 block text-xs text-neutral-500">{desc}</span></span></button>)}</div>}
        </div>

        {step !== 'prepare' && step !== 'progress' && <footer className="border-t border-neutral-200 px-4 py-3 sm:px-6"><button type="button" onClick={() => setStep('progress')} className="min-h-11 w-full rounded-[18px] text-xs font-bold text-neutral-600 hover:bg-neutral-100">Atualizar etapa sem enviar mensagem</button></footer>}
        {confirmOpen && <div className="absolute inset-0 z-10 flex items-end bg-black/35 p-3 sm:items-center sm:justify-center" onMouseDown={() => setConfirmOpen(false)}><div className="w-full rounded-[22px] bg-white p-5 shadow-2xl sm:max-w-sm" onMouseDown={(e) => e.stopPropagation()}><h4 className="text-base font-bold text-neutral-950">Abrir conversa no WhatsApp?</h4><p className="mt-2 text-sm leading-relaxed text-neutral-600">A mensagem será apenas preenchida. Revise no WhatsApp e toque em enviar por conta própria.</p><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => setConfirmOpen(false)} className="min-h-11 rounded-[18px] bg-neutral-100 text-sm font-bold text-neutral-700">Cancelar</button><button type="button" onClick={openWhatsApp} className="min-h-11 rounded-[18px] bg-neutral-950 text-sm font-bold text-white">Abrir WhatsApp</button></div></div></div>}
      </div>
    </div>
  )
}
