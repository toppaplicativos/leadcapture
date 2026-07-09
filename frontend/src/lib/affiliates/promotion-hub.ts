import type { LucideIcon } from 'lucide-react'
import {
  MessageCircle, Clock, Users, Sparkles, HelpCircle, Camera,
  GitCompare, Layers, Target, Zap,
} from 'lucide-react'

export type PromotionTechnique = {
  id: string
  icon: LucideIcon
  title: string
  tag: string
  summary: string
  steps: string[]
  example: string
  channel: 'whatsapp' | 'instagram' | 'geral'
}

export const PROMOTION_TECHNIQUES: PromotionTechnique[] = [
  {
    id: 'combo-link-cupom',
    icon: Layers,
    title: 'Combo link + cupom',
    tag: 'Conversão',
    summary: 'Sempre envie o link do catálogo junto com o cupom — quem clica sem cupom pode esquecer de usar.',
    steps: [
      'Abra a galeria e copie um texto pronto ou monte o seu',
      'Inclua o link do catálogo e o cupom na mesma mensagem',
      'Finalize com um CTA claro: "Use o cupom no checkout"',
    ],
    example: 'Oi! Separei ofertas da {{marca}} pra você. Acesse {{link_catalogo}} e use {{cupom}} no final.',
    channel: 'whatsapp',
  },
  {
    id: 'prova-social',
    icon: Users,
    title: 'Prova social',
    tag: 'Confiança',
    summary: 'Mostre que outras pessoas já compraram ou estão satisfeitas — reduz o medo de comprar online.',
    steps: [
      'Use print de avaliação, entrega ou mensagem de cliente (com permissão)',
      'Conecte a prova ao produto que você quer divulgar',
      'Feche com seu link e cupom pessoal',
    ],
    example: 'Mais uma entrega confirmada! Quer o mesmo resultado? {{link_catalogo}} · cupom {{cupom}}',
    channel: 'geral',
  },
  {
    id: 'storytelling',
    icon: MessageCircle,
    title: 'Storytelling curto',
    tag: 'Engajamento',
    summary: 'Conte em 3 frases: problema → descoberta da loja → solução com seu cupom.',
    steps: [
      'Frase 1: dor ou desejo do público',
      'Frase 2: como você conheceu a marca',
      'Frase 3: convite com link e cupom',
    ],
    example: 'Eu sempre procurava X… até conhecer a {{marca}}. Testa com meu cupom {{cupom}}: {{link_catalogo}}',
    channel: 'instagram',
  },
  {
    id: 'urgencia-leve',
    icon: Clock,
    title: 'Urgência leve',
    tag: 'Ação',
    summary: 'Crie motivo para agir hoje sem pressão falsa — estoque, promoção da semana ou frete.',
    steps: [
      'Cite um motivo real (promo, estoque, condição especial)',
      'Evite "última chance" todo dia — perde credibilidade',
      'Deixe o cupom como facilitador, não como pressão',
    ],
    example: 'Promo da semana na {{marca}} — cupom {{cupom}} válido enquanto durar. Link: {{link_catalogo}}',
    channel: 'whatsapp',
  },
  {
    id: 'pergunta-hook',
    icon: HelpCircle,
    title: 'Hook com pergunta',
    tag: 'Stories',
    summary: 'Abra com pergunta no story ou status — quem responde já é lead quente.',
    steps: [
      'Pergunta simples sobre o problema do produto',
      'Responda no próximo story com a solução',
      'CTA no link da bio ou mensagem direta com cupom',
    ],
    example: 'Você ainda compra X sem comparar preço? Te mando minha indicação com desconto 👇',
    channel: 'instagram',
  },
  {
    id: 'bastidores',
    icon: Camera,
    title: 'Bastidores',
    tag: 'Autenticidade',
    summary: 'Mostre o produto em uso real, embalagem ou unboxing — humaniza e gera confiança.',
    steps: [
      'Grave 15–30s mostrando o produto de verdade',
      'Fale naturalmente, sem script engessado',
      'Legenda com cupom e link no final',
    ],
    example: 'Chegou! Qualidade surpreendeu. Se quiser testar: {{cupom}} em {{link_catalogo}}',
    channel: 'instagram',
  },
  {
    id: 'comparativo',
    icon: GitCompare,
    title: 'Antes × depois',
    tag: 'Visual',
    summary: 'Duas imagens ou um vídeo curto comparando situação antes e depois do produto.',
    steps: [
      'Mostre o "antes" (problema visual)',
      'Mostre o "depois" com o produto',
      'Texto curto + cupom na legenda',
    ],
    example: 'A diferença que faz. Cupom de parceiro: {{cupom}} · {{link_catalogo}}',
    channel: 'instagram',
  },
  {
    id: 'follow-up',
    icon: Target,
    title: 'Follow-up gentil',
    tag: 'WhatsApp',
    summary: 'Quem não respondeu não é "não" — um lembrete educado em 48h recupera vendas.',
    steps: [
      'Espere 1–2 dias após o primeiro contato',
      'Mensagem curta, sem cobrança',
      'Ofereça ajuda para escolher produto',
    ],
    example: 'Oi! Vi que você olhou o catálogo. Posso te indicar o melhor pra você? Cupom {{cupom}} segue ativo.',
    channel: 'whatsapp',
  },
]

export const PROMOTION_PLAYBOOK = [
  {
    id: 'rotina',
    icon: Zap,
    title: 'Rotina de 10 minutos',
    body: '1 story com arte da galeria · 1 mensagem no WhatsApp · 1 comentário em post da marca. Repita 3x por semana.',
  },
  {
    id: 'horario',
    icon: Clock,
    title: 'Melhor horário',
    body: 'WhatsApp: 10h–12h e 19h–21h. Instagram: 18h–22h. Teste 1 semana e veja o que converte no seu público.',
  },
  {
    id: 'consistencia',
    icon: Sparkles,
    title: 'Consistência > volume',
    body: 'Divulgar pouco mas toda semana converte mais que picos esporádicos. Use os materiais oficiais da marca.',
  },
]