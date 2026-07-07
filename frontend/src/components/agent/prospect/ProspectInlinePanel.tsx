import { useEffect, useState, useCallback } from 'react'
import { Loader2, Users, ChevronRight, MapPin, Zap } from 'lucide-react'
import { useProspectBridge } from '@/lib/agent/ProspectBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h.Authorization = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

export function ProspectInlinePanel() {
  const bridge = useProspectBridge()
  const { openCanvas, triggerSkill } = useAgentShell()
  const isDesktop = useIsDesktop()
  const snap = bridge.snapshot
  const [recent, setRecent] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const loadRecent = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams({ page: '1', limit: '6', status: 'new' })
      const r = await fetch(`/api/customers?${q}`, { headers: getHeaders() })
      const d = await r.json()
      setRecent(d.customers || d.clients || [])
    } catch {
      setRecent([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadRecent() }, [loadRecent, snap.capturedLive, snap.todayCount])

  const openLeads = () => {
    triggerSkill('crm.leads.table', {
      label: 'Ver leads',
      assistantMessage: 'Seus leads recentes:',
      context: { status: 'new' },
    })
  }

  return (
    <div className="catalog-panel catalog-panel--prospect">
      <div className="prospect-inline__metrics">
        <div className="prospect-inline__metric">
          <span className="prospect-inline__metric-val">{snap.inRange || snap.found}</span>
          <span className="prospect-inline__metric-lbl">No raio</span>
        </div>
        <div className="prospect-inline__metric">
          <span className="prospect-inline__metric-val prospect-inline__metric-val--new">{snap.newInRange || snap.newCount}</span>
          <span className="prospect-inline__metric-lbl">Novos</span>
        </div>
        <div className="prospect-inline__metric">
          <span className="prospect-inline__metric-val prospect-inline__metric-val--ok">{snap.capturedLive}</span>
          <span className="prospect-inline__metric-lbl">Captados</span>
        </div>
      </div>

      {isDesktop && (
        <p className="catalog-module__hint">
          Mapa no canvas à direita.{' '}
          <button type="button" className="catalog-module__link" onClick={() => openCanvas('/busca')}>
            Expandir mapa
          </button>
        </p>
      )}

      <div className="prospect-inline__actions">
        <button type="button" className="catalog-panel__action catalog-panel__action--ghost" onClick={() => bridge.dispatch({ type: 'capture_batch' })} disabled={!snap.newCount}>
          <Zap size={13} /> Captar ({snap.newCount})
        </button>
        <button type="button" className="catalog-panel__action" onClick={openLeads}>
          <Users size={13} /> Ver leads
        </button>
      </div>

      <p className="prospect-inline__section-title">Novos na base</p>
      {loading ? (
        <div className="catalog-panel__loading"><Loader2 size={16} className="animate-spin text-gray-400" /></div>
      ) : recent.length === 0 ? (
        <p className="catalog-panel__empty">Nenhum lead novo ainda. Busque no mapa e capture.</p>
      ) : (
        <div className="catalog-lead-list">
          {recent.map((l) => (
            <button key={l.id} type="button" className="catalog-lead-list-row" onClick={openLeads}>
              <div className="catalog-lead-list-row__avatar is-new">
                <MapPin size={14} strokeWidth={1.75} />
              </div>
              <div className="catalog-lead-list-row__main">
                <span className="catalog-lead-list-row__name">{l.name || l.trade_name || 'Lead'}</span>
                <span className="catalog-lead-list-row__meta">{l.city || l.phone || 'Novo'}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <button type="button" className="catalog-panel__more" onClick={openLeads}>
          Ver todos os leads
          <ChevronRight size={13} />
        </button>
      )}
    </div>
  )
}