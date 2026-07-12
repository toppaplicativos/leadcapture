import { CreditCard, MessageCircle, ShieldCheck, Truck, Clock } from 'lucide-react'

function iconFor(label: string, id: string) {
  const s = `${id} ${label}`.toLowerCase()
  if (s.includes('frete') || s.includes('entrega') || s.includes('free')) return Truck
  if (s.includes('pix') || s.includes('cartão') || s.includes('cartao') || s.includes('pag')) return CreditCard
  if (s.includes('whats') || s.includes('atend')) return MessageCircle
  if (s.includes('hora') || s.includes('min') || s.includes('prazo')) return Clock
  return ShieldCheck
}

export function StoreTrustStrip({
  items,
}: {
  items: Array<{ id: string; label: string }>
}) {
  if (!items.length) return null
  return (
    <section className="store-trust" aria-label="Vantagens da loja">
      <ul className="store-trust__list">
        {items.map((it) => {
          const Icon = iconFor(it.label, it.id)
          return (
            <li key={it.id} className="store-trust__item">
              <span className="store-trust__icon" aria-hidden>
                <Icon size={15} strokeWidth={1.75} />
              </span>
              <span className="store-trust__label">{it.label}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
