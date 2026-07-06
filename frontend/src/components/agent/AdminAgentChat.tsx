import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { X, Sparkles, Bot, ChevronDown } from 'lucide-react'
import { AgentConversation } from './AgentConversation'
import { AICampaignWizardModal } from '@/components/AICampaignWizardModal'
import { SkillTrainerWizardModal } from '@/components/SkillTrainerWizardModal'
import { useAdminAgentChat } from '@/lib/agent/useAdminAgentChat'
import { resolveTrigger } from '@/lib/agent/workspaceTriggers'
import type { AgentModalId, AgentTurn } from '@/lib/agent/types'

const STORAGE_KEY = 'leadcapture:admin-agent-chat:v1'

const SUGGESTED_PROMPTS = [
  'Como está meu agente?',
  'Mostrar painel',
  'Últimos leads',
  'Conversas recentes',
  'Criar campanha com IA',
]

const WELCOME_TURN: AgentTurn = {
  message:
    'Sou o assistente do painel. Diga o que precisa — mostro dados, configuro o agente ou abro wizards — tudo pela conversa.',
  components: [{
    id: 'welcome-nav',
    type: 'nav_suggestions',
    props: {
      items: [
        { path: '/assistente', label: 'Modo conversacional' },
        { path: '/admin', label: 'Painel' },
        { path: '/agente', label: 'Agente IA' },
        { path: '/leads', label: 'Leads' },
        { path: '/campanhas', label: 'Campanhas' },
      ],
    },
  }],
}

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function persist(messages: unknown[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-20)))
  } catch { /* ignore */ }
}

export function AdminAgentChat() {
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [input, setInput] = useState('')
  const [campaignModal, setCampaignModal] = useState(false)
  const [skillModal, setSkillModal] = useState(false)

  const { messages, setMessages, loading, error, send, triggerSkill, handleComponentEvent } = useAdminAgentChat(
    location.pathname,
  )

  useEffect(() => {
    const stored = loadStored()
    if (stored.length) setMessages(stored)
  }, [setMessages])

  useEffect(() => { persist(messages) }, [messages])

  useEffect(() => {
    if (location.pathname === '/assistente') return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('admin-agent:open', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('admin-agent:open', onOpen)
    }
  }, [location.pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const callbacks = {
    onNavigate: (path: string) => {
      navigate(path)
      setOpen(false)
    },
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
      setOpen(false)
    },
    onOpenModal: (modal: AgentModalId) => {
      if (modal === 'ai-campaign') setCampaignModal(true)
      if (modal === 'skill-trainer') setSkillModal(true)
    },
    onSendMessage: send,
    onComponentEvent: handleComponentEvent,
  }

  if (location.pathname === '/assistente') return null

  const panelWidth = expanded ? 'w-full sm:w-[480px]' : 'w-full sm:w-[380px]'

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir assistente (Ctrl+K)"
          title="Assistente (Ctrl+K)"
          className="fixed bottom-[76px] right-4 lg:bottom-6 lg:right-6 z-[250] w-12 h-12 rounded-2xl bg-gray-900 text-white shadow-lg hover:bg-gray-800 active:scale-95 transition-all grid place-items-center"
        >
          <Sparkles size={20} strokeWidth={1.75} />
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-[260] lg:bg-transparent"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        className={`fixed bottom-0 right-0 lg:bottom-6 lg:right-6 z-[270] ${panelWidth} max-h-[min(92vh,720px)] flex flex-col bg-white border border-border-light rounded-t-2xl lg:rounded-2xl shadow-2xl transition-all duration-200 ${
          open ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="shrink-0 flex items-center gap-2.5 px-4 py-3 border-b border-border-light">
          <div className="w-8 h-8 rounded-xl bg-gray-900 text-white grid place-items-center shrink-0">
            <Bot size={16} strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-gray-900">Assistente</p>
            <p className="text-[10px] text-gray-400">Ctrl+K · UI dirigida por conversa</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/assistente')}
            className="hidden sm:inline-flex px-2 h-7 rounded-lg text-[10px] font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
          >
            Tela cheia
          </button>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="hidden sm:grid w-8 h-8 place-items-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
            title={expanded ? 'Recolher' : 'Expandir'}
          >
            <ChevronDown size={16} className={expanded ? 'rotate-180' : ''} />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar"
            className="w-8 h-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
          >
            <X size={16} />
          </button>
        </div>

        <AgentConversation
          messages={messages}
          loading={loading}
          error={error}
          input={input}
          onInputChange={setInput}
          onSend={(text) => { send(text); setInput('') }}
          callbacks={callbacks}
          welcomeTurn={WELCOME_TURN}
          suggestedPrompts={SUGGESTED_PROMPTS}
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
    </>
  )
}