import {
  Plus, Upload, Sparkles, Package, Images, Megaphone, Wand2, Brain,
} from 'lucide-react'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useProductsBridgeOptional } from '@/lib/agent/ProductsBridgeContext'
import { useCampaignsBridgeOptional } from '@/lib/agent/CampaignsBridgeContext'
import { useGalleryBridgeOptional } from '@/lib/agent/GalleryBridgeContext'
import { useProspectBridgeOptional } from '@/lib/agent/ProspectBridgeContext'
import {
  isCampaignSkill,
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
    prospectModuleOpen,
    onOpenModal,
    openCanvas,
  } = useAgentShell()

  const products = useProductsBridgeOptional()
  const campaigns = useCampaignsBridgeOptional()
  const gallery = useGalleryBridgeOptional()
  const prospect = useProspectBridgeOptional()

  const campaignContext = campaignsModuleOpen || isCampaignSkill(activeTurn?.skill)
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

  if (prospectModuleOpen && prospect?.isReady) {
    return (
      <div className="workspace-chat__action-dock">
        <AiPrimaryButton
          label="Gerar ideias com IA"
          icon={Wand2}
          onClick={() => prospect.dispatch({ type: 'open_ideas' })}
        />
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

  if (productContext && products?.isReady) {
    return (
      <div className="workspace-chat__action-dock workspace-chat__action-dock--chips-only">
        <div className="workspace-chat__action-chips">
          <ActionChip
            label="Novo produto"
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