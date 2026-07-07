import { useState, useRef, useEffect, type FormEvent } from 'react'
import { AICampaignWizardModal } from '@/components/AICampaignWizardModal'
import { SkillTrainerWizardModal } from '@/components/SkillTrainerWizardModal'
import {
  Send, Loader2, LayoutGrid, Search, MapPin, Zap,
  Maximize2, Sparkles, MessageSquare, Megaphone, ShoppingCart,
  PanelRight, X, Package, Images,
} from 'lucide-react'
import { AgentUIRenderer } from './AgentUIRenderer'
import { ProspectModuleBlock } from './prospect/ProspectModuleBlock'
import { ProspectSearchControls } from './prospect/ProspectSearchControls'
import { InboxModuleBlock } from './inbox/InboxModuleBlock'
import { InboxComposerDock } from './inbox/InboxComposerDock'
import { ProductsModuleBlock } from './catalog/ProductsModuleBlock'
import { CampaignsModuleBlock } from './catalog/CampaignsModuleBlock'
import { GalleryModuleBlock } from './catalog/GalleryModuleBlock'
import { CatalogComposerDock } from './catalog/CatalogComposerDock'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useProspectBridgeOptional } from '@/lib/agent/ProspectBridgeContext'
import { useInboxBridgeOptional } from '@/lib/agent/InboxBridgeContext'
import { WorkspaceNav } from './WorkspaceNav'
import { WorkspaceWelcome } from './WorkspaceWelcome'
import { WhatsAppConnectDock } from './WhatsAppConnectDock'
import { turnNeedsCanvas, turnShowsInline } from '@/lib/agent/canvasRegistry'
import { OBJECTIVE_TRIGGERS } from '@/lib/agent/workspaceTriggers'
import { isCampaignSkill, isProductSkill as isCatalogProductSkill } from '@/lib/agent/composerAiActions'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import type { AgentChatMessage, AgentTurn, ComponentSpec } from '@/lib/agent/types'

const STORAGE_KEY = 'leadcapture:workspace-chat:v1'

const CATALOG_INLINE_SKILLS = new Set([
  'catalog.products',
  'catalog.products.table',
  'campaigns.list',
  'campaigns.create',
  'campaigns.confirm',
  'campaign.builder',
  'gallery.open',
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
  icon: typeof Search
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
  return turn.components
}

export function WorkspaceChat({ brandName }: { brandName?: string } = {}) {
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
  } = useAgentShell()

  const bridge = useProspectBridgeOptional()
  const inboxBridge = useInboxBridgeOptional()
  const isDesktop = useIsDesktop()
  const [input, setInput] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [campaignModal, setCampaignModal] = useState(false)
  const [skillModal, setSkillModal] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    registerOpenModal((modal) => {
      if (modal === 'ai-campaign') setCampaignModal(true)
      if (modal === 'skill-trainer') setSkillModal(true)
    })
  }, [registerOpenModal])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)))
    } catch { /* ignore */ }
  }, [messages])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, loading, prospectModuleOpen, inboxModuleOpen, productsModuleOpen, campaignsModuleOpen, galleryModuleOpen])

  useEffect(() => {
    if (!menuOpen) return
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

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
  const catalogModuleOpen = productsModuleOpen || campaignsModuleOpen || galleryModuleOpen
  const showCanvasBtn = lastAssistant?.turn
    && turnNeedsCanvas(lastAssistant.turn)
    && !desktopCanvasOpen
    && lastAssistant.turn.skill !== 'lead.prospect'
    && lastAssistant.turn.skill !== 'messages.inbox'
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
      icon: Zap,
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
      icon: Zap,
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
      icon: MessageSquare,
      action: () => {
        setMenuOpen(false)
        triggerNav('mensagens')
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
      <div className="workspace-chat__header">
        <WorkspaceNav />
      </div>
      <div ref={scrollRef} className="workspace-chat__scroll">
        {isEmpty && (
          <WorkspaceWelcome brandName={brandName} onTrigger={triggerSkill} />
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

        <CatalogComposerDock />

        {!prospectModuleOpen && !inboxModuleOpen && !catalogModuleOpen && (
          <WhatsAppConnectDock />
        )}

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