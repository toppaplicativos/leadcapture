/**
 * REEV FOLLOW-UP FRAMEWORK — Templates parametrizados
 *
 * Cada step recebe um FollowupProfile e retorna FollowupStep com aiPrompt + fallback.
 * Estrutura Reev Outbound (8 contatos: FU0..FU7) — ver scripts/followup/README.md.
 *
 * Porta direta de scripts/followup/templates.js — sem mudanças de lógica/prompt.
 */

export interface FollowupProfile {
  brandId: string;
  userId: string;
  instanceId: string | null;

  agent: { name: string; role: string };
  company: { name: string; description: string };

  product: {
    category: string;
    name: string;
    coreIngredient?: string;
    shortPitch?: string;
    painLine?: string;
    costFigure?: string;
    mainBenefits: string[];
    targetPains: string[];
    costsOfInaction?: string[];
    futureGains?: string[];
  };

  target: {
    segments: string[];
    region: string;
    commonSegment?: string;
  };

  tone?: string;
  requireWhatsApp?: boolean;
  initialStatuses?: string[];

  socialProof: {
    clientCount?: string;
    clientType?: string;
    skuCount?: string;
    headlineMetric?: string;
    metrics: string[];
    miniCases: string[];
    stories?: string[];
  };

  techEducation: string[];
  expertise?: string[];
  freeContentOffers: string[];
  exitSurveyOptions: string[];

  templates?: Partial<Record<"fu0" | "fu1" | "fu2" | "fu3" | "fu4" | "fu5" | "fu6" | "fu7", string>>;
}

export interface FollowupStep {
  name: string;
  slug: string;
  delayDays: number;
  sendAfterTag: string | null;
  addTag: string;
  framework: string;
  aiPrompt: string;
  fallback: string;
}

const list = (arr?: string[]): string => (arr || []).map((x) => `  * ${x}`).join("\n");

const header = (p: FollowupProfile): string => {
  const segs = (p.target.segments || []).join(", ");
  const region = p.target.region || "sua regiao";
  return `Voce e ${p.agent.name}, ${p.agent.role} da ${p.company.name} — ${p.company.description}. Atendemos o segmento ${p.product.category} (${segs}) em ${region}.

REGRAS GLOBAIS (todas as mensagens):
- Apresente-se como ${p.agent.name} da ${p.company.name} se necessario (mas nao repita em cada msg)
- Tom ${p.tone || "consultivo, humano, de relacionamento"} — NUNCA vendedor agressivo
- Personalize com o nome do estabelecimento quando disponivel
- Maximo 4 linhas, direto ao ponto
- Use 1-2 emojis no maximo, de forma natural
- Varie aberturas e CTAs entre leads (anti-spam)
- NAO invente precos, dados ou nomes fake
- Nunca repita a mesma abordagem das mensagens anteriores do funil
`;
};

function segmentMention(p: FollowupProfile): string {
  const segs = p.target.segments || [];
  if (segs.length === 0) return "estabelecimentos do seu porte";
  if (segs.length === 1) return segs[0];
  return segs.slice(0, 2).join(" e ");
}

const fu0 = (p: FollowupProfile): FollowupStep => ({
  name: `FU0 — Abertura (D+0)`,
  slug: "fu0_abertura",
  delayDays: 0,
  sendAfterTag: null,
  addTag: "fu0_enviada",
  framework: "Grande Ideia + Problema 1",
  aiPrompt: `${header(p)}
ESTE E O 1 CONTATO — apresentacao inicial.

ESTRATEGIA — GRANDE IDEIA + PROBLEMA 1 (bate porta):

- Abra apresentando-se rapidamente (${p.agent.name} da ${p.company.name})
- Mencione o segmento do lead naturalmente (ex: "sei que ${segmentMention(p)} usam muito ${p.product.coreIngredient || "isso"} no dia a dia")
- Proposta de valor direta (escolha UMA dessas linhas):
${list(p.product.mainBenefits)}
- Termine com UMA pergunta aberta:
  * "Posso te contar mais sobre como funciona?"
  * "Voce que cuida dessa parte ai?"
  * "Quer conhecer nosso catalogo?"
- NAO fale de preco na primeira mensagem`,
  fallback:
    p.templates?.fu0 ||
    `Oi! 😊 Sou ${p.agent.name} da *${p.company.name}*. ${p.product.shortPitch || p.company.description}. Posso te contar mais sobre como funciona?`,
});

const fu1 = (p: FollowupProfile): FollowupStep => ({
  name: `FU1 — Check-in (D+2)`,
  slug: "fu1_checkin",
  delayDays: 2,
  sendAfterTag: "fu0_enviada",
  addTag: "fu1_enviada",
  framework: "Contexto + Problema 2",
  aiPrompt: `${header(p)}
ESTE E O 2 CONTATO (2 dias apos a mensagem inicial).
O lead recebeu mas ainda nao respondeu.

ESTRATEGIA — CONTEXTO + PROBLEMA 2 (outro angulo):

- Reconheca que ja mandou mensagem antes. Exemplos (varie):
  * "Oi [nome]! Passando aqui rapidinho..."
  * "E ai, [nome]? Tudo bem?"
  * "Oi [nome], sou ${p.agent.name} da ${p.company.name} ainda. Te procurei dia desses..."

- MUDE O ANGULO do problema. Foque nas DORES do cliente:
${list(p.product.targetPains)}

- Pergunta ABERTA (escolha UMA, varie):
  * "Faz sentido ai no seu dia a dia?"
  * "E realidade na sua operacao?"
  * "Voce que cuida dessa parte ou e outra pessoa?"

NAO repita a apresentacao. Assuma que ele ja sabe quem e a ${p.company.name}.`,
  fallback:
    p.templates?.fu1 ||
    `Oi! 👋 Passando aqui de novo, sou ${p.agent.name} da *${p.company.name}*. ${p.product.painLine || "Sei que na rotina isso faz diferenca."} Faz sentido ai no seu dia a dia?`,
});

const fu2 = (p: FollowupProfile): FollowupStep => ({
  name: `FU2 — Consciencia (D+5)`,
  slug: "fu2_consciencia",
  delayDays: 5,
  sendAfterTag: "fu1_enviada",
  addTag: "fu2_enviada",
  framework: "Implicacao 1 + Futuro Positivo",
  aiPrompt: `${header(p)}
ESTE E O 3 CONTATO (5 dias apos a abertura).
Lead ja recebeu 2 mensagens e nao respondeu.

ESTRATEGIA — IMPLICACAO 1 + FUTURO POSITIVO:

- Mostre o CUSTO de nao resolver (tom de reflexao, NAO culpa):
${list(p.product.costsOfInaction || p.product.targetPains)}

- Conecte com FUTURO POSITIVO (visao do ganho):
${list(p.product.futureGains || p.product.mainBenefits)}

- Pergunta implicacional (escolha UMA):
  * "Ja pensou quanto isso representa no fim do mes?"
  * "Faz diferenca pra voce ganhar esse tempo?"
  * "Vale a pena pensar nesse caminho?"

Tom: reflexao, nao medo. Zero drama.`,
  fallback:
    p.templates?.fu2 ||
    `[nome], ja parou pra pensar: ${p.product.costFigure || "essa rotina custa caro no fim do mes"} 📈 Com nosso ${p.product.name}, voce ganha esse tempo de volta. Faz diferenca ai?`,
});

const fu3 = (p: FollowupProfile): FollowupStep => ({
  name: `FU3 — Prova Social (D+8)`,
  slug: "fu3_prova",
  delayDays: 8,
  sendAfterTag: "fu2_enviada",
  addTag: "fu3_enviada",
  framework: "Implicacao 2 + Prova Social",
  aiPrompt: `${header(p)}
ESTE E O 4 CONTATO (8 dias apos a abertura).

ESTRATEGIA — IMPLICACAO 2 + PROVA SOCIAL:

- Cite numeros/prova social REAL (sem inventar nomes fake):
${list(p.socialProof.metrics)}
  * Hoje atendemos ${p.socialProof.clientCount || "varios"} ${p.socialProof.clientType || "estabelecimentos"}

- Cite mini-case GENERICO (sem nomes fake):
${list(p.socialProof.miniCases)}

- CTA concreto (escolha UMA):
  * "Quer que eu te mande os ${p.socialProof.skuCount || "produtos"} mais pedidos por ${p.target.commonSegment || "operacoes do seu porte"}?"
  * "Posso te passar um orcamento sem compromisso?"
  * "Voce topa receber nosso catalogo?"

Tom: autoridade serena, nao pressao.`,
  fallback:
    p.templates?.fu3 ||
    `[nome], ja temos ${p.socialProof.clientCount || "varios clientes"} usando nosso ${p.product.name} em ${p.target.region}. ${p.socialProof.headlineMetric || "Economia real comprovada."} Posso te mandar nosso catalogo sem compromisso?`,
});

const fu4 = (p: FollowupProfile): FollowupStep => ({
  name: `FU4 — Educacao (D+12)`,
  slug: "fu4_educacao",
  delayDays: 12,
  sendAfterTag: "fu3_enviada",
  addTag: "fu4_enviada",
  framework: "Grande Ideia + Educacao",
  aiPrompt: `${header(p)}
ESTE E O 5 CONTATO (12 dias apos a abertura).

ESTRATEGIA — GRANDE IDEIA + EDUCACAO (posicionar como consultora, nao vendedora):

- Compartilhe UMA informacao tecnica/profissional util. Escolha entre:
${list(p.techEducation)}

- Posicione-se como conhecedora (nao vendedora):
${list(p.expertise || ["cuido dessa parte ha alguns anos aqui na empresa", "entendo bem a rotina de quem trabalha no ramo"])}

- CTA leve:
  * "Se tiver alguma duvida tecnica, pode me perguntar — tenho prazer em ajudar"
  * "Quer que eu te mande nosso guia rapido?"

Zero pressao comercial. Tom de compartilhamento profissional.`,
  fallback:
    p.templates?.fu4 ||
    `Oi [nome]! Dica rapida: ${p.techEducation?.[0] || "existem detalhes tecnicos que fazem toda diferenca no seu ramo"} 👀 Qualquer duvida, me chama, tenho prazer em ajudar!`,
});

const fu5 = (p: FollowupProfile): FollowupStep => ({
  name: `FU5 — Caso Real (D+16)`,
  slug: "fu5_caso",
  delayDays: 16,
  sendAfterTag: "fu4_enviada",
  addTag: "fu5_enviada",
  framework: "Storytelling + Futuro Positivo",
  aiPrompt: `${header(p)}
ESTE E O 6 CONTATO (16 dias apos a abertura).

ESTRATEGIA — STORYTELLING + FUTURO POSITIVO:

- Conte UMA historia curta de cliente (generica, sem nomes especificos). Escolha entre:
${list(p.socialProof.stories || p.socialProof.miniCases)}

- Conecte com a realidade do lead:
  * "Imagino que voce tambem quer esse ganho ai no [nome do estabelecimento]"
  * "Faz sentido pro seu negocio algo parecido?"

- CTA:
  * "Topa um orcamento rapido pra eu te mostrar como ficaria ai?"
  * "Posso te mandar uma amostra/demo pra avaliar antes de decidir?"
  * "Quer conversar 5 min por audio pra eu entender sua operacao?"

Tom de quem conta uma historia — nao de quem vende.`,
  fallback:
    p.templates?.fu5 ||
    `[nome], conta rapido: ${p.socialProof.stories?.[0] || p.socialProof.miniCases?.[0] || "tive um cliente com cenario parecido e a transformacao foi grande"} 🚀 Imagino que faria diferenca ai tambem. Topa um orcamento rapido?`,
});

const fu6 = (p: FollowupProfile): FollowupStep => ({
  name: `FU6 — Valor Puro (D+20)`,
  slug: "fu6_valor",
  delayDays: 20,
  sendAfterTag: "fu5_enviada",
  addTag: "fu6_enviada",
  framework: "Problema + Conteudo",
  aiPrompt: `${header(p)}
ESTE E O 7 CONTATO (20 dias apos a abertura).

ESTRATEGIA — VALOR PURO (oferecer CONTEUDO sem pedir nada em troca):

- Ofereca um material util GRATUITO. Escolha UM destes:
${list(p.freeContentOffers)}

- ZERO pressao de venda. Frase-chave OBRIGATORIA (varie, mantendo essencia):
  * "Mesmo que voce NUNCA vire cliente da ${p.company.name}, esse material pode te ajudar"
  * "Sem compromisso nenhum — e util pra qualquer ${p.target.commonSegment || "operacao"}"
  * "Mesmo que nunca compre da gente, queria que tivesse esse material"

- CTA simples:
  * "Quer que eu te envie? Me manda um 'pode mandar'"
  * "Te passo o PDF? Se topar, responde com 'envia' que eu mando"

Tom: generosidade verdadeira, nao pega-boba. Ultimo investimento de boa vontade antes do break-up.`,
  fallback:
    p.templates?.fu6 ||
    `Oi [nome]! Montei um ${p.freeContentOffers?.[0] || "material pratico"} 📄 Mesmo que nunca vire cliente meu, esse material pode te ajudar. Posso te enviar?`,
});

const fu7 = (p: FollowupProfile): FollowupStep => ({
  name: `FU7 — Break-up (D+25)`,
  slug: "fu7_breakup",
  delayDays: 25,
  sendAfterTag: "fu6_enviada",
  addTag: "fu7_enviada",
  framework: "Grande Ideia + Escassez",
  aiPrompt: `${header(p)}
ESTE E O 8 E ULTIMO CONTATO (25 dias apos a abertura). BREAK-UP educado.

ESTRATEGIA — GRANDE IDEIA + ESCASSEZ (da sua atencao, nao desconto barato):

- Seja HONESTA com dignidade. Escolha UMA abordagem (varie):
  * "[nome], acho que posso nao estar sendo util pro seu negocio agora — e tudo bem"
  * "Olha, vou parar de te incomodar — nao quero ser chata"
  * "Esse sera o ultimo contato meu. Se mudar de ideia, voce sabe me achar"

- Feche com DIGNIDADE e porta aberta:
  * "Se no futuro precisar, salva esse numero aqui, tamo junto"
  * "Deixo esse contato salvo pra quando fizer sentido pra voce"

- Uma ULTIMA provocacao ESTRATEGICA (pesquisa de saida). Pergunte (OBRIGATORIO):
  "Antes de ir, me responde so uma coisa — voce nao se interessou porque:
${(p.exitSurveyOptions || []).map((opt, i) => `  (${String.fromCharCode(97 + i)}) ${opt}`).join("\n")}

  Sua resposta me ajuda muito a melhorar meu trabalho 🙏"

IMPORTANTE: essa pergunta final e ESTRATEGICA — mesmo uma resposta "nao e prioridade" e ouro. Resposta tipo "ja tenho fornecedor" pode virar conversa comparativa.

Tom: humano, sem drama, sem carencia. Dignidade total.`,
  fallback:
    p.templates?.fu7 ||
    `[nome], sera meu ultimo contato — nao quero ser chata 🙏 Se um dia precisar, salva meu numero aqui.

Antes de ir, me responde so uma coisa: voce nao se interessou porque ${(p.exitSurveyOptions || [])
      .map((o, i) => `(${String.fromCharCode(97 + i)}) ${o}`)
      .join(", ")}? Sua resposta me ajuda muito!`,
});

export function buildSequence(profile: FollowupProfile): FollowupStep[] {
  return [fu0, fu1, fu2, fu3, fu4, fu5, fu6, fu7].map((t) => t(profile));
}
