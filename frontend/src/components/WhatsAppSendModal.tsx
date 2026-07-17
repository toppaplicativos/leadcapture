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
import { createPortal } from 'react-dom'
import {
  X, Copy, ExternalLink, ChevronLeft, ChevronRight,
  CheckCircle2, Smartphone, Monitor,
  Edit3, RotateCcw, Phone, AlertCircle, Sparkles, Loader2,
} from 'lucide-react'
import { WhatsAppIcon } from '@/components/icons'

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
  /** Product / offer focus for this contact (affiliate queue, campaign, etc.) */
  product_name?: string
  /** Niche / segment label when category is empty */
  niche?: string
  /** Brand name override for multi-brand / affiliate contexts */
  brand_name?: string
}

interface WhatsAppSendModalProps {
  leads: WaSendLead[]
  onClose: () => void
  /** Called when user opens WhatsApp for a lead (optional — e.g. mark as contacted) */
  onSent?: (lead: WaSendLead) => void
  /** Opens the queue on a specific lead instead of always starting at the first. */
  initialIndex?: number
  /** White-label proposition supplied by another app context (for example, affiliate). */
  initialValueProposition?: string
  /** Brand display name (org or program brand). */
  initialBrandName?: string
  /** Default product/service line when the lead has none. */
  initialProductName?: string
  /** Lets another app reuse the same composer with its own authenticated AI endpoint. */
  onAiPersonalize?: (input: {
    lead: WaSendLead
    currentMessage: string
    templateId: string
    senderName: string
  }) => Promise<string>
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
    id: 'optin',
    label: 'Opt-in LGPD',
    shortDesc: 'Pedir autorização antes do pitch',
    body: `Olá! Somos da {{marca}}. Encontramos este número divulgado como contato comercial {{contato_comercial}}.

Atendemos {{nicho_regiao}} com {{produto_ou_servico}}. Podemos enviar uma breve apresentação comercial por aqui?

Se você não autorizar, este contato será removido da nossa lista.`,
  },
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
    hotel: 'Hotel', cafe: 'Café', bakery: 'Padaria', supermarket: 'Supermercado',
    butcher_shop: 'Açougue', industrial: 'Indústria',
  }
  const key = String(v).trim().toLowerCase()
  if (MAP[key]) return MAP[key]
  // Already a human label (e.g. "Restaurante", niche text)
  if (/[A-Za-zÀ-ú]/.test(v) && !key.includes('_') && key.length < 40) {
    return v.trim().replace(/^\w/, (c) => c.toUpperCase())
  }
  return v.replace(/_/g, ' ')
}

/** "do Restaurante X" / "da Escola Y" / "da empresa Z" */
function commercialContactPhrase(empresa: string, segmento: string): string {
  const name = (empresa || 'seu estabelecimento').trim()
  const seg = (segmento || '').toLowerCase()
  if (/restaurante|pizzaria|lanchonete|hamburguer|bar|buffet|café|cafe|padaria|delivery/.test(seg)) {
    return `do ${segmento || 'Restaurante'} ${name}`
  }
  if (/escola|universidade|faculdade/.test(seg)) return `da ${segmento || 'Escola'} ${name}`
  if (/indústria|industria|fabricante|fábrica|fabrica/.test(seg)) return `da indústria ${name}`
  if (/hotel|pousada/.test(seg)) return `do hotel ${name}`
  if (/supermercado|empório|emporio|açougue|acougue|loja|atacadista/.test(seg)) {
    return `do ${segmento || 'estabelecimento'} ${name}`
  }
  if (segmento && segmento !== 'seu segmento') return `do ${segmento} ${name}`
  return `da empresa ${name}`
}

/** "restaurantes da sua região" / "negócios do seu segmento em Cidade" */
function nicheRegionPhrase(segmento: string, cidade?: string): string {
  const seg = (segmento || '').toLowerCase()
  let plural = 'negócios do seu segmento'
  if (/restaurante|pizzaria|lanchonete|hamburguer|buffet|delivery/.test(seg)) plural = 'restaurantes'
  else if (/bar|café|cafe|padaria/.test(seg)) plural = 'estabelecimentos de alimentação'
  else if (/supermercado|açougue|acougue|empório|emporio|loja|atacadista/.test(seg)) plural = 'revendedores de alimentos'
  else if (/indústria|industria|fabricante/.test(seg)) plural = 'indústrias alimentícias'
  else if (/hotel|pousada/.test(seg)) plural = 'hotéis e cozinhas profissionais'
  else if (segmento && segmento !== 'seu segmento') plural = `${segmento.toLowerCase()}s`.replace(/ss$/, 's')

  if (cidade) return `${plural} de ${cidade} e região`
  return `${plural} da sua região`
}

function shortOffer(valueProposition: string, productName?: string, fallback = 'nossos produtos e soluções'): string {
  const product = String(productName || '').trim()
  if (product) return product
  const vp = String(valueProposition || '').trim()
  if (!vp) return fallback
  // First clause up to ~90 chars — readable product/service line
  const clause = vp.split(/[.\n;]/)[0]?.trim() || vp
  return clause.length > 100 ? `${clause.slice(0, 97).trim()}…` : clause
}

function buildVars(
  lead: WaSendLead,
  senderName: string,
  valueProposition = '',
  brandName = '',
  defaultProduct = '',
): Record<string, string> {
  const empresa = lead.trade_name || lead.name || ''
  const segmento = catLabel(lead.niche || lead.category) || 'seu segmento'
  const cidade = lead.city || ''
  const marca =
    lead.brand_name?.trim() ||
    brandName.trim() ||
    localStorage.getItem('lead-system:active-brand-name') ||
    'nossa empresa'
  const produto = shortOffer(valueProposition, lead.product_name || defaultProduct)

  return {
    nome: lead.name?.split(' ')[0] || lead.name || '',
    empresa,
    nomecompleto: lead.name || '',
    cidade,
    estado: lead.state || '',
    segmento,
    telefone: lead.phone || '',
    remetente: senderName || '',
    proposta: valueProposition || '(configure sua Proposta de Valor em Configurações > Atendente)',
    marca,
    produto,
    produto_ou_servico: produto,
    nicho: segmento,
    contato_comercial: commercialContactPhrase(empresa, segmento),
    nicho_regiao: nicheRegionPhrase(segmento, cidade),
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

export function WhatsAppSendModal({
  leads,
  onClose,
  onSent,
  initialIndex = 0,
  initialValueProposition = '',
  initialBrandName = '',
  initialProductName = '',
  onAiPersonalize,
}: WhatsAppSendModalProps) {
  const [queueIdx, setQueueIdx] = useState(() => Math.min(Math.max(initialIndex, 0), Math.max(leads.length - 1, 0)))
  const [templateId, setTemplateId] = useState('optin')
  const [message, setMessage] = useState('')
  const [senderName, setSenderNameState] = useState(getSenderName)
  const [copied, setCopied] = useState(false)
  const [sentIdx, setSentIdx] = useState<Set<number>>(new Set())
  const [aiLoading, setAiLoading] = useState(false)
  const [showSenderInput, setShowSenderInput] = useState(false)
  const [valueProposition, setValuePropositionState] = useState(initialValueProposition)
  const [brandName, setBrandName] = useState(
    () => initialBrandName || localStorage.getItem('lead-system:active-brand-name') || '',
  )
  const [defaultProduct, setDefaultProduct] = useState(initialProductName)

  /* Fetch brand profile on mount to get value_proposition + brand context */
  useEffect(() => {
    if (initialValueProposition && initialBrandName && initialProductName) return
    fetch('/api/ai/agent-profile', { headers: getHeaders() })
      .then(r => r.json())
      .then(d => {
        const profile = d?.profile || {}
        const vp = profile.value_proposition || ''
        if (!initialValueProposition && vp) setValuePropositionState(vp)
        // Prefer explicit brand name; fall back to agent label without "Consultor"
        if (!initialBrandName) {
          const agent = String(profile.agent_name || '').trim()
          const cleaned = agent.replace(/^consultor(a)?\s+/i, '').trim()
          if (cleaned) setBrandName((prev) => prev || cleaned)
        }
      })
      .catch(() => {})
    // Brand unit name (org admin context)
    if (!initialBrandName) {
      fetch('/api/brands', { headers: getHeaders() })
        .then(r => r.json())
        .then(d => {
          const list = Array.isArray(d) ? d : d?.brands || d?.items || []
          const activeId = localStorage.getItem('lead-system:active-brand-id')
          const match = list.find((b: any) => String(b.id) === String(activeId)) || list[0]
          const name = String(match?.name || '').trim()
          if (name) {
            setBrandName((prev) => prev || name)
            localStorage.setItem('lead-system:active-brand-name', name)
          }
        })
        .catch(() => {})
    }
  }, [initialValueProposition, initialBrandName, initialProductName])

  useEffect(() => {
    if (initialBrandName) setBrandName(initialBrandName)
  }, [initialBrandName])

  useEffect(() => {
    if (initialProductName) setDefaultProduct(initialProductName)
  }, [initialProductName])

  useEffect(() => {
    if (initialValueProposition) setValuePropositionState(initialValueProposition)
  }, [initialValueProposition])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  const isQueue = leads.length > 1
  const lead = leads[queueIdx] || leads[0]
  const phone = cleanPhone(lead?.phone)
  const hasPhone = phone.length > 8

  const vars = useMemo(
    () => buildVars(lead, senderName, valueProposition, brandName, defaultProduct),
    [lead, senderName, valueProposition, brandName, defaultProduct],
  )

  /* When template or lead changes, rebuild message from template */
  useEffect(() => {
    const tpl = TEMPLATES.find(t => t.id === templateId)
    if (!tpl) return
    setMessage(applyVars(tpl.body, vars))
    // Intentionally not depending on full `vars` object identity every render —
    // rebuild when lead, template or brand context that feeds vars changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, queueIdx, valueProposition, brandName, defaultProduct, senderName, lead?.id, lead?.name, lead?.phone, lead?.category, lead?.niche, lead?.product_name, lead?.brand_name, lead?.city])

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
      if (onAiPersonalize) {
        const personalized = await onAiPersonalize({
          lead,
          currentMessage: message,
          templateId,
          senderName,
        })
        if (personalized) setMessage(personalized)
        return
      }
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
            category: catLabel(lead.niche || lead.category),
            google_rating: lead.google_rating,
            notes: lead.notes,
            status: lead.status,
            product_name: lead.product_name,
            brand_name: lead.brand_name || brandName,
          },
          current_message: message,
          template_id: templateId,
          sender_name: senderName,
          intent: templateId === 'optin' ? 'optin_authorization' : templateId,
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

  return createPortal((
    <div
      className="fixed inset-0 z-[700] flex items-stretch lg:items-center justify-center bg-black/55 backdrop-blur-[3px] lg:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Enviar pelo WhatsApp"
    >
      <div
        className="bg-white w-full lg:max-w-5xl h-[100dvh] lg:h-auto lg:max-h-[90dvh] flex flex-col rounded-none lg:rounded-[24px] shadow-[0_24px_80px_rgba(0,0,0,0.22)] overflow-hidden border border-black/5"
        style={{ animation: 'slideUp 260ms cubic-bezier(0.16,1,0.3,1)' }}
        onClick={e => e.stopPropagation()}
      >

        {/* ── Header ── */}
        <div className="px-4 lg:px-6 pt-[max(12px,env(safe-area-inset-top))] pb-3 lg:py-4 border-b border-neutral-200 shrink-0 bg-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <WhatsAppIcon size={16} className="brand-icon--wa shrink-0" />
                <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-neutral-950">Preparar mensagem</h2>
              </div>
              <p className="text-[11px] lg:text-[12px] text-neutral-500 mt-0.5 truncate">
                {isQueue
                  ? `Fila de ${leads.length} leads — editando mensagem para cada um`
                  : lead.name}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="w-11 h-11 grid place-items-center rounded-2xl text-neutral-500 hover:text-neutral-950 hover:bg-neutral-100 transition shrink-0"
            >
              <X size={15} strokeWidth={2} />
            </button>
          </div>

          {/* Queue navigator */}
          {isQueue && (
            <div className="flex items-center gap-2 mt-2.5 bg-neutral-50 border border-neutral-200 rounded-2xl px-1.5 py-1.5">
              <button
                onClick={prevLead}
                disabled={queueIdx === 0}
                aria-label="Contato anterior"
                title="Contato anterior"
                className="w-9 h-9 grid place-items-center rounded-xl text-neutral-600 hover:bg-neutral-200 disabled:opacity-30 transition"
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
                aria-label="Próximo contato"
                title="Próximo contato"
                className="w-9 h-9 grid place-items-center rounded-xl text-neutral-600 hover:bg-neutral-200 disabled:opacity-30 transition"
              >
                <ChevronRight size={14} strokeWidth={2} />
              </button>
            </div>
          )}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain lg:overflow-hidden lg:grid lg:grid-cols-[300px_minmax(0,1fr)]">

          <aside className="lg:overflow-y-auto lg:border-r lg:border-neutral-200 bg-neutral-50/70">

          {/* Phone warning */}
          {!hasPhone && (
            <div className="m-4 flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
              <AlertCircle size={16} className="shrink-0" />
              <span>Este lead não tem telefone cadastrado. Adicione um número para enviar pelo WhatsApp.</span>
            </div>
          )}

          {/* Phone info */}
          {hasPhone && (
            <div className="mx-4 mt-3 lg:mt-4 p-3 rounded-2xl bg-white border border-neutral-200 shadow-[0_1px_2px_rgba(0,0,0,.03)]">
              <p className="text-[11px] font-semibold text-neutral-950 truncate mb-1">{lead.trade_name || lead.name}</p>
              <div className="flex items-center gap-2">
              <Phone size={12} className="text-gray-400 shrink-0" />
              <span className="text-[12px] font-mono text-gray-600">{lead.phone}</span>
              {lead.city && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-[12px] text-gray-500">{lead.city}</span>
                </>
              )}
              </div>
            </div>
          )}

          {/* Template selector */}
          <div className="px-4 pt-3 lg:pt-4 pb-3 lg:pb-4">
            <p className="text-[11px] font-semibold text-neutral-600 mb-2">Escolha um ponto de partida</p>
            <div className="flex lg:grid lg:grid-cols-1 gap-2 overflow-x-auto snap-x pb-1 -mx-4 px-4 lg:mx-0 lg:px-0 lg:overflow-visible">
              {TEMPLATES.map(t => {
                const isOptIn = t.id === 'optin'
                const selected = templateId === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { setTemplateId(t.id); }}
                    className={`w-[148px] shrink-0 lg:w-auto snap-start min-h-[54px] flex flex-col justify-center gap-0.5 text-left px-3 py-2.5 rounded-2xl border text-[11px] transition ${
                      selected
                        ? isOptIn
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-gray-900 text-white border-gray-900'
                        : isOptIn
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:border-emerald-300'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span className="font-semibold leading-tight">{t.label}</span>
                    <span className={`leading-tight ${selected ? 'text-white/60' : isOptIn ? 'text-emerald-700/70' : 'text-gray-400'}`}>
                      {t.shortDesc}
                    </span>
                  </button>
                )
              })}
            </div>
            {templateId === 'optin' && (
              <p className="hidden lg:block mt-3 text-[11px] leading-relaxed text-emerald-900 bg-emerald-50 border border-emerald-100 rounded-2xl px-3 py-2.5">
                Pede autorização antes da oferta. Usa marca, empresa, nicho, região e produto/serviço da proposta de valor.
                Se o contato não autorizar, trate como opt-out e remova da lista.
              </p>
            )}
          </div>
          </aside>

          <section className="lg:overflow-y-auto bg-white">

          {/* Message editor */}
          <div className="px-4 lg:px-7 pt-4 lg:pt-6 pb-3 lg:pb-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <p className="text-[15px] font-semibold tracking-[-0.015em] text-neutral-950">Composição</p>
                <p className="text-[11px] text-neutral-500">Revise o texto antes de abrir o WhatsApp.</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={applyCurrentTemplate}
                  title="Resetar para o modelo original"
                  className="flex items-center gap-1.5 px-2.5 h-9 rounded-xl text-[11px] font-medium text-neutral-600 hover:bg-neutral-100 transition"
                >
                  <RotateCcw size={11} strokeWidth={2} /> <span className="hidden sm:inline">Resetar</span>
                </button>
                <button
                  type="button"
                  onClick={aiPersonalize}
                  disabled={aiLoading}
                  title="Personalizar com IA baseado nos dados do lead"
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 h-9 rounded-xl text-[11px] font-semibold text-neutral-900 bg-neutral-100 hover:bg-neutral-200 disabled:opacity-50 transition"
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
              rows={11}
              placeholder="Escreva ou selecione um modelo acima..."
              className="w-full min-h-[210px] lg:min-h-[250px] px-4 py-4 rounded-[20px] border border-neutral-200 bg-neutral-50 text-[14px] text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-4 focus:ring-neutral-900/5 focus:border-neutral-900 focus:bg-white transition resize-y leading-relaxed font-[Inter,system-ui,sans-serif]"
            />
            <p className="mt-1 text-[10px] text-gray-400 text-right">{message.length} chars</p>
          </div>

          {/* Variables legend */}
          <details className="mx-4 lg:mx-7 mb-4 lg:mb-5 rounded-2xl border border-neutral-200 bg-neutral-50 group">
            <summary className="min-h-11 px-4 flex items-center justify-between cursor-pointer text-[12px] font-semibold text-neutral-700 list-none">
              Dados usados na personalização
              <ChevronRight size={14} className="transition-transform group-open:rotate-90" />
            </summary>
            <div className="px-4 pb-4 border-t border-neutral-200 pt-3">
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
            <div className="mt-3">
              {showSenderInput ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={senderName}
                    onChange={e => handleSenderChange(e.target.value)}
                    onBlur={() => { setShowSenderInput(false); applyCurrentTemplate() }}
                    placeholder="Seu nome (preenche {{remetente}})"
                    autoFocus
                    className="flex-1 h-11 px-3 rounded-2xl border border-neutral-200 text-[12px] text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-4 focus:ring-neutral-900/5 focus:border-neutral-900"
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
          </details>
          </section>
        </div>

        {/* ── Footer actions ── */}
        <div className="px-4 lg:px-6 pt-3 lg:py-4 border-t border-neutral-200 space-y-2 shrink-0 bg-white pb-[max(12px,env(safe-area-inset-bottom))]">

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
                className={`w-full flex items-center justify-center gap-2.5 h-12 rounded-[18px] text-[14px] font-semibold transition active:scale-[0.98] disabled:opacity-40 ${
                  currentSent
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                }`}
              >
                {currentSent ? (
                  <><CheckCircle2 size={16} strokeWidth={2} /> Enviado — abrir novamente</>
                ) : (
                  <><WhatsAppIcon size={16} className="brand-icon--wa" /> Copiar e abrir WhatsApp</>
                )}
              </button>

              {/* Secondary row: Web + Copy only + Next (queue) */}
              <div className="grid grid-cols-3 sm:flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSend('web')}
                  disabled={!hasPhone || !message.trim()}
                  title="Abrir no WhatsApp Web (navegador)"
                  className="flex items-center justify-center gap-1.5 h-11 px-2 sm:px-3.5 rounded-2xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-[12px] font-medium disabled:opacity-40 transition"
                >
                  <Monitor size={13} strokeWidth={2} /> Web
                </button>
                <button
                  type="button"
                  onClick={() => handleSend('app')}
                  disabled={!hasPhone || !message.trim()}
                  title="Abrir no app WhatsApp"
                  className="flex items-center justify-center gap-1.5 h-11 px-2 sm:px-3.5 rounded-2xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-[12px] font-medium disabled:opacity-40 transition"
                >
                  <Smartphone size={13} strokeWidth={2} /> App
                </button>
                <button
                  type="button"
                  onClick={handleCopyOnly}
                  disabled={!message.trim()}
                  className="flex items-center justify-center gap-1.5 h-11 px-2 sm:px-3.5 rounded-2xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-[12px] font-medium disabled:opacity-40 transition"
                >
                  {copied ? <CheckCircle2 size={13} strokeWidth={2} className="text-emerald-600" /> : <Copy size={13} strokeWidth={2} />}
                  {copied ? 'Copiado' : 'Só copiar'}
                </button>

                {/* Queue next button */}
                {isQueue && queueIdx < leads.length - 1 && (
                  <button
                    type="button"
                    onClick={nextLead}
                    className="col-span-3 sm:col-span-1 sm:ml-auto flex items-center justify-center gap-1.5 h-11 px-3.5 rounded-2xl bg-neutral-950 text-white text-[12px] font-semibold hover:bg-neutral-800 transition"
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
  ), document.body)
}
