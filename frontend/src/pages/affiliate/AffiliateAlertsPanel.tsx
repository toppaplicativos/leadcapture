import { useState } from 'react'
import { Bell, Settings2 } from 'lucide-react'
import { NotificationCenter } from '@/components/notifications/NotificationCenter'
import { PushNotificationSettings } from '@/components/push/PushNotificationSettings'
import { getAffiliateHeaders } from '@/lib/api-affiliate'

type Props = {
  onNavigate?: (path: string) => void
}

/** Uma única central para ler avisos e configurar como eles chegam. */
export function AffiliateAlertsPanel({ onNavigate }: Props) {
  const [view, setView] = useState<'inbox' | 'settings'>('inbox')

  return (
    <div className="space-y-4 pb-5">
      <div className="affiliate-segment affiliate-segment--2" role="tablist" aria-label="Notificações">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'inbox'}
          className={`affiliate-segment__btn${view === 'inbox' ? ' affiliate-segment__btn--active' : ''}`}
          onClick={() => setView('inbox')}
        >
          <Bell size={14} /> Caixa de entrada
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'settings'}
          className={`affiliate-segment__btn${view === 'settings' ? ' affiliate-segment__btn--active' : ''}`}
          onClick={() => setView('settings')}
        >
          <Settings2 size={14} /> Preferências
        </button>
      </div>

      {view === 'inbox' ? (
        <NotificationCenter
          getHeaders={getAffiliateHeaders}
          appContext="affiliate"
          onNavigate={onNavigate}
        />
      ) : (
        <PushNotificationSettings compact />
      )}
    </div>
  )
}
