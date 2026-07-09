export type CommissionMode =
  | 'percentage'
  | 'fixed_per_order'
  | 'fixed_per_unit'
  | 'fixed_per_kg'

export const COMMISSION_MODE_OPTIONS: { value: CommissionMode; label: string; hint: string }[] = [
  { value: 'percentage', label: 'Percentual (%)', hint: 'Ex.: 10% sobre o valor total do pedido' },
  { value: 'fixed_per_order', label: 'Fixo por pedido (R$)', hint: 'Ex.: R$ 5,00 por cada venda confirmada' },
  { value: 'fixed_per_unit', label: 'Por unidade (R$)', hint: 'Ex.: R$ 0,50 por item vendido' },
  { value: 'fixed_per_kg', label: 'Por quilograma (R$)', hint: 'Ex.: R$ 1,20 por kg (produtos em kg/g)' },
]

export function normalizeCommissionMode(raw: unknown): CommissionMode {
  const m = String(raw || 'percentage').trim().toLowerCase()
  if (['fixed_per_order', 'fixed_order', 'fixed', 'por_pedido'].includes(m)) return 'fixed_per_order'
  if (['fixed_per_unit', 'per_unit', 'unit', 'por_unidade'].includes(m)) return 'fixed_per_unit'
  if (['fixed_per_kg', 'per_kg', 'kg', 'por_kilo'].includes(m)) return 'fixed_per_kg'
  return 'percentage'
}

export function commissionValueLabel(mode: CommissionMode): string {
  switch (mode) {
    case 'percentage': return 'Percentual (%)'
    case 'fixed_per_order': return 'Valor por pedido (R$)'
    case 'fixed_per_unit': return 'Valor por unidade (R$)'
    case 'fixed_per_kg': return 'Valor por kg (R$)'
    default: return 'Valor'
  }
}

export function formatCommissionShort(mode: CommissionMode, value: number): string {
  const v = Number(value || 0)
  const money = v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  switch (mode) {
    case 'percentage': return `${v}%`
    case 'fixed_per_order': return `${money} / pedido`
    case 'fixed_per_unit': return `${money} / unidade`
    case 'fixed_per_kg': return `${money} / kg`
    default: return `${v}%`
  }
}

export function formatCommissionDescription(mode: CommissionMode, value: number): string {
  const v = Number(value || 0)
  const money = v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  switch (mode) {
    case 'percentage':
      return `Você recebe ${v}% sobre o valor total de cada venda confirmada.`
    case 'fixed_per_order':
      return `Você recebe ${money} fixos por pedido confirmado.`
    case 'fixed_per_unit':
      return `Você recebe ${money} por unidade vendida no pedido.`
    case 'fixed_per_kg':
      return `Você recebe ${money} por quilograma vendido (produtos em kg ou g).`
    default:
      return formatCommissionShort(mode, v)
  }
}

export function resolveCommissionFromProfile(input: {
  affiliate?: { commission_mode?: string | null; commission_value?: number | null; commission_pct?: number | null } | null
  program?: {
    default_commission_mode?: string | null
    default_commission_value?: number | null
    default_commission_pct?: number | null
  } | null
}): { mode: CommissionMode; value: number; isCustom: boolean } {
  const affiliate = input.affiliate
  const program = input.program || {}
  if (affiliate?.commission_mode) {
    return {
      mode: normalizeCommissionMode(affiliate.commission_mode),
      value: Number(affiliate.commission_value ?? affiliate.commission_pct ?? program.default_commission_value ?? program.default_commission_pct ?? 10),
      isCustom: true,
    }
  }
  if (affiliate?.commission_pct != null) {
    return { mode: 'percentage', value: Number(affiliate.commission_pct), isCustom: true }
  }
  return {
    mode: normalizeCommissionMode(program.default_commission_mode),
    value: Number(program.default_commission_value ?? program.default_commission_pct ?? 10),
    isCustom: false,
  }
}