import {
  Handshake, Plus, Wallet, Settings, Users, RefreshCw, CheckCircle2,
  Zap, GitBranch, BarChart3, Image, DollarSign,
} from 'lucide-react'
import { FacebookIcon, InstagramIcon } from '@/components/icons'
import type { IconComponent } from '@/components/icons'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useAffiliatesBridgeOptional } from '@/lib/agent/AffiliatesBridgeContext'
import { useInstagramBridgeOptional } from '@/lib/agent/InstagramBridgeContext'
import { useFacebookBridgeOptional } from '@/lib/agent/FacebookBridgeContext'
import { useAutomationsBridgeOptional } from '@/lib/agent/AutomationsBridgeContext'
import {
  isAffiliateSkill,
  isInstagramSkill,
  isFacebookSkill,
  isAutomationSkill,
} from '@/lib/agent/composerAiActions'

function AiPrimaryButton({
  label,
  onClick,
  icon: Icon,
}: {
  label: string
  onClick: () => void
  icon?: IconComponent
}) {
  const Ico = Icon || Handshake
  return (
    <button type="button" className="workspace-chat__ai-btn ai-shimmer" onClick={onClick}>
      <Ico size={15} strokeWidth={2.25} className="relative z-10 shrink-0" />
      <span className="relative z-10">{label}</span>
    </button>
  )
}

function ActionChip({
  label,
  icon: Icon,
  onClick,
  accent = false,
}: {
  label: string
  icon: IconComponent
  onClick: () => void
  accent?: boolean
}) {
  return (
    <button
      type="button"
      className={`workspace-chat__catalog-chip${accent ? ' workspace-chat__catalog-chip--accent' : ''}`}
      onClick={onClick}
    >
      <Icon size={13} /> {label}
    </button>
  )
}

export function ModuleComposerDock() {
  const {
    activeTurn,
    affiliatesModuleOpen,
    instagramModuleOpen,
    facebookModuleOpen,
    automationsModuleOpen,
    triggerSkill,
  } = useAgentShell()

  const affiliates = useAffiliatesBridgeOptional()
  const instagram = useInstagramBridgeOptional()
  const facebook = useFacebookBridgeOptional()
  const automations = useAutomationsBridgeOptional()

  const affiliatesContext = affiliatesModuleOpen || isAffiliateSkill(activeTurn?.skill)
  const instagramContext = instagramModuleOpen || isInstagramSkill(activeTurn?.skill)
  const facebookContext = facebookModuleOpen || isFacebookSkill(activeTurn?.skill)
  const automationsContext = automationsModuleOpen || isAutomationSkill(activeTurn?.skill)

  if (affiliatesContext && affiliates) {
    const snap = affiliates.snapshot
    const pendingPartners = snap?.affiliatesPending ?? 0
    const pendingPayouts = snap?.payoutsRequested ?? 0
    const pendingCommissions = snap?.commissionsPendingCount ?? 0

    const runAffiliate = (cmd: Parameters<typeof affiliates.dispatch>[0]) => {
      affiliates.setModuleExpanded(true)
      affiliates.dispatch(cmd)
    }

    return (
      <div className="workspace-chat__action-dock">
        <AiPrimaryButton
          label="Cadastrar parceiro com IA"
          icon={Handshake}
          onClick={() => triggerSkill('affiliate.create', {
            label: 'Novo afiliado',
            assistantMessage: 'Vamos cadastrar um parceiro. Preencha os dados:',
          })}
        />
        <div className="workspace-chat__action-chips">
          <ActionChip
            label="Gerenciar"
            icon={Handshake}
            onClick={() => runAffiliate({ type: 'open_full' })}
          />
          <ActionChip
            label="Parceiros"
            icon={Users}
            onClick={() => runAffiliate({ type: 'open_tab', tab: 'partners' })}
          />
          <ActionChip
            label={pendingCommissions > 0 ? `Comissões (${pendingCommissions})` : 'Comissões'}
            icon={DollarSign}
            accent={pendingCommissions > 0}
            onClick={() => runAffiliate({ type: 'open_tab', tab: 'commissions' })}
          />
          <ActionChip
            label={pendingPayouts > 0 ? `Saques (${pendingPayouts})` : 'Saques'}
            icon={Wallet}
            accent={pendingPayouts > 0}
            onClick={() => runAffiliate({ type: 'open_tab', tab: 'payouts' })}
          />
          {pendingPartners > 0 && (
            <ActionChip
              label={`Aprovar (${pendingPartners})`}
              icon={CheckCircle2}
              accent
              onClick={() => triggerSkill('affiliate.approve', {
                label: 'Aprovar pendentes',
                assistantMessage: 'Afiliados e comissões aguardando:',
              })}
            />
          )}
          <ActionChip
            label="Materiais"
            icon={Image}
            onClick={() => runAffiliate({ type: 'open_tab', tab: 'materials' })}
          />
          <ActionChip
            label="Métricas"
            icon={BarChart3}
            onClick={() => triggerSkill('affiliate.analyze', {
              label: 'Métricas afiliados',
              assistantMessage: 'Resumo do programa de parceiros:',
            })}
          />
          <ActionChip
            label="Config"
            icon={Settings}
            onClick={() => runAffiliate({ type: 'open_settings' })}
          />
          <ActionChip
            label="Atualizar"
            icon={RefreshCw}
            onClick={() => runAffiliate({ type: 'refresh' })}
          />
        </div>
      </div>
    )
  }

  if (instagramContext) {
    return (
      <div className="workspace-chat__action-dock">
        <AiPrimaryButton
          label="Criar post com IA"
          icon={InstagramIcon}
          onClick={() => triggerSkill('instagram.post.create', {
            label: 'Criar post',
            assistantMessage: 'Sobre o que é o post?',
          })}
        />
        <div className="workspace-chat__action-chips">
          {instagram?.isReady && (
            <>
              <ActionChip
                label="Studio"
                icon={InstagramIcon}
                onClick={() => {
                  instagram.setModuleExpanded(true)
                  instagram.dispatch({ type: 'open_full' })
                }}
              />
              <ActionChip
                label="Criar post"
                icon={Plus}
                onClick={() => instagram.dispatch({ type: 'set_tab', tab: 'create' })}
              />
              <ActionChip
                label="Métricas"
                icon={BarChart3}
                onClick={() => triggerSkill('instagram.analyze', {
                  label: 'Métricas IG',
                  assistantMessage: 'Analisando sua conta Instagram:',
                })}
              />
            </>
          )}
        </div>
      </div>
    )
  }

  if (facebookContext) {
    return (
      <div className="workspace-chat__action-dock">
        <AiPrimaryButton
          label="Criar post Facebook com IA"
          icon={FacebookIcon}
          onClick={() => triggerSkill('facebook.post.create', {
            label: 'Post Facebook',
            assistantMessage: 'Sobre o que é o post no Facebook?',
          })}
        />
        <div className="workspace-chat__action-chips">
          {facebook?.isReady && (
            <>
              <ActionChip
                label="Studio"
                icon={FacebookIcon}
                onClick={() => {
                  facebook.setModuleExpanded(true)
                  facebook.dispatch({ type: 'open_full' })
                }}
              />
              <ActionChip
                label="Criar post"
                icon={Plus}
                onClick={() => facebook.dispatch({ type: 'set_tab', tab: 'create' })}
              />
              <ActionChip
                label="Métricas"
                icon={BarChart3}
                onClick={() => triggerSkill('facebook.analyze', {
                  label: 'Métricas FB',
                  assistantMessage: 'Analisando sua página Facebook:',
                })}
              />
            </>
          )}
        </div>
      </div>
    )
  }

  if (automationsContext) {
    return (
      <div className="workspace-chat__action-dock">
        <AiPrimaryButton
          label="Criar automação com IA"
          icon={Zap}
          onClick={() => triggerSkill('automation.create', {
            label: 'Criar automação',
            assistantMessage: 'Descreva o comportamento que você quer automatizar:',
          })}
        />
        <div className="workspace-chat__action-chips">
          {automations && (
            <>
              <ActionChip
                label="Hub"
                icon={Zap}
                onClick={() => {
                  automations.setModuleExpanded(true)
                  automations.dispatch({ type: 'open_full' })
                }}
              />
              <ActionChip
                label="Editor"
                icon={GitBranch}
                onClick={() => {
                  automations.setModuleExpanded(true)
                  automations.dispatch({ type: 'open_flows' })
                }}
              />
              <ActionChip
                label="Pedido WA"
                icon={Zap}
                onClick={() => triggerSkill('automation.create', {
                  label: 'Pedido WhatsApp',
                  assistantMessage: 'Montando fluxo de pedidos…',
                  context: { brief: 'fluxo de pedidos completo para whatsapp' },
                })}
              />
              <ActionChip
                label="Atualizar"
                icon={RefreshCw}
                onClick={() => automations.dispatch({ type: 'refresh' })}
              />
            </>
          )}
        </div>
      </div>
    )
  }

  return null
}