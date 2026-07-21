/**
 * Taxonomia de nicho para captação / pool / filtros.
 *
 * Separação importante:
 * - search_query  → o que a campanha buscou (ex.: "Restaurantes")
 * - place_type    → tipo Google/Places do estabelecimento (ex.: "Churrascaria")
 * - vertical      → família normalizada para filtro (ex.: "Restaurante")
 *
 * O erro clássico: usar place_type cru (BARBECUE) como único filtro e
 * sumir com a busca "Restaurantes" da UI.
 */

export type NicheTaxonomy = {
  search_query: string | null;
  place_type: string | null;
  vertical: string | null;
  /** Rótulo principal de filtro: vertical || search_query || place_type */
  niche: string | null;
};

const PLACE_TYPE_LABELS: Record<string, string> = {
  restaurant: "Restaurante",
  pizza_restaurant: "Pizzaria",
  hamburger_restaurant: "Hamburgueria",
  fast_food_restaurant: "Fast food",
  japanese_restaurant: "Japonesa",
  seafood_restaurant: "Frutos do mar",
  buffet_restaurant: "Buffet",
  hot_dog_restaurant: "Hot dog",
  barbecue_restaurant: "Churrascaria",
  steak_house: "Churrascaria",
  brazilian_restaurant: "Restaurante",
  italian_restaurant: "Restaurante",
  chinese_restaurant: "Restaurante",
  mexican_restaurant: "Restaurante",
  american_restaurant: "Restaurante",
  vegetarian_restaurant: "Restaurante",
  vegan_restaurant: "Restaurante",
  snack_bar: "Lanchonete",
  bakery: "Padaria",
  bar: "Bar",
  cafe: "Café",
  coffee_shop: "Cafeteria",
  supermarket: "Supermercado",
  discount_supermarket: "Supermercado",
  grocery_store: "Mercearia",
  market: "Mercado",
  wholesaler: "Atacado",
  warehouse: "Depósito",
  food_store: "Alimentação",
  convenience_store: "Conveniência",
  acai_shop: "Açaí",
  gastropub: "Gastropub",
  meal_takeaway: "Delivery",
  meal_delivery: "Delivery",
  store: "Loja",
  food: "Alimentação",
  // raw english leftovers
  barbecue: "Churrascaria",
  steakhouse: "Churrascaria",
};

/** Famílias de filtro (vertical → termos que batem). */
export const VERTICAL_ALIASES: Record<string, string[]> = {
  Restaurante: [
    "restaurante", "restaurantes", "restaurant", "restaurants",
    "pizzaria", "hamburgueria", "lanchonete", "fast food", "buffet",
    "bar", "gastropub", "frutos do mar", "hot dog", "acai", "açaí",
    "churrascaria", "churrasco", "barbecue", "steak house", "steakhouse",
    "padaria", "cafe", "café", "cafeteria", "delivery", "food",
    "japonesa", "italiano", "comida",
  ],
  Supermercado: [
    "supermercado", "supermercados", "supermarket", "mercearia", "mercado",
    "atacado", "atacarejo", "conveniencia", "conveniência", "alimentacao",
    "alimentação", "grocery",
  ],
  Loja: ["loja", "store", "comercio", "comércio", "varejo"],
};

function stripAccents(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function humanizePlaceType(raw: unknown): string | null {
  const s = String(raw || "").trim();
  if (!s || s.length < 2) return null;

  const key = s.toLowerCase().replace(/[\s-]+/g, "_");
  if (PLACE_TYPE_LABELS[key]) return PLACE_TYPE_LABELS[key];

  // Já legível em PT (sem underscore)
  if (!/[_-]/.test(s) && /[A-Za-zÀ-ú]/.test(s) && s.length <= 40) {
    if (/^[a-z0-9]+$/.test(s) && PLACE_TYPE_LABELS[s]) {
      return PLACE_TYPE_LABELS[s];
    }
    // "BARBECUE" / "Barbecue" → map
    const lower = s.toLowerCase();
    if (PLACE_TYPE_LABELS[lower]) return PLACE_TYPE_LABELS[lower];
    if (!/^[a-z_]+$/.test(s) && !/^[A-Z0-9\s]+$/.test(s)) {
      return s.slice(0, 60);
    }
    // ALL CAPS english type without map → still try pretty + map
  }

  const prettyKey = key.replace(/_restaurant$/i, "").replace(/_shop$/i, "");
  if (PLACE_TYPE_LABELS[prettyKey]) return PLACE_TYPE_LABELS[prettyKey];

  const pretty = key
    .replace(/_restaurant$/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

  // Evita expor "Barbecue" cru: se parecer tipo food, empurra pra Churrascaria/Restaurante
  const n = stripAccents(pretty);
  if (n.includes("barbecue") || n.includes("bbq") || n.includes("steak")) {
    return "Churrascaria";
  }

  return pretty.slice(0, 60) || null;
}

export function extractCaptureQuery(
  metadata?: Record<string, any> | null,
  sourceDetails?: Record<string, any> | null,
): string | null {
  const m = metadata && typeof metadata === "object" ? metadata : {};
  const sd = sourceDetails && typeof sourceDetails === "object" ? sourceDetails : {};
  const candidates = [
    m.search_query,
    m.capture_query,
    m.campaign_query,
    m.keyword,
    m.palavra_chave,
    m.query,
    m.niche,
    m.segment,
    m.termo,
    sd.search_query,
    sd.keyword,
    sd.query,
    sd.palavra_chave,
    // nested campaign
    m.campaign?.keyword,
    m.campaign?.query,
    m.campaign?.niche,
    sd.campaign?.keyword,
  ];
  for (const c of candidates) {
    const v = String(c || "").trim();
    if (v.length >= 2 && v.length <= 80) {
      // ignora tipos Google técnicos
      if (/^[a-z]+(_[a-z]+)+$/.test(v)) continue;
      if (PLACE_TYPE_LABELS[v.toLowerCase().replace(/[\s-]+/g, "_")]) continue;
      return v.slice(0, 60);
    }
  }
  return null;
}

export function extractPlaceType(input: {
  metadata?: Record<string, any> | null;
  customerCategory?: string | null;
  customerSubcategory?: string | null;
  sourceDetails?: Record<string, any> | null;
}): string | null {
  const m = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  const sd = input.sourceDetails && typeof input.sourceDetails === "object" ? input.sourceDetails : {};
  const typeCandidates: unknown[] = [
    input.customerCategory,
    input.customerSubcategory,
    m.primary_type,
    m.google_primary_type,
    m.type,
    m.business_type,
    Array.isArray(m.types) ? m.types[0] : null,
    Array.isArray(m.google_types) ? m.types?.[0] || m.google_types?.[0] : null,
    Array.isArray(m.google_types) ? m.google_types[0] : null,
    m.category,
    m.categoria,
    sd.category,
    sd.subcategory,
    Array.isArray(sd.types) ? sd.types[0] : null,
  ];
  for (const t of typeCandidates) {
    const label = humanizePlaceType(t);
    if (label) return label;
  }
  return null;
}

export function resolveVertical(label?: string | null): string | null {
  if (!label) return null;
  const n = stripAccents(label);
  for (const [vertical, aliases] of Object.entries(VERTICAL_ALIASES)) {
    if (aliases.some((a) => n === stripAccents(a) || n.includes(stripAccents(a)) || stripAccents(a).includes(n))) {
      return vertical;
    }
  }
  return null;
}

export function resolveOpportunityTaxonomy(input: {
  metadata?: Record<string, any> | null;
  customerCategory?: string | null;
  customerSubcategory?: string | null;
  sourceDetails?: Record<string, any> | null;
}): NicheTaxonomy {
  const search_query = extractCaptureQuery(input.metadata, input.sourceDetails);
  const place_type = extractPlaceType(input);
  const vertical =
    resolveVertical(search_query)
    || resolveVertical(place_type)
    || null;
  const niche = vertical || search_query || place_type || null;
  return { search_query, place_type, vertical, niche };
}

/** Compat: nicho único (vertical preferida). */
export function resolveOpportunityNiche(input: {
  metadata?: Record<string, any> | null;
  customerCategory?: string | null;
  customerSubcategory?: string | null;
  sourceDetails?: Record<string, any> | null;
}): string | null {
  return resolveOpportunityTaxonomy(input).niche;
}

/**
 * Match de filtro: aceita busca, vertical ou place_type.
 * "Restaurantes" casa com Churrascaria / Barbecue / Pizzaria.
 */
export function nicheFilterMatches(
  item: {
    niche?: string | null;
    search_query?: string | null;
    place_type?: string | null;
    vertical?: string | null;
  },
  filter: string,
): boolean {
  const f = stripAccents(filter);
  if (!f) return true;

  const fields = [
    item.vertical,
    item.search_query,
    item.place_type,
    item.niche,
  ]
    .map((x) => stripAccents(String(x || "")))
    .filter(Boolean);

  if (!fields.length) return false;

  for (const itemN of fields) {
    if (itemN === f) return true;
    if (itemN.includes(f) || f.includes(itemN)) return true;
  }

  // Família vertical
  for (const [vertical, aliases] of Object.entries(VERTICAL_ALIASES)) {
    const filterInFamily =
      stripAccents(vertical) === f
      || aliases.some((a) => f === stripAccents(a) || f.includes(stripAccents(a)));
    if (!filterInFamily) continue;
    const itemInFamily = fields.some((itemN) =>
      aliases.some((a) => itemN === stripAccents(a) || itemN.includes(stripAccents(a)))
      || itemN === stripAccents(vertical),
    );
    if (itemInFamily) return true;
  }

  return false;
}
