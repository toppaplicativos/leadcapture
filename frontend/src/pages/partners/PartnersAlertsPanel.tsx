import { useEffect, useState } from 'react'
import { Bell, Loader2 } from 'lucide-react'
import { partnersApi } from '@/lib/api-partners'

type AlertRow = {
  id: string
  title: string
  body?: string | null
  severity?: string
  organization_name?: string | null
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

export function PartnersAlertsPanel({ showToast }: { showToast: (t: string, type?: 'ok' | 'err') => void }) {
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts] = useState<AlertRow[]>([])

  useEffect(() => {
    setLoading(true)
    partnersApi.alerts()
      .then((r) => setAlerts(r.alerts || []))
      .catch(() => showToast('Erro ao carregar alertas', 'err'))
      .finally(() => setLoading(false))
  }, [showToast])

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
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-gray-700" />
          <div>
            <p className="text-sm font-bold text-gray-900">Alertas globais</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Notificações de todos os seus programas em um só lugar.
            </p>
          </div>
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
          <p className="text-xs text-gray-500 mt-1">Você será avisado sobre oportunidades e pendências dos programas.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className={`affiliate-card p-4 ${!alert.is_read ? 'ring-1 ring-amber-200' : ''}`}
            >
              <div className="flex items-start gap-2">
                <Bell size={16} className={alert.is_read ? 'text-gray-300' : 'text-amber-500'} />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900">{alert.title}</p>
                  {alert.organization_name && (
                    <p className="text-[10px] text-gray-500 mt-0.5">{alert.organization_name}</p>
                  )}
                  {alert.body && <p className="text-xs text-gray-600 mt-1">{alert.body}</p>}
                  <p className="text-[10px] text-gray-400 mt-2">{dt(alert.created_at)}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}