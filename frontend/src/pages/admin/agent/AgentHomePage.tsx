import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, Sparkles } from 'lucide-react'
import { AgentConversation } from '@/components/agent/AgentConversation'
import { AICampaignWizardModal } from '@/components/AICampaignWizardModal'
import { SkillTrainerWizardModal } from '@/components/SkillTrainerWizardModal'
import { useAdminAgentChat } from '@/lib/agent/useAdminAgentChat'
import { resolveTrigger } from '@/lib/agent/workspaceTriggers'
import type { AgentModalId, AgentTurn } from '@/lib/agent/types'

const WELCOME_TURN: AgentTurn = {
  message:
    'Bem-vindo ao modo conversacional. Diga o que precisa — mostro leads, campanhas, produtos ou configuro seu agente — tudo montado aqui, sem páginas.',
  components: [{
    id: 'home-nav',
    type: 'nav_suggestions',
    props: {
      items: [
        { path: '/admin', label: 'Painel clássico' },
        { path: '/leads', label: 'Leads' },
        { path: '/agente', label: 'Agente IA' },
        { path: '/campanhas', label: 'Campanhas' },
      ],
    },
  }],
}

const SUGGESTED = [
  'Mostrar painel',
  'Últimos leads',
  'Quero editar o lead João',
  'Conversas recentes',
  'Criar campanha com IA',
]

export function AgentHomePage() {
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const [campaignModal, setCampaignModal] = useState(false)
  const [skillModal, setSkillModal] = useState(false)
  const brandId = String(localStorage.getItem('lead-system:active-brand-id') || '').trim()
  const { messages, loading, error, send, triggerSkill, handleComponentEvent } = useAdminAgentChat('/assistente', brandId)

  const callbacks = {
    onNavigate: (path: string) => navigate(path),
    onTriggerNav: (navKeyOrPath: string) => {
      const trigger = resolveTrigger(navKeyOrPath)
      if (trigger) {
        triggerSkill(trigger.skill, {
          label: trigger.userLabel,
          assistantMessage: trigger.assistantMessage,
          context: trigger.context,
        })
        return
      }
      navigate(navKeyOrPath.startsWith('/') ? navKeyOrPath : `/${navKeyOrPath}`)
    },
    onOpenModal: (modal: AgentModalId) => {
      if (modal === 'ai-campaign') setCampaignModal(true)
      if (modal === 'skill-trainer') setSkillModal(true)
    },
    onSendMessage: send,
    onComponentEvent: handleComponentEvent,
  }

  return (
    <div className="h-full flex flex-col bg-bg">
      <header className="shrink-0 border-b border-border-light bg-white/90 backdrop-blur-xl px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gray-900 text-white grid place-items-center">
            <Bot size={18} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-[18px] font-bold tracking-tight text-gray-900 flex items-center gap-2">
              Assistente
              <Sparkles size={14} className="text-brand" />
            </h1>
            <p className="text-[12px] text-gray-500">UI as a Conversation — digite sua intenção</p>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 max-w-3xl mx-auto w-full">
        <AgentConversation
          messages={messages}
          loading={loading}
          error={error}
          input={input}
          onInputChange={setInput}
          onSend={(text) => { send(text); setInput('') }}
          callbacks={callbacks}
          welcomeTurn={WELCOME_TURN}
          suggestedPrompts={SUGGESTED}
          fullPage
        />
      </div>

      <AICampaignWizardModal
        open={campaignModal}
        onClose={() => setCampaignModal(false)}
        onCampaignCreated={(id) => {
          setCampaignModal(false)
          navigate(`/campanhas?review=${id}`)
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