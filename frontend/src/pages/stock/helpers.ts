import {
  ArrowDown,
  ArrowUp,
  Scale,
  Package,
  PackageOpen,
  Truck,
  ArrowLeftRight,
} from 'lucide-react'

export const money = (v: number | string | undefined) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const num = (v: number | string | undefined) =>
  Number(v || 0).toLocaleString('pt-BR')

export const dt = (v?: string) => {
  try {
    return new Date(v!).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return v || ''
  }
}

const unitMap: Record<string, string> = {
  unidade: 'un',
  kg: 'kg',
  g: 'g',
  litro: 'L',
  ml: 'ml',
  metro: 'm',
  cm: 'cm',
  caixa: 'cx',
  pacote: 'pct',
  par: 'par',
  digital: '∞',
}

export const unitShort = (u?: string) => unitMap[(u || 'unidade').toLowerCase()] || 'un'
export const isDigital = (u?: string) => (u || '').toLowerCase() === 'digital'
export const fmtQty = (v?: number, u?: string) => (isDigital(u) ? '∞' : num(v))

export function stockBadgeVariant(status?: string): 'danger' | 'warning' | 'success' {
  const s = (status || 'normal').toLowerCase()
  if (s === 'zerado') return 'danger'
  if (s === 'baixo') return 'warning'
  return 'success'
}

export function stockBadgeLabel(status?: string) {
  const s = (status || 'normal').toLowerCase()
  if (s === 'zerado') return 'Zerado'
  if (s === 'baixo') return 'Baixo'
  return 'Normal'
}

export function movBadge(type?: string) {
  const t = (type || '').toLowerCase()
  const map: Record<
    string,
    {
      label: string
      variant: 'success' | 'danger' | 'info' | 'warning' | 'neutral'
      icon: typeof ArrowDown
    }
  > = {
    entrada: { label: 'Entrada', variant: 'success', icon: ArrowDown },
    saida: { label: 'Saída', variant: 'danger', icon: ArrowUp },
    ajuste: { label: 'Ajuste', variant: 'info', icon: Scale },
    reserva: { label: 'Reserva', variant: 'warning', icon: Package },
    liberacao: { label: 'Liberação', variant: 'success', icon: PackageOpen },
    expedicao: { label: 'Expedição', variant: 'info', icon: Truck },
  }
  return map[t] || { label: t || '?', variant: 'neutral' as const, icon: ArrowLeftRight }
}

export const typeLabel = (t?: string) =>
  ({ fisico: 'Físico', digital: 'Digital', servico: 'Serviço' }[(t || '').toLowerCase()] ||
  t ||
  '')

/** Normalize BR phone to digits for wa.me */
export function phoneToWa(phone?: string): string | null {
  if (!phone) return null
  let d = String(phone).replace(/\D/g, '')
  if (!d) return null
  if (d.length <= 11 && !d.startsWith('55')) d = `55${d}`
  return d
}

export function waUrl(phone?: string, text?: string): string | null {
  const d = phoneToWa(phone)
  if (!d) return null
  const q = text ? `?text=${encodeURIComponent(text)}` : ''
  return `https://wa.me/${d}${q}`
}
