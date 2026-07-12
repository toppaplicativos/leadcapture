import { RefreshCw, ShieldCheck, Truck } from 'lucide-react'
import { money } from '@/lib/store-context'

export function ProductTrustBlock({
  freeAbove = 0,
  deliveryFee = 0,
  deliveryTime = '',
}: {
  freeAbove?: number
  deliveryFee?: number
  deliveryTime?: string
}) {
  const rows: Array<{ icon: typeof Truck; text: string }> = []

  if (freeAbove > 0) {
    rows.push({
      icon: Truck,
      text: `Frete grátis em pedidos acima de ${money(freeAbove)}`,
    })
  } else if (deliveryFee > 0) {
    rows.push({
      icon: Truck,
      text: `Entrega a partir de ${money(deliveryFee)}${deliveryTime ? ` · ${deliveryTime}` : ''}`,
    })
  } else if (deliveryTime) {
    rows.push({ icon: Truck, text: deliveryTime })
  } else {
    rows.push({ icon: Truck, text: 'Consulte frete e prazo no checkout' })
  }

  rows.push({ icon: RefreshCw, text: 'Troca e suporte com a loja' })
  rows.push({ icon: ShieldCheck, text: 'Pagamento seguro · PIX e cartão' })

  return (
    <ul className="product-trust-block" aria-label="Informações de compra">
      {rows.map((r, i) => (
        <li key={i}>
          <r.icon size={14} strokeWidth={1.75} aria-hidden />
          <span>{r.text}</span>
        </li>
      ))}
    </ul>
  )
}
