/**
 * Perfis de entrada do Clube / catálogo (Alho Pronto e multi-marca).
 * Códigos estáveis em metadata.member_type; rótulos alinhados a client_types.
 */

export type ClubMemberTypeCode =
  | "comerciante"
  | "distribuidor"
  | "casa"
  | "supermercado";

export type ClubMemberTypeDef = {
  code: ClubMemberTypeCode;
  /** Nome exibido e gravado em client_types */
  label: string;
  short: string;
  description: string;
  /** Precisa de etapa 2 (estabelecimento / empresa) */
  needsBusiness: boolean;
  businessNameLabel: string;
  segmentLabel: string;
  segments: string[];
  aliases: string[];
  welcomeCreated: string;
  welcomeExisting: string;
};

export const CLUB_MEMBER_TYPES: ClubMemberTypeDef[] = [
  {
    code: "comerciante",
    label: "Comerciante",
    short: "Restaurantes e afins",
    description:
      "Restaurantes, pizzarias, marmitarias, bares, hotéis e cozinhas que produzem para servir.",
    needsBusiness: true,
    businessNameLabel: "Nome do estabelecimento",
    segmentLabel: "Tipo de operação",
    segments: [
      "Restaurante",
      "Pizzaria",
      "Marmitaria",
      "Hamburgueria",
      "Buffet / eventos",
      "Padaria / confeitaria",
      "Dark kitchen",
      "Bar / lanchonete",
      "Hotel / pousada",
      "Outro foodservice",
    ],
    aliases: [
      "comerciante",
      "comerciantes",
      "restaurante",
      "restaurantes",
      "foodservice",
      "restaurant",
      "hotel",
      "hoteis",
      "hotéis",
    ],
    welcomeCreated: "Comerciante cadastrado no clube! Seu hub foodservice já está ativo.",
    welcomeExisting: "Seu cadastro de comerciante já está no clube. Dados atualizados.",
  },
  {
    code: "distribuidor",
    label: "Distribuidor",
    short: "Atacado e revenda",
    description:
      "Distribuidores, atacadistas, Ceasa e empresas que revendem produtos de alho.",
    needsBusiness: true,
    businessNameLabel: "Nome da empresa",
    segmentLabel: "Tipo de operação",
    segments: [
      "Distribuidor regional",
      "Atacadista",
      "Ceasa / entreposto",
      "Revenda B2B",
      "Representante",
      "Outro canal de distribuição",
    ],
    aliases: [
      "distribuidor",
      "distribuidores",
      "distribuicao",
      "distribuição",
      "ceasa",
      "atacado",
      "atacadista",
      "revenda",
    ],
    welcomeCreated: "Distribuidor cadastrado no clube! Em breve alinhamos volume e rota.",
    welcomeExisting: "Seu cadastro de distribuidor já está no clube. Dados atualizados.",
  },
  {
    code: "casa",
    label: "Casa / Consumo",
    short: "Consumidor final",
    description: "Compra para uso em casa ou consumo pessoal — benefícios do clube no checkout.",
    needsBusiness: false,
    businessNameLabel: "",
    segmentLabel: "",
    segments: [],
    aliases: [
      "casa",
      "consumo",
      "casa-consumo",
      "casa_consumo",
      "cliente",
      "consumidor",
      "consumer",
      "customer",
      "final",
    ],
    welcomeCreated: "Bem-vindo ao clube! Seus benefícios já estão ativos.",
    welcomeExisting: "Você já faz parte do clube. Benefícios confirmados.",
  },
  {
    code: "supermercado",
    label: "Supermercados",
    short: "Varejo e mercearias",
    description: "Supermercados, mercearias, minimercados e redes de varejo alimentar.",
    needsBusiness: true,
    businessNameLabel: "Nome da loja ou rede",
    segmentLabel: "Formato",
    segments: [
      "Supermercado",
      "Hipermercado",
      "Minimercado",
      "Mercearia",
      "Rede / multi-lojas",
      "Atacarejo",
      "Outro varejo",
    ],
    aliases: [
      "supermercado",
      "supermercados",
      "mercearia",
      "mercearias",
      "varejo",
      "minimercado",
      "hipermercado",
    ],
    welcomeCreated: "Supermercado cadastrado no clube! Condições de varejo em análise.",
    welcomeExisting: "Seu cadastro de supermercado já está no clube. Dados atualizados.",
  },
];

const byCode = new Map(CLUB_MEMBER_TYPES.map((t) => [t.code, t]));

/** Normaliza query/body (aliases inclusos) para código canônico. */
export function normalizeClubMemberType(raw: unknown): ClubMemberTypeCode {
  const t = String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-/g, "_");

  if (!t) return "casa";

  for (const def of CLUB_MEMBER_TYPES) {
    if (def.code === t) return def.code;
    for (const a of def.aliases) {
      const aa = a
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9_-]/g, "")
        .replace(/-/g, "_");
      if (aa === t) return def.code;
    }
  }

  /* Heurísticas leves */
  if (/restaur|pizza|marmit|hambur|food|cozinh|comerci/.test(t)) return "comerciante";
  if (/distrib|atacad|ceasa|revend/.test(t)) return "distribuidor";
  if (/super|mercear|varejo|minimerc/.test(t)) return "supermercado";
  if (/casa|consum|cliente|final/.test(t)) return "casa";

  return "casa";
}

export function getClubMemberTypeDef(code: string | null | undefined): ClubMemberTypeDef {
  const n = normalizeClubMemberType(code);
  return byCode.get(n) || byCode.get("casa")!;
}

export function clubMemberNeedsBusiness(code: string | null | undefined): boolean {
  return getClubMemberTypeDef(code).needsBusiness;
}

export function clubMemberWelcomeMessage(
  code: string | null | undefined,
  created: boolean
): string {
  const def = getClubMemberTypeDef(code);
  return created ? def.welcomeCreated : def.welcomeExisting;
}

/** Rótulo para client_types / CRM */
export function clubMemberClientTypeLabel(code: string | null | undefined): string {
  return getClubMemberTypeDef(code).label;
}

export type ClubBusinessInput = Record<string, unknown> | null | undefined;

export function buildClubBusinessMeta(
  memberType: ClubMemberTypeCode,
  business: ClubBusinessInput,
  restaurantCompat?: ClubBusinessInput
): {
  business: Record<string, unknown> | null;
  restaurant: Record<string, unknown> | null;
  client_type_label: string;
} {
  const def = getClubMemberTypeDef(memberType);
  const client_type_label = def.label;

  if (!def.needsBusiness) {
    return { business: null, restaurant: null, client_type_label };
  }

  const src =
    (business && typeof business === "object" ? business : null) ||
    (restaurantCompat && typeof restaurantCompat === "object" ? restaurantCompat : null) ||
    {};

  const name =
    String(src.name || src.restaurante || src.empresa || src.estabelecimento || "")
      .trim()
      .slice(0, 160) || null;

  if (!name) {
    throw new Error(`${def.businessNameLabel || "Nome do estabelecimento"} é obrigatório`);
  }

  const payload = {
    name,
    type: String(src.type || src.tipo || src.segment || "").trim().slice(0, 80) || null,
    cep: String(src.cep || "").replace(/\D/g, "").slice(0, 8) || null,
    city: String(src.city || src.cidade || "").trim().slice(0, 120) || null,
    units: Math.max(1, Math.min(999, Number(src.units || src.unidades) || 1)),
    weekly_kg: String(src.weekly_kg || src.consumo || src.volume || "").trim().slice(0, 80) || null,
    product_interest:
      String(src.product_interest || src.produto || "").trim().slice(0, 80) || null,
    notes: String(src.notes || src.observacoes || "").trim().slice(0, 500) || null,
    profile: memberType,
  };

  /* Compat: comerciante/restaurante legado ainda lê metadata.restaurant */
  const restaurant =
    memberType === "comerciante" || memberType === "supermercado" ? { ...payload } : null;

  return { business: payload, restaurant, client_type_label };
}
