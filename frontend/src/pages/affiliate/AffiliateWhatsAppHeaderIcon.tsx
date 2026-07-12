import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { WhatsAppIcon } from '@/components/icons'
import { affiliateApi } from '@/lib/api-affiliate'

type WaState = 'loading' | 'connected' | 'disconnected'

/**
 * Ícone no header do painel do afiliado: status WhatsApp + atalho para Conexões.
 */
export function AffiliateWhatsAppHeaderIcon({
  cacheVersion = 0,
  onClick,
}: {
  cacheVersion?: number
  onClick: () => void
}) {
  const [state, setState] = useState<WaState>('loading')
  const [label, setLabel] = useState('WhatsApp')

  useEffect(() => {
    let cancelled = false
    setState('loading')
    affiliateApi.distributionStatus()
      .then((r) => {
        if (cancelled) return
        const wa = String(r?.whatsapp_status || '').toLowerCase()
        const ok = wa === 'connected'
        setState(ok ? 'connected' : 'disconnected')
        if (ok) {
          const name = String(r?.connected_instance_name || '').trim()
          setLabel(name ? `WhatsApp conectado · ${name}` : 'WhatsApp conectado')
        } else {
          setLabel('WhatsApp desconectado — toque para conectar')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState('disconnected')
          setLabel('WhatsApp — toque para gerenciar')
        }
      })
    return () => { cancelled = true }
  }, [cacheVersion])

  // Revalida ao focar a janela (após pairing)
  useEffect(() => {
    const onFocus = () => {
      affiliateApi.distributionStatus()
        .then((r) => {
          const wa = String(r?.whatsapp_status || '').toLowerCase()
          const ok = wa === 'connected'
          setState(ok ? 'connected' : 'disconnected')
          if (ok) {
            const name = String(r?.connected_instance_name || '').trim()
            setLabel(name ? `WhatsApp conectado · ${name}` : 'WhatsApp conectado')
          } else {
            setLabel('WhatsApp desconectado — toque para conectar')
          }
        })
        .catch(() => undefined)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const connected = state === 'connected'
  const loading = state === 'loading'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`affiliate-wa-header-btn${connected ? ' is-connected' : ''}${loading ? ' is-loading' : ''}`}
      aria-label={label}
      title={label}
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin opacity-80" />
      ) : (
        <WhatsAppIcon size={17} className="affiliate-wa-header-btn__icon" />
      )}
      <span
        className={`affiliate-wa-header-btn__dot${loading ? ' is-loading' : connected ? ' is-on' : ' is-off'}`}
        aria-hidden
      />
    </button>
  )
}
