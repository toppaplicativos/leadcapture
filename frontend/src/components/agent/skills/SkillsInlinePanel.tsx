import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { Loader2, Brain, ChevronRight, ExternalLink, Sparkles } from 'lucide-react'
import { useSkillsBridgeOptional, type SkillRow } from '@/lib/agent/SkillsBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { CatalogManagerSheet } from '@/components/agent/catalog/CatalogManagerSheet'

const SkillsManager = lazy(() =>
  import('@/pages/BrandSkillsPage').then((m) => ({ default: m.BrandSkillsPage })),
)

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h.Authorization = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

function mapSkill(s: any): SkillRow {
  return {
    id: String(s.id),
    name: s.name || 'Habilidade',
    type: s.skill_type || s.type || 'custom',
    active: !!s.is_active || !!s.active,
    confidence: Number(s.confidence_score ?? s.confidence ?? 0),
  }
}

export function SkillsInlinePanel() {
  const bridge = useSkillsBridgeOptional()
  const { openCanvas, onOpenModal } = useAgentShell()
  const isDesktop = useIsDesktop()
  const snap = bridge?.snapshot
  const publishSnapshot = bridge?.publishSnapshot
  const [loading, setLoading] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/brand-skills', { headers: getHeaders() })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || 'Erro')
      const list = (Array.isArray(d?.skills) ? d.skills : []).map(mapSkill)
      publishSnapshot?.({
        skills: list,
        total: list.length,
        activeCount: list.filter((s: SkillRow) => s.active).length,
        loading: false,
      })
    } catch {
      publishSnapshot?.({ loading: false })
    } finally {
      setLoading(false)
    }
  }, [publishSnapshot])

  const openManager = useCallback(() => {
    if (isDesktop) openCanvas('/habilidades')
    else setManagerOpen(true)
  }, [isDesktop, openCanvas])

  const registerHandlers = bridge?.registerHandlers
  useEffect(() => {
    if (!registerHandlers) return
    return registerHandlers({
      openFull: () => openManager(),
      openTrainer: () => onOpenModal('skill-trainer'),
      refresh: () => { void load() },
      selectSkill: (id, name) => {
        publishSnapshot?.({ selectedId: id, selectedName: name || '' })
        if (isDesktop) openCanvas('/habilidades')
      },
    })
  }, [registerHandlers, openCanvas, onOpenModal, load, publishSnapshot, isDesktop, openManager])

  useEffect(() => {
    if (!snap?.skills.length && !loading) void load()
  }, [snap?.skills.length, loading, load])

  const preview = (snap?.skills || []).slice(0, 6)

  if ((loading || snap?.loading) && !preview.length) {
    return (
      <div className="catalog-panel__loading">
        <Loader2 size={18} className="animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="catalog-panel catalog-panel--skills">
      <div className="catalog-panel__toolbar">
        <p className="catalog-skills__meta">
          {snap?.total || 0} habilidade{(snap?.total || 0) === 1 ? '' : 's'}
          {(snap?.activeCount || 0) > 0 && ` · ${snap?.activeCount} ativa${snap?.activeCount === 1 ? '' : 's'}`}
        </p>
        <button type="button" className="catalog-panel__action catalog-panel__action--ghost" onClick={openManager}>
          <ExternalLink size={14} /> Gerenciar
        </button>
      </div>

      {preview.length === 0 ? (
        <div className="catalog-skills-empty">
          <Brain size={20} className="text-gray-300" />
          <p>Nenhuma habilidade ainda.</p>
          <button type="button" className="catalog-panel__action catalog-panel__action--skills" onClick={() => onOpenModal('skill-trainer')}>
            <Sparkles size={14} /> Ensinar primeira habilidade
          </button>
        </div>
      ) : (
        <div className="catalog-skills-list">
          {preview.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`catalog-skills-row ${s.active ? 'is-active' : ''}`}
              onClick={() => bridge?.dispatch({ type: 'select_skill', id: s.id, name: s.name })}
            >
              <span className={`catalog-skills-row__dot ${s.active ? 'is-on' : ''}`} />
              <span className="catalog-skills-row__name">{s.name}</span>
              <span className="catalog-skills-row__meta">{s.type}</span>
            </button>
          ))}
        </div>
      )}

      {(snap?.total || 0) > preview.length && (
        <button type="button" className="catalog-panel__overflow" onClick={openManager}>
          +{(snap?.total || 0) - preview.length} · Ver completo
        </button>
      )}

      <button type="button" className="catalog-panel__open-manager" onClick={openManager}>
        Gerenciar habilidades
        <ChevronRight size={13} />
      </button>

      <CatalogManagerSheet
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        title="Habilidades"
        subtitle="Treinar e gerenciar brand skills"
      >
        <Suspense fallback={<div className="catalog-panel__loading"><Loader2 size={20} className="animate-spin text-gray-400" /></div>}>
          <SkillsManager />
        </Suspense>
      </CatalogManagerSheet>
    </div>
  )
}