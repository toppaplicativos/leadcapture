import { useEffect, useState } from 'react'
import { Sparkles, MessageSquare } from 'lucide-react'
import { AgentUIRenderer } from './AgentUIRenderer'
import { AICampaignWizardModal } from '@/components/AICampaignWizardModal'
import { SkillTrainerWizardModal } from '@/components/SkillTrainerWizardModal'
import { CanvasPageEmbed, isCanvasFlushRoute } from '@/lib/agent/canvasPages'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { turnNeedsCanvas } from '@/lib/agent/canvasRegistry'
import type { AgentModalId } from '@/lib/agent/types'

export function AgentCanvas({ children }: { children?: React.ReactNode }) {
  const {
    activeTurn,
    canvasMode,
    embeddedRoute,
    desktopCanvasOpen,
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

  const showEmbed = canvasMode === 'embed' && embeddedRoute
  const showAgentUI = canvasMode === 'agent'
    && activeTurn?.components
    && activeTurn.components.length > 0
    && turnNeedsCanvas(activeTurn)
  const showPage = canvasMode === 'page' && children

  const hasContent = showEmbed || showAgentUI || showPage
  const flush = Boolean(showEmbed && embeddedRoute && isCanvasFlushRoute(embeddedRoute))

  if (!desktopCanvasOpen && !hasContent) {
    return null
  }

  return (
    <div className="agent-canvas flex flex-col h-full min-h-0">
      <div
        className={`agent-canvas__body flex-1 min-h-0 overflow-y-auto${flush ? '' : ' agent-canvas__body--inset'}`}
      >
        {showEmbed ? (
          <CanvasPageEmbed route={embeddedRoute!} />
        ) : showAgentUI ? (
          <div className="agent-canvas__stage">
            {activeTurn?.message && (
              <header className="agent-canvas__head">
                <Sparkles size={16} className="text-brand shrink-0" />
                <div>
                  <p className="agent-canvas__title">{activeTurn.message}</p>
                  {activeTurn.skill && (
                    <p className="agent-canvas__meta">{activeTurn.squad} · {activeTurn.skill}</p>
                  )}
                </div>
              </header>
            )}
            <AgentUIRenderer
              components={activeTurn?.components}
              callbacks={callbacks}
            />
          </div>
        ) : showPage ? (
          <div className="agent-canvas__page">{children}</div>
        ) : (
          <div className="agent-canvas__empty">
            <div className="agent-canvas__empty-icon">
              <MessageSquare size={22} strokeWidth={1.5} />
            </div>
            <p className="agent-canvas__empty-title">Canvas</p>
            <p className="agent-canvas__empty-desc">
              Tarefas pesadas — fluxos, criativos, dashboards — abrem aqui sem sair do chat.
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