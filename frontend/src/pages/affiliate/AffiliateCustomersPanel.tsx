import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronDown, Copy, Crown, Loader2, MessageCircle, Phone,
  RefreshCw, ShoppingBag, Wallet,
} from 'lucide-react'
import { affiliateApi } from '@/lib/api-affiliate'
import type { AppContext } from '@/pages/affiliate/types'

type Customer = {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  customer_status: string
  first_purchase_at?: string | null
  last_purchase_at?: string | null
  total_revenue: number
  purchase_count: number
  average_ticket: number
  commission_total: number
  commission_pending: number
  source_label?: string
  city?: string | null
  region?: string | null
  next_action?: string
}

type Stats = {
  total?: number
  active?: number
  new_month?: number
  recurring?: number
  inactive?: number
  total_revenue?: number
  commission_total?: number
  commission_pending?: number
  average_ticket?: number
}

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'new', label: 'Novos' },
  { value: 'recurring', label: 'Recorrentes' },
  { value: 'inactive', label: 'Inativos' },
] as const

const STATUS_LABEL: Record<string, string> = {
  active: 'Cliente ativo',
  new: 'Novo cliente',
  recurring: 'Recorrente',
  inactive: 'Inativo',
  converted: 'Convertido',
}

const money = (v: number) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function dt(v?: string | null) {
  try {
    return new Date(v!).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
  } catch {
    return ''
  }
}

function waLink(phone?: string | null) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return null
  const n = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${n}`
}

export function AffiliateCustomersPanel({ ctx }: { ctx: AppContext }) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await affiliateApi.customers(1, 80, statusFilter === 'all' ? undefined : statusFilter)
      setCustomers(r.customers || [])
      setStats(r.stats || null)
    } catch {
      ctx.showToast('Erro ao carregar clientes', 'err')
    } finally {
      setLoading(false)
    }
  }, [ctx.showToast, statusFilter])

  useEffect(() => {
    void load()
  }, [load, ctx.cacheVersion])

  const greeting = useMemo(() => {
    const name = ctx.affiliate?.display_name || ctx.affiliate?.code || 'parceiro'
    return `${name}, aqui estão pessoas que já compraram ou geraram conversão válida.`
  }, [ctx.affiliate])

  function copyPhone(phone?: string | null) {
    const digits = String(phone || '').replace(/\D/g, '')
    if (!digits) return ctx.showToast('Sem telefone', 'err')
    navigator.clipboard.writeText(digits).then(
      () => ctx.showToast('Telefone copiado'),
      () => ctx.showToast('Não foi possível copiar', 'err'),
    )
  }

  if (loading && !customers.length) {
    return (
      <div className="space-y-3 pb-2">
        <div className="affiliate-skel h-20 w-full" />
        <div className="grid grid-cols-2 gap-2">
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
            <Crown size={18} style={{ color: ctx.primary }} />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm text-[#1c1c1e]">Clientes</p>
            <p className="text-xs text-[#636366] mt-1 leading-relaxed">{greeting}</p>
            <p className="text-[10px] text-[#8e8e93] mt-2 leading-relaxed">
              Foco em faturamento, recompra, pós-venda e comissões — separado dos contatos em aberto.
            </p>
          </div>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="affiliate-card affiliate-kpi p-3">
            <p className="affiliate-kpi__label">Clientes</p>
            <p className="affiliate-kpi__value text-lg">{stats.total ?? 0}</p>
            <p className="text-[10px] text-[#8e8e93]">{stats.active ?? 0} ativos</p>
          </div>
          <div className="affiliate-card affiliate-kpi p-3">
            <p className="affiliate-kpi__label">Faturamento</p>
            <p className="affiliate-kpi__value text-base">{money(stats.total_revenue ?? 0)}</p>
            <p className="text-[10px] text-[#8e8e93]">ticket {money(stats.average_ticket ?? 0)}</p>
          </div>
          <div className="affiliate-card affiliate-kpi p-3">
            <p className="affiliate-kpi__label">Comissões</p>
            <p className="affiliate-kpi__value text-base" style={{ color: '#059669' }}>{money(stats.commission_total ?? 0)}</p>
            <p className="text-[10px] text-[#8e8e93]">{money(stats.commission_pending ?? 0)} pendente</p>
          </div>
          <div className="affiliate-card affiliate-kpi p-3">
            <p className="affiliate-kpi__label">Recorrentes</p>
            <p className="affiliate-kpi__value text-lg">{stats.recurring ?? 0}</p>
            <p className="text-[10px] text-[#8e8e93]">{stats.new_month ?? 0} novos no mês</p>
          </div>
        </div>
      )}

      <div className="affiliate-hub__channel-pills flex flex-wrap gap-1.5 px-0.5">
        {STATUS_FILTERS.map((opt) => (
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

      {customers.length === 0 ? (
        <div className="affiliate-card p-8 text-center">
          <ShoppingBag size={28} className="mx-auto text-[#c7c7cc] mb-3" />
          <p className="font-bold text-sm text-[#1c1c1e]">Nenhum cliente ainda</p>
          <p className="text-xs text-[#8e8e93] mt-2 leading-relaxed max-w-xs mx-auto">
            Quando uma oportunidade converter em venda, o cliente aparece aqui com histórico e comissões.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {customers.map((customer) => {
            const expanded = expandedId === customer.id
            const link = waLink(customer.phone)
            const statusLabel = STATUS_LABEL[customer.customer_status] || customer.customer_status

            return (
              <li key={customer.id} className="affiliate-card overflow-hidden">
                <button
                  type="button"
                  className="w-full text-left p-4 flex items-start gap-3 active:bg-black/[0.02]"
                  onClick={() => setExpandedId(expanded ? null : customer.id)}
                >
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 grid place-items-center shrink-0 mt-0.5">
                    <Crown size={16} className="text-emerald-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-sm text-[#1c1c1e] truncate">{customer.name}</p>
                      <span className="text-[10px] font-bold uppercase tracking-wide shrink-0 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                        {statusLabel}
                      </span>
                    </div>
                    <p className="text-xs text-[#636366] mt-0.5">
                      {money(customer.total_revenue)} · {customer.purchase_count} compra(s)
                      {customer.source_label ? ` · ${customer.source_label}` : ''}
                    </p>
                    <p className="text-[11px] text-[#8e8e93] mt-1">
                      Última compra {dt(customer.last_purchase_at || customer.first_purchase_at)}
                    </p>
                  </div>
                  <ChevronDown size={16} className={`text-[#c7c7cc] shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>

                {expanded && (
                  <div className="px-4 pb-4 pt-0 border-t border-black/[0.04] space-y-3">
                    <div className="pt-3 grid grid-cols-2 gap-2 text-[11px]">
                      <div className="bg-[#f9f9fb] rounded-xl p-2.5">
                        <p className="text-[#8e8e93] font-semibold uppercase text-[9px]">Faturamento</p>
                        <p className="font-bold text-[#1c1c1e] mt-0.5">{money(customer.total_revenue)}</p>
                      </div>
                      <div className="bg-[#f9f9fb] rounded-xl p-2.5">
                        <p className="text-[#8e8e93] font-semibold uppercase text-[9px]">Comissão</p>
                        <p className="font-bold text-emerald-700 mt-0.5">{money(customer.commission_total)}</p>
                      </div>
                      <div className="bg-[#f9f9fb] rounded-xl p-2.5">
                        <p className="text-[#8e8e93] font-semibold uppercase text-[9px]">Ticket médio</p>
                        <p className="font-bold text-[#1c1c1e] mt-0.5">{money(customer.average_ticket)}</p>
                      </div>
                      <div className="bg-[#f9f9fb] rounded-xl p-2.5">
                        <p className="text-[#8e8e93] font-semibold uppercase text-[9px]">Próxima ação</p>
                        <p className="font-bold text-[#1c1c1e] mt-0.5 leading-snug">{customer.next_action || 'Pós-venda'}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {customer.phone && (
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
                          <button type="button" className="affiliate-hub__channel-pill text-[11px]" onClick={() => copyPhone(customer.phone)}>
                            <Copy size={12} className="inline mr-1" />
                            Copiar tel.
                          </button>
                        </>
                      )}
                      {!customer.phone && (
                        <span className="text-[11px] text-[#8e8e93] flex items-center gap-1">
                          <Phone size={12} /> Sem telefone
                        </span>
                      )}
                    </div>

                    <div className="rounded-xl border border-dashed border-[#e5e5ea] p-3 space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#8e8e93]">Automações (em breve)</p>
                      {['Pós-venda automático', 'Lembrete de recompra', 'Pedido de avaliação'].map((label) => (
                        <div key={label} className="flex items-center justify-between text-xs text-[#636366]">
                          <span>{label}</span>
                          <span className="text-[10px] text-[#c7c7cc] font-semibold">Em breve</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="text-[11px] font-bold px-3 py-2 rounded-lg border border-[#e5e5ea] flex items-center gap-1 active:opacity-70">
                        <RefreshCw size={12} /> Agendar pós-venda
                      </button>
                      <button type="button" className="text-[11px] font-bold px-3 py-2 rounded-lg border border-[#e5e5ea] flex items-center gap-1 active:opacity-70">
                        <Wallet size={12} /> Ver comissões
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