/** Opções de configuração de programas de afiliados (admin + exposição ao candidato) */

export const PAYOUT_METHOD_OPTIONS = [
  { value: 'pix_direct', label: 'PIX direto' },
  { value: 'bank_deposit', label: 'Depósito em conta' },
  { value: 'wallet', label: 'Carteira interna' },
  { value: 'other', label: 'Outro (detalhar nas notas)' },
] as const

export const PAYOUT_FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Diário' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quinzenal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'on_demand', label: 'Sob demanda' },
] as const

export const OFFER_PRODUCT_TYPE_OPTIONS = [
  { value: 'physical', label: 'Produto físico' },
  { value: 'digital', label: 'Produto digital' },
  { value: 'service', label: 'Serviço' },
  { value: 'subscription', label: 'Assinatura' },
  { value: 'package', label: 'Pacote / combo' },
  { value: 'course', label: 'Curso / infoproduto' },
  { value: 'other', label: 'Outro' },
] as const

export function labelOf(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined,
): string {
  if (!value) return '—'
  return options.find((o) => o.value === value)?.label || value
}
