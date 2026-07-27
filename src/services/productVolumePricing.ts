export type PricingMeasure = "unit" | "kg" | "liter" | "box" | "package" | "pair" | "meter";

export type ProductVolumeTier = {
  id: string;
  up_to: number | null;
  price_per_measure: number;
};

export type ProductVolumePrice = {
  measure: PricingMeasure;
  measureQuantity: number;
  measurePerItem: number;
  pricePerMeasure: number;
  itemUnitPrice: number;
  tier: ProductVolumeTier;
};

export function validateVolumePricingTiers(tiers: ProductVolumeTier[]): void {
  if (!tiers.length) throw new Error("precificação progressiva inválida: adicione ao menos uma faixa");
  if (tiers.filter((tier) => tier.up_to == null).length !== 1 || tiers[tiers.length - 1]?.up_to != null) {
    throw new Error("precificação progressiva inválida: a última faixa deve ser sem limite");
  }
  for (let index = 0; index < tiers.length; index += 1) {
    const current = tiers[index];
    const previous = tiers[index - 1];
    if (current.up_to != null && previous?.up_to != null && current.up_to <= previous.up_to) {
      throw new Error("precificação progressiva inválida: os limites devem crescer sem sobreposição");
    }
    if (previous && current.price_per_measure > previous.price_per_measure) {
      throw new Error("precificação progressiva inválida: o preço não pode aumentar nas faixas maiores");
    }
  }
}

const aliases: Record<string, PricingMeasure> = {
  un: "unit", unidade: "unit", unidades: "unit", unit: "unit",
  kg: "kg", g: "kg", grama: "kg", gramas: "kg",
  l: "liter", lt: "liter", litro: "liter", litros: "liter", ml: "liter",
  cx: "box", caixa: "box", caixas: "box", box: "box",
  pct: "package", pacote: "package", pacotes: "package", package: "package",
  par: "pair", pares: "pair", pair: "pair",
  m: "meter", metro: "meter", metros: "meter", meter: "meter",
};

function parseUnit(unit: unknown): { amount: number; token: string } {
  const value = String(unit || "un").trim().toLowerCase().replace(",", ".");
  const match = value.match(/^(\d+(?:\.\d+)?)\s*([a-zç]+)$/i);
  if (match) return { amount: Number(match[1]) || 1, token: match[2] };
  return { amount: 1, token: value };
}

export function normalizePricingMeasure(unit: unknown, configured?: unknown): PricingMeasure {
  const requested = String(configured || "").trim().toLowerCase();
  if (requested && aliases[requested]) return aliases[requested];
  const parsed = parseUnit(unit);
  return aliases[parsed.token] || "unit";
}

export function measurePerSaleItem(unit: unknown, measure: PricingMeasure, configured?: unknown): number {
  const explicit = Number(configured);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const parsed = parseUnit(unit);
  if (measure === "kg" && parsed.token === "g") return parsed.amount / 1000;
  if (measure === "liter" && parsed.token === "ml") return parsed.amount / 1000;
  return parsed.amount > 0 ? parsed.amount : 1;
}

export function resolveServerProductVolumePrice(input: {
  unit: unknown;
  metadata: Record<string, any>;
  quantity: number;
}): ProductVolumePrice | null {
  const config = input.metadata?.volume_pricing;
  if (!config?.enabled || !Array.isArray(config.tiers)) return null;

  const measure = normalizePricingMeasure(input.unit, config.measure);
  const legacyWeight = measure === "kg" ? config.unit_weight_kg : undefined;
  const perItem = measurePerSaleItem(input.unit, measure, config.measure_per_item ?? legacyWeight);
  const measureQuantity = Math.max(0, Number(input.quantity) || 0) * perItem;
  if (measureQuantity <= 0) return null;

  const tiers = config.tiers
    .map((tier: any, index: number): ProductVolumeTier => ({
      id: String(tier?.id || `price_${index + 1}`),
      up_to: tier?.up_to == null && tier?.up_to_kg == null ? null : Number(tier?.up_to ?? tier?.up_to_kg),
      price_per_measure: Number(tier?.price_per_measure ?? tier?.price_per_kg),
    }))
    .filter((tier: ProductVolumeTier) =>
      Number.isFinite(tier.price_per_measure) && tier.price_per_measure >= 0 &&
      (tier.up_to == null || (Number.isFinite(tier.up_to) && tier.up_to > 0)))
    .sort((a: ProductVolumeTier, b: ProductVolumeTier) => a.up_to == null ? 1 : b.up_to == null ? -1 : a.up_to - b.up_to);

  validateVolumePricingTiers(tiers);

  const tier = tiers.find((candidate: ProductVolumeTier) => candidate.up_to == null || measureQuantity <= candidate.up_to);
  if (!tier) return null;
  return {
    measure,
    measureQuantity,
    measurePerItem: perItem,
    pricePerMeasure: tier.price_per_measure,
    itemUnitPrice: Number((tier.price_per_measure * perItem).toFixed(4)),
    tier,
  };
}
