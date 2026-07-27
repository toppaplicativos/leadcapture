import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { WhatsAppIcon } from '@/components/icons'
import { affiliateApi } from '@/lib/api-affiliate'

type WaState = 'loading' | 'connected' | 'registered' | 'missing'

export function AffiliateWhatsAppHeaderIcon({
  cacheVersion = 0,
  onClick,
}: {
  cacheVersion?: number
  onClick: () => void
}) {
  const [state, setState] = useState<WaState>('loading')
  const [label, setLabel] = useState('WhatsApp')

  function applyStatus(result: any) {
    const connected = String(result?.whatsapp_status || '').toLowerCase() === 'connected'
    const registered = Boolean(result?.registered_whatsapp_ok)
    setState(connected ? 'connected' : registered ? 'registered' : 'missing')
    if (connected) {
      const name = String(result?.connected_instance_name || '').trim()
      setLabel(name ? `WhatsApp conectado · ${name}` : 'WhatsApp conectado')
    } else {
      setLabel(registered ? 'Número registrado · conexão opcional' : 'Cadastre seu número de atendimento')
    }
  }

  useEffect(() => {
    let cancelled = false
    setState('loading')
    affiliateApi.distributionStatus()
      .then((result) => {
        if (!cancelled) applyStatus(result)
      })
      .catch(() => {
        if (!cancelled) {
          setState('missing')
          setLabel('WhatsApp · toque para gerenciar')
        }
      })
    return () => { cancelled = true }
  }, [cacheVersion])

  useEffect(() => {
    const onFocus = () => affiliateApi.distributionStatus().then(applyStatus).catch(() => undefined)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const connected = state === 'connected'
  const registered = state === 'registered'
  const loading = state === 'loading'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`affiliate-wa-header-btn${connected ? ' is-connected' : ''}${registered ? ' is-registered' : ''}${loading ? ' is-loading' : ''}`}
      aria-label={label}
      title={label}
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin opacity-80" />
      ) : (
        <WhatsAppIcon size={17} className="affiliate-wa-header-btn__icon" />
      )}
      <span
        className={`affiliate-wa-header-btn__dot${loading ? ' is-loading' : connected ? ' is-on' : registered ? ' is-registered' : ' is-off'}`}
        aria-hidden
      />
    </button>
  )
}
