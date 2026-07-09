import { AffiliateShareStudio } from '@/pages/affiliate/AffiliateShareStudio'
import type { ShareDestinationId } from '@/lib/affiliates/share-destinations'
import type { AppContext } from '@/pages/affiliate/types'

type Material = {
  id: string
  title: string
  type?: string
  media_url?: string | null
  category?: string | null
  channel?: string | null
}

type Props = {
  material: Material
  ctx: AppContext
  onClose: () => void
}

function destinationFromMaterial(material: Material): ShareDestinationId {
  const cat = String(material.category || '').toLowerCase()
  const ch = String(material.channel || '').toLowerCase()
  if (cat === 'story' || cat === 'stories') return 'instagram_story'
  if (cat === 'reels') return 'instagram_reels'
  if (ch === 'whatsapp') return 'whatsapp_status'
  if (cat === 'banner') return 'instagram_feed'
  return 'instagram_feed'
}

export function AffiliateMaterialStudio({ material, ctx, onClose }: Props) {
  return (
    <AffiliateShareStudio
      ctx={ctx}
      kit="material"
      material={{
        id: material.id,
        title: material.title,
        media_url: material.media_url,
        type: material.type,
      }}
      title={material.title}
      initialDestination={destinationFromMaterial(material)}
      onClose={onClose}
    />
  )
}