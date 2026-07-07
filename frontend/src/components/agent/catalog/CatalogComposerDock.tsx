import {
  Plus, Upload, Sparkles, Package, Images, Megaphone, Wand2, Brain, Users, ShieldCheck, Zap, MapPin,
} from 'lucide-react'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useProductsBridgeOptional } from '@/lib/agent/ProductsBridgeContext'
import { useCampaignsBridgeOptional } from '@/lib/agent/CampaignsBridgeContext'
import { useGalleryBridgeOptional } from '@/lib/agent/GalleryBridgeContext'
import { useProspectBridgeOptional } from '@/lib/agent/ProspectBridgeContext'
import { useLeadsBridgeOptional } from '@/lib/agent/LeadsBridgeContext'
import {
  isCampaignSkill,
  isLeadsSkill,
  isProductSkill,
  isCreativeSkill,
  isSkillTrainerSkill,
} from '@/lib/agent/composerAiActions'

function AiPrimaryButton({
  label,
  onClick,
  icon: Icon = Sparkles,
}: {
  label: string
  onClick: () => void
  icon?: typeof Sparkles
}) {
  return (
    <button
      type="button"
      className="workspace-chat__ai-btn ai-shimmer"
      onClick={onClick}
    >
      <Icon size={15} strokeWidth={2.25} className="relative z-10 shrink-0" />
      <span className="relative z-10">{label}</span>
    </button>
  )
}

function ActionChip({
  label,
  icon: Icon,
  onClick,
}: {
  label: string
  icon: typeof Package
  onClick: () => void
}) {
  return (
    <button type="button" className="workspace-chat__catalog-chip" onClick={onClick}>
      <Icon size={13} /> {label}
    </button>
  )
}

export function CatalogComposerDock() {
  const {
    activeTurn,
    productsModuleOpen,
    campaignsModuleOpen,
    galleryModuleOpen,
    leadsModuleOpen,
    prospectModuleOpen,
    onOpenModal,
    openCanvas,
    triggerSkill,
  } = useAgentShell()

  const products = useProductsBridgeOptional()
  const campaigns = useCampaignsBridgeOptional()
  const gallery = useGalleryBridgeOptional()
  const prospect = useProspectBridgeOptional()
  const leads = useLeadsBridgeOptional()

  const campaignContext = campaignsModuleOpen || isCampaignSkill(activeTurn?.skill)
  const leadsContext = leadsModuleOpen || isLeadsSkill(activeTurn?.skill)
  const productContext = productsModuleOpen || isProductSkill(activeTurn?.skill)
  const galleryContext = galleryModuleOpen || activeTurn?.skill === 'gallery.open'
  const creativeContext = isCreativeSkill(activeTurn?.skill)
  const skillTrainerContext = isSkillTrainerSkill(activeTurn?.skill)

  if (campaignContext) {
    const openAi = () => {
      if (campaigns?.isReady) campaigns.dispatch({ type: 'open_ai_wizard' })
      else onOpenModal('ai-campaign')
    }

    return (
      <div className="workspace-chat__action-dock">
        <AiPrimaryButton label="Gerar campanha com IA" onClick={openAi} />
        <div className="workspace-chat__action-chips">
          {campaigns?.isReady && (
            <>
              <ActionChip
                label="Nova campanha"
                icon={Plus}
                onClick={() => campaigns.dispatch({ type: 'create_new' })}
              />
              <ActionChip
                label="Gerenciar"
                icon={Megaphone}
                onClick={() => {
                  campaigns.setModuleExpanded(true)
                  campaigns.dispatch({ type: 'open_full' })
                }}
              />
            </>
          )}
        </div>
      </div>
    )
  }

  if (leadsContext) {
    const openImport = () => {
      if (leads?.isReady) leads.dispatch({ type: 'open_import' })
      else openCanvas('/leads')
    }

    return (
      <div className="workspace-chat__action-dock">
        <AiPrimaryButton label="Importar leads com IA" onClick={openImport} />
        <div className="workspace-chat__action-chips">
          {leads?.isReady && (
            <>
              <ActionChip
                label="Gerenciar"
                icon={Users}
                onClick={() => {
                  leads.setModuleExpanded(true)
                  leads.dispatch({ type: 'open_full' })
                }}
              />
              <ActionChip
                label="Validar WA"
                icon={ShieldCheck}
                onClick={() => leads.dispatch({ type: 'validate_whatsapp' })}
              />
            </>
          )}
        </div>
      </div>
    )
  }

  if (prospectModuleOpen && prospect?.isReady) {
    return (
      <div className="workspace-chat__action-dock">
        <AiPrimaryButton
          label="Gerar ideias com IA"
          icon={Wand2}
          onClick={() => prospect.dispatch({ type: 'open_ideas' })}
        />
        <div className="workspace-chat__action-chips">
          <ActionChip
            label="Captar todos"
            icon={Zap}
            onClick={() => prospect.dispatch({ type: 'capture_batch' })}
          />
          <ActionChip
            label="Mapa"
            icon={MapPin}
            onClick={() => openCanvas('/busca')}
          />
          <ActionChip
            label="Ver leads"
            icon={Users}
            onClick={() => {
              triggerSkill('crm.leads.table', {
                label: 'Ver leads',
                assistantMessage: 'Seus leads recentes:',
                context: { status: 'new' },
              })
            }}
          />
        </div>
      </div>
    )
  }

  if (creativeContext) {
    return (
      <div className="workspace-chat__action-dock">
        <AiPrimaryButton
          label="Criar criativo com IA"
          icon={Wand2}
          onClick={() => openCanvas('/criativos')}
        />
      </div>
    )
  }

  if (skillTrainerContext) {
    return (
      <div className="workspace-chat__action-dock">
        <AiPrimaryButton
          label="Criar habilidade com IA"
          icon={Brain}
          onClick={() => onOpenModal('skill-trainer')}
        />
      </div>
    )
  }

  if (productContext) {
    const startCreateFlow = () => {
      triggerSkill('catalog.products.create', {
        label: 'Criar produto',
        assistantMessage: 'Vamos criar um produto. Preencha o formulário:',
      })
    }

    return (
      <div className="workspace-chat__action-dock">
        <AiPrimaryButton label="Criar produto com IA" onClick={startCreateFlow} />
        <div className="workspace-chat__action-chips">
          {products?.isReady && (
            <>
              <ActionChip
                label="Novo"
                icon={Plus}
                onClick={() => products.dispatch({ type: 'create_new' })}
              />
              <ActionChip
                label="Gerenciar"
                icon={Package}
                onClick={() => {
                  products.setModuleExpanded(true)
                  products.dispatch({ type: 'open_full' })
                }}
              />
            </>
          )}
        </div>
      </div>
    )
  }

  if (galleryContext && gallery?.isReady) {
    return (
      <div className="workspace-chat__action-dock workspace-chat__action-dock--chips-only">
        <div className="workspace-chat__action-chips">
          <ActionChip
            label="Enviar mídia"
            icon={Upload}
            onClick={() => gallery.dispatch({ type: 'open_upload' })}
          />
          <ActionChip
            label="Gerenciar"
            icon={Images}
            onClick={() => {
              gallery.setModuleExpanded(true)
              gallery.dispatch({ type: 'open_full' })
            }}
          />
        </div>
      </div>
    )
  }

  return null
}