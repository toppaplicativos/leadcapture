/**
 * WhatsAppHealthBanner — banner persistente no topo das páginas admin que
 * avisa quando alguma instance WhatsApp está down há muito tempo.
 *
 * Polla /api/instances/health a cada 60s. Se houver instance crítica
 * (disconnected > 10min OU drift detectado), mostra banner vermelho com:
 *  - Quais instances estão down
 *  - Tempo desconectado
 *  - CTA pra ir reconectar
 *
 * Dismissable por sessão (localStorage), mas reaparece em mudança de estado.
 */
import { useState, useEffect } from 'react'
import { AlertCircle, X, ArrowRight, Phone, Loader2, QrCode } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface InstanceHealth {
  id: string
  name: string
  phone: string | null
  status_db: string
  status_runtime: string
  drift: boolean
  last_connected_at: string | null
  seconds_since_connected: number | null
  criticality: 'ok' | 'warning' | 'critical'
  human_reason: string
  has_pending_qr?: boolean
}

interface HealthResponse {
  success?: boolean
  instances?: InstanceHealth[]
  summary?: {
    total: number
    connected: number
    disconnected: number
    critical: number
    warning: number
    has_critical: boolean
  }
}

const POLL_INTERVAL_MS = 60_000 // 1 min
const DISMISS_KEY = 'whatsapp-health-banner:dismissed-at'
const DISMISS_DURATION_MS = 10 * 60_000 // dismissed por 10 min

function getDismissed(): number | null {
  try {
    const v = localStorage.getItem(DISMISS_KEY)
    return v ? Number(v) : null
  } catch { return null }
}

function setDismissed(): void {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
}

function fmtMinutes(seconds: number | null): string {
  if (!seconds) return '?'
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}min`
}

export function WhatsAppHealthBanner() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [reconnecting, setReconnecting] = useState<string | null>(null)
  const [dismissedAt, setDismissedAtState] = useState<number | null>(getDismissed())
  const navigate = useNavigate()

  useEffect(() => {
    let alive = true
    const fetchHealth = async () => {
      try {
        const token = localStorage.getItem('lead-system-token')
        if (!token) return
        const brandId = localStorage.getItem('lead-system:active-brand-id')
        const h: Record<string, string> = { 'Authorization': `Bearer ${token}` }
        if (brandId) h['x-brand-id'] = brandId
        const r = await fetch('/api/instances/health', { headers: h })
        if (!r.ok) return
        const d = await r.json()
        if (alive) setHealth(d)
      } catch { /* silencioso - banner so aparece quando consegue dados */ }
    }
    fetchHealth()
    const interval = setInterval(fetchHealth, POLL_INTERVAL_MS)
    return () => { alive = false; clearInterval(interval) }
  }, [])

  /* Se dismiss ainda valido, nao mostra */
  const isDismissValid = dismissedAt && (Date.now() - dismissedAt < DISMISS_DURATION_MS)
  if (isDismissValid) return null

  const criticalInstances = (health?.instances || []).filter((i) => i.criticality === 'critical')
  if (criticalInstances.length === 0) return null

  /* Se TODAS as criticas tem QR pendente, banner vira amber (acao positiva esperando user)
     em vez de vermelho (problema sem solucao). Reforca urgencia mas sem panico. */
  const allHaveQr = criticalInstances.every((i) => i.has_pending_qr)
  const hasAnyQr = criticalInstances.some((i) => i.has_pending_qr)

  const handleReconnect = async (id: string) => {
    setReconnecting(id)
    try {
      const token = localStorage.getItem('lead-system-token')
      const brandId = localStorage.getItem('lead-system:active-brand-id')
      const h: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) h['Authorization'] = `Bearer ${token}`
      if (brandId) h['x-brand-id'] = brandId
      await fetch(`/api/instances/${id}/reconnect`, { method: 'POST', headers: h })
      /* Espera 3s pra dar tempo do baileys subir e refresca */
      setTimeout(() => {
        navigate('/whatsapp')
      }, 1500)
    } catch {
      navigate('/whatsapp')
    } finally {
      setReconnecting(null)
    }
  }

  const handleDismiss = () => {
    setDismissed()
    setDismissedAtState(Date.now())
  }

  /* Cores e textos diferentes quando ja tem QR pronto vs sessao morta sem QR */
  const bgClass = allHaveQr ? 'bg-amber-600' : 'bg-rose-600'
  const borderClass = allHaveQr ? 'border-amber-700' : 'border-rose-700'
  const subTextClass = allHaveQr ? 'text-amber-50/90' : 'text-rose-50/90'
  const btnGhostClass = allHaveQr
    ? 'bg-amber-700 hover:bg-amber-800 text-white border-amber-500'
    : 'bg-rose-700 hover:bg-rose-800 text-white border-rose-500'
  const dismissClass = allHaveQr
    ? 'text-amber-100 hover:text-white hover:bg-amber-700'
    : 'text-rose-100 hover:text-white hover:bg-rose-700'
  const HeaderIcon = hasAnyQr ? QrCode : AlertCircle

  return (
    <div className={`sticky top-0 z-[80] w-full ${bgClass} text-white shadow-md border-b ${borderClass}`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex items-start gap-3 flex-wrap">
        <HeaderIcon size={18} className="shrink-0 mt-0.5" strokeWidth={2.25} />
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-bold leading-tight">
            {allHaveQr
              ? (criticalInstances.length === 1
                ? `QR Code pronto! Escaneie pra reconectar "${criticalInstances[0].name}"`
                : `${criticalInstances.length} instâncias com QR Code esperando`)
              : (criticalInstances.length === 1
                ? `Instância WhatsApp "${criticalInstances[0].name}" está desconectada`
                : `${criticalInstances.length} instâncias WhatsApp desconectadas`)}
          </p>
          <p className={`text-[11px] mt-0.5 leading-snug ${subTextClass}`}>
            {criticalInstances.slice(0, 3).map((i) => (
              <span key={i.id}>
                <b>{i.name}</b> — {i.human_reason}
                {i !== criticalInstances[criticalInstances.length - 1] && ' · '}
              </span>
            ))}
            {criticalInstances.length > 3 && <span> · +{criticalInstances.length - 3}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {criticalInstances.length === 1 && !criticalInstances[0].has_pending_qr && (
            <button
              onClick={() => handleReconnect(criticalInstances[0].id)}
              disabled={!!reconnecting}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white hover:bg-rose-50 text-rose-700 text-[11.5px] font-bold transition disabled:opacity-50"
            >
              {reconnecting ? <Loader2 size={12} className="animate-spin" /> : <Phone size={12} strokeWidth={2.5} />}
              Reconectar
            </button>
          )}
          <button
            onClick={() => navigate('/whatsapp')}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[11.5px] font-bold transition border ${btnGhostClass}`}
          >
            {hasAnyQr ? <><QrCode size={12} strokeWidth={2.5} /> Escanear QR</> : <>Abrir WhatsApp <ArrowRight size={12} strokeWidth={2.5} /></>}
          </button>
          <button
            onClick={handleDismiss}
            title="Ocultar por 10 min"
            className={`w-8 h-8 grid place-items-center rounded-lg transition ${dismissClass}`}
          >
            <X size={14} strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </div>
  )
}
