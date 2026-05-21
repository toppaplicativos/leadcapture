/**
 * PRODUCT INTELLIGENCE
 * Transforma o catálogo bruto em contexto rico que o agente realmente entende:
 * descrição completa (sem truncar), TODAS as features, metadata, faixa de preço.
 *
 * Não inventa nada — apenas formata melhor o que já existe no banco.
 */

export interface RawProduct {
  id?: string;
  name?: string;
  subtitle?: string;
  description?: string;
  category?: string;
  category_name?: string;
  price?: number | string;
  promoPrice?: number | string;
  promo_price?: number | string;
  features?: string[];
  unit?: string;
  active?: boolean;
  is_active?: boolean;
  image?: string;
  imageUrl?: string;
  images?: string[];
  galleryImages?: string[];
  metadata?: Record<string, any>;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  /* OfferEntity foundation (Fase 0) */
  type?: string;
  cta_type?: string;
  pipeline_id?: string | null;
  attributes?: Record<string, any>;
  seo?: Record<string, any>;
  media?: Record<string, any>;
  /* Variants (Fase 1) */
  variants?: Array<{
    id?: string;
    sku?: string | null;
    name?: string | null;
    attributes?: Record<string, any>;
    price?: number | null;
    promo_price?: number | null;
    stock_quantity?: number | null;
    is_active?: boolean;
  }>;
  /* Service config (Fase 5) */
  service_config?: {
    duration_minutes?: number;
    buffer_minutes?: number;
    max_per_slot?: number;
    weekday_hours?: Array<{ weekday: number; start: string; end: string }>;
    requires_address?: boolean;
    advance_notice_hours?: number;
    max_advance_days?: number;
  };
  /* Bundle items (Fase 11) */
  bundle_items?: Array<{ product_id: string; quantity: number; optional?: boolean; note?: string }>;
  /* Inventory (Fase 12) — agent uses this to set urgency, propose alternatives,
   * or refuse to promise something we don't have. */
  stock_quantity?: number | null;
  stock_status?: "in_stock" | "low_stock" | "out_of_stock" | "unlimited";
  stock_threshold_low?: number;
  /* Configurator (Fase 4) */
  configurator?: {
    enabled?: boolean;
    groups?: Array<{
      id: string;
      name: string;
      required?: boolean;
      min_select?: number;
      max_select?: number;
      options: Array<{
        id: string;
        name: string;
        price_delta?: number;
        description?: string;
        is_active?: boolean;
      }>;
    }>;
  };
}

const WEEKDAY_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Friendly Portuguese labels for OfferType — helps the agent reason about the right pitch. */
const TYPE_LABELS: Record<string, string> = {
  physical_product: "produto físico",
  physical: "produto físico",
  digital_product: "produto digital",
  service: "serviço",
  vehicle: "veículo",
  real_estate: "imóvel",
  subscription: "assinatura",
  consortium: "consórcio",
  food: "alimento",
  custom_quote: "orçamento sob medida",
  appointment: "agendamento",
  course: "curso",
  event: "evento",
  bundle: "kit / combo",
};

/** Friendly labels for the call-to-action — guides the agent on what to propose. */
const CTA_LABELS: Record<string, string> = {
  buy: "vender direto (adicionar ao carrinho)",
  quote: "coletar dados para enviar orçamento",
  whatsapp: "manter conversa por aqui mesmo (WhatsApp)",
  schedule: "agendar atendimento ou visita",
  simulate: "oferecer simulação (parcelas/condições)",
  visit: "agendar visita presencial",
  subscribe: "oferecer assinatura recorrente",
  custom: "ação customizada (verifique metadados)",
};

interface FormattedProduct {
  block: string;
  name: string;
}

function moneyBR(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "preço sob consulta";
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

/** Normalize description: keep line breaks, collapse only horizontal whitespace, trim runs of blank lines. */
function cleanDescription(raw: string): string {
  return String(raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isRecentlyAdded(createdAt: unknown): boolean {
  if (!createdAt) return false;
  const ts = new Date(createdAt as any).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < 14 * 24 * 60 * 60 * 1000; /* 14 days */
}

function isRecentlyUpdated(createdAt: unknown, updatedAt: unknown): boolean {
  if (!updatedAt) return false;
  const ts = new Date(updatedAt as any).getTime();
  const cts = createdAt ? new Date(createdAt as any).getTime() : 0;
  if (!Number.isFinite(ts)) return false;
  /* Considered "updated" only if updated meaningfully after creation, in last 14d */
  return ts - cts > 60_000 && Date.now() - ts < 14 * 24 * 60 * 60 * 1000;
}

function formatProduct(product: RawProduct, index: number): FormattedProduct | null {
  const name = String(product?.name || "").trim();
  if (!name) return null;
  const category = String(product?.category_name || product?.category || "").trim();
  const description = cleanDescription(String(product?.description || ""));
  const price = Number(product?.price || 0);
  const promoPrice = Number(product?.promoPrice ?? product?.promo_price ?? 0);
  const hasPromo = promoPrice > 0 && promoPrice < price;
  const features = Array.isArray(product?.features)
    ? product.features.map((f) => String(f || "").trim()).filter(Boolean)
    : [];
  const images = Array.isArray(product?.images)
    ? product.images.filter(Boolean)
    : [product?.imageUrl || product?.image].filter(Boolean) as string[];
  const imageCount = images.length;

  const priceLine = hasPromo
    ? `preço: ${moneyBR(promoPrice)} (promocional, de ${moneyBR(price)})`
    : `preço: ${moneyBR(price)}`;

  /* Surface metadata key/values when present (sku, weight, dimensions, brand, etc.) */
  const metadata = (product?.metadata && typeof product.metadata === "object") ? product.metadata : {};
  const metadataLines: string[] = [];
  const interestingKeys = ["sku", "barcode", "ean", "weight", "peso", "dimensions", "dimensoes", "brand", "marca", "manufacturer", "fabricante", "warranty", "garantia", "origin", "origem", "material", "color", "cor", "size", "tamanho", "ingredients", "ingredientes"];
  for (const key of interestingKeys) {
    const v = metadata[key];
    if (v != null && String(v).trim()) {
      metadataLines.push(`  - ${key}: ${String(v).trim()}`);
    }
  }

  const flags: string[] = [];
  if (isRecentlyAdded(product.createdAt)) flags.push("novidade");
  if (isRecentlyUpdated(product.createdAt, product.updatedAt)) flags.push("atualizado recentemente");

  const lines: string[] = [];
  lines.push(`▸ #${index + 1} ${name}`);
  const subtitle = String(product.subtitle || "").trim();
  if (subtitle) lines.push(`  subtítulo: ${subtitle}`);

  /* OfferEntity type + CTA — tells the agent what KIND of offer this is and HOW to close it */
  const typeKey = String(product.type || "physical_product").toLowerCase();
  const typeLabel = TYPE_LABELS[typeKey] || typeKey;
  const ctaKey = String(product.cta_type || "buy").toLowerCase();
  const ctaLabel = CTA_LABELS[ctaKey] || ctaKey;
  if (typeKey !== "physical_product" && typeKey !== "physical") {
    lines.push(`  tipo: ${typeLabel}`);
  }
  if (ctaKey !== "buy") {
    lines.push(`  ação esperada: ${ctaLabel}`);
  }

  if (category) lines.push(`  categoria: ${category}`);
  if (product.unit) lines.push(`  unidade: ${product.unit}`);
  lines.push(`  ${priceLine}`);

  /* Stock awareness (Fase 12) — guides agent on urgency + when to refuse the sale.
   * Skip when unlimited (no signal worth showing). When tracked, be very explicit
   * because the agent MUST refuse to promise sales of out-of-stock items. */
  const stockStatus = String(product.stock_status || "unlimited");
  const stockQty = product.stock_quantity === null || product.stock_quantity === undefined ? null : Number(product.stock_quantity);
  if (stockStatus === "out_of_stock" || (stockQty !== null && stockQty <= 0)) {
    lines.push(`  ESTOQUE: ESGOTADO — não prometa entrega; ofereça alternativa do mesmo segmento ou capture interesse para reposição.`);
  } else if (stockStatus === "low_stock" && stockQty !== null) {
    lines.push(`  ESTOQUE: restam ${stockQty} unid. (baixo) — use para gerar urgência genuína: "tenho só ${stockQty} no estoque agora".`);
  } else if (stockQty !== null) {
    lines.push(`  ESTOQUE: ${stockQty} unid. disponíveis.`);
  }
  /* else: unlimited / untracked → omit (no useful signal for the agent) */

  if (flags.length) lines.push(`  status: ${flags.join(" · ")}`);
  if (imageCount > 0) lines.push(`  fotos disponíveis: ${imageCount} (você PODE oferecer enviar foto se o cliente pedir)`);
  if (description) {
    /* Preserve line breaks from the seller — they often structure the description deliberately */
    const indented = description.split("\n").map((l) => `    ${l}`).join("\n");
    lines.push(`  descrição:\n${indented}`);
  }
  if (features.length) {
    lines.push(`  destaques:`);
    features.forEach((f) => lines.push(`    • ${f}`));
  }
  if (metadataLines.length) {
    lines.push(`  ficha técnica:`);
    metadataLines.forEach((l) => lines.push(l));
  }

  /* Dynamic attributes (Fase 0 jsonb) — render as ficha técnica adicional */
  const attrs = product.attributes || {};
  const attrEntries = Object.entries(attrs).filter(([_, v]) => v != null && String(v).trim());
  if (attrEntries.length) {
    lines.push(`  atributos:`);
    attrEntries.forEach(([k, v]) => lines.push(`    - ${k}: ${String(v)}`));
  }

  /* Service config (Fase 5) — agent uses this when proposing or confirming scheduling */
  const sc = product.service_config;
  if (sc && (typeKey === "service" || typeKey === "appointment") && Array.isArray(sc.weekday_hours) && sc.weekday_hours.length > 0) {
    const hoursByDay = new Map<number, Array<{ start: string; end: string }>>();
    for (const h of sc.weekday_hours) {
      const wd = Number(h.weekday);
      const arr = hoursByDay.get(wd) || [];
      arr.push({ start: String(h.start), end: String(h.end) });
      hoursByDay.set(wd, arr);
    }
    const dayLines = [...hoursByDay.entries()]
      .sort(([a], [b]) => a - b)
      .map(([wd, ranges]) => `      ${WEEKDAY_PT[wd] || `D${wd}`}: ${ranges.map(r => `${r.start}–${r.end}`).join(", ")}`);
    lines.push(`  agenda do serviço:`);
    lines.push(`    duração: ${sc.duration_minutes || 60} min${sc.buffer_minutes ? ` (intervalo ${sc.buffer_minutes} min entre atendimentos)` : ""}`);
    if (sc.max_per_slot && sc.max_per_slot > 1) lines.push(`    capacidade: ${sc.max_per_slot} agendamentos por horário`);
    if (sc.advance_notice_hours) lines.push(`    antecedência mínima: ${sc.advance_notice_hours} h`);
    if (sc.max_advance_days) lines.push(`    aceita agendamento até: ${sc.max_advance_days} dias no futuro`);
    if (sc.requires_address) lines.push(`    requer endereço (atendimento na casa do cliente)`);
    lines.push(`    horários:`);
    dayLines.forEach((l) => lines.push(l));
    lines.push(`    (Use esta agenda para propor horários ao cliente. NÃO invente disponibilidade fora desses dias/horários.)`);
  }

  /* Bundle (Fase 11) — show what's included in the kit (resolve names via product list) */
  const bundleItems = Array.isArray(product.bundle_items) ? product.bundle_items : [];
  if (bundleItems.length > 0) {
    lines.push(`  composição do kit (${bundleItems.length} ${bundleItems.length === 1 ? "item" : "itens"}):`);
    bundleItems.forEach((bi) => {
      /* The agent only sees source IDs; we don't have name lookup here.
       * The merchant can configure note: "Pasta de chimichurri" to make it self-describing. */
      const label = bi.note ? bi.note : `produto ${String(bi.product_id || "").slice(0, 8)}`;
      lines.push(`    • ${bi.quantity}× ${label}${bi.optional ? " (opcional)" : ""}`);
    });
    lines.push(`    (Este é um KIT — preço é o do conjunto, não a soma dos itens.)`);
  }

  /* Configurator (Fase 4) — describe groups + options + how price adapts */
  const cfg = product.configurator;
  if (cfg?.enabled && Array.isArray(cfg.groups) && cfg.groups.length > 0) {
    lines.push(`  configurador (cliente PODE montar):`);
    for (const g of cfg.groups) {
      const minSel = Number(g.min_select ?? (g.required ? 1 : 0));
      const maxSel = Number(g.max_select ?? 1);
      const ruleLabel = minSel === maxSel
        ? `escolher exatamente ${minSel}`
        : `escolher de ${minSel} até ${maxSel}`;
      lines.push(`    ▸ ${g.name} (${ruleLabel}${g.required ? " · obrigatório" : ""}):`);
      const activeOpts = (g.options || []).filter((o) => o.is_active !== false);
      activeOpts.forEach((o) => {
        const delta = Number(o.price_delta || 0);
        const priceTag = delta === 0 ? "" : delta > 0 ? ` (+${moneyBR(delta)})` : ` (${moneyBR(delta)})`;
        lines.push(`        • ${o.name}${priceTag}`);
      });
    }
    lines.push(`    (Preço final = preço base + soma dos deltas das opções escolhidas. Ajude o cliente a montar a combinação ideal.)`);
  }

  /* Variants (Fase 1) — let the agent know about available variations */
  const variants = Array.isArray(product.variants)
    ? product.variants.filter((v) => v && v.is_active !== false)
    : [];
  if (variants.length > 0) {
    lines.push(`  variações disponíveis (${variants.length}):`);
    variants.forEach((v, i) => {
      const vName = String(v.name || "").trim();
      const vAttrs = v.attributes && typeof v.attributes === "object"
        ? Object.entries(v.attributes).map(([k, val]) => `${k}=${val}`).join(", ")
        : "";
      const label = vName || vAttrs || `variação ${i + 1}`;
      const vPrice = Number(v.price);
      const vPromo = Number(v.promo_price);
      const hasVPromo = Number.isFinite(vPromo) && vPromo > 0 && Number.isFinite(vPrice) && vPromo < vPrice;
      let priceTag = "";
      if (Number.isFinite(vPrice) && vPrice > 0) {
        priceTag = hasVPromo
          ? ` — ${moneyBR(vPromo)} (de ${moneyBR(vPrice)})`
          : ` — ${moneyBR(vPrice)}`;
      }
      const stockTag = v.stock_quantity != null
        ? (Number(v.stock_quantity) > 0 ? ` · em estoque` : ` · esgotado`)
        : "";
      const skuTag = v.sku ? ` · SKU: ${v.sku}` : "";
      lines.push(`    ▪ ${label}${priceTag}${stockTag}${skuTag}`);
    });
    lines.push(`    (Quando o cliente perguntar "qual tamanho/peso/cor", consulte esta lista. NÃO invente variações.)`);
  }

  return { block: lines.join("\n"), name };
}

/** Build the catalog statistics header — gives the agent a sense of scale and pricing range. */
function buildCatalogStats(products: RawProduct[]): string {
  const active = products.filter((p) => p?.active !== false && p?.is_active !== false);
  const total = active.length;
  if (total === 0) return "";

  const prices = active
    .map((p) => {
      const promo = Number(p?.promoPrice ?? p?.promo_price ?? 0);
      const reg = Number(p?.price ?? 0);
      const effective = promo > 0 && promo < reg ? promo : reg;
      return Number.isFinite(effective) && effective > 0 ? effective : null;
    })
    .filter((p): p is number => p !== null);

  const categories = new Set(
    active
      .map((p) => String(p?.category_name || p?.category || "").trim())
      .filter(Boolean)
  );

  const parts = [`${total} produto(s) ativo(s)`];
  if (categories.size > 0) parts.push(`${categories.size} categoria(s)`);
  if (prices.length > 0) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    parts.push(min === max ? `preço: ${moneyBR(min)}` : `faixa de preço: ${moneyBR(min)} – ${moneyBR(max)}`);
  }
  return `RESUMO DO CATÁLOGO: ${parts.join(" · ")}`;
}

/**
 * Build catalog block. Returns empty string if no products.
 * Now shows: full description (with line breaks), all features, metadata, image counts,
 * recency flags, stats header.
 */
export function buildProductIntelligenceBlock(products: RawProduct[]): string {
  if (!Array.isArray(products) || products.length === 0) return "";

  /* Hard cap at 60 to stay safe on token budget. Almost no SMB catalog exceeds this; if it does,
   * future work can rank by sales/relevance and trim the tail. */
  const formatted = products
    .slice(0, 60)
    .map((p, i) => formatProduct(p, i))
    .filter((f): f is FormattedProduct => f !== null);

  if (!formatted.length) return "";

  const truncatedCount = products.length > 60 ? products.length - 60 : 0;

  return [
    "═══ CATÁLOGO OFICIAL DA MARCA ═══",
    "(Única fonte autorizada de produtos, preços, descrições e fichas técnicas.)",
    "",
    buildCatalogStats(products),
    truncatedCount > 0 ? `(+${truncatedCount} produto(s) adicional(is) não exibido(s) aqui — peça para o cliente especificar se buscar algo diferente.)` : "",
    "",
    ...formatted.map((f) => f.block + "\n"),
    "═══ REGRAS DE USO DO CATÁLOGO ═══",
    "- Cite EXATAMENTE os nomes, preços, descrições e features acima — não parafraseie inventando.",
    "- A descrição de cada produto é o que o vendedor cuidadosamente escreveu — use o conteúdo dela ativamente para responder dúvidas técnicas, de uso, conservação, etc.",
    "- Quando o cliente perguntar sobre detalhe do produto (ingredientes, peso, tamanho, modo de uso, etc.), CONSULTE a descrição e ficha técnica antes de responder.",
    "- Preço só é \"promocional\" se o produto explicitamente marca \"de ... por ...\".",
    "- Não some, multiplique ou estime preços por conta própria. Use o valor listado.",
    "- Se o cliente pedir algo que NÃO está no catálogo, diga que vai confirmar — NUNCA invente.",
    "- Se um produto tem fotos disponíveis e o cliente demonstrar interesse visual, pode oferecer mandar.",
    "- ESTOQUE: quando um produto estiver marcado ESGOTADO, NÃO prometa entrega; ofereça transparentemente uma alternativa da mesma categoria/segmento que esteja disponível, ou colete o contato para avisar quando voltar. Quando estiver com estoque baixo (\"restam X\"), use isso para gerar urgência genuína sem exagerar.",
  ].filter(Boolean).join("\n");
}

/** Extract product names that appear in the user's message — used to enrich reasoner context. */
export function detectMentionedProducts(message: string, products: RawProduct[]): string[] {
  if (!message || !Array.isArray(products) || products.length === 0) return [];
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const msg = norm(message);
  const matches = new Set<string>();
  for (const p of products) {
    const name = String(p?.name || "").trim();
    if (!name) continue;
    const nameNorm = norm(name);
    /* Match if 2+ significant words of product name appear */
    const tokens = nameNorm.split(" ").filter((t) => t.length >= 4);
    if (tokens.length === 0) continue;
    const hits = tokens.filter((t) => msg.includes(t)).length;
    if (hits >= Math.max(1, Math.floor(tokens.length / 2))) {
      matches.add(name);
    }
  }
  return Array.from(matches);
}
