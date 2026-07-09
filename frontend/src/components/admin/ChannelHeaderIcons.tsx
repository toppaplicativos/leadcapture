import { useEffect, useState, useCallback } from 'react'
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from '@/components/icons'
import { getHeaders } from '@/lib/admin/helpers'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useWhatsAppHealth } from '@/lib/hooks/useWhatsAppHealth'

type Props = {
  brandKey?: string | number
}

export function ChannelHeaderIcons({ brandKey = '' }: Props) {
  const { triggerNav } = useAgentShell()
  const { summary, loading: waLoading } = useWhatsAppHealth(true)
  const [igConnected, setIgConnected] = useState(false)
  const [igUsername, setIgUsername] = useState<string | null>(null)
  const [igLoading, setIgLoading] = useState(true)
  const [fbConnected, setFbConnected] = useState(false)
  const [fbPageName, setFbPageName] = useState<string | null>(null)
  const [fbLoading, setFbLoading] = useState(true)

  const loadInstagram = useCallback(async () => {
    try {
      const r = await fetch('/api/instagram/connection-status', { headers: getHeaders() })
      const d = await r.json()
      setIgConnected(!!d.connected)
      setIgUsername(d.username || null)
    } catch {
      setIgConnected(false)
      setIgUsername(null)
    } finally {
      setIgLoading(false)
    }
  }, [])

  const loadFacebook = useCallback(async () => {
    try {
      const r = await fetch('/api/facebook/connection', { headers: getHeaders() })
      const d = await r.json()
      const connected = !!d.success && !!d.connection
      setFbConnected(connected)
      setFbPageName(d.connection?.page_name || d.profile?.name || null)
    } catch {
      setFbConnected(false)
      setFbPageName(null)
    } finally {
      setFbLoading(false)
    }
  }, [])

  useEffect(() => {
    setIgLoading(true)
    setFbLoading(true)
    void loadInstagram()
    void loadFacebook()
    const id = setInterval(() => {
      void loadInstagram()
      void loadFacebook()
    }, 60_000)
    return () => clearInterval(id)
  }, [loadInstagram, loadFacebook, brandKey])

  const waConnected = (summary?.connected ?? 0) > 0

  const openInstagram = () => {
    triggerNav('instagram')
  }

  const openFacebook = () => {
    triggerNav('facebook')
  }

  const openWhatsApp = () => {
    if (waConnected) {
      triggerNav('mensagens')
    } else {
      triggerNav('whatsapp')
    }
  }

  return (
    <div className="agent-shell__channels" role="group" aria-label="Canais conectados">
      <button
        type="button"
        className={`agent-shell__channel-btn${igConnected ? ' is-connected' : ''}`}
        onClick={openInstagram}
        aria-label={
          igConnected
            ? `Instagram conectado${igUsername ? ` (@${igUsername})` : ''}`
            : 'Instagram desconectado — toque para conectar'
        }
        title={
          igConnected
            ? `Instagram · @${igUsername || 'conectado'}`
            : 'Instagram · desconectado'
        }
      >
        <InstagramIcon size={17} className="agent-shell__channel-icon agent-shell__channel-icon--ig" />
        <span
          className={`agent-shell__channel-dot${igLoading ? ' is-loading' : igConnected ? ' is-on' : ' is-off'}`}
          aria-hidden
        />
      </button>

      <button
        type="button"
        className={`agent-shell__channel-btn${fbConnected ? ' is-connected' : ''}`}
        onClick={openFacebook}
        aria-label={
          fbConnected
            ? `Facebook conectado${fbPageName ? ` (${fbPageName})` : ''}`
            : 'Facebook desconectado — toque para conectar'
        }
        title={
          fbConnected
            ? `Facebook · ${fbPageName || 'conectado'}`
            : 'Facebook · desconectado'
        }
      >
        <FacebookIcon size={17} className="agent-shell__channel-icon agent-shell__channel-icon--fb" />
        <span
          className={`agent-shell__channel-dot${fbLoading ? ' is-loading' : fbConnected ? ' is-on' : ' is-off'}`}
          aria-hidden
        />
      </button>

      <button
        type="button"
        className={`agent-shell__channel-btn${waConnected ? ' is-connected' : ''}`}
        onClick={openWhatsApp}
        aria-label={
          waConnected
            ? `WhatsApp conectado (${summary?.connected ?? 0} instância${(summary?.connected ?? 0) === 1 ? '' : 's'})`
            : 'WhatsApp desconectado — toque para conectar'
        }
        title={
          waConnected
            ? `WhatsApp · ${summary?.connected ?? 0} ativa(s)`
            : 'WhatsApp · desconectado'
        }
      >
        <WhatsAppIcon size={17} className="agent-shell__channel-icon agent-shell__channel-icon--wa" />
        <span
          className={`agent-shell__channel-dot${waLoading ? ' is-loading' : waConnected ? ' is-on' : ' is-off'}`}
          aria-hidden
        />
      </button>
    </div>
  )
}