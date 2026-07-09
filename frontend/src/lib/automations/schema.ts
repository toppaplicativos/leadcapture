/** Tipos de automações compostas — espelho do Tattoo AI adaptado ao leadcapture */

export type Frequencia = 'diario' | 'semanal' | 'mensal' | 'uma_vez' | 'intervalo'
export type Plataforma = 'instagram' | 'whatsapp' | 'email' | 'leads'
export type AutomationStatus = 'rascunho' | 'live' | 'pausado' | 'erro'

export interface Horario {
  hora: number
  minuto: number
}

export interface TriggerAgendamento {
  tipo: 'agendamento'
  frequencia: Frequencia
  horarios?: Horario[]
  diasSemana?: number[]
  diasMes?: number[]
  dataHoraUnica?: string
  intervaloMinutos?: number
  cron: string
  timezone?: string
}

export interface TriggerEvento {
  tipo: 'evento'
  plataforma: Plataforma
  evento: string
  palavrasChave?: string[]
  postId?: string
  grupoId?: string
}

export type AutomationTrigger = TriggerAgendamento | TriggerEvento

export type TipoAcao =
  | 'enviar_dm_wa'
  | 'enviar_dm_ig'
  | 'comentar_ig'
  | 'publicar_conteudo'
  | 'enviar_email'
  | 'notificar_equipe'

export type MensagemStepTipo =
  | 'texto'
  | 'imagem'
  | 'video'
  | 'audio'
  | 'documento'
  | 'link'
  | 'cta'
  | 'botoes'
  | 'lista'

export type MensagemStepSource = 'url' | 'gallery' | 'upload'

export interface MensagemStepButton {
  id: string
  label: string
}

export interface MensagemStepListRow {
  id: string
  title: string
  description?: string
}

export interface MensagemStepListSection {
  title: string
  rows: MensagemStepListRow[]
}

export interface MensagemStep {
  id: string
  tipo: MensagemStepTipo
  source?: MensagemStepSource
  url?: string
  assetId?: string
  fileName?: string
  caption?: string
  iaEnabled?: boolean
  iaPrompt?: string
  delaySegundos?: number
  ctaLabel?: string
  buttons?: MensagemStepButton[]
  listButtonText?: string
  listSections?: MensagemStepListSection[]
}

export interface ContentPublishingConfig {
  format?: 'single_image' | 'carousel' | 'story' | 'reel'
  approvalMode?: 'auto_publish' | 'manual_review'
  captionOverride?: string
  galleryFolder?: string
}

export interface AcaoConfig {
  mensagem?: string
  iaGenerated?: boolean
  iaPrompt?: string
  delaySegundos?: number
  mensagemSteps?: MensagemStep[]
  emailDestino?: string
  emailSubject?: string
  emailBody?: string
  contentPublishing?: ContentPublishingConfig
  midia?: { tipo: 'imagem' | 'video'; url: string }
}

export interface AcaoPipeline {
  ordem: number
  tipo: TipoAcao
  config: AcaoConfig
}

export const MENSAGEM_STEP_LABELS: Record<MensagemStepTipo, string> = {
  texto: 'Texto',
  imagem: 'Imagem',
  video: 'Vídeo',
  audio: 'Áudio',
  documento: 'Documento',
  link: 'Link',
  cta: 'Botão CTA',
  botoes: 'Botões rápidos',
  lista: 'Lista interativa',
}

export function newMensagemStepId(): string {
  return `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function ensureAcaoSteps(config: AcaoConfig): MensagemStep[] {
  if (config.mensagemSteps?.length) return config.mensagemSteps
  const steps: MensagemStep[] = []
  if (config.mensagem?.trim()) {
    steps.push({
      id: newMensagemStepId(),
      tipo: 'texto',
      source: 'url',
      caption: config.mensagem,
      delaySegundos: 0,
    })
  }
  if (config.midia?.url) {
    steps.push({
      id: newMensagemStepId(),
      tipo: config.midia.tipo === 'video' ? 'video' : 'imagem',
      source: 'url',
      url: config.midia.url,
      delaySegundos: 0,
    })
  }
  return steps
}

export function actionUsesMessageBlocks(tipo: TipoAcao): boolean {
  return tipo === 'enviar_dm_wa' || tipo === 'enviar_dm_ig' || tipo === 'comentar_ig' || tipo === 'notificar_equipe'
}

export function allowedStepTypesForAction(tipo: TipoAcao): MensagemStepTipo[] {
  if (tipo === 'enviar_dm_ig' || tipo === 'comentar_ig') {
    return ['texto', 'imagem', 'video']
  }
  if (tipo === 'enviar_dm_wa' || tipo === 'notificar_equipe') {
    return ['texto', 'imagem', 'video', 'audio', 'documento', 'link', 'cta', 'botoes', 'lista']
  }
  return ['texto']
}

export function normalizeAcaoConfig(config: AcaoConfig): AcaoConfig {
  const steps = ensureAcaoSteps(config)
  return {
    ...config,
    mensagemSteps: steps.length ? steps : config.mensagemSteps,
    mensagem: config.mensagem || steps.find((s) => s.tipo === 'texto')?.caption || '',
  }
}

export interface Limites {
  maxPorUsuario: number
  cooldownSegundos: number
  maxPorHora: number
  maxPorDia: number
  janelaFuncionamento?: {
    ativo: boolean
    inicioHora: number
    fimHora: number
    timezone?: string
  }
}

export interface AutomationMetrics {
  runs: number
  sucessos: number
  falhas: number
  proximaExecucao?: string | null
  ultimaExecucao?: string | null
  ultimoErro?: { step: string; mensagem: string; em: string } | null
}

export interface Automacao {
  id: string
  brand_id: string
  user_id: string
  nome: string
  descricao: string
  ativa: boolean
  status: AutomationStatus
  trigger: AutomationTrigger
  pipeline: AcaoPipeline[]
  limites: Limites
  metrics: AutomationMetrics
  created_at: string
  updated_at: string
}

export interface AutomacaoInput {
  nome: string
  descricao?: string
  ativa?: boolean
  trigger: AutomationTrigger
  pipeline: AcaoPipeline[]
  limites: Limites
}

export interface AutomationKpis {
  total: number
  live: number
  pausado: number
  erro: number
  agendadas: number
  eventos: number
  runs: number
  successRate: number
}

export const EVENTOS_INSTAGRAM = [
  { id: 'novo_seguidor', label: 'Novo seguidor' },
  { id: 'dm_keyword', label: 'DM com palavra-chave' },
  { id: 'comentario_keyword', label: 'Comentário com palavra-chave' },
  { id: 'mencao_story', label: 'Menção em story' },
  { id: 'resposta_padrao_dm', label: 'Resposta padrão em DM' },
] as const

export const EVENTOS_WHATSAPP = [
  { id: 'dm_recebida', label: 'Mensagem recebida' },
  { id: 'dm_keyword', label: 'Mensagem com palavra-chave' },
  { id: 'lead_recebido', label: 'Lead recebido' },
] as const

export const EVENTOS_LEADS = [
  { id: 'lead_criado', label: 'Novo lead' },
  { id: 'lead_status_alterado', label: 'Status do lead alterado' },
  { id: 'pedido_criado', label: 'Novo pedido' },
] as const

export const ACOES_POR_PLATAFORMA: Record<Plataforma, Array<{ id: TipoAcao; label: string }>> = {
  instagram: [
    { id: 'enviar_dm_ig', label: 'Enviar DM no Instagram' },
    { id: 'comentar_ig', label: 'Responder comentário' },
    { id: 'publicar_conteudo', label: 'Publicar conteúdo' },
  ],
  whatsapp: [
    { id: 'enviar_dm_wa', label: 'Enviar mensagem WhatsApp' },
    { id: 'notificar_equipe', label: 'Notificar equipe' },
  ],
  email: [{ id: 'enviar_email', label: 'Enviar e-mail' }],
  leads: [
    { id: 'notificar_equipe', label: 'Notificar equipe' },
    { id: 'enviar_dm_wa', label: 'Enviar WhatsApp ao lead' },
  ],
}

export function getAcaoLabel(tipo: TipoAcao): string {
  const all = Object.values(ACOES_POR_PLATAFORMA).flat()
  return all.find((a) => a.id === tipo)?.label || tipo
}

export function getEventoLabel(plataforma: Plataforma, evento: string): string {
  const lists = {
    instagram: EVENTOS_INSTAGRAM,
    whatsapp: EVENTOS_WHATSAPP,
    leads: EVENTOS_LEADS,
    email: [] as { id: string; label: string }[],
  }
  return lists[plataforma]?.find((e) => e.id === evento)?.label || evento
}

export const defaultAutomacaoInput = (): AutomacaoInput => ({
  nome: '',
  descricao: '',
  ativa: true,
  trigger: {
    tipo: 'agendamento',
    frequencia: 'diario',
    horarios: [{ hora: 9, minuto: 0 }],
    diasSemana: [],
    diasMes: [],
    cron: '0 9 * * *',
    timezone: 'America/Sao_Paulo',
  },
  pipeline: [],
  limites: {
    maxPorUsuario: 1,
    cooldownSegundos: 3600,
    maxPorHora: 0,
    maxPorDia: 0,
  },
})