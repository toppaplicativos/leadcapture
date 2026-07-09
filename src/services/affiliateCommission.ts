export type CommissionMode =
  | "percentage"
  | "fixed_per_order"
  | "fixed_per_unit"
  | "fixed_per_kg";

export const COMMISSION_MODES: CommissionMode[] = [
  "percentage",
  "fixed_per_order",
  "fixed_per_unit",
  "fixed_per_kg",
];

export function normalizeCommissionMode(raw: unknown): CommissionMode {
  const m = String(raw || "percentage").trim().toLowerCase();
  if (m === "fixed_per_order" || m === "fixed_order" || m === "fixed" || m === "por_pedido") {
    return "fixed_per_order";
  }
  if (m === "fixed_per_unit" || m === "per_unit" || m === "unit" || m === "por_unidade") {
    return "fixed_per_unit";
  }
  if (m === "fixed_per_kg" || m === "per_kg" || m === "kg" || m === "por_kilo") {
    return "fixed_per_kg";
  }
  return "percentage";
}

export function commissionModeLabel(mode: CommissionMode): string {
  switch (mode) {
    case "percentage": return "Percentual sobre a venda";
    case "fixed_per_order": return "Valor fixo por pedido";
    case "fixed_per_unit": return "Valor por unidade";
    case "fixed_per_kg": return "Valor por quilograma";
    default: return "Percentual";
  }
}

export function formatCommissionShort(mode: CommissionMode, value: number): string {
  const v = Number(value || 0);
  const money = v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  switch (mode) {
    case "percentage": return `${v}%`;
    case "fixed_per_order": return `${money}/pedido`;
    case "fixed_per_unit": return `${money}/un`;
    case "fixed_per_kg": return `${money}/kg`;
    default: return `${v}%`;
  }
}

export function formatCommissionDescription(mode: CommissionMode, value: number): string {
  const v = Number(value || 0);
  const money = v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  switch (mode) {
    case "percentage":
      return `Você ganha ${v}% sobre o valor total de cada venda confirmada.`;
    case "fixed_per_order":
      return `Você ganha ${money} fixos por cada pedido confirmado, independente do valor.`;
    case "fixed_per_unit":
      return `Você ganha ${money} por cada unidade vendida no pedido.`;
    case "fixed_per_kg":
      return `Você ganha ${money} por cada quilograma (kg) vendido em produtos pesados.`;
    default:
      return `Comissão: ${formatCommissionShort(mode, v)}`;
  }
}

export type CommissionConfig = {
  mode: CommissionMode;
  value: number;
  source: "affiliate" | "program";
};

export function resolveCommissionConfig(input: {
  affiliate?: {
    commission_mode?: string | null;
    commission_value?: number | string | null;
    commission_pct?: number | string | null;
  } | null;
  program?: {
    default_commission_mode?: string | null;
    default_commission_value?: number | string | null;
    default_commission_pct?: number | string | null;
  } | null;
}): CommissionConfig {
  const program = input.program || {};
  const affiliate = input.affiliate || {};

  if (affiliate.commission_mode) {
    return {
      mode: normalizeCommissionMode(affiliate.commission_mode),
      value: Number(affiliate.commission_value ?? affiliate.commission_pct ?? program.default_commission_value ?? program.default_commission_pct ?? 10),
      source: "affiliate",
    };
  }
  if (affiliate.commission_pct != null && affiliate.commission_pct !== "") {
    return {
      mode: "percentage",
      value: Number(affiliate.commission_pct),
      source: "affiliate",
    };
  }

  const mode = normalizeCommissionMode(program.default_commission_mode);
  const value = Number(program.default_commission_value ?? program.default_commission_pct ?? 10);
  return { mode, value, source: "program" };
}

export function kgFromQuantity(quantity: number, unit: string): number {
  const u = String(unit || "unidade").trim().toLowerCase();
  const q = Math.max(0, Number(quantity || 0));
  if (u === "kg") return q;
  if (u === "g") return q / 1000;
  return 0;
}

export function calculateCommissionAmount(input: {
  mode: CommissionMode;
  value: number;
  orderTotal: number;
  items: Array<{ quantity: number; unit?: string | null }>;
}): { amount: number; basis: Record<string, unknown> } {
  const mode = input.mode;
  const value = Math.max(0, Number(input.value || 0));
  const orderTotal = Math.max(0, Number(input.orderTotal || 0));
  const items = Array.isArray(input.items) ? input.items : [];

  let amount = 0;
  const basis: Record<string, unknown> = {
    mode,
    rate: value,
    order_total: orderTotal,
  };

  switch (mode) {
    case "percentage":
      amount = orderTotal * (value / 100);
      basis.percentage = value;
      break;
    case "fixed_per_order":
      amount = value;
      break;
    case "fixed_per_unit": {
      const units = items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)), 0);
      amount = units * value;
      basis.total_units = units;
      break;
    }
    case "fixed_per_kg": {
      const kg = items.reduce(
        (sum, item) => sum + kgFromQuantity(Number(item.quantity || 0), String(item.unit || "")),
        0
      );
      amount = kg * value;
      basis.total_kg = Math.round(kg * 1000) / 1000;
      break;
    }
  }

  return {
    amount: Math.round(Math.max(0, amount) * 100) / 100,
    basis,
  };
}

export function couponDiscountPercent(input: {
  mode: CommissionMode;
  value: number;
  fallbackPct?: number;
}): number {
  if (input.mode === "percentage") return Math.max(0, Number(input.value || 0));
  return Math.max(0, Number(input.fallbackPct ?? 10));
}