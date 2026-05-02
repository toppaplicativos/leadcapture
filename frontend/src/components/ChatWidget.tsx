import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react'
import { Send, X, Sparkles, ArrowRight } from 'lucide-react'
import { BrandMark } from './BrandMark'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const STORAGE_KEY = 'leadcapture:landing-chat:v1'

const SUGGESTED_PROMPTS = [
  'O que é o LeadCapture?',
  'Quanto custa?',
  'Vou ser banido do WhatsApp?',
  'Como funciona o modo Panfleteiro?',
]

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Oi! Sou a Mira, assistente do LeadCapture. Posso te explicar como funciona, comparar com o que você usa hoje ou tirar dúvidas sobre planos. O que você quer entender?',
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function loadStored(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [WELCOME_MESSAGE]
    const parsed = JSON.parse(raw) as ChatMessage[]
    if (!Array.isArray(parsed) || parsed.length === 0) return [WELCOME_MESSAGE]
    return parsed
  } catch {
    return [WELCOME_MESSAGE]
  }
}

function persist(messages: ChatMessage[]) {
  try {
    // keep only last 30
    const trimmed = messages.slice(-30)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    /* quota / private mode — ignore */
  }
}

export function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadStored())
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unread, setUnread] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  /* Persist on every change */
  useEffect(() => {
    persist(messages)
  }, [messages])

  /* Auto-scroll on new content */
  useEffect(() => {
    if (!open) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, streaming, open])

  /* Focus input on open */
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 280)
      return () => clearTimeout(t)
    }
  }, [open])

  /* ESC closes */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || streaming) return

      setError(null)
      const userMsg: ChatMessage = { id: uid(), role: 'user', content: trimmed }
      const placeholder: ChatMessage = { id: uid(), role: 'assistant', content: '' }

      const next = [...messages, userMsg, placeholder]
      setMessages(next)
      setInput('')
      setStreaming(true)

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch('/api/landing/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: next
              .filter(m => m.id !== placeholder.id)
              .map(m => ({ role: m.role, content: m.content })),
          }),
          signal: controller.signal,
        })

        if (res.status === 429) {
          throw new Error('Muitas mensagens em pouco tempo. Aguarde um instante.')
        }
        if (res.status === 503) {
          throw new Error('Assistente temporariamente indisponível.')
        }
        if (!res.ok || !res.body) {
          throw new Error('Falha ao conversar agora. Tente de novo em segundos.')
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        let assistantText = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() || ''

          for (const line of lines) {
            const t = line.trim()
            if (!t.startsWith('data:')) continue
            const payload = t.slice(5).trim()
            if (payload === '[DONE]') continue
            try {
              const json = JSON.parse(payload)
              if (json.error) {
                throw new Error(json.message || 'Erro na resposta da IA.')
              }
              if (typeof json.token === 'string') {
                assistantText += json.token
                setMessages(prev =>
                  prev.map(m =>
                    m.id === placeholder.id ? { ...m, content: assistantText } : m,
                  ),
                )
              }
            } catch {
              /* keep going on parse errors */
            }
          }
        }

        if (!assistantText) {
          throw new Error('Não consegui formular uma resposta agora. Tente reformular.')
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          // user closed widget; clean up placeholder
          setMessages(prev => prev.filter(m => m.id !== placeholder.id))
        } else {
          setError(err?.message || 'Algo deu errado.')
          setMessages(prev => prev.filter(m => m.id !== placeholder.id))
        }
      } finally {
        setStreaming(false)
        abortRef.current = null
      }
    },
    [messages, streaming],
  )

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    send(input)
  }

  function reset() {
    abortRef.current?.abort()
    setMessages([WELCOME_MESSAGE])
    setInput('')
    setError(null)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* */
    }
  }

  return (
    <>
      {/* Floating action button */}
      <button
        onClick={() => {
          setOpen(true)
          setUnread(false)
        }}
        aria-label="Conversar com a Mira"
        aria-expanded={open}
        className={`fixed bottom-5 right-5 z-[1000] flex items-center gap-2.5 h-14 pl-3 pr-5 rounded-full bg-gray-900 text-white shadow-[0_8px_32px_rgba(0,0,0,0.25)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.35)] transition-all hover:scale-[1.02] active:scale-95 ${
          open ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <span className="relative grid place-items-center w-8 h-8 rounded-full bg-white/10">
          <BrandMark size={20} inverted={false} />
          {unread && (
            <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-gray-900" />
          )}
        </span>
        <span className="text-[14px] font-semibold tracking-tight">Falar com a Mira</span>
      </button>

      {/* Chat window */}
      <div
        className={`fixed inset-x-3 bottom-3 sm:inset-auto sm:bottom-5 sm:right-5 z-[1000] sm:w-[400px] max-h-[90vh] sm:max-h-[640px] flex flex-col bg-white rounded-3xl shadow-[0_24px_64px_rgba(0,0,0,0.25)] ring-1 ring-black/5 overflow-hidden transition-all origin-bottom-right ${
          open
            ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 scale-95 translate-y-2 pointer-events-none'
        }`}
        role="dialog"
        aria-label="Chat com a assistente Mira"
        aria-hidden={!open}
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-900 text-white">
          <div className="flex items-center gap-2.5">
            <BrandMark size={32} inverted />
            <div>
              <p className="text-[14px] font-bold tracking-tight">Mira</p>
              <p className="text-[11px] text-white/60 flex items-center gap-1.5">
                <span className="relative flex w-1.5 h-1.5">
                  <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
                  <span className="relative w-1.5 h-1.5 rounded-full bg-emerald-400" />
                </span>
                Assistente do LeadCapture
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={reset}
              aria-label="Nova conversa"
              title="Nova conversa"
              className="w-8 h-8 grid place-items-center rounded-full text-white/70 hover:text-white hover:bg-white/10 active:scale-90 transition"
            >
              <Sparkles size={14} strokeWidth={1.75} />
            </button>
            <button
              onClick={() => setOpen(false)}
              aria-label="Fechar"
              className="w-8 h-8 grid place-items-center rounded-full text-white/70 hover:text-white hover:bg-white/10 active:scale-90 transition"
            >
              <X size={16} strokeWidth={1.75} />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 bg-[#fafafa]">
          <div className="space-y-3">
            {messages.map(m => (
              <MessageBubble key={m.id} message={m} streaming={streaming && m.content === '' && m.role === 'assistant'} />
            ))}
            {error && (
              <div className="px-3 py-2.5 rounded-2xl bg-red-50 border border-red-100 text-[13px] text-red-700 font-medium">
                {error}
              </div>
            )}
          </div>

          {/* Suggested prompts (only on welcome state) */}
          {messages.length <= 1 && !streaming && (
            <div className="mt-5 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
                Sugestões
              </p>
              {SUGGESTED_PROMPTS.map(p => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="w-full text-left text-[13px] font-medium text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 hover:border-gray-300 transition px-3.5 py-2.5 rounded-2xl"
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={onSubmit}
          className="p-3 bg-white border-t border-border-light"
        >
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send(input)
                  }
                }}
                placeholder="Pergunta o que você quiser…"
                rows={1}
                disabled={streaming}
                className="w-full px-4 py-3 rounded-2xl border-0 bg-gray-100 text-[14px] text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:bg-white transition disabled:opacity-60"
                style={{ maxHeight: '120px' }}
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || streaming}
              aria-label="Enviar"
              className="w-11 h-11 rounded-2xl bg-gray-900 text-white grid place-items-center hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-gray-900 active:scale-90 transition shrink-0"
            >
              <Send size={15} strokeWidth={2} />
            </button>
          </div>
          <p className="mt-2 text-[10px] text-gray-400 text-center">
            A Mira pode errar. Confirme detalhes importantes na <a href="/login" className="underline hover:text-gray-700">demo</a>.
          </p>
        </form>
      </div>
    </>
  )
}

/* ──────────────────────────────────────────────────
   MESSAGE BUBBLE
   ────────────────────────────────────────────────── */

function MessageBubble({
  message,
  streaming,
}: {
  message: ChatMessage
  streaming: boolean
}) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-br-md bg-gray-900 text-white">
          <p className="text-[14px] leading-[1.5] whitespace-pre-wrap break-words">
            {message.content}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2">
      <div className="shrink-0 mt-1">
        <BrandMark size={26} />
      </div>
      <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-tl-md bg-white border border-border-light">
        {streaming ? (
          <TypingDots />
        ) : (
          <p className="text-[14px] leading-[1.55] text-gray-900 whitespace-pre-wrap break-words">
            {message.content}
            {message.content && message.content.length > 0 && (
              <CTAInline content={message.content} />
            )}
          </p>
        )}
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-gray-400"
          style={{
            animation: 'typingBounce 1.2s ease-in-out infinite',
            animationDelay: `${i * 150}ms`,
          }}
        />
      ))}
      <style>{`
        @keyframes typingBounce {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-3px); }
        }
      `}</style>
    </div>
  )
}

/**
 * If the assistant message mentions starting a trial / signup, append a
 * subtle inline CTA after the text. Heuristic — keyword match.
 */
function CTAInline({ content }: { content: string }) {
  const lower = content.toLowerCase()
  const triggers = ['trial', 'começar', 'comecar', 'cadastr', 'experimenta', 'login', 'demo']
  const shouldShow = triggers.some(t => lower.includes(t))
  if (!shouldShow) return null

  return (
    <a
      href="/login"
      className="mt-3 inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-gray-900 text-white text-[12px] font-semibold tracking-tight hover:bg-gray-800 transition"
    >
      Começar agora
      <ArrowRight size={12} strokeWidth={2.25} />
    </a>
  )
}
