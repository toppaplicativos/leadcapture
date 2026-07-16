import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Activity, ArrowUpRight, BadgeDollarSign, Ban, BarChart3, CheckCircle2,
  Copy, Crown, ExternalLink, KeyRound, Mail, MessageCircle, Phone, Receipt,
  RotateCcw, ShieldCheck, ShoppingBag, Trash2, UserCheck, Wallet, X,
} from 'lucide-react'
import { getHeaders } from '@/lib/admin/helpers'
import {
  COMMISSION_MODE_OPTIONS, commissionValueLabel, formatCommissionShort,
  normalizeCommissionMode, type CommissionMode,
} from '@/lib/affiliate-commission'

type Tab = 'overview' | 'sales' | 'activity' | 'access'

const money = (value: unknown) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const date = (value: unknown) => value ? new Date(String(value)).toLocaleDateString('pt-BR') : '—'

export function AffiliateAccessManageModal({
  credential, brandSlug, sales = [], payouts = [], ranking = 0, onClose, onChanged, showToast,
}: {
  credential: any
  brandSlug: string
  sales?: any[]
  payouts?: any[]
  ranking?: number
  onClose: () => void
  onChanged: () => void
  showToast: (t: string, tp?: 'ok' | 'err') => void
}) {
  const [tab, setTab] = useState<Tab>('overview')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const inherited = credential.effective_commission_source !== 'affiliate'
  const [customCommission, setCustomCommission] = useState(!inherited)
  const [commissionMode, setCommissionMode] = useState<CommissionMode>(normalizeCommissionMode(
    credential.effective_commission_mode || credential.program_commission_mode || credential.commission_mode,
  ))
  const [commissionValue, setCommissionValue] = useState(Number(
    credential.effective_commission_value ?? credential.program_commission_value ?? credential.commission_value ?? 0,
  ))

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', close)
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', close) }
  }, [onClose])

  const affiliateSales = useMemo(() => sales.filter((item) => String(item.affiliate_id) === String(credential.affiliate_id)), [sales, credential.affiliate_id])
  const affiliatePayouts = useMemo(() => payouts.filter((item) => String(item.affiliate_id) === String(credential.affiliate_id)), [payouts, credential.affiliate_id])
  const pending = affiliateSales.filter((item) => item.commission_status === 'pending').reduce((sum, item) => sum + Number(item.commission_amount || 0), 0)
  const paid = affiliatePayouts.filter((item) => item.status === 'paid').reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const name = credential.display_name || credential.affiliate_name || 'Afiliado'
  const initials = name.split(/\s+/).slice(0, 2).map((part: string) => part[0]).join('').toUpperCase()
  const link = credential.code ? `${window.location.origin}/afiliado/${credential.code}` : ''
  const appUrl = brandSlug ? `/central-afiliado/${encodeURIComponent(brandSlug)}` : '/central-afiliado'
  const effective = formatCommissionShort(commissionMode, commissionValue)

  async function request(url: string, method: 'PATCH' | 'DELETE', body?: object, success = 'Atualizado') {
    setSaving(true)
    try {
      const response = await fetch(url, { method, headers: getHeaders(), body: body ? JSON.stringify(body) : undefined })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Não foi possível concluir')
      showToast(success)
      onChanged()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível concluir', 'err')
    } finally { setSaving(false) }
  }

  function saveCommission() {
    if (!credential.affiliate_id) return showToast('Perfil de afiliado não encontrado', 'err')
    return request(`/api/affiliates/${credential.affiliate_id}/commission`, 'PATCH', customCommission
      ? { commission_mode: commissionMode, commission_value: commissionValue }
      : { inherit: true }, customCommission ? 'Comissão personalizada salva' : 'Regra do programa restaurada')
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
    { id: 'overview', label: 'Visão geral', icon: BarChart3 },
    { id: 'sales', label: 'Vendas e saldo', icon: ShoppingBag },
    { id: 'activity', label: 'Atividades', icon: Activity },
    { id: 'access', label: 'Acesso', icon: ShieldCheck },
  ]

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-slate-950/55 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="affiliate-title" className="flex h-[96dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-[#f7f8fa] shadow-2xl sm:h-[min(820px,92vh)] sm:max-w-6xl sm:rounded-[28px]">
        <header className="shrink-0 border-b border-slate-200/80 bg-white px-4 pb-0 pt-4 sm:px-7 sm:pt-6">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--brand-primary)] text-sm font-extrabold text-white shadow-sm">{initials}</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="affiliate-title" className="truncate text-lg font-bold tracking-tight text-slate-950 sm:text-xl">{name}</h2>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${credential.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {credential.status === 'pending' ? 'Aguardando aprovação' : credential.is_active ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500">{credential.email}{credential.program_name ? ` · ${credential.program_name}` : ''}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <a href={`mailto:${credential.email}`} title="Enviar e-mail" className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]"><Mail size={16} /></a>
              {credential.affiliate_phone && <a href={`https://wa.me/${String(credential.affiliate_phone).replace(/\D/g, '')}`} target="_blank" rel="noreferrer" title="Conversar no WhatsApp" className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-emerald-500 hover:text-emerald-600"><MessageCircle size={16} /></a>}
              <button onClick={onClose} aria-label="Fechar" className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"><X size={19} /></button>
            </div>
          </div>
          <nav className="mt-4 flex gap-1 overflow-x-auto" aria-label="Detalhes do afiliado">
            {tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-semibold transition ${tab === id ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}><Icon size={14} />{label}</button>)}
          </nav>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-7">
          {tab === 'overview' && <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Cliques', credential.total_clicks || 0, BarChart3], ['Vendas', credential.total_sales || 0, ShoppingBag],
                  ['Comissões', money(credential.total_commission), BadgeDollarSign], ['Ranking', ranking ? `${ranking}º` : '—', Crown],
                ].map(([label, value, Icon]: any) => <div key={label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"><Icon size={17} className="mb-3 text-[var(--brand-primary)]"/><p className="text-[11px] font-semibold text-slate-500">{label}</p><p className="mt-1 text-lg font-bold tabular-nums text-slate-950">{value}</p></div>)}
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold text-slate-900">Regra de comissão</p><p className="mt-1 text-xs text-slate-500">A regra do programa é herdada até existir uma personalização individual.</p></div><span className="rounded-full bg-[color-mix(in_srgb,var(--brand-primary)_10%,white)] px-3 py-1.5 text-xs font-bold text-[var(--brand-primary)]">{effective}</span></div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button onClick={() => { setCustomCommission(false); setCommissionMode(normalizeCommissionMode(credential.program_commission_mode || credential.effective_commission_mode)); setCommissionValue(Number(credential.program_commission_value ?? credential.effective_commission_value ?? 0)) }} className={`rounded-xl border p-3 text-left ${!customCommission ? 'border-[var(--brand-primary)] bg-[color-mix(in_srgb,var(--brand-primary)_6%,white)]' : 'border-slate-200'}`}><span className="block text-xs font-bold text-slate-900">Usar regra do programa</span><span className="mt-1 block text-[11px] text-slate-500">{credential.program_name || 'Programa principal'} · {formatCommissionShort(normalizeCommissionMode(credential.program_commission_mode || credential.effective_commission_mode), Number(credential.program_commission_value ?? credential.effective_commission_value ?? 0))}</span></button>
                  <button onClick={() => setCustomCommission(true)} className={`rounded-xl border p-3 text-left ${customCommission ? 'border-[var(--brand-primary)] bg-[color-mix(in_srgb,var(--brand-primary)_6%,white)]' : 'border-slate-200'}`}><span className="block text-xs font-bold text-slate-900">Personalizar para este afiliado</span><span className="mt-1 block text-[11px] text-slate-500">Substitui somente a regra deste perfil.</span></button>
                </div>
                {customCommission && <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-700">Modelo<select value={commissionMode} onChange={(e) => setCommissionMode(normalizeCommissionMode(e.target.value))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[var(--brand-primary)]">{COMMISSION_MODE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="text-xs font-semibold text-slate-700">{commissionValueLabel(commissionMode)}<input type="number" min="0" max={commissionMode === 'percentage' ? 100 : undefined} step="0.01" value={commissionValue} onChange={(e) => setCommissionValue(Number(e.target.value))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[var(--brand-primary)]" /></label></div>}
                <button onClick={saveCommission} disabled={saving} className="mt-4 h-10 rounded-xl bg-[var(--brand-primary)] px-4 text-xs font-bold text-white shadow-sm hover:brightness-95 disabled:opacity-50">{customCommission ? 'Salvar personalização' : 'Confirmar regra do programa'}</button>
              </div>
            </div>
            <aside className="space-y-4">
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-900">Comunicação e suporte</p><div className="mt-4 space-y-2"><a href={`mailto:${credential.email}`} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"><Mail size={16}/><span className="min-w-0 flex-1 truncate">{credential.email}</span><ArrowUpRight size={14}/></a>{credential.affiliate_phone ? <a href={`tel:${credential.affiliate_phone}`} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"><Phone size={16}/><span className="flex-1">{credential.affiliate_phone}</span><ArrowUpRight size={14}/></a> : <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Telefone ainda não informado.</p>}</div></div>
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-900">Identificação</p><dl className="mt-4 space-y-3 text-xs"><div className="flex justify-between gap-4"><dt className="text-slate-500">Cupom</dt><dd className="font-bold tracking-wide text-slate-900">{credential.coupon_code || '—'}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Cadastro</dt><dd className="font-semibold text-slate-700">{date(credential.created_at)}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Última atualização</dt><dd className="font-semibold text-slate-700">{date(credential.updated_at)}</dd></div></dl></div>
            </aside>
          </div>}

          {tab === 'sales' && <div className="space-y-4"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Gerado', money(credential.total_commission), BadgeDollarSign], ['Pendente', money(pending), Receipt], ['Já pago', money(paid), CheckCircle2], ['Saques', affiliatePayouts.length, Wallet]].map(([label, value, Icon]: any) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4"><Icon size={17} className="mb-3 text-[var(--brand-primary)]"/><p className="text-[11px] text-slate-500">{label}</p><p className="mt-1 text-lg font-bold text-slate-950">{value}</p></div>)}</div><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 p-4"><h3 className="text-sm font-bold text-slate-900">Histórico de vendas</h3></div>{affiliateSales.length ? <div className="divide-y divide-slate-100">{affiliateSales.slice(0, 30).map((item) => <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3 p-4 text-xs"><div><p className="font-semibold text-slate-900">Pedido {item.order_id || item.id}</p><p className="mt-1 text-slate-500">{date(item.created_at)} · {item.order_status || 'registrado'}</p></div><div className="text-right"><p className="font-bold text-slate-900">{money(item.order_total)}</p><p className="mt-1 text-emerald-700">+ {money(item.commission_amount)}</p></div></div>)}</div> : <Empty text="Nenhuma venda atribuída a este afiliado." />}</div></div>}

          {tab === 'activity' && <div className="rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 p-5"><h3 className="text-sm font-bold text-slate-900">Linha do tempo</h3><p className="mt-1 text-xs text-slate-500">Movimentações reais registradas para este afiliado.</p></div>{affiliateSales.length || affiliatePayouts.length ? <div className="divide-y divide-slate-100">{[...affiliateSales.map((item) => ({...item, kind:'sale'})), ...affiliatePayouts.map((item) => ({...item, kind:'payout'}))].sort((a,b) => +new Date(b.created_at)-+new Date(a.created_at)).slice(0,40).map((item) => <div key={`${item.kind}-${item.id}`} className="flex gap-3 p-4"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">{item.kind === 'sale' ? <ShoppingBag size={16}/> : <Wallet size={16}/>}</div><div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-900">{item.kind === 'sale' ? `Venda ${money(item.order_total)}` : `Saque ${money(item.amount)}`}</p><p className="mt-1 text-[11px] text-slate-500">{date(item.created_at)} · {item.kind === 'sale' ? item.commission_status : item.status}</p></div></div>)}</div> : <Empty text="As vendas, comissões e saques aparecerão aqui em ordem cronológica." />}</div>}

          {tab === 'access' && <div className="grid gap-4 lg:grid-cols-2"><div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"><div><h3 className="text-sm font-bold text-slate-900">Central e divulgação</h3><p className="mt-1 text-xs text-slate-500">Acessos usados pelo afiliado para operar e divulgar.</p></div>{link && <button onClick={() => navigator.clipboard.writeText(link).then(() => showToast('Link copiado'))} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"><Copy size={16}/><span className="min-w-0 flex-1 truncate">{link}</span></button>}<a href={appUrl} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand-primary)] px-4 py-3 text-xs font-bold text-white"><ExternalLink size={15}/>Abrir Central do Afiliado</a></div><div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"><div><h3 className="text-sm font-bold text-slate-900">Senha e segurança</h3><p className="mt-1 text-xs text-slate-500">Defina uma nova senha temporária para este acesso.</p></div><div className="flex gap-2"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo de 6 caracteres" className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[var(--brand-primary)]"/><button disabled={saving || password.length < 6} onClick={() => request(`/api/auth/affiliate-access/${credential.id}/password`, 'PATCH', { password }, 'Senha alterada')} className="flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white disabled:opacity-40"><KeyRound size={15}/>Salvar</button></div></div><div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-bold text-slate-900">Status do acesso</h3><div className="mt-4 flex flex-wrap gap-2">{credential.status === 'pending' && <button disabled={saving} onClick={() => request(`/api/affiliates/${credential.affiliate_id}/approve`, 'PATCH', undefined, 'Afiliado aprovado')} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white"><UserCheck size={15}/>Aprovar cadastro</button>}{credential.is_active ? <button disabled={saving} onClick={() => request(`/api/auth/affiliate-access/${credential.id}/deactivate`, 'PATCH', undefined, 'Acesso pausado')} className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-800"><Ban size={15}/>Pausar acesso</button> : <button disabled={saving} onClick={() => request(`/api/auth/affiliate-access/${credential.id}/reactivate`, 'PATCH', undefined, 'Acesso reativado')} className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800"><RotateCcw size={15}/>Reativar acesso</button>}<button disabled={saving} onClick={() => confirm(`Remover permanentemente o acesso de ${name}?`) && request(`/api/auth/affiliate-access/${credential.id}`, 'DELETE', undefined, 'Afiliado removido')} className="ml-auto flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50"><Trash2 size={15}/>Remover afiliado</button></div></div></div>}
        </main>
      </section>
    </div>,
    document.body,
  )
}

function Empty({ text }: { text: string }) {
  return <div className="grid min-h-44 place-items-center p-8 text-center"><div><Receipt size={24} className="mx-auto text-slate-300"/><p className="mt-3 max-w-sm text-xs text-slate-500">{text}</p></div></div>
}
