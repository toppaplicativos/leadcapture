/**
 * Dynamic Composition Director
 *
 * Instead of rotating through 5 static layout hints, this module uses a
 * fast LLM call to generate unique composition directions every time.
 * The AI is taught advertising composition PRINCIPLES — not rigid templates —
 * so output is infinitely creative while staying professionally grounded.
 *
 * The product data, brand identity, copy and logo remain faithful.
 * Only the graphic composition varies.
 */

import { aiRouter, type AIRouterScope } from "./aiRouter";
import { logger } from "../utils/logger";
import type { SectionId } from "./catalogCreatives";

/* ──────────────────────────────────────────────────────────
 *  COMPOSITION DNA — principles, not patterns
 *
 *  Each section gets a rich "essence" that teaches the LLM HOW
 *  to think about composition for that marketing intent. These
 *  are design direction schools, not pixel recipes.
 * ────────────────────────────────────────────────────────── */

interface SectionEssence {
  essence: string;
  designPrinciples: string[];
  compositionApproaches: string[];
  avoid: string[];
}

const COMPOSITION_DNA: Record<SectionId, SectionEssence> = {
  promo: {
    essence:
      "O deal GRITA. O cliente precisa sentir que está diante de uma oportunidade irrecusável AGORA. " +
      "Urgência controlada — energia alta mas sem parecer barata. O preço é o herói tanto quanto o produto.",
    designPrinciples: [
      "O preço/desconto deve ser o elemento de maior impacto visual — maior que tudo, impossível de ignorar",
      "Criar tensão visual entre o valor antigo e o novo (riscado vs. destaque) para amplificar a percepção de economia",
      "Usar blocos de cor sólida e contrastante para criar zonas de atenção imediata",
      "A hierarquia deve ser lida em menos de 0.5 segundo: oferta → produto → ação",
      "Tipografia com peso extremo (900/black) para headline, contrastando com peso leve para suporte",
      "O CTA deve parecer um botão clicável mesmo numa imagem estática — pill sólido, cor de destaque",
      "Energia vem de assimetria e ângulos — nunca de desordem",
    ],
    compositionApproaches: [
      "tensão assimétrica com produto em diagonal e preço como contrapeso visual",
      "blocos de cor split (metade marca, metade accent) com produto cruzando a divisão",
      "composição em Z — olho entra pelo badge de desconto, desce pelo produto, termina no CTA",
      "hero dominante com overlay de preço gigante como elemento gráfico (não apenas texto)",
      "layout de impacto jornalístico — headline enorme no topo, produto + preço como 'matéria principal'",
      "composição radial com produto no centro e informações orbitando em hierarquia de proximidade",
      "grid quebrado — zonas retangulares de tamanhos diferentes criando ritmo visual dinâmico",
      "pirâmide invertida — elemento mais importante (preço) no topo visual, detalhes na base",
      "composição em faixa diagonal cortando a peça, separando produto de copy com energia",
      "layout editorial estilo poster de cinema — produto dramático + tipografia monumental",
    ],
    avoid: [
      "centralizar tudo simetricamente — mata a urgência",
      "texto pequeno para o preço — ele deve ser o elemento mais visível",
      "fundos brancos genéricos sem personalidade de marca",
      "layout limpo demais sem energia — promo precisa de punch visual",
    ],
  },

  launch: {
    essence:
      "A REVELAÇÃO. Sensação de 'acabou de chegar ao mundo'. O produto é o protagonista absoluto — " +
      "tudo existe para servi-lo. Sofisticação editorial, não anúncio de varejo. Pense keynote da Apple, " +
      "não folheto de loja.",
    designPrinciples: [
      "Negative space generoso — o produto RESPIRA, não compete com nada",
      "Tipografia editorial com personalidade: mix de pesos (heavy headline + light suporte) cria sofisticação",
      "Iluminação como elemento narrativo — rim light, gradient sutil, spotlight teatral",
      "Menos elementos = mais impacto. Cada coisa na peça deve justificar sua existência",
      "O produto deve parecer que está sendo REVELADO, não apenas mostrado",
      "Uso de escala dramática — produto enorme ou crop inesperado para criar interesse",
      "A marca deve estar presente mas discreta — é sobre o produto, não sobre a loja",
    ],
    compositionApproaches: [
      "produto monumental centralizado com vastidão de espaço ao redor — ênfase por isolamento",
      "crop dramático — apenas parte do produto visível, criando mistério e desejo de ver mais",
      "composição editorial estilo capa de revista de design — tipografia como elemento gráfico",
      "produto emergindo de gradiente sutil — efeito 'materializando' do nada",
      "split conceitual — cor sólida da marca de um lado, produto revelado do outro",
      "composição vertical com produto flutuando e sombra projetada criando profundidade",
      "layout estilo galeria de arte — produto como obra, nome como legenda elegante",
      "detalhe macro do produto dominando 70% da peça + tipografia integrada aos 30% restantes",
      "composição diagonal ascendente — produto 'subindo' da base, headline no topo como destino",
      "produto em movimento sutil (leve inclinação, sombra dinâmica) sugerindo novidade e energia",
    ],
    avoid: [
      "poluir com muitos elementos decorativos — launch é sobre pureza",
      "tipografia genérica sem personalidade — a fonte É parte do design",
      "iluminação flat sem direção — precisa de drama fotográfico",
      "layout de panfleto com tudo amontoado — sofisticação pede espaço",
    ],
  },

  "social-proof": {
    essence:
      "CONFIANÇA HUMANA transferida para o produto. A voz de quem já comprou é mais poderosa que " +
      "qualquer copy da marca. O depoimento/avaliação é a âncora — o produto é coadjuvante. " +
      "Tom quente, autêntico, acolhedor.",
    designPrinciples: [
      "O depoimento/quote é o protagonista visual — deve ocupar o espaço mais nobre da composição",
      "Aspas decorativas ou estrelas como elementos gráficos (não apenas informação) — dão presença visual",
      "O produto aparece mas não domina — está ali como 'prova' do que o cliente está elogiando",
      "Tons quentes e texturas naturais para transmitir autenticidade",
      "Elemento humano (nome, avatar placeholder, atribuição) reforça que é uma pessoa real falando",
      "Hierarquia: prova social → produto → marca (invertendo a hierarquia tradicional)",
      "Badges de confiança (estrelas, número de clientes, selo) como micro-elementos de suporte",
    ],
    compositionApproaches: [
      "quote dominante em tipografia display com aspas decorativas gigantes como elemento gráfico principal",
      "layout de depoimento estilo card premium flutuante sobre fundo lifestyle suave",
      "composição dividida — metade human/emocional (quote + atribuição), metade produto contextualizado",
      "estrelas de avaliação como elemento central oversize com quote e produto orbitando",
      "layout editorial estilo 'perfil de cliente' — produto à esquerda, testemunho à direita",
      "composição em camadas: fundo lifestyle blur + card de avaliação em primeiro plano + produto",
      "tipografia emocional — quote em escrita manuscrita/display + dados em sans-serif clean",
      "composição radial centrada nas estrelas/rating com quote em arco e produto na base",
      "layout de conversa — quote em balão de diálogo premium, produto como contexto",
      "mosaico de micro-provas (estrelas, número, quote, selo) organizados em grid harmônico",
    ],
    avoid: [
      "produto dominando a peça — aqui quem fala é o cliente, não a marca",
      "aspecto frio e corporativo — social proof precisa de calor humano",
      "quotes genéricos sem atribuição — 'um cliente' é menos poderoso que 'Maria, SP'",
      "layout idêntico a um banner de produto — a estrutura deve ser diferente para o cérebro ler como 'opinião'",
    ],
  },

  educational: {
    essence:
      "O AHA MOMENT. A peça deve ENSINAR algo sobre o produto que o cliente não sabia. " +
      "Clareza é rainha — cada informação tem seu espaço definido. Pense manual premium " +
      "da Apple + infográfico da National Geographic. Organizado, bonito, iluminador.",
    designPrinciples: [
      "Informação hierárquica e organizada — numeração, callouts, ícones informativos",
      "O produto é referência visual (apontam para ele) mas os benefícios/features são o conteúdo",
      "Grid implícito organizando a informação — mesmo que não visível, a estrutura é sentida",
      "Ícones lineares modernos para representar cada benefício/feature — dão escaneabilidade",
      "Tipografia com clara distinção entre título, corpo e callouts — hierarquia informacional",
      "Uso de linhas finas, setas, connectors para guiar o olhar pelo conteúdo",
      "Paleta mais neutra/clean para não competir com a informação",
    ],
    compositionApproaches: [
      "produto central com callouts numerados irradiando para os lados com linhas conectoras finas",
      "layout estilo infográfico vertical — produto no topo, features em cascata descendente",
      "grid de benefícios com ícones — 2x2 ou 3 colunas com produto integrado como elemento do grid",
      "composição de manual técnico premium — produto em hero shot + especificações em tipografia monospace",
      "layout de comparação antes/depois ou com/sem para destacar o diferencial",
      "composição em timeline — etapas de uso do produto em sequência visual",
      "layout de 'ficha técnica premium' — dados organizados em módulos visuais distintos",
      "produto com overlay de anotações estilo 'raio-x' — revelando qualidades internas",
      "composição em pirâmide informacional — benefício principal no topo, detalhes na base",
      "layout magazine — produto em foto hero + sidebar de features como coluna editorial",
    ],
    avoid: [
      "poluição visual com texto demais — educacional não é enciclopédia",
      "layout sem estrutura visível — informação precisa de organização clara",
      "produto como herói sem contexto educacional — o foco é o conteúdo, não a foto",
      "tipografia uniforme para tudo — sem hierarquia, parece um bloco de texto chato",
    ],
  },

  date: {
    essence:
      "CELEBRAÇÃO COM CLASSE. O produto está embrulhado em emoção sazonal — não é só um " +
      "item à venda, é um presente, uma experiência, um gesto. A data temática é textura " +
      "e atmosfera, não fantasia kitsch. Pense Tiffany no Natal, não loja de R$1,99.",
    designPrinciples: [
      "Elementos sazonais como TEXTURA, não como protagonista — sutileza > exagero",
      "A emoção da data (amor, gratidão, celebração) deve ser sentida no tom da peça",
      "Produto como 'presente perfeito' — enquadramento que sugere gift-giving",
      "Paleta cromática respeitando a data mas filtrada pela identidade da marca",
      "Tipografia pode ser mais expressiva/decorativa que o normal — a data permite personalidade",
      "Ornamentos e decorações como moldura, não como conteúdo — emolduram o produto",
      "Badge ou tag da data como elemento de ancoragem — identifica imediatamente o contexto",
    ],
    compositionApproaches: [
      "produto como presente central com ornamentos sazonais sutis emoldurando a composição",
      "layout de cartão comemorativo premium — moldura temática + produto como conteúdo",
      "composição com textura de fundo sazonal (papel de presente, flores, flocos) + produto em destaque",
      "split temático — cor/ícone da data de um lado, produto elegante do outro",
      "composição com fita/laço decorativo como elemento gráfico cruzando a peça",
      "layout de vitrine de loja decorada para a data — produto em contexto festivo refinado",
      "tipografia emocional grande (mensagem da data) + produto como assinatura visual",
      "composição circular/oval — produto envolto por elementos sazonais em arranjo orgânico",
      "layout editorial estilo 'guia de presentes' — produto como recomendação curada",
      "composição com gradiente temático (tons da data) e produto emergindo do ambiente",
    ],
    avoid: [
      "exagero de elementos temáticos — vira kitsch rapidamente",
      "ignorar a data completamente — a peça deve ser claramente sazonal",
      "usar clipart ou elementos genéricos de data — tudo deve ser refinado",
      "esquecer do produto em favor da decoração — ele ainda é o motivo da peça",
    ],
  },

  winback: {
    essence:
      "BEM-VINDO DE VOLTA. Abraço quente em forma de anúncio. O cliente sumiu e a marca " +
      "estende a mão com carinho + incentivo (cupom). Tom emocional mas não desesperado. " +
      "Saudade genuína + oportunidade irresistível.",
    designPrinciples: [
      "Tom emocional na headline — a tipografia deve transmitir calor e acolhimento",
      "Cupom/desconto como gesto de carinho — visualmente destacado mas não gritante como promo",
      "Paleta quente (âmbar, coral, dourado) misturada com cores da marca — conforto visual",
      "Produto como 'velho amigo' — contextualizado em cenário familiar, não clínico",
      "Hierarquia: emoção (headline) → incentivo (cupom) → produto → ação",
      "Luz golden hour / amber — sensação de fim de tarde acolhedor",
      "Menos urgência, mais convite — a pressão é emocional, não temporal",
    ],
    compositionApproaches: [
      "headline emocional dominante em tipografia expressiva + cupom como presente visual abaixo",
      "composição de carta pessoal — layout que remete a mensagem manuscrita premium",
      "produto em cenário lifestyle quente (mesa, lar) com voucher flutuando como convite",
      "layout de boas-vindas — porta aberta / caminho visual levando ao produto",
      "split emocional — mensagem acolhedora de um lado, produto + incentivo do outro",
      "composição centrada no cupom/voucher como elemento gráfico principal, produto como teaser",
      "layout de 'convite' — bordas delicadas, tipografia elegante, produto como atração do evento",
      "composição em layers: fundo quente desfocado + mensagem + produto em primeiro plano",
      "layout diagonal suave — fluxo visual descendente da emoção para a ação",
      "composição circular com produto no centro, mensagem emocional orbitando como abraço visual",
    ],
    avoid: [
      "tom desesperado ou insistente — 'VOLTE AGORA!!!' é repulsivo",
      "visual idêntico a promo — winback tem energia diferente, mais suave",
      "esquecer do incentivo — sem cupom/desconto, por que o cliente voltaria?",
      "frieza corporativa — essa peça precisa de humanidade e calor",
    ],
  },

  featured: {
    essence:
      "O PEDESTAL. O produto é soberano e a composição existe apenas para reverenciá-lo. " +
      "Luxo silencioso — negative space como declaração de confiança. A marca não precisa " +
      "gritar porque o produto fala sozinho. Pense editorial Hermès, capa Kinfolk.",
    designPrinciples: [
      "Negative space GENEROSO é o recurso mais poderoso — espaço vazio é luxo",
      "Produto em escala dominante com detalhes de textura e material visíveis",
      "Tipografia elegante e MÍNIMA — poucas palavras, cada uma escolhida com cuidado",
      "Iluminação cinematográfica como segundo protagonista — luz E sombra contam a história",
      "Paleta sóbria, refinada — menos cores = mais elegância",
      "Composição 'still life' — cada elemento posicionado com intenção de curadoria",
      "A marca é assinatura discreta, não grito — logotipo pequeno, bem posicionado",
    ],
    compositionApproaches: [
      "produto em isolamento majestoso — centralizado com oceano de negative space ao redor",
      "composição still-life curada — produto + 1-2 elementos contextuais em arranjo intencional",
      "crop dramático macro — detalhe do produto em escala monumental revelando textura/material",
      "layout editorial assimétrico — produto off-center com tipografia no espaço complementar",
      "composição de galeria de arte — produto como obra, nome como placa de exposição",
      "layout monocromático com produto como único elemento de cor — destaque por contraste",
      "composição vertical com produto flutuando em gravidade zero + iluminação escultural",
      "layout split minimalista — produto em foto premium + dados mínimos em tipografia fina",
      "composição em diagonal sutil — produto inclinado delicadamente criando dinamismo contido",
      "layout de catálogo luxury — produto em contexto premium (mármore, madeira, tecido) com espaço generoso",
    ],
    avoid: [
      "poluição visual com muitos elementos — featured é sobre essência, não abundância",
      "tipografia grande e bold competindo com o produto — menos texto, mais produto",
      "iluminação flat sem drama — sem luz interessante, vira foto de catálogo genérico",
      "fundo genérico sem intenção — cada pixel do fundo deve servir ao produto",
    ],
  },
};

/* ──────────────────────────────────────────────────────────
 *  UNIVERSAL COMPOSITION PRINCIPLES
 *  Applied on top of section-specific DNA
 * ────────────────────────────────────────────────────────── */

const UNIVERSAL_PRINCIPLES = [
  "Hierarquia visual clara — o olho deve saber EXATAMENTE para onde olhar primeiro, segundo, terceiro",
  "Negative space é elemento ativo, não espaço vazio — ele dá respiro e sofisticação",
  "Tipografia com contraste de pesos (ultrabold vs light) cria hierarquia automática",
  "Composição assimétrica é mais dinâmica que simétrica — tension > equilíbrio estático",
  "Profundidade via layers (foreground, mid, background) tira a peça do 'flat design genérico'",
  "Cor como ferramenta de hierarquia — accent color guia o olho para a ação desejada",
  "Todo elemento deve justificar sua presença — se não agrega, remove",
  "O formato (1:1, 9:16, 4:5, 16:9) deve influenciar radicalmente a composição, não ser ignorado",
];

/* ──────────────────────────────────────────────────────────
 *  FORMAT-SPECIFIC GUIDANCE
 * ────────────────────────────────────────────────────────── */

const FORMAT_GUIDANCE: Record<string, string> = {
  "1:1":
    "Formato quadrado — composição pode usar diagonais, grid 2x2, ou centro focal com cantos ativos. " +
    "Funciona bem com layouts simétricos OU fortemente assimétricos.",
  "9:16":
    "Formato vertical alto (Stories/Reels) — o olho percorre de cima para baixo naturalmente. " +
    "Aproveite a altura para empilhar zonas (header → hero → corpo → CTA). Evite concentrar " +
    "tudo no centro deixando topo e base vazios.",
  "4:5":
    "Formato vertical suave (Feed alto) — mais equilibrado que 9:16. Bom para layouts split " +
    "horizontal ou composições com respiro vertical moderado. O terço inferior é a zona de ação.",
  "16:9":
    "Formato horizontal (banner/capa) — composição naturalmente flui da esquerda para a direita. " +
    "Ideal para split vertical (copy | produto) ou panorâmica com elemento focal off-center.",
};

/* ──────────────────────────────────────────────────────────
 *  DYNAMIC GENERATION
 * ────────────────────────────────────────────────────────── */

interface CompositionDirection {
  compositionHint: string;
  vibeEnhancement: string;
}

interface GenerateDirectionsParams {
  sectionId: SectionId;
  layoutVibe: string;
  productName: string;
  productCategory: string | null;
  brandName: string | null;
  brandPalette: string | null;
  formats: ("1:1" | "9:16" | "4:5" | "16:9")[];
  variations: number;
  scope: AIRouterScope;
}

const directionCache = new Map<string, { directions: CompositionDirection[]; ts: number }>();
const CACHE_TTL = 60_000;

function buildDirectorPrompt(params: GenerateDirectionsParams): string {
  const dna = COMPOSITION_DNA[params.sectionId];
  if (!dna) return "";

  const totalDirections = params.formats.length * params.variations;

  const formatDetails = params.formats
    .map((f) => `  - ${f}: ${FORMAT_GUIDANCE[f] || ""}`)
    .join("\n");

  return `Você é um diretor de arte de classe mundial especializado em composição publicitária para produtos.

CONTEXTO:
- Seção: ${params.sectionId}
- Produto: ${params.productName}${params.productCategory ? ` (${params.productCategory})` : ""}
- Marca: ${params.brandName || "sem marca definida"}
- Paleta: ${params.brandPalette || "a definir"}
- Formatos: ${params.formats.join(", ")}
- Variações por formato: ${params.variations}
- Total de direções necessárias: ${totalDirections}

ESSÊNCIA DESTA SEÇÃO:
${dna.essence}

PRINCÍPIOS DE DESIGN PARA ESTA SEÇÃO:
${dna.designPrinciples.map((p) => `• ${p}`).join("\n")}

ABORDAGENS COMPOSICIONAIS (inspiração, não limites):
${dna.compositionApproaches.map((a) => `• ${a}`).join("\n")}

O QUE EVITAR:
${dna.avoid.map((a) => `• ${a}`).join("\n")}

PRINCÍPIOS UNIVERSAIS:
${UNIVERSAL_PRINCIPLES.map((p) => `• ${p}`).join("\n")}

FORMATOS E SUAS PARTICULARIDADES:
${formatDetails}

TOM BASE DO LAYOUT:
${params.layoutVibe}

MISSÃO:
Gere ${totalDirections} direções composicionais ÚNICAS para esta campanha. Cada direção é para uma combinação de formato + variação.

REGRAS:
1. Cada direção deve ser uma descrição ESPECÍFICA de layout em 2-3 frases — onde o produto fica, como o texto flui, que elementos decorativos existem e onde, como a hierarquia funciona
2. TODAS as ${totalDirections} direções devem ser VISUALMENTE DISTINTAS entre si — layouts diferentes, hierarquias diferentes, uso de espaço diferente
3. Adaptadas ao formato específico (vertical, quadrado, horizontal mudam TUDO)
4. Qualidade de agência de publicidade premium — nada amador, nada genérico
5. Criativas e inesperadas — surpreenda, não repita fórmulas cansadas
6. Mantenha o tom da seção (${params.sectionId}) — a criatividade serve ao objetivo de marketing

Responda APENAS com JSON válido neste formato:
{
  "directions": [
    {
      "compositionHint": "descrição específica da composição para formato X variação Y",
      "vibeEnhancement": "refinamento do tom narrativo para esta variação"
    }
  ]
}

As ${totalDirections} direções devem ser ordenadas: primeiro todas as variações do primeiro formato, depois do segundo, etc.`;
}

export async function generateCompositionDirections(
  params: GenerateDirectionsParams
): Promise<CompositionDirection[]> {
  const totalDirections = params.formats.length * params.variations;

  const cacheKey = `${params.sectionId}:${params.productName}:${params.formats.join(",")}:${params.variations}:${Date.now().toString(36).slice(0, -2)}`;
  const cached = directionCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.directions;
  }

  try {
    const prompt = buildDirectorPrompt(params);
    if (!prompt) {
      logger.warn("compositionDirector: no DNA found for section, using fallback");
      return [];
    }

    const result = await Promise.race([
      aiRouter.generateJson<{ directions: CompositionDirection[] }>(
        prompt,
        params.scope,
        { temperature: 0.95 }
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 12_000)
      ),
    ]);

    const directions = result?.directions;
    if (!Array.isArray(directions) || directions.length === 0) {
      logger.warn("compositionDirector: LLM returned empty directions");
      return [];
    }

    const valid = directions
      .filter(
        (d) =>
          d &&
          typeof d.compositionHint === "string" &&
          d.compositionHint.length >= 30
      )
      .slice(0, totalDirections);

    if (valid.length > 0) {
      directionCache.set(cacheKey, { directions: valid, ts: Date.now() });
    }

    logger.info(
      `compositionDirector: generated ${valid.length}/${totalDirections} dynamic directions for ${params.sectionId}`
    );
    return valid;
  } catch (err: any) {
    logger.warn(
      `compositionDirector: LLM call failed (${err?.message || err}), will use static fallback`
    );
    return [];
  }
}

export { COMPOSITION_DNA, type SectionEssence, type CompositionDirection };
