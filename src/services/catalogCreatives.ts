/**
 * Catalog-aware creative composer.
 *
 * The existing CreativeStudioService is a low-level engine: it accepts
 * style/scene/lighting/headline/CTA/aspectRatio/etc and produces images.
 * That's powerful but it's not what a salon owner or restaurateur wants
 * to fill in. They want: "promote this product → done."
 *
 * This module bridges that gap. Given a product and a "section" (Promo,
 * Launch, Social proof, Educational, Date, Win-back, Featured), it:
 *   1. Reads the brand kit (logo, colors, slogan, voice)
 *   2. Reads the product (name, description, price, promoPrice, features, image)
 *   3. Computes the right tone, headline, subheadline, CTA, scene, lighting
 *   4. Calls CreativeStudioService.generateProductStudioImages with everything
 *      pre-filled — the user never touches a prompt field.
 */

import { CreativeStudioService } from "./creativeStudio";
import { query, queryOne } from "../config/database";
import { logger } from "../utils/logger";
import { generateCompositionDirections } from "./compositionDirector";
import { listStudioImageModels } from "../config/ai-models";

export type SectionId =
  | "promo"
  | "launch"
  | "social-proof"
  | "educational"
  | "date"
  | "winback"
  | "featured";

export interface SectionDef {
  id: SectionId;
  label: string;
  /** lucide-react component name. UI must NEVER render emojis — always
   *  render the matching <Icon /> from lucide. */
  iconName: string;
  description: string;
  /** Aspect ratios this section feels best in. */
  formats: ("1:1" | "9:16" | "4:5" | "16:9")[];
  /** Default style for the section's vibe. */
  style: string;
  /** Default scene context. */
  scene: string;
  lighting: string;
  textPosition: "top" | "center" | "bottom";
  textStyle: "bold" | "minimal" | "elegant";
  /** Heuristic that picks the strongest CTA verb for the section. */
  ctaPool: string[];
}

export const SECTIONS: SectionDef[] = [
  {
    id: "promo",
    label: "Promoção",
    iconName: "Tag",
    description: "Oferta com desconto, urgência, condição especial.",
    formats: ["1:1", "9:16"],
    style: "bold promotional retail product ad, energetic composition, conversion focused",
    scene: "vibrant studio backdrop with bold accent color from the brand palette",
    lighting: "high contrast bright lighting with crisp shadows",
    textPosition: "bottom",
    textStyle: "bold",
    ctaPool: ["Aproveitar agora", "Pedir já", "Comprar com desconto", "Garantir oferta"],
  },
  {
    id: "launch",
    label: "Lançamento",
    iconName: "Rocket",
    description: "Novidade que acabou de entrar no catálogo.",
    formats: ["1:1", "9:16", "4:5"],
    style: "high-end editorial product reveal, Apple keynote sophistication, dramatic unveiling with generous negative space, magazine cover quality, restrained luxury",
    scene: "theatrical hero stage with subtle gradient backdrop, product floating as absolute protagonist, cinematic depth-of-field separating subject from background, premium material textures visible",
    lighting: "dramatic directional studio light with pronounced rim highlight separating product from background, soft key light revealing surface detail, subtle gradient shadow creating depth",
    textPosition: "top",
    textStyle: "elegant",
    ctaPool: ["Conhecer agora", "Ver detalhes", "Ser dos primeiros", "Quero conhecer"],
  },
  {
    id: "social-proof",
    label: "Prova social",
    iconName: "Quote",
    description: "Depoimento, avaliação ou conquista para gerar confiança.",
    formats: ["1:1", "9:16"],
    style: "warm testimonial-driven product ad with human authenticity, decorative quotation marks as graphic element, star rating prominent, trust-building composition with real-world warmth, D2C brand storytelling quality",
    scene: "warm lifestyle context with natural textures (wood, linen, marble), product present but secondary to the human voice, subtle depth blur creating intimacy, rating stars or quote marks as bold graphic anchors",
    lighting: "warm golden hour directional light with soft fill, subtle orange/amber cast for authenticity, gentle shadows creating depth without harshness",
    textPosition: "center",
    textStyle: "minimal",
    ctaPool: ["Ver mais avaliações", "Quero também", "Provar agora", "Junte-se aos clientes"],
  },
  {
    id: "educational",
    label: "Educacional",
    iconName: "BookOpen",
    description: "Explica como usar, benefícios, comparativo.",
    formats: ["1:1", "4:5"],
    style: "premium infographic-style product ad, Apple manual meets National Geographic clarity, structured visual hierarchy with numbered callouts, modern linear icons, organized benefit zones, clean but not boring",
    scene: "clean premium studio surface with structured negative space for callouts and annotations, subtle grid lines or connector elements guiding the eye, product as reference anchor with information radiating outward",
    lighting: "even soft diffused studio light with balanced exposure, subtle directional shadow under product for grounding, clean and clinical but premium — not flat",
    textPosition: "center",
    textStyle: "minimal",
    ctaPool: ["Saiba mais", "Como funciona", "Veja os detalhes", "Tirar dúvidas"],
  },
  {
    id: "date",
    label: "Datas comemorativas",
    iconName: "Gift",
    description: "Mães, Pais, Natal, Black Friday, aniversário da marca.",
    formats: ["1:1", "9:16"],
    style: "refined celebratory product ad with tasteful seasonal elements, Tiffany-level festive elegance, themed decor as subtle texture not spectacle, gift-giving emotion, product as the perfect present, premium seasonal campaign quality",
    scene: "sophisticated seasonal environment with curated thematic elements (ribbons, ornaments, florals, seasonal colors) as refined FRAMING around the product, not overwhelming it — the product is the gift, the decoration is the wrapping",
    lighting: "warm celebratory lighting with soft bokeh highlights suggesting festivity, gentle color cast matching the season (warm gold for Christmas, soft pink for Mothers Day, dramatic red/black for Black Friday), depth creating atmosphere",
    textPosition: "bottom",
    textStyle: "bold",
    ctaPool: ["Comprar para presentear", "Aproveitar a data", "Garantir o seu", "Pedir agora"],
  },
  {
    id: "winback",
    label: "Recuperação",
    iconName: "Heart",
    description: "Trazer cliente inativo de volta, lembrar de carrinho.",
    formats: ["1:1", "9:16"],
    style: "emotionally warm product ad with welcoming invitation, voucher/coupon as visual gift element, personal letter quality, gentle emotional pull with tangible incentive, comfort-brand storytelling",
    scene: "cozy inviting environment with warm textures (wood, warm fabrics, soft surfaces), product presented as a familiar friend waiting, coupon/voucher badge as a highlighted gift element, atmosphere of homecoming warmth",
    lighting: "warm amber golden hour light with soft diffusion, gentle lens flare or warm color cast, intimate directional light creating cozy shadows — evening at home feeling",
    textPosition: "center",
    textStyle: "minimal",
    ctaPool: ["Voltar a comprar", "Retomar pedido", "Sentimos sua falta", "Recuperar carrinho"],
  },
  {
    id: "featured",
    label: "Destaque",
    iconName: "Award",
    description: "Showcase premium do produto, vitrine elegante.",
    formats: ["1:1", "4:5", "9:16"],
    style: "luxury still-life product showcase with generous negative space, Hermès editorial quality, magazine cover reverence, product sovereignty with minimal typography intervention, material texture emphasis, quiet confidence",
    scene: "elegant curated stage with premium surface materials (marble, dark wood, brushed metal, matte fabric), product as sovereign centerpiece with deliberate surrounding objects for context, gallery-like negative space declaring luxury",
    lighting: "cinematic studio key light with sculpted controlled shadows, subtle rim light separating product from background, reflections on premium surfaces, high-end product photography with visible material quality",
    textPosition: "bottom",
    textStyle: "elegant",
    ctaPool: ["Conhecer o produto", "Ver no catálogo", "Quero esse", "Comprar agora"],
  },
];

/* ──────────────────────────────────────────────────────────
 *  LAYOUT TEMPLATES
 *
 *  A "section" tells you the marketing intent (promo, launch, social-proof…)
 *  while a "layout" tells the model HOW to compose the visual: anatomy of
 *  the canvas, where the logo sits, how the product is staged, what
 *  decorative elements live in which corner.
 *
 *  The anatomy text lands verbatim in the prompt — that's what stops the
 *  model from defaulting to "headline + black banner" and pushes it toward
 *  multi-zone editorial composition. Every template is in pt-BR because
 *  Gemini and Grok render Portuguese cleanly when the briefing is also
 *  in Portuguese (English briefings end up with mistranslated micro-copy).
 *
 *  Pick a layout per section by default; let the user override via the
 *  configure modal (dropdown).
 * ────────────────────────────────────────────────────────── */

export interface LayoutTemplate {
  id: string;
  label: string;
  description: string;
  /** Tom narrativo do criativo — o "vibe" da peça. Curto e descritivo,
   *  NÃO um roteiro de zonas. Deixa o modelo livre pra compor. */
  vibe: string;
  /** Pool rotativo de hints composicionais. Cada variação que o usuário
   *  pede pega UM hint diferente desse pool, garantindo que 3 variações
   *  saiam com layouts realmente distintos (em vez de 3 cópias do
   *  mesmo molde). */
  compositionHints: string[];
  recommendedFormats: ("1:1" | "9:16" | "4:5" | "16:9")[];
  bestForSections: SectionId[];
}

export const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  {
    id: "promo-premium",
    label: "Promo Premium",
    description: "Tom promocional premium — valor em destaque, urgência elegante, CTA forte.",
    vibe: `TOM DA PEÇA: promoção PREMIUM com urgência elegante. A peça deve GRITAR valor (preço em destaque visível, oferta clara, CTA confiante) sem parecer barata. Tipografia bold confiante, contraste alto, accent color saliente. Sensação de "vale muito a pena agora". Inspiração: campanhas Apple Black Friday, anúncios premium de supermercado gourmet.`,
    compositionHints: [
      "Hero do produto à direita ocupando 50% da largura, copy alinhada à esquerda, preço em destaque ENORME embaixo da headline, CTA pill abaixo, 3 ícones de feature em coluna na base.",
      "Hero centralizado e dominante, copy embaixo em uma linha forte, preço gigante na lateral em destaque vertical, CTA discreto na base com selos de confiança alinhados.",
      "Layout assimétrico: hero diagonal saindo do canto inferior direito, headline alinhada ao topo esquerdo, preço como badge circular destacado, CTA pill na base esquerda.",
      "Composição vertical em camadas: logomarca topo central, hero no terço médio, copy + preço grande + CTA empilhados na base com bastante respiro.",
      "Split clássico: copy + preço + CTA alinhados à esquerda, hero do produto à direita com pequena rotação dramática, faixa de selos minimalista no rodapé.",
    ],
    recommendedFormats: ["4:5", "1:1"],
    bestForSections: ["promo", "featured", "winback"],
  },
  {
    id: "launch-editorial",
    label: "Lançamento Editorial",
    description: "Tom de revelação — capa de revista, sofisticação, novidade.",
    vibe: `TOM DA PEÇA: lançamento sofisticado, sensação de REVELAÇÃO TEATRAL. O produto está sendo desvelado ao mundo pela primeira vez — cada elemento da composição existe para servi-lo. Minimalismo INTENCIONAL (não vazio): negative space generoso é declaração de confiança, não falta de ideia. Tipografia editorial com personalidade — mix de pesos cria sofisticação. Iluminação como narrativa (rim light, spotlight, gradient sutil). Menos elementos = mais impacto. Inspiração: Apple Keynote slides, Aesop product reveals, capas da Kinfolk, editoriais Hermès.`,
    compositionHints: [
      "Hero do produto centralizado e dominante sobre stage minimalista, headline ultra-bold curta abaixo em uma linha, sem distrações.",
      "Hero ligeiramente off-center à esquerda com headline alinhada à direita em peso light grande, espaçamento generoso, tag NOVIDADE pequena no canto.",
      "Composição vertical: tag NOVIDADE no topo, hero no centro flutuando, nome em tipografia mista (serif + sans) abaixo, CTA discreto no rodapé.",
      "Hero saindo do topo da peça (cropped), nome enorme do produto ocupando a metade inferior em peso editorial heavy.",
      "Split horizontal: cor sólida da marca à esquerda com headline grande em branco, foto do produto à direita sobre fundo neutro.",
    ],
    recommendedFormats: ["1:1", "4:5", "9:16"],
    bestForSections: ["launch", "featured"],
  },
  {
    id: "social-proof-testimonial",
    label: "Prova Social",
    description: "Tom de confiança — depoimento, avaliação, prova humana.",
    vibe: `TOM DA PEÇA: CONFIANÇA HUMANA transferida ao produto. A voz de quem já comprou é mais poderosa que qualquer copy da marca. O depoimento/avaliação é a ÂNCORA VISUAL — aspas decorativas gigantes ou estrelas oversize como elemento gráfico principal (não apenas informação). O produto aparece mas não domina: está ali como prova do que o cliente elogia. Tom quente, autêntico, acolhedor — como recomendação de amigo. Inspiração: campanhas Glossier com clientes reais, Nubank storytelling, reviews estilo editorial.`,
    compositionHints: [
      "5 estrelas em ouro centralizadas no topo, quote em itálico grande no centro, atribuição em peso bold abaixo, produto pequeno discreto no canto.",
      "Aspas decorativas gigantes em accent color como elemento gráfico, quote integrado às aspas, produto à direita em escala média.",
      "Layout split: foto/avatar circular do cliente à esquerda + quote curto, produto à direita com sombra premium.",
      "Quote dominando a metade superior, badge '+10mil clientes' em accent, produto na base como assinatura visual.",
      "Card de avaliação flutuante (estrelas + quote + nome) sobre composição lifestyle do produto em uso.",
    ],
    recommendedFormats: ["1:1", "4:5"],
    bestForSections: ["social-proof"],
  },
  {
    id: "educational-infographic",
    label: "Educacional Infográfico",
    description: "Tom didático — explicação clara, callouts, benefícios.",
    vibe: `TOM DA PEÇA: o AHA MOMENT — a peça ENSINA algo que o cliente não sabia sobre o produto. Clareza é rainha: cada informação tem seu espaço definido num grid implícito. Callouts numerados, ícones lineares modernos, linhas conectoras finas guiando o olho. O produto é referência visual (apontam para ele) mas os benefícios são o conteúdo. Tipografia com clara distinção hierárquica entre título, corpo e callouts. Tom de manual premium Apple meets infográfico National Geographic — organizado, bonito, iluminador. NUNCA entediante.`,
    compositionHints: [
      "Produto central com 3-4 callouts numerados ao redor, linhas finas conectando os números ao produto, descrições curtas.",
      "Lista vertical de benefícios numerados à esquerda (1. 2. 3. 4.), produto à direita como referência visual.",
      "Diagrama tipo 'antes e depois' ou 'comparativo': produto destaque + 2-3 benefícios em cards minimalistas embaixo.",
      "Headline 'Conheça [produto]' no topo, produto no centro, ícones de característica em linha horizontal na base com labels curtas.",
      "Layout estilo manual: produto em hero shot, 3 colunas embaixo cada uma com ícone + título + descrição.",
    ],
    recommendedFormats: ["1:1", "4:5"],
    bestForSections: ["educational"],
  },
  {
    id: "date-festive",
    label: "Datas Festivas",
    description: "Tom comemorativo — celebrar uma data, edição especial.",
    vibe: `TOM DA PEÇA: CELEBRAÇÃO COM CLASSE. O produto está embrulhado em emoção sazonal — é um presente, uma experiência, um gesto de carinho. Elementos temáticos como TEXTURA refinada (fitas, ornamentos, flores sazonais), NUNCA como fantasia kitsch. A emoção da data (amor, gratidão, celebração) é SENTIDA no tom da peça. Tipografia pode ser mais expressiva/decorativa — a data permite personalidade. Ornamentos EMOLDURAM o produto, não competem com ele. Sensação de presente Tiffany bem embrulhado, não loja de variedades. Inspiração: campanhas sazonais Lancôme, Jo Malone Christmas, Lindt premium.`,
    compositionHints: [
      "Ornamentos temáticos delicados nos cantos superiores (folhas/corações/balões adaptado), hero centralizado, badge da data como tag rotacionada.",
      "Peça toda como cartão de presente: laço/fita decorativa cruzando a composição, produto como 'presente', headline emocional.",
      "Composição split: badge grande da data à esquerda em tipografia decorativa, produto à direita com luz quente festiva.",
      "Padrão decorativo de fundo (papel de presente sutil), produto em destaque centralizado, tagline emocional curta.",
      "Hero do produto + ornamento sazonal abraçando ele (ramos, flores, etc), CTA pill em accent color contrastante.",
    ],
    recommendedFormats: ["1:1", "4:5", "9:16"],
    bestForSections: ["date"],
  },
  {
    id: "winback-warm",
    label: "Recuperação Acolhedora",
    description: "Tom emocional convidativo — sentimos sua falta + cupom.",
    vibe: `TOM DA PEÇA: BEM-VINDO DE VOLTA — abraço quente em forma de anúncio. O cliente sumiu e a marca estende a mão com carinho genuíno + incentivo tangível (cupom/desconto como PRESENTE visual, não como promoção gritante). Headline emocional em tipografia expressiva que transmite calor. Paleta quente (âmbar, coral, dourado) misturada com cores da marca. Menos urgência, mais convite — a pressão é emocional, não temporal. Produto como 'velho amigo esperando'. Luz golden hour/amber criando sensação de fim de tarde acolhedor. Inspiração: campanhas de fidelidade Nespresso, cartas pessoais estilizadas.`,
    compositionHints: [
      "Headline emocional grande à esquerda ('Sentimos sua falta'), produto à direita flutuando, cupom como badge circular destacado.",
      "Composição centralizada: headline emocional no topo, cupom enorme no meio (tipo voucher), produto pequeno na base como teaser.",
      "Layout warm: produto à esquerda em ambiente lifestyle, mensagem emocional + cupom à direita em card cremoso.",
      "Cupom rotacionado dramaticamente como elemento principal, produto secundário ao fundo desfocado, CTA pill convidativo.",
      "Vertical: logomarca topo, headline 'Volta pra gente', produto centro, cupom em badge brilhante na base, CTA pill embaixo.",
    ],
    recommendedFormats: ["1:1", "4:5"],
    bestForSections: ["winback"],
  },
  {
    id: "showcase-vitrine",
    label: "Showcase Vitrine",
    description: "Tom de vitrine luxury — produto soberano, mínima distração.",
    vibe: `TOM DA PEÇA: PEDESTAL DE LUXO — o produto é soberano e a composição existe para reverenciá-lo. Negative space GENEROSO como declaração de confiança e luxo silencioso. Produto em escala dominante com detalhes de textura e material visíveis. Iluminação cinematográfica como segundo protagonista (luz E sombra contam a história). Tipografia elegante e MÍNIMA — poucas palavras, cada uma com peso. Composição still-life com intenção de curadoria de galeria. A marca é assinatura discreta, não grito. Inspiração: editoriais Hermès, campanhas Aesop, capas Kinfolk, vitrines Celine.`,
    compositionHints: [
      "Produto absolutamente centralizado em hero shot, nome do produto em tipografia editorial elegante na base, espaçamento generoso ao redor.",
      "Produto off-center sobre fundo gradiente luxury, copy minimal alinhada ao canto oposto em peso light.",
      "Composição still-life: produto + 1-2 elementos relacionados (ingrediente, utensílio) em arranjo intencional, luz cinematográfica.",
      "Hero do produto cropado dramaticamente (close detalhes), nome em peso heavy ocupando metade da peça.",
      "Layout vertical clean: nome da marca topo, produto hero centro com bastante respiro, preço sutil + CTA pill discreto na base.",
    ],
    recommendedFormats: ["1:1", "4:5"],
    bestForSections: ["featured", "launch"],
  },
];

export const LAYOUT_INDEX: Record<string, LayoutTemplate> = LAYOUT_TEMPLATES.reduce((acc, l) => {
  acc[l.id] = l;
  return acc;
}, {} as Record<string, LayoutTemplate>);

/** Pick the best layout for a section when the caller doesn't specify one. */
export function defaultLayoutForSection(sectionId: SectionId): LayoutTemplate {
  const match = LAYOUT_TEMPLATES.find((t) => t.bestForSections.includes(sectionId));
  return match || LAYOUT_TEMPLATES[0];
}

export const SECTION_INDEX: Record<SectionId, SectionDef> = SECTIONS.reduce((acc, s) => {
  acc[s.id] = s;
  return acc;
}, {} as Record<SectionId, SectionDef>);

/* ────────────────────────────────────────────────────────── */
/*  Composition logic                                         */
/* ────────────────────────────────────────────────────────── */

interface ComposedCreative {
  productId: string;
  sectionId: SectionId;
  /** Pre-built params ready to call generateProductStudioImages. */
  studioParams: {
    productId: string;
    productAssetId?: string;
    provider?: "gemini" | "grok" | "openai";
    productDescription?: string;
    style: string;
    scene: string;
    lighting: string;
    targetAudience?: string;
    predominantColors?: string;
    aspectRatio: "1:1" | "9:16" | "4:5" | "16:9";
    formats: ("1:1" | "9:16" | "4:5" | "16:9")[];
    textOverlay: {
      headline: string;
      subheadline?: string;
      cta: string;
      position: "top" | "center" | "bottom";
      style: "bold" | "minimal" | "elegant";
    };
    variations: number;
    quality: "fast" | "high";
    withAndWithoutText: boolean;
    tags: string[];
  };
  /** Hint info shown in the UI before generating ("you'll get N images, ~Xs"). */
  estimate: {
    jobs: number;
    seconds: number;
    creditsCost: number;
  };
}

/* Brazilian currency formatting that matches what the catalog UI uses. */
function formatBRL(cents: number | string | null | undefined): string {
  const n = Number(cents || 0);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function discountPct(price: number, promo: number): number {
  if (!price || !promo || promo >= price) return 0;
  return Math.round(((price - promo) / price) * 100);
}

function pickFromPool<T>(pool: T[], seed: string): T {
  /* Deterministic-ish pick from the section's CTA pool, so the same product +
   * section always defaults to the same CTA. The user can edit it after, but
   * a stable default is friendlier than random. */
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % pool.length;
  return pool[idx];
}

interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number | null;
  promo_price: number | null;
  unit: string | null;
  features: any;
  image_url: string | null;
  created_at: string | null;
}

interface BrandRow {
  id: string;
  name: string | null;
  slogan: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  voice_json: any;
  logo_url: string | null;
}

function parseJsonish(value: any, fallback: any = null): any {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function asArray(value: any): string[] {
  const v = parseJsonish(value, value);
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === "string" && v.trim()) {
    return v.split(",").map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

/* All values the user can tweak in the configuration modal. Every field is
 * optional — defaults come from `composeStudioParams`. */
export interface ComposeOverrides {
  variations?: number;
  quality?: "fast" | "high";
  formats?: ("1:1" | "9:16" | "4:5" | "16:9")[];
  /** Free-form intent: "vender", "lancar", "gerar interesse", etc. Goes
   *  straight into the prompt as a high-level objective. */
  objective?: string;
  /** Override the visual mood without rewriting the whole prompt. */
  style?: string;
  scene?: string;
  lighting?: string;
  /** User-edited copy — replaces the auto-suggested defaults. */
  headline?: string;
  subheadline?: string;
  cta?: string;
  textPosition?: "top" | "center" | "bottom";
  textStyle?: "bold" | "minimal" | "elegant";
  /** Brand voice overrides. Default reads voice_json. */
  tone?: string;
  targetAudience?: string;
  /** When true, instruct the image model to render the typography directly
   *  in the picture (Grok Imagine excels at this). When false (default),
   *  the studio paints text via SVG overlay after generation — more
   *  consistent legibility but typography looks "stuck on top". */
  embedTextInImage?: boolean;
  /** Pinned palette hint (hex csv). Overrides brand kit. */
  predominantColors?: string;
  /** Anatomical layout to apply (ID from LAYOUT_TEMPLATES). When omitted,
   *  defaultLayoutForSection() picks one based on the section. */
  layoutId?: string;
  /** Whether to inject the brand logo as a reference image AND mention it
   *  in the prompt anatomy. Default true — uncheck for unbranded compositions. */
  includeBrandLogo?: boolean;
  /** Override image provider for this generation (composer selector). */
  provider?: "openai" | "gemini" | "grok" | "atlas";
  /** Override image model id for this generation. */
  imageModel?: string;
  referenceAssetIds?: string[];
  additionalComponents?: string[];
}

/**
 * Translate (product, section, brand) into ready-to-fire studio parameters.
 * No DB calls here — pure function so it's easy to test and reason about.
 *
 * Every override in `options` wins over the defaults derived from the
 * section + product so the configuration modal can let users tweak anything.
 */
export function composeStudioParams(
  product: ProductRow,
  section: SectionDef,
  brand: BrandRow | null,
  options: ComposeOverrides = {}
): ComposedCreative["studioParams"] {
  const features = asArray(product.features).slice(0, 3);
  const voice = parseJsonish(brand?.voice_json, {});
  const audience = String(options.targetAudience || voice?.audience || "clientes prontos para comprar pelo WhatsApp ou catálogo");

  const price = Number(product.price || 0);
  const promo = Number(product.promo_price || 0);
  const hasPromo = promo > 0 && promo < price;
  const pct = hasPromo ? discountPct(price, promo) : 0;

  /* Default copy per section — used unless the caller passes an override.
   * These are starting points, NOT a literal copy of the product fields:
   * the modal lets the user (or a separate IA call) replace them entirely. */
  let headline = "";
  let subheadline = "";

  switch (section.id) {
    case "promo":
      if (hasPromo) {
        headline = `${product.name}\n${formatBRL(promo)}`;
        subheadline = `De ${formatBRL(price)} por ${formatBRL(promo)} · ${pct}% off`;
      } else {
        headline = product.name;
        /* Short copy ("R$ 15,00 / kg") survives the image generator's
         * typography rendering better than long phrases. Gemini in
         * particular truncates words like "apenas" mid-render. */
        subheadline = `${formatBRL(price)}${product.unit ? ` / ${product.unit}` : ""}`;
      }
      break;
    case "launch":
      headline = `Chegou: ${product.name}`;
      subheadline = features[0] || product.description?.slice(0, 70) || `Disponível no catálogo da ${brand?.name || "loja"}`;
      break;
    case "social-proof":
      headline = `Por que escolhem ${product.name}`;
      subheadline = features[0] || `${brand?.slogan || "Cliente satisfeito, marca de confiança"}`;
      break;
    case "educational":
      headline = `Conheça ${product.name}`;
      subheadline = features.length ? features.join(" · ") : product.description?.slice(0, 90) || product.name;
      break;
    case "date":
      headline = product.name;
      subheadline = `Edição especial · ${brand?.name || "Loja"}`;
      break;
    case "winback":
      headline = `Sentimos sua falta`;
      subheadline = `${product.name} ainda te espera${hasPromo ? ` por ${formatBRL(promo)}` : ""}`;
      break;
    case "featured":
    default:
      headline = product.name;
      subheadline = features[0] || product.description?.slice(0, 70) || `${formatBRL(price)}${product.unit ? ` / ${product.unit}` : ""}`;
      break;
  }

  const ctaDefault = pickFromPool(section.ctaPool, `${product.id}:${section.id}`);

  /* Apply overrides on top of defaults. Empty strings count as "not set". */
  if (options.headline && options.headline.trim()) headline = options.headline;
  if (options.subheadline && options.subheadline.trim()) subheadline = options.subheadline;
  const cta = options.cta && options.cta.trim() ? options.cta : ctaDefault;

  /* Build the predominant-colors hint from the brand kit. The studio passes
   * this verbatim into the Gemini prompt, which biases palette toward those
   * hex values. */
  const palette = options.predominantColors || [brand?.primary_color, brand?.secondary_color].filter(Boolean).join(", ");

  /* Section vibe defaults — overridable. */
  const style = options.style || section.style;
  const scene = options.scene || section.scene;
  const lighting = options.lighting || section.lighting;
  const textPosition = options.textPosition || section.textPosition;
  const textStyle = options.textStyle || section.textStyle;

  /* Final formats (filter to known ratios + cap at 4 to keep budget sane). */
  const allowedFormats: Array<"1:1" | "9:16" | "4:5" | "16:9"> = ["1:1", "9:16", "4:5", "16:9"];
  let formats = (options.formats || section.formats).filter((f) => allowedFormats.includes(f));
  if (!formats.length) formats = section.formats;
  formats = formats.slice(0, 4);

  /* Tag the asset so the gallery can filter by section + product later.
   * We embed the product name as a tag too (e.g. "productName:Alho 500g")
   * so the gallery preview can render a friendly label without an extra
   * lookup. The studio's tag normalizer strips weird chars but keeps it
   * mostly intact. */
  const tags = [
    `section:${section.id}`,
    `product:${product.id}`,
    `productName:${(product.name || "").slice(0, 80)}`,
    brand?.id ? `brand:${brand.id}` : "",
    options.embedTextInImage ? "text:embedded" : "text:overlay",
    options.objective ? `objective:${options.objective.replace(/\s+/g, "-").toLowerCase().slice(0, 24)}` : "",
  ].filter(Boolean) as string[];

  /* If the user asked the model to draw the text into the image itself,
   * we DON'T pass headline/subheadline/cta to the textOverlay — otherwise
   * the studio also draws an SVG layer on top, doubling the text. Instead
   * we encode them in the scene description so the model paints them. */
  const wantsEmbed = !!options.embedTextInImage;
  const sceneWithText = wantsEmbed
    ? `${scene}. Render the following typography natively in the image, integrated into the design (no flat overlay): primary headline "${headline.replace(/\n/g, " — ")}", supporting line "${subheadline}", call-to-action button labeled "${cta}". Use ${textStyle} typography that matches the section mood.`
    : scene;

  /* Build a rich text description of the product for Grok (which can't see
   * the reference photo). Combines name, category, features and unit so the
   * model has enough to render plausible packaging. */
  const productDescription = [
    product.name,
    product.category ? `category: ${product.category}` : "",
    product.unit ? `unit: ${product.unit}` : "",
    features.length ? `features: ${features.join(", ")}` : "",
    product.description ? `details: ${product.description.slice(0, 200)}` : "",
  ].filter(Boolean).join(" — ");

  /* Resolve the layout (anatomy) — caller's pick wins, otherwise we suggest
   * one based on the section. The anatomy text gets baked into the prompt
   * downstream to push the model toward multi-zone composition. */
  const layout = options.layoutId && LAYOUT_INDEX[options.layoutId]
    ? LAYOUT_INDEX[options.layoutId]
    : defaultLayoutForSection(section.id);

  /* Brand identity bundle — every aspect of the brand kit that the prompt
   * should know about (name, slogan, palette, voice, logo presence). */
  const includeBrandLogo = options.includeBrandLogo !== false; /* default true */
  const brandIdentity = {
    name: brand?.name || "",
    slogan: brand?.slogan || "",
    primaryColor: brand?.primary_color || "",
    secondaryColor: brand?.secondary_color || "",
    voiceTone: String((parseJsonish(brand?.voice_json, {}))?.tone || options.tone || ""),
    includeLogo: includeBrandLogo && !!brand?.logo_url,
  };

  /* Provider routing is NOT decided here. The studio service consults
   * aiRouter.getImageProvider() at generation time so that whatever the
   * user selected in "Provedores IA → Image" is the source of truth.
   * We leave `provider` undefined so the studio reads it from prefs.
   *
   * The `embedTextInImage` flag still exists, but it now only changes
   * the prompt structure (whether the typography description goes into
   * the scene block or the textOverlay block), NOT the provider. */
  const provider: "gemini" | "grok" | "openai" | undefined = undefined;

  return {
    productId: product.id,
    provider,
    productDescription,
    style,
    /* When using Grok we keep the text instruction inside the scene so the
     * model paints typography natively. With Gemini, we let the textOverlay
     * carry that — but ALSO ask Gemini to render text inside the image
     * (no SVG layer is added downstream). */
    scene: wantsEmbed ? sceneWithText : scene,
    lighting,
    targetAudience: audience,
    predominantColors: palette || undefined,
    aspectRatio: formats[0],
    formats,
    /* Pass headline/subheadline/cta to the studio prompt regardless of
     * provider — both providers now render the typography natively, since
     * the studio no longer paints an SVG overlay on top. */
    textOverlay: {
      headline,
      subheadline,
      cta,
      position: textPosition,
      style: textStyle,
    },
    variations: Math.min(4, Math.max(1, options.variations || 2)),
    quality: options.quality || "high",
    withAndWithoutText: false,
    tags,
    /* Layout vibe + composition hint pool. The studio's prompt builder
     * picks ONE hint per variation (rotating through the pool) so multiple
     * variations come out with different layouts instead of identical
     * copies of a rigid template. */
    layoutVibe: layout.vibe,
    layoutCompositionHints: layout.compositionHints,
    layoutLabel: layout.label,
    brandIdentity,
  } as any;
}

/**
 * Build sample copy variations the modal can show as one-click pick options.
 * No model call here — these are template-based variations using product
 * data + section vibe. Cheap, instant, deterministic. The caller can also
 * fire `generateAiHeadlineSuggestions` for fancier IA-generated variants.
 */
export function templateHeadlineVariations(
  product: ProductRow,
  section: SectionDef,
  brand: BrandRow | null
): Array<{ headline: string; subheadline: string }> {
  const price = Number(product.price || 0);
  const promo = Number(product.promo_price || 0);
  const hasPromo = promo > 0 && promo < price;
  const pct = hasPromo ? discountPct(price, promo) : 0;
  const features = asArray(product.features).slice(0, 3);
  const brandName = brand?.name || "nossa loja";

  const variants: Array<{ headline: string; subheadline: string }> = [];

  switch (section.id) {
    case "promo":
      if (hasPromo) {
        variants.push({ headline: `${product.name}\n${formatBRL(promo)}`, subheadline: `De ${formatBRL(price)} por ${formatBRL(promo)} · ${pct}% off` });
        variants.push({ headline: `−${pct}% no ${product.name}`, subheadline: `Aproveite enquanto dura · só ${formatBRL(promo)}` });
        variants.push({ headline: `Economize ${formatBRL(price - promo)}`, subheadline: `${product.name} sai por ${formatBRL(promo)}` });
      } else {
        variants.push({ headline: product.name, subheadline: `Por ${formatBRL(price)}${product.unit ? ` / ${product.unit}` : ""}` });
        variants.push({ headline: `${product.name}\nem oferta`, subheadline: features[0] || `Direto do produtor · ${brandName}` });
      }
      break;
    case "launch":
      variants.push({ headline: `Chegou: ${product.name}`, subheadline: features[0] || `Novidade na ${brandName}` });
      variants.push({ headline: `Você vai amar`, subheadline: `${product.name} agora no catálogo` });
      variants.push({ headline: product.name, subheadline: `Disponível agora · ${brandName}` });
      break;
    case "social-proof":
      variants.push({ headline: `Por que escolhem ${product.name}`, subheadline: features[0] || brand?.slogan || "" });
      variants.push({ headline: `O preferido dos nossos clientes`, subheadline: `${product.name} é sucesso na ${brandName}` });
      variants.push({ headline: `Feito do jeito certo`, subheadline: features.join(" · ") || product.name });
      break;
    case "educational":
      variants.push({ headline: `Conheça ${product.name}`, subheadline: features.length ? features.join(" · ") : product.description?.slice(0, 90) || product.name });
      variants.push({ headline: `Como usar ${product.name}`, subheadline: features[0] || `Praticidade no dia a dia` });
      variants.push({ headline: product.name, subheadline: `Tudo que você precisa saber` });
      break;
    case "date":
      variants.push({ headline: product.name, subheadline: `Edição especial · ${brandName}` });
      variants.push({ headline: `Para uma data especial`, subheadline: `${product.name} foi feito pra esse momento` });
      variants.push({ headline: `${brandName}\nessa data tem ${product.name}`, subheadline: `Garante o seu` });
      break;
    case "winback":
      variants.push({ headline: `Sentimos sua falta`, subheadline: `${product.name} ainda te espera${hasPromo ? ` por ${formatBRL(promo)}` : ""}` });
      variants.push({ headline: `Já faz um tempo…`, subheadline: `${product.name} ainda está aqui pra você` });
      variants.push({ headline: `Volte pra ${brandName}`, subheadline: hasPromo ? `${product.name} a ${formatBRL(promo)}` : `Catálogo cheio de novidades` });
      break;
    case "featured":
    default:
      variants.push({ headline: product.name, subheadline: features[0] || product.description?.slice(0, 70) || `Disponível na ${brandName}` });
      variants.push({ headline: `Em destaque`, subheadline: product.name });
      variants.push({ headline: `Vitrine`, subheadline: `${product.name} · ${brandName}` });
      break;
  }
  /* Dedupe + cap at 3 distinct entries. */
  const seen = new Set<string>();
  return variants.filter((v) => {
    const key = `${v.headline}|${v.subheadline}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}

/* ────────────────────────────────────────────────────────── */
/*  DB lookups + orchestration                                */
/* ────────────────────────────────────────────────────────── */

/** Resolve column names defensively — some installs use legacy names. */
async function loadProduct(productId: string, brandId?: string | null): Promise<ProductRow | null> {
  const candidates = [
    `SELECT id, name, description, category, price, promo_price, unit, features, image_url, created_at
       FROM products WHERE id = ? LIMIT 1`,
    `SELECT id, name, description, category, price, promotional_price AS promo_price, unit, features, image_url, created_at
       FROM products WHERE id = ? LIMIT 1`,
  ];
  for (const sql of candidates) {
    try {
      const row = await queryOne<ProductRow>(sql, [productId]);
      if (row) return row;
    } catch {}
  }
  return null;
}

async function loadBrand(brandId: string): Promise<BrandRow | null> {
  try {
    const row = await queryOne<BrandRow>(
      `SELECT id, name, slogan, primary_color, secondary_color, voice_json, logo_url
         FROM brand_units WHERE id = ? LIMIT 1`,
      [brandId]
    );
    if (row) return row;
  } catch {}
  return null;
}

/** Reuse the existing studio asset for this product image if we already
 *  registered one — avoids re-uploading the same product image every time. */
async function findExistingProductAssetId(
  userId: string,
  productId: string,
  brandId?: string | null
): Promise<string | null> {
  try {
    const row = await queryOne<{ id: string }>(
      `SELECT id FROM creative_assets
        WHERE user_id = ?
          AND COALESCE(brand_id::text, '') = COALESCE(?::text, '')
          AND asset_type = 'image'
          AND model = 'upload-manual'
          AND metadata->'studio'->>'productId' = ?
          AND metadata->'studio'->>'imageType' = 'product'
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId, brandId || null, productId]
    );
    return row?.id || null;
  } catch (err: any) {
    /* The query uses Postgres JSONB syntax — if we're on MySQL or the column
     * shape differs, just fall back to "no existing asset" and let the caller
     * register a new one. Not a blocking error. */
    return null;
  }
}

/**
 * Idempotent registration of the brand logo as a studio asset. Looked up
 * via tag `brand-logo:<brandId>` — if there's an existing asset for this
 * brand, reuse it instead of re-uploading. The asset is then passed as
 * a reference image alongside the product, so the model paints the actual
 * logo (no hallucinated brand-marks).
 */
async function ensureBrandLogoAsset(
  studio: CreativeStudioService,
  userId: string,
  brand: BrandRow,
  brandId: string
): Promise<string | null> {
  /* Look for cached logo asset. Same JSONB syntax as findExistingProductAssetId. */
  try {
    const row = await queryOne<{ id: string }>(
      `SELECT id FROM creative_assets
        WHERE user_id = ?
          AND asset_type = 'image'
          AND model = 'upload-manual'
          AND metadata->'studio'->>'imageType' = 'reference'
          AND metadata->'studio'->'tags' @> ?::jsonb
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId, JSON.stringify([`brand-logo:${brandId}`])]
    );
    if (row?.id) return row.id;
  } catch {
    /* Postgres-only syntax. On other engines just skip the cache. */
  }
  /* Not cached — register fresh. */
  const normalized = normalizeProductImageUrl(brand.logo_url);
  if (!normalized) return null;
  try {
    const asset = await studio.registerStudioImage(
      userId,
      {
        fileUrl: normalized,
        imageType: "reference",
        originalName: `${brand.name || "brand"}-logo.png`,
        caption: `${brand.name || "Brand"} logomark`,
        tags: [`brand-logo:${brandId}`, "type:logo"],
      },
      brandId
    );
    return asset.id;
  } catch {
    return null;
  }
}

/* Convert any URL form ("https://app.../uploads/x.png", "/uploads/x.png",
 * "uploads/x.png") into the relative form CreativeStudioService expects. */
function normalizeProductImageUrl(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  /* Absolute URL with /uploads/ inside: strip everything before /uploads/. */
  const match = trimmed.match(/\/uploads\/.+$/);
  if (match) return match[0];
  /* Bare relative path: ensure leading slash. */
  if (trimmed.startsWith("uploads/")) return "/" + trimmed;
  /* External URL or unrecognized: return as-is — register will likely fail
   * downstream, surfaced as a clear error to the user. */
  return trimmed;
}

interface AutoComposeResult {
  composed: ComposedCreative;
  assets: any[];
  product: { id: string; name: string };
  section: { id: SectionId; label: string };
}

export interface PreviewResult {
  product: {
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    price: number | null;
    promo_price: number | null;
    unit: string | null;
    image_url: string | null;
  };
  section: SectionDef;
  brand: {
    id: string | null;
    name: string | null;
    slogan: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    logo_url: string | null;
  } | null;
  /** Pre-filled studio params using only section+product defaults. */
  defaults: ComposedCreative["studioParams"];
  /** Three template-based copy variants the user can one-click pick. */
  copySuggestions: Array<{ headline: string; subheadline: string }>;
  /** All available CTA options pulled from the section pool, plus the
   *  default-picked one as the first item. */
  ctaSuggestions: string[];
  /** Style options the modal exposes — UI shows them as chips. */
  styleOptions: Array<{ id: string; label: string; description: string }>;
  /** Format catalog so the modal can render checkboxes with friendly labels. */
  formatOptions: Array<{ id: "1:1" | "9:16" | "4:5" | "16:9"; label: string; description: string }>;
  /** Layouts available for this section (the suggested one is first). */
  layoutOptions: Array<{
    id: string;
    label: string;
    description: string;
    recommended: boolean;
  }>;
  /** Default flag — true means "include brand logo as reference image". */
  includeBrandLogoDefault: boolean;
  /** Current default image provider (Master · Algoritmos / prefs). */
  imageProvider: {
    provider: "openai" | "gemini" | "grok" | "atlas";
    model: string;
    /** Whether the chosen provider has an API key configured. When false,
     *  the modal shows a warning and a link to Provedores IA. */
    keyConfigured: boolean;
  };
  /** Models selectable in the org creative composer (refs-capable preferred). */
  imageModelOptions: Array<{
    provider: string;
    id: string;
    label: string;
    tier: string;
    cost_label?: string;
    description?: string;
    supports_references: boolean;
  }>;
}

const STYLE_OPTIONS = [
  { id: "bold promotional retail product ad, energetic composition, conversion focused", label: "Bold", description: "Cores fortes, energia, foco em conversão" },
  { id: "premium commercial product ad, editorial lighting, sophisticated reveal feel", label: "Premium", description: "Editorial sofisticado, qualidade revista" },
  { id: "minimal clean ecommerce product ad, refined whitespace, premium simplicity", label: "Minimal", description: "Espaço em branco refinado, simplicidade" },
  { id: "realistic 3d studio product render, cinematic lighting, polished surfaces", label: "3D realista", description: "Iluminação cinematográfica, superfícies polidas" },
  { id: "warm authentic lifestyle product ad, real moment feel, trustworthy", label: "Lifestyle", description: "Cena natural, momento real" },
];

const FORMAT_OPTIONS: Array<{ id: "1:1" | "9:16" | "4:5" | "16:9"; label: string; description: string }> = [
  { id: "1:1", label: "Feed", description: "Quadrado 1:1 — Instagram" },
  { id: "9:16", label: "Story", description: "Vertical 9:16 — Stories e Reels" },
  { id: "4:5", label: "Vertical", description: "Retrato 4:5 — Feed alto" },
  { id: "16:9", label: "Banner", description: "Horizontal 16:9 — capa, anúncio" },
];

/**
 * Like autoComposeAndGenerate but DOES NOT call the image model. Used by
 * the configuration modal to populate fields before the user generates.
 */
export async function previewComposition(
  userId: string,
  input: {
    productId: string;
    sectionId: SectionId;
    brandId?: string | null;
  }
): Promise<PreviewResult> {
  const section = SECTION_INDEX[input.sectionId];
  if (!section) throw new Error(`Unknown section: ${input.sectionId}`);

  const loadedProduct = input.productId ? await loadProduct(input.productId, input.brandId) : null;
  const product = loadedProduct || ({
    id: "", name: "Seu produto", description: "Produto a definir no configurador",
    category: "", price: null, promo_price: null, unit: "", image_url: null,
  } as any);
  if (!product) throw new Error("Produto não encontrado");

  const brand = input.brandId ? await loadBrand(input.brandId) : null;
  const defaults = composeStudioParams(product, section, brand);
  const copySuggestions = templateHeadlineVariations(product, section, brand);

  /* Resolve the current image provider from user preferences so the modal
   * can show which engine will run the generation. */
  const { aiRouter } = await import("./aiRouter");
  const imagePref = await aiRouter.getImageProvider({
    userId,
    brandId: input.brandId || undefined,
  }, {
    functionKey: "image.product.studio",
  });

  /* Make the default CTA the first option so the modal pre-selects it. */
  const defaultCta = defaults.textOverlay.cta;
  const ctaSuggestions = [defaultCta, ...section.ctaPool.filter((c) => c !== defaultCta)];

  return {
    product: {
      id: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
      price: product.price,
      promo_price: product.promo_price,
      unit: product.unit,
      image_url: product.image_url,
    },
    section,
    brand: brand ? {
      id: brand.id,
      name: brand.name,
      slogan: brand.slogan,
      primary_color: brand.primary_color,
      secondary_color: brand.secondary_color,
      logo_url: brand.logo_url,
    } : null,
    defaults,
    copySuggestions,
    ctaSuggestions,
    styleOptions: STYLE_OPTIONS,
    formatOptions: FORMAT_OPTIONS,
    /* Layouts the user can pick. The recommended one for this section is
     * surfaced first so the dropdown opens with the right default. */
    layoutOptions: (() => {
      const recommended = defaultLayoutForSection(section.id);
      const sorted = [
        recommended,
        ...LAYOUT_TEMPLATES.filter((l) => l.id !== recommended.id),
      ];
      return sorted.map((l) => ({
        id: l.id,
        label: l.label,
        description: l.description,
        recommended: l.id === recommended.id,
      }));
    })(),
    includeBrandLogoDefault: !!brand?.logo_url,
    imageProvider: {
      provider: imagePref.provider,
      model: imagePref.model,
      keyConfigured: !!imagePref.key,
    },
    imageModelOptions: listStudioImageModels().map((m) => ({
      provider: m.provider,
      id: m.id,
      label: m.label,
      tier: m.tier,
      cost_label: m.cost_label,
      description: m.description,
      supports_references: !!m.supports_references,
    })),
  };
}

/**
 * One-shot auto-compose: fetch product + brand, pick params from section,
 * register the product image as a studio asset (if not already), and call
 * the studio generator. Returns generated assets ready to render in UI.
 *
 * Now accepts the full ComposeOverrides set so the user can fine-tune
 * everything via the configuration modal before clicking Generate.
 */
export async function autoComposeAndGenerate(
  studio: CreativeStudioService,
  userId: string,
  input: {
    productId: string;
    sectionId: SectionId;
    brandId?: string | null;
    overrides?: ComposeOverrides;
  }
): Promise<AutoComposeResult> {
  const section = SECTION_INDEX[input.sectionId];
  if (!section) throw new Error(`Unknown section: ${input.sectionId}`);

  const product = await loadProduct(input.productId, input.brandId);
  if (!product) throw new Error("Produto não encontrado");

  const brand = input.brandId ? await loadBrand(input.brandId) : null;

  const studioParams = composeStudioParams(product, section, brand, input.overrides || {});
  if (input.overrides?.referenceAssetIds?.length) {
    (studioParams as any).referenceAssetIds = [...input.overrides.referenceAssetIds];
  }
  if (input.overrides?.additionalComponents?.length) {
    const labels: Record<string, string> = {
      price: "preço em destaque", benefits: "lista curta de benefícios", badge: "selo promocional",
      "social-proof": "prova social", "secondary-cta": "chamada para ação complementar",
    };
    const requested = input.overrides.additionalComponents.map((id) => labels[id] || id).join(", ");
    (studioParams as any).scene = `${(studioParams as any).scene || ""}. Inclua na composição: ${requested}.`.trim();
  }

  /* Dynamic composition: replace static rotation hints with LLM-generated
   * directions so every generation has a unique layout. Falls back to the
   * static hints silently if the LLM call fails or times out. */
  try {
    const dynamicDirections = await generateCompositionDirections({
      sectionId: section.id,
      layoutVibe: (studioParams as any).layoutVibe || "",
      productName: product.name,
      productCategory: product.category,
      brandName: brand?.name || null,
      brandPalette: [brand?.primary_color, brand?.secondary_color].filter(Boolean).join(", ") || null,
      formats: studioParams.formats,
      variations: studioParams.variations,
      scope: { userId, brandId: input.brandId || undefined },
    });

    if (dynamicDirections.length > 0) {
      (studioParams as any).layoutCompositionHints = dynamicDirections.map((d) => d.compositionHint);
      if (dynamicDirections[0].vibeEnhancement) {
        (studioParams as any).layoutVibe = dynamicDirections[0].vibeEnhancement;
      }
      logger.info(`auto-compose: using ${dynamicDirections.length} dynamic composition directions`);
    }
  } catch (err: any) {
    logger.warn(`auto-compose: dynamic composition skipped (${err?.message || err}), using static hints`);
  }

  /* Asset hookup: register the product image (or reuse) so Gemini receives
   * the actual product photo as visual reference. */
  let productAssetId = await findExistingProductAssetId(userId, product.id, input.brandId);
  if (!productAssetId) {
    const normalized = normalizeProductImageUrl(product.image_url);
    if (normalized) {
      try {
        const asset = await studio.registerStudioImage(
          userId,
          {
            fileUrl: normalized,
            imageType: "product",
            productId: product.id,
            originalName: `${product.name}.jpg`,
            caption: product.name,
            tags: [`product:${product.id}`],
          },
          input.brandId
        );
        productAssetId = asset.id;
        logger.info(`auto-compose: registered product asset ${asset.id} for product=${product.id} brand=${input.brandId || 'none'}`);
      } catch (err: any) {
        logger.warn(`auto-compose: failed to register product image — ${err?.message || err}`);
        /* Not fatal: we still send the prompt with no image reference. The
         * model will draw something thematic from the description alone. */
      }
    }
  } else {
    logger.info(`auto-compose: reusing existing product asset ${productAssetId} for product=${product.id}`);
  }
  if (productAssetId) studioParams.productAssetId = productAssetId;

  /* Register the brand logo as a reference image too, so the model gets
   * the actual logo (no fake brand-marks). Cached as a creative_asset
   * tagged `brand-logo:<brandId>` to avoid re-uploading every gen. */
  const includeLogo = input.overrides?.includeBrandLogo !== false;
  if (includeLogo && brand?.logo_url && input.brandId) {
    try {
      const logoAssetId = await ensureBrandLogoAsset(studio, userId, brand, input.brandId);
      if (logoAssetId) {
        const refs = (studioParams as any).referenceAssetIds || [];
        (studioParams as any).referenceAssetIds = [...refs, logoAssetId];
        logger.info(`auto-compose: attached brand logo asset ${logoAssetId} as reference`);
      }
    } catch (err: any) {
      logger.warn(`auto-compose: skipped brand logo (${err?.message || err})`);
    }
  }

  /* Image provider/model override from composer selector (org UI). */
  if (input.overrides?.provider) {
    (studioParams as any).provider = input.overrides.provider;
  }
  if (input.overrides?.imageModel) {
    (studioParams as any).imageModel = input.overrides.imageModel;
  }

  logger.info(
    `auto-compose: invoking generateProductStudioImages userId=${userId} brandId=${input.brandId || "none"} productAssetId=${productAssetId || "none"} layout=${(studioParams as any).layoutLabel || "-"} provider=${(studioParams as any).provider || "auto"} model=${(studioParams as any).imageModel || "auto"}`,
  );

  const result = await studio.generateProductStudioImages(
    userId,
    studioParams as any,
    input.brandId
  );

  return {
    composed: {
      productId: product.id,
      sectionId: section.id,
      studioParams,
      estimate: {
        jobs: studioParams.formats.length * studioParams.variations,
        seconds: studioParams.formats.length * studioParams.variations * 6,
        creditsCost: studioParams.formats.length * studioParams.variations,
      },
    },
    assets: (result as any).assets || [],
    product: { id: product.id, name: product.name },
    section: { id: section.id, label: section.label },
  };
}

/* ────────────────────────────────────────────────────────── */
/*  Proactive suggestions                                     */
/* ────────────────────────────────────────────────────────── */

export interface CreativeSuggestion {
  productId: string;
  productName: string;
  productImage: string | null;
  sectionId: SectionId;
  sectionLabel: string;
  reason: string;
  badge?: string;
}

/**
 * Heuristic-based "what should I post today?" suggestions. Three rules,
 * ordered by likely impact:
 *   1. Has an active promoPrice → pitch a Promo creative.
 *   2. Recently created (< 7d) → pitch a Launch creative.
 *   3. Active and has full info but no recent creative → pitch Featured.
 *
 * No ML, no scoring black-box: rules the user can predict. We dedupe to
 * surface different products in different cards.
 */
export async function getProactiveSuggestions(
  userId: string,
  brandId: string | null | undefined,
  max = 3
): Promise<CreativeSuggestion[]> {
  const out: CreativeSuggestion[] = [];
  const seen = new Set<string>();

  const params: any[] = [userId];
  let scope = "user_id = ?";
  if (brandId) {
    scope += " AND brand_id = ?";
    params.push(brandId);
  }

  /* Try the modern column set first; fall back if not present. */
  const fetchers: Array<{ sql: string; sectionId: SectionId; reason: (r: any) => string; badge?: string }> = [
    {
      sql: `SELECT id, name, image_url, price, promo_price, created_at
              FROM products
             WHERE ${scope}
               AND COALESCE(active, is_active, true) = true
               AND promo_price IS NOT NULL
               AND price IS NOT NULL
               AND promo_price < price
             ORDER BY (price - promo_price) DESC
             LIMIT 5`,
      sectionId: "promo",
      reason: (r) => {
        const pct = discountPct(Number(r.price), Number(r.promo_price));
        return `Promoção ativa: ${pct}% de desconto`;
      },
      badge: "Promo",
    },
    {
      sql: `SELECT id, name, image_url, price, promo_price, created_at
              FROM products
             WHERE ${scope}
               AND COALESCE(active, is_active, true) = true
               AND created_at > NOW() - INTERVAL '14 days'
             ORDER BY created_at DESC
             LIMIT 5`,
      sectionId: "launch",
      reason: () => "Adicionado recentemente",
      badge: "Novo",
    },
    {
      sql: `SELECT id, name, image_url, price, promo_price, created_at
              FROM products
             WHERE ${scope}
               AND COALESCE(active, is_active, true) = true
               AND image_url IS NOT NULL
             ORDER BY created_at DESC
             LIMIT 5`,
      sectionId: "featured",
      reason: () => "Vitrine premium do catálogo",
      badge: "Destaque",
    },
  ];

  for (const f of fetchers) {
    try {
      const rows = (await query<any>(f.sql, params)) as any[];
      for (const r of rows || []) {
        if (out.length >= max) break;
        const id = String(r.id);
        if (seen.has(id)) continue;
        seen.add(id);
        const section = SECTION_INDEX[f.sectionId];
        out.push({
          productId: id,
          productName: String(r.name || ""),
          productImage: r.image_url || null,
          sectionId: f.sectionId,
          sectionLabel: section.label,
          reason: f.reason(r),
          badge: f.badge,
        });
      }
    } catch (err: any) {
      logger.debug(`suggestion query skipped: ${err?.message || err}`);
    }
    if (out.length >= max) break;
  }

  return out.slice(0, max);
}
