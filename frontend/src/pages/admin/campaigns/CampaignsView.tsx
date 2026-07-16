import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode, type ComponentType } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, MessageSquare, Megaphone, ShoppingCart,
  Package, Palette, Search, RefreshCw, LogOut, Menu, X, Loader2,
  Plus, Phone, Mail, Clock, ArrowRight, BarChart3, Zap, Eye,
  ChevronLeft, ChevronRight, Send, Pause, Ban, Bot, Bell, Trash2,
  Wand2, Truck, Globe, Settings, Volume2, FileText, Link2, Receipt, Sparkles,
  CreditCard, QrCode, Banknote, User, BadgeCheck, Headphones, Brain,
  Boxes, Store, Laptop, CheckCircle2, Copy, Info, AlertTriangle, Star,
  Camera, Ticket, Percent, MessageSquareQuote, ThumbsUp, ThumbsDown, Film, ShoppingBag,
  ImageIcon, MousePointerClick, List, Minus, GripVertical, ArrowUp, ArrowDown,
  Images, Upload, ExternalLink,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { InstagramIcon, WhatsAppIcon } from '@/components/icons'
import { adminApi, inventoryApi } from '@/lib/api-admin'
import { useConfirm } from '@/components/ConfirmModal'
import { AICampaignWizardModal } from '@/components/AICampaignWizardModal'
import { BrandSkillsPage } from '@/pages/BrandSkillsPage'
import { WhatsAppHealthBanner } from '@/components/WhatsAppHealthBanner'
import {
  getHeaders, clearAdminAuth, money, num, dt, dtFull,
  toBrandSlug, pickStockBrandSlug, buildStockAppUrl,
} from '@/lib/admin/helpers'
import type { ShowToast } from '@/lib/admin/types'
import { Skeleton, KpiCard, EmptyState } from '@/components/admin/primitives'
import { MediaPickerModal } from '@/components/gallery/MediaPickerModal'
import type { GalleryItem } from '@/lib/gallery/types'
import {
  TemplateTagTextarea,
  collectUsedTemplateTags,
} from '@/components/campaigns/TemplateTagTextarea'
import { useCampaignsBridgeOptional } from '@/lib/agent/CampaignsBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { fieldControlClass, fieldLabelLegacyClass } from '@/components/ui'

type CampaignChannel = 'whatsapp' | 'instagram' | 'email' | 'push'
type CampaignActionBlock = {
  id: string
  channel: CampaignChannel
  actionType: string
  content: string
  useAi: boolean
  aiInstruction: string
  config: Record<string, any>
}

type CampaignIcon = ComponentType<{ size?: number; className?: string }>

const CAMPAIGN_CHANNELS: Array<{ key: CampaignChannel; label: string; description: string; Icon: CampaignIcon }> = [
  { key: 'whatsapp', label: 'WhatsApp', description: 'Conversa e mídia', Icon: WhatsAppIcon },
  { key: 'instagram', label: 'Instagram', description: 'Direct e conteúdo', Icon: InstagramIcon },
  { key: 'email', label: 'E-mail', description: 'Mensagem completa', Icon: Mail },
  { key: 'push', label: 'Push', description: 'Alerta no aplicativo', Icon: Bell },
]

const ACTION_TYPE_ICONS: Record<string, LucideIcon> = {
  text: FileText,
  direct: Send,
  image: ImageIcon,
  video: Film,
  buttons: MousePointerClick,
  button: MousePointerClick,
  list: List,
  poll: BarChart3,
  post: Camera,
  story: Eye,
  reel: Film,
  divider: Minus,
  deeplink: Link2,
}

const CHANNEL_ACTION_TYPES: Record<CampaignChannel, Array<{ value: string; label: string }>> = {
  whatsapp: [
    { value: 'text', label: 'Texto' }, { value: 'image', label: 'Imagem' }, { value: 'video', label: 'Vídeo' },
    { value: 'buttons', label: 'Botões' }, { value: 'list', label: 'Lista' }, { value: 'poll', label: 'Enquete' },
  ],
  instagram: [
    { value: 'direct', label: 'Mensagem no Direct' }, { value: 'image', label: 'Imagem' }, { value: 'video', label: 'Vídeo' },
    { value: 'post', label: 'Post' }, { value: 'story', label: 'Story' }, { value: 'reel', label: 'Reel' },
  ],
  email: [{ value: 'text', label: 'Texto' }, { value: 'image', label: 'Imagem' }, { value: 'button', label: 'Botão' }, { value: 'divider', label: 'Divisor' }],
  push: [{ value: 'text', label: 'Mensagem' }, { value: 'image', label: 'Imagem' }, { value: 'deeplink', label: 'Link interno' }],
}

function defaultActionType(channel: CampaignChannel): string {
  return CHANNEL_ACTION_TYPES[channel][0].value
}

function createCampaignActionBlock(channel: CampaignChannel, id: string): CampaignActionBlock {
  return { id, channel, actionType: defaultActionType(channel), content: '', useAi: true, aiInstruction: '', config: {} }
}

/** IA só em blocos de texto puro (não em mídia, botões, lista, enquete). */
function blockSupportsAi(actionType: string): boolean {
  return actionType === 'text' || actionType === 'direct'
}

/** Botões / lista / enquete — opções literais, sem IA. */
function blockHasOptionBuilder(actionType: string): boolean {
  return actionType === 'buttons' || actionType === 'list' || actionType === 'poll'
}

function optionBuilderMeta(actionType: string): {
  title: string
  itemLabel: string
  addLabel: string
  max: number
  min: number
  placeholders: string[]
} {
  if (actionType === 'buttons') {
    return {
      title: 'Botões',
      itemLabel: 'Botão',
      addLabel: 'Adicionar botão',
      max: 3,
      min: 1,
      placeholders: ['Ex: Quero saber mais', 'Ex: Falar com atendente', 'Ex: Ver catálogo'],
    }
  }
  if (actionType === 'poll') {
    return {
      title: 'Opções da enquete',
      itemLabel: 'Opção',
      addLabel: 'Adicionar opção',
      max: 12,
      min: 2,
      placeholders: ['Ex: Sim', 'Ex: Não', 'Ex: Talvez'],
    }
  }
  return {
    title: 'Itens da lista',
    itemLabel: 'Item',
    addLabel: 'Adicionar item',
    max: 10,
    min: 1,
    placeholders: ['Ex: Catálogo', 'Ex: Preços', 'Ex: Falar com humano'],
  }
}

function parseOptionsConfig(raw: string | undefined | null): string[] {
  const lines = String(raw || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  return lines
}

function serializeOptionsConfig(options: string[]): string {
  return options.map((o) => o.trim()).filter(Boolean).join('\n')
}

/** Tags de personalização — lead + afiliado + marca. Uma campanha se adapta ao afiliado em runtime. */
const MESSAGE_TEMPLATE_TAG_GROUPS: Array<{
  key: string
  label: string
  hint: string
  tags: Array<{ token: string; label: string; description: string }>
}> = [
  {
    key: 'lead',
    label: 'Lead / prospect',
    hint: 'Dados do contato no momento do envio',
    tags: [
      { token: '{{nome}}', label: 'Nome', description: 'Nome do lead/prospect' },
      { token: '{{telefone}}', label: 'Telefone', description: 'Telefone do lead' },
      { token: '{{cidade}}', label: 'Cidade', description: 'Cidade do lead' },
      { token: '{{estado}}', label: 'Estado', description: 'UF do lead' },
      { token: '{{segmento}}', label: 'Nicho / segmento', description: 'Categoria ou nicho do lead' },
      { token: '{{categoria}}', label: 'Categoria', description: 'Categoria do lead' },
      { token: '{{empresa}}', label: 'Empresa (lead)', description: 'Nome da empresa do lead, se houver' },
    ],
  },
  {
    key: 'afiliado',
    label: 'Afiliado (assistente)',
    hint: 'Molda a mensagem e a IA ao afiliado que envia — sem campanha por afiliado',
    tags: [
      { token: '{{afiliado_nome}}', label: 'Nome do afiliado', description: 'Como o assistente se apresenta' },
      { token: '{{afiliado_cidade}}', label: 'Cidade do afiliado', description: 'Cidade / base do afiliado' },
      { token: '{{afiliado_regiao}}', label: 'Região', description: 'Região de atuação' },
      { token: '{{afiliado_nicho}}', label: 'Nicho do afiliado', description: 'Nicho / especialidade' },
      { token: '{{afiliado_telefone}}', label: 'Telefone', description: 'Telefone do afiliado' },
      { token: '{{afiliado_codigo}}', label: 'Código', description: 'Código do afiliado' },
      { token: '{{afiliado_cupom}}', label: 'Cupom', description: 'Cupom de indicação' },
      { token: '{{afiliado_instagram}}', label: 'Instagram', description: '@ do Instagram' },
      { token: '{{afiliado_info}}', label: 'Info completa', description: 'Bloco completo para a IA se moldar ao afiliado' },
    ],
  },
  {
    key: 'marca',
    label: 'Marca',
    hint: 'Identidade da marca da campanha',
    tags: [
      { token: '{{marca}}', label: 'Marca', description: 'Nome da marca/brand' },
      { token: '{{brand}}', label: 'Brand', description: 'Alias de {{marca}}' },
    ],
  },
  {
    key: 'produto',
    label: 'Produto',
    hint: 'Produto anexado à campanha ou itens da lista/botões com produto marcado',
    tags: [
      { token: '{{produto_nome}}', label: 'Nome', description: 'Nome do produto principal' },
      { token: '{{produto_preco}}', label: 'Preço', description: 'Preço formatado (com promo se houver)' },
      { token: '{{produto_link}}', label: 'Link', description: 'URL pública do produto no catálogo' },
      { token: '{{produto_descricao}}', label: 'Descrição', description: 'Descrição curta do produto' },
      { token: '{{produtos_lista}}', label: 'Lista de produtos', description: 'Todos os produtos vinculados com preço e link' },
    ],
  },
]

const KNOWN_TEMPLATE_TOKENS: string[] = MESSAGE_TEMPLATE_TAG_GROUPS.flatMap((g) =>
  g.tags.map((t) => t.token),
)

export function CampaignsView({
  showToast,
  embedded = false,
  channel,
}: {
  showToast: (t: string, tp?: 'ok' | 'err') => void
  embedded?: boolean
  channel?: 'whatsapp'
}) {
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all' | 'active' | 'paused' | 'draft' | 'done'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editCampaign, setEditCampaign] = useState<any>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [creatingRuler, setCreatingRuler] = useState(false)
  /* Wizard de IA - 7 skills SSE que montam campanha do zero a partir de prompt */
  const [aiWizardOpen, setAiWizardOpen] = useState(false)
  const { confirm } = useConfirm()
  const campaignsBridge = useCampaignsBridgeOptional()
  const publishSnapshot = campaignsBridge?.publishSnapshot
  const registerHandlers = campaignsBridge?.registerHandlers
  const { openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const pendingSelectId = useRef<string | null>(null)

  function loadCampaigns(silent = false) {
    if (!silent) setLoading(true)
    adminApi.campaigns().then(d => {
      const all = d.campaigns || d.items || (Array.isArray(d) ? d : [])
      setCampaigns(channel === 'whatsapp'
        ? all.filter((campaign: any) => Boolean(campaign.instance_id || campaign.whatsapp_instance_id) || String(campaign.channel || campaign.canal || '').toLowerCase() === 'whatsapp')
        : all)
      if (!silent) setLoading(false)
    }).catch(e => { if (!silent) { showToast(e.message, 'err'); setLoading(false) } })
  }
  useEffect(() => { loadCampaigns() }, [channel])

  useEffect(() => {
    const hasRunning = campaigns.some(c => ['active', 'running', 'sending'].includes(c.status))
    if (!hasRunning) return
    const iv = setInterval(() => loadCampaigns(true), 5000)
    return () => clearInterval(iv)
  }, [campaigns])

  useEffect(() => {
    if (!editCampaign || !modalOpen) return
    const fresh = campaigns.find(c => c.id === editCampaign.id)
    if (fresh && (
      fresh.sent_count !== editCampaign.sent_count ||
      fresh.replied_count !== editCampaign.replied_count ||
      fresh.delivered_count !== editCampaign.delivered_count ||
      fresh.read_count !== editCampaign.read_count ||
      fresh.failed_count !== editCampaign.failed_count ||
      fresh.status !== editCampaign.status
    )) {
      setEditCampaign(fresh)
    }
  }, [campaigns, editCampaign?.id, modalOpen])

  function openCreate() { setEditCampaign(null); setModalOpen(true) }
  function openEdit(c: any) { setEditCampaign(c); setModalOpen(true) }

  useEffect(() => {
    if (!registerHandlers || !isDesktop) return
    return registerHandlers({
      selectCampaign: (id) => {
        const found = campaigns.find((c) => String(c.id) === String(id))
        if (found) {
          pendingSelectId.current = null
          openEdit(found)
        } else {
          pendingSelectId.current = id
        }
      },
      createNew: openCreate,
      openAiWizard: () => setAiWizardOpen(true),
      openFull: () => { if (isDesktop) openCanvas('/campanhas') },
      refresh: () => loadCampaigns(),
    })
  }, [registerHandlers, isDesktop, campaigns, openCanvas])

  useEffect(() => {
    if (!isDesktop || !pendingSelectId.current) return
    const found = campaigns.find((c) => String(c.id) === String(pendingSelectId.current))
    if (found) {
      openEdit(found)
      pendingSelectId.current = null
    }
  }, [campaigns, isDesktop])

  useEffect(() => {
    if (!publishSnapshot || !isDesktop) return
    const active = campaigns.filter((c) => ['active', 'running', 'sending'].includes(c.status)).length
    publishSnapshot({
      total: campaigns.length,
      active,
      loading,
      selectedId: editCampaign?.id ? String(editCampaign.id) : null,
      selectedName: editCampaign?.name || '',
    })
  }, [publishSnapshot, isDesktop, campaigns, loading, editCampaign?.id, editCampaign?.name])

  async function createFollowupRuler() {
    const ok = await confirm({
      title: 'Gerar regua completa de Follow-up?',
      message: (
        <div className="space-y-2.5">
          <p>A IA vai criar <b>8 campanhas</b> em sequencia (FU0 a FU7) ja adaptadas ao tom do agente, produto e prova social do brand ativo:</p>
          <ul className="text-[12px] text-gray-500 leading-relaxed pl-3 space-y-0.5">
            <li>· FU0 - Abertura (D+0)</li>
            <li>· FU1 - Check-in (D+2)</li>
            <li>· FU2 - Consciencia (D+5)</li>
            <li>· FU3 - Prova Social (D+8)</li>
            <li>· FU4 - Educacao (D+12)</li>
            <li>· FU5 - Caso Real (D+16)</li>
            <li>· FU6 - Valor Puro (D+20)</li>
            <li>· FU7 - Break-up (D+25)</li>
          </ul>
          <p className="text-[12px] text-gray-500">As campanhas sao criadas em <b>rascunho</b> para voce revisar e ativar manualmente. Pode levar alguns segundos.</p>
        </div>
      ),
      confirmLabel: 'Gerar regua',
      cancelLabel: 'Cancelar',
      variant: 'info',
    })
    if (!ok) return
    setCreatingRuler(true)
    try {
      // Fetch direto para capturar a `hint` do backend caso erre
      const token = localStorage.getItem('lead-system-token')
      const brandId = localStorage.getItem('lead-system:active-brand-id')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      if (brandId) headers['x-brand-id'] = brandId
      const res = await fetch('/api/campaigns-v2/followup-ruler', { method: 'POST', headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = [data?.error, data?.hint].filter(Boolean).join(' — ') || `Erro ${res.status}`
        showToast(msg, 'err')
      } else if ((data?.created?.length || 0) > 0) {
        showToast(`Regua criada — ${data.created.length} campanhas em rascunho.`)
      } else if ((data?.skipped?.length || 0) > 0) {
        showToast('Regua ja existe para este brand.', 'err')
      } else {
        showToast(data?.message || 'Operacao concluida.')
      }
      loadCampaigns()
    } catch (e: any) {
      showToast(e.message || 'Falha ao gerar regua de follow-up', 'err')
    }
    setCreatingRuler(false)
  }

  async function doAction(id: string, action: 'start' | 'pause' | 'cancel' | 'delete') {
    setActionLoading(id)
    try {
      if (action === 'start') await adminApi.startCampaign(id)
      else if (action === 'pause') await adminApi.pauseCampaign(id)
      else if (action === 'cancel') await adminApi.cancelCampaign(id)
      else if (action === 'delete') await adminApi.deleteCampaign(id)
      showToast(action === 'delete' ? 'Campanha removida' : `Campanha ${action === 'start' ? 'iniciada' : action === 'pause' ? 'pausada' : 'cancelada'}!`)
      loadCampaigns()
    } catch (e: any) { showToast(e.message, 'err') }
    setActionLoading(null)
  }

  const filtered = tab === 'all' ? campaigns
    : tab === 'active' ? campaigns.filter(c => ['active', 'running', 'sending'].includes(c.status))
    : tab === 'paused' ? campaigns.filter(c => c.status === 'paused')
    : tab === 'draft' ? campaigns.filter(c => c.status === 'draft')
    : campaigns.filter(c => ['completed', 'cancelled', 'finished'].includes(c.status))

  const statusBadge = (s?: string) => {
    const m: Record<string, { label: string; cls: string }> = {
      active: { label: 'Ativa', cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
      running: { label: 'Enviando', cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
      sending: { label: 'Enviando', cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
      draft: { label: 'Rascunho', cls: 'bg-gray-100 text-gray-600' },
      paused: { label: 'Pausada', cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
      completed: { label: 'Concluida', cls: 'bg-emerald-50 text-emerald-700' },
      finished: { label: 'Finalizada', cls: 'bg-gray-100 text-gray-500' },
      cancelled: { label: 'Cancelada', cls: 'bg-red-50 text-red-600' },
    }
    const cfg = m[(s || '').toLowerCase()] || { label: s || '?', cls: 'bg-gray-100 text-gray-600' }
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
  }

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-5'}>
      {embedded ? (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[12px] text-gray-500 tabular-nums">{campaigns.length} campanhas</p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAiWizardOpen(true)}
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-gray-900 text-white text-[11px] font-bold hover:bg-gray-800"
            >
              <Sparkles size={13} /> IA
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-800 text-[11px] font-bold hover:bg-gray-50"
            >
              <Plus size={13} /> Nova
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Campanhas</h2>
            <p className="text-[13px] text-gray-400 mt-0.5">{campaigns.length} campanhas</p>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
            <button onClick={() => setAiWizardOpen(true)}
              title="Descreva o objetivo em linguagem natural - a IA monta a campanha completa em rascunho"
              className="order-1 ai-shimmer relative overflow-hidden flex items-center justify-center gap-1.5 min-h-11 px-4 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white text-xs font-bold transition-all">
              <Sparkles size={14} className="relative z-10" />
              <span className="relative z-10">Criar com IA</span>
            </button>
            <button onClick={createFollowupRuler} disabled={creatingRuler}
              title="Cria 8 follow-ups (FU0..FU7) adaptados ao tom do agente, produto e prova social do brand"
              className="order-3 sm:order-2 col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 min-h-11 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-50 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
              {creatingRuler ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {creatingRuler ? 'Gerando régua...' : 'Régua de follow-up'}
            </button>
            <button onClick={openCreate}
              className="order-2 sm:order-3 flex items-center justify-center gap-1.5 min-h-11 px-4 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white text-xs font-bold transition-all">
              <Plus size={14} /> Nova Campanha
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-0.5 rounded-xl w-full sm:w-fit overflow-x-auto">
        {([['all', 'Todas'], ['active', 'Ativas'], ['paused', 'Pausadas'], ['draft', 'Rascunhos'], ['done', 'Finalizadas']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`shrink-0 px-3.5 py-1.5 rounded-lg text-[11px] font-semibold transition ${
              tab === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}>{l}</button>
        ))}
      </div>

      {/* List */}
      {loading ? <Skeleton rows={4} /> : filtered.length === 0 ? (
        <EmptyState icon={Megaphone} text="Nenhuma campanha encontrada" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((c: any) => {
            const pct = c.target_count > 0 ? Math.round(((c.sent_count || 0) / c.target_count) * 100) : 0
            const isRunning = ['active', 'running', 'sending'].includes(c.status)
            const canStart = ['draft', 'paused', 'scheduled'].includes(c.status)
            const isDone = ['completed', 'cancelled'].includes(c.status)
            const accentColor = isRunning
              ? 'bg-blue-500'
              : c.status === 'paused'
                ? 'bg-amber-400'
                : c.status === 'draft'
                  ? 'bg-gray-300'
                  : isDone
                    ? 'bg-gray-300'
                    : 'bg-gray-300'
            return (
              <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_4px_rgba(0,0,0,0.07)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.1)] transition-all overflow-hidden flex flex-col">
                {/* Accent bar */}
                <div className={`h-1 w-full ${accentColor} ${isRunning ? 'animate-pulse' : ''}`} />

                <div className="p-3 flex-1 flex flex-col">
                  {/* Header row — title + badges + primary action */}
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-extrabold text-[13px] text-gray-900 truncate leading-tight">{c.name || 'Sem titulo'}</h4>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {statusBadge(c.status)}
                        {c.use_ai && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-900 border border-gray-200">IA</span>}
                        {(c.settings?.autoFeedLeads || c.settings?.auto_feed_leads) && (
                          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200" title="Novos prospects entram sozinhos na fila">
                            Auto-feed
                          </span>
                        )}
                        <span className="text-[9px] text-gray-400">· {dt(c.created_at)}</span>
                      </div>
                    </div>
                    {/* Primary action (compact) */}
                    <div className="shrink-0">
                      {canStart && (
                        <button onClick={async () => {
                          const ok = await confirm({
                            title: 'Iniciar esta campanha?',
                            message: <span>A campanha <b>{c.name || 'sem título'}</b> começará a processar os leads configurados.</span>,
                            confirmLabel: 'Iniciar campanha',
                            cancelLabel: 'Revisar antes',
                            variant: 'info',
                          })
                          if (ok) void doAction(c.id, 'start')
                        }} disabled={actionLoading === c.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-900 text-white text-[10px] font-bold hover:bg-black transition-all shadow-sm disabled:opacity-60">
                          {actionLoading === c.id ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />} Iniciar
                        </button>
                      )}
                      {isRunning && (
                        <button onClick={() => doAction(c.id, 'pause')} disabled={actionLoading === c.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold hover:bg-amber-100 transition disabled:opacity-60">
                          {actionLoading === c.id ? <Loader2 size={10} className="animate-spin" /> : <Pause size={10} />} Pausar
                        </button>
                      )}
                      {isDone && (
                        <button onClick={async () => { setActionLoading(c.id); try { await adminApi.reexecuteCampaign(c.id); showToast('Campanha reaberta!'); loadCampaigns() } catch (e: any) { showToast(e.message, 'err') } setActionLoading(null) }}
                          disabled={actionLoading === c.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold hover:bg-blue-100 transition disabled:opacity-60">
                          {actionLoading === c.id ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />} Reabrir
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Compact stats: 3 KPIs inline — numbers animate via tabular-nums + transition */}
                  <div className="grid grid-cols-3 gap-1.5 mb-2">
                    <div className="bg-gray-50 rounded-lg px-2 py-1.5 text-center">
                      <p className="text-[12px] font-extrabold text-gray-900 leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>{num(c.target_count || 0)}</p>
                      <p className="text-[8px] text-gray-400 uppercase tracking-wide font-bold mt-0.5">Leads</p>
                    </div>
                    <div className={`rounded-lg px-2 py-1.5 text-center transition-colors duration-700 ${isRunning ? 'bg-gray-50' : 'bg-gray-50'}`}>
                      <p className="text-[12px] font-extrabold text-gray-900 leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>{num(c.sent_count || 0)}</p>
                      <p className="text-[8px] text-gray-400 uppercase tracking-wide font-bold mt-0.5">Enviados</p>
                    </div>
                    <div className={`rounded-lg px-2 py-1.5 text-center transition-colors duration-700 ${(c.replied_count || 0) > 0 ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                      <p className="text-[12px] font-extrabold text-emerald-600 leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>{num(c.replied_count || 0)}</p>
                      <p className="text-[8px] text-gray-400 uppercase tracking-wide font-bold mt-0.5">Resp.</p>
                    </div>
                  </div>

                  {/* Progress bar with percentage label — smooth animation */}
                  {c.target_count > 0 && (
                    <div className="mb-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] font-semibold text-gray-500" style={{ fontVariantNumeric: 'tabular-nums' }}>{pct}% concluido</span>
                        {isRunning && <span className="text-[8px] text-blue-500 font-bold animate-pulse">ao vivo</span>}
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-1000 ease-out ${isRunning ? 'bg-blue-600' : 'bg-gray-900'}`}
                          style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </div>
                  )}

                  {/* Secondary actions (compact, footer-aligned) */}
                  <div className="flex items-center gap-1 pt-2 mt-auto border-t border-gray-100">
                    <button onClick={() => openEdit(c)} title="Configurar"
                      className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-50 text-gray-900 text-[10px] font-bold hover:bg-gray-100 transition">
                      <Settings size={10} /> Config
                    </button>
                    <button onClick={async () => { setActionLoading(c.id); try { await adminApi.duplicateCampaign(c.id); showToast('Campanha duplicada!'); loadCampaigns() } catch (e: any) { showToast(e.message, 'err') } setActionLoading(null) }}
                      disabled={actionLoading === c.id} title="Duplicar"
                      className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-50 text-gray-600 text-[10px] font-semibold hover:bg-gray-100 transition">
                      Duplicar
                    </button>
                    {!isDone && (
                      <button onClick={() => doAction(c.id, 'cancel')} disabled={actionLoading === c.id} title="Cancelar"
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-red-400 text-[10px] font-semibold hover:bg-red-50 hover:text-red-600 transition">
                        <Ban size={10} />
                      </button>
                    )}
                    <button onClick={async () => {
                      const ok = await confirm({
                        title: 'Excluir campanha?',
                        message: <span>A campanha <b>{c.name || 'sem titulo'}</b> sera excluida permanentemente.</span>,
                        confirmLabel: 'Excluir',
                        cancelLabel: 'Cancelar',
                        variant: 'danger',
                      })
                      if (ok) doAction(c.id, 'delete')
                    }}
                      disabled={actionLoading === c.id} title="Excluir"
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-red-400 text-[10px] font-semibold hover:bg-red-50 hover:text-red-600 transition ml-auto">
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Campaign Editor Modal ── */}
      {modalOpen && (
        <CampaignEditorModal
          campaign={editCampaign}
          onClose={() => { setModalOpen(false); setEditCampaign(null) }}
          onSaved={() => { setModalOpen(false); setEditCampaign(null); loadCampaigns() }}
          showToast={showToast}
        />
      )}

      {/* ── Wizard de IA - 7 skills SSE montam campanha do zero ── */}
      <AICampaignWizardModal
        open={aiWizardOpen}
        onClose={() => setAiWizardOpen(false)}
        onCampaignCreated={(campaignId) => {
          /* Squad terminou - recarrega lista e abre o editor pra revisar a draft.
             Busca a campanha recem-criada no array recarregado. */
          loadCampaigns()
          /* Pequeno delay pra aguardar loadCampaigns popular o array */
          setTimeout(() => {
            adminApi.campaigns().then((d: any) => {
              const list = d.campaigns || d.items || (Array.isArray(d) ? d : [])
              const created = list.find((c: any) => String(c.id) === String(campaignId))
              if (created) {
                openEdit(created)
                showToast('Campanha em rascunho aberta para revisao')
              } else {
                showToast('Campanha criada - role a lista para encontrar')
              }
            }).catch(() => undefined)
          }, 400)
        }}
      />
    </div>
  )
}

/* ── Campaign Editor Modal (7 tabs — COMPLETE config) ── */
export function CampaignEditorModal({ campaign, onClose, onSaved, showToast }: {
  campaign: any; onClose: () => void; onSaved: () => void; showToast: (t: string, tp?: 'ok' | 'err') => void
}) {
  const isEdit = !!campaign?.id
  const [activeTab, setActiveTab] = useState('geral')
  const [saving, setSaving] = useState(false)
  const [instances, setInstances] = useState<any[]>([])
  /* Local mirror of campaign status — refreshed from server after each action.
   * NO optimistic update: avoids "ghost states" when backend rejects (e.g., instance offline). */
  const [liveStatus, setLiveStatus] = useState<string>(campaign?.status || 'draft')
  const campaignIsRunning = ['active', 'running', 'sending'].includes(liveStatus)
  const [statusActing, setStatusActing] = useState<string | null>(null)
  const [lastStatusError, setLastStatusError] = useState<string | null>(null)
  const { confirm } = useConfirm()
  useEffect(() => { setLiveStatus(campaign?.status || 'draft'); setLastStatusError(null) }, [campaign?.id, campaign?.status])

  const s = campaign?.settings || {}
  const core = s.campaignCore || {}
  const dest = s.destination || {}
  const sched = s.scheduler || {}
  const aw = s.actionWindow || {}
  const fa = s.finalActions || {}
  const trig = s.triggers || {}
  const comp = s.composer || {}
  const ab = s.antiBlock || {}
  const filter = campaign?.filter_json || {}
  const speed = campaign?.speed_json || {}

  // Tab 1: Geral
  const [name, setName] = useState(campaign?.name || '')
  const [mode, setMode] = useState(campaign?.campaign_mode || 'relationship')
  const [slug, setSlug] = useState(core.slug || '')
  const [instanceId, setInstanceId] = useState(campaign?.instance_id || '')
  const [instanceMode, setInstanceMode] = useState(core.instanceMode || 'specific')
  const [rotationMode, setRotationMode] = useState(core.rotationMode || campaign?.rotation_mode || 'balanced')

  // Tab 2: Mensagem & IA
  const [useAi, setUseAi] = useState(campaign?.use_ai !== false)
  const [aiPrompt, setAiPrompt] = useState(campaign?.ai_prompt || '')
  const [messageTemplate, setMessageTemplate] = useState(campaign?.message_template || '')
  const [intentText, setIntentText] = useState(comp.intentText || '')
  const [personalizedPerLead, setPersonalizedPerLead] = useState(comp.personalizedPerLead !== false)
  const [useAutoVariations, setUseAutoVariations] = useState(comp.useAutoVariations !== false)
  const [channels, setChannels] = useState<CampaignChannel[]>(() => {
    const saved = Array.isArray(core.channels) ? core.channels.filter((item: unknown): item is CampaignChannel =>
      ['whatsapp', 'instagram', 'email', 'push'].includes(String(item))) : []
    return saved.length ? [saved[0]] : ['whatsapp']
  })
  const [actionBlocks, setActionBlocks] = useState<CampaignActionBlock[]>(() => {
    const savedChannel = Array.isArray(core.channels)
      ? core.channels.find((item: unknown) => ['whatsapp', 'instagram', 'email', 'push'].includes(String(item)))
      : undefined
    const initialChannel = (savedChannel || 'whatsapp') as CampaignChannel
    if (Array.isArray(comp.actionBlocks) && comp.actionBlocks.length) {
      const compatibleBlocks = comp.actionBlocks.filter((block: any) => block?.channel === initialChannel)
      if (!compatibleBlocks.length) return [createCampaignActionBlock(initialChannel, 'block-1')]
      return compatibleBlocks.map((block: any, index: number) => {
        const actionType = String(block.actionType || defaultActionType(initialChannel))
        const config = block.config && typeof block.config === 'object' ? { ...block.config } as Record<string, string> : {}
        if (blockHasOptionBuilder(actionType)) {
          const meta = optionBuilderMeta(actionType)
          const lines = String(config.options || '').split(/\r?\n/)
          while (lines.length < meta.min) lines.push('')
          config.options = lines.slice(0, meta.max).join('\n')
          config._optionSlots = String(Math.max(lines.length, meta.min))
        }
        return {
          id: String(block.id || `block-${index + 1}`),
          channel: initialChannel,
          actionType,
          content: String(block.content || ''),
          useAi: blockSupportsAi(actionType) ? Boolean(block.useAi) : false,
          aiInstruction: blockSupportsAi(actionType) ? String(block.aiInstruction || '') : '',
          config,
        }
      })
    }
    return [{ ...createCampaignActionBlock(initialChannel, 'block-1'), content: campaign?.message_template || '', useAi: campaign?.use_ai !== false, aiInstruction: campaign?.ai_prompt || '' }]
  })
  const ne = s.nameEnrichment || {}
  const [nameEnrichmentEnabled, setNameEnrichmentEnabled] = useState(ne.enabled || false)
  const [replyStartFlowId, setReplyStartFlowId] = useState(
    String(s.replyStartFlowId || s.reply_start_flow_id || ''),
  )
  const [replyStartFlowOnlyInterested, setReplyStartFlowOnlyInterested] = useState(
    Boolean(s.replyStartFlowOnlyInterested),
  )
  const [flowOptions, setFlowOptions] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const headers: Record<string, string> = { Accept: 'application/json' }
        const t = localStorage.getItem('lead-system-token')
        if (t) headers.Authorization = `Bearer ${t}`
        const b = localStorage.getItem('lead-system:active-brand-id')
        if (b) headers['x-brand-id'] = b
        const r = await fetch('/api/flows', { headers })
        const d = await r.json()
        if (!cancelled) {
          setFlowOptions(
            (d.flows || []).map((f: any) => ({ id: String(f.id), name: String(f.name || 'Fluxo') })),
          )
        }
      } catch {
        if (!cancelled) setFlowOptions([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function selectCampaignChannel(channelKey: CampaignChannel) {
    if (channels[0] === channelKey) return
    setChannels([channelKey])
    setActionBlocks([createCampaignActionBlock(channelKey, `block-${Date.now()}-${channelKey}`)])
  }

  function addActionBlock() {
    const channelKey = channels[0] || 'whatsapp'
    setActionBlocks((blocks) => [...blocks, createCampaignActionBlock(channelKey, `block-${Date.now()}-${blocks.length + 1}`)])
  }

  function removeActionBlock(id: string) {
    setActionBlocks((blocks) => blocks.length === 1 ? blocks : blocks.filter((block) => block.id !== id))
  }

  function moveActionBlock(id: string, direction: -1 | 1) {
    setActionBlocks((blocks) => {
      const index = blocks.findIndex((block) => block.id === id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= blocks.length) return blocks
      const next = [...blocks]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function reorderActionBlock(fromId: string, toId: string) {
    if (fromId === toId) return
    setActionBlocks((blocks) => {
      const from = blocks.findIndex((b) => b.id === fromId)
      const to = blocks.findIndex((b) => b.id === toId)
      if (from < 0 || to < 0) return blocks
      const next = [...blocks]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  function updateActionBlock(id: string, patch: Partial<CampaignActionBlock>) {
    setActionBlocks((blocks) => blocks.map((block) => block.id === id ? { ...block, ...patch } : block))
  }

  function updateActionConfig(id: string, key: string, value: string) {
    setActionBlocks((blocks) => blocks.map((block) => block.id === id
      ? { ...block, config: { ...block.config, [key]: value } }
      : block))
  }

  function patchActionConfig(id: string, patch: Record<string, string>) {
    setActionBlocks((blocks) => blocks.map((block) => block.id === id
      ? { ...block, config: { ...block.config, ...patch } }
      : block))
  }

  function isVideoActionMedia(actionType: string, url = '') {
    if (actionType === 'video' || actionType === 'reel') return true
    return /\.(mp4|webm|mov|m4v|mkv)(\?|#|$)/i.test(String(url || ''))
  }

  async function uploadBlockMedia(blockId: string, file: File) {
    setBlockUploadingId(blockId)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { Authorization: getHeaders()['Authorization'] },
        body: fd,
      })
      const d = await r.json().catch(() => ({}))
      const url = String(d?.file?.url || d?.url || '').trim()
      if (url) {
        patchActionConfig(blockId, {
          mediaSource: 'upload',
          mediaUrl: url,
          mediaFileName: file.name || String(d?.file?.filename || d?.file?.name || ''),
        })
      }
    } catch {
      /* upload falhou — usuário tenta de novo */
    } finally {
      setBlockUploadingId(null)
    }
  }

  function changeBlockActionType(id: string, actionType: string) {
    setActionBlocks((blocks) => blocks.map((block) => {
      if (block.id !== id) return block
      const nextConfig: Record<string, string> = {}
      if (blockHasOptionBuilder(actionType)) {
        const meta = optionBuilderMeta(actionType)
        // Preserve existing options only when switching between option-builder types
        const keep = blockHasOptionBuilder(block.actionType)
          ? String(block.config?.options || '').split(/\r?\n/).slice(0, meta.max)
          : []
        while (keep.length < meta.min) keep.push('')
        nextConfig.options = keep.join('\n')
        nextConfig._optionSlots = String(Math.max(keep.length, meta.min))
      }
      return {
        ...block,
        actionType,
        config: nextConfig,
        useAi: blockSupportsAi(actionType) ? block.useAi : false,
        aiInstruction: blockSupportsAi(actionType) ? block.aiInstruction : '',
      }
    }))
  }

  type OptionItem = { label: string; productId?: string; productName?: string }

  /** Opções editáveis no UI (mantém campos vazios enquanto digita). */
  function getEditableOptions(block: CampaignActionBlock): string[] {
    return getEditableOptionItems(block).map((it) => it.label)
  }

  function getEditableOptionItems(block: CampaignActionBlock): OptionItem[] {
    const meta = optionBuilderMeta(block.actionType)
    const rawItems = Array.isArray((block.config as any)?.optionItems)
      ? ((block.config as any).optionItems as OptionItem[])
      : null
    if (rawItems && rawItems.length) {
      const list: OptionItem[] = rawItems.map((it: any) => ({
        label: String(it?.label || it?.title || ''),
        productId: it?.productId ? String(it.productId) : undefined,
        productName: it?.productName ? String(it.productName) : undefined,
      }))
      const targetLen = Math.min(meta.max, Math.max(meta.min, list.length, 1))
      while (list.length < targetLen) list.push({ label: '' })
      return list.slice(0, meta.max)
    }
    const raw = String(block.config?.options ?? '')
    const hasKey = block.config != null && Object.prototype.hasOwnProperty.call(block.config, 'options')
    const lines = hasKey || raw ? raw.split(/\r?\n/) : []
    const slotHint = Math.max(0, Number(block.config?._optionSlots || 0) || 0)
    const targetLen = Math.min(meta.max, Math.max(meta.min, lines.length, slotHint, 1))
    const list: OptionItem[] = lines.slice(0, meta.max).map((label) => ({ label }))
    while (list.length < targetLen) list.push({ label: '' })
    return list
  }

  function persistOptionItems(block: CampaignActionBlock, items: OptionItem[]) {
    const labels = items.map((it) => it.label)
    return {
      ...block.config,
      options: labels.join('\n'),
      optionItems: items,
      _optionSlots: String(items.length),
    }
  }

  function updateEditableOption(blockId: string, index: number, value: string) {
    setActionBlocks((blocks) => blocks.map((block) => {
      if (block.id !== blockId) return block
      const list = getEditableOptionItems(block)
      list[index] = { ...list[index], label: value }
      return {
        ...block,
        config: persistOptionItems(block, list),
      }
    }))
  }

  function updateOptionProduct(blockId: string, index: number, product: { id: string; name: string } | null) {
    setActionBlocks((blocks) => blocks.map((block) => {
      if (block.id !== blockId) return block
      const list = getEditableOptionItems(block)
      list[index] = product
        ? {
            ...list[index],
            productId: product.id,
            productName: product.name,
            label: list[index].label?.trim() ? list[index].label : product.name.slice(0, 24),
          }
        : { label: list[index].label, productId: undefined, productName: undefined }
      return {
        ...block,
        config: persistOptionItems(block, list),
      }
    }))
  }

  function addEditableOption(blockId: string) {
    setActionBlocks((blocks) => blocks.map((block) => {
      if (block.id !== blockId) return block
      const meta = optionBuilderMeta(block.actionType)
      const list = getEditableOptionItems(block)
      if (list.length >= meta.max) return block
      list.push({ label: '' })
      return {
        ...block,
        config: persistOptionItems(block, list),
      }
    }))
  }

  function removeEditableOption(blockId: string, index: number) {
    setActionBlocks((blocks) => blocks.map((block) => {
      if (block.id !== blockId) return block
      const meta = optionBuilderMeta(block.actionType)
      const list = getEditableOptionItems(block)
      if (list.length <= meta.min) {
        list[index] = { label: '' }
      } else {
        list.splice(index, 1)
      }
      return {
        ...block,
        config: persistOptionItems(block, list),
      }
    }))
  }

  /** Insere tag {{...}} no cursor do textarea do bloco (ou no fim). */
  function insertTemplateTag(blockId: string, token: string, textarea?: HTMLTextAreaElement | null) {
    setActionBlocks((blocks) => blocks.map((block) => {
      if (block.id !== blockId) return block
      const content = String(block.content || '')
      if (textarea && typeof textarea.selectionStart === 'number') {
        const start = textarea.selectionStart
        const end = textarea.selectionEnd ?? start
        const next = content.slice(0, start) + token + content.slice(end)
        requestAnimationFrame(() => {
          try {
            textarea.focus()
            const pos = start + token.length
            textarea.setSelectionRange(pos, pos)
          } catch { /* ignore */ }
        })
        return { ...block, content: next }
      }
      return { ...block, content: content + (content && !content.endsWith(' ') && !content.endsWith('\n') ? ' ' : '') + token }
    }))
  }

  const [dragBlockId, setDragBlockId] = useState<string | null>(null)
  const textAreaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})

  // Tab 2b: Media (imagem/video/audio/documento) + link
  const media = s.media || {}
  const [imageUrl, setImageUrl] = useState(media.imageFileName || '')
  const [imageCaption, setImageCaption] = useState(media.imageCaption || '')
  const [imageUseTextAsCaption, setImageUseTextAsCaption] = useState(media.imageUseTextAsCaption !== false)
  const [videoUrls, setVideoUrls] = useState<string[]>(() => {
    if (Array.isArray(media.videoFiles)) return media.videoFiles.filter(Boolean)
    if (media.videoFileName) return [media.videoFileName]
    return []
  })
  const [videoCaption, setVideoCaption] = useState(media.videoCaption || '')
  const [videoUseTextAsCaption, setVideoUseTextAsCaption] = useState(Boolean(media.videoUseTextAsCaption))
  const [audioUrl, setAudioUrl] = useState(media.audioFileName || '')
  const [audioVoiceNote, setAudioVoiceNote] = useState(media.audioVoiceNote !== false)
  const [documentUrl, setDocumentUrl] = useState(media.documentFileName || '')
  const [documentName, setDocumentName] = useState(media.documentName || '')
  const [linkUrl, setLinkUrl] = useState(media.linkUrl || '')
  const [attachedProduct, setAttachedProduct] = useState<any>(media.product || null)
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [pickerProducts, setPickerProducts] = useState<any[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const prodImg = (p: any) => {
    const url = p?.imageUrl || p?.image || ''
    if (!url) return ''
    if (/^https?:\/\//i.test(url)) return url
    return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`
  }
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [uploadingAudio, setUploadingAudio] = useState(false)
  const [uploadingDocument, setUploadingDocument] = useState(false)
  const [galleryPicker, setGalleryPicker] = useState<{ mode: 'image' | 'video'; blockId?: string } | null>(null)
  const [blockUploadingId, setBlockUploadingId] = useState<string | null>(null)

  async function uploadMedia(file: File, type: 'image' | 'video' | 'audio' | 'document') {
    const setterMap: Record<string, (v: string) => void> = { image: setImageUrl, audio: setAudioUrl, document: setDocumentUrl }
    const loadingMap = { image: setUploadingImage, video: setUploadingVideo, audio: setUploadingAudio, document: setUploadingDocument }
    const loadingSetter = loadingMap[type]
    loadingSetter(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { 'Authorization': getHeaders()['Authorization'] },
        body: fd,
      })
      const d = await r.json()
      if (d.file?.url) {
        if (type === 'video') {
          setVideoUrls(prev => prev.length < 5 ? [...prev, d.file.url] : prev)
        } else {
          setterMap[type]?.(d.file.url)
        }
        if (type === 'document' && !documentName) setDocumentName(file.name)
      }
    } catch {}
    loadingSetter(false)
  }

  async function uploadMultipleVideos(files: FileList) {
    const remaining = 5 - videoUrls.length
    const toUpload = Array.from(files).slice(0, remaining)
    if (!toUpload.length) return
    setUploadingVideo(true)
    for (const file of toUpload) {
      try {
        const fd = new FormData()
        fd.append('file', file)
        const r = await fetch('/api/media/upload', {
          method: 'POST',
          headers: { 'Authorization': getHeaders()['Authorization'] },
          body: fd,
        })
        const d = await r.json()
        if (d.file?.url) setVideoUrls(prev => prev.length < 5 ? [...prev, d.file.url] : prev)
      } catch {}
    }
    setUploadingVideo(false)
  }

  // Tab 3: Segmentacao
  const [filterStatuses, setFilterStatuses] = useState<string[]>(filter.statuses || ['new'])
  const [filterHasWhatsapp, setFilterHasWhatsapp] = useState(filter.hasWhatsapp === true)
  const [filterTagsInclude, setFilterTagsInclude] = useState((filter.tagsInclude || []).join(', '))
  const [filterTagsExclude, setFilterTagsExclude] = useState((filter.tagsExclude || []).join(', '))
  const [filterCategories, setFilterCategories] = useState<string[]>(filter.segments || filter.categories || [])
  const [filterCities, setFilterCities] = useState<string[]>(filter.cities || [])
  const [filterSources, setFilterSources] = useState<string[]>(filter.sources || [])
  /** Auto-alimentar: novos prospects que casam o filtro entram sozinhos na fila */
  const [autoFeedLeads, setAutoFeedLeads] = useState(
    Boolean(s.autoFeedLeads ?? s.auto_feed_leads),
  )
  const [filterMinRating, setFilterMinRating] = useState<number | undefined>(filter.scoreMin)
  const [filterOptions, setFilterOptions] = useState<any>(null)
  const [previewCount, setPreviewCount] = useState<number | null>(null)

  // Tab 4: Velocidade & Anti-block
  const [maxPerMinute, setMaxPerMinute] = useState(String(speed.maxPerMinute || 3))
  const [minInterval, setMinInterval] = useState(String(speed.minIntervalSeconds || 10))
  const [maxInterval, setMaxInterval] = useState(String(speed.maxIntervalSeconds || 30))
  const [dailyLimit, setDailyLimit] = useState(String(speed.dailyLimit || 200))
  const [autoPauseRate, setAutoPauseRate] = useState(String(speed.autoPauseOnBlockRate || 15))
  const [autoPauseBlocks, setAutoPauseBlocks] = useState(String(ab.autoPauseByBlocks || 5))
  const [autoPauseErrorRate, setAutoPauseErrorRate] = useState(String(ab.autoPauseByErrorRate || 20))
  const [autoPauseOffline, setAutoPauseOffline] = useState(ab.autoPauseOnOffline !== false)
  const [avoidNight, setAvoidNight] = useState(ab.avoidNight !== false)
  const [avoidSunday, setAvoidSunday] = useState(ab.avoidSunday !== false)

  // Tab 5: Agenda
  const [scheduleMode, setScheduleMode] = useState(sched.scheduleMode || 'immediate')
  const [timeZone, setTimeZone] = useState(sched.timeZone || 'America/Sao_Paulo')
  const [smartWindowStart, setSmartWindowStart] = useState(sched.smartWindowStart || aw.start || '08:00')
  const [smartWindowEnd, setSmartWindowEnd] = useState(sched.smartWindowEnd || aw.end || '18:00')
  const [windowEnabled, setWindowEnabled] = useState(aw.enabled || false)

  // Tab 6: Acoes Finais & Triggers
  const [nextStatus, setNextStatus] = useState(fa.nextStatus || '')
  const [addTags, setAddTags] = useState((fa.addTags || []).join(', '))
  const [trigOnNewLead, setTrigOnNewLead] = useState(trig.onNewLead || false)
  const [trigOnStatusChange, setTrigOnStatusChange] = useState(trig.onStatusChange || false)
  const [trigOnTagMatch, setTrigOnTagMatch] = useState(trig.onTagMatch || false)
  const [trigOnOrderCreated, setTrigOnOrderCreated] = useState(trig.onOrderCreated || false)

  // Load instances
  useEffect(() => {
    fetch('/api/instances', { headers: getHeaders() }).then(r => r.json()).then(d => setInstances(d.instances || [])).catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/customers/filter-options', { headers: getHeaders() })
      .then(r => r.json()).then(d => setFilterOptions(d)).catch(() => {})
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      const f: any = { statuses: filterStatuses }
      if (filterCategories.length) f.segments = filterCategories
      if (filterCities.length) f.cities = filterCities
      if (filterSources.length) f.sources = filterSources
      if (filterMinRating) f.scoreMin = filterMinRating
      if (filterHasWhatsapp) f.hasWhatsapp = true
      if (filterTagsInclude.trim()) f.tagsInclude = filterTagsInclude.split(',').map((t: string) => t.trim()).filter(Boolean)
      if (filterTagsExclude.trim()) f.tagsExclude = filterTagsExclude.split(',').map((t: string) => t.trim()).filter(Boolean)

      fetch('/api/campaigns-v2/preview', {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ filter: f })
      }).then(r => r.json()).then(d => setPreviewCount(d.count ?? d.total ?? null)).catch(() => {})
    }, 500)
    return () => clearTimeout(t)
  }, [filterStatuses, filterCategories, filterCities, filterSources, filterMinRating, filterHasWhatsapp, filterTagsInclude, filterTagsExclude])

  const splitTags = (v: string) => v.split(',').map((t: string) => t.trim()).filter(Boolean)

  async function save() {
    const trimmedName = name.trim()
    if (!trimmedName) return showToast('Nome obrigatorio', 'err')

    const rotationOn = instanceMode === 'smart-rotation'
    const connectedPool = instances
      .filter((inst: any) => inst.status === 'connected')
      .map((inst: any) => String(inst.id))
    const resolvedInstanceId = String(instanceId || '').trim() || connectedPool[0] || ''

    if (!rotationOn && !resolvedInstanceId) {
      return showToast('Selecione uma instancia WhatsApp na aba Distribuicao', 'err')
    }
    if (rotationOn && connectedPool.length === 0 && !resolvedInstanceId) {
      return showToast('Nenhuma instancia conectada para rotacao inteligente', 'err')
    }

    // Texto principal = primeiro bloco de texto puro; fallback para bloco com content
    const primaryTextBlock =
      actionBlocks.find((block) => blockSupportsAi(block.actionType)) ||
      actionBlocks.find((block) =>
        ['text', 'direct', 'buttons', 'list', 'poll', 'button', 'deeplink'].includes(block.actionType)
      ) ||
      actionBlocks.find((block) => String(block.content || '').trim())

    const cleanedBlocks = actionBlocks.map((block) => {
      const cleanConfig = { ...(block.config || {}) }
      delete cleanConfig._optionSlots
      if (blockHasOptionBuilder(block.actionType)) {
        cleanConfig.options = serializeOptionsConfig(
          String(cleanConfig.options || '').split(/\r?\n/)
        )
      }
      return {
        ...block,
        useAi: blockSupportsAi(block.actionType) ? Boolean(block.useAi) : false,
        aiInstruction: blockSupportsAi(block.actionType) ? String(block.aiInstruction || '') : '',
        config: cleanConfig,
      }
    })

    const resolvedMessageTemplate = String(
      (primaryTextBlock && blockSupportsAi(primaryTextBlock.actionType)
        ? primaryTextBlock.content
        : primaryTextBlock?.content) || messageTemplate || ''
    ).trim() || null

    const resolvedUseAi = primaryTextBlock && blockSupportsAi(primaryTextBlock.actionType)
      ? Boolean(primaryTextBlock.useAi)
      : Boolean(useAi)

    const resolvedAiPrompt = primaryTextBlock && blockSupportsAi(primaryTextBlock.actionType)
      ? (String(primaryTextBlock.aiInstruction || '').trim() || aiPrompt || null)
      : (aiPrompt || null)

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name: trimmedName,
        campaignMode: mode || 'relationship',
        instanceId: resolvedInstanceId || undefined,
        useAI: resolvedUseAi,
        aiPrompt: resolvedAiPrompt,
        messageTemplate: resolvedMessageTemplate,
        useInstanceRotation: rotationOn,
        rotationMode,
        filter: {
          statuses: filterStatuses.length ? filterStatuses : ['new'],
          // Só envia hasWhatsapp quando true — false no JSON quebrava contagem
          ...(filterHasWhatsapp ? { hasWhatsapp: true } : {}),
          ...(filterCategories.length ? { segments: filterCategories } : {}),
          ...(filterCities.length ? { cities: filterCities } : {}),
          ...(filterSources.length ? { sources: filterSources } : {}),
          ...(filterMinRating ? { scoreMin: filterMinRating } : {}),
          ...(filterTagsInclude.trim() ? { tagsInclude: splitTags(filterTagsInclude) } : {}),
          ...(filterTagsExclude.trim() ? { tagsExclude: splitTags(filterTagsExclude) } : {}),
        },
        speedControl: {
          maxPerMinute: parseInt(maxPerMinute) || 3,
          minIntervalSeconds: parseInt(minInterval) || 10,
          maxIntervalSeconds: parseInt(maxInterval) || 30,
          dailyLimit: parseInt(dailyLimit) || 200,
          autoPauseOnBlockRate: parseInt(autoPauseRate) || 15,
        },
        settings: {
          // Nao espalhar `s` inteiro cegamente por cima — campos do editor têm prioridade total
          campaignMode: mode || 'relationship',
          autoFeedLeads: Boolean(autoFeedLeads),
          campaignCore: {
            slug: slug.trim() || undefined,
            instanceMode,
            poolInstanceIds: rotationOn ? connectedPool : (resolvedInstanceId ? [resolvedInstanceId] : []),
            rotationMode,
            channels: channels.length ? channels : ['whatsapp'],
            uiMode: mode || 'relationship',
          },
          scheduler: { scheduleMode, timeZone, smartWindowStart, smartWindowEnd },
          actionWindow: { enabled: windowEnabled, start: smartWindowStart, end: smartWindowEnd },
          finalActions: { nextStatus: nextStatus || undefined, addTags: addTags.trim() ? splitTags(addTags) : [] },
          triggers: { onNewLead: trigOnNewLead, onStatusChange: trigOnStatusChange, onTagMatch: trigOnTagMatch, onOrderCreated: trigOnOrderCreated },
          composer: {
            intentText,
            personalizedPerLead,
            useAutoVariations,
            actionBlocks: cleanedBlocks,
          },
          replyStartFlowId: replyStartFlowId.trim() || undefined,
          replyStartFlowOnlyInterested: Boolean(replyStartFlowOnlyInterested),
          nameEnrichment: { enabled: nameEnrichmentEnabled },
          antiBlock: {
            autoPauseByBlocks: parseInt(autoPauseBlocks) || 5,
            autoPauseByErrorRate: parseInt(autoPauseErrorRate) || 20,
            autoPauseOnOffline: autoPauseOffline,
            avoidNight,
            avoidSunday,
          },
          media: {
            imageFileName: imageUrl || null,
            imageCaption: imageCaption || null,
            imageUseTextAsCaption,
            videoFiles: videoUrls.filter(Boolean),
            videoFileName: videoUrls[0] || null,
            videoCaption: videoCaption || null,
            videoUseTextAsCaption,
            audioFileName: audioUrl || null,
            audioVoiceNote,
            documentFileName: documentUrl || null,
            documentName: documentName || null,
            linkUrl: linkUrl.trim() || null,
            product: attachedProduct
              ? {
                  id: attachedProduct.id,
                  name: attachedProduct.name,
                  price: attachedProduct.price,
                  imageUrl: prodImg(attachedProduct),
                  description: attachedProduct.description || '',
                }
              : null,
          },
        },
      }

      const result = isEdit
        ? await adminApi.updateCampaign(campaign.id, body)
        : await adminApi.createCampaign(body)

      const saved = result?.campaign
      // Atualiza contagem de segmentação a partir do target_count salvo
      if (saved && typeof saved.target_count === 'number') {
        setPreviewCount(Number(saved.target_count))
      } else {
        // fallback: re-preview
        try {
          const f: any = { statuses: filterStatuses.length ? filterStatuses : ['new'] }
          if (filterCategories.length) f.segments = filterCategories
          if (filterCities.length) f.cities = filterCities
          if (filterSources.length) f.sources = filterSources
          if (filterMinRating) f.scoreMin = filterMinRating
          if (filterHasWhatsapp) f.hasWhatsapp = true
          if (filterTagsInclude.trim()) f.tagsInclude = splitTags(filterTagsInclude)
          if (filterTagsExclude.trim()) f.tagsExclude = splitTags(filterTagsExclude)
          const pr = await fetch('/api/campaigns-v2/preview', {
            method: 'POST', headers: getHeaders(), body: JSON.stringify({ filter: f }),
          })
          const pd = await pr.json()
          if (pr.ok) setPreviewCount(pd.count ?? pd.total ?? null)
        } catch { /* ignore */ }
      }
      if (saved?.name && String(saved.name).trim() !== trimmedName) {
        showToast(`Salvo, mas o nome retornou diferente: "${saved.name}"`, 'err')
      } else {
        const n = saved?.target_count != null ? Number(saved.target_count) : previewCount
        showToast(
          isEdit
            ? `Campanha atualizada${n != null ? ` · ${n} leads na segmentação` : ''}${autoFeedLeads ? ' · auto-alimentar ON' : ''}`
            : `Campanha criada${n != null ? ` · ${n} leads` : ''}`
        )
      }
      onSaved()
    } catch (e: any) {
      const msg = e?.message || e?.error || 'Falha ao salvar campanha'
      showToast(msg, 'err')
    }
    setSaving(false)
  }

  const tabs = [
    { key: 'geral', label: 'Geral' },
    { key: 'mensagem', label: 'Mensagem & IA' },
    { key: 'segmentacao', label: 'Segmentacao' },
    { key: 'velocidade', label: 'Distribuição' },
    { key: 'agenda', label: 'Agenda' },
    { key: 'acoes', label: 'Acoes' },
    { key: 'metricas', label: 'Metricas' },
  ]

  const inputCls = fieldControlClass
  const labelCls = fieldLabelLegacyClass
  const selectedChannelMeta = CAMPAIGN_CHANNELS.find((item) => item.key === channels[0]) || CAMPAIGN_CHANNELS[0]
  const SelectedChannelIcon = selectedChannelMeta.Icon

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button type="button" onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition shrink-0 ${value ? 'bg-gray-900' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
    </button>
  )

  const LEAD_STATUSES = ['new', 'contacted', 'replied', 'negotiating', 'converted', 'lost', 'inactive']

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white rounded-none sm:rounded-2xl shadow-2xl w-full max-w-2xl h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-base text-gray-900">{isEdit ? 'Configurar Campanha' : 'Nova Campanha'}</h3>
            <div className="mt-1 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500">
                <SelectedChannelIcon size={11} className="text-brand" />
                {selectedChannelMeta.label}
              </span>
              {isEdit && name && <><span className="h-2.5 w-px bg-gray-200" /><span className="max-w-[240px] truncate text-[10px] text-gray-400">{name}</span></>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition"><X size={18} className="text-gray-400" /></button>
        </div>

        {/* ── Status bar (Bug-11) — controles de status sempre visíveis,
             entre header e tabs. Só aparece em edição (não em "Nova Campanha"). */}
        {isEdit && (() => {
          const statusCfg: Record<string, { label: string; bg: string; text: string; dot: string }> = {
            draft:     { label: 'Rascunho',  bg: 'bg-gray-100',     text: 'text-gray-700',    dot: 'bg-gray-400' },
            scheduled: { label: 'Agendada',  bg: 'bg-gray-50',    text: 'text-gray-900',  dot: 'bg-gray-900' },
            active:    { label: 'Ativa',     bg: 'bg-emerald-50',   text: 'text-emerald-700', dot: 'bg-emerald-500 animate-pulse' },
            running:   { label: 'Enviando',  bg: 'bg-blue-50',      text: 'text-blue-700',    dot: 'bg-blue-500 animate-pulse' },
            sending:   { label: 'Enviando',  bg: 'bg-blue-50',      text: 'text-blue-700',    dot: 'bg-blue-500 animate-pulse' },
            paused:    { label: 'Pausada',   bg: 'bg-amber-50',     text: 'text-amber-700',   dot: 'bg-amber-500' },
            completed: { label: 'Concluída', bg: 'bg-emerald-50',   text: 'text-emerald-700', dot: 'bg-emerald-500' },
            finished:  { label: 'Finalizada', bg: 'bg-gray-100',    text: 'text-gray-500',    dot: 'bg-gray-400' },
            cancelled: { label: 'Cancelada', bg: 'bg-red-50',       text: 'text-red-700',     dot: 'bg-red-500' },
          }
          const cfg = statusCfg[liveStatus.toLowerCase()] || statusCfg.draft
          const isRunning = ['active', 'running', 'sending'].includes(liveStatus)
          const canStart = ['draft', 'paused', 'scheduled'].includes(liveStatus)
          const canPause = isRunning
          const isDone = ['completed', 'cancelled', 'finished'].includes(liveStatus)
          const canCancel = !isDone

          /* Single executor — keeps modal open and refreshes the live status optimistically.
           * Errors revert and toast. The parent (CampaignsView) is informed via onSaved on
           * close so the list refreshes. */
          async function runStatusAction(action: 'start' | 'pause' | 'cancel' | 'reopen') {
            setStatusActing(action)
            setLastStatusError(null)
            try {
              if (action === 'start') await adminApi.startCampaign(campaign.id)
              else if (action === 'pause') await adminApi.pauseCampaign(campaign.id)
              else if (action === 'cancel') await adminApi.cancelCampaign(campaign.id)
              else if (action === 'reopen') await adminApi.reexecuteCampaign(campaign.id)
              showToast(
                action === 'start' ? 'Campanha iniciada!'
                : action === 'pause' ? 'Campanha pausada.'
                : action === 'cancel' ? 'Campanha cancelada.'
                : 'Campanha reaberta!'
              )
              /* Always refresh status from server — single source of truth.
               * No optimism: avoids stale UI when backend takes a different path
               * (e.g., start succeeds but queue was empty → completed immediately). */
              try {
                const fresh = await adminApi.campaigns()
                const arr = fresh?.campaigns || fresh?.items || (Array.isArray(fresh) ? fresh : [])
                const updated = arr.find((c: any) => c.id === campaign.id)
                if (updated?.status) setLiveStatus(updated.status)
              } catch { /* fall through — keep current */ }
            } catch (e: any) {
              const msg = e?.message || `Falha ao ${action === 'start' ? 'iniciar' : action === 'pause' ? 'pausar' : action === 'cancel' ? 'cancelar' : 'reabrir'} campanha`
              setLastStatusError(msg)
              showToast(msg, 'err')
            } finally {
              setStatusActing(null)
            }
          }

          async function confirmAndCancel() {
            const ok = await confirm({
              title: 'Cancelar campanha?',
              message: <span>A campanha <b>{campaign.name || 'sem título'}</b> será marcada como cancelada. Você pode reabrir depois.</span>,
              confirmLabel: 'Cancelar campanha',
              cancelLabel: 'Voltar',
              variant: 'danger',
            })
            if (ok) runStatusAction('cancel')
          }

          async function confirmAndStart() {
            const ok = await confirm({
              title: liveStatus === 'paused' ? 'Retomar esta campanha?' : 'Iniciar esta campanha?',
              message: <span>A campanha <b>{campaign.name || 'sem título'}</b> começará a processar os leads configurados.</span>,
              confirmLabel: liveStatus === 'paused' ? 'Retomar campanha' : 'Iniciar campanha',
              cancelLabel: 'Revisar antes',
              variant: 'info',
            })
            if (ok) void runStatusAction('start')
          }

          /* Progress for visual context — total sent vs target */
          const totalTarget = Number(campaign.target_count || 0)
          const totalSent = Number(campaign.sent_count || 0)
          const pct = totalTarget > 0 ? Math.min(100, Math.round((totalSent / totalTarget) * 100)) : 0

          return (
            <div className={`px-4 sm:px-5 py-3 border-b border-gray-100 ${cfg.bg} shrink-0`}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {/* Left: status badge + progress */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white ${cfg.text} text-[11px] font-bold tracking-tight shadow-sm`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </div>
                  {totalTarget > 0 && (
                    <div className="text-[11px] text-gray-600">
                      <span className="font-bold">{totalSent.toLocaleString('pt-BR')}</span>
                      <span className="text-gray-400">/{totalTarget.toLocaleString('pt-BR')}</span>
                      <span className="text-gray-400 ml-1">({pct}%)</span>
                    </div>
                  )}
                </div>

                {/* Right: contextual action buttons */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {canStart && (
                    <button onClick={confirmAndStart} disabled={!!statusActing}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-[11px] font-bold hover:bg-black transition shadow-sm disabled:opacity-60">
                      {statusActing === 'start' ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                      {liveStatus === 'paused' ? 'Retomar' : 'Iniciar campanha'}
                    </button>
                  )}
                  {canPause && (
                    <button onClick={() => runStatusAction('pause')} disabled={!!statusActing}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-amber-700 text-[11px] font-bold hover:bg-amber-50 transition disabled:opacity-60">
                      {statusActing === 'pause' ? <Loader2 size={12} className="animate-spin" /> : <Pause size={12} />}
                      Pausar
                    </button>
                  )}
                  {isDone && (
                    <button onClick={() => runStatusAction('reopen')} disabled={!!statusActing}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-blue-200 text-blue-700 text-[11px] font-bold hover:bg-blue-50 transition disabled:opacity-60">
                      {statusActing === 'reopen' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      Reabrir
                    </button>
                  )}
                  {canCancel && (
                    <button onClick={confirmAndCancel} disabled={!!statusActing}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-600 text-[11px] font-bold hover:bg-red-50 transition disabled:opacity-60">
                      {statusActing === 'cancel' ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
              {/* Persistent error banner — survives until next successful action.
                  Mostly hits when instance is offline, queue is empty, etc. */}
              {lastStatusError && (
                <div className="mt-2 flex items-start gap-2 p-2 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-700">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" strokeWidth={2.5} />
                  <div className="flex-1 leading-snug">
                    <p className="font-semibold mb-0.5">Não foi possível executar a ação:</p>
                    <p>{lastStatusError}</p>
                  </div>
                  <button onClick={() => setLastStatusError(null)} aria-label="Fechar"
                    className="text-red-500 hover:text-red-800 shrink-0">
                    <X size={12} strokeWidth={2.5} />
                  </button>
                </div>
              )}

              {/* Helpful one-liner about what each transition means */}
              {!lastStatusError && (
                <p className="text-[10px] text-gray-500 mt-2 leading-snug">
                  {liveStatus === 'draft' && 'Rascunho — configure abaixo e clique Iniciar campanha quando estiver pronto.'}
                  {liveStatus === 'paused' && 'Campanha pausada — envios suspensos. Retome para continuar de onde parou.'}
                  {liveStatus === 'scheduled' && 'Campanha agendada — começará automaticamente na data marcada.'}
                  {isRunning && 'Campanha ativa — disparando mensagens em fila. Você pode pausar a qualquer momento.'}
                  {liveStatus === 'completed' && 'Campanha concluída — todos os leads foram processados.'}
                  {liveStatus === 'cancelled' && 'Campanha cancelada — clique Reabrir para colocar como rascunho novamente.'}
                  {liveStatus === 'finished' && 'Campanha finalizada — clique Reabrir para reexecutar.'}
                </p>
              )}
            </div>
          )
        })()}

        {/* Tabs */}
        <div className="px-4 sm:px-5 pt-3 border-b border-gray-100 flex gap-1 shrink-0 overflow-x-auto scrollbar-hide">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-3.5 py-2 rounded-t-lg text-xs font-semibold transition whitespace-nowrap ${
                activeTab === t.key ? 'bg-gray-100 text-gray-900 border-b-2 border-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}>{t.label}</button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4 min-w-0">

          {/* Tab: Geral */}
          {activeTab === 'geral' && (<>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Nome da campanha *</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Boas Vindas" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Slug / Codigo</label>
                <input type="text" value={slug} onChange={e => setSlug(e.target.value)} placeholder="Ex: boas_vindas" className={inputCls + ' font-mono text-xs'} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Modo</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[['relationship', 'Relacionamento', 'Conversa 1-a-1'], ['broadcast', 'Broadcast', 'Mensagem em massa'], ['drip', 'Sequencia', 'Etapas programadas']].map(([k, l, d]) => (
                  <button key={k} type="button" onClick={() => setMode(k)}
                    className={`p-3 rounded-xl border text-left transition ${mode === k ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <p className={`text-xs font-bold ${mode === k ? 'text-gray-900' : 'text-gray-700'}`}>{l}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{d}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-end justify-between gap-3 mb-2">
                <div>
                  <label className={labelCls}>Destinos da campanha</label>
                  <p className="text-[10px] text-gray-500">Escolha um único canal para esta campanha.</p>
                </div>
                <span className="text-[10px] font-bold text-gray-500">1 destino</span>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {CAMPAIGN_CHANNELS.map(({ key, label, description, Icon }) => {
                  const selected = channels.includes(key)
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => selectCampaignChannel(key)}
                      aria-pressed={selected}
                      className={`min-h-20 p-3 rounded-2xl border text-left transition ${selected
                        ? 'border-brand bg-brand-light text-brand shadow-sm'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className={`w-8 h-8 rounded-xl grid place-items-center ${selected ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500'}`}><Icon size={15} /></span>
                        <span className={`w-4 h-4 rounded-full border grid place-items-center text-[9px] font-black ${selected ? 'border-brand bg-brand text-white' : 'border-gray-300'}`}>{selected ? '✓' : ''}</span>
                      </span>
                      <strong className="block mt-2 text-xs">{label}</strong>
                      <span className="block mt-0.5 text-[9px] opacity-70">{description}</span>
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-[10px] text-gray-500">O compositor será adaptado às ferramentas permitidas pelo destino selecionado.</p>
            </div>
          </>)}

          {/* Tab: Mensagem & IA — Full composer */}
          {activeTab === 'mensagem' && (<>

            {/* Construtor de blocos do canal selecionado. */}
            <div className="space-y-3">
              <div className="rounded-2xl border border-violet-100 bg-violet-50/50 px-3 py-2.5 space-y-1">
                <p className="text-[11px] font-bold text-violet-900 flex items-center gap-1.5">
                  <GripVertical size={13} className="text-violet-500" /> Fluxo de entrega
                </p>
                <p className="text-[10px] text-violet-800/80 leading-relaxed">
                  A <strong>ordem dos blocos</strong> define a sequência de disparo (1 → 2 → 3…). Arraste ou use as setas.
                  Use as <strong>tags</strong> no texto para adaptar a mensagem ao <strong>afiliado</strong> (nome, cidade, nicho…) sem criar uma campanha por pessoa.
                </p>
              </div>

              <div className="space-y-2">
                {actionBlocks.map((block, blockIndex) => {
                  const channelMeta = CAMPAIGN_CHANNELS.find((item) => item.key === block.channel) || CAMPAIGN_CHANNELS[0]
                  const BlockIcon = ACTION_TYPE_ICONS[block.actionType] || FileText
                  const supportsAi = blockSupportsAi(block.actionType)
                  const hasOptionBuilder = blockHasOptionBuilder(block.actionType)
                  const isMediaBlock = ['image', 'video', 'post', 'story', 'reel'].includes(block.actionType)
                  const showBodyText = block.actionType !== 'divider' && !isMediaBlock
                  const optionMeta = hasOptionBuilder ? optionBuilderMeta(block.actionType) : null
                  const editableOptions = hasOptionBuilder ? getEditableOptions(block) : []
                  const optionsFilled = hasOptionBuilder
                    ? parseOptionsConfig(block.config?.options).length
                    : 0
                  const blockReady = isMediaBlock
                    || block.actionType === 'divider'
                    || (hasOptionBuilder ? optionsFilled >= (optionMeta?.min || 1) : Boolean(block.content.trim()))
                  return (
                    <details
                      key={block.id}
                      className={`group rounded-2xl border bg-gray-50/70 transition ${dragBlockId === block.id ? 'border-brand ring-2 ring-brand/20 opacity-90' : 'border-gray-200'}`}
                      draggable
                      onDragStart={(e) => {
                        setDragBlockId(block.id)
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', block.id)
                      }}
                      onDragEnd={() => setDragBlockId(null)}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                      onDrop={(e) => {
                        e.preventDefault()
                        const fromId = e.dataTransfer.getData('text/plain') || dragBlockId
                        if (fromId) reorderActionBlock(fromId, block.id)
                        setDragBlockId(null)
                      }}
                    >
                      <summary className="min-h-14 px-3 py-2.5 flex items-center gap-2 cursor-pointer list-none select-none">
                        <span
                          className="w-7 h-9 rounded-lg grid place-items-center shrink-0 text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-grab active:cursor-grabbing"
                          title="Arrastar para reordenar"
                          onClick={(e) => e.preventDefault()}
                        >
                          <GripVertical size={15} />
                        </span>
                        <span className="w-7 h-7 rounded-lg bg-gray-900 text-white grid place-items-center shrink-0 text-[10px] font-black tabular-nums" title={`Ordem de envio: ${blockIndex + 1}`}>
                          {blockIndex + 1}
                        </span>
                        <span className="w-9 h-9 rounded-xl bg-brand text-white grid place-items-center shrink-0"><BlockIcon size={16} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[10px] font-bold text-gray-400">Bloco {blockIndex + 1} · {channelMeta.label} · envio #{blockIndex + 1}</span>
                          <strong className="block mt-0.5 text-xs text-gray-900 truncate">{CHANNEL_ACTION_TYPES[block.channel].find((item) => item.value === block.actionType)?.label || 'Configurar ação'}</strong>
                        </span>
                        <span className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.preventDefault()}>
                          <button
                            type="button"
                            disabled={blockIndex === 0}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveActionBlock(block.id, -1) }}
                            className="min-h-8 min-w-8 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-25 grid place-items-center"
                            title="Subir na ordem de envio"
                            aria-label="Subir bloco"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={blockIndex === actionBlocks.length - 1}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveActionBlock(block.id, 1) }}
                            className="min-h-8 min-w-8 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-25 grid place-items-center"
                            title="Descer na ordem de envio"
                            aria-label="Descer bloco"
                          >
                            <ArrowDown size={14} />
                          </button>
                        </span>
                        <span className={`text-[9px] font-bold rounded-full px-2 py-1 shrink-0 ${blockReady ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          {blockReady ? 'Pronto' : 'Incompleto'}
                        </span>
                        <ChevronRight size={15} className="text-gray-400 transition-transform group-open:rotate-90 shrink-0" />
                      </summary>

                      <div className="border-t border-gray-200 p-3 space-y-3">
                        <div>
                          <p className="mb-1.5 text-[10px] font-bold text-gray-500">Tipo de bloco</p>
                          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                            {CHANNEL_ACTION_TYPES[block.channel].map((item) => {
                              const TypeIcon = ACTION_TYPE_ICONS[item.value] || FileText
                              const selected = block.actionType === item.value
                              return (
                                <button
                                  key={item.value}
                                  type="button"
                                  onClick={() => changeBlockActionType(block.id, item.value)}
                                  aria-pressed={selected}
                                  className={`min-h-14 rounded-xl border px-1.5 py-2 flex flex-col items-center justify-center gap-1 text-[9px] font-bold transition ${selected ? 'border-brand bg-brand-light text-brand' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}
                                >
                                  <TypeIcon size={15} aria-hidden />
                                  <span className="max-w-full truncate">{item.label}</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {['image', 'video', 'post', 'story', 'reel'].includes(block.actionType) && (
                          <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2.5">
                            <div>
                              <p className="text-[11px] font-bold text-gray-800">Fonte da mídia</p>
                              <p className="text-[9px] text-gray-500">Escolha de onde este bloco receberá o arquivo.</p>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              {([
                                { value: 'gallery', label: 'Galeria', Icon: Images },
                                { value: 'upload', label: 'Enviar arquivo', Icon: Upload },
                                { value: 'url', label: 'Link externo', Icon: ExternalLink },
                              ] as const).map(({ value, label, Icon }) => {
                                const selected = (block.config.mediaSource || 'gallery') === value
                                return (
                                  <button
                                    key={value}
                                    type="button"
                                    onClick={() => updateActionConfig(block.id, 'mediaSource', value)}
                                    aria-pressed={selected}
                                    className={`min-h-14 rounded-xl border px-2 py-2 flex flex-col items-center justify-center gap-1.5 text-[10px] font-bold transition ${
                                      selected
                                        ? 'border-brand bg-brand-light text-brand shadow-sm'
                                        : 'border-gray-200 bg-gray-50/60 text-gray-600 hover:border-gray-300 hover:bg-white'
                                    }`}
                                  >
                                    <span className={`grid place-items-center w-8 h-8 rounded-lg ${selected ? 'bg-white/80 text-brand' : 'bg-white text-gray-500 border border-gray-100'}`}>
                                      <Icon size={16} strokeWidth={2} aria-hidden />
                                    </span>
                                    <span className="text-center leading-tight">{label}</span>
                                  </button>
                                )
                              })}
                            </div>

                            {(block.config.mediaSource || 'gallery') === 'url' && (
                              <input
                                value={block.config.mediaUrl || ''}
                                onChange={(e) => patchActionConfig(block.id, {
                                  mediaUrl: e.target.value,
                                  mediaSource: 'url',
                                  mediaFileName: block.config.mediaFileName || '',
                                })}
                                placeholder="Cole a URL da mídia (https://…)"
                                className={inputCls + ' !text-xs'}
                              />
                            )}

                            {(block.config.mediaSource || 'gallery') === 'upload' && (
                              <label className={`min-h-12 rounded-xl border border-dashed flex items-center justify-center gap-2 text-[10px] font-bold cursor-pointer transition ${
                                blockUploadingId === block.id
                                  ? 'border-brand/40 bg-brand-light/40 text-brand'
                                  : 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-white hover:border-gray-400'
                              }`}>
                                {blockUploadingId === block.id ? (
                                  <><Loader2 size={15} className="animate-spin" aria-hidden /> Enviando…</>
                                ) : (
                                  <><Upload size={15} aria-hidden /> Selecionar arquivo</>
                                )}
                                <input
                                  type="file"
                                  accept={
                                    block.actionType === 'video' || block.actionType === 'reel'
                                      ? 'video/*'
                                      : block.actionType === 'image' || block.actionType === 'post' || block.actionType === 'story'
                                        ? 'image/*'
                                        : 'image/*,video/*'
                                  }
                                  className="hidden"
                                  disabled={blockUploadingId === block.id}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) void uploadBlockMedia(block.id, file)
                                    e.target.value = ''
                                  }}
                                />
                              </label>
                            )}

                            {(block.config.mediaSource || 'gallery') === 'gallery' && (
                              <button
                                type="button"
                                onClick={() => setGalleryPicker({
                                  mode: isVideoActionMedia(block.actionType) ? 'video' : 'image',
                                  blockId: block.id,
                                })}
                                className="w-full min-h-11 rounded-xl bg-gray-900 text-white text-[10px] font-bold hover:bg-gray-800 inline-flex items-center justify-center gap-2"
                              >
                                <Images size={14} aria-hidden /> Escolher na galeria
                              </button>
                            )}

                            {/* Miniatura / preview da mídia escolhida */}
                            {String(block.config.mediaUrl || '').trim() ? (
                              <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                                <div className="relative group bg-neutral-950/5">
                                  {isVideoActionMedia(block.actionType, block.config.mediaUrl) ? (
                                    <video
                                      src={block.config.mediaUrl}
                                      className="w-full max-h-52 object-contain bg-black"
                                      controls
                                      playsInline
                                      muted
                                      preload="metadata"
                                    />
                                  ) : (
                                    <img
                                      src={block.config.mediaUrl}
                                      alt={block.config.mediaFileName || 'Pré-visualização da mídia'}
                                      className="w-full max-h-52 object-contain bg-white"
                                      onError={(e) => {
                                        const el = e.currentTarget
                                        el.style.display = 'none'
                                        const fallback = el.nextElementSibling as HTMLElement | null
                                        if (fallback) fallback.hidden = false
                                      }}
                                    />
                                  )}
                                  <div hidden className="px-3 py-6 text-center text-[10px] text-gray-500">
                                    Não foi possível carregar a miniatura. O link está salvo.
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => patchActionConfig(block.id, {
                                      mediaUrl: '',
                                      mediaFileName: '',
                                      galleryUrl: '',
                                    })}
                                    className="absolute top-2 right-2 min-h-8 px-2.5 rounded-lg bg-black/70 text-white text-[10px] font-bold inline-flex items-center gap-1 hover:bg-black/85"
                                  >
                                    <X size={12} aria-hidden /> Remover
                                  </button>
                                </div>
                                {(block.config.mediaFileName || block.config.mediaUrl) && (
                                  <p className="px-2.5 py-1.5 text-[10px] text-gray-600 truncate border-t border-gray-100 bg-white" title={block.config.mediaUrl}>
                                    {block.config.mediaFileName || block.config.mediaUrl}
                                  </p>
                                )}
                              </div>
                            ) : block.config.mediaFileName ? (
                              <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2">
                                Arquivo: {block.config.mediaFileName} — envie de novo para gerar o preview.
                              </p>
                            ) : null}
                          </div>
                        )}

                        {block.channel === 'email' && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input value={block.config.subject || ''} onChange={(e) => updateActionConfig(block.id, 'subject', e.target.value)} placeholder="Assunto do e-mail" className={inputCls + ' !text-xs'} />
                            <input value={block.config.preheader || ''} onChange={(e) => updateActionConfig(block.id, 'preheader', e.target.value)} placeholder="Preheader" className={inputCls + ' !text-xs'} />
                          </div>
                        )}

                        {block.channel === 'push' && block.actionType === 'text' && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input value={block.config.title || ''} onChange={(e) => updateActionConfig(block.id, 'title', e.target.value)} placeholder="Título da notificação" className={inputCls + ' !text-xs'} />
                            <input value={block.config.deepLink || ''} onChange={(e) => updateActionConfig(block.id, 'deepLink', e.target.value)} placeholder="Deep link · /pedidos/123" className={inputCls + ' !text-xs'} />
                            <input value={block.config.imageUrl || ''} onChange={(e) => updateActionConfig(block.id, 'imageUrl', e.target.value)} placeholder="URL da imagem (opcional)" className={inputCls + ' !text-xs sm:col-span-2'} />
                          </div>
                        )}

                        {/* Corpo da mensagem — texto puro, ou texto de apoio em botões/lista/enquete */}
                        {showBodyText && (() => {
                          const usedTags = supportsAi
                            ? collectUsedTemplateTags(block.content || '', new Set(KNOWN_TEMPLATE_TOKENS))
                            : new Set<string>()
                          return (
                          <div className="space-y-2">
                            <div>
                              <p className="mb-1 text-[10px] font-bold text-gray-500">
                                {hasOptionBuilder
                                  ? (block.actionType === 'poll' ? 'Pergunta da enquete' : 'Texto da mensagem')
                                  : 'Mensagem'}
                              </p>
                              {supportsAi ? (
                                <TemplateTagTextarea
                                  ref={(el) => { textAreaRefs.current[block.id] = el }}
                                  value={block.content}
                                  onChange={(next) => updateActionBlock(block.id, { content: next })}
                                  knownTokens={KNOWN_TEMPLATE_TOKENS}
                                  rows={block.channel === 'email' ? 6 : 4}
                                  placeholder="Ex: Oi {{nome}}, sou {{afiliado_nome}} de {{afiliado_cidade}}. Trabalho com {{afiliado_nicho}} e represento a {{marca}}..."
                                />
                              ) : (
                                <textarea
                                  ref={(el) => { textAreaRefs.current[block.id] = el }}
                                  value={block.content}
                                  onChange={(event) => updateActionBlock(block.id, { content: event.target.value })}
                                  rows={2}
                                  placeholder={
                                    hasOptionBuilder
                                      ? (block.actionType === 'poll'
                                        ? 'Ex: Qual opção faz mais sentido pra você agora?'
                                        : 'Ex: Como posso te ajudar? Escolha uma opção:')
                                      : block.channel === 'push'
                                        ? 'Mensagem curta da notificação...'
                                        : block.channel === 'email'
                                          ? 'Conteúdo do e-mail...'
                                          : 'Texto da mensagem...'
                                  }
                                  className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs leading-relaxed outline-none focus:border-gray-900 focus:ring-4 focus:ring-gray-900/5"
                                />
                              )}
                            </div>

                            {/* Tags — apenas em texto puro / com IA */}
                            {supportsAi && (
                              <div className="rounded-xl border border-gray-200 bg-white p-2.5 space-y-2.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-[11px] font-bold text-gray-800">Tags de personalização</p>
                                    <p className="text-[9px] text-gray-500 leading-snug">
                                      Clique para inserir no cursor. Tags válidas ficam destacadas na cor da marca no texto — assim você confirma a grafia e o ponto exato.
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => insertTemplateTag(block.id, '{{afiliado_info}}', textAreaRefs.current[block.id])}
                                    className={`shrink-0 min-h-8 px-2 rounded-lg text-white text-[9px] font-bold transition ${
                                      usedTags.has('{{afiliado_info}}')
                                        ? 'bg-brand hover:opacity-90 ring-2 ring-brand/30'
                                        : 'bg-violet-600 hover:bg-violet-700'
                                    }`}
                                    title="Bloco completo de identidade do afiliado para a IA se moldar a ele"
                                  >
                                    {usedTags.has('{{afiliado_info}}') ? '✓ Info afiliado' : '+ Info afiliado'}
                                  </button>
                                </div>
                                {MESSAGE_TEMPLATE_TAG_GROUPS.map((group) => (
                                  <div key={group.key} className="space-y-1">
                                    <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                                      {group.label}
                                      <span className="font-normal normal-case tracking-normal text-gray-400">· {group.hint}</span>
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                      {group.tags.map((tag) => {
                                        const inText = usedTags.has(tag.token)
                                        return (
                                          <button
                                            key={tag.token}
                                            type="button"
                                            title={
                                              inText
                                                ? `${tag.description} — já no texto (destacada na cor da marca)`
                                                : tag.description
                                            }
                                            onClick={() => insertTemplateTag(block.id, tag.token, textAreaRefs.current[block.id])}
                                            aria-pressed={inText}
                                            className={`template-tag-chip min-h-8 px-2 rounded-lg border text-[10px] font-semibold transition ${
                                              inText
                                                ? 'is-used'
                                                : group.key === 'afiliado'
                                                  ? 'border-violet-200 bg-violet-50 text-violet-800 hover:border-violet-400 hover:bg-violet-100'
                                                  : group.key === 'marca'
                                                    ? 'border-sky-200 bg-sky-50 text-sky-800 hover:border-sky-400 hover:bg-sky-100'
                                                    : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-400 hover:bg-white'
                                            }`}
                                          >
                                            {inText ? '✓ ' : ''}{tag.label}
                                            <span className="template-tag-chip__token ml-1 opacity-50 font-mono text-[8px]">
                                              {tag.token.replace(/[{}]/g, '')}
                                            </span>
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                ))}
                                <p className="text-[9px] text-gray-400 leading-relaxed">
                                  Exemplo: <code className="bg-gray-100 px-1 rounded text-[9px]">Oi {'{{nome}}'}, sou {'{{afiliado_nome}}'} de {'{{afiliado_cidade}}'}. Atendo o nicho de {'{{afiliado_nicho}}'} pela {'{{marca}}'}.</code>
                                </p>
                              </div>
                            )}
                          </div>
                          )
                        })()}

                        {/* Montador de opções — botões / lista / enquete (literais, sem IA) */}
                        {hasOptionBuilder && optionMeta && (
                          <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-[11px] font-bold text-gray-800">{optionMeta.title}</p>
                                <p className="text-[9px] text-gray-500 leading-snug">
                                  Cada {optionMeta.itemLabel.toLowerCase()} é enviado exatamente como escrito — sem IA.
                                  {block.actionType === 'buttons' ? ' Máximo 3 botões no WhatsApp.' : ''}
                                </p>
                              </div>
                              <span className="text-[9px] font-bold text-gray-400 tabular-nums shrink-0">
                                {optionsFilled}/{optionMeta.max}
                              </span>
                            </div>

                            <div className="space-y-2">
                              {getEditableOptionItems(block).map((optItem, optIndex) => (
                                <div key={`${block.id}-opt-${optIndex}`} className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="w-6 h-9 rounded-lg bg-gray-100 text-gray-500 grid place-items-center text-[10px] font-black tabular-nums shrink-0">
                                      {optIndex + 1}
                                    </span>
                                    <input
                                      type="text"
                                      value={optItem.label}
                                      onChange={(e) => updateEditableOption(block.id, optIndex, e.target.value)}
                                      placeholder={optionMeta.placeholders[optIndex] || `${optionMeta.itemLabel} ${optIndex + 1}`}
                                      maxLength={block.actionType === 'buttons' ? 20 : 80}
                                      className={inputCls + ' !text-xs !py-2 flex-1'}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeEditableOption(block.id, optIndex)}
                                      disabled={getEditableOptionItems(block).length <= optionMeta.min && !optItem.label.trim()}
                                      className="min-h-9 min-w-9 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-25 grid place-items-center shrink-0"
                                      title={`Remover ${optionMeta.itemLabel.toLowerCase()}`}
                                      aria-label={`Remover ${optionMeta.itemLabel.toLowerCase()} ${optIndex + 1}`}
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                  {(block.actionType === 'buttons' || block.actionType === 'list') && (
                                    <div className="pl-8 flex items-center gap-2">
                                      <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-wide">Produto</span>
                                      <select
                                        value={optItem.productId || ''}
                                        onChange={(e) => {
                                          const pid = e.target.value
                                          if (!pid) {
                                            updateOptionProduct(block.id, optIndex, null)
                                            return
                                          }
                                          const p = pickerProducts.find((x) => String(x.id) === pid) ||
                                            (attachedProduct && String(attachedProduct.id) === pid ? attachedProduct : null)
                                          updateOptionProduct(block.id, optIndex, p ? { id: String(p.id), name: String(p.name || 'Produto') } : { id: pid, name: optItem.label || 'Produto' })
                                        }}
                                        onFocus={() => {
                                          if (!pickerProducts.length) {
                                            setPickerLoading(true)
                                            fetch('/api/products', { headers: getHeaders() })
                                              .then((r) => r.json())
                                              .then((d) => setPickerProducts(d.products || []))
                                              .catch(() => setPickerProducts([]))
                                              .finally(() => setPickerLoading(false))
                                          }
                                        }}
                                        className="flex-1 h-8 px-2 rounded-lg border border-gray-200 bg-white text-[11px] text-gray-800"
                                      >
                                        <option value="">— sem produto —</option>
                                        {(pickerProducts.length ? pickerProducts : attachedProduct ? [attachedProduct] : []).map((p: any) => (
                                          <option key={p.id} value={String(p.id)}>{p.name}</option>
                                        ))}
                                      </select>
                                      {optItem.productName && (
                                        <span className="text-[9px] text-emerald-700 truncate max-w-[100px]">{optItem.productName}</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>

                            <button
                              type="button"
                              onClick={() => addEditableOption(block.id)}
                              disabled={editableOptions.length >= optionMeta.max}
                              className="w-full min-h-11 rounded-xl border border-dashed border-gray-300 bg-gray-50 text-[11px] font-bold text-gray-700 hover:border-gray-400 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                            >
                              <Plus size={14} /> {optionMeta.addLabel}
                              {editableOptions.length >= optionMeta.max ? ` (máx. ${optionMeta.max})` : ''}
                            </button>

                            {optionsFilled < optionMeta.min && (
                              <p className="text-[9px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                                Informe pelo menos {optionMeta.min} {optionMeta.itemLabel.toLowerCase()}{optionMeta.min > 1 ? 's' : ''} preenchido{optionMeta.min > 1 ? 's' : ''}.
                              </p>
                            )}
                          </div>
                        )}

                        {/* Personalizar com IA — somente texto puro */}
                        {supportsAi && (
                          <>
                            <div className="flex items-center justify-between gap-3 rounded-xl bg-white border border-gray-200 p-2.5">
                              <div>
                                <p className="text-[11px] font-semibold text-gray-700">Personalizar com IA</p>
                                <p className="text-[9px] text-gray-400">Adapta o texto ao lead e se molda ao afiliado quando as tags estão presentes.</p>
                              </div>
                              <Toggle value={block.useAi} onChange={(value) => updateActionBlock(block.id, { useAi: value })} />
                            </div>
                            {block.useAi && (
                              <input
                                value={block.aiInstruction}
                                onChange={(event) => updateActionBlock(block.id, { aiInstruction: event.target.value })}
                                placeholder="Instrução específica para a IA neste bloco (ex: apresente-se como o afiliado, cite a cidade dele)"
                                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] outline-none focus:border-gray-900"
                              />
                            )}
                          </>
                        )}

                        {hasOptionBuilder && (
                          <p className="text-[9px] text-gray-400 leading-relaxed px-0.5">
                            Botões, lista e enquete são enviados <strong className="text-gray-600">exatamente como definidos</strong> — sem reescrita por IA.
                          </p>
                        )}

                        <div className="flex items-center justify-between gap-1 border-t border-gray-200 pt-2">
                          <p className="text-[9px] text-gray-400">Posição no fluxo: <strong className="text-gray-600">#{blockIndex + 1}</strong></p>
                          <div className="flex items-center gap-1">
                            <button type="button" disabled={blockIndex === 0} onClick={() => moveActionBlock(block.id, -1)} className="min-h-9 px-2 rounded-lg text-[10px] font-bold text-gray-500 hover:bg-gray-100 disabled:opacity-30">Subir</button>
                            <button type="button" disabled={blockIndex === actionBlocks.length - 1} onClick={() => moveActionBlock(block.id, 1)} className="min-h-9 px-2 rounded-lg text-[10px] font-bold text-gray-500 hover:bg-gray-100 disabled:opacity-30">Descer</button>
                            <button type="button" disabled={actionBlocks.length === 1} onClick={() => removeActionBlock(block.id)} className="min-h-9 px-2 rounded-lg text-[10px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-30">Remover</button>
                          </div>
                        </div>

                      </div>
                    </details>
                  )
                })}
              </div>

              <button type="button" onClick={addActionBlock} className="w-full min-h-12 rounded-2xl border border-dashed border-gray-300 bg-gray-50 text-xs font-bold text-gray-700 hover:border-gray-400 hover:bg-gray-100 flex items-center justify-center gap-2"><Plus size={15} /> Adicionar bloco</button>

            </div>

            <div className="hidden" aria-hidden="true">
            {/* ─── 1. MIDIA + LINK (topo) ─── */}
            <div className="bg-gray-50 rounded-xl p-3 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Midia & Link (opcional)</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setGalleryPicker({ mode: 'image' })}
                    className="text-[10px] font-bold text-rose-700 hover:text-rose-900 underline-offset-2 hover:underline"
                  >
                    Imagem · Publicidade
                  </button>
                  <span className="text-gray-300 text-[10px]">|</span>
                  <button
                    type="button"
                    onClick={() => setGalleryPicker({ mode: 'video' })}
                    className="text-[10px] font-bold text-rose-700 hover:text-rose-900 underline-offset-2 hover:underline"
                  >
                    Vídeo · Publicidade
                  </button>
                </div>
              </div>

              {/* Imagem + Video */}
              <div className="grid grid-cols-2 gap-2">
                {/* Imagem */}
                <div className={`rounded-xl border-2 border-dashed overflow-hidden transition-all ${imageUrl ? 'border-gray-300 bg-gray-50/30' : 'border-gray-200 bg-white'}`}>
                  {imageUrl ? (
                    <div className="relative group" style={{ aspectRatio: '16/10' }}>
                      <img src={imageUrl} alt="" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                        <label className="px-2 py-1 bg-white/90 rounded-lg text-[10px] font-bold text-gray-700 cursor-pointer">
                          Trocar <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadMedia(f, 'image') }} />
                        </label>
                        <button onClick={() => setImageUrl('')} className="px-2 py-1 bg-red-500/90 rounded-lg text-[10px] font-bold text-white">Remover</button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center py-5 cursor-pointer hover:bg-gray-50/50 transition">
                      {uploadingImage ? <Loader2 size={18} className="text-gray-400 animate-spin" /> : <Eye size={18} className="text-gray-300" />}
                      <p className="text-[10px] text-gray-400 mt-1 font-medium">{uploadingImage ? 'Enviando...' : 'Imagem'}</p>
                      <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadMedia(f, 'image') }} />
                    </label>
                  )}
                </div>
                {/* Video — aceita multiplos (ate 5) */}
                {videoUrls.length === 0 && (
                  <div className="rounded-xl border-2 border-dashed overflow-hidden transition-all border-gray-200 bg-white">
                    <label className="flex flex-col items-center justify-center py-5 cursor-pointer hover:bg-gray-50/50 transition">
                      {uploadingVideo ? <Loader2 size={18} className="text-gray-400 animate-spin" /> : <Film size={18} className="text-gray-300" />}
                      <p className="text-[10px] text-gray-400 mt-1 font-medium">{uploadingVideo ? 'Enviando...' : 'Videos (ate 5)'}</p>
                      <input type="file" accept="video/mp4,video/webm" multiple className="hidden" onChange={e => { if (e.target.files?.length) uploadMultipleVideos(e.target.files) }} />
                    </label>
                  </div>
                )}
              </div>

              {/* Multi-video grid */}
              {videoUrls.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Videos ({videoUrls.length}/5)</p>
                    {videoUrls.length < 5 && (
                      <label className="text-[10px] font-bold text-gray-500 cursor-pointer hover:text-gray-900 flex items-center gap-1">
                        {uploadingVideo ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                        {uploadingVideo ? 'Enviando...' : 'Adicionar'}
                        <input type="file" accept="video/mp4,video/webm" multiple className="hidden" onChange={e => { if (e.target.files?.length) uploadMultipleVideos(e.target.files) }} />
                      </label>
                    )}
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {videoUrls.map((url, i) => (
                      <div key={i} className="relative group rounded-lg overflow-hidden border border-gray-200 bg-gray-50/30" style={{ aspectRatio: '9/12' }}>
                        <video src={url} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button onClick={() => setVideoUrls(prev => prev.filter((_, j) => j !== i))} className="p-1 bg-red-500/90 rounded-full">
                            <X size={12} className="text-white" />
                          </button>
                        </div>
                        <span className="absolute bottom-0.5 left-0.5 bg-black/60 text-white text-[8px] font-bold px-1 rounded">{i + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Imagem caption */}
              {imageUrl && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Toggle value={imageUseTextAsCaption} onChange={setImageUseTextAsCaption} />
                    <span className="text-[10px] text-gray-500 font-medium">Usar texto da mensagem como legenda da imagem</span>
                  </div>
                  {!imageUseTextAsCaption && (
                    <input type="text" value={imageCaption} onChange={e => setImageCaption(e.target.value)}
                      placeholder="Legenda da imagem..." className={inputCls + ' !text-xs !py-2'} />
                  )}
                </div>
              )}

              {/* Video caption */}
              {videoUrls.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Toggle value={videoUseTextAsCaption} onChange={setVideoUseTextAsCaption} />
                    <span className="text-[10px] text-gray-500 font-medium">Usar texto da mensagem como legenda do video</span>
                  </div>
                  {!videoUseTextAsCaption && (
                    <input type="text" value={videoCaption} onChange={e => setVideoCaption(e.target.value)}
                      placeholder="Legenda do video..." className={inputCls + ' !text-xs !py-2'} />
                  )}
                </div>
              )}

              {/* Audio + Documento */}
              <div className="grid grid-cols-2 gap-2">
                {/* Audio */}
                <div className={`rounded-xl border-2 border-dashed transition-all ${audioUrl ? 'border-gray-300 bg-gray-50/30' : 'border-gray-200 bg-white'}`}>
                  {audioUrl ? (
                    <div className="p-2.5 space-y-2">
                      <audio src={audioUrl} controls className="w-full h-8" />
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-1.5 text-[10px] text-gray-600 font-medium">
                          <input type="checkbox" checked={audioVoiceNote} onChange={e => setAudioVoiceNote(e.target.checked)} className="w-3 h-3" />
                          Voice note
                        </label>
                        <button onClick={() => setAudioUrl('')} className="text-[10px] text-red-500 font-bold">Remover</button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center py-5 cursor-pointer hover:bg-gray-50/50 transition">
                      {uploadingAudio ? <Loader2 size={18} className="text-gray-400 animate-spin" /> : <Volume2 size={18} className="text-gray-300" />}
                      <p className="text-[10px] text-gray-400 mt-1 font-medium">{uploadingAudio ? 'Enviando...' : 'Audio'}</p>
                      <input type="file" accept="audio/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadMedia(f, 'audio') }} />
                    </label>
                  )}
                </div>
                {/* Documento */}
                <div className={`rounded-xl border-2 border-dashed transition-all ${documentUrl ? 'border-gray-300 bg-gray-50/30' : 'border-gray-200 bg-white'}`}>
                  {documentUrl ? (
                    <div className="p-2.5 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <FileText size={14} className="text-gray-500 shrink-0" />
                        <span className="text-[11px] font-bold text-gray-700 truncate">{documentName || 'documento'}</span>
                      </div>
                      <input type="text" value={documentName} onChange={e => setDocumentName(e.target.value)}
                        placeholder="Nome do arquivo..." className="w-full px-2 py-1 border border-gray-200 rounded-md text-[10px]" />
                      <button onClick={() => { setDocumentUrl(''); setDocumentName('') }} className="text-[10px] text-red-500 font-bold">Remover</button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center py-5 cursor-pointer hover:bg-gray-50/50 transition">
                      {uploadingDocument ? <Loader2 size={18} className="text-gray-400 animate-spin" /> : <FileText size={18} className="text-gray-300" />}
                      <p className="text-[10px] text-gray-400 mt-1 font-medium">{uploadingDocument ? 'Enviando...' : 'Documento'}</p>
                      <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadMedia(f, 'document') }} />
                    </label>
                  )}
                </div>
              </div>

              {/* Link */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-1 block flex items-center gap-1.5">
                  <Link2 size={11} /> Link (gera preview no WhatsApp)
                </label>
                <input type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                  placeholder="https://exemplo.com/sua-pagina"
                  className={inputCls + ' !text-xs !py-2'} />
                <p className="text-[9px] text-gray-400 mt-1">O link sera adicionado ao final da mensagem. Se ja estiver no texto, nao sera duplicado.</p>
              </div>
            </div>

            {/* ─── PRODUTO VINCULADO ─── */}
            <div className="bg-gray-50 rounded-xl p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] flex items-center gap-1.5">
                  <ShoppingBag size={11} /> Produto vinculado
                </p>
                {attachedProduct && (
                  <button onClick={() => setAttachedProduct(null)} className="text-[10px] font-semibold text-red-500 hover:text-red-600 transition">Remover</button>
                )}
              </div>

              {attachedProduct ? (
                <div className="flex gap-3 bg-white rounded-xl border border-gray-200 p-2.5">
                  {prodImg(attachedProduct) ? (
                    <img src={prodImg(attachedProduct)} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0 border border-gray-100"
                      onError={e => { e.currentTarget.style.display = 'none'; const fb = e.currentTarget.nextElementSibling as HTMLElement; if (fb) fb.style.display = 'grid' }} />
                  ) : null}
                  <div className="w-16 h-16 rounded-lg bg-gray-100 grid place-items-center shrink-0" style={{ display: prodImg(attachedProduct) ? 'none' : 'grid' }}><ShoppingBag size={20} className="text-gray-300" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate">{attachedProduct.name}</p>
                    {attachedProduct.description && <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">{attachedProduct.description}</p>}
                    <p className="text-sm font-extrabold text-emerald-600 mt-1">
                      {typeof attachedProduct.price === 'number' ? `R$ ${attachedProduct.price.toFixed(2).replace('.', ',')}` : ''}
                      {attachedProduct.promoPrice != null && (
                        <span className="text-[10px] text-gray-400 line-through ml-1.5 font-normal">
                          R$ {Number(attachedProduct.promoPrice).toFixed(2).replace('.', ',')}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => {
                  setShowProductPicker(true)
                  setPickerSearch('')
                  if (pickerProducts.length === 0) {
                    setPickerLoading(true)
                    fetch('/api/products', { headers: getHeaders() })
                      .then(r => r.json())
                      .then(d => { setPickerProducts(d.products || []); setPickerLoading(false) })
                      .catch(() => setPickerLoading(false))
                  }
                }} className="w-full py-4 rounded-xl border-2 border-dashed border-gray-200 bg-white hover:border-gray-400 hover:bg-gray-50/30 transition text-center cursor-pointer">
                  <ShoppingBag size={18} className="text-gray-300 mx-auto" />
                  <p className="text-[10px] text-gray-400 mt-1 font-medium">Selecionar produto do catalogo</p>
                  <p className="text-[9px] text-gray-300 mt-0.5">A imagem e dados do produto serao enviados na campanha</p>
                </button>
              )}
            </div>

            {/* Product Picker Modal */}
            {showProductPicker && (
              <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowProductPicker(false)}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <p className="text-sm font-bold text-gray-900">Selecionar produto</p>
                    <button onClick={() => setShowProductPicker(false)} className="p-1.5 rounded-lg hover:bg-gray-100 transition"><X size={16} className="text-gray-400" /></button>
                  </div>
                  <div className="px-5 py-3 border-b border-gray-100 shrink-0">
                    <input type="text" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
                      placeholder="Buscar produto..."
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 placeholder:text-gray-300" />
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                    {pickerLoading ? (
                      <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
                    ) : (() => {
                      const q = pickerSearch.toLowerCase().trim()
                      const filtered = q ? pickerProducts.filter(p => (p.name || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q)) : pickerProducts
                      if (filtered.length === 0) return <p className="text-xs text-gray-400 text-center py-8">Nenhum produto encontrado</p>
                      return filtered.map((p: any) => (
                        <button key={p.id} type="button" onClick={() => { setAttachedProduct(p); setShowProductPicker(false) }}
                          className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-gray-200 hover:border-gray-400 hover:bg-gray-50/30 transition text-left">
                          {prodImg(p) ? (
                            <img src={prodImg(p)} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0 border border-gray-100"
                              onError={e => { const el = e.currentTarget as HTMLImageElement; el.style.display = 'none'; el.nextElementSibling?.classList.remove('hidden') }} />
                          ) : null}
                          <div className={`w-12 h-12 rounded-lg bg-gray-100 place-items-center shrink-0 ${prodImg(p) ? 'hidden' : 'grid'}`}><ShoppingBag size={16} className="text-gray-300" /></div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-900 truncate">{p.name}</p>
                            <p className="text-[10px] text-gray-400 truncate">{p.category || ''}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-bold text-emerald-600">
                              {typeof p.price === 'number' ? `R$ ${p.price.toFixed(2).replace('.', ',')}` : ''}
                            </p>
                          </div>
                        </button>
                      ))
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* ─── 2. CONTEUDO DA MENSAGEM ─── */}
            <div>
              <label className={labelCls}>Mensagem / Template</label>
              <textarea value={messageTemplate} onChange={e => setMessageTemplate(e.target.value)} rows={4}
                placeholder="Ola {{nome}}, tudo bem? Sou da {{empresa}}. Gostaria de conversar sobre..."
                className={inputCls + ' resize-none font-mono text-xs leading-relaxed'} />
              <p className="text-[10px] text-gray-400 mt-1">Variaveis (legado): use as tags no bloco de texto acima — lead, afiliado e marca.</p>
            </div>

            {/* ─── 3. INTELIGENCIA ARTIFICIAL ─── */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-3 ring-1 ring-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gray-900 grid place-items-center"><Zap size={14} className="text-white" /></div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">Inteligencia Artificial</p>
                    <p className="text-[10px] text-gray-500">A IA personaliza cada mensagem para o lead</p>
                  </div>
                </div>
                <Toggle value={useAi} onChange={setUseAi} />
              </div>

              {useAi && (<>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Instrucoes para a IA (prompt)</label>
                  <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} rows={3}
                    placeholder="Ex: Fale sobre nossos produtos, mencione o nome do cliente, pergunte sobre interesse..."
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 resize-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Texto de intencao (objetivo detalhado)</label>
                  <textarea value={intentText} onChange={e => setIntentText(e.target.value)} rows={3}
                    placeholder="Descreva o objetivo da abordagem, tom desejado, proposta de valor, CTA esperado..."
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 resize-none" />
                  <p className="text-[9px] text-gray-400 mt-1">Este texto guia o compositor para gerar conteudo contextualizado por lead.</p>
                </div>
              </>)}
            </div>

            </div>

            {/* ─── 4. CONFIG AVANCADA (colapsavel) ─── */}
            <details className="group">
              <summary className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 cursor-pointer hover:text-gray-600 transition select-none">
                <ChevronRight size={12} className="transition-transform group-open:rotate-90" /> Configuracoes avancadas
              </summary>
              <div className="mt-3 space-y-3 pl-1">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                    <span className="text-[11px] font-medium text-gray-600">Personalizar por lead</span>
                    <Toggle value={personalizedPerLead} onChange={setPersonalizedPerLead} />
                  </div>
                  <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                    <span className="text-[11px] font-medium text-gray-600">Variacoes automaticas</span>
                    <Toggle value={useAutoVariations} onChange={setUseAutoVariations} />
                  </div>
                </div>
                <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <div>
                    <span className="text-[11px] font-medium text-gray-700">Buscar nome do contato</span>
                    <p className="text-[9px] text-gray-400 mt-0.5">Quando o prospect nao tem nome, busca automaticamente do WhatsApp e normaliza antes do envio</p>
                  </div>
                  <Toggle value={nameEnrichmentEnabled} onChange={setNameEnrichmentEnabled} />
                </div>
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-2">
                  <div>
                    <span className="text-[11px] font-medium text-gray-700">Fluxo após resposta</span>
                    <p className="text-[9px] text-gray-400 mt-0.5">
                      Quando o lead responder a campanha, inicia a jornada em /fluxos (publicada e ativa).
                    </p>
                  </div>
                  <select
                    value={replyStartFlowId}
                    onChange={(e) => setReplyStartFlowId(e.target.value)}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
                  >
                    <option value="">Nenhum</option>
                    {flowOptions.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                  {replyStartFlowId && (
                    <label className="flex items-center justify-between gap-2 text-[11px] text-gray-700">
                      <span>Somente se classificação = interessado</span>
                      <Toggle value={replyStartFlowOnlyInterested} onChange={setReplyStartFlowOnlyInterested} />
                    </label>
                  )}
                </div>
              </div>
            </details>

          </>)}


          {/* Tab: Segmentacao */}
          {activeTab === 'segmentacao' && (() => {
            const CAT_LABEL: Record<string, string> = {
              restaurant: 'Restaurante', buffet_restaurant: 'Buffet', pizza_restaurant: 'Pizzaria',
              brazilian_restaurant: 'Brasileiro', barbecue_restaurant: 'Churrascaria', bar: 'Bar',
              manufacturer: 'Fabricante', italian_restaurant: 'Italiano', seafood_restaurant: 'Frutos do Mar',
              family_restaurant: 'Familiar', food: 'Alimentacao', snack_bar: 'Lanchonete',
              health_food_store: 'Emporio', meal_delivery: 'Delivery', hamburger_restaurant: 'Hamburgueria',
              japanese_restaurant: 'Japones', wholesaler: 'Atacadista',
            }
            const chipActive = 'border border-gray-900 bg-gray-50 text-violet-800'
            const chipInactive = 'border border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
            const sectionLabel = 'text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2 block'
            const availCats: { value: string; count: number }[] = (filterOptions?.categories || []).slice(0, 12)
            const availCities: { value: string; count: number }[] = (filterOptions?.cities || []).slice(0, 10)
            const availTags: string[] = filterOptions?.tags || []
            const statusCounts: Record<string, number> = filterOptions?.statusCounts || {}
            const toggleArr = (arr: string[], set: (v: string[]) => void, val: string) =>
              set(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val])
            return (<>
              {/* Auto-alimentar novos prospects */}
              <div className={`rounded-xl border px-3.5 py-3 flex items-start gap-3 ${
                autoFeedLeads
                  ? 'border-emerald-200 bg-emerald-50/70'
                  : 'border-gray-200 bg-white'
              }`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Zap size={14} className={autoFeedLeads ? 'text-emerald-600' : 'text-gray-400'} />
                    <p className="text-[12px] font-bold text-gray-900">Auto-alimentar com novos prospects</p>
                  </div>
                  <p className="mt-1 text-[10px] text-gray-500 leading-snug">
                    Quando estiver ligado, todo prospect/lead novo que casar com este filtro entra sozinho na fila —
                    sem reabrir segmentação nem recalcular o alcance manualmente. Ideal com a campanha em execução.
                  </p>
                  {autoFeedLeads && (
                    <p className="mt-1.5 text-[10px] font-semibold text-emerald-700">
                      Ativo: captura e importações alimentam esta campanha em tempo real.
                    </p>
                  )}
                </div>
                <Toggle value={autoFeedLeads} onChange={setAutoFeedLeads} />
              </div>

              {/* Preview banner */}
              <div className={`rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center gap-2 ${
                previewCount === null ? 'bg-gray-50 text-gray-400' :
                previewCount === 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                'bg-green-50 text-green-700 border border-green-200'
              }`}>
                <span className="grid place-items-center w-4 h-4 shrink-0">
                  {previewCount === null
                    ? <Loader2 size={12} className="animate-spin" />
                    : previewCount === 0
                      ? <AlertTriangle size={13} strokeWidth={2} />
                      : <CheckCircle2 size={13} strokeWidth={2} />}
                </span>
                {previewCount === null
                  ? 'Calculando alcance...'
                  : previewCount === 0
                  ? 'Nenhum lead corresponde aos filtros atuais'
                  : `Esta campanha alcancara ~${previewCount.toLocaleString('pt-BR')} leads${autoFeedLeads ? ' (+ auto-alimentar)' : ''}`}
              </div>

              {/* Status */}
              <div>
                <span className={sectionLabel}>Status</span>
                <div className="flex flex-wrap gap-1.5">
                  {LEAD_STATUSES.map(s => {
                    const cnt = statusCounts[s]
                    const active = filterStatuses.includes(s)
                    return (
                      <button key={s} type="button"
                        onClick={() => toggleArr(filterStatuses, setFilterStatuses, s)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 ${active ? chipActive : chipInactive}`}>
                        {s}{cnt != null && <span className="text-[9px] opacity-60">({cnt})</span>}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Categoria */}
              {availCats.length > 0 && (
                <div>
                  <span className={sectionLabel}>Categoria</span>
                  <div className="flex flex-wrap gap-1.5">
                    {availCats.map(({ value, count }) => {
                      const active = filterCategories.includes(value)
                      return (
                        <button key={value} type="button"
                          onClick={() => toggleArr(filterCategories, setFilterCategories, value)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 ${active ? chipActive : chipInactive}`}>
                          {CAT_LABEL[value] || value}
                          {count != null && <span className="text-[9px] opacity-60">({count})</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Cidade */}
              {availCities.length > 0 && (
                <div>
                  <span className={sectionLabel}>Cidade</span>
                  <div className="flex flex-wrap gap-1.5">
                    {availCities.map(({ value, count }) => {
                      const active = filterCities.includes(value)
                      return (
                        <button key={value} type="button"
                          onClick={() => toggleArr(filterCities, setFilterCities, value)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 ${active ? chipActive : chipInactive}`}>
                          {value}
                          {count != null && <span className="text-[9px] opacity-60">({count})</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Rating minimo */}
              <div>
                <span className={sectionLabel}>Rating minimo</span>
                <div className="flex flex-wrap gap-1.5">
                  {([undefined, 3, 4, 4.5] as (number | undefined)[]).map(v => {
                    const active = filterMinRating === v
                    return (
                      <button key={String(v)} type="button"
                        onClick={() => setFilterMinRating(v)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition ${active ? chipActive : chipInactive}`}>
                        {v == null ? (
                          'Qualquer'
                        ) : (
                          <>
                            <Star size={10} strokeWidth={2} className="fill-current" />
                            {v}+
                          </>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Tags */}
              <div>
                <span className={sectionLabel}>Tags</span>
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <div>
                    <label className="text-[10px] text-gray-400 mb-1 block">Incluir (virgula)</label>
                    <input type="text" value={filterTagsInclude} onChange={e => setFilterTagsInclude(e.target.value)} placeholder="tag1, tag2" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 mb-1 block">Excluir (virgula)</label>
                    <input type="text" value={filterTagsExclude} onChange={e => setFilterTagsExclude(e.target.value)} placeholder="tag_excluir" className={inputCls} />
                  </div>
                </div>
                {availTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {availTags.slice(0, 20).map(tag => {
                      const included = filterTagsInclude.split(',').map((t: string) => t.trim()).includes(tag)
                      return (
                        <button key={tag} type="button"
                          onClick={() => {
                            const parts = filterTagsInclude.split(',').map((t: string) => t.trim()).filter(Boolean)
                            if (included) setFilterTagsInclude(parts.filter((t: string) => t !== tag).join(', '))
                            else setFilterTagsInclude([...parts, tag].join(', '))
                          }}
                          className={`px-2 py-1 rounded text-[10px] font-medium transition ${included ? chipActive : chipInactive}`}>
                          {tag}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* WhatsApp toggle */}
              <div className="flex items-center justify-between py-1 border-t border-gray-100 pt-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Somente com WhatsApp</p>
                  <p className="text-[11px] text-gray-400">Filtrar apenas leads com WhatsApp validado</p>
                </div>
                <Toggle value={filterHasWhatsapp} onChange={setFilterHasWhatsapp} />
              </div>
            </>)
          })()}

          {/* Tab: Velocidade & Anti-block */}
          {activeTab === 'velocidade' && (() => {
            const isRotation = instanceMode === 'smart-rotation'
            const connectedInstances = instances.filter((i: any) => i.status === 'connected')
            const connectedPool = isRotation ? connectedInstances.length : (instanceId ? 1 : 0)
            const perMin = Number(maxPerMinute) || 3
            const daily = Number(dailyLimit) || 200
            const effectivePerMin = perMin * connectedPool
            const effectiveDaily = daily * connectedPool
            const presets: Record<string, { perMin: string; daily: string; minInt: string; maxInt: string }> = {
              conservative: { perMin: '1', daily: '50',  minInt: '30', maxInt: '90'  },
              balanced:     { perMin: '3', daily: '200', minInt: '10', maxInt: '30'  },
              aggressive:   { perMin: '6', daily: '500', minInt: '5',  maxInt: '15'  },
            }
            function applyPreset(mode: string) {
              setRotationMode(mode)
              const p = presets[mode]
              if (p) { setMaxPerMinute(p.perMin); setDailyLimit(p.daily); setMinInterval(p.minInt); setMaxInterval(p.maxInt) }
            }
            return <>

            {/* Modo de instancia */}
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Modo de disparo</p>
              <div className="grid grid-cols-2 gap-2">
                {[['specific', 'Sessão única', 'Envia por uma única conexão selecionada abaixo'], ['smart-rotation', 'Rodízio inteligente', 'Distribui automaticamente entre todas as sessões conectadas']].map(([k, l, d]) => (
                  <button key={k} type="button" onClick={() => setInstanceMode(k)}
                    className={`p-3 rounded-xl border text-left transition ${instanceMode === k ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <p className={`text-[11px] font-bold ${instanceMode === k ? 'text-gray-900' : 'text-gray-700'}`}>{l}</p>
                    <p className="text-[9px] text-gray-400 mt-0.5 leading-tight">{d}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Toda seleção de conexão pertence à Distribuição. */}
            <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-3.5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-xs font-bold text-gray-900">{isRotation ? 'Fallback preferencial' : 'Sessão de envio'}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                    {isRotation
                      ? 'Usada somente quando o rodízio precisar priorizar uma conexão disponível.'
                      : 'Esta será a única conexão responsável pelos disparos da campanha.'}
                  </p>
                </div>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-1 whitespace-nowrap">
                  {connectedInstances.length} ativa{connectedInstances.length === 1 ? '' : 's'}
                </span>
              </div>
              <select value={instanceId} onChange={e => setInstanceId(e.target.value)} className={inputCls}>
                <option value="">{isRotation ? 'Automático — próxima disponível' : 'Selecione uma sessão ativa'}</option>
                {instances.map((inst: any) => (
                  <option key={inst.id} value={inst.id} disabled={inst.status !== 'connected'}>
                    {inst.name || 'Sessão'} {inst.phone ? `(${inst.phone})` : ''} — {inst.status === 'connected' ? 'Ativa' : 'Indisponível'}
                  </option>
                ))}
              </select>
              {instanceId && instances.find((inst: any) => String(inst.id) === String(instanceId))?.status !== 'connected' && (
                <p className="mt-2 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Essa sessão está desconectada e não poderá participar. Escolha uma conexão ativa.
                </p>
              )}
            </div>

            {/* Rotation: pool + distribution mode */}
            {isRotation && (<>
              <div className="border-t border-gray-100 pt-3 mt-1">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Sessões do rodízio</p>
                <p className="text-[10px] text-gray-500 mb-2">Cada sessão ativa participa automaticamente como uma unidade de distribuição. Ao desconectar, ela sai do rodízio sem interromper as demais.</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {instances.length === 0 ? (
                    <p className="text-xs text-gray-400 p-3 bg-gray-50 rounded-xl">Nenhuma instancia cadastrada.</p>
                  ) : instances.map((inst: any) => {
                    const isConnected = inst.status === 'connected'
                    return (
                      <div key={inst.id}
                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border ${
                          isConnected ? 'border-emerald-200 bg-emerald-50/50' : 'border-gray-200 bg-white opacity-60'
                        }`}>
                        <span className={`w-5 h-5 rounded-full grid place-items-center text-[10px] font-bold ${isConnected ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                          {isConnected ? '✓' : '—'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                            <span className="text-xs font-bold text-gray-900 truncate">{inst.name || inst.id.slice(0, 8)}</span>
                            <span className="text-[10px] text-gray-400">{inst.phone || ''}</span>
                          </div>
                          <span className={`text-[9px] font-semibold ${isConnected ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {isConnected ? 'Participando automaticamente' : 'Fora do rodízio'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="mt-2 px-1 text-[10px] font-bold text-gray-700">{connectedInstances.length} sessão(ões) elegível(is) agora</p>
              </div>

              <div className="border-t border-gray-100 pt-3 mt-1">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Padrao de rodizio</p>
                <p className="text-[10px] text-gray-400 mb-2">Define como o sistema alterna entre as instancias durante o disparo.</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['conservative', 'Sequencial', '1 msg por instancia, depois passa pra proxima em fila'],
                    ['balanced', 'Distribuido', 'Alterna uniformemente entre todas as instancias'],
                    ['aggressive', 'Concentrado', 'Usa o maximo de uma instancia antes de passar pra proxima'],
                  ].map(([k, l, d]) => (
                    <button key={k} type="button" onClick={() => applyPreset(k)}
                      className={`p-2.5 rounded-xl border text-left transition ${rotationMode === k ? 'border-gray-900 bg-gray-50 shadow-sm' : 'border-gray-200 hover:border-gray-300'}`}>
                      <p className={`text-[11px] font-bold ${rotationMode === k ? 'text-gray-900' : 'text-gray-700'}`}>{l}</p>
                      <p className="text-[9px] text-gray-400 mt-0.5 leading-tight">{d}</p>
                    </button>
                  ))}
                </div>
              </div>
            </>)}

            {/* Speed controls — always visible, per-instance when rotation is on */}
            <div className={isRotation ? 'border-t border-gray-100 pt-3 mt-1' : ''}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Limites {isRotation ? 'por instancia' : 'de velocidade'}
                </p>
              </div>
              {isRotation && (
                <p className="text-[10px] text-gray-400 mb-2">Cada valor se aplica individualmente a cada instancia selecionada. Voce pode ajustar livremente.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Msgs por minuto {isRotation ? '(cada)' : ''}</label>
                <input type="number" min={1} max={30} value={maxPerMinute} onChange={e => setMaxPerMinute(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Limite diario {isRotation ? '(cada)' : ''}</label>
                <input type="number" min={1} max={2000} value={dailyLimit} onChange={e => setDailyLimit(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Intervalo min (seg)</label>
                <input type="number" min={1} max={600} value={minInterval} onChange={e => setMinInterval(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Intervalo max (seg)</label>
                <input type="number" min={1} max={600} value={maxInterval} onChange={e => setMaxInterval(e.target.value)} className={inputCls} />
              </div>
            </div>

            {/* Effective throughput summary — only when rotation with multiple instances */}
            {isRotation && connectedPool > 1 && (
              <div className="rounded-xl p-3 bg-gray-50 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Capacidade combinada</p>
                    <p className="text-base font-extrabold text-gray-900 mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      ~{effectivePerMin} msgs/min
                      <span className="text-[11px] font-semibold text-gray-400 ml-2">ate {effectiveDaily}/dia</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-700 font-bold">{connectedPool} ativas</p>
                    <p className="text-[9px] text-gray-400">{perMin}/min x {connectedPool}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="border-t border-gray-100 pt-3 mt-1">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Anti-bloqueio</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Pausar apos X bloqueios</label>
                <input type="number" min={1} max={50} value={autoPauseBlocks} onChange={e => setAutoPauseBlocks(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Pausar se taxa de bloqueio (%)</label>
                <input type="number" min={1} max={100} value={autoPauseRate} onChange={e => setAutoPauseRate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Pausar se taxa de erro (%)</label>
                <input type="number" min={1} max={100} value={autoPauseErrorRate} onChange={e => setAutoPauseErrorRate(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
              <span className="text-xs font-medium text-gray-600">Pausar se instancia ficar offline</span>
              <Toggle value={autoPauseOffline} onChange={setAutoPauseOffline} />
            </div>
          </>})()}

          {/* Tab: Agenda */}
          {activeTab === 'agenda' && (<>
            <div>
              <label className={labelCls}>Modo de agendamento</label>
              <div className="grid grid-cols-2 gap-2">
                {[['immediate', 'Imediato', 'Inicia ao clicar Iniciar'], ['scheduled', 'Agendado', 'Inicia em data/hora definida']].map(([k, l, d]) => (
                  <button key={k} type="button" onClick={() => setScheduleMode(k)}
                    className={`p-3 rounded-xl border text-left transition ${scheduleMode === k ? 'border-gray-900 bg-gray-50' : 'border-gray-200'}`}>
                    <p className={`text-xs font-bold ${scheduleMode === k ? 'text-gray-900' : 'text-gray-700'}`}>{l}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{d}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Janela de envio */}
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-semibold text-gray-800">Janela de envio</p>
                <p className="text-[11px] text-gray-400">Restringir envios a um horario especifico</p>
              </div>
              <Toggle value={windowEnabled} onChange={setWindowEnabled} />
            </div>
            {windowEnabled && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Horario inicio</label>
                  <input type="time" value={smartWindowStart} onChange={e => setSmartWindowStart(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Horario fim</label>
                  <input type="time" value={smartWindowEnd} onChange={e => setSmartWindowEnd(e.target.value)} className={inputCls} />
                </div>
              </div>
            )}

            <div>
              <label className={labelCls}>Fuso horario</label>
              <select value={timeZone} onChange={e => setTimeZone(e.target.value)} className={inputCls}>
                <option value="America/Sao_Paulo">America/Sao_Paulo (BRT)</option>
                <option value="America/Manaus">America/Manaus (AMT)</option>
                <option value="America/Fortaleza">America/Fortaleza (BRT)</option>
              </select>
            </div>

            {/* Restricoes de envio */}
            <div className="border-t border-gray-100 pt-3 mt-1">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Restricoes de envio</p>
              <div className="space-y-2">
                {[
                  { label: 'Evitar envios a noite (22h-7h)', value: avoidNight, onChange: setAvoidNight },
                  { label: 'Evitar envios no domingo', value: avoidSunday, onChange: setAvoidSunday },
                ].map(opt => (
                  <div key={opt.label} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                    <span className="text-xs font-medium text-gray-600">{opt.label}</span>
                    <Toggle value={opt.value} onChange={opt.onChange} />
                  </div>
                ))}
              </div>
            </div>
          </>)}

          {/* Tab: Acoes Finais & Triggers */}
          {activeTab === 'acoes' && (<>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Apos a campanha</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Mover lead para status</label>
                <select value={nextStatus} onChange={e => setNextStatus(e.target.value)} className={inputCls}>
                  <option value="">Nao alterar</option>
                  <option value="contacted">Contatado</option>
                  <option value="replied">Respondeu</option>
                  <option value="negotiating">Negociando</option>
                  <option value="converted">Convertido</option>
                  <option value="lost">Perdido</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Adicionar tags (virgula)</label>
                <input type="text" value={addTags} onChange={e => setAddTags(e.target.value)} placeholder="contatado, follow_1" className={inputCls} />
              </div>
            </div>
            <div className="border-t border-gray-100 pt-3 mt-1">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Gatilhos automaticos</p>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Disparar ao capturar novo lead', value: trigOnNewLead, onChange: setTrigOnNewLead },
                { label: 'Disparar ao mudar status do lead', value: trigOnStatusChange, onChange: setTrigOnStatusChange },
                { label: 'Disparar quando tag combinar', value: trigOnTagMatch, onChange: setTrigOnTagMatch },
                { label: 'Disparar ao criar pedido', value: trigOnOrderCreated, onChange: setTrigOnOrderCreated },
              ].map(opt => (
                <div key={opt.label} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                  <span className="text-xs font-medium text-gray-600">{opt.label}</span>
                  <Toggle value={opt.value} onChange={opt.onChange} />
                </div>
              ))}
            </div>
          </>)}

          {/* Tab: Metricas (read-only) */}
          {activeTab === 'metricas' && (<>
            {!isEdit ? (
              <div className="text-center py-8">
                <p className="text-sm text-gray-400">Metricas disponiveis apos salvar a campanha</p>
              </div>
            ) : (<>
              {campaignIsRunning && (
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-blue-600">Atualizando em tempo real</span>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[
                  { label: 'Alvo', value: campaign.target_count, color: 'text-gray-900' },
                  { label: 'Enviados', value: campaign.sent_count, color: 'text-blue-600' },
                  { label: 'Entregues', value: campaign.delivered_count, color: 'text-emerald-600' },
                  { label: 'Lidos', value: campaign.read_count, color: 'text-indigo-600' },
                  { label: 'Responderam', value: campaign.replied_count, color: 'text-gray-700' },
                  { label: 'Falhas', value: campaign.failed_count, color: 'text-red-500' },
                  { label: 'Interessados', value: campaign.interested_count, color: 'text-emerald-600' },
                  { label: 'Neutros', value: campaign.neutral_count, color: 'text-gray-500' },
                  { label: 'Negativos', value: campaign.negative_count, color: 'text-red-500' },
                ].map(m => (
                  <div key={m.label} className={`rounded-xl p-3 text-center transition-colors duration-500 ${campaignIsRunning && (m.value || 0) > 0 ? 'bg-gray-100' : 'bg-gray-50'}`}>
                    <p className={`text-xl font-extrabold ${m.color}`} style={{ fontVariantNumeric: 'tabular-nums' }}>{m.value || 0}</p>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{m.label}</p>
                  </div>
                ))}
              </div>
            </>)}
          </>)}
        </div>

        {/* Footer — Save is disabled when campaign is in a state the backend
            no longer accepts edits ('running', 'sending', 'completed', etc).
            Backend rule (campaignEngine.updateCampaign): só rascunho/agendada/pausada. */}
        {(() => {
          const editableStatuses = new Set(['draft', 'scheduled', 'paused'])
          const canEdit = !isEdit /* new campaign always editable */ || editableStatuses.has(liveStatus)
          const blockReason = !canEdit ? (
            liveStatus === 'running' || liveStatus === 'sending' || liveStatus === 'active'
              ? 'Pause a campanha para editar a configuração.'
              : liveStatus === 'completed' || liveStatus === 'finished'
              ? 'Campanha finalizada — reabra para editar.'
              : liveStatus === 'cancelled'
              ? 'Campanha cancelada — reabra para editar.'
              : 'Esta campanha não pode ser editada agora.'
          ) : ''
          return (
            <div className="px-4 sm:px-5 py-3 sm:py-4 border-t border-gray-100 flex items-center justify-between gap-2 shrink-0">
              <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 transition">
                Fechar
              </button>
              <div className="flex items-center gap-3">
                {!canEdit && (
                  <span className="text-[10px] text-amber-700 font-medium hidden sm:inline">{blockReason}</span>
                )}
                <button onClick={save} disabled={saving || !canEdit}
                  title={!canEdit ? blockReason : undefined}
                  className="px-6 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm">
                  {saving ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Criar Campanha'}
                </button>
              </div>
            </div>
          )
        })()}
      </div>

      <MediaPickerModal
        open={galleryPicker !== null}
        onClose={() => setGalleryPicker(null)}
        accept={galleryPicker?.mode === 'video' ? ['video'] : ['image']}
        preferSection="publicidade"
        title={
          galleryPicker?.mode === 'video'
            ? 'Vídeo da Publicidade / Galeria'
            : 'Imagem da Publicidade / Galeria'
        }
        useContext="campaign"
        contextId={campaign?.id}
        onSelect={(item: GalleryItem) => {
          if (galleryPicker?.blockId) {
            patchActionConfig(galleryPicker.blockId, {
              mediaSource: 'gallery',
              mediaUrl: item.url,
              mediaFileName: item.name || '',
              galleryUrl: item.url,
            })
          } else if (galleryPicker?.mode === 'video') {
            setVideoUrls((prev) => (prev.length < 5 ? [...prev, item.url] : prev))
          } else {
            setImageUrl(item.url)
          }
          setGalleryPicker(null)
        }}
      />
    </div>
  )
}

/* ══════════════════════════════════════════════
   ORDERS VIEW
   ══════════════════════════════════════════════ */
