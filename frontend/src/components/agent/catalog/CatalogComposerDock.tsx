import { Plus, Upload, Sparkles, Package } from 'lucide-react'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useProductsBridgeOptional } from '@/lib/agent/ProductsBridgeContext'
import { useCampaignsBridgeOptional } from '@/lib/agent/CampaignsBridgeContext'
import { useGalleryBridgeOptional } from '@/lib/agent/GalleryBridgeContext'

export function CatalogComposerDock() {
  const { productsModuleOpen, campaignsModuleOpen, galleryModuleOpen } = useAgentShell()
  const products = useProductsBridgeOptional()
  const campaigns = useCampaignsBridgeOptional()
  const gallery = useGalleryBridgeOptional()

  if (productsModuleOpen && products?.isReady) {
    return (
      <div className="workspace-chat__catalog-dock">
        <button type="button" className="workspace-chat__catalog-chip" onClick={() => products.dispatch({ type: 'create_new' })}>
          <Plus size={13} /> Novo produto
        </button>
        <button
          type="button"
          className="workspace-chat__catalog-chip"
          onClick={() => {
            products.setModuleExpanded(true)
            products.dispatch({ type: 'open_full' })
          }}
        >
          <Package size={13} /> Ver produtos
        </button>
      </div>
    )
  }

  if (campaignsModuleOpen && campaigns?.isReady) {
    return (
      <div className="workspace-chat__catalog-dock">
        <button type="button" className="workspace-chat__catalog-chip" onClick={() => campaigns.dispatch({ type: 'open_ai_wizard' })}>
          <Sparkles size={13} /> Campanha IA
        </button>
        <button
          type="button"
          className="workspace-chat__catalog-chip"
          onClick={() => {
            campaigns.setModuleExpanded(true)
            campaigns.dispatch({ type: 'open_full' })
          }}
        >
          <Plus size={13} /> Ver todas
        </button>
      </div>
    )
  }

  if (galleryModuleOpen && gallery?.isReady) {
    return (
      <div className="workspace-chat__catalog-dock">
        <button type="button" className="workspace-chat__catalog-chip" onClick={() => gallery.dispatch({ type: 'open_upload' })}>
          <Upload size={13} /> Enviar mídia
        </button>
        <button
          type="button"
          className="workspace-chat__catalog-chip"
          onClick={() => {
            gallery.setModuleExpanded(true)
            gallery.dispatch({ type: 'open_full' })
          }}
        >
          Ver todos
        </button>
      </div>
    )
  }

  return null
}