/**
 * Banner no chrome do workspace quando instâncias WhatsApp estão críticas.
 * CTA abre fluxo de código por número (não QR).
 */
import { useState } from 'react'
import { AlertCircle, X, Hash, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useWhatsAppHealth } from '@/lib/hooks/useWhatsAppHealth'
import { useWhatsAppConnectOptional } from '@/lib/whatsapp/WhatsAppConnectContext'

const DISMISS_KEY = 'whatsapp-health-banner:dismissed-at'
const DISMISS_DURATION_MS = 10 * 60_000

function getDismissed(): number | null {
  try {
    const v = localStorage.getItem(DISMISS_KEY)
    return v ? Number(v) : null
  } catch { return null }
}

function setDismissed(): void {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
}

export function WhatsAppHealthBanner({ embedded }: { embedded?: boolean } = {}) {
  const { criticalInstances, primaryCritical } = useWhatsAppHealth()
  const connect = useWhatsAppConnectOptional()
  const navigate = useNavigate()
  const [dismissedAt, setDismissedAtState] = useState<number | null>(getDismissed())
  const [preparing, setPreparing] = useState(false)

  const isDismissValid = dismissedAt && (Date.now() - dismissedAt < DISMISS_DURATION_MS)
  if (isDismissValid || criticalInstances.length === 0) return null

  const handleConnect = () => {
    if (primaryCritical) {
      connect?.openConnect(primaryCritical.id)
      return
    }
    connect?.openConnect()
  }

  const handleDismiss = () => {
    setDismissed()
    setDismissedAtState(Date.now())
  }

  const label = criticalInstances.length === 1
    ? `"${criticalInstances[0].name}" desconectado`
    : `${criticalInstances.length} sessões WhatsApp offline`

  return (
    <div
      className={`wa-health-banner w-full bg-rose-600 text-white ${embedded ? 'wa-health-banner--embedded' : 'sticky top-0 z-[80] shadow-md border-b border-rose-700'}`}
      role="alert"
    >
      <div className={`wa-health-banner__inner ${embedded ? 'wa-health-banner__inner--embedded' : 'max-w-6xl mx-auto'} px-3 sm:px-4 flex items-center gap-2.5`}>
        <AlertCircle size={16} className="shrink-0" strokeWidth={2.25} />
        <div className="flex-1 min-w-0">
          <p className="text-[11.5px] sm:text-[12px] font-bold leading-tight truncate">
            {label} — vincule pelo código no número
          </p>
          <p className="hidden sm:block text-[10.5px] mt-0.5 leading-snug line-clamp-1 text-rose-50/90">
            {criticalInstances.slice(0, 2).map((i) => (
              <span key={i.id}>
                <b>{i.name}</b> — {i.human_reason}
                {i !== criticalInstances[criticalInstances.length - 1] && ' · '}
              </span>
            ))}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              setPreparing(true)
              handleConnect()
              setPreparing(false)
            }}
            disabled={preparing}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-white hover:bg-rose-50 text-rose-700 text-[10.5px] font-bold transition disabled:opacity-50"
          >
            {preparing ? <Loader2 size={12} className="animate-spin" /> : <Hash size={12} strokeWidth={2.5} />}
            Gerar código
          </button>
          <button
            type="button"
            onClick={() => navigate('/configuracoes?tab=whatsapp')}
            className="wa-health-banner__cta-secondary hidden sm:inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[10.5px] font-bold transition border bg-rose-700 hover:bg-rose-800 text-white border-rose-500"
          >
            Gerenciar
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            title="Ocultar por 10 min"
            className="w-8 h-8 grid place-items-center rounded-lg transition text-rose-100 hover:text-white hover:bg-rose-700"
          >
            <X size={14} strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </div>
  )
}