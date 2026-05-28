/**
 * ═══════════════════════════════════════════════════════════════════
 * Skill Templates — catálogo de habilidades prontas para ativar
 * ═══════════════════════════════════════════════════════════════════
 *
 * 10 templates prontos. Quando o usuário clica "Ativar", a IA lê o
 * perfil do brand (nome, negócio, produtos, tom) e customiza as
 * instruções, keywords e exemplos — a skill nasce já adaptada.
 *
 * Free creation via wizard SSE continua inalterada e coexiste.
 */

import { aiRouter } from "./aiRouter";
import { AIAgentProfileService } from "./aiAgentProfile";
import { ProductsService } from "./products";
import { brandSkillsService } from "./brandSkills";
import type { BrandSkill, SkillType } from "./brandSkills";
import { logger } from "../utils/logger";

/* ─────────────────────── Tipos ─────────────────────── */

export interface SkillTemplate {
  id: string;
  name: string;
  description: string;
  long_description: string;
  skill_type: SkillType;
  category: "vendas" | "atendimento" | "produto" | "suporte";
  icon: string;                    // nome do ícone lucide
  color: string;                   // palette key (sky/violet/emerald/amber/rose/indigo)
  base_instructions: string;       // instruções de fallback (sem customização IA)
  base_keywords: string[];
  base_examples: string[];
  base_qa: Array<{ q: string; a: string }>;
  customization_goal: string;      // o que pedir à IA ao customizar
  confidence_score: number;
}

export interface ActivateTemplateResult {
  skill: BrandSkill;
  customized: boolean;
}

/* ─────────────────── Catálogo ─────────────────── */

export const SKILL_TEMPLATES: SkillTemplate[] = [
  {
    id: "closer-vendas",
    name: "Closer de Vendas",
    description: "Técnicas de fechamento adaptadas ao seu negócio. Converte leads interessados sem pressão.",
    long_description: "O agente aprende quando o lead está pronto para comprar e aplica a sequência de fechamento certa — confirmação de interesse, remoção da última fricção e chamada clara para ação.",
    skill_type: "flow",
    category: "vendas",
    icon: "Target",
    color: "rose",
    base_keywords: ["fechar", "comprar", "quero", "vou levar", "como pago", "onde compro"],
    base_examples: [
      "quero comprar agora",
      "vou levar esse produto",
      "como faço para fechar",
      "pode me mandar o link para pagar",
      "quero confirmar meu pedido",
    ],
    base_instructions: `Você é um closer de vendas. Quando o lead demonstrar intenção de compra (pergunta sobre preço, como pagar, quer confirmar pedido), execute esta sequência:
1. CONFIRME o item escolhido com precisão (produto + variação + quantidade)
2. REMOVA a última fricção — responda a qualquer dúvida restante diretamente
3. DIRECIONE para a ação — forneça o próximo passo concreto (link, forma de pagamento, contato)
4. Se houver urgência legítima (estoque baixo, promoção real), mencione brevemente
5. Tom: seguro, direto, sem pressão. Nunca apresse. Nunca empurre.`,
    base_qa: [
      { q: "Quanto fica no total?", a: "Fica R$ [valor] no total. Posso te mandar o link para fechar agora se quiser." },
      { q: "Posso parcelar?", a: "Sim! Parcelamos em até [X]x sem juros. Qual parcela fica melhor pra você?" },
    ],
    customization_goal: "Adapte as instruções de fechamento para o tipo de produto/serviço do brand, o ticket médio e o canal de pagamento usado. Crie exemplos de gatilho com o vocabulário real do segmento.",
    confidence_score: 85,
  },
  {
    id: "indicador-produtos",
    name: "Indicador de Produtos",
    description: "Navega no catálogo e recomenda produtos com preços, condições e links — sem o lead precisar perguntar.",
    long_description: "O agente entende o contexto do lead (necessidade, orçamento, perfil) e indica o produto certo do catálogo com todas as informações que ele precisa para decidir.",
    skill_type: "lookup",
    category: "produto",
    icon: "ShoppingBag",
    color: "violet",
    base_keywords: ["produto", "tem", "vende", "indica", "qual", "recomenda", "mostra", "catalogo", "opcoes"],
    base_examples: [
      "quais produtos vocês têm",
      "pode me indicar algo para",
      "qual produto você recomenda para mim",
      "me mostra as opções disponíveis",
      "tem algum produto para",
    ],
    base_instructions: `Você é o especialista em produtos. Quando perguntarem sobre produtos ou o que indicar:
1. ENTENDA a necessidade primeiro — se não estiver clara, faça 1 pergunta objetiva
2. INDIQUE 1-2 produtos específicos do catálogo (não liste tudo)
3. EXPLIQUE por que aquele produto serve para a necessidade dele
4. INFORME preço, condições e próximo passo para adquirir
5. Se houver variação relevante (tamanho, cor, modelo), mencione diretamente
6. Se tiver link ou imagem disponível, use
7. Tom: consultivo, não vendedor. Ajude, não empurre.`,
    base_qa: [
      { q: "O que vocês vendem?", a: "Temos [categoria principal]. Para te indicar algo certeiro, me fala: para qual finalidade você precisa?" },
      { q: "Qual você recomenda?", a: "Para o seu caso, o ideal é o [produto]. Custa R$ [X] e [benefício principal]. Posso te enviar mais detalhes?" },
    ],
    customization_goal: "Use os produtos reais do catálogo do brand para criar as instruções de indicação. Inclua as categorias existentes, faixa de preço real e o processo de compra deste negócio específico.",
    confidence_score: 90,
  },
  {
    id: "quebra-objecao",
    name: "Quebra de Objeção",
    description: "Identifica e dissolve objeções comuns com argumentos concretos, sem discutir.",
    long_description: "O agente detecta as 5 objeções mais frequentes neste segmento (preço, prazo, confiança, necessidade, concorrente) e responde de forma que valida a preocupação antes de apresentar o contra-argumento.",
    skill_type: "policy",
    category: "vendas",
    icon: "ShieldCheck",
    color: "indigo",
    base_keywords: ["caro", "vou pensar", "nao sei", "depois", "concorrente", "mas", "porem", "tao certo", "garantia", "risco"],
    base_examples: [
      "está caro para mim",
      "vou pensar e te falo",
      "deixa eu ver em outro lugar",
      "mas não tenho certeza",
      "ainda não sei se preciso disso",
    ],
    base_instructions: `Você é especialista em quebrar objeções sem confrontar. Ao detectar uma objeção:
1. VALIDE — reconheça a preocupação em 1 frase ("Faz sentido você questionar isso...")
2. REFRAME — apresente um ângulo diferente com dado concreto ou garantia
3. REDUZA O RISCO — mencione garantia, troca, parcelamento ou condição especial se existir
4. CONVITE SUAVE — proponha um próximo passo pequeno, não o fechamento completo
5. NUNCA discorde diretamente. NUNCA repita o mesmo argumento com outras palavras.
6. Se a objeção for de preço: foque no valor e ROI, não desconto.
7. Se for "vou pensar": entenda o que falta decidir, não force.`,
    base_qa: [
      { q: "Está muito caro.", a: "Entendo a preocupação com o investimento. [Produto] custa [valor] mas [benefício específico]. Muitos clientes nos falam que valeu porque [prova social]. Tem algum outro ponto além do preço que te deixa em dúvida?" },
      { q: "Vou pensar e te falo.", a: "Claro, sem pressa. Me fala: tem alguma dúvida específica que eu possa responder agora para facilitar sua decisão?" },
    ],
    customization_goal: "Identifique as 5 objeções mais comuns para este tipo de negócio e produto. Crie contra-argumentos específicos com os diferenciais reais do brand. Tom deve combinar com o perfil de comunicação.",
    confidence_score: 88,
  },
  {
    id: "qualificador-lead",
    name: "Qualificador de Lead",
    description: "Faz as perguntas certas para entender o lead antes de apresentar qualquer oferta.",
    long_description: "Evita perder tempo com leads que não têm fit e garante que os que têm recebam a proposta certa. O agente conduz uma sequência de qualificação natural, sem soar como formulário.",
    skill_type: "flow",
    category: "vendas",
    icon: "UserCheck",
    color: "emerald",
    base_keywords: ["preciso", "estou procurando", "queria saber", "tenho interesse", "gostaria", "me interessa"],
    base_examples: [
      "tenho interesse no produto",
      "gostaria de mais informações",
      "estou procurando algo para",
      "queria saber mais sobre",
      "me interessa sim",
    ],
    base_instructions: `Você qualifica leads de forma natural. Ao detectar interesse inicial:
1. Faça NO MÁXIMO 1 pergunta por mensagem — nunca interrogue
2. Descubra em sequência: (a) necessidade principal, (b) contexto de uso, (c) orçamento/prazo
3. Com as respostas, indique o produto/plano mais adequado
4. Se o lead não tiver fit, seja honesto e gentil
5. NÃO apresente catálogo completo antes de qualificar
6. NÃO peça dados pessoais (nome, CPF) nesta fase — é só entender a necessidade
7. Tom: curioso, consultivo, humano. Parece uma conversa, não um script.`,
    base_qa: [
      { q: "Tenho interesse, pode me falar mais?", a: "Com prazer! Para te indicar a melhor opção: é para uso pessoal ou profissional?" },
      { q: "Quero saber mais sobre o produto.", a: "Claro! Me conta: qual é o principal problema que você quer resolver com ele?" },
    ],
    customization_goal: "Crie uma sequência de qualificação específica para este segmento. As 3 perguntas devem revelar se o lead tem fit com os produtos do brand. Use o vocabulário natural do setor.",
    confidence_score: 82,
  },
  {
    id: "simulacao-valores",
    name: "Simulação de Valores",
    description: "Calcula parcelas, financiamentos, orçamentos ou qualquer simulação numérica do seu negócio.",
    long_description: "O lead pede um cálculo e o agente entrega o resultado na mesma mensagem, sem mandar email, sem 'vou verificar'. Funciona para qualquer tipo de simulação configurada.",
    skill_type: "calculator",
    category: "produto",
    icon: "Calculator",
    color: "violet",
    base_keywords: ["simulacao", "simular", "calcular", "parcela", "valor", "quanto fica", "financiamento", "orcamento", "precificacao"],
    base_examples: [
      "quero uma simulação",
      "quanto fica parcelado",
      "como seria um financiamento de",
      "pode me dar um orçamento",
      "quanto fica em X vezes",
    ],
    base_instructions: `Você faz simulações financeiras e de preço em tempo real. Quando o lead pedir uma simulação:
1. Se tiver os dados necessários (valor, prazo, entrada), calcule e entregue o resultado JÁ
2. Se faltarem dados, peça O MÍNIMO necessário em 1 pergunta
3. Apresente o resultado formatado de forma clara (valor total, parcelas, condições)
4. Destaque os planos/condições mais vantajosas
5. Após a simulação, pergunte se o resultado atende ou se quer ajustar alguma variável
6. NUNCA diga "vou calcular", "deixa eu verificar", "um momento" — entregue imediatamente`,
    base_qa: [
      { q: "Quanto fica parcelado em 12x?", a: "No plano de 12x, fica R$ [valor/12] por mês (total R$ [valor]). Entrada mínima de R$ [entrada]. Posso simular com outra entrada se quiser." },
      { q: "Quero uma simulação para R$ 50.000.", a: "Simulação para R$ 50.000: em 24x = R$ [x]/mês, em 36x = R$ [y]/mês, em 48x = R$ [z]/mês. Qual prazo faz mais sentido para você?" },
    ],
    customization_goal: "Adapte para o tipo de simulação deste negócio (financiamento imobiliário, consórcio, parcelas de produto, orçamento de serviço, etc.). Use os planos/tabelas reais dos produtos do brand se disponíveis.",
    confidence_score: 80,
  },
  {
    id: "pos-venda-suporte",
    name: "Pós-venda e Suporte",
    description: "Resolve pedidos de suporte, status de entrega e devoluções com agilidade e empatia.",
    long_description: "Clientes pós-compra precisam de respostas rápidas. O agente identifica o tipo de solicitação, confirma dados mínimos e resolve ou encaminha sem rodeios.",
    skill_type: "policy",
    category: "suporte",
    icon: "HeartHandshake",
    color: "sky",
    base_keywords: ["pedido", "entrega", "status", "prazo", "nao recebi", "problema", "trocar", "devolver", "reembolso", "nao funcionou"],
    base_examples: [
      "quando meu pedido chega",
      "não recebi meu produto ainda",
      "quero trocar o produto",
      "está com defeito",
      "quero cancelar meu pedido",
      "como funciona a devolução",
    ],
    base_instructions: `Você resolve suporte pós-venda. Ao receber solicitação de suporte:
1. IDENTIFIQUE o tipo: status de entrega, defeito, troca, cancelamento ou outra dúvida
2. CONFIRME com 1 dado mínimo (número do pedido, data da compra, ou produto)
3. RESOLVA com a política correta — seja preciso, não genérico
4. Se não puder resolver direto, DEFINA prazo e próximo passo concreto
5. Demonstre empatia real na primeira frase se houver frustração
6. NUNCA: "aguarde", "vou verificar", "abra um chamado" sem dar prazo ou alternativa
7. Tom: eficiente, cuidadoso, sem burocracia`,
    base_qa: [
      { q: "Meu pedido não chegou.", a: "Entendo, vamos resolver! Me confirma o número do pedido ou a data da compra para eu verificar o status imediatamente." },
      { q: "Quero trocar o produto.", a: "Claro! Nossa política de troca é [prazo/condição]. Para iniciar: o produto está [condição de devolução]?" },
    ],
    customization_goal: "Adapte a política de suporte para este negócio específico. Use os prazos reais de entrega, política de troca/devolução e canais de suporte disponíveis. Tom deve refletir o perfil do brand.",
    confidence_score: 87,
  },
  {
    id: "apresentacao-negocio",
    name: "Apresentação do Negócio",
    description: "Conta a história da marca, diferenciais e posicionamento de forma envolvente.",
    long_description: "Quando alguém pergunta 'quem são vocês', o agente não lista bullets — conta a história da empresa conectando com o que aquele lead específico está buscando.",
    skill_type: "info",
    category: "atendimento",
    icon: "Building2",
    color: "amber",
    base_keywords: ["quem sao voces", "sobre a empresa", "empresa", "historia", "diferencial", "porque voces", "tempo de mercado", "confiavel"],
    base_examples: [
      "quem são vocês",
      "me conta sobre a empresa",
      "há quanto tempo no mercado",
      "por que escolher vocês",
      "qual o diferencial de vocês",
    ],
    base_instructions: `Você conta a história e os diferenciais do brand. Quando perguntarem sobre a empresa:
1. ABRA com 1 frase que posiciona o brand (quem é, para quem serve)
2. Mencione 1-2 diferenciais CONCRETOS (não genéricos como "qualidade e atendimento")
3. Se relevante: tempo de mercado, número de clientes, prêmios, certificações
4. CONECTE com a necessidade do lead se souber o contexto
5. Termine com uma abertura para continuar a conversa — não com um discurso de venda
6. Máximo 3-4 frases. Não escreva um texto corporativo.
7. Tom: confiante, genuíno, próximo`,
    base_qa: [
      { q: "Quem são vocês?", a: "[Nome do brand] é [posicionamento]. [Diferencial concreto 1]. [Diferencial concreto 2]. O que você está buscando especificamente?" },
      { q: "Por que devo comprar com vocês?", a: "Boa pergunta. [Diferencial 1 com dado]. [Diferencial 2 com prova social]. Isso faz sentido para o que você precisa?" },
    ],
    customization_goal: "Use o nome real, história, tempo de mercado e diferenciais específicos do brand. Crie uma narrativa autêntica baseada no contexto real do negócio, não texto genérico.",
    confidence_score: 92,
  },
  {
    id: "faq-inteligente",
    name: "FAQ Inteligente",
    description: "Responde as perguntas mais frequentes sobre o negócio com precisão e sem robô.",
    long_description: "Diferente de um FAQ estático, o agente adapta a resposta ao contexto da conversa — não dá a mesma resposta engessada para todo mundo.",
    skill_type: "info",
    category: "atendimento",
    icon: "HelpCircle",
    color: "sky",
    base_keywords: ["como funciona", "aceita", "tem", "prazo", "horario", "atende", "politica", "como faco", "onde fica", "forma de pagamento"],
    base_examples: [
      "como funciona o processo",
      "vocês aceitam cartão",
      "qual o prazo de entrega",
      "qual o horário de atendimento",
      "tem loja física",
    ],
    base_instructions: `Você responde dúvidas operacionais com precisão. Para qualquer pergunta do FAQ:
1. Responda a pergunta EXATA com informação precisa — sem rodeios
2. Se souber o contexto do lead, personalize minimamente a resposta
3. Após responder, verifique se resolve ou se tem dúvida derivada
4. Não liste todas as políticas — responda o que foi perguntado
5. Se não souber a resposta, admita e ofereça alternativa (falar com responsável)
6. NUNCA invente informações. Se não souber: "Deixa eu verificar isso e te confirmo"`,
    base_qa: [
      { q: "Vocês aceitam cartão de crédito?", a: "Sim! Aceitamos cartão de crédito, débito e PIX. Parcelamos em até [X]x sem juros no crédito. Tem mais alguma dúvida?" },
      { q: "Qual o prazo de entrega?", a: "Para [região], o prazo é de [X] dias úteis. Fazemos envio por [transportadora]. Posso calcular para seu CEP se quiser." },
    ],
    customization_goal: "Crie um conjunto de Q&As com as 6-8 perguntas mais frequentes deste tipo de negócio, com as respostas precisas baseadas no contexto do brand. Inclua horários, formas de pagamento, prazo de entrega e demais informações operacionais disponíveis.",
    confidence_score: 90,
  },
  {
    id: "reativacao-lead",
    name: "Reativação de Lead Frio",
    description: "Retoma contato com leads que pararam de responder, sem soar como cobrança.",
    long_description: "O agente identifica quando um lead esfriou e retoma a conversa com um gancho relevante — não 'só passando para ver', mas com algo concreto de valor.",
    skill_type: "flow",
    category: "vendas",
    icon: "RotateCcw",
    color: "amber",
    base_keywords: ["sumiu", "sem resposta", "nao respondeu", "conversa parada", "lead frio", "retomar", "follow up"],
    base_examples: [
      "sem resposta há dias",
      "lead que não responde mais",
      "conversa parada faz tempo",
      "como retomar contato",
    ],
    base_instructions: `Você reativa conversas paradas sem soar como cobrança. Ao retomar contato com lead frio:
1. NÃO abra com "só passando para ver" ou "você chegou a pensar?"
2. Traga algo concreto de valor: novidade, informação útil, condição especial real, ou solução para uma dúvida anterior
3. Seja breve — 1-2 frases no máximo
4. Termine com uma pergunta fácil de responder (não "você ainda quer comprar?")
5. Se não responder após 2 tentativas, encerre gentilmente
6. Tom: natural, como um amigo prestativo, não vendedor desesperado`,
    base_qa: [
      { q: "Como retomar conversa com lead que sumiu?", a: "Oi [nome]! Lembrei de você porque [novidade/informação relevante]. [Pergunta fácil]?" },
    ],
    customization_goal: "Crie mensagens de reativação para o contexto específico deste negócio. Use o vocabulário do segmento e possíveis ganchos de valor reais (novos produtos, promoções sazonais típicas, informações úteis do setor).",
    confidence_score: 78,
  },
  {
    id: "agendamento-visita",
    name: "Agendamento",
    description: "Guia o processo de agendar visita, reunião, consulta ou demonstração.",
    long_description: "Para negócios onde a próxima etapa é um encontro presencial ou remoto, o agente conduz o agendamento de forma natural, confirma disponibilidade e envia lembrete.",
    skill_type: "flow",
    category: "atendimento",
    icon: "CalendarCheck",
    color: "emerald",
    base_keywords: ["agendar", "marcar", "visita", "reuniao", "consulta", "horario disponivel", "quando posso", "demonstracao", "apresentacao"],
    base_examples: [
      "quero agendar uma visita",
      "como marco uma consulta",
      "tem horário disponível",
      "quero ver uma demonstração",
      "posso ir pessoalmente",
    ],
    base_instructions: `Você conduz agendamentos. Quando o lead quiser agendar:
1. CONFIRME o tipo de atendimento (presencial, remoto, telefone)
2. Pergunte a disponibilidade em formato simples: "Você prefere manhã ou tarde? E qual dia da semana funciona melhor?"
3. Confirme o agendamento com data, hora e local/link
4. Envie o que o lead precisa saber (endereço, link, o que levar)
5. Ofereça lembrete: "Posso te mandar um lembrete no dia anterior?"
6. NUNCA: envie formulário externo sem explicar. NUNCA dê opções demais de horário.
7. Tom: organizado, prestativo, humano`,
    base_qa: [
      { q: "Quero agendar uma visita.", a: "Ótimo! Você prefere manhã ou tarde? E qual dia da semana funciona melhor para você?" },
      { q: "Tem horário disponível essa semana?", a: "Sim! Temos horários disponíveis [dias]. Você prefere presencial ou posso te atender por videochamada também?" },
    ],
    customization_goal: "Adapte o fluxo de agendamento para o tipo de encontro que este negócio realiza (consulta médica, visita a imóvel, reunião comercial, demonstração de produto, etc). Use os horários e locais reais do brand.",
    confidence_score: 84,
  },
];

/* ─────────────────── Serviço de ativação ─────────────────── */

const profileService = new AIAgentProfileService();
const productsService = new ProductsService();

export async function getTemplatesWithStatus(
  userId: string,
  brandId: string,
): Promise<Array<SkillTemplate & { already_active: boolean; active_skill_id: string | null }>> {
  const existing = await brandSkillsService.listForBrand(userId, brandId).catch(() => []);
  /* Skill originada de template tem source_summary prefixado com "template:" */
  const activeTemplateIds = new Set(
    existing
      .map((s) => s.source_summary)
      .filter((s) => s.startsWith("template:"))
      .map((s) => s.replace("template:", "")),
  );
  const skillByTemplate = new Map(
    existing
      .filter((s) => s.source_summary.startsWith("template:"))
      .map((s) => [s.source_summary.replace("template:", ""), s.id]),
  );

  return SKILL_TEMPLATES.map((t) => ({
    ...t,
    already_active: activeTemplateIds.has(t.id),
    active_skill_id: skillByTemplate.get(t.id) || null,
  }));
}

export async function activateTemplate(
  userId: string,
  brandId: string,
  templateId: string,
): Promise<ActivateTemplateResult> {
  const template = SKILL_TEMPLATES.find((t) => t.id === templateId);
  if (!template) throw new Error(`Template "${templateId}" não encontrado`);

  /* Verifica se já está ativo */
  const existing = await brandSkillsService.listForBrand(userId, brandId).catch(() => []);
  const alreadyActive = existing.find((s) => s.source_summary === `template:${templateId}`);
  if (alreadyActive) {
    return { skill: alreadyActive, customized: false };
  }

  /* Carrega contexto do brand para customização */
  const [profile, products] = await Promise.all([
    profileService.getByUserId(userId, brandId).catch(() => null),
    productsService.getActiveProducts(userId, brandId).catch(() => []),
  ]);

  const brandName = profile?.agent_name || "Brand";
  const businessContext = profile?.business_context || profile?.objective || "";
  const tone = profile?.tone || "casual";
  const productsSummary = products.slice(0, 10)
    .map((p: any) => `- ${p.name}${p.price ? ` (R$ ${p.price})` : ""}${p.description ? `: ${String(p.description).slice(0, 80)}` : ""}`)
    .join("\n");

  /* Tenta customização via IA */
  let customized = false;
  let finalInstructions = template.base_instructions;
  let finalKeywords = template.base_keywords;
  let finalExamples = template.base_examples;
  let finalQA = template.base_qa;

  if (businessContext || productsSummary) {
    try {
      const customizationPrompt = [
        `Você é especialista em criar habilidades de IA para agentes de WhatsApp.`,
        ``,
        `Preciso personalizar a habilidade "${template.name}" para este brand:`,
        `Nome/Agente: ${brandName}`,
        `Contexto do negócio: ${businessContext || "(não informado)"}`,
        `Tom de comunicação: ${tone}`,
        products.length > 0 ? `Produtos/Serviços disponíveis:\n${productsSummary}` : "",
        ``,
        `Objetivo desta habilidade: ${template.customization_goal}`,
        ``,
        `Instruções base (adapte para este negócio específico):`,
        template.base_instructions,
        ``,
        `Retorne SOMENTE um JSON válido neste formato exato (sem markdown, sem texto antes/depois):`,
        `{`,
        `  "instructions": "instruções detalhadas personalizadas para este brand (min 150 chars)",`,
        `  "trigger_keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],`,
        `  "trigger_examples": ["frase exemplo 1 do lead", "frase exemplo 2", "frase exemplo 3", "frase exemplo 4"],`,
        `  "examples": [`,
        `    {"q": "pergunta real do lead neste segmento", "a": "resposta ideal do agente"},`,
        `    {"q": "outra pergunta comum", "a": "resposta ideal"}`,
        `  ]`,
        `}`,
      ].filter(Boolean).join("\n");

      const result = await aiRouter.generateJson<{
        instructions: string;
        trigger_keywords: string[];
        trigger_examples: string[];
        examples: Array<{ q: string; a: string }>;
      }>(customizationPrompt, { userId, brandId }, { temperature: 0.4 });

      if (
        result &&
        typeof result.instructions === "string" && result.instructions.length > 50 &&
        Array.isArray(result.trigger_keywords) && result.trigger_keywords.length > 0 &&
        Array.isArray(result.trigger_examples) && result.trigger_examples.length > 0
      ) {
        finalInstructions = result.instructions;
        finalKeywords = result.trigger_keywords.slice(0, 12).map((k) => String(k).toLowerCase().trim()).filter(Boolean);
        finalExamples = result.trigger_examples.slice(0, 8).map((e) => String(e).trim()).filter(Boolean);
        if (Array.isArray(result.examples) && result.examples.length > 0) {
          finalQA = result.examples.slice(0, 6).filter((e) => e?.q && e?.a);
        }
        customized = true;
      }
    } catch (e: any) {
      logger.warn(`skillTemplates: customização IA falhou para "${templateId}", usando base: ${e?.message}`);
    }
  }

  const skill = await brandSkillsService.create(userId, brandId, {
    name: template.name,
    description: template.description,
    skill_type: template.skill_type,
    trigger_intents: [],
    trigger_keywords: finalKeywords,
    trigger_examples: finalExamples,
    instructions: finalInstructions,
    data_payload: null,
    examples: finalQA,
    confidence_score: template.confidence_score,
    is_active: true,
    sort_order: 50,
    source_summary: `template:${template.id}`,
  });

  logger.info(`skillTemplates: template "${templateId}" ativado para brand ${brandId} (customized=${customized})`);
  return { skill, customized };
}
