import { useEffect, useState, useCallback, useRef } from 'react'
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from '@/components/icons'
import { clearAdminAuth, getHeaders, isHardAuthFailure } from '@/lib/admin/helpers'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useWhatsAppHealth } from '@/lib/hooks/useWhatsAppHealth'

type Props = {
  brandKey?: string | number
}

function hasAuthToken(): boolean {
  try {
    return !!localStorage.getItem('lead-system-token')
  } catch {
    return false
  }
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
  /** Para de pollar canais após 401/token inválido — evita flood no console. */
  const authDeadRef = useRef(false)

  const handleAuthDeath = useCallback((status: number, body?: any) => {
    if (!isHardAuthFailure(status, body)) return false
    authDeadRef.current = true
    clearAdminAuth()
    return true
  }, [])

  const loadInstagram = useCallback(async () => {
    const activeBrandId = String(brandKey || localStorage.getItem('lead-system:active-brand-id') || '').trim()
    if (authDeadRef.current || !hasAuthToken() || !activeBrandId) {
      setIgLoading(false)
      setIgConnected(false)
      setIgUsername(null)
      return
    }
    try {
      const headers = getHeaders()
      if (!headers.Authorization) {
        setIgLoading(false)
        return
      }
      // status + connection em paralelo (mesma regra do studio)
      const [statusRes, connRes] = await Promise.all([
        fetch('/api/instagram/connection-status', { headers }),
        fetch('/api/instagram/connection', { headers }),
      ])
      const status = await statusRes.json().catch(() => ({}))
      const connBody = await connRes.json().catch(() => ({}))

      if (handleAuthDeath(statusRes.status, status) || handleAuthDeath(connRes.status, connBody)) {
        setIgConnected(false)
        setIgUsername(null)
        setIgLoading(false)
        return
      }

      // 400 brand / 403 plano: não inventar "desconectado" nem re-pollar em loop agressivo
      if (statusRes.status === 400 || connRes.status === 400) {
        setIgConnected(false)
        setIgUsername(null)
        setIgLoading(false)
        return
      }
      if (statusRes.status === 403 && connRes.status === 403) {
        setIgConnected(false)
        setIgUsername(null)
        setIgLoading(false)
        return
      }

      const conn = connBody?.connection || null
      const linked = !!(
        status?.connected
        || conn?.username
        || conn?.account_id
        || conn?.ig_user_id
        || (conn?.access_token && String(conn.access_token).trim())
      )
      setIgConnected(linked)
      setIgUsername(status?.username || conn?.username || null)
    } catch {
      setIgConnected(false)
      setIgUsername(null)
    } finally {
      setIgLoading(false)
    }
  }, [handleAuthDeath])

  const loadFacebook = useCallback(async () => {
    const activeBrandId = String(brandKey || localStorage.getItem('lead-system:active-brand-id') || '').trim()
    if (authDeadRef.current || !hasAuthToken() || !activeBrandId) {
      setFbLoading(false)
      setFbConnected(false)
      setFbPageName(null)
      return
    }
    try {
      const headers = getHeaders()
      if (!headers.Authorization) {
        setFbLoading(false)
        return
      }
      const r = await fetch('/api/facebook/connection', { headers })
      const d = await r.json().catch(() => ({}))
      if (handleAuthDeath(r.status, d)) {
        setFbConnected(false)
        setFbPageName(null)
        setFbLoading(false)
        return
      }
      if (r.status === 400 || r.status === 403) {
        setFbConnected(false)
        setFbPageName(null)
        setFbLoading(false)
        return
      }
      const connected = !!d.success && !!d.connection
      setFbConnected(connected)
      setFbPageName(d.connection?.page_name || d.profile?.name || null)
    } catch {
      setFbConnected(false)
      setFbPageName(null)
    } finally {
      setFbLoading(false)
    }
  }, [handleAuthDeath])

  useEffect(() => {
    authDeadRef.current = false
    if (!hasAuthToken()) {
      setIgLoading(false)
      setFbLoading(false)
      return
    }
    setIgLoading(true)
    setFbLoading(true)
    void loadInstagram()
    void loadFacebook()
    const id = setInterval(() => {
      if (authDeadRef.current || !hasAuthToken()) return
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
    // Org: gerenciar contas / mensagens — sem empurrar reconexão de afiliado
    triggerNav(waConnected ? 'mensagens' : 'whatsapp')
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
            ? `WhatsApp · ${summary?.connected ?? 0} sessão(ões) da org — mensagens e gestão`
            : 'WhatsApp · gerenciar sessões da organização'
        }
        title={
          waConnected
            ? `WhatsApp · ${summary?.connected ?? 0} ativa(s)`
            : 'WhatsApp · gerenciar contas'
        }
      >
        <WhatsAppIcon size={17} className="agent-shell__channel-icon agent-shell__channel-icon--wa" />
        <span
          className={`agent-shell__channel-dot${waLoading ? ' is-loading' : waConnected ? ' is-on' : ' is-neutral'}`}
          aria-hidden
        />
      </button>
    </div>
  )
}
