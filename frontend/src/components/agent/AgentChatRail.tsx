import { useState, useRef, useEffect, type FormEvent } from 'react'
import { Send, Loader2, PanelRight } from 'lucide-react'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import type { AgentChatMessage, AgentTurn } from '@/lib/agent/types'

const STORAGE_KEY = 'leadcapture:agent-rail:v1'

const WELCOME_TURN: AgentTurn = {
  message: 'Diga o que precisa. Monto leads, campanhas, produtos e configurações aqui — sem menu.',
}

const QUICK_INTENTS = [
  'Mostrar painel',
  'Últimos leads',
  'Campanhas',
  'Conversas',
  'Meu agente',
]

function loadStored(): AgentChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw).slice(-30)
  } catch {
    return []
  }
}

export function AgentChatRail({ onShowCanvas }: { onShowCanvas?: () => void }) {
  const {
    messages,
    loading,
    error,
    send,
    setMobileCanvasOpen,
  } = useAgentShell()

  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)))
    } catch { /* ignore */ }
  }, [messages])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const display: AgentChatMessage[] = messages.length
    ? messages
    : [{ id: 'welcome', role: 'assistant', content: WELCOME_TURN.message, turn: WELCOME_TURN }]

  function submit(e: FormEvent) {
    e.preventDefault()
    const t = input.trim()
    if (!t || loading) return
    send(t)
    setInput('')
  }

  return (
    <div className="agent-rail flex flex-col h-full">
      <div ref={scrollRef} className="agent-rail__thread flex-1 min-h-0 overflow-y-auto">
        {display.map((msg) => (
          <div
            key={msg.id}
            className={`agent-rail__msg agent-rail__msg--${msg.role}`}
          >
            {msg.role === 'assistant' ? (
              <div className="agent-rail__bubble agent-rail__bubble--assistant">
                {msg.loading ? (
                  <span className="agent-rail__thinking">
                    <Loader2 size={13} className="animate-spin" />
                    Pensando
                  </span>
                ) : (
                  <p>{msg.turn?.message || msg.content}</p>
                )}
              </div>
            ) : (
              <div className="agent-rail__bubble agent-rail__bubble--user">
                <p>{msg.content}</p>
              </div>
            )}
          </div>
        ))}
        {error && <p className="agent-rail__error">{error}</p>}
      </div>

      {messages.length < 4 && (
        <div className="agent-rail__quick">
          {QUICK_INTENTS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => send(q)}
              className="agent-rail__chip"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <form className="agent-rail__composer" onSubmit={submit}>
        {onShowCanvas && (
          <button
            type="button"
            className="agent-rail__canvas-btn lg:hidden"
            onClick={() => { setMobileCanvasOpen(true); onShowCanvas() }}
            aria-label="Ver resultado"
          >
            <PanelRight size={16} />
          </button>
        )}
        <div className="agent-rail__input-wrap">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit(e)
              }
            }}
            rows={1}
            placeholder="O que você precisa?"
            disabled={loading}
            className="agent-rail__input"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="agent-rail__send"
            aria-label="Enviar"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </form>
    </div>
  )
}