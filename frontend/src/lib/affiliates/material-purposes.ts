export type MaterialCaptionPurpose =
  | 'instagram_feed'
  | 'instagram_story'
  | 'instagram_reels'
  | 'whatsapp_status'
  | 'whatsapp_broadcast'

export const MATERIAL_CAPTION_PURPOSES: Array<{
  id: MaterialCaptionPurpose
  label: string
  hint: string
}> = [
  {
    id: 'instagram_feed',
    label: 'Post no feed',
    hint: 'Legenda completa com CTA e hashtags',
  },
  {
    id: 'instagram_story',
    label: 'Stories',
    hint: 'Texto curto e direto',
  },
  {
    id: 'instagram_reels',
    label: 'Reels',
    hint: 'Gancho + CTA para comentar ou clicar',
  },
  {
    id: 'whatsapp_status',
    label: 'Status WhatsApp',
    hint: 'Mensagem informal com cupom e link',
  },
  {
    id: 'whatsapp_broadcast',
    label: 'Lista / transmissão',
    hint: 'Convite para grupo com benefício claro',
  },
]