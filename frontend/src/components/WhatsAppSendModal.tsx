/**
 * WhatsAppSendModal — Gerador de mensagem personalizada + deeplink WhatsApp
 *
 * Fluxo:
 *   1. Seleciona template (ou escreve do zero)
 *   2. Variáveis {{nome}}, {{empresa}}, {{cidade}} etc. são substituídas
 *   3. Usuário edita a mensagem final se quiser
 *   4. Copia pro clipboard E abre WhatsApp (app nativo no mobile, Web no desktop)
 *
 * Suporta modo fila: leads[] com mais de 1 item ativa navegação Lead 1/N → Próximo
 */
import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  X, Copy, ExternalLink, ChevronLeft, ChevronRight,
  CheckCircle2, MessageSquare, Smartphone, Monitor,
  Edit3, RotateCcw, Phone, AlertCircle, Sparkles, Loader2,
} from 'lucide-react'

/* ─────────────────────────────────────────────────────────────
   Types
   ───────────────────────────────────────────────────────────── */
export interface WaSendLead {
  id?: string
  name: string
  phone?: string
  trade_name?: string
  city?: string
  state?: string
  category?: string
  status?: string
  google_rating?: number
  notes?: string
}

interface WhatsAppSendModalProps {
  leads: WaSendLead[]
  onClose: () => void
  /** Called when user opens WhatsApp for a lead (optional — e.g. mark as contacted) */
  onSent?: (lead: WaSendLead) => void
}

/* ─────────────────────────────────────────────────────────────
   Templates
   ───────────────────────────────────────────────────────────── */
interface WaTemplate {
  id: string
  label: string
  shortDesc: string
  body: string
}

const TEMPLATES: WaTemplate[] = [
  {
    id: 'apresentacao',
    label: 'Primeiro contato',
    shortDesc: 'Apresentação inicial ao lead',
    body: `Oi, {{nome}}! Tudo bem?

Vi a {{empresa}} no Google — vocês atuam em {{segmento}} em {{cidade}}, certo?

{{proposta}} Posso te mostrar em 5 minutinhos como funciona pra vocês?`,
  },
  {
    id: 'followup',
    label: 'Follow-up',
    shortDesc: 'Retorno após primeiro contato',
    body: `Oi {{nome}}, tudo certo?

Estou retornando sobre o que conversamos. Você teve oportunidade de pensar?

{{proposta}} Fico à disposição pra esclarecer qualquer dúvida!`,
  },
  {
    id: 'proposta',
    label: 'Envio de proposta',
    shortDesc: 'Após preparar proposta personalizada',
    body: `Olá, {{nome}}!

Preparei uma proposta personalizada pra {{empresa}} conforme conversamos.

Quando tiver uns minutinhos, posso te apresentar os detalhes? Baseei tudo no que entendi do seu negócio.`,
  },
  {
    id: 'reativacao',
    label: 'Reativação',
    shortDesc: 'Para leads que esfriaram',
    body: `Oi {{nome}}, como vai?

Faz um tempo que não conversamos — lembrei de você hoje!

{{proposta}} Acho que faz sentido pra {{empresa}}. Vale uma conversa rápida?`,
  },
  {
    id: 'posvenda',
    label: 'Pós-venda',
    shortDesc: 'Acompanhamento após fechamento',
    body: `Oi {{nome}}! Tudo bem por aí?

Estou passando pra saber como está sendo a experiência. Sua satisfação é muito importante pra nós.

Tem alguma dúvida ou posso ajudar com algo?`,
  },
  {
    id: 'personalizada',
    label: 'Personalizada',
    shortDesc: 'Escreva a mensagem do zero',
    body: '',
  },
]

/* ─────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────── */
function catLabel(v?: string) {
  if (!v) return ''
  const MAP: Record<string, string> = {
    restaurant: 'Restaurante', buffet_restaurant: 'Buffet', pizza_restaurant: 'Pizzaria',
    bar: 'Bar', manufacturer: 'Fabricante', school: 'Escola', wholesaler: 'Atacadista',
    food: 'Alimentação', snack_bar: 'Lanchonete', hamburger_restaurant: 'Hamburgueria',
    health_food_store: 'Empório', meal_delivery: 'Delivery', store: 'Loja',
  }
  return MAP[v] || v.replace(/_/g, ' ')
}

function buildVars(lead: WaSendLead, senderName: string, valueProposition = ''): Record<string, string> {
  return {
    nome: lead.name?.split(' ')[0] || lead.name || '',
    empresa: lead.trade_name || lead.name || '',
    nomecompleto: lead.name || '',
    cidade: lead.city || '',
    estado: lead.state || '',
    segmento: catLabel(lead.category) || 'seu segmento',
    telefone: lead.phone || '',
    remetente: senderName || '',
    proposta: valueProposition || '(configure sua Proposta de Valor em Configuracoes > Atendente)',
  }
}

function applyVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

function cleanPhone(phone?: string): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  /* If starts without country code (Brazilian numbers: 10-11 digits), prepend 55 */
  if (digits.length <= 11 && !digits.startsWith('55')) return `55${digits}`
  return digits
}

function isMobileDevice(): boolean {
  return /Mobile|Android|iPhone|iPad|webOS|BlackBerry|IEMobile/i.test(navigator.userAgent)
}

function openWhatsApp(phone: string, message: string, platform: 'auto' | 'web' | 'app'): void {
  const encoded = encodeURIComponent(message)
  let url: string
  if (platform === 'web') {
    url = `https://web.whatsapp.com/send?phone=${phone}&text=${encoded}`
  } else if (platform === 'app') {
    url = `https://wa.me/${phone}?text=${encoded}`
  } else {
    // auto: use wa.me which handles both mobile and desktop
    url = `https://wa.me/${phone}?text=${encoded}`
  }
  window.open(url, '_blank', 'noopener')
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    /* Fallback for older browsers */
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      return true
    } catch {
      return false
    }
  }
}

/* ─────────────────────────────────────────────────────────────
   Sender name persistence
   ───────────────────────────────────────────────────────────── */
const SENDER_KEY = 'wa-sender-name'
function getSenderName() { return localStorage.getItem(SENDER_KEY) || '' }
function setSenderName(v: string) { localStorage.setItem(SENDER_KEY, v) }

/* ─────────────────────────────────────────────────────────────
   Variables legend chip
   ───────────────────────────────────────────────────────────── */
function VarChip({ name, value, missing }: { name: string; value: string; missing?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono border ${
      missing
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-gray-100 text-gray-600 border-gray-200'
    }`}>
      <span className="opacity-60">{`{{${name}}}`}</span>
      <span className="opacity-30 mx-0.5">→</span>
      <span className="font-medium font-sans">{value || '—'}</span>
    </span>
  )
}

/* ─────────────────────────────────────────────────────────────
   Main component
   ───────────────────────────────────────────────────────────── */
function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h['Authorization'] = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

export function WhatsAppSendModal({ leads, onClose, onSent }: WhatsAppSendModalProps) {
  const [queueIdx, setQueueIdx] = useState(0)
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id)
  const [message, setMessage] = useState('')
  const [senderName, setSenderNameState] = useState(getSenderName)
  const [copied, setCopied] = useState(false)
  const [sentIdx, setSentIdx] = useState<Set<number>>(new Set())
  const [aiLoading, setAiLoading] = useState(false)
  const [showSenderInput, setShowSenderInput] = useState(false)
  const [valueProposition, setValuePropositionState] = useState('')

  /* Fetch brand profile on mount to get value_proposition */
  useEffect(() => {
    fetch('/api/ai/agent-profile', { headers: getHeaders() })
      .then(r => r.json())
      .then(d => {
        const vp = d?.profile?.value_proposition || ''
        if (vp) setValuePropositionState(vp)
      })
      .catch(() => {})
  }, [])

  const isQueue = leads.length > 1
  const lead = leads[queueIdx] || leads[0]
  const phone = cleanPhone(lead?.phone)
  const hasPhone = phone.length > 8

  const vars = useMemo(() => buildVars(lead, senderName, valueProposition), [lead, senderName, valueProposition])

  /* When template or lead changes, rebuild message from template */
  useEffect(() => {
    const tpl = TEMPLATES.find(t => t.id === templateId)
    if (!tpl) return
    setMessage(applyVars(tpl.body, vars))
  }, [templateId, queueIdx, valueProposition]) // re-run when proposta loads

  /* Re-apply vars when sender name changes (only if message still matches template pattern) */
  const applyCurrentTemplate = useCallback(() => {
    const tpl = TEMPLATES.find(t => t.id === templateId)
    if (!tpl) return
    setMessage(applyVars(tpl.body, vars))
  }, [templateId, vars])

  /* ── AI personalize ── */
  async function aiPersonalize() {
    if (!lead || aiLoading) return
    setAiLoading(true)
    try {
      const token = localStorage.getItem('lead-system-token') || ''
      const brandId = localStorage.getItem('lead-system:active-brand-id') || ''
      const r = await fetch('/api/ai/wa-personalize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(brandId ? { 'x-brand-id': brandId } : {}),
        },
        body: JSON.stringify({
          lead: {
            name: lead.name,
            trade_name: lead.trade_name,
            city: lead.city,
            state: lead.state,
            category: catLabel(lead.category),
            google_rating: lead.google_rating,
            notes: lead.notes,
            status: lead.status,
          },
          current_message: message,
          template_id: templateId,
          sender_name: senderName,
        }),
      })
      if (r.ok) {
        const d = await r.json()
        if (d.message) setMessage(d.message)
      }
    } catch {
      /* silent fail - keep current message */
    } finally {
      setAiLoading(false)
    }
  }

  /* ── Send actions ── */
  async function handleSend(platform: 'auto' | 'web' | 'app') {
    if (!hasPhone) return
    await copyToClipboard(message)
    openWhatsApp(phone, message, platform)
    setSentIdx(prev => new Set([...prev, queueIdx]))
    onSent?.(lead)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function handleCopyOnly() {
    const ok = await copyToClipboard(message)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  function nextLead() {
    if (queueIdx < leads.length - 1) {
      setQueueIdx(i => i + 1)
      setCopied(false)
    }
  }

  function prevLead() {
    if (queueIdx > 0) {
      setQueueIdx(i => i - 1)
      setCopied(false)
    }
  }

  const allSent = isQueue && sentIdx.size >= leads.length
  const currentSent = sentIdx.has(queueIdx)

  /* ── Sender name update ── */
  function handleSenderChange(v: string) {
    setSenderNameState(v)
    setSenderName(v)
  }

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-[2px] sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Enviar pelo WhatsApp"
    >
      <div
        className="bg-white w-full max-w-lg max-h-[94vh] sm:max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
        style={{ animation: 'slideUp 260ms cubic-bezier(0.16,1,0.3,1)' }}
        onClick={e => e.stopPropagation()}
      >

        {/* ── Header ── */}
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-emerald-600 shrink-0" />
                <h2 className="text-[16px] font-bold text-gray-900">Enviar pelo WhatsApp</h2>
              </div>
              <p className="text-[12px] text-gray-500 mt-0.5 truncate">
                {isQueue
                  ? `Fila de ${leads.length} leads — editando mensagem para cada um`
                  : lead.name}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="w-8 h-8 grid place-items-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition shrink-0"
            >
              <X size={15} strokeWidth={2} />
            </button>
          </div>

          {/* Queue navigator */}
          {isQueue && (
            <div className="flex items-center gap-3 mt-3 bg-gray-50 rounded-xl px-3 py-2">
              <button
                onClick={prevLead}
                disabled={queueIdx === 0}
                className="w-7 h-7 grid place-items-center rounded-lg text-gray-500 hover:bg-gray-200 disabled:opacity-30 transition"
              >
                <ChevronLeft size={14} strokeWidth={2} />
              </button>
              <div className="flex-1 min-w-0 text-center">
                <p className="text-[12px] font-semibold text-gray-900 truncate">{lead.name}</p>
                <p className="text-[10px] text-gray-500">
                  {queueIdx + 1} de {leads.length}
                  {sentIdx.size > 0 && (
                    <span className="ml-1.5 text-emerald-600 font-medium">
                      · {sentIdx.size} enviado{sentIdx.size > 1 ? 's' : ''}
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={nextLead}
                disabled={queueIdx >= leads.length - 1}
                className="w-7 h-7 grid place-items-center rounded-lg text-gray-500 hover:bg-gray-200 disabled:opacity-30 transition"
              >
                <ChevronRight size={14} strokeWidth={2} />
              </button>
            </div>
          )}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Phone warning */}
          {!hasPhone && (
            <div className="m-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
              <AlertCircle size={16} className="shrink-0" />
              <span>Este lead não tem telefone cadastrado. Adicione um número para enviar pelo WhatsApp.</span>
            </div>
          )}

          {/* Phone info */}
          {hasPhone && (
            <div className="px-5 pt-3 pb-2 flex items-center gap-2">
              <Phone size={12} className="text-gray-400 shrink-0" />
              <span className="text-[12px] font-mono text-gray-600">{lead.phone}</span>
              {lead.city && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-[12px] text-gray-500">{lead.city}</span>
                </>
              )}
            </div>
          )}

          {/* Template selector */}
          <div className="px-5 pt-1 pb-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Modelo de mensagem</p>
            <div className="grid grid-cols-3 gap-1.5">
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setTemplateId(t.id); }}
                  className={`flex flex-col gap-0.5 text-left px-2.5 py-2 rounded-xl border text-[11px] transition ${
                    templateId === t.id
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="font-semibold leading-tight">{t.label}</span>
                  <span className={`leading-tight ${templateId === t.id ? 'text-white/60' : 'text-gray-400'}`}>
                    {t.shortDesc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Message editor */}
          <div className="px-5 pb-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Mensagem</p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={applyCurrentTemplate}
                  title="Resetar para o modelo original"
                  className="flex items-center gap-1 px-2 h-6 rounded-lg text-[10px] text-gray-500 hover:bg-gray-100 transition"
                >
                  <RotateCcw size={10} strokeWidth={2} /> Resetar
                </button>
                <button
                  type="button"
                  onClick={aiPersonalize}
                  disabled={aiLoading}
                  title="Personalizar com IA baseado nos dados do lead"
                  className="flex items-center gap-1 px-2 h-6 rounded-lg text-[10px] text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 transition"
                >
                  {aiLoading
                    ? <><Loader2 size={10} strokeWidth={2} className="animate-spin" /> Gerando...</>
                    : <><Sparkles size={10} strokeWidth={2} /> Personalizar IA</>}
                </button>
              </div>
            </div>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={8}
              placeholder="Escreva ou selecione um modelo acima..."
              className="w-full px-3.5 py-3 rounded-xl border border-gray-200 bg-gray-50 text-[13px] text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-gray-300 focus:bg-white transition resize-none leading-relaxed font-[system-ui]"
            />
            <p className="mt-1 text-[10px] text-gray-400 text-right">{message.length} chars</p>
          </div>

          {/* Variables legend */}
          <div className="px-5 pb-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Variáveis substituídas</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(vars).map(([key, value]) => (
                <VarChip
                  key={key}
                  name={key}
                  value={value}
                  missing={!value}
                />
              ))}
            </div>
            {/* Sender name quick edit */}
            <div className="mt-2">
              {showSenderInput ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={senderName}
                    onChange={e => handleSenderChange(e.target.value)}
                    onBlur={() => { setShowSenderInput(false); applyCurrentTemplate() }}
                    placeholder="Seu nome (preenche {{remetente}})"
                    autoFocus
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-[12px] text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowSenderInput(true)}
                  className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-600 transition"
                >
                  <Edit3 size={10} strokeWidth={2} />
                  {senderName ? `Seu nome: ${senderName}` : 'Definir seu nome para {{remetente}}'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer actions ── */}
        <div className="px-5 py-4 border-t border-gray-100 space-y-2 shrink-0 bg-white">

          {allSent ? (
            <div className="flex items-center justify-center gap-2 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-[13px] font-medium">
              <CheckCircle2 size={15} strokeWidth={2} />
              Todos os {leads.length} leads foram contatados!
            </div>
          ) : (
            <>
              {/* Primary: open WhatsApp (auto-detects mobile vs web) */}
              <button
                type="button"
                onClick={() => handleSend('auto')}
                disabled={!hasPhone || !message.trim()}
                className={`w-full flex items-center justify-center gap-2.5 h-12 rounded-xl text-[14px] font-semibold transition active:scale-[0.98] disabled:opacity-40 ${
                  currentSent
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                }`}
              >
                {currentSent ? (
                  <><CheckCircle2 size={16} strokeWidth={2} /> Enviado — abrir novamente</>
                ) : (
                  <><MessageSquare size={16} strokeWidth={2} /> Copiar e abrir WhatsApp</>
                )}
              </button>

              {/* Secondary row: Web + Copy only + Next (queue) */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSend('web')}
                  disabled={!hasPhone || !message.trim()}
                  title="Abrir no WhatsApp Web (navegador)"
                  className="flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-[12px] font-medium disabled:opacity-40 transition"
                >
                  <Monitor size={13} strokeWidth={2} /> Web
                </button>
                <button
                  type="button"
                  onClick={() => handleSend('app')}
                  disabled={!hasPhone || !message.trim()}
                  title="Abrir no app WhatsApp"
                  className="flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-[12px] font-medium disabled:opacity-40 transition"
                >
                  <Smartphone size={13} strokeWidth={2} /> App
                </button>
                <button
                  type="button"
                  onClick={handleCopyOnly}
                  disabled={!message.trim()}
                  className="flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-[12px] font-medium disabled:opacity-40 transition"
                >
                  {copied ? <CheckCircle2 size={13} strokeWidth={2} className="text-emerald-600" /> : <Copy size={13} strokeWidth={2} />}
                  {copied ? 'Copiado' : 'Só copiar'}
                </button>

                {/* Queue next button */}
                {isQueue && queueIdx < leads.length - 1 && (
                  <button
                    type="button"
                    onClick={nextLead}
                    className="ml-auto flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-gray-900 text-white text-[12px] font-semibold hover:bg-gray-800 transition"
                  >
                    Próximo <ChevronRight size={13} strokeWidth={2} />
                  </button>
                )}
              </div>
            </>
          )}

          {/* Copied indicator */}
          {copied && (
            <p className="text-center text-[11px] text-emerald-600 font-medium">
              Mensagem copiada para a área de transferência
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
