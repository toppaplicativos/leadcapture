import { useState, useCallback, useEffect, useRef } from 'react'
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

function storageKey(brandId: string) {
  return `leadcapture:workspace-chat:v2:${brandId || 'default'}`
}

function loadLocalFallback(brandId: string): AgentChatMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(brandId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as AgentChatMessage[]
    return Array.isArray(parsed) ? parsed.filter((m) => m?.role && m.id) : []
  } catch {
    return []
  }
}

function saveLocalFallback(brandId: string, messages: AgentChatMessage[]) {
  try {
    localStorage.setItem(storageKey(brandId), JSON.stringify(messages.slice(-40)))
  } catch { /* ignore */ }
}

export type AdminAgentSessionItem = {
  id: string
  title?: string | null
  summary?: string | null
  is_pinned?: boolean
  is_active?: boolean
  created_at?: string
  updated_at?: string
  last_message_at?: string | null
  pending_context?: SkillContext | null
}

export type AdminAgentSearchHit = {
  session: AdminAgentSessionItem
  score: number
  snippet: string | null
  matchSource: 'title' | 'summary' | 'message'
}

export type AdminAgentMemory = {
  facts: string[]
  preferences: Record<string, string>
  last_topics: string[]
  turn_count: number
}

const EMPTY_MEMORY: AdminAgentMemory = {
  facts: [],
  preferences: {},
  last_topics: [],
  turn_count: 0,
}

type SessionMeta = AdminAgentSessionItem

type StoredMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  turn_json?: AgentTurn | null
  skill?: string | null
}

function mapStoredMessages(stored: StoredMessage[]): AgentChatMessage[] {
  return stored.map((m) => ({
    id: m.id || uid(),
    role: m.role,
    content: m.content || m.turn_json?.message || '',
    turn: m.turn_json || undefined,
  }))
}

function applySessionPayload(
  targetBrandId: string,
  session: SessionMeta | null | undefined,
  stored: StoredMessage[],
  setters: {
    setMessages: (m: AgentChatMessage[]) => void
    setSessionId: (id: string | null) => void
    setSessionTitle: (t: string | null) => void
    setPendingContext: (c: SkillContext | undefined) => void
  },
) {
  if (!session?.id) {
    setters.setMessages([])
    setters.setSessionId(null)
    setters.setSessionTitle(null)
    setters.setPendingContext(undefined)
    saveLocalFallback(targetBrandId, [])
    return
  }

  const hydrated = mapStoredMessages(stored)
  setters.setMessages(hydrated)
  saveLocalFallback(targetBrandId, hydrated)
  setters.setSessionId(session.id)
  setters.setSessionTitle(session.title || null)
  setters.setPendingContext(session.pending_context || undefined)
}

export function useAdminAgentChat(currentPath: string, brandId = '') {
  const [messages, setMessages] = useState<AgentChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingContext, setPendingContext] = useState<SkillContext | undefined>()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionTitle, setSessionTitle] = useState<string | null>(null)
  const [sessionHydrating, setSessionHydrating] = useState(true)
  const [sessions, setSessions] = useState<AdminAgentSessionItem[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [brandMemory, setBrandMemory] = useState<AdminAgentMemory>(EMPTY_MEMORY)
  const [sessionSummary, setSessionSummary] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<AdminAgentSearchHit[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchAbortRef = useRef<AbortController | null>(null)
  const hydrateKeyRef = useRef('')

  const hydrateSession = useCallback(async (targetBrandId: string, path: string) => {
    if (!targetBrandId) {
      setSessionHydrating(false)
      return
    }
    setSessionHydrating(true)
    try {
      const res = await fetch(
        `/api/admin-agent/sessions/active?currentPath=${encodeURIComponent(path)}`,
        { headers: getHeaders() },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'hydrate_failed')

      applySessionPayload(
        targetBrandId,
        data.session as SessionMeta | undefined,
        (data.messages || []) as StoredMessage[],
        { setMessages, setSessionId, setSessionTitle, setPendingContext },
      )
      setBrandMemory((data.brandMemory as AdminAgentMemory) || EMPTY_MEMORY)
      setSessionSummary((data.session as SessionMeta | undefined)?.summary || null)
    } catch {
      setMessages([])
      setSessionId(null)
      setSessionTitle(null)
      setPendingContext(undefined)
      setBrandMemory(EMPTY_MEMORY)
      setSessionSummary(null)
      saveLocalFallback(targetBrandId, [])
    } finally {
      setSessionHydrating(false)
    }
  }, [])

  useEffect(() => {
    const key = `${brandId}|${currentPath}`
    if (hydrateKeyRef.current === key) return
    hydrateKeyRef.current = key
    setMessages([])
    setSessionId(null)
    setSessionTitle(null)
    setSessionSummary(null)
    setPendingContext(undefined)
    void hydrateSession(brandId, currentPath)
  }, [brandId, currentPath, hydrateSession])

  useEffect(() => {
    if (!brandId || sessionHydrating) return
    saveLocalFallback(brandId, messages)
  }, [brandId, messages, sessionHydrating])

  const loadSessions = useCallback(async () => {
    if (!brandId) return []
    setSessionsLoading(true)
    try {
      const res = await fetch('/api/admin-agent/sessions', { headers: getHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar histórico')
      const list = (data.sessions || []) as AdminAgentSessionItem[]
      setSessions(list)
      return list
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar histórico')
      return []
    } finally {
      setSessionsLoading(false)
    }
  }, [brandId])

  const switchSession = useCallback(async (targetSessionId: string) => {
    if (!brandId || !targetSessionId || targetSessionId === sessionId) return
    setSessionHydrating(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin-agent/sessions/${targetSessionId}/activate`, {
        method: 'POST',
        headers: getHeaders(),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Falha ao abrir conversa')
      applySessionPayload(
        brandId,
        data.session as SessionMeta | undefined,
        (data.messages || []) as StoredMessage[],
        { setMessages, setSessionId, setSessionTitle, setPendingContext },
      )
      setBrandMemory((data.brandMemory as AdminAgentMemory) || EMPTY_MEMORY)
      setSessionSummary((data.session as SessionMeta | undefined)?.summary || null)
      void loadSessions()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao abrir conversa')
    } finally {
      setSessionHydrating(false)
    }
  }, [brandId, sessionId, loadSessions])

  const startNewSession = useCallback(async () => {
    if (!brandId) return
    setError(null)
    try {
      const res = await fetch('/api/admin-agent/sessions', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ currentPath }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Falha ao criar sessão')
      setSessionId(data.session?.id || null)
      setSessionTitle(data.session?.title || 'Nova conversa')
      setSessionSummary(null)
      setMessages([])
      setPendingContext(undefined)
      saveLocalFallback(brandId, [])
      void loadSessions()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar sessão')
    }
  }, [brandId, currentPath, loadSessions])

  const deleteSession = useCallback(async (targetSessionId: string) => {
    if (!brandId || !targetSessionId) return
    setError(null)
    const wasCurrent = targetSessionId === sessionId
    try {
      const res = await fetch(`/api/admin-agent/sessions/${targetSessionId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Falha ao excluir conversa')
      setSessions((data.sessions || []) as AdminAgentSessionItem[])
      if (!wasCurrent) return
      const active = data.activeSession as SessionMeta | null | undefined
      if (active?.id) {
        const actRes = await fetch(`/api/admin-agent/sessions/${active.id}/activate`, {
          method: 'POST',
          headers: getHeaders(),
        })
        const actData = await actRes.json().catch(() => ({}))
        if (actRes.ok) {
          applySessionPayload(
            brandId,
            actData.session as SessionMeta | undefined,
            (actData.messages || []) as StoredMessage[],
            { setMessages, setSessionId, setSessionTitle, setPendingContext },
          )
          setBrandMemory((actData.brandMemory as AdminAgentMemory) || EMPTY_MEMORY)
        }
      } else {
        setMessages([])
        setSessionId(null)
        setSessionTitle(null)
        setPendingContext(undefined)
        saveLocalFallback(brandId, [])
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir conversa')
    }
  }, [brandId, sessionId])

  const renameSession = useCallback(async (targetSessionId: string, title: string) => {
    if (!brandId || !targetSessionId) return
    const nextTitle = title.trim().slice(0, 200)
    if (!nextTitle) return
    setError(null)
    try {
      const res = await fetch(`/api/admin-agent/sessions/${targetSessionId}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ title: nextTitle }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Falha ao renomear')
      setSessions((prev) => prev.map((s) => (s.id === targetSessionId ? { ...s, title: nextTitle } : s)))
      if (targetSessionId === sessionId) setSessionTitle(nextTitle)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao renomear conversa')
    }
  }, [brandId, sessionId])

  const clearBrandMemory = useCallback(async () => {
    if (!brandId) return
    setError(null)
    try {
      const res = await fetch('/api/admin-agent/memory', { method: 'DELETE', headers: getHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Falha ao limpar memória')
      setBrandMemory((data.brandMemory as AdminAgentMemory) || EMPTY_MEMORY)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao limpar memória')
    }
  }, [brandId])

  const updateBrandMemory = useCallback(async (patch: Partial<AdminAgentMemory>) => {
    if (!brandId) return
    setError(null)
    const next: AdminAgentMemory = {
      facts: patch.facts ?? brandMemory.facts,
      preferences: patch.preferences ?? brandMemory.preferences,
      last_topics: patch.last_topics ?? brandMemory.last_topics,
      turn_count: Math.max(brandMemory.turn_count, 1),
    }
    try {
      const res = await fetch('/api/admin-agent/memory', {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(next),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Falha ao atualizar memória')
      setBrandMemory((data.brandMemory as AdminAgentMemory) || next)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar memória')
    }
  }, [brandId, brandMemory])

  const searchSessions = useCallback(async (query: string) => {
    if (!brandId) return []
    const q = query.trim()
    if (q.length < 2) {
      setSearchResults([])
      setSearchLoading(false)
      return []
    }

    searchAbortRef.current?.abort()
    const ac = new AbortController()
    searchAbortRef.current = ac
    setSearchLoading(true)

    try {
      const res = await fetch(
        `/api/admin-agent/sessions/search?q=${encodeURIComponent(q)}&limit=12`,
        { headers: getHeaders(), signal: ac.signal },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'search_failed')
      const results = (data.results || []) as AdminAgentSearchHit[]
      if (!ac.signal.aborted) setSearchResults(results)
      return results
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return []
      if (!ac.signal.aborted) setSearchResults([])
      return []
    } finally {
      if (!ac.signal.aborted) setSearchLoading(false)
    }
  }, [brandId])

  const togglePinSession = useCallback(async (targetSessionId: string) => {
    if (!brandId || !targetSessionId) return
    setError(null)
    try {
      const res = await fetch(`/api/admin-agent/sessions/${targetSessionId}/pin`, {
        method: 'POST',
        headers: getHeaders(),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Falha ao fixar conversa')
      setSessions((data.sessions || []) as AdminAgentSessionItem[])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao fixar conversa')
    }
  }, [brandId])

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
          sessionId: sessionId || undefined,
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
      if (data.sessionId) setSessionId(String(data.sessionId))
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholder.id
            ? { ...m, loading: false, content: turn.message, turn }
            : m,
        ),
      )
      setPendingContext(turn.nextSkill ? { nextSkill: turn.nextSkill } : undefined)
      if (!sessionTitle && displayText) {
        const nextTitle = displayText.slice(0, 80)
        setSessionTitle(nextTitle)
      }
      if (data.brandMemory) setBrandMemory(data.brandMemory as AdminAgentMemory)
      if (data.sessionSummary !== undefined) setSessionSummary(data.sessionSummary ? String(data.sessionSummary) : null)
      void loadSessions()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro inesperado')
      setMessages((prev) => prev.filter((m) => m.id !== placeholder.id))
    } finally {
      setLoading(false)
    }
  }, [loading, messages, currentPath, pendingContext, sessionId, sessionTitle, loadSessions])

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
    sessionId,
    sessionTitle,
    sessionHydrating,
    startNewSession,
    sessions,
    sessionsLoading,
    loadSessions,
    switchSession,
    deleteSession,
    renameSession,
    brandMemory,
    clearBrandMemory,
    updateBrandMemory,
    togglePinSession,
    sessionSummary,
    searchSessions,
    searchResults,
    searchLoading,
  }
}