/**
 * Perfis de entrada do Clube no catálogo (espelha backend clubMemberTypes).
 */

export type ClubMemberTypeCode =
  | 'comerciante'
  | 'distribuidor'
  | 'casa'
  | 'supermercado'

export type ClubMemberTypeDef = {
  code: ClubMemberTypeCode
  label: string
  short: string
  description: string
  needsBusiness: boolean
  businessNameLabel: string
  segmentLabel: string
  segments: string[]
  aliases: string[]
  accent: string
  accentSoft: string
}

export const CLUB_MEMBER_TYPES: ClubMemberTypeDef[] = [
  {
    code: 'comerciante',
    label: 'Comerciante',
    short: 'Restaurantes e afins',
    description:
      'Restaurantes, pizzarias, marmitarias, bares, hotéis e cozinhas que produzem para servir.',
    needsBusiness: true,
    businessNameLabel: 'Nome do estabelecimento',
    segmentLabel: 'Tipo de operação',
    segments: [
      'Restaurante',
      'Pizzaria',
      'Marmitaria',
      'Hamburgueria',
      'Buffet / eventos',
      'Padaria / confeitaria',
      'Dark kitchen',
      'Bar / lanchonete',
      'Hotel / pousada',
      'Outro foodservice',
    ],
    aliases: [
      'comerciante',
      'restaurante',
      'restaurantes',
      'foodservice',
      'restaurant',
      'hotel',
    ],
    accent: '#5c1d78',
    accentSoft: '#faf5fc',
  },
  {
    code: 'distribuidor',
    label: 'Distribuidor',
    short: 'Atacado e revenda',
    description:
      'Distribuidores, atacadistas, Ceasa e empresas que revendem produtos de alho.',
    needsBusiness: true,
    businessNameLabel: 'Nome da empresa',
    segmentLabel: 'Tipo de operação',
    segments: [
      'Distribuidor regional',
      'Atacadista',
      'Ceasa / entreposto',
      'Revenda B2B',
      'Representante',
      'Outro canal de distribuição',
    ],
    aliases: ['distribuidor', 'distribuidores', 'ceasa', 'atacado', 'atacadista', 'revenda'],
    accent: '#0f766e',
    accentSoft: '#f0fdfa',
  },
  {
    code: 'casa',
    label: 'Casa / Consumo',
    short: 'Consumidor final',
    description: 'Compra para uso em casa ou consumo pessoal — benefícios do clube no checkout.',
    needsBusiness: false,
    businessNameLabel: '',
    segmentLabel: '',
    segments: [],
    aliases: ['casa', 'consumo', 'cliente', 'consumidor', 'consumer', 'customer'],
    accent: '#111827',
    accentSoft: '#f9fafb',
  },
  {
    code: 'supermercado',
    label: 'Supermercados',
    short: 'Varejo e mercearias',
    description: 'Supermercados, mercearias, minimercados e redes de varejo alimentar.',
    needsBusiness: true,
    businessNameLabel: 'Nome da loja ou rede',
    segmentLabel: 'Formato',
    segments: [
      'Supermercado',
      'Hipermercado',
      'Minimercado',
      'Mercearia',
      'Rede / multi-lojas',
      'Atacarejo',
      'Outro varejo',
    ],
    aliases: ['supermercado', 'supermercados', 'mercearia', 'varejo', 'minimercado'],
    accent: '#1d4ed8',
    accentSoft: '#eff6ff',
  },
]

const byCode = new Map(CLUB_MEMBER_TYPES.map((t) => [t.code, t]))

export function normalizeClubMemberType(raw: unknown): ClubMemberTypeCode {
  const t = String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-/g, '_')

  if (!t) return 'casa'

  for (const def of CLUB_MEMBER_TYPES) {
    if (def.code === t) return def.code
    for (const a of def.aliases) {
      const aa = a
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_-]/g, '')
        .replace(/-/g, '_')
      if (aa === t) return def.code
    }
  }

  if (/restaur|pizza|marmit|hambur|food|cozinh|comerci|hotel/.test(t)) return 'comerciante'
  if (/distrib|atacad|ceasa|revend/.test(t)) return 'distribuidor'
  if (/super|mercear|varejo|minimerc/.test(t)) return 'supermercado'
  if (/casa|consum|cliente|final/.test(t)) return 'casa'

  return 'casa'
}

export function getClubMemberTypeDef(code: string | null | undefined): ClubMemberTypeDef {
  return byCode.get(normalizeClubMemberType(code)) || byCode.get('casa')!
}

export function clubMemberNeedsBusiness(code: string | null | undefined): boolean {
  return getClubMemberTypeDef(code).needsBusiness
}

export const WEEKLY_KG_OPTIONS = [
  'Até 5 kg',
  'De 6 a 10 kg',
  'De 11 a 20 kg',
  'De 21 a 50 kg',
  'Mais de 50 kg',
] as const

export const PRODUCT_INTEREST_OPTIONS = [
  'Pacote de 1 kg',
  'Bandeja / porções menores',
  'Pasta de alho',
  'Mix / vários formatos',
  'Ainda não sei — quero orientação',
] as const
