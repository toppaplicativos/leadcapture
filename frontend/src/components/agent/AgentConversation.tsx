import { useRef, useEffect, type FormEvent } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { AgentUIRenderer } from './AgentUIRenderer'
import type { AgentCallbacks, AgentChatMessage, AgentTurn } from '@/lib/agent/types'

export function AgentConversation({
  messages,
  loading,
  error,
  input,
  onInputChange,
  onSend,
  callbacks,
  welcomeTurn,
  suggestedPrompts,
  fullPage,
}: {
  messages: AgentChatMessage[]
  loading: boolean
  error: string | null
  input: string
  onInputChange: (v: string) => void
  onSend: (text: string) => void
  callbacks: AgentCallbacks
  welcomeTurn?: AgentTurn
  suggestedPrompts?: string[]
  fullPage?: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const displayMessages: AgentChatMessage[] = messages.length
    ? messages
    : welcomeTurn
      ? [{ id: 'welcome', role: 'assistant', content: welcomeTurn.message, turn: welcomeTurn }]
      : []

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    onSend(input)
  }

  return (
    <div className={`flex flex-col ${fullPage ? 'h-full' : 'flex-1 min-h-0'}`}>
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto space-y-4 ${fullPage ? 'px-6 py-5' : 'px-4 py-3'}`}
      >
        {displayMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`${fullPage ? 'max-w-2xl w-full' : 'max-w-[92%]'} ${
                msg.role === 'user' ? '' : 'w-full'
              }`}
            >
              {msg.role === 'assistant' && (
                <div className={`rounded-2xl rounded-bl-md bg-gray-50 border border-border-light ${
                  fullPage ? 'px-4 py-3.5' : 'px-3.5 py-2.5'
                }`}>
                  {msg.loading ? (
                    <div className="flex items-center gap-2 text-gray-400">
                      <Loader2 size={14} className="animate-spin" />
                      <span className="text-[12px]">Pensando...</span>
                    </div>
                  ) : (
                    <>
                      <p className={`text-gray-800 leading-relaxed whitespace-pre-wrap ${
                        fullPage ? 'text-[15px]' : 'text-[13px]'
                      }`}>
                        {msg.turn?.message || msg.content}
                      </p>
                      {msg.turn?.skill && (
                        <p className="text-[10px] text-gray-400 mt-1.5 font-mono">
                          {msg.turn.squad} → {msg.turn.skill}
                        </p>
                      )}
                      {msg.turn?.components && (
                        <AgentUIRenderer
                          components={msg.turn.components}
                          callbacks={callbacks}
                          compact={!fullPage}
                        />
                      )}
                    </>
                  )}
                </div>
              )}
              {msg.role === 'user' && (
                <div className="rounded-2xl rounded-br-md bg-gray-900 text-white px-3.5 py-2.5 ml-auto w-fit max-w-full">
                  <p className={`leading-relaxed ${fullPage ? 'text-[14px]' : 'text-[13px]'}`}>
                    {msg.content}
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}

        {error && (
          <p className="text-[12px] text-red-600 text-center px-2">{error}</p>
        )}
      </div>

      {!loading && suggestedPrompts && messages.length < 3 && (
        <div className={`shrink-0 flex flex-wrap gap-1.5 ${fullPage ? 'px-6 pb-3' : 'px-4 pb-2'}`}>
          {suggestedPrompts.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onSend(p)}
              className="px-2.5 h-7 rounded-lg text-[11px] font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className={`shrink-0 border-t border-border-light safe-area-bottom ${
          fullPage ? 'px-6 py-4' : 'p-3'
        }`}
      >
        <div className={`flex items-end gap-2 rounded-xl border border-border-light bg-gray-50 px-3 py-2 focus-within:border-gray-300 focus-within:bg-white transition-colors ${
          fullPage ? 'max-w-2xl' : ''
        }`}>
          <textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSend(input)
              }
            }}
            rows={1}
            placeholder="O que você precisa?"
            disabled={loading}
            className="flex-1 resize-none bg-transparent text-[13px] text-gray-900 placeholder:text-gray-400 outline-none max-h-24 py-0.5"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            aria-label="Enviar"
            className="shrink-0 w-8 h-8 grid place-items-center rounded-lg bg-gray-900 text-white disabled:opacity-30 hover:bg-gray-800 transition"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </form>
    </div>
  )
}