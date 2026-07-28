import { useEffect, useState } from 'react'
import { AlertCircle, ArrowDownToLine, ArrowUpFromLine, BadgeCheck, Box, CheckCircle2, Clock3, PackageCheck, RefreshCw, Settings2, ShoppingCart, Truck, UserRound } from 'lucide-react'
import { stockApi } from '@/lib/api-admin'
import type { ShowToast } from '../types'

type AuditItem = { id: string; action: string; entity_id?: string; success: boolean; created_at: string }
type Identity = {
  user?: { id?: string; name?: string; email?: string; phone?: string; last_login_at?: string }
  brand?: { name?: string; logo_url?: string }
}

const actions: Record<string, { label: string; icon: typeof Box; tone: string }> = {
  pos_sale_created: { label: 'Venda concluída no PDV', icon: ShoppingCart, tone: 'bg-emerald-50 text-emerald-700' },
  stock_added: { label: 'Entrada registrada', icon: ArrowDownToLine, tone: 'bg-blue-50 text-blue-700' },
  stock_removed: { label: 'Saída registrada', icon: ArrowUpFromLine, tone: 'bg-amber-50 text-amber-700' },
  stock_adjusted: { label: 'Saldo ajustado', icon: Settings2, tone: 'bg-violet-50 text-violet-700' },
  stock_settings_updated: { label: 'Parâmetros de estoque alterados', icon: Settings2, tone: 'bg-violet-50 text-violet-700' },
  catalog_synced: { label: 'Catálogo sincronizado', icon: RefreshCw, tone: 'bg-sky-50 text-sky-700' },
  expedition_updated: { label: 'Expedição atualizada', icon: PackageCheck, tone: 'bg-indigo-50 text-indigo-700' },
  delivery_requested: { label: 'Entrega solicitada', icon: Truck, tone: 'bg-indigo-50 text-indigo-700' },
  product_updated: { label: 'Produto atualizado', icon: Box, tone: 'bg-gray-100 text-gray-700' },
  client_created: { label: 'Cliente cadastrado', icon: UserRound, tone: 'bg-cyan-50 text-cyan-700' },
  client_updated: { label: 'Cliente atualizado', icon: UserRound, tone: 'bg-cyan-50 text-cyan-700' },
  client_status_updated: { label: 'Status do cliente atualizado', icon: UserRound, tone: 'bg-cyan-50 text-cyan-700' },
  client_deleted: { label: 'Cliente removido', icon: UserRound, tone: 'bg-red-50 text-red-700' },
}

function initials(name?: string, email?: string) {
  const parts = String(name || email || 'GE').trim().split(/\s+/).filter(Boolean)
  return `${parts[0]?.[0] || 'G'}${parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : ''}`.toUpperCase()
}

function dateLabel(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date)
}

export function ProfileView({
  showToast,
  manufacturingEnabled = false,
  onManufacturingChange,
}: {
  showToast: ShowToast
  manufacturingEnabled?: boolean
  onManufacturingChange?: (enabled: boolean) => void
}) {
  const [identity, setIdentity] = useState<Identity>({})
  const [items, setItems] = useState<AuditItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [changingOperation, setChangingOperation] = useState(false)

  async function toggleManufacturing() {
    setChangingOperation(true)
    try {
      const result = await stockApi.updateManufacturingSettings({
        enabled: !manufacturingEnabled,
        track_lots: true,
        base_weight_unit: 'kg',
      })
      const enabled = result.settings?.enabled === true
      onManufacturingChange?.(enabled)
      showToast(enabled ? 'Produção e lotes ativados' : 'Produção ocultada do app')
    } catch (e: any) {
      showToast(e?.message || 'Não foi possível alterar o tipo de operação', 'error')
    } finally {
      setChangingOperation(false)
    }
  }

  async function load() {
    setLoading(true)
    setError(false)
    try {
      const [me, activity] = await Promise.all([stockApi.me(), stockApi.audit(50)])
      setIdentity(me || {})
      setItems(activity.items || [])
    } catch (e: any) {
      setError(true)
      showToast(e?.message || 'Não foi possível carregar sua conta', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  if (loading) return <div className="space-y-3 animate-pulse" aria-label="Carregando perfil"><div className="h-48 rounded-[24px] bg-gray-100" /><div className="h-72 rounded-[24px] bg-gray-100" /></div>

  if (error) return (
    <div className="rounded-[24px] border border-red-100 bg-white p-6 text-center">
      <AlertCircle className="mx-auto text-red-500" size={28} />
      <h2 className="mt-3 text-base font-semibold text-gray-900">Sua conta não carregou</h2>
      <button onClick={() => void load()} className="mt-4 h-11 w-full rounded-xl bg-gray-900 text-sm font-semibold text-white">Tentar novamente</button>
    </div>
  )

  const manager = identity.user || {}
  const brand = identity.brand || {}
  return (
    <section className="space-y-4">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Conta operacional</p><h1 className="mt-1 text-[24px] font-bold tracking-tight text-gray-950">Meu perfil</h1></div>

      <article className="overflow-hidden rounded-[24px] bg-gray-950 p-5 text-white shadow-sm">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/10 text-lg font-bold ring-1 ring-white/15">{initials(manager.name, manager.email)}</div>
          <div className="min-w-0 flex-1"><h2 className="truncate text-lg font-bold tracking-tight">{manager.name || 'Gerente de estoque'}</h2><p className="mt-0.5 truncate text-sm text-white/60">{manager.email || 'E-mail não informado'}</p></div>
          <BadgeCheck size={22} className="shrink-0 text-emerald-400" aria-label="Acesso verificado" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/[0.07] px-3 py-3 ring-1 ring-white/10"><p className="text-[10px] font-semibold uppercase tracking-wider text-white/45">Unidade ativa</p><p className="mt-1 truncate text-sm font-semibold">{brand.name || 'Estoque'}</p></div>
          <div className="rounded-2xl bg-white/[0.07] px-3 py-3 ring-1 ring-white/10"><p className="text-[10px] font-semibold uppercase tracking-wider text-white/45">Último acesso</p><p className="mt-1 truncate text-sm font-semibold">{dateLabel(manager.last_login_at)}</p></div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs font-medium text-emerald-300"><CheckCircle2 size={14} /> Sessão identificada e auditada</div>
      </article>

      <article className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${manufacturingEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}><Settings2 size={18} /></span>
          <div className="min-w-0 flex-1"><h2 className="text-base font-bold tracking-tight text-gray-950">Tipo de operação</h2><p className="mt-1 text-xs leading-5 text-gray-500">{manufacturingEnabled ? 'Produção por lotes ativa: matéria-prima, transformação, quebra e rendimento.' : 'Ative somente se esta unidade transforma matéria-prima em produtos finais.'}</p></div>
        </div>
        <button type="button" disabled={changingOperation} onClick={toggleManufacturing} className={`mt-4 min-h-11 w-full rounded-xl border px-4 text-sm font-semibold disabled:opacity-50 ${manufacturingEnabled ? 'border-gray-200 text-gray-700' : 'border-gray-950 bg-gray-950 text-white'}`}>
          {changingOperation ? 'Atualizando…' : manufacturingEnabled ? 'Ocultar módulo de produção' : 'Ativar produção e rastreabilidade'}
        </button>
      </article>

      <article className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3 px-1 pb-3">
          <div><h2 className="text-base font-bold tracking-tight text-gray-950">Atividade recente</h2><p className="mt-0.5 text-xs leading-5 text-gray-500">Ações registradas com sua identidade nesta unidade.</p></div>
          <button onClick={() => void load()} aria-label="Atualizar atividade" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-50 text-gray-500 active:scale-95"><RefreshCw size={16} /></button>
        </div>
        {items.length === 0 ? (
          <div className="rounded-2xl bg-gray-50 px-5 py-8 text-center"><Clock3 className="mx-auto text-gray-300" size={26} /><p className="mt-3 text-sm font-semibold text-gray-800">Nenhuma ação registrada ainda</p><p className="mt-1 text-xs leading-5 text-gray-500">As próximas movimentações aparecerão aqui automaticamente.</p></div>
        ) : (
          <div className="divide-y divide-gray-100">{items.map((item) => {
            const detail = actions[item.action] || { label: 'Operação atualizada', icon: Box, tone: 'bg-gray-100 text-gray-700' }
            const Icon = detail.icon
            return <div key={item.id} className="flex gap-3 py-3.5 first:pt-1 last:pb-1"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${item.success ? detail.tone : 'bg-red-50 text-red-600'}`}>{item.success ? <Icon size={17} /> : <AlertCircle size={17} />}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold leading-5 text-gray-900">{item.success ? detail.label : `${detail.label} não concluída`}</p><p className="mt-0.5 text-xs text-gray-500">{dateLabel(item.created_at)}{item.entity_id ? ` · Ref. ${item.entity_id.slice(0, 8)}` : ''}</p></div><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.success ? 'bg-emerald-400' : 'bg-red-400'}`} aria-label={item.success ? 'Concluída' : 'Falhou'} /></div>
          })}</div>
        )}
      </article>
    </section>
  )
}
