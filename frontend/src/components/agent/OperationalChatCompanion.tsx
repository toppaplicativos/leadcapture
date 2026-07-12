/**
 * Companion operacional no rail: alerta compacto do agente (não card gigante).
 * Conteúdo pesado fica no canvas.
 */
import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  BookOpen, Camera, Bot, Headphones, Brain, Zap, type LucideIcon,
} from 'lucide-react'
// BookOpen used in context bar
import { isOperationalCanvasPath, pathOnly } from '@/lib/agent/operationalRoutes'
import { AgentChatAlert, type AgentChatAlertTone } from '@/components/agent/AgentChatAlert'

type CompanionConfig = {
  title: string
  subtitle: string
  actions: Array<{ label: string; path?: string; hash?: string; primary?: boolean }>
  Icon: LucideIcon
  tone: AgentChatAlertTone
}

const ROUTE_COMPANIONS: Record<string, CompanionConfig> = {
  '/atendente': {
    title: 'Atendente no painel',
    subtitle: 'Treino global + canais Instagram e WhatsApp ao lado.',
    Icon: Headphones,
    tone: 'ok',
    actions: [
      { label: 'Global', hash: 'global', primary: true },
      { label: 'Instagram', hash: 'instagram' },
      { label: 'WhatsApp', hash: 'whatsapp' },
    ],
  },
  '/agente': {
    title: 'Agente IA',
    subtitle: 'Prontidão e conhecimento no painel. Treino multi-canal em Atendente.',
    Icon: Bot,
    tone: 'info',
    actions: [
      { label: 'Abrir Atendente', path: '/atendente', primary: true },
      { label: 'Habilidades', path: '/habilidades' },
    ],
  },
  '/habilidades': {
    title: 'Habilidades',
    subtitle: 'Skills da marca no painel — usam WhatsApp e pack do Instagram.',
    Icon: Brain,
    tone: 'warn',
    actions: [
      { label: 'Atendente', path: '/atendente', primary: true },
    ],
  },
  '/instagram': {
    title: 'Instagram no painel',
    subtitle: 'Studio à direita. Treino de Direct: Atendente → Instagram.',
    Icon: Camera,
    tone: 'instagram',
    actions: [
      { label: 'Treinar atendimento', path: '/atendente', primary: true },
    ],
  },
}

const DEFAULT_COMPANION: CompanionConfig = {
  title: 'Painel ativo',
  subtitle: 'O conteúdo está no canvas. O chat só acompanha o contexto.',
  Icon: Zap,
  tone: 'neutral',
  actions: [{ label: 'Início', path: '/admin' }],
}

export function requestAtendenteTab(tab: 'global' | 'instagram' | 'whatsapp') {
  try {
    window.dispatchEvent(new CustomEvent('lc:atendente-tab', { detail: { tab } }))
  } catch {
    /* ignore */
  }
}

export function OperationalChatCompanion() {
  const location = useLocation()
  const navigate = useNavigate()
  const path = pathOnly(location.pathname)

  const config = useMemo(() => {
    if (!isOperationalCanvasPath(path)) return null
    return ROUTE_COMPANIONS[path] || { ...DEFAULT_COMPANION, title: path.replace(/^\//, '') || 'Painel' }
  }, [path])

  if (!config) return null

  // O treinamento do Instagram já tem uma área própria no studio. No chat,
  // manter apenas respiro visual evita transformar uma configuração concluída
  // em alerta permanente.
  if (path === '/instagram') {
    return <div className="operational-chat-spacer" aria-hidden="true" />
  }

  return (
    <div className="px-3 pt-2 pb-0.5" data-operational-companion={path}>
      <AgentChatAlert
        tone={config.tone}
        icon={config.Icon}
        title={config.title}
        description={config.subtitle}
        actions={config.actions.map((act) => ({
          label: act.label,
          primary: !!act.primary,
          onClick: () => {
            if (act.path) {
              navigate(act.path)
              return
            }
            if (act.hash === 'global' || act.hash === 'instagram' || act.hash === 'whatsapp') {
              requestAtendenteTab(act.hash)
              if (path !== '/atendente') navigate('/atendente')
            }
          },
        }))}
      />
    </div>
  )
}

/** Barra mínima quando já há mensagens — só contexto, zero card. */
export function OperationalChatContextBar() {
  const location = useLocation()
  const path = pathOnly(location.pathname)
  if (!isOperationalCanvasPath(path)) return null

  const label =
    path === '/atendente' ? 'Atendente'
      : path === '/instagram' ? 'Instagram'
        : path === '/agente' ? 'Agente IA'
          : path === '/habilidades' ? 'Habilidades'
            : path.replace(/^\//, '')

  return (
    <div className="agent-chat-context-bar" data-operational-context={path}>
      <BookOpen size={11} className="opacity-50 shrink-0" aria-hidden />
      <span className="truncate font-semibold text-gray-600">{label}</span>
      <span className="text-gray-400 font-normal">· painel ao lado</span>
    </div>
  )
}
