import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search, Send, Phone, User, MessageSquare, ChevronLeft,
  Loader2, Bot, Paperclip, MoreVertical, X,
  Clock, CheckCheck, Check, Tag, Star, GitBranch,
  Zap, UserCheck, Ban, RefreshCw,
  Hand, Hourglass, CheckCircle2, DollarSign, Truck, Package,
  Heart, Calendar, BookOpen, ArrowLeftRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h['Authorization'] = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

const dtTime = (v?: string) => { try { return new Date(v!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) } catch { return '' } }
const dtDate = (v?: string) => { try { return new Date(v!).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) } catch { return '' } }
const dtFull = (v?: string) => { try { return new Date(v!).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return '' } }

interface Conversation {
  id: string; instance_id: string; remote_jid: string
  contact_name: string; contact_phone: string; contact_push_name?: string
  status: string; last_message_text: string; last_message_at: string
  last_message_from_me: boolean; unread_count: number; is_group: boolean
  ai_mode?: string; instance_name?: string; pipeline_stage?: string
  tags?: string; notes?: string
}

interface Message {
  id: string; conversation_id: string; from_me: boolean
  message_type: string; body: string; timestamp: string; message_timestamp?: number
  status?: string; media_url?: string
}

/* ══════════════════════════════════════════════
   MESSAGES PAGE
   ══════════════════════════════════════════════ */
export function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvo, setActiveConvo] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingConvos, setLoadingConvos] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [sending, setSending] = useState(false)
  const [newMsg, setNewMsg] = useState('')
  const [search, setSearch] = useState('')
  const [showCommands, setShowCommands] = useState(false)
  const messagesEnd = useRef<HTMLDivElement>(null)

  const loadConvos = useCallback(() => {
    setLoadingConvos(true)
    fetch('/api/inbox/conversations?limit=100', { headers: getHeaders() })
      .then(r => r.json()).then(d => { setConversations(d.conversations || []); setLoadingConvos(false) })
      .catch(() => setLoadingConvos(false))
  }, [])
  useEffect(() => { loadConvos() }, [])

  useEffect(() => {
    if (!activeConvo) return
    setLoadingMsgs(true)
    fetch(`/api/inbox/conversations/${activeConvo.id}/messages?limit=100`, { headers: getHeaders() })
      .then(r => r.json()).then(d => {
        let msgs = d.messages || []
        // If no messages from DB, create synthetic from conversation data
        if (msgs.length === 0 && activeConvo.last_message_text) {
          msgs = [{
            id: 'last-msg',
            conversation_id: activeConvo.id,
            from_me: activeConvo.last_message_from_me,
            message_type: 'text',
            body: activeConvo.last_message_text,
            timestamp: activeConvo.last_message_at,
            status: 'delivered',
          }]
        }
        setMessages(msgs)
        setLoadingMsgs(false)
      }).catch(() => setLoadingMsgs(false))
  }, [activeConvo?.id])

  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function sendMessage(text?: string) {
    const msgText = text || newMsg.trim()
    if (!msgText || !activeConvo) return
    setSending(true)
    try {
      await fetch(`/api/inbox/conversations/${activeConvo.id}/send`, {
        method: 'POST', headers: getHeaders(), body: JSON.stringify({ text: msgText }),
      })
      setNewMsg('')
      // Add optimistic message
      setMessages(prev => [...prev, {
        id: `sent-${Date.now()}`, conversation_id: activeConvo.id, from_me: true,
        message_type: 'text', body: msgText, timestamp: new Date().toISOString(), status: 'sent',
      }])
      loadConvos()
    } catch {}
    setSending(false)
    setShowCommands(false)
  }

  // Quick commands for human operators
  const COMMANDS: { Icon: LucideIcon; label: string; msg: string }[] = [
    { Icon: Hand, label: 'Saudacao', msg: 'Olá! Tudo bem? Como posso ajudar hoje?' },
    { Icon: Hourglass, label: 'Aguarde', msg: 'Um momento, por favor. Estou verificando para você!' },
    { Icon: CheckCircle2, label: 'Confirmacao', msg: 'Perfeito! Está tudo certo. Posso ajudar em mais alguma coisa?' },
    { Icon: DollarSign, label: 'Valor', msg: 'Vou verificar o valor e te retorno em instantes!' },
    { Icon: Truck, label: 'Entrega', msg: 'Sua entrega está sendo preparada! Em breve enviaremos as informações de rastreio.' },
    { Icon: Package, label: 'Pedido', msg: 'Recebi seu pedido! Vou processar e já te informo os próximos passos.' },
    { Icon: Heart, label: 'Agradecimento', msg: 'Muito obrigado pela preferência! Estamos à disposição.' },
    { Icon: Calendar, label: 'Horario', msg: 'Nosso horário de atendimento é de segunda a sexta, das 8h às 18h.' },
    { Icon: BookOpen, label: 'Catalogo', msg: 'Confira nosso catálogo completo em: ' + window.location.origin + '/catalogo/alhopronto' },
    { Icon: ArrowLeftRight, label: 'Transferir', msg: 'Vou transferir você para o setor responsável. Um momento!' },
  ]

  async function toggleAiMode(mode: string) {
    if (!activeConvo) return
    try {
      await fetch(`/api/inbox/conversations/${activeConvo.id}/ai-state`, {
        method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ ai_mode: mode }),
      })
      setActiveConvo({ ...activeConvo, ai_mode: mode })
      loadConvos()
    } catch {}
  }

  const filteredConvos = search
    ? conversations.filter(c => (c.contact_name || c.contact_phone || c.contact_push_name || '').toLowerCase().includes(search.toLowerCase()))
    : conversations

  const contactName = (c: Conversation) => c.contact_push_name || (c.contact_name?.length > 12 ? c.contact_phone : c.contact_name) || c.contact_phone || 'Contato'
  const contactInitial = (c: Conversation) => (contactName(c)[0] || '?').toUpperCase()
  const formatPhone = (p: string) => p?.replace(/@.*/, '').replace(/^55/, '+55 ')

  return (
    <div className="h-[calc(100vh-120px)] lg:h-[calc(100vh-80px)] flex bg-white rounded-2xl border border-border-light overflow-hidden">

      {/* ── Conversations List ── */}
      <div className={`${activeConvo ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 lg:w-96 border-r border-border-light shrink-0`}>
        <div className="px-4 py-3.5 border-b border-border-light shrink-0">
          <h2 className="text-[15px] font-bold tracking-tight text-gray-900">Mensagens</h2>
          <p className="text-[11px] text-gray-500 mt-0.5 tabular-nums">{conversations.length} conversa{conversations.length === 1 ? '' : 's'}</p>
        </div>
        <div className="px-3 py-2.5 border-b border-border-light shrink-0">
          <div className="relative">
            <Search size={14} strokeWidth={1.75} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar conversa"
              className="w-full h-9 pl-9 pr-3 rounded-full border-0 bg-gray-100 text-[12px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:bg-white transition"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingConvos ? (
            <div className="flex items-center justify-center py-10"><Loader2 size={18} className="text-gray-400 animate-spin" /></div>
          ) : filteredConvos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 grid place-items-center mb-3">
                <MessageSquare size={20} className="text-gray-400" strokeWidth={1.5} />
              </div>
              <p className="text-[13px] font-medium text-gray-900">Nenhuma conversa</p>
            </div>
          ) : filteredConvos.map(c => {
            const active = activeConvo?.id === c.id
            return (
              <button
                key={c.id}
                onClick={() => setActiveConvo(c)}
                aria-current={active ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-border-light ${
                  active ? 'bg-gray-100' : 'hover:bg-gray-50'
                }`}
              >
                <div className="w-10 h-10 rounded-full grid place-items-center shrink-0 text-white font-semibold text-sm bg-gray-900">
                  {contactInitial(c)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className={`text-[13px] truncate ${active ? 'font-semibold text-gray-900' : 'font-medium text-gray-900'}`}>{contactName(c)}</p>
                      {c.ai_mode === 'autonomous' && <Bot size={11} strokeWidth={1.75} className="text-gray-500 shrink-0" />}
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0 tabular-nums">{dtTime(c.last_message_at) || dtDate(c.last_message_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-[11px] text-gray-500 truncate flex-1">
                      {c.last_message_from_me && <span className="text-gray-400">Você: </span>}
                      {c.last_message_text || 'Sem mensagens'}
                    </p>
                    {c.unread_count > 0 && (
                      <span className="bg-emerald-600 text-white text-[10px] font-semibold rounded-full min-w-[18px] h-[18px] grid place-items-center px-1.5 shrink-0 tabular-nums">
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Chat Area ── */}
      {activeConvo ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border-light flex items-center gap-3 shrink-0 bg-white">
            <button
              onClick={() => setActiveConvo(null)}
              aria-label="Voltar"
              className="md:hidden w-9 h-9 grid place-items-center rounded-full text-gray-700 hover:bg-gray-100 active:scale-90 transition"
            >
              <ChevronLeft size={18} strokeWidth={1.75} />
            </button>
            <div className="w-9 h-9 rounded-full grid place-items-center text-white font-semibold text-sm shrink-0 bg-gray-900">
              {contactInitial(activeConvo)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold tracking-tight text-gray-900 truncate">{contactName(activeConvo)}</p>
              <p className="text-[11px] text-gray-500 font-mono tabular-nums">{formatPhone(activeConvo.contact_phone)}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => toggleAiMode(activeConvo.ai_mode === 'autonomous' ? 'manual' : 'autonomous')}
                aria-pressed={activeConvo.ai_mode === 'autonomous'}
                title={activeConvo.ai_mode === 'autonomous' ? 'IA ativa — clique para desativar' : 'IA desativada — clique para ativar'}
                className={`flex items-center gap-1.5 px-2.5 h-8 rounded-full text-[11px] font-medium transition ${
                  activeConvo.ai_mode === 'autonomous'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Bot size={12} strokeWidth={1.75} />
                {activeConvo.ai_mode === 'autonomous' ? 'IA on' : 'IA off'}
              </button>
              <a
                href={`https://wa.me/${(activeConvo.contact_phone || '').replace(/@.*/, '')}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Abrir WhatsApp"
                className="w-9 h-9 grid place-items-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900 active:scale-90 transition"
              >
                <Phone size={14} strokeWidth={1.75} />
              </a>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 bg-bg">
            {loadingMsgs ? (
              <div className="flex items-center justify-center py-10"><Loader2 size={18} className="text-gray-400 animate-spin" /></div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 grid place-items-center mb-3">
                  <MessageSquare size={20} className="text-gray-400" strokeWidth={1.5} />
                </div>
                <p className="text-[14px] font-medium text-gray-900">Nenhuma mensagem</p>
                <p className="text-[12px] text-gray-500 mt-0.5">Use os comandos rápidos ou envie uma mensagem</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-w-2xl mx-auto">
                {messages.map((msg, i) => {
                  const fromMe = msg.from_me
                  const prevMsg = i > 0 ? messages[i - 1] : null
                  const showDate = !prevMsg || new Date(msg.timestamp).toDateString() !== new Date(prevMsg.timestamp).toDateString()
                  return (
                    <div key={msg.id || i}>
                      {showDate && (
                        <div className="text-center my-3">
                          <span className="text-[10px] text-gray-500 bg-white px-2.5 py-1 rounded-full font-medium tabular-nums border border-border-light">
                            {dtDate(msg.timestamp)}
                          </span>
                        </div>
                      )}
                      <div className={`flex ${fromMe ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[78%] px-3 py-2 rounded-2xl ${
                            fromMe
                              ? 'bg-gray-900 text-white rounded-br-md'
                              : 'bg-white text-gray-900 border border-border-light rounded-bl-md'
                          }`}
                        >
                          <p className={`text-[13px] leading-relaxed whitespace-pre-wrap break-words ${fromMe ? 'text-white' : 'text-gray-900'}`}>
                            {msg.body || msg.message_type}
                          </p>
                          <div className={`flex items-center gap-1 mt-0.5 ${fromMe ? 'justify-end' : 'justify-start'}`}>
                            <span className={`text-[9px] tabular-nums ${fromMe ? 'text-white/50' : 'text-gray-400'}`}>{dtTime(msg.timestamp)}</span>
                            {fromMe && (msg.status === 'read'
                              ? <CheckCheck size={11} strokeWidth={1.75} className="text-blue-300" />
                              : <Check size={11} strokeWidth={1.75} className="text-white/50" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEnd} />
              </div>
            )}
          </div>

          {/* Quick Commands */}
          {showCommands && (
            <div className="border-t border-border-light bg-white px-4 py-3 max-h-48 overflow-y-auto shrink-0">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Respostas rápidas</p>
                <button
                  onClick={() => setShowCommands(false)}
                  aria-label="Fechar"
                  className="w-6 h-6 grid place-items-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                >
                  <X size={12} strokeWidth={2.25} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {COMMANDS.map(cmd => {
                  const Icon = cmd.Icon
                  return (
                    <button
                      key={cmd.label}
                      onClick={() => sendMessage(cmd.msg)}
                      className="flex items-center gap-2 px-2.5 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 transition text-left group"
                    >
                      <Icon size={14} strokeWidth={1.75} className="text-gray-500 shrink-0" />
                      <span className="text-[11px] font-medium text-gray-700 truncate">{cmd.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="px-4 py-3 border-t border-border-light bg-white shrink-0">
            <div className="flex items-end gap-2 max-w-2xl mx-auto">
              <button
                onClick={() => setShowCommands(!showCommands)}
                aria-label="Respostas rápidas"
                aria-pressed={showCommands}
                className={`w-10 h-10 rounded-full grid place-items-center shrink-0 transition active:scale-90 ${
                  showCommands ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                <Zap size={15} strokeWidth={1.75} />
              </button>
              <div className="flex-1 relative">
                <textarea
                  value={newMsg}
                  onChange={e => setNewMsg(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  placeholder="Digite uma mensagem"
                  rows={1}
                  className="w-full px-4 py-2.5 rounded-2xl border-0 bg-gray-100 text-[14px] text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:bg-white transition"
                  style={{ maxHeight: '120px' }}
                />
              </div>
              <button
                onClick={() => sendMessage()}
                disabled={sending || !newMsg.trim()}
                aria-label="Enviar"
                className="w-10 h-10 rounded-full bg-emerald-600 text-white grid place-items-center hover:bg-emerald-700 disabled:opacity-40 disabled:hover:bg-emerald-600 active:scale-90 transition shrink-0"
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} strokeWidth={1.75} />}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 hidden md:flex items-center justify-center bg-bg">
          <div className="text-center">
            <div className="w-16 h-16 bg-white border border-border-light rounded-3xl grid place-items-center mx-auto mb-4">
              <MessageSquare size={28} className="text-gray-400" strokeWidth={1.5} />
            </div>
            <h3 className="text-[15px] font-bold tracking-tight text-gray-900">Selecione uma conversa</h3>
            <p className="text-[12px] text-gray-500 mt-1 max-w-xs">Escolha um contato à esquerda para ver as mensagens</p>
          </div>
        </div>
      )}
    </div>
  )
}
