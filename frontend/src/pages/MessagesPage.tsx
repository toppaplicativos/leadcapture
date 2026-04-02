import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search, Send, Phone, User, MessageSquare, ChevronLeft,
  Loader2, Bot, Image, Smile, Paperclip, MoreVertical,
  Clock, CheckCheck, Check, X,
} from 'lucide-react'

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
  ai_mode?: string; instance_name?: string; instance_phone?: string
  pipeline_stage?: string; tags?: string; notes?: string
}

interface Message {
  id: string; conversation_id: string; from_me: boolean
  message_type: string; body: string; timestamp: string
  status?: string; media_url?: string
}

/* ══════════════════════════════════════════════
   MESSAGES PAGE — WhatsApp-style messenger
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
  const messagesEnd = useRef<HTMLDivElement>(null)

  // Load conversations
  const loadConvos = useCallback(() => {
    setLoadingConvos(true)
    fetch('/api/inbox/conversations?limit=100', { headers: getHeaders() })
      .then(r => r.json()).then(d => { setConversations(d.conversations || []); setLoadingConvos(false) })
      .catch(() => setLoadingConvos(false))
  }, [])
  useEffect(() => { loadConvos() }, [])

  // Load messages for active conversation
  useEffect(() => {
    if (!activeConvo) return
    setLoadingMsgs(true)
    fetch(`/api/inbox/conversations/${activeConvo.id}/messages?limit=100`, { headers: getHeaders() })
      .then(r => r.json()).then(d => { setMessages(d.messages || []); setLoadingMsgs(false) })
      .catch(() => setLoadingMsgs(false))
  }, [activeConvo?.id])

  // Auto-scroll to bottom
  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Send message
  async function sendMessage() {
    if (!newMsg.trim() || !activeConvo) return
    setSending(true)
    try {
      await fetch(`/api/inbox/conversations/${activeConvo.id}/send`, {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ text: newMsg.trim() }),
      })
      setNewMsg('')
      // Reload messages
      const r = await fetch(`/api/inbox/conversations/${activeConvo.id}/messages?limit=100`, { headers: getHeaders() })
      const d = await r.json()
      setMessages(d.messages || [])
      loadConvos() // refresh unread counts
    } catch {}
    setSending(false)
  }

  const filteredConvos = search
    ? conversations.filter(c => (c.contact_name || c.contact_phone || '').toLowerCase().includes(search.toLowerCase()))
    : conversations

  const contactName = (c: Conversation) => c.contact_push_name || c.contact_name || c.contact_phone || 'Contato'
  const contactInitial = (c: Conversation) => (contactName(c)[0] || '?').toUpperCase()
  const formatPhone = (p: string) => p?.replace(/@.*/, '').replace(/^55/, '+55 ')

  return (
    <div className="h-[calc(100vh-120px)] lg:h-[calc(100vh-80px)] flex bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">

      {/* ── Conversations List (left panel) ── */}
      <div className={`${activeConvo ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 lg:w-96 border-r border-gray-100 shrink-0`}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-bold text-gray-900">Mensagens</h2>
          <p className="text-[10px] text-gray-400">{conversations.length} conversas</p>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar conversa..."
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-gray-300" />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loadingConvos ? (
            <div className="flex items-center justify-center py-10"><Loader2 size={20} className="text-gray-300 animate-spin" /></div>
          ) : filteredConvos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center px-4">
              <MessageSquare size={28} className="text-gray-300 mb-2" />
              <p className="text-xs text-gray-400">Nenhuma conversa</p>
            </div>
          ) : filteredConvos.map(c => {
            const active = activeConvo?.id === c.id
            const name = contactName(c)
            return (
              <button key={c.id} onClick={() => setActiveConvo(c)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition border-b border-gray-50 ${
                  active ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}>
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full grid place-items-center shrink-0 text-white font-bold text-sm ${
                  c.is_group ? 'bg-gradient-to-br from-violet-500 to-purple-600' : 'bg-gradient-to-br from-blue-500 to-indigo-600'
                }`}>{contactInitial(c)}</div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={`text-[13px] truncate ${active ? 'font-bold text-blue-700' : 'font-semibold text-gray-900'}`}>{name}</p>
                    <span className="text-[9px] text-gray-400 shrink-0 ml-2">{dtTime(c.last_message_at) || dtDate(c.last_message_at)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-[11px] text-gray-400 truncate max-w-[180px]">
                      {c.last_message_from_me && <span className="text-blue-500">Voce: </span>}
                      {c.last_message_text || 'Sem mensagens'}
                    </p>
                    {c.unread_count > 0 && (
                      <span className="bg-emerald-500 text-white text-[9px] font-bold rounded-full w-5 h-5 grid place-items-center shrink-0">{c.unread_count}</span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Chat Area (center) ── */}
      {activeConvo ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 shrink-0 bg-white">
            <button onClick={() => setActiveConvo(null)} className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 transition">
              <ChevronLeft size={18} className="text-gray-500" />
            </button>
            <div className={`w-9 h-9 rounded-full grid place-items-center text-white font-bold text-sm shrink-0 ${
              activeConvo.is_group ? 'bg-gradient-to-br from-violet-500 to-purple-600' : 'bg-gradient-to-br from-blue-500 to-indigo-600'
            }`}>{contactInitial(activeConvo)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{contactName(activeConvo)}</p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 font-mono">{formatPhone(activeConvo.contact_phone)}</span>
                {activeConvo.ai_mode === 'autonomous' && (
                  <span className="flex items-center gap-0.5 text-[9px] font-bold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full"><Bot size={9} /> IA</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <a href={`https://wa.me/${(activeConvo.contact_phone || '').replace(/@.*/, '')}`} target="_blank" rel="noreferrer"
                className="p-2 rounded-lg hover:bg-gray-100 transition"><Phone size={15} className="text-gray-400" /></a>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 bg-[#f0f2f5]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%239C92AC\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}>
            {loadingMsgs ? (
              <div className="flex items-center justify-center py-10"><Loader2 size={20} className="text-gray-300 animate-spin" /></div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 bg-white/80 rounded-2xl grid place-items-center mb-3 shadow-sm">
                  <MessageSquare size={24} className="text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-500">Nenhuma mensagem</p>
                <p className="text-[10px] text-gray-400 mt-1">Envie uma mensagem para iniciar</p>
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
                          <span className="text-[10px] text-gray-500 bg-white/90 px-3 py-1 rounded-full shadow-sm font-medium">{dtDate(msg.timestamp)}</span>
                        </div>
                      )}
                      <div className={`flex ${fromMe ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] px-3 py-2 rounded-2xl shadow-sm ${
                          fromMe
                            ? 'bg-[#d9fdd3] rounded-tr-sm'
                            : 'bg-white rounded-tl-sm'
                        }`}>
                          <p className="text-[13px] text-gray-800 leading-relaxed whitespace-pre-wrap break-words">{msg.body || msg.message_type}</p>
                          <div className={`flex items-center gap-1 mt-0.5 ${fromMe ? 'justify-end' : 'justify-start'}`}>
                            <span className="text-[9px] text-gray-400">{dtTime(msg.timestamp)}</span>
                            {fromMe && (
                              msg.status === 'read' ? <CheckCheck size={11} className="text-blue-500" />
                              : msg.status === 'delivered' ? <CheckCheck size={11} className="text-gray-400" />
                              : <Check size={11} className="text-gray-400" />
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

          {/* Input area */}
          <div className="px-4 py-3 border-t border-gray-100 bg-white shrink-0">
            <div className="flex items-end gap-2 max-w-2xl mx-auto">
              <div className="flex-1 relative">
                <textarea value={newMsg} onChange={e => setNewMsg(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  placeholder="Digite uma mensagem..."
                  rows={1}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-2xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none placeholder:text-gray-400 pr-12"
                  style={{ maxHeight: '120px' }} />
              </div>
              <button onClick={sendMessage} disabled={sending || !newMsg.trim()}
                className="w-10 h-10 rounded-full bg-emerald-500 text-white grid place-items-center hover:bg-emerald-600 disabled:opacity-40 transition shadow-sm shrink-0">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Empty state */
        <div className="flex-1 hidden md:flex items-center justify-center bg-[#f0f2f5]">
          <div className="text-center">
            <div className="w-20 h-20 bg-white/80 rounded-3xl grid place-items-center mx-auto mb-4 shadow-sm">
              <MessageSquare size={36} className="text-gray-300" />
            </div>
            <h3 className="text-base font-bold text-gray-600">LeadCapture Messenger</h3>
            <p className="text-xs text-gray-400 mt-1 max-w-xs">Selecione uma conversa para ver as mensagens e responder seus leads</p>
          </div>
        </div>
      )}
    </div>
  )
}
