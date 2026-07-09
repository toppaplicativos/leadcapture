import { useState, useRef, useEffect, type FormEvent } from 'react'
import { AICampaignWizardModal } from '@/components/AICampaignWizardModal'
import { SkillTrainerWizardModal } from '@/components/SkillTrainerWizardModal'
import {
  Send, Loader2, LayoutGrid, Search, MapPin, Zap as ZapIcon,
  Maximize2, Sparkles, Megaphone, ShoppingCart,
  PanelRight, X, Package, Images, Users, Building2, LayoutDashboard, Brain, Handshake,
  Phone, Settings, SquarePen, History, ChevronDown, Trash2, Pencil, Pin, Copy,
} from 'lucide-react'
import { FacebookIcon, InstagramIcon, WhatsAppIcon, type IconComponent } from '@/components/icons'
import { AgentUIRenderer } from './AgentUIRenderer'
import { ProspectModuleBlock } from './prospect/ProspectModuleBlock'
import { ProspectSearchControls } from './prospect/ProspectSearchControls'
import { InboxModuleBlock } from './inbox/InboxModuleBlock'
import { InboxComposerDock } from './inbox/InboxComposerDock'
import { ProductsModuleBlock } from './catalog/ProductsModuleBlock'
import { CampaignsModuleBlock } from './catalog/CampaignsModuleBlock'
import { GalleryModuleBlock } from './catalog/GalleryModuleBlock'
import { LeadsModuleBlock } from './leads/LeadsModuleBlock'
import { ClientsModuleBlock } from './clients/ClientsModuleBlock'
import { OrdersModuleBlock } from './orders/OrdersModuleBlock'
import { DashboardModuleBlock } from './dashboard/DashboardModuleBlock'
import { SkillsModuleBlock } from './skills/SkillsModuleBlock'
import { InstagramModuleBlock } from './instagram/InstagramModuleBlock'
import { FacebookModuleBlock } from './facebook/FacebookModuleBlock'
import { AutomationsModuleBlock } from './automations/AutomationsModuleBlock'
import { AffiliatesModuleBlock } from './affiliates/AffiliatesModuleBlock'
import { CatalogComposerDock } from './catalog/CatalogComposerDock'
import { ModuleComposerDock } from './catalog/ModuleComposerDock'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useProspectBridgeOptional } from '@/lib/agent/ProspectBridgeContext'
import { useInboxBridgeOptional } from '@/lib/agent/InboxBridgeContext'
import { WorkspaceNav } from './WorkspaceNav'
import { WorkspaceWelcome } from './WorkspaceWelcome'

import { turnNeedsCanvas, turnShowsInline } from '@/lib/agent/canvasRegistry'
import { OBJECTIVE_TRIGGERS } from '@/lib/agent/workspaceTriggers'
import {
  isCampaignSkill,
  isLeadsSkill,
  isClientsSkill,
  isOrdersSkill,
  isDashboardSkill,
  isSkillsModuleSkill,
  isInstagramSkill,
  isFacebookSkill,
  isAutomationSkill,
  isAffiliateSkill,
  isProductSkill as isCatalogProductSkill,
} from '@/lib/agent/composerAiActions'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import type { AgentChatMessage, AgentTurn, ComponentSpec } from '@/lib/agent/types'

const CATALOG_INLINE_SKILLS = new Set([
  'catalog.products',
  'catalog.products.table',
  'catalog.products.create',
  'campaigns.list',
  'campaigns.create',
  'campaigns.confirm',
  'campaign.builder',
  'gallery.open',
  'instagram.open',
  'instagram.post.create',
  'instagram.post.confirm',
  'instagram.analyze',
  'instagram.messages',
  'facebook.open',
  'facebook.post.create',
  'facebook.post.confirm',
  'facebook.analyze',
  'automation.open',
  'automation.create',
  'automation.confirm',
  'flow.builder',
  'affiliate.open',
  'affiliate.create',
  'affiliate.create.confirm',
  'affiliate.config',
  'affiliate.config.confirm',
  'affiliate.analyze',
  'affiliate.approve',
  'affiliate.payouts',
  'affiliate.payout.confirm',
  'affiliate.materials',
  'crm.leads.table',
  'crm.leads.list',
  'crm.leads.search',
  'crm.lead.find',
  'crm.lead.detail',
  'crm.clients.table',
  'crm.clients.list',
  'catalog.orders',
  'dashboard.overview',
  'skills.list',
  'lead.prospect',
])

function isProductSkill(skill?: string) {
  return isCatalogProductSkill(skill)
}

function isCatalogInlineSkill(skill?: string) {
  return !!skill && CATALOG_INLINE_SKILLS.has(skill)
}

type Shortcut = {
  id: string
  label: string
  desc?: string
  icon: IconComponent
  action: () => void
}

function filterInlineComponents(turn?: AgentTurn): ComponentSpec[] | undefined {
  if (!turn?.components?.length) return turn?.components
  if (turn.skill === 'lead.prospect') {
    return turn.components.filter((c) => c.type !== 'prospect_stats')
  }
  if (turn.skill === 'messages.inbox') {
    return turn.components.filter((c) => c.type !== 'inbox_stats')
  }
  if (isProductSkill(turn.skill)) {
    return turn.components.filter((c) => c.type !== 'products_stats')
  }
  if (isCampaignSkill(turn.skill)) {
    return turn.components.filter((c) => c.type !== 'campaigns_stats')
  }
  if (turn.skill === 'gallery.open') {
    return turn.components.filter((c) => c.type !== 'gallery_stats')
  }
  if (isInstagramSkill(turn.skill)) {
    return turn.components.filter((c) => c.type !== 'instagram_stats')
  }
  if (isFacebookSkill(turn.skill)) {
    return turn.components.filter((c) => c.type !== 'facebook_stats')
  }
  if (isAutomationSkill(turn.skill)) {
    return turn.components.filter((c) => c.type !== 'automation_stats')
  }
  if (isAffiliateSkill(turn.skill)) {
    return turn.components.filter((c) => c.type !== 'affiliate_stats')
  }
  if (isLeadsSkill(turn.skill)) {
    return turn.components.filter((c) =>
      c.type !== 'leads_stats' && c.type !== 'kpi_row' && c.type !== 'table' && c.type !== 'lead_card',
    )
  }
  if (isClientsSkill(turn.skill)) {
    return turn.components.filter((c) =>
      c.type !== 'clients_stats' && c.type !== 'kpi_row' && c.type !== 'table',
    )
  }
  if (isOrdersSkill(turn.skill)) {
    return turn.components.filter((c) =>
      c.type !== 'orders_stats' && c.type !== 'kpi_row' && c.type !== 'table',
    )
  }
  if (isDashboardSkill(turn.skill)) {
    return turn.components.filter((c) => c.type !== 'kpi_row' && c.type !== 'nav_suggestions')
  }
  if (isSkillsModuleSkill(turn.skill)) {
    return turn.components.filter((c) => c.type !== 'skill_list' && c.type !== 'nav_suggestions')
  }
  return turn.components
}

export function WorkspaceChat({
  brandName,
  brandLogoUrl,
}: {
  brandName?: string
  brandLogoUrl?: string | null
} = {}) {
  const {
    messages,
    loading,
    error,
    send,
    triggerSkill,
    triggerNav,
    handleComponentEvent,
    onNavigate,
    onOpenModal,
    registerOpenModal,
    setMobileCanvasOpen,
    desktopCanvasOpen,
    openCanvas,
    prospectModuleOpen,
    inboxModuleOpen,
    productsModuleOpen,
    campaignsModuleOpen,
    galleryModuleOpen,
    instagramModuleOpen,
    facebookModuleOpen,
    automationsModuleOpen,
    affiliatesModuleOpen,
    leadsModuleOpen,
    clientsModuleOpen,
    ordersModuleOpen,
    dashboardModuleOpen,
    skillsModuleOpen,
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
  } = useAgentShell()

  const bridge = useProspectBridgeOptional()
  const inboxBridge = useInboxBridgeOptional()
  const isDesktop = useIsDesktop()
  const [input, setInput] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [newFact, setNewFact] = useState('')
  const [copyOk, setCopyOk] = useState(false)
  const [campaignModal, setCampaignModal] = useState(false)
  const [skillModal, setSkillModal] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<HTMLDivElement>(null)

  function formatSessionDate(iso?: string | null) {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const diff = Date.now() - d.getTime()
    if (diff < 86_400_000) {
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    }
    if (diff < 172_800_000) return 'Ontem'
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  }

  function toggleHistory() {
    const next = !historyOpen
    setHistoryOpen(next)
    if (next) {
      setMemoryOpen(false)
      void loadSessions()
    }
  }

  function toggleMemory() {
    const next = !memoryOpen
    setMemoryOpen(next)
    if (next) setHistoryOpen(false)
  }

  const historyQuery = historySearch.trim()
  const useSemanticSearch = historyQuery.length >= 2

  useEffect(() => {
    if (!historyOpen) return
    if (!useSemanticSearch) return
    const timer = window.setTimeout(() => {
      void searchSessions(historyQuery)
    }, 280)
    return () => window.clearTimeout(timer)
  }, [historyOpen, historyQuery, useSemanticSearch, searchSessions])

  const filteredSessions = useSemanticSearch
    ? searchResults.map((h) => h.session)
    : sessions.filter((s) => {
      const q = historyQuery.toLowerCase()
      if (!q) return true
      const label = (s.title || 'Conversa sem título').toLowerCase()
      return label.includes(q)
    })

  const snippetBySessionId = useSemanticSearch
    ? Object.fromEntries(searchResults.map((h) => [h.session.id, h.snippet]))
    : {}

  const hasBrandMemory = brandMemory.facts.length > 0
    || Object.keys(brandMemory.preferences).length > 0
    || brandMemory.last_topics.length > 0

  function startRename(sessionId: string, currentTitle: string) {
    setRenamingId(sessionId)
    setRenameDraft(currentTitle === 'Conversa sem título' ? '' : currentTitle)
  }

  async function commitRename(sessionId: string) {
    const title = renameDraft.trim()
    if (title) await renameSession(sessionId, title)
    setRenamingId(null)
    setRenameDraft('')
  }

  async function copyConversation() {
    const lines = messages
      .filter((m) => !m.loading && m.content)
      .map((m) => `${m.role === 'user' ? 'Você' : 'Assistente'}: ${m.content}`)
    if (sessionSummary) lines.unshift(`[Resumo compactado]\n${sessionSummary}\n`)
    const text = lines.join('\n\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopyOk(true)
      setTimeout(() => setCopyOk(false), 2000)
    } catch { /* ignore */ }
  }

  async function addMemoryFact() {
    const fact = newFact.trim()
    if (!fact) return
    await updateBrandMemory({ facts: [fact, ...brandMemory.facts].slice(0, 24) })
    setNewFact('')
  }

  useEffect(() => {
    registerOpenModal((modal) => {
      if (modal === 'ai-campaign') setCampaignModal(true)
      if (modal === 'skill-trainer') setSkillModal(true)
    })
  }, [registerOpenModal])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, loading, prospectModuleOpen, inboxModuleOpen, productsModuleOpen, campaignsModuleOpen, galleryModuleOpen, instagramModuleOpen, facebookModuleOpen, automationsModuleOpen, affiliatesModuleOpen, leadsModuleOpen, clientsModuleOpen, ordersModuleOpen, dashboardModuleOpen, skillsModuleOpen])

  useEffect(() => {
    if (!menuOpen && !historyOpen && !memoryOpen) return
    function onDoc(e: MouseEvent) {
      const target = e.target as Node
      if (menuOpen && menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false)
      }
      if ((historyOpen || memoryOpen) && historyRef.current && !historyRef.current.contains(target)) {
        setHistoryOpen(false)
        setMemoryOpen(false)
        setRenamingId(null)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen, historyOpen, memoryOpen])

  const isEmpty = messages.length === 0
  const display = messages

  const callbacks = {
    onNavigate,
    onTriggerNav: triggerNav,
    onOpenModal,
    onSendMessage: send,
    onComponentEvent: handleComponentEvent,
  }

  const lastAssistant = [...display].reverse().find((m) => m.role === 'assistant' && !m.loading)
  const lastProspectMsg = [...display].reverse().find(
    (m) => m.role === 'assistant' && !m.loading && m.turn?.skill === 'lead.prospect',
  )
  const lastInboxMsg = [...display].reverse().find(
    (m) => m.role === 'assistant' && !m.loading && m.turn?.skill === 'messages.inbox',
  )
  const lastProductsMsg = [...display].reverse().find(
    (m) => m.role === 'assistant' && !m.loading && isProductSkill(m.turn?.skill),
  )
  const lastCampaignsMsg = [...display].reverse().find(
    (m) => m.role === 'assistant' && !m.loading && isCampaignSkill(m.turn?.skill),
  )
  const lastGalleryMsg = [...display].reverse().find(
    (m) => m.role === 'assistant' && !m.loading && m.turn?.skill === 'gallery.open',
  )
  const lastInstagramMsg = [...display].reverse().find(
    (m) => m.role === 'assistant' && !m.loading && isInstagramSkill(m.turn?.skill),
  )
  const lastFacebookMsg = [...display].reverse().find(
    (m) => m.role === 'assistant' && !m.loading && isFacebookSkill(m.turn?.skill),
  )
  const lastAutomationsMsg = [...display].reverse().find(
    (m) => m.role === 'assistant' && !m.loading && isAutomationSkill(m.turn?.skill),
  )
  const lastAffiliatesMsg = [...display].reverse().find(
    (m) => m.role === 'assistant' && !m.loading && isAffiliateSkill(m.turn?.skill),
  )
  const lastLeadsMsg = [...display].reverse().find(
    (m) => m.role === 'assistant' && !m.loading && isLeadsSkill(m.turn?.skill),
  )
  const lastClientsMsg = [...display].reverse().find(
    (m) => m.role === 'assistant' && !m.loading && isClientsSkill(m.turn?.skill),
  )
  const lastOrdersMsg = [...display].reverse().find(
    (m) => m.role === 'assistant' && !m.loading && isOrdersSkill(m.turn?.skill),
  )
  const lastDashboardMsg = [...display].reverse().find(
    (m) => m.role === 'assistant' && !m.loading && isDashboardSkill(m.turn?.skill),
  )
  const lastSkillsMsg = [...display].reverse().find(
    (m) => m.role === 'assistant' && !m.loading && isSkillsModuleSkill(m.turn?.skill),
  )
  const catalogModuleOpen = productsModuleOpen || campaignsModuleOpen || galleryModuleOpen || instagramModuleOpen || facebookModuleOpen || automationsModuleOpen || affiliatesModuleOpen || leadsModuleOpen || clientsModuleOpen || ordersModuleOpen || dashboardModuleOpen || skillsModuleOpen
  const showCanvasBtn = lastAssistant?.turn
    && turnNeedsCanvas(lastAssistant.turn)
    && !desktopCanvasOpen
    && lastAssistant.turn.skill !== 'lead.prospect'
    && lastAssistant.turn.skill !== 'messages.inbox'
    && lastAssistant.turn.skill !== 'lead.prospect'
    && !isCatalogInlineSkill(lastAssistant.turn.skill)

  function ensureMapDesktop() {
    if (isDesktop) openCanvas('/busca')
  }

  const shortcuts: Shortcut[] = [
    {
      id: 'prospect',
      label: 'Buscar no mapa',
      desc: 'Modo paleteiro — segmento + cidade',
      icon: Search,
      action: () => {
        setMenuOpen(false)
        triggerSkill('lead.prospect', { label: 'Prospectar no mapa', assistantMessage: 'Vamos prospectar no mapa. Qual segmento e cidade?' })
      },
    },
    {
      id: 'map',
      label: isDesktop ? 'Abrir mapa' : 'Mapa no chat',
      desc: isDesktop ? 'Canvas lateral' : 'Já embutido na conversa',
      icon: MapPin,
      action: () => {
        setMenuOpen(false)
        if (isDesktop) openCanvas('/busca')
        else triggerSkill('lead.prospect', { label: 'Prospectar no mapa' })
      },
    },
    {
      id: 'capture',
      label: 'Capturar todos',
      desc: `${bridge?.snapshot.newCount ?? 0} novos no mapa`,
      icon: ZapIcon,
      action: () => {
        setMenuOpen(false)
        ensureMapDesktop()
        bridge?.dispatch({ type: 'capture_batch' })
      },
    },
    {
      id: 'auto',
      label: bridge?.snapshot.autoCapture ? 'Auto-captura ON' : 'Auto-captura',
      desc: 'Captura ao arrastar o mapa',
      icon: ZapIcon,
      action: () => {
        setMenuOpen(false)
        bridge?.dispatch({ type: 'toggle_auto_capture' })
      },
    },
    {
      id: 'immersive',
      label: 'Tela cheia',
      desc: 'Modo imersivo do mapa',
      icon: Maximize2,
      action: () => {
        setMenuOpen(false)
        bridge?.dispatch({ type: 'set_immersive', value: true })
      },
    },
    {
      id: 'ideas',
      label: 'Gerar ideias IA',
      desc: 'Segmento e cidade sugeridos',
      icon: Sparkles,
      action: () => {
        setMenuOpen(false)
        ensureMapDesktop()
        bridge?.dispatch({ type: 'open_ideas' })
      },
    },
    {
      id: 'messages',
      label: 'Conversas',
      icon: WhatsAppIcon,
      action: () => {
        setMenuOpen(false)
        triggerNav('mensagens')
      },
    },
    {
      id: 'whatsapp',
      label: 'Conectar WhatsApp',
      desc: 'Hub de conexão — código de 8 caracteres',
      icon: WhatsAppIcon,
      action: () => {
        setMenuOpen(false)
        triggerSkill('whatsapp.connect', {
          label: 'Conectar WhatsApp',
          assistantMessage: 'Vamos vincular pelo código no seu número:',
        })
      },
    },
    {
      id: 'settings',
      label: 'Configurações',
      desc: 'Conta, marca e sessões WhatsApp',
      icon: Settings,
      action: () => {
        setMenuOpen(false)
        triggerSkill('settings.open', {
          label: 'Configurações',
          assistantMessage: 'Abrindo configurações da conta…',
        })
      },
    },
    {
      id: 'leads',
      label: 'Leads',
      desc: 'CRM e gestão',
      icon: Users,
      action: () => {
        setMenuOpen(false)
        triggerSkill('crm.leads.table', { label: 'Ver leads', assistantMessage: 'Seus leads recentes:' })
      },
    },
    {
      id: 'clients',
      label: 'Clientes',
      desc: 'Base convertida e importação',
      icon: Building2,
      action: () => {
        setMenuOpen(false)
        triggerSkill('crm.clients.table', { label: 'Ver clientes', assistantMessage: 'Sua base de clientes:' })
      },
    },
    {
      id: 'orders',
      label: 'Pedidos',
      desc: 'Vendas e expedição',
      icon: ShoppingCart,
      action: () => {
        setMenuOpen(false)
        triggerSkill('catalog.orders', { label: 'Ver pedidos', assistantMessage: 'Seus pedidos recentes:' })
      },
    },
    {
      id: 'products',
      label: 'Produtos',
      desc: 'Catálogo no chat ou canvas',
      icon: Package,
      action: () => {
        setMenuOpen(false)
        triggerSkill('catalog.products', { label: 'Produtos', assistantMessage: 'Seu catálogo:' })
      },
    },
    {
      id: 'gallery',
      label: 'Galeria',
      desc: 'Assets e upload inline',
      icon: Images,
      action: () => {
        setMenuOpen(false)
        triggerSkill('gallery.open', { label: 'Galeria', assistantMessage: 'Assets da marca:' })
      },
    },
    {
      id: 'instagram',
      label: 'Instagram',
      desc: 'Posts, DMs e métricas',
      icon: InstagramIcon,
      action: () => {
        setMenuOpen(false)
        triggerSkill('instagram.open', { label: 'Instagram', assistantMessage: 'Sua conta Instagram:' })
      },
    },
    {
      id: 'instagram-post',
      label: 'Criar post IG',
      desc: 'IA gera legenda e imagem',
      icon: InstagramIcon,
      action: () => {
        setMenuOpen(false)
        triggerSkill('instagram.post.create', { label: 'Criar post', assistantMessage: 'Sobre o que é o post?' })
      },
    },
    {
      id: 'facebook',
      label: 'Facebook',
      desc: 'Posts, mensagens e métricas',
      icon: FacebookIcon,
      action: () => {
        setMenuOpen(false)
        triggerSkill('facebook.open', { label: 'Facebook', assistantMessage: 'Sua página Facebook:' })
      },
    },
    {
      id: 'facebook-post',
      label: 'Criar post FB',
      desc: 'IA gera texto e imagem',
      icon: FacebookIcon,
      action: () => {
        setMenuOpen(false)
        triggerSkill('facebook.post.create', { label: 'Post Facebook', assistantMessage: 'Sobre o que é o post no Facebook?' })
      },
    },
    {
      id: 'automations',
      label: 'Automações',
      desc: 'Fluxos reativos e proativos',
      icon: ZapIcon,
      action: () => {
        setMenuOpen(false)
        triggerSkill('automation.open', { label: 'Automações', assistantMessage: 'Suas automações WhatsApp:' })
      },
    },
    {
      id: 'affiliates',
      label: 'Afiliados',
      desc: 'Parceiros, comissões e saques',
      icon: Handshake,
      action: () => {
        setMenuOpen(false)
        triggerSkill('affiliate.open', { label: 'Afiliados', assistantMessage: 'Seu programa de parceiros:' })
      },
    },
    {
      id: 'automation-order',
      label: 'Fluxo pedido WA',
      desc: 'Pedido completo no WhatsApp',
      icon: ZapIcon,
      action: () => {
        setMenuOpen(false)
        triggerSkill('automation.create', {
          label: 'Fluxo pedido',
          assistantMessage: 'Montando fluxo de pedidos…',
          context: { brief: 'crie um fluxo de pedidos completo para whatsapp' },
        })
      },
    },
    {
      id: 'campaigns',
      label: 'Campanhas',
      desc: 'Ver e criar campanhas',
      icon: Megaphone,
      action: () => {
        setMenuOpen(false)
        triggerNav('campanhas')
      },
    },
    {
      id: 'campaign',
      label: 'Criar campanha',
      icon: Megaphone,
      action: () => {
        setMenuOpen(false)
        triggerSkill('campaigns.create', { label: 'Criar campanha', assistantMessage: 'Vamos criar sua campanha.' })
      },
    },
    {
      id: 'dashboard',
      label: 'Painel',
      desc: 'KPIs do negócio',
      icon: LayoutDashboard,
      action: () => {
        setMenuOpen(false)
        triggerNav('dashboard')
      },
    },
    {
      id: 'skills',
      label: 'Habilidades',
      desc: 'Skills do agente IA',
      icon: Brain,
      action: () => {
        setMenuOpen(false)
        triggerNav('habilidades')
      },
    },
    {
      id: 'order',
      label: 'Fazer pedido',
      icon: ShoppingCart,
      action: () => {
        setMenuOpen(false)
        triggerSkill('order.assisted', { label: 'Fazer pedido', assistantMessage: 'Vamos montar esse pedido. Para quem é?' })
      },
    },
  ]

  function submit(e: FormEvent) {
    e.preventDefault()
    const t = input.trim()
    if (!t || loading) return
    send(t)
    setInput('')
  }

  return (
    <div className="workspace-chat">
      <div className="workspace-chat__session-wrap" ref={historyRef}>
        <div className={`workspace-chat__session-bar${sessionHydrating ? ' is-loading' : ''}`}>
          {sessionHydrating ? (
            <>
              <Loader2 size={13} className="animate-spin" aria-hidden />
              <span>Restaurando conversa…</span>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`workspace-chat__session-history${historyOpen ? ' is-open' : ''}`}
                onClick={toggleHistory}
                aria-expanded={historyOpen}
                aria-label="Ver histórico de conversas"
              >
                <History size={13} strokeWidth={2} aria-hidden />
                <span>Histórico</span>
                <ChevronDown size={12} className="workspace-chat__session-chevron" aria-hidden />
              </button>
              <button
                type="button"
                className={`workspace-chat__session-memory${memoryOpen ? ' is-open' : ''}${hasBrandMemory ? ' has-data' : ''}`}
                onClick={toggleMemory}
                aria-expanded={memoryOpen}
                aria-label="Ver memória do agente"
              >
                <Brain size={13} strokeWidth={2} aria-hidden />
                <span>Memória</span>
              </button>
              <span className="workspace-chat__session-title-wrap">
                <span className="workspace-chat__session-title" title={sessionTitle || undefined}>
                  {sessionTitle || 'Nova conversa'}
                </span>
                {sessionSummary ? (
                  <span className="workspace-chat__session-compact" title={sessionSummary}>
                    Contexto compactado
                  </span>
                ) : null}
              </span>
              {!isEmpty ? (
                <button
                  type="button"
                  className="workspace-chat__session-copy"
                  onClick={() => void copyConversation()}
                  aria-label="Copiar conversa"
                  title={copyOk ? 'Copiado!' : 'Copiar conversa'}
                >
                  <Copy size={13} strokeWidth={2} aria-hidden />
                </button>
              ) : null}
              <button
                type="button"
                className="workspace-chat__session-new"
                onClick={() => {
                  setHistoryOpen(false)
                  void startNewSession()
                }}
                disabled={loading}
                aria-label="Iniciar nova conversa"
              >
                <SquarePen size={13} strokeWidth={2} aria-hidden />
                <span>Nova</span>
              </button>
            </>
          )}
        </div>
        {historyOpen && !sessionHydrating && (
          <div className="workspace-chat__history-panel" role="listbox" aria-label="Conversas anteriores">
            <div className="workspace-chat__history-head">
              <span>Conversas anteriores</span>
              {sessionsLoading && <Loader2 size={12} className="animate-spin" aria-hidden />}
            </div>
            <div className="workspace-chat__history-search">
              <Search size={12} aria-hidden />
              <input
                type="search"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Buscar por tema, produto, lead…"
                aria-label="Buscar conversa"
              />
              {useSemanticSearch ? (
                <span className="workspace-chat__history-search-badge">IA</span>
              ) : null}
            </div>
            {sessionsLoading && sessions.length === 0 ? (
              <p className="workspace-chat__history-empty">Carregando…</p>
            ) : useSemanticSearch && searchLoading ? (
              <p className="workspace-chat__history-empty">Buscando…</p>
            ) : filteredSessions.length === 0 ? (
              <p className="workspace-chat__history-empty">
                {sessions.length === 0 ? 'Nenhuma conversa salva ainda.' : 'Nenhum resultado.'}
              </p>
            ) : (
              <ul className="workspace-chat__history-list">
                {filteredSessions.map((s) => {
                  const isActive = s.id === sessionId
                  const label = s.title?.trim() || 'Conversa sem título'
                  const when = formatSessionDate(s.last_message_at || s.updated_at || s.created_at)
                  const isRenaming = renamingId === s.id
                  return (
                    <li key={s.id} className="workspace-chat__history-row">
                      {isRenaming ? (
                        <div className="workspace-chat__history-rename">
                          <input
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void commitRename(s.id)
                              if (e.key === 'Escape') setRenamingId(null)
                            }}
                            autoFocus
                            aria-label="Novo título da conversa"
                          />
                          <button type="button" onClick={() => void commitRename(s.id)}>OK</button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            className={`workspace-chat__history-item${isActive ? ' is-active' : ''}`}
                            onClick={() => {
                              setHistoryOpen(false)
                              void switchSession(s.id)
                            }}
                          >
                            <span className="workspace-chat__history-item-title">{label}</span>
                            {snippetBySessionId[s.id] ? (
                              <span className="workspace-chat__history-item-snippet">
                                {snippetBySessionId[s.id]}
                              </span>
                            ) : null}
                            <span className="workspace-chat__history-item-meta">
                              {s.is_pinned ? 'Fixada · ' : ''}{when}
                              {isActive ? ' · Atual' : ''}
                            </span>
                          </button>
                          <div className="workspace-chat__history-actions">
                            <button
                              type="button"
                              className={`workspace-chat__history-action${s.is_pinned ? ' is-pinned' : ''}`}
                              aria-label={s.is_pinned ? 'Desafixar conversa' : 'Fixar conversa'}
                              onClick={() => void togglePinSession(s.id)}
                            >
                              <Pin size={12} />
                            </button>
                            <button
                              type="button"
                              className="workspace-chat__history-action"
                              aria-label="Renomear conversa"
                              onClick={() => startRename(s.id, label)}
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              type="button"
                              className="workspace-chat__history-action workspace-chat__history-action--danger"
                              aria-label="Excluir conversa"
                              onClick={() => void deleteSession(s.id)}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
        {memoryOpen && !sessionHydrating && (
          <div className="workspace-chat__memory-panel" aria-label="Memória do agente">
            <div className="workspace-chat__history-head">
              <span>O agente lembra</span>
              {hasBrandMemory && (
                <button
                  type="button"
                  className="workspace-chat__memory-clear"
                  onClick={() => void clearBrandMemory()}
                >
                  Limpar
                </button>
              )}
            </div>
            {sessionSummary ? (
              <section className="workspace-chat__memory-summary">
                <h4>Resumo desta conversa</h4>
                <p>{sessionSummary}</p>
              </section>
            ) : null}
            <div className="workspace-chat__memory-add">
              <input
                type="text"
                value={newFact}
                onChange={(e) => setNewFact(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void addMemoryFact() }}
                placeholder="Adicionar fato manualmente…"
                aria-label="Novo fato para memória"
              />
              <button type="button" onClick={() => void addMemoryFact()} disabled={!newFact.trim()}>
                +
              </button>
            </div>
            {!hasBrandMemory ? (
              <p className="workspace-chat__history-empty">
                Ainda sem memória da marca. Converse ou adicione fatos acima.
              </p>
            ) : (
              <div className="workspace-chat__memory-body">
                {brandMemory.facts.length > 0 && (
                  <section>
                    <h4>Fatos</h4>
                    <ul className="workspace-chat__memory-facts">
                      {brandMemory.facts.map((f) => (
                        <li key={f}>
                          <span>{f}</span>
                          <button
                            type="button"
                            aria-label="Remover fato"
                            onClick={() => void updateBrandMemory({
                              facts: brandMemory.facts.filter((x) => x !== f),
                            })}
                          >
                            <X size={11} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {Object.keys(brandMemory.preferences).length > 0 && (
                  <section>
                    <h4>Preferências</h4>
                    <ul>
                      {Object.entries(brandMemory.preferences).map(([k, v]) => (
                        <li key={k}><strong>{k}:</strong> {v}</li>
                      ))}
                    </ul>
                  </section>
                )}
                {brandMemory.last_topics.length > 0 && (
                  <section>
                    <h4>Tópicos</h4>
                    <p>{brandMemory.last_topics.join(', ')}</p>
                  </section>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {!isEmpty && (
        <div className="workspace-chat__header">
          <WorkspaceNav />
        </div>
      )}
      <div
        ref={scrollRef}
        className={`workspace-chat__scroll${isEmpty ? ' workspace-chat__scroll--empty' : ''}${sessionHydrating ? ' workspace-chat__scroll--hydrating' : ''}`}
      >
        {sessionHydrating && isEmpty ? (
          <div className="workspace-chat__hydrate-placeholder" aria-hidden>
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : null}
        {!sessionHydrating && isEmpty && (
          <WorkspaceWelcome
            brandName={brandName}
            brandLogoUrl={brandLogoUrl}
            onTrigger={triggerSkill}
          />
        )}
        {display.map((msg) => {
          const isProspectActive = prospectModuleOpen
            && msg.id === lastProspectMsg?.id
            && msg.turn?.skill === 'lead.prospect'
          const isInboxActive = inboxModuleOpen
            && msg.id === lastInboxMsg?.id
            && msg.turn?.skill === 'messages.inbox'
          const isProductsActive = productsModuleOpen
            && msg.id === lastProductsMsg?.id
            && isProductSkill(msg.turn?.skill)
          const isCampaignsActive = campaignsModuleOpen
            && msg.id === lastCampaignsMsg?.id
            && isCampaignSkill(msg.turn?.skill)
          const isGalleryActive = galleryModuleOpen
            && msg.id === lastGalleryMsg?.id
            && msg.turn?.skill === 'gallery.open'
          const isInstagramActive = instagramModuleOpen
            && msg.id === lastInstagramMsg?.id
            && isInstagramSkill(msg.turn?.skill)
          const isFacebookActive = facebookModuleOpen
            && msg.id === lastFacebookMsg?.id
            && isFacebookSkill(msg.turn?.skill)
          const isAutomationsActive = automationsModuleOpen
            && msg.id === lastAutomationsMsg?.id
            && isAutomationSkill(msg.turn?.skill)
          const isAffiliatesActive = affiliatesModuleOpen
            && msg.id === lastAffiliatesMsg?.id
            && isAffiliateSkill(msg.turn?.skill)
          const isLeadsActive = leadsModuleOpen
            && msg.id === lastLeadsMsg?.id
            && isLeadsSkill(msg.turn?.skill)
          const isClientsActive = clientsModuleOpen
            && msg.id === lastClientsMsg?.id
            && isClientsSkill(msg.turn?.skill)
          const isOrdersActive = ordersModuleOpen
            && msg.id === lastOrdersMsg?.id
            && isOrdersSkill(msg.turn?.skill)
          const isDashboardActive = dashboardModuleOpen
            && msg.id === lastDashboardMsg?.id
            && isDashboardSkill(msg.turn?.skill)
          const isSkillsActive = skillsModuleOpen
            && msg.id === lastSkillsMsg?.id
            && isSkillsModuleSkill(msg.turn?.skill)
          const inlineComponents = filterInlineComponents(msg.turn)

          return (
            <div
              key={msg.id}
              className={`workspace-chat__msg workspace-chat__msg--${msg.role}`}
            >
              {msg.role === 'assistant' ? (
                <div className="workspace-chat__bubble workspace-chat__bubble--assistant">
                  {msg.loading ? (
                    <span className="workspace-chat__thinking">
                      <Loader2 size={13} className="animate-spin" />
                      Pensando
                    </span>
                  ) : (
                    <>
                      <p className="workspace-chat__text">{msg.turn?.message || msg.content}</p>
                      {msg.turn?.skill === 'lead.prospect' && (
                        <ProspectModuleBlock messageId={msg.id} isActive={!!isProspectActive} />
                      )}
                      {msg.turn?.skill === 'messages.inbox' && (
                        <InboxModuleBlock messageId={msg.id} isActive={!!isInboxActive} />
                      )}
                      {isProductSkill(msg.turn?.skill) && (
                        <ProductsModuleBlock messageId={msg.id} isActive={!!isProductsActive} />
                      )}
                      {isCampaignSkill(msg.turn?.skill) && (
                        <CampaignsModuleBlock messageId={msg.id} isActive={!!isCampaignsActive} />
                      )}
                      {msg.turn?.skill === 'gallery.open' && (
                        <GalleryModuleBlock messageId={msg.id} isActive={!!isGalleryActive} />
                      )}
                      {isInstagramSkill(msg.turn?.skill) && (
                        <InstagramModuleBlock messageId={msg.id} isActive={!!isInstagramActive} />
                      )}
                      {isFacebookSkill(msg.turn?.skill) && (
                        <FacebookModuleBlock messageId={msg.id} isActive={!!isFacebookActive} />
                      )}
                      {isAutomationSkill(msg.turn?.skill) && (
                        <AutomationsModuleBlock messageId={msg.id} isActive={!!isAutomationsActive} />
                      )}
                      {isAffiliateSkill(msg.turn?.skill) && (
                        <AffiliatesModuleBlock messageId={msg.id} isActive={!!isAffiliatesActive} />
                      )}
                      {isLeadsSkill(msg.turn?.skill) && (
                        <LeadsModuleBlock messageId={msg.id} isActive={!!isLeadsActive} />
                      )}
                      {isClientsSkill(msg.turn?.skill) && (
                        <ClientsModuleBlock messageId={msg.id} isActive={!!isClientsActive} />
                      )}
                      {isOrdersSkill(msg.turn?.skill) && (
                        <OrdersModuleBlock messageId={msg.id} isActive={!!isOrdersActive} />
                      )}
                      {isDashboardSkill(msg.turn?.skill) && (
                        <DashboardModuleBlock messageId={msg.id} isActive={!!isDashboardActive} />
                      )}
                      {isSkillsModuleSkill(msg.turn?.skill) && (
                        <SkillsModuleBlock messageId={msg.id} isActive={!!isSkillsActive} />
                      )}
                      {msg.turn && turnShowsInline(msg.turn) && inlineComponents && inlineComponents.length > 0 && (
                        <AgentUIRenderer
                          components={inlineComponents}
                          callbacks={callbacks}
                          compact
                        />
                      )}
                      {msg.turn && turnNeedsCanvas(msg.turn) && msg.id === lastAssistant?.id && (
                        <button
                          type="button"
                          className="workspace-chat__canvas-link lg:hidden"
                          onClick={() => setMobileCanvasOpen(true)}
                        >
                          <PanelRight size={14} />
                          Abrir no canvas
                        </button>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="workspace-chat__bubble workspace-chat__bubble--user">
                  <p>{msg.content}</p>
                </div>
              )}
            </div>
          )
        })}
        {error && <p className="workspace-chat__error">{error}</p>}
      </div>

      <div className="workspace-chat__footer">
        {messages.length > 0 && messages.length < 6 && !prospectModuleOpen && !inboxModuleOpen && !catalogModuleOpen && (
          <div className="workspace-chat__objectives">
            {OBJECTIVE_TRIGGERS.map((chip) => (
              <button
                key={chip.userLabel}
                type="button"
                onClick={() => triggerSkill(chip.skill, {
                  label: chip.userLabel,
                  assistantMessage: chip.assistantMessage,
                  context: chip.context,
                })}
                className="workspace-chat__chip"
              >
                {chip.userLabel}
              </button>
            ))}
          </div>
        )}

        {prospectModuleOpen && bridge?.isReady && (
          <div className="workspace-chat__prospect-dock">
            <ProspectSearchControls compact={!isDesktop} />
          </div>
        )}

        {inboxModuleOpen && inboxBridge?.isReady && (
          <div className="workspace-chat__inbox-dock">
            <InboxComposerDock />
          </div>
        )}

        <ModuleComposerDock />
        <CatalogComposerDock />

        <form className="workspace-chat__composer" onSubmit={submit}>
        <div className="workspace-chat__composer-actions" ref={menuRef}>
          <button
            type="button"
            className={`workspace-chat__menu-btn ${menuOpen ? 'is-open' : ''}`}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Atalhos"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={16} /> : <LayoutGrid size={16} />}
          </button>

          {menuOpen && (
            <div className="workspace-chat__shortcuts" role="menu">
              <p className="workspace-chat__shortcuts-title">Atalhos</p>
              {shortcuts.map((s) => {
                const Icon = s.icon
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="menuitem"
                    className="workspace-chat__shortcut"
                    onClick={s.action}
                  >
                    <span className="workspace-chat__shortcut-icon">
                      <Icon size={14} strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0">
                      <span className="workspace-chat__shortcut-label">{s.label}</span>
                      {s.desc && <span className="workspace-chat__shortcut-desc">{s.desc}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {showCanvasBtn && (
          <button
            type="button"
            className="workspace-chat__canvas-btn lg:hidden"
            onClick={() => setMobileCanvasOpen(true)}
            aria-label="Ver canvas"
          >
            <PanelRight size={16} />
          </button>
        )}

        <div className="workspace-chat__input-wrap">
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
            placeholder="Ex: buscar pizzarias em Fortaleza"
            disabled={loading}
            className="workspace-chat__input"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="workspace-chat__send"
            aria-label="Enviar"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
        </form>
      </div>

      <AICampaignWizardModal
        open={campaignModal}
        onClose={() => setCampaignModal(false)}
        onCampaignCreated={(id) => {
          setCampaignModal(false)
          onNavigate(`/campanhas?review=${id}`)
        }}
      />

      <SkillTrainerWizardModal
        open={skillModal}
        onClose={() => setSkillModal(false)}
        onSkillCreated={() => {
          setSkillModal(false)
          send('Mostrar minhas habilidades')
        }}
      />
    </div>
  )
}