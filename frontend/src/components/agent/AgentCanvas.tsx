import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Sparkles, MessageSquare } from 'lucide-react'
import { AgentUIRenderer } from './AgentUIRenderer'
import { AICampaignWizardModal } from '@/components/AICampaignWizardModal'
import { SkillTrainerWizardModal } from '@/components/SkillTrainerWizardModal'
import { CanvasPageCache, isCanvasFlushRoute, normalizeCanvasPath } from '@/lib/agent/canvasPages'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { turnNeedsCanvas } from '@/lib/agent/canvasRegistry'
import { isAgentHomePath, isOperationalCanvasPath, pathOnly } from '@/lib/agent/operationalRoutes'
import type { AgentModalId } from '@/lib/agent/types'

export function AgentCanvas({ children }: { children?: React.ReactNode }) {
  const location = useLocation()
  const {
    activeTurn,
    canvasMode,
    embeddedRoute,
    desktopCanvasOpen,
    optimisticRoute,
    onNavigate,
    triggerNav,
    onOpenModal,
    registerOpenModal,
    send,
    handleComponentEvent,
  } = useAgentShell()

  const [campaignModal, setCampaignModal] = useState(false)
  const [skillModal, setSkillModal] = useState(false)

  useEffect(() => {
    registerOpenModal((modal: AgentModalId) => {
      if (modal === 'ai-campaign') setCampaignModal(true)
      if (modal === 'skill-trainer') setSkillModal(true)
    })
  }, [registerOpenModal])

  const callbacks = {
    onNavigate,
    onTriggerNav: triggerNav,
    onOpenModal,
    onSendMessage: send,
    onComponentEvent: handleComponentEvent,
  }

  const pathname = pathOnly(location.pathname)
  // Rota otimista: troca o painel no clique, sem esperar o React Router
  const displayPath = normalizeCanvasPath(optimisticRoute || pathname)
  const urlDriven = isOperationalCanvasPath(pathname) || isOperationalCanvasPath(displayPath)

  // ─── URL LOCK + keep-alive ────────────────────────────────────────────────
  if (urlDriven) {
    const flushUrl = isCanvasFlushRoute(displayPath)
    return (
      <div className="agent-canvas flex flex-col h-full min-h-0" data-canvas-lock="url">
        <div
          className={`agent-canvas__body flex-1 min-h-0 overflow-y-auto${flushUrl ? '' : ' agent-canvas__body--inset'}`}
        >
          <CanvasPageCache activeRoute={displayPath} />
        </div>
        <AICampaignWizardModal
          open={campaignModal}
          onClose={() => setCampaignModal(false)}
          onCampaignCreated={(id) => {
            setCampaignModal(false)
            onNavigate(`/campanhas?review=${id}`)
          }}
        />
        <SkillTrainerWizardModal
          open={skillModal}
          onClose={() => setSkillModal(false)}
          onSkillCreated={() => {
            setSkillModal(false)
            send('Mostrar minhas habilidades')
          }}
        />
      </div>
    )
  }

  const activeCanvasRoute =
    canvasMode === 'embed' && (optimisticRoute || embeddedRoute)
      ? normalizeCanvasPath(optimisticRoute || embeddedRoute || '')
      : null

  const showEmbed = Boolean(activeCanvasRoute)
  const showAgentUI =
    !showEmbed &&
    canvasMode === 'agent' &&
    !!activeTurn?.components &&
    activeTurn.components.length > 0 &&
    turnNeedsCanvas(activeTurn)
  const showPage =
    !showEmbed &&
    !showAgentUI &&
    canvasMode === 'page' &&
    Boolean(children)

  const hasContent = showEmbed || showAgentUI || showPage
  const forceOpen = desktopCanvasOpen || hasContent
  const flush = Boolean(showEmbed && activeCanvasRoute && isCanvasFlushRoute(activeCanvasRoute))

  if (!forceOpen) {
    return null
  }

  return (
    <div className="agent-canvas flex flex-col h-full min-h-0" data-canvas-lock="shell">
      <div
        className={`agent-canvas__body flex-1 min-h-0 overflow-y-auto${flush ? '' : ' agent-canvas__body--inset'}`}
      >
        {showEmbed && activeCanvasRoute ? (
          <CanvasPageCache activeRoute={activeCanvasRoute} />
        ) : showAgentUI ? (
          <div className="agent-canvas__stage">
            {activeTurn?.message && (
              <header className="agent-canvas__head">
                <Sparkles size={16} className="text-brand shrink-0" />
                <div>
                  <p className="agent-canvas__title">{activeTurn.message}</p>
                  {activeTurn.skill && (
                    <p className="agent-canvas__meta">
                      {activeTurn.squad} · {activeTurn.skill}
                    </p>
                  )}
                </div>
              </header>
            )}
            <AgentUIRenderer components={activeTurn?.components} callbacks={callbacks} />
          </div>
        ) : showPage ? (
          <div className="agent-canvas__page" key={location.pathname}>
            {children}
          </div>
        ) : (
          <div className="agent-canvas__empty">
            <div className="agent-canvas__empty-icon">
              <MessageSquare size={22} strokeWidth={1.5} />
            </div>
            <p className="agent-canvas__empty-title">Painel de trabalho</p>
            <p className="agent-canvas__empty-desc">
              {isAgentHomePath(pathname)
                ? 'O chat à esquerda comanda. Mapas, leads, produtos e fluxos abrem aqui.'
                : 'Carregando painel…'}
            </p>
          </div>
        )}
      </div>

      <AICampaignWizardModal
        open={campaignModal}
        onClose={() => setCampaignModal(false)}
        onCampaignCreated={(id) => {
          setCampaignModal(false)
          onNavigate(`/campanhas?review=${id}`)
        }}
      />

      <SkillTrainerWizardModal
        open={skillModal}
        onClose={() => setSkillModal(false)}
        onSkillCreated={() => {
          setSkillModal(false)
          send('Mostrar minhas habilidades')
        }}
      />
    </div>
  )
}
