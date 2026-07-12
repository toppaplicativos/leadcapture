import { useEffect, useState, type FormEvent } from 'react'
import {
  Search, MapPin, Building2, Zap, Pause, Sparkles, Loader2, Filter,
  ChevronDown, ChevronUp, Maximize2,
} from 'lucide-react'
import { useProspectBridge } from '@/lib/agent/ProspectBridgeContext'

function radiusLabel(radius: string) {
  const n = Number(radius || 3)
  return n < 1 ? `${Math.round(n * 1000)}m` : `${n.toFixed(n < 10 ? 1 : 0)}km`
}

export function ProspectSearchControls({ compact, placement = 'chat' }: { compact?: boolean; placement?: 'chat' | 'canvas' | 'sheet' }) {
  const bridge = useProspectBridge()
  const snap = bridge.snapshot
  const [query, setQuery] = useState(snap.query)
  const [location, setLocation] = useState(snap.location)
  const [radius, setRadius] = useState(snap.radius || '3')
  const [advanced, setAdvanced] = useState(false)

  useEffect(() => {
    setQuery(snap.query)
    setLocation(snap.location)
    setRadius(snap.radius || '3')
  }, [snap.query, snap.location, snap.radius])

  function submit(e: FormEvent) {
    e.preventDefault()
    const q = query.trim()
    const loc = location.trim()
    if (!q || !loc) return
    bridge.dispatch({ type: 'search', query: q, location: loc, radius })
  }

  function onRadiusChange(v: string) {
    setRadius(v)
    bridge.dispatch({ type: 'apply', radius: v })
  }

  const busy = snap.loading || snap.radarLoading || snap.prospecting

  return (
    <form className={`prospect-controls prospect-controls--${placement}`} onSubmit={submit}>
      <div className="prospect-controls__metrics">
        <div className="prospect-controls__metric">
          <span className="prospect-controls__metric-val">{snap.inRange || snap.found}</span>
          <span className="prospect-controls__metric-lbl">No raio</span>
        </div>
        <div className="prospect-controls__metric">
          <span className="prospect-controls__metric-val prospect-controls__metric-val--new">{snap.newInRange || snap.newCount}</span>
          <span className="prospect-controls__metric-lbl">Novos</span>
        </div>
        <div className="prospect-controls__metric">
          <span className="prospect-controls__metric-val prospect-controls__metric-val--ok">{snap.capturedLive}</span>
          <span className="prospect-controls__metric-lbl">Captados</span>
        </div>
        <div className="prospect-controls__metric">
          <span className="prospect-controls__metric-val">{snap.todayCount}</span>
          <span className="prospect-controls__metric-lbl">Hoje</span>
        </div>
      </div>

      <div className={`prospect-controls__fields ${compact ? 'prospect-controls__fields--compact' : ''}`}>
        <label className="prospect-controls__field">
          <Building2 size={12} className="prospect-controls__field-icon" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              bridge.dispatch({ type: 'apply', query: e.target.value })
            }}
            placeholder="Segmento"
            required
          />
        </label>
        <label className="prospect-controls__field">
          <MapPin size={12} className="prospect-controls__field-icon" />
          <input
            type="text"
            value={location}
            onChange={(e) => {
              setLocation(e.target.value)
              bridge.dispatch({ type: 'apply', location: e.target.value })
            }}
            placeholder="Cidade"
            required
          />
        </label>
      </div>

      <div className="prospect-controls__radius">
        <div className="prospect-controls__radius-head">
          <span>Raio</span>
          <span className="tabular-nums">{radiusLabel(radius)}</span>
        </div>
        <input
          type="range"
          min={0.5}
          max={30}
          step={0.5}
          value={Number(radius || 3)}
          onChange={(e) => onRadiusChange(e.target.value)}
          className="prospect-controls__range"
        />
      </div>

      <div className="prospect-controls__actions">
        <button type="submit" className="prospect-controls__btn prospect-controls__btn--primary" disabled={busy}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          {busy ? 'Buscando…' : 'Buscar'}
        </button>
        <button
          type="button"
          className={`prospect-controls__btn ${snap.autoCapture ? 'is-on' : ''}`}
          onClick={() => bridge.dispatch({ type: 'toggle_auto_capture' })}
        >
          {snap.autoCapture ? <Zap size={12} /> : <Pause size={12} />}
          Auto
        </button>
        <button
          type="button"
          className="prospect-controls__btn"
          onClick={() => bridge.dispatch({ type: 'capture_batch' })}
          disabled={!snap.newCount || snap.batchCapturing}
        >
          <Zap size={12} />
          Captar ({snap.newCount})
        </button>
        <button
          type="button"
          className="prospect-controls__btn prospect-controls__btn--icon"
          onClick={() => bridge.dispatch({ type: 'open_ideas' })}
          title="Gerar ideias IA"
        >
          <Sparkles size={12} />
        </button>
        <button
          type="button"
          className="prospect-controls__btn prospect-controls__btn--icon"
          onClick={() => bridge.dispatch({ type: 'set_immersive', value: true })}
          title="Modo imersivo"
        >
          <Maximize2 size={12} />
        </button>
        <button
          type="button"
          className="prospect-controls__btn prospect-controls__btn--icon"
          onClick={() => setAdvanced((v) => !v)}
          aria-expanded={advanced}
        >
          <Filter size={12} />
          {advanced ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>
      </div>

      {advanced && (
        <div className="prospect-controls__advanced">
          <label className="prospect-controls__toggle">
            <span>Automação pós-captura</span>
            <button
              type="button"
              role="switch"
              aria-checked={snap.automate}
              className={`prospect-controls__switch ${snap.automate ? 'is-on' : ''}`}
              onClick={() => bridge.dispatch({ type: 'toggle_automate' })}
            />
          </label>
        </div>
      )}

      {snap.error && (
        <p className="prospect-controls__error">{snap.error}</p>
      )}
    </form>
  )
}
