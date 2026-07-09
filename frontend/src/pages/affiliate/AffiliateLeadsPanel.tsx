import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Users, Phone, MessageCircle, Copy, Loader2, ChevronDown,
  ShoppingBag, Calendar, Sparkles, CheckCircle2,
} from 'lucide-react'
import { affiliateApi } from '@/lib/api-affiliate'
import type { AppContext } from '@/pages/affiliate/types'

type LeadRow = {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  source_type: string
  cta_type?: string | null
  product_name?: string | null
  has_order?: boolean
  message?: string | null
  status: string
  notes?: string | null
  created_at?: string
  updated_at?: string
}

type LeadStats = {
  total: number
  new: number
  contacted: number
  negotiating: number
  converted: number
  lost: number
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'new', label: 'Novos' },
  { value: 'contacted', label: 'Contatados' },
  { value: 'negotiating', label: 'Em negociação' },
  { value: 'converted', label: 'Convertidos' },
  { value: 'lost', label: 'Perdidos' },
] as const

const STATUS_LABEL: Record<string, string> = {
  new: 'Novo',
  contacted: 'Contatado',
  negotiating: 'Em negociação',
  converted: 'Convertido',
  lost: 'Perdido',
}

const SOURCE_LABEL: Record<string, string> = {
  capture: 'Interesse',
  checkout: 'Pedido',
  booking: 'Agendamento',
}

const CTA_LABEL: Record<string, string> = {
  quote: 'Orçamento',
  schedule: 'Agendamento',
  visit: 'Visita',
  simulate: 'Simulação',
  subscribe: 'Assinatura',
  custom: 'Contato',
  whatsapp: 'WhatsApp',
}

function dt(v?: string) {
  try {
    return new Date(v!).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function waLink(phone?: string | null, text?: string) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return null
  const normalized = digits.startsWith('55') ? digits : `55${digits}`
  const qs = text ? `?text=${encodeURIComponent(text)}` : ''
  return `https://wa.me/${normalized}${qs}`
}

export function AffiliateLeadsPanel({ ctx }: { ctx: AppContext }) {
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [stats, setStats] = useState<LeadStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await affiliateApi.leads(1, 80, statusFilter === 'all' ? undefined : statusFilter)
      setLeads(r.leads || [])
      setStats(r.stats || null)
    } catch {
      ctx.showToast('Erro ao carregar contatos', 'err')
    } finally {
      setLoading(false)
    }
  }, [ctx.showToast, statusFilter])

  useEffect(() => {
    void load()
  }, [load, ctx.cacheVersion])

  const greeting = useMemo(() => {
    const name = ctx.affiliate?.display_name || ctx.affiliate?.code || 'parceiro'
    return `Contatos gerados pelos seus links e divulgação, ${name}.`
  }, [ctx.affiliate])

  async function updateStatus(lead: LeadRow, status: string) {
    setSavingId(lead.id)
    try {
      const r = await affiliateApi.updateLead(lead.id, { status })
      const updated = r.lead as LeadRow
      setLeads((prev) => prev.map((row) => (row.id === lead.id ? { ...row, ...updated } : row)))
      setStats((prev) => {
        if (!prev) return prev
        const next = { ...prev }
        const old = lead.status
        if (old in next) (next as Record<string, number>)[old] = Math.max(0, (next as Record<string, number>)[old] - 1)
        if (status in next) (next as Record<string, number>)[status] = ((next as Record<string, number>)[status] || 0) + 1
        return next
      })
      ctx.showToast('Status atualizado')
    } catch (e: unknown) {
      ctx.showToast(e instanceof Error ? e.message : 'Erro ao salvar', 'err')
    } finally {
      setSavingId(null)
    }
  }

  async function saveNotes(lead: LeadRow) {
    const notes = noteDrafts[lead.id] ?? lead.notes ?? ''
    setSavingId(lead.id)
    try {
      const r = await affiliateApi.updateLead(lead.id, { notes })
      const updated = r.lead as LeadRow
      setLeads((prev) => prev.map((row) => (row.id === lead.id ? { ...row, ...updated } : row)))
      ctx.showToast('Anotação salva')
    } catch (e: unknown) {
      ctx.showToast(e instanceof Error ? e.message : 'Erro ao salvar', 'err')
    } finally {
      setSavingId(null)
    }
  }

  function copyPhone(phone?: string | null) {
    const digits = String(phone || '').replace(/\D/g, '')
    if (!digits) return ctx.showToast('Sem telefone cadastrado', 'err')
    navigator.clipboard.writeText(digits).then(
      () => ctx.showToast('Telefone copiado'),
      () => ctx.showToast('Não foi possível copiar', 'err'),
    )
  }

  if (loading && !leads.length) {
    return (
      <div className="space-y-3 pb-2">
        <div className="affiliate-skel h-16 w-full" />
        <div className="affiliate-skel h-24 w-full" />
        <div className="affiliate-skel h-24 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-3 pb-4 min-w-0">
      <div className="affiliate-card p-4">
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl grid place-items-center shrink-0"
            style={{ backgroundColor: `${ctx.primary}14` }}
          >
            <Users size={18} style={{ color: ctx.primary }} />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm text-[#1c1c1e]">Meus contatos</p>
            <p className="text-xs text-[#636366] mt-1 leading-relaxed">{greeting}</p>
            <p className="text-[10px] text-[#8e8e93] mt-2 leading-relaxed">
              Você vê só nome, telefone e interesse — sem dados internos da loja.
            </p>
          </div>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <div className="affiliate-card affiliate-kpi p-3">
            <p className="affiliate-kpi__label">Total</p>
            <p className="affiliate-kpi__value text-lg">{stats.total}</p>
          </div>
          <div className="affiliate-card affiliate-kpi p-3">
            <p className="affiliate-kpi__label">Novos</p>
            <p className="affiliate-kpi__value text-lg" style={{ color: '#2563eb' }}>{stats.new}</p>
          </div>
          <div className="affiliate-card affiliate-kpi p-3">
            <p className="affiliate-kpi__label">Convertidos</p>
            <p className="affiliate-kpi__value text-lg" style={{ color: '#059669' }}>{stats.converted}</p>
          </div>
        </div>
      )}

      <div className="affiliate-hub__channel-pills flex flex-wrap gap-1.5 px-0.5">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`affiliate-hub__channel-pill${statusFilter === opt.value ? ' affiliate-hub__channel-pill--on' : ''}`}
            style={statusFilter === opt.value ? { backgroundColor: `${ctx.primary}18`, color: ctx.primary } : undefined}
            onClick={() => setStatusFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {leads.length === 0 ? (
        <div className="affiliate-card p-8 text-center">
          <Sparkles size={28} className="mx-auto text-[#c7c7cc] mb-3" />
          <p className="font-bold text-sm text-[#1c1c1e]">Nenhum contato ainda</p>
          <p className="text-xs text-[#8e8e93] mt-2 leading-relaxed max-w-xs mx-auto">
            Quando alguém demonstrar interesse ou comprar pelo seu link, o contato aparece aqui para você acompanhar e disparar mensagens.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {leads.map((lead) => {
            const expanded = expandedId === lead.id
            const busy = savingId === lead.id
            const link = waLink(
              lead.phone,
              lead.product_name
                ? `Olá ${lead.name}, vi seu interesse em ${lead.product_name}. Posso te ajudar?`
                : `Olá ${lead.name}, tudo bem? Posso te ajudar com sua solicitação.`,
            )
            const SourceIcon = lead.source_type === 'checkout' ? ShoppingBag : lead.source_type === 'booking' ? Calendar : Sparkles

            return (
              <li key={lead.id} className="affiliate-card overflow-hidden">
                <button
                  type="button"
                  className="w-full text-left p-4 flex items-start gap-3 active:bg-black/[0.02]"
                  onClick={() => setExpandedId(expanded ? null : lead.id)}
                >
                  <div
                    className="w-9 h-9 rounded-xl grid place-items-center shrink-0 mt-0.5"
                    style={{ backgroundColor: `${ctx.primary}10` }}
                  >
                    <SourceIcon size={16} style={{ color: ctx.primary }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-sm text-[#1c1c1e] truncate">{lead.name}</p>
                      <span
                        className="text-[10px] font-bold uppercase tracking-wide shrink-0 px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: lead.status === 'converted' ? '#d1fae5' : lead.status === 'new' ? '#dbeafe' : '#f3f4f6',
                          color: lead.status === 'converted' ? '#047857' : lead.status === 'new' ? '#1d4ed8' : '#6b7280',
                        }}
                      >
                        {STATUS_LABEL[lead.status] || lead.status}
                      </span>
                    </div>
                    <p className="text-xs text-[#636366] mt-0.5">
                      {SOURCE_LABEL[lead.source_type] || lead.source_type}
                      {lead.cta_type ? ` · ${CTA_LABEL[lead.cta_type] || lead.cta_type}` : ''}
                      {lead.product_name ? ` · ${lead.product_name}` : ''}
                    </p>
                    <p className="text-[11px] text-[#8e8e93] mt-1">{dt(lead.updated_at || lead.created_at)}</p>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`text-[#c7c7cc] shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
                  />
                </button>

                {expanded && (
                  <div className="px-4 pb-4 pt-0 border-t border-black/[0.04] space-y-3">
                    <div className="flex flex-wrap gap-2 pt-3">
                      {lead.phone && (
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
                          <button
                            type="button"
                            className="affiliate-hub__channel-pill text-[11px]"
                            onClick={() => copyPhone(lead.phone)}
                          >
                            <Copy size={12} className="inline mr-1" />
                            Copiar tel.
                          </button>
                        </>
                      )}
                      {lead.email && (
                        <span className="text-[11px] text-[#636366] flex items-center gap-1 px-2 py-1 bg-[#f2f2f7] rounded-full truncate max-w-full">
                          {lead.email}
                        </span>
                      )}
                      {!lead.phone && !lead.email && (
                        <span className="text-[11px] text-[#8e8e93] flex items-center gap-1">
                          <Phone size={12} /> Sem telefone — aguarde retorno pela loja
                        </span>
                      )}
                    </div>

                    {lead.message && (
                      <p className="text-xs text-[#636366] bg-[#f9f9fb] rounded-xl p-3 leading-relaxed whitespace-pre-wrap">
                        {lead.message}
                      </p>
                    )}

                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#8e8e93] mb-2">Status</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(['new', 'contacted', 'negotiating', 'converted', 'lost'] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            disabled={busy}
                            className={`affiliate-hub__channel-pill text-[10px]${lead.status === st ? ' affiliate-hub__channel-pill--on' : ''}`}
                            style={lead.status === st ? { backgroundColor: `${ctx.primary}18`, color: ctx.primary } : undefined}
                            onClick={() => updateStatus(lead, st)}
                          >
                            {busy && lead.status !== st ? null : lead.status === st ? <CheckCircle2 size={10} className="inline mr-0.5" /> : null}
                            {STATUS_LABEL[st]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#8e8e93] mb-2">Sua anotação</p>
                      <textarea
                        className="w-full text-xs rounded-xl border border-[#e5e5ea] p-3 min-h-[72px] resize-y"
                        placeholder="Ex: liguei, pediu desconto, retorno amanhã…"
                        value={noteDrafts[lead.id] ?? lead.notes ?? ''}
                        onChange={(e) => setNoteDrafts((d) => ({ ...d, [lead.id]: e.target.value }))}
                      />
                      <button
                        type="button"
                        disabled={busy}
                        className="mt-2 text-xs font-bold px-3 py-2 rounded-lg active:opacity-70 disabled:opacity-50"
                        style={{ color: ctx.primary }}
                        onClick={() => saveNotes(lead)}
                      >
                        {busy ? <Loader2 size={12} className="inline animate-spin mr-1" /> : null}
                        Salvar anotação
                      </button>
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