import { WhatsAppIcon } from '@/components/icons'
import { buildWhatsAppUrl } from '@/lib/store-marketing'

export interface StoreWhatsAppFabProps {
  phone: string
  message?: string
  position?: 'bottom-right' | 'bottom-left'
  label?: string
}

export function StoreWhatsAppFab({
  phone,
  message,
  position = 'bottom-right',
  label = 'Chamar no WhatsApp',
}: StoreWhatsAppFabProps) {
  const href = buildWhatsAppUrl(phone, message)
  const isLeft = position === 'bottom-left'

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={`store-wa-fab fixed z-[var(--z-store-fab,40)] flex items-center gap-2 rounded-full bg-[#25D366] text-white shadow-lg shadow-black/15 transition hover:brightness-105 active:scale-[0.98] ${
        isLeft ? 'left-4' : 'right-4'
      }`}
      style={{
        bottom: 'max(1rem, calc(env(safe-area-inset-bottom, 0px) + 4.5rem))',
      }}
    >
      <span className="grid h-12 w-12 place-items-center shrink-0">
        <WhatsAppIcon size={22} className="text-white" aria-hidden />
      </span>
      <span className="hidden sm:inline pr-4 text-[13px] font-semibold tracking-tight">
        {label}
      </span>
    </a>
  )
}