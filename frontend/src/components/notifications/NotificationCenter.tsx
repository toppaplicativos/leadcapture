import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, AlertTriangle, CheckCircle2, Archive, Loader2, ChevronRight,
  Zap, Clock, X,
} from 'lucide-react'
import {
  createNotificationsApi,
  type NotificationFilter,
  type NotificationItem,
  type PlatformActionItem,
} from '@/lib/notifications/api'
import type { PushAppContext } from '@/lib/push/context'

const FILTERS: { key: NotificationFilter; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'unread', label: 'Não lidas' },
  { key: 'critical', label: 'Críticas' },
  { key: 'action', label: 'Exigem ação' },
  { key: 'leads', label: 'Leads' },
  { key: 'clients', label: 'Clientes' },
  { key: 'commissions', label: 'Comissões' },
  { key: 'orders', label: 'Pedidos' },
  { key: 'inventory', label: 'Estoque' },
  { key: 'support', label: 'Suporte' },
  { key: 'system', label: 'Sistema' },
  { key: 'archived', label: 'Arquivadas' },
]

function priorityTone(p: string) {
  if (p === 'critical') return 'bg-red-50 text-red-600 border-red-100'
  if (p === 'high') return 'bg-orange-50 text-orange-600 border-orange-100'
  if (p === 'medium') return 'bg-amber-50 text-amber-600 border-amber-100'
  return 'bg-blue-50 text-blue-600 border-blue-100'
}

function dtShort(v?: string) {
  try {
    return new Date(v!).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ''
  }
}

type Props = {
  getHeaders: () => Record<string, string>
  appContext?: PushAppContext
  onNavigate?: (path: string) => void
  compact?: boolean
  showActions?: boolean
  className?: string
}

export function NotificationCenter({
  getHeaders,
  appContext,
  onNavigate,
  compact,
  showActions = true,
  className = '',
}: Props) {
  const navigate = useNavigate()
  const api = useMemo(() => createNotificationsApi(getHeaders), [getHeaders])
  const [filter, setFilter] = useState<NotificationFilter>('all')
  const [items, setItems] = useState<NotificationItem[]>([])
  const [actions, setActions] = useState<PlatformActionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [unread, setUnread] = useState(0)
  const [openActions, setOpenActions] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [notifRes, unreadRes, actionsRes, openRes] = await Promise.all([
        api.list({ filter, app_target: appContext, limit: compact ? 30 : 80 }),
        api.unreadCount(),
        showActions ? api.listActions() : Promise.resolve({ actions: [] as PlatformActionItem[] }),
        showActions ? api.openActionCount() : Promise.resolve({ open_count: 0 }),
      ])
      setItems(notifRes.notifications || [])
      setUnread(unreadRes.unread_count || 0)
      setActions(actionsRes.actions || [])
      setOpenActions(openRes.open_count || 0)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [api, filter, appContext, compact, showActions])

  useEffect(() => { void load() }, [load])

  const go = (path?: string | null) => {
    if (!path) return
    if (onNavigate) onNavigate(path)
    else navigate(path.startsWith('/') ? path : `/${path}`)
  }

  const handleOpen = async (n: NotificationItem) => {
    if (!n.read) {
      try {
        await api.markRead(n.notification_id)
        setUnread((c) => Math.max(0, c - 1))
        setItems((prev) =>
          prev.map((x) => (x.notification_id === n.notification_id ? { ...x, read: true } : x)),
        )
      } catch { /* ignore */ }
    }
    go(n.deep_link || (n.metadata?.url as string | undefined))
  }

  const handleArchive = async (id: string) => {
    try {
      const res = await api.archive(id)
      setUnread(res.unread_count || 0)
      setItems((prev) => prev.filter((x) => x.notification_id !== id))
    } catch { /* ignore */ }
  }

  const handleMarkAll = async () => {
    try {
      await api.markAllRead()
      setUnread(0)
      setItems((prev) => prev.map((x) => ({ ...x, read: true })))
    } catch { /* ignore */ }
  }

  const completeAction = async (action: PlatformActionItem) => {
    try {
      await api.updateActionStatus(action.id, 'completed')
      setActions((prev) => prev.filter((a) => a.id !== action.id))
      setOpenActions((c) => Math.max(0, c - 1))
    } catch { /* ignore */ }
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {!compact && (
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[22px] font-bold text-gray-900 tracking-tight">Central de notificações</h2>
            <p className="text-[13px] text-gray-400 mt-0.5">
              {unread > 0 ? `${unread} não lida${unread > 1 ? 's' : ''}` : 'Tudo em dia'}
              {showActions && openActions > 0 ? ` · ${openActions} ação${openActions > 1 ? 'ões' : ''} aberta${openActions > 1 ? 's' : ''}` : ''}
            </p>
          </div>
          {unread > 0 && filter !== 'archived' && (
            <button
              type="button"
              onClick={() => void handleMarkAll()}
              className="text-[12px] font-semibold text-blue-600 hover:text-blue-700 shrink-0"
            >
              Marcar todas lidas
            </button>
          )}
        </div>
      )}

      <div className="flex gap-1 p-1 rounded-xl bg-gray-100 overflow-x-auto scrollbar-none">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`h-8 px-3 rounded-lg text-[11px] font-semibold whitespace-nowrap transition shrink-0 ${
              filter === f.key ? 'bg-white shadow text-gray-900' : 'text-gray-500'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {showActions && actions.length > 0 && filter !== 'archived' && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 px-0.5">Ações pendentes</p>
          {actions.slice(0, compact ? 3 : 8).map((action) => (
            <div
              key={action.id}
              className="bg-amber-50/80 border border-amber-100 rounded-2xl p-3 flex items-start gap-3"
            >
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 grid place-items-center shrink-0">
                <Zap size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{action.title}</p>
                {action.description && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{action.description}</p>
                )}
                {action.due_at && (
                  <p className="text-[10px] text-amber-700 mt-1 flex items-center gap-1">
                    <Clock size={10} /> Prazo: {dtShort(action.due_at)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void completeAction(action)}
                className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg shrink-0"
              >
                Concluir
              </button>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-gray-300" size={28} />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 grid place-items-center mx-auto mb-3">
            <Bell size={22} />
          </div>
          <p className="text-sm font-medium text-gray-500">Nenhuma notificação aqui</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <div
              key={n.notification_id}
              className={`rounded-2xl border p-3.5 flex items-start gap-3 transition ${
                n.read ? 'bg-white border-gray-100' : 'bg-blue-50/40 border-blue-200'
              }`}
            >
              <div className={`w-9 h-9 rounded-xl border grid place-items-center shrink-0 ${priorityTone(n.priority)}`}>
                {n.priority === 'critical' || n.action_required ? (
                  <AlertTriangle size={16} />
                ) : (
                  <Bell size={16} />
                )}
              </div>
              <button
                type="button"
                onClick={() => void handleOpen(n)}
                className="flex-1 min-w-0 text-left"
              >
                <p className="font-semibold text-sm text-gray-900">{n.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                <p className="text-[10px] text-gray-400 mt-1">{dtShort(n.created_at)}</p>
                {n.cta_label && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 mt-2">
                    {n.cta_label} <ChevronRight size={12} />
                  </span>
                )}
              </button>
              <div className="flex flex-col gap-1 shrink-0">
                {!n.read && <div className="w-2 h-2 rounded-full bg-blue-500 mx-auto" />}
                {filter !== 'archived' && (
                  <button
                    type="button"
                    onClick={() => void handleArchive(n.notification_id)}
                    className="w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 grid place-items-center"
                    aria-label="Arquivar"
                  >
                    <Archive size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

type BellButtonProps = {
  getHeaders: () => Record<string, string>
  appContext?: PushAppContext
  onNavigate?: (path: string) => void
  className?: string
}

export function NotificationBellButton({
  getHeaders,
  appContext,
  onNavigate,
  className = '',
}: BellButtonProps) {
  const api = useMemo(() => createNotificationsApi(getHeaders), [getHeaders])
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    void api.unreadCount().then((r) => setUnread(r.unread_count || 0)).catch(() => {})
    const t = setInterval(() => {
      void api.unreadCount().then((r) => setUnread(r.unread_count || 0)).catch(() => {})
    }, 60_000)
    return () => clearInterval(t)
  }, [api])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`relative w-10 h-10 rounded-xl grid place-items-center shrink-0 ${className}`}
        aria-label="Notificações"
      >
        <Bell size={17} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[200] flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-label="Fechar"
          />
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="font-bold text-gray-900">Notificações</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-9 h-9 rounded-xl hover:bg-gray-100 grid place-items-center"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <NotificationCenter
                getHeaders={getHeaders}
                appContext={appContext}
                onNavigate={(path) => { setOpen(false); onNavigate?.(path) }}
                compact
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}