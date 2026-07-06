import { useState, useCallback } from 'react'
import { getHeaders } from '@/lib/admin/helpers'
import type {
  AgentChatMessage,
  AgentTurn,
  ComponentEvent,
  SkillContext,
} from './types'

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

export function useAdminAgentChat(currentPath: string) {
  const [messages, setMessages] = useState<AgentChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingContext, setPendingContext] = useState<SkillContext | undefined>()

  const send = useCallback(async (
    text: string,
    opts?: { componentEvent?: ComponentEvent; skillContext?: SkillContext; directSkill?: string },
  ) => {
    const trimmed = text.trim()
    const isDirect = !!opts?.directSkill
    const isEventOnly = !!opts?.componentEvent && !trimmed
    if ((!trimmed && !isEventOnly && !isDirect) || loading) return

    setError(null)
    const displayText = trimmed || (
      isDirect
        ? (opts?.skillContext?.label as string) || 'Abrir ferramenta'
        : opts?.componentEvent?.action === 'submit_form'
          ? 'Buscar'
          : opts?.componentEvent?.action === 'select_option'
            ? String(opts.componentEvent.payload?.label || opts.componentEvent.payload?.optionId || 'Selecionar')
            : 'Selecionar'
    )
    const userMsg: AgentChatMessage = { id: uid(), role: 'user', content: displayText }
    const placeholder: AgentChatMessage = { id: uid(), role: 'assistant', content: '', loading: true }

    const historyForApi = [...messages, ...(trimmed || isEventOnly || isDirect ? [userMsg] : [])]
    setMessages((prev) => [...prev, ...(trimmed || isEventOnly || isDirect ? [userMsg] : []), placeholder])
    setLoading(true)

    const skillContext: SkillContext | undefined = {
      ...pendingContext,
      ...opts?.skillContext,
      ...(opts?.componentEvent ? { nextSkill: pendingContext?.nextSkill } : {}),
    }

    try {
      const res = await fetch('/api/admin-agent/chat', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          message: trimmed,
          currentPath,
          history: historyForApi
            .filter((m) => !m.loading && (m.role === 'user' || (m.role === 'assistant' && !!m.content)))
            .slice(-16)
            .map((m) => ({ role: m.role, content: m.content || m.turn?.message || '' })),
          skillContext: Object.keys(skillContext || {}).length ? skillContext : undefined,
          componentEvent: opts?.componentEvent,
          directSkill: opts?.directSkill,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        const msg = data.message || (
          data.error === 'ai_not_configured'
            ? 'Configure um provedor de IA em Provedores IA.'
            : 'Falha ao processar. Tente novamente.'
        )
        throw new Error(msg)
      }

      const turn: AgentTurn = data.turn
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholder.id
            ? { ...m, loading: false, content: turn.message, turn }
            : m,
        ),
      )
      setPendingContext(turn.nextSkill ? { nextSkill: turn.nextSkill } : undefined)
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado')
      setMessages((prev) => prev.filter((m) => m.id !== placeholder.id))
    } finally {
      setLoading(false)
    }
  }, [loading, messages, currentPath, pendingContext])

  const handleComponentEvent = useCallback((event: ComponentEvent, skillContext?: SkillContext) => {
    send('', { componentEvent: event, skillContext })
  }, [send])

  const triggerSkill = useCallback((
    skillId: string,
    opts?: { label?: string; context?: SkillContext; assistantMessage?: string },
  ) => {
    const label = opts?.label || 'Abrir ferramenta'
    send(label, {
      directSkill: skillId,
      skillContext: { ...opts?.context, label, assistantMessage: opts?.assistantMessage },
    })
  }, [send])

  return {
    messages,
    setMessages,
    loading,
    error,
    send,
    triggerSkill,
    handleComponentEvent,
  }
}