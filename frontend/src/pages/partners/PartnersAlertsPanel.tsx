import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, ChevronRight, Loader2 } from 'lucide-react'
import { partnersApi } from '@/lib/api-partners'

type AlertRow = {
  id: string
  title: string
  body?: string | null
  severity?: string
  organization_name?: string | null
  organization_slug?: string | null
  action_path?: string | null
  brand_id?: string | null
  is_read?: boolean
  created_at?: string | null
}

function dt(v?: string | null) {
  try {
    return new Date(v!).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function programDeepLink(slug?: string | null, actionPath?: string | null) {
  const s = String(slug || '').trim()
  if (!s) return null
  const path = String(actionPath || '/contatos').trim() || '/contatos'
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `/parceiros/painel/programa/${encodeURIComponent(s)}/painel${normalized}`
}

export function PartnersAlertsPanel({ showToast }: { showToast: (t: string, type?: 'ok' | 'err') => void }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const r = await partnersApi.alerts()
      setAlerts(r.alerts || [])
    } catch {
      showToast('Erro ao carregar alertas', 'err')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [showToast])

  async function markRead(alert: AlertRow) {
    if (alert.is_read) return
    setBusyId(alert.id)
    try {
      await partnersApi.markAlertRead(alert.id)
      setAlerts((prev) => prev.map((a) => (a.id === alert.id ? { ...a, is_read: true } : a)))
    } catch {
      showToast('Não foi possível marcar como lido', 'err')
    } finally {
      setBusyId(null)
    }
  }

  async function markAll() {
    setBusyId('all')
    try {
      await partnersApi.markAllAlertsRead()
      setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })))
      showToast('Todos os alertas marcados como lidos')
    } catch {
      showToast('Erro ao marcar alertas', 'err')
    } finally {
      setBusyId(null)
    }
  }

  async function openAlert(alert: AlertRow) {
    await markRead(alert)
    const dest = programDeepLink(alert.organization_slug, alert.action_path)
    if (dest) {
      navigate(dest)
      return
    }
    if (alert.action_path === '/conexoes' || alert.action_path === '/contatos') {
      showToast('Abra o programa da organização para ver este alerta', 'err')
    }
  }

  if (loading) {
    return (
      <div className="affiliate-card p-8 flex justify-center">
        <Loader2 size={22} className="animate-spin text-[#c7c7cc]" />
      </div>
    )
  }

  const unread = alerts.filter((a) => !a.is_read)

  return (
    <div className="space-y-3 pb-2">
      <div className="affiliate-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Bell size={18} className="text-gray-700 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900">Alertas globais</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Contatos e pendências de todos os seus programas.
              </p>
            </div>
          </div>
          {unread.length > 0 && (
            <button
              type="button"
              className="text-[11px] font-bold text-gray-700 shrink-0 underline underline-offset-2 disabled:opacity-50"
              disabled={busyId === 'all'}
              onClick={() => void markAll()}
            >
              Marcar todos
            </button>
          )}
        </div>
      </div>

      {unread.length > 0 && (
        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 px-1">
          {unread.length} não lido{unread.length > 1 ? 's' : ''}
        </p>
      )}

      {alerts.length === 0 ? (
        <div className="affiliate-card p-8 text-center">
          <p className="text-sm font-semibold text-gray-900">Nenhum alerta</p>
          <p className="text-xs text-gray-500 mt-1">
            Você será avisado quando uma marca enviar contatos ou houver pendências.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {alerts.map((alert) => {
            const dest = programDeepLink(alert.organization_slug, alert.action_path)
            return (
              <li key={alert.id}>
                <button
                  type="button"
                  className={`affiliate-card p-4 w-full text-left active:opacity-90 ${!alert.is_read ? 'ring-1 ring-amber-200' : ''}`}
                  disabled={busyId === alert.id}
                  onClick={() => void openAlert(alert)}
                >
                  <div className="flex items-start gap-2">
                    <Bell size={16} className={alert.is_read ? 'text-gray-300' : 'text-amber-500'} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-900">{alert.title}</p>
                      {alert.organization_name && (
                        <p className="text-[10px] text-gray-500 mt-0.5">{alert.organization_name}</p>
                      )}
                      {alert.body && <p className="text-xs text-gray-600 mt-1">{alert.body}</p>}
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <p className="text-[10px] text-gray-400">{dt(alert.created_at)}</p>
                        {dest && (
                          <span className="text-[10px] font-bold text-gray-700 inline-flex items-center gap-0.5">
                            Abrir <ChevronRight size={12} />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
